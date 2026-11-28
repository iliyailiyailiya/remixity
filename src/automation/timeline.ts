// The timeline overlay (see docs/automation-plan.md): a ruler, the song cut
// into sections, and up to 5 automation lanes, on a beat grid.
//
// Two views:
//   overview   ruler (tap/drag = seek), the track (drag a section to move it,
//              tap = seek), and every lane small. A tap on a lane opens it.
//              Nothing in a lane changes from a tap here.
//   close-up   one lane, big, drawn over the song's waveform:
//                double-tap an empty spot     add a point
//                drag a point                 move it
//                double-tap a point           delete it
//                drag a hollow dot            curve that segment
//                double-tap a hollow dot      straighten it
//                with a shape picked          drag across to draw it
//                one finger on empty space    scrolls (when zoomed in)
//              "‹" (top left) goes back to all lanes.
//   zoom       pinch, ctrl/⌘ + wheel (trackpad pinch), or the − / + buttons
//   scroll     two fingers, or the wheel / trackpad; follows the playhead
//
// Every change asks the host for a checkpoint first, so Undo covers it.
// Drawn on one canvas; the toolbar is plain HTML in index.html.

import type { EditState } from '../engine/edit';
import {
  applyShape,
  bend,
  bendFor,
  shapePoints,
  type ShapeKind,
  addPoint,
  movePoint,
  norm,
  denorm,
  removePoint,
  sectionStarts,
  valueAt,
  type Automation,
  type AutoParam,
  type Lane,
} from './model';

export interface TimelineHost {
  buffer(): AudioBuffer | null;
  edit(): EditState;
  automation: Automation;
  position(): number;
  playing(): boolean;
  ratio(): number;
  /** The beat grid in timeline seconds (beat length, where bar 1 starts), null when unknown. */
  grid(): { beat: number; offset: number } | null;
  seek(t: number): void;
  /** Move section `from` to `to` (the host commits it, so Undo works). */
  moveSection(from: number, to: number): void;
  /** About to change the lanes: remember how they are, for Undo. */
  checkpoint(): void;
  /** Lanes changed (points moved, lane removed). */
  changed(): void;
  removeLane(id: string): void;
  label(lane: Lane): string;
  /** The close-up changed (lane id, or null for all lanes). */
  focusChanged?(id: string | null): void;
}

const RULER = 22;
const TRACK = 70;
const LANE_MAX = 56;
const HIT = 22; // px around a point that grabs it (fingers are wide)
const HANDLE_HIT = 18;
const DOUBLE_MS = 350; // two taps this close together = a double-tap
const DOUBLE_PX = 28; // … and this close in space
const COLORS = ['#ff7ab6', '#7ac8ff', '#ffd166', '#8affc1', '#c49bff'];
const PEAK_HOP = 256; // samples per waveform peak (~5 ms): sharp even zoomed in
const MIN_SPAN = 2; // seconds on screen at the closest zoom
const PAD = 14; // space above/below the line in a close-up

type Drag =
  | { kind: 'seek' }
  | { kind: 'section'; index: number; x0: number; dx: number; moved: boolean }
  | { kind: 'tap'; lane: Lane | null; x0: number; y0: number; view0: number; moved: boolean } // empty spot: tap, double-tap or scroll
  | { kind: 'point'; lane: Lane; index: number; x0: number; y0: number; moved: boolean }
  | { kind: 'curve'; lane: Lane; index: number; x0: number; y0: number; moved: boolean }
  | { kind: 'shape'; lane: Lane; t0: number; n0: number; t1: number; n1: number }
  | { kind: 'pinch' };

/** How a lane's value reads to a person. */
export function formatValue(param: AutoParam, v: number): string {
  switch (param) {
    case 'ratio':
      return `×${v.toFixed(2)}`;
    case 'decay':
      return `${v.toFixed(1)} s`;
    case 'delayTime':
      return `${Math.round(v * 1000)} ms`;
    case 'lowCut':
    case 'highCut':
      return v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
    case 'bass':
    case 'eqLow':
    case 'eqMid':
    case 'eqHigh':
    case 'eqAir':
      return `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
    default:
      return `${Math.round(v * 100)}%`;
  }
}

export class Timeline {
  private ctx: CanvasRenderingContext2D;
  private peaks: Float32Array | null = null;
  private peaksOf: AudioBuffer | null = null;
  private raf = 0;
  private drag: Drag | null = null;
  /** The last single tap (for double-taps): where, when, on what. */
  private lastTap = { x: -1e9, y: -1e9, at: 0 };
  private w = 0;
  private h = 0;
  /** Grid size in beats (4 = a bar, 1 = a quarter, 2/3 = quarter triplets); 0 = off. */
  grid = 1;
  /** Snap to the grid (it can stay visible with snapping off). */
  snapOn = true;
  /** What dragging in a close-up does: move/add points, or draw a shape. */
  shape: ShapeKind | 'points' = 'points';
  /** Turn the page with the playhead while playing (off = the view stays put). */
  followOn = true;
  /** Close-up: only this lane (by id) is shown, big, over the waveform. */
  focus: string | null = null;
  /** The point (lane id + index) being dragged, for its value label. */
  private live: { lane: Lane; index: number } | null = null;
  // The visible window, in timeline seconds. span 0 = the whole song.
  private viewStart = 0;
  private viewSpan = 0;
  private userMovedAt = 0; // don't follow the playhead right after the user scrolled
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d0: number; span0: number; t0: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private host: TimelineHost,
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.drag = null;
      this.pinch = null;
      this.live = null;
    });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  open() {
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.follow();
      this.draw();
    };
    cancelAnimationFrame(this.raf);
    loop();
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Open a lane's close-up (null = all lanes). */
  setFocus(id: string | null) {
    this.focus = id;
    this.drag = null;
    this.live = null;
    this.host.focusChanged?.(id);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    const cw = Math.round(r.width * dpr);
    const ch = Math.round(r.height * dpr);
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- view (zoom + scroll) ----------

  private get length() {
    return this.host.buffer()?.duration ?? 0;
  }
  private get span() {
    const len = this.length;
    return this.viewSpan > 0 ? Math.min(this.viewSpan, len) : len;
  }
  private xOf(t: number) {
    return this.span ? ((t - this.viewStart) / this.span) * this.w : 0;
  }
  private tOf(x: number) {
    return this.w ? Math.min(this.length, Math.max(0, this.viewStart + (x / this.w) * this.span)) : 0;
  }
  /** Seconds → pixels. */
  private px(seconds: number) {
    return this.span ? (seconds / this.span) * this.w : 0;
  }

  private clampView() {
    const len = this.length;
    if (!len) return;
    if (this.viewSpan >= len - 1e-6) this.viewSpan = 0;
    if (this.viewSpan > 0) this.viewSpan = Math.max(Math.min(MIN_SPAN, len), this.viewSpan);
    this.viewStart = Math.min(Math.max(0, this.viewStart), Math.max(0, len - this.span));
  }

  /** Zoom by `factor` (>1 = closer) keeping the time under x where it is. */
  zoomAt(factor: number, x = this.w / 2) {
    if (!this.length) return;
    const t = this.tOf(x);
    this.viewSpan = this.span / factor;
    this.clampView();
    this.viewStart = t - (x / this.w) * this.span;
    this.clampView();
    this.userMovedAt = performance.now();
  }

  /** Zoom around the playhead (the − / + buttons). */
  zoom(factor: number) {
    const p = this.host.position();
    const x = p >= this.viewStart && p <= this.viewStart + this.span ? this.xOf(p) : this.w / 2;
    this.zoomAt(factor, x);
  }

  /** Back to the whole song (when a new song comes in, say). */
  fit() {
    this.viewStart = 0;
    this.viewSpan = 0;
    this.focus = null;
  }

  /** Zoomed in at all (Follow only matters then). */
  get zoomed() {
    return this.viewSpan > 0;
  }

  private panBy(seconds: number) {
    this.viewStart += seconds;
    this.clampView();
    this.userMovedAt = performance.now();
  }

  /** While playing, turn the page when the playhead runs off the screen. */
  private follow() {
    if (!this.followOn || !this.viewSpan || !this.host.playing() || this.drag || performance.now() - this.userMovedAt < 2000) return;
    const p = this.host.position();
    if (p < this.viewStart || p > this.viewStart + this.span * 0.95) {
      this.viewStart = p - this.span * 0.05;
      this.clampView();
    }
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    const x = e.clientX - this.canvas.getBoundingClientRect().left;
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * unit * 0.01), x);
    else this.panBy(((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit * this.span) / this.w);
  }

  // ---------- grid ----------

  /** Grid lines: spacing and where they start, in seconds; null when off / no BPM. */
  private gridLines() {
    const g = this.host.grid();
    if (!g || !this.grid) return null;
    return { step: g.beat * this.grid, offset: g.offset, bar: g.beat * 4 };
  }

  /** The nearest grid line to t (t itself when the grid or snapping is off). */
  snap(t: number) {
    const g = this.gridLines();
    if (!g || !this.snapOn) return t;
    return Math.min(this.length, Math.max(0, g.offset + Math.round((t - g.offset) / g.step) * g.step));
  }

  private drawGrid() {
    const g = this.gridLines();
    if (!g || this.px(g.step) < 4) return;
    const c = this.ctx;
    const end = this.viewStart + this.span;
    let i = Math.ceil((this.viewStart - g.offset) / g.step);
    for (let t = g.offset + i * g.step; t <= end; t = g.offset + ++i * g.step) {
      if (t < 0) continue;
      const k = (t - g.offset) / g.bar;
      const onBar = Math.abs(k - Math.round(k)) < 1e-6;
      c.fillStyle = onBar ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
      c.fillRect(Math.round(this.xOf(t)), RULER, 1, this.h - RULER);
    }
  }

  // ---------- layout ----------

  private focusLane(): Lane | null {
    if (!this.focus) return null;
    const one = this.host.automation.lanes.find((l) => l.id === this.focus);
    if (!one) this.focus = null; // it was removed
    return one ?? null;
  }
  /** The lanes in the overview. */
  private lanes(): Lane[] {
    return this.host.automation.lanes;
  }
  private laneH() {
    const n = this.lanes().length;
    const room = this.h - RULER - TRACK;
    return n ? Math.min(LANE_MAX, room / n) : LANE_MAX;
  }
  /** Where a lane's values are drawn: top and height of its value range. */
  private area(lane: Lane): { top: number; h: number } | null {
    if (this.focusLane()) {
      return lane.id === this.focus ? { top: RULER + PAD + 26, h: this.h - RULER - 2 * PAD - 26 } : null;
    }
    const i = this.lanes().indexOf(lane);
    if (i < 0) return null;
    const lh = this.laneH();
    return { top: RULER + TRACK + i * lh + 4, h: lh - 8 };
  }
  private yOf(lane: Lane, v: number, a: { top: number; h: number }) {
    return a.top + (1 - norm(lane.param, v)) * a.h;
  }
  private normFromY(y: number, a: { top: number; h: number }) {
    return Math.min(1, Math.max(0, 1 - (y - a.top) / a.h));
  }
  private colorOf(lane: Lane) {
    return COLORS[Math.max(0, this.host.automation.lanes.indexOf(lane)) % COLORS.length];
  }

  // ---------- drawing ----------

  private ensurePeaks() {
    const b = this.host.buffer();
    if (!b || b === this.peaksOf) return;
    this.peaksOf = b;
    this.clampView();
    const ch = b.getChannelData(0);
    const n = Math.ceil(ch.length / PEAK_HOP);
    // Loudness (RMS) per ~5 ms rather than the peak: loud, compressed masters
    // peak at the top everywhere, but their RMS still shows kicks and gaps.
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let q = 0;
      let c = 0;
      const end = Math.min(ch.length, (i + 1) * PEAK_HOP);
      for (let k = i * PEAK_HOP; k < end; k += 2, c++) q += ch[k] * ch[k];
      out[i] = c ? Math.sqrt(q / c) : 0;
    }
    // Scale so the loud parts (99th percentile) fill the row, quiet masters too.
    const sorted = Float32Array.from(out).sort();
    const top = sorted[Math.floor(sorted.length * 0.99)] || 1;
    for (let i = 0; i < n; i++) out[i] = Math.min(1, out[i] / top);
    this.peaks = out;
  }

  private draw() {
    const g = this.ctx;
    const { w, h } = this;
    g.clearRect(0, 0, w, h);
    if (!this.length) return;
    this.ensurePeaks();

    // Ruler: heard time (after speed); ticks spaced at least ~46 px apart.
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, w, RULER);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '600 10px system-ui, -apple-system, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const r = this.host.ratio();
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => this.px(s * r) >= 46) ?? 600;
    for (let s = Math.floor(this.viewStart / r / step) * step; s * r <= this.viewStart + this.span; s += step) {
      const x = this.xOf(s * r);
      g.fillRect(x, RULER - 6, 1, 6);
      g.fillText(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, x + 3, RULER / 2 - 2);
    }

    this.drawGrid();
    const focus = this.focusLane();
    if (focus) this.drawCloseUp(focus);
    else this.drawOverview();

    // Playhead.
    const px = this.xOf(this.host.position());
    if (px >= -1 && px <= w + 1) {
      g.fillStyle = '#fff';
      g.fillRect(px - 1, 0, 2, h);
    }

    // Where the view is in the song, when zoomed in.
    if (this.viewSpan) {
      const len = this.length;
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, RULER - 2, w, 2);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect((this.viewStart / len) * w, RULER - 2, Math.max(4, (this.span / len) * w), 2);
    }
  }

  /** Sections as rounded blocks with their waveform, in a band. */
  private drawSections(top: number, height: number, alpha: number, draggable: boolean) {
    const g = this.ctx;
    const e = this.host.edit();
    const starts = sectionStarts(e);
    e.segments.forEach((s, i) => {
      const len = s.end - s.start;
      let x = this.xOf(starts[i]);
      const sw = this.px(len);
      const d = this.drag;
      const dragging = draggable && d?.kind === 'section' && d.index === i && d.moved;
      if (dragging) x += d.dx;
      if (x > this.w || x + sw < 0) return;
      g.fillStyle = dragging ? 'rgba(255,255,255,0.22)' : i % 2 ? `rgba(255,255,255,${0.1 * alpha})` : `rgba(255,255,255,${0.14 * alpha})`;
      g.beginPath();
      g.roundRect(x + 1, top, Math.max(2, sw - 2), height, 6);
      g.fill();
      this.drawWave(x, sw, starts[i], len, top, height, alpha);
    });
  }

  private drawOverview() {
    const g = this.ctx;
    const w = this.w;
    this.drawSections(RULER + 4, TRACK - 8, 1, true);
    const lh = this.laneH();
    this.lanes().forEach((lane, i) => {
      const top = RULER + TRACK + i * lh;
      const a = this.area(lane)!;
      const c = this.colorOf(lane);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
      g.fillRect(0, top, w, lh);
      this.drawLine(lane, a, c, 2);
      // Name, ×, and a "tap to edit" cue.
      g.font = '650 11px system-ui, -apple-system, sans-serif';
      const name = `${this.host.label(lane)}  ›`;
      const tw = g.measureText(name).width;
      g.fillStyle = 'rgba(10,6,20,0.72)';
      g.beginPath();
      g.roundRect(4, top + 4, tw + 34, 20, 10);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText('×', 12, top + 14);
      g.fillStyle = c;
      g.fillText(name, 26, top + 14);
    });
  }

  private drawCloseUp(lane: Lane) {
    const g = this.ctx;
    const w = this.w;
    const a = this.area(lane)!;
    const c = this.colorOf(lane);
    // The song underneath, big and dim: you shape the line against the music.
    this.drawSections(RULER + 4, this.h - RULER - 8, 0.55, false);
    // Guides at 0 / 25 / 50 / 75 / 100 %, with the values at the right.
    g.font = '600 10px system-ui, -apple-system, sans-serif';
    g.textAlign = 'right';
    for (const n of [0, 0.25, 0.5, 0.75, 1]) {
      const y = a.top + (1 - n) * a.h;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, Math.round(y), w, 1);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillText(formatValue(lane.param, denorm(lane.param, n)), w - 6, y + (n === 1 ? 8 : n === 0 ? -6 : -6));
    }
    g.textAlign = 'left';
    this.drawLine(lane, a, c, 3);
    // Points and curve handles (only when there's room to grab them).
    const dots = this.dotsVisible(lane);
    g.fillStyle = c;
    lane.points.forEach((p, i) => {
      const x = this.xOf(p.t);
      if (!dots || x < -8 || x > w + 8) return;
      const y = this.yOf(lane, p.v, a);
      const active = this.live?.lane === lane && this.live.index === i;
      g.beginPath();
      g.arc(x, y, active ? 8 : 6, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = active ? '#fff' : 'rgba(10,6,20,0.8)';
      g.stroke();
    });
    if (this.shape === 'points' && dots) {
      g.lineWidth = 2;
      for (const hnd of this.handles(lane, a)) {
        g.beginPath();
        g.arc(hnd.x, hnd.y, 5, 0, Math.PI * 2);
        g.fillStyle = 'rgba(10,6,20,0.85)';
        g.fill();
        g.strokeStyle = c;
        g.stroke();
      }
    }
    // A shape being drawn.
    const d = this.drag;
    if (d?.kind === 'shape' && d.lane === lane) {
      const pts = this.shapeOf(d);
      if (pts.length >= 2) {
        const tmp: Lane = { id: '', param: lane.param, points: pts.map((q) => ({ t: q.t, v: denorm(lane.param, q.n), c: q.c })) };
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        g.beginPath();
        const xa = Math.max(0, this.xOf(pts[0].t));
        const xb = Math.min(w, this.xOf(pts[pts.length - 1].t));
        for (let x = xa; x <= xb; x += 2) {
          const y = this.yOf(lane, valueAt(tmp, this.tOf(x)), a);
          if (x === xa) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.setLineDash([]);
      }
    }
    // The value of the point being dragged.
    if (this.live?.lane === lane) {
      const p = lane.points[this.live.index];
      if (p) this.bubble(this.xOf(p.t), this.yOf(lane, p.v, a), formatValue(lane.param, p.v));
    }
    // Back chip, top left.
    g.font = '700 12px system-ui, -apple-system, sans-serif';
    const name = `‹  ${this.host.label(lane)}`;
    const tw = g.measureText(name).width;
    g.fillStyle = 'rgba(10,6,20,0.78)';
    g.beginPath();
    g.roundRect(6, RULER + 6, tw + 22, 24, 12);
    g.fill();
    g.fillStyle = c;
    g.fillText(name, 17, RULER + 18);
  }

  /**
   * A lane's line across the screen, drawn through its points (sampling it
   * every few pixels instead aliased dense shapes into big fake triangles).
   * Curved segments get filled in between their points.
   */
  private drawLine(lane: Lane, a: { top: number; h: number }, color: string, width: number) {
    const g = this.ctx;
    const pts = lane.points;
    if (!pts.length) return;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.beginPath();
    const t0 = this.viewStart;
    const t1 = this.viewStart + this.span;
    // Before the first point / after the last, the value holds.
    g.moveTo(Math.min(0, this.xOf(pts[0].t)), this.yOf(lane, pts[0].v, a));
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (q && q.t < t0) continue; // whole segment left of the screen
      const xp = this.xOf(p.t);
      g.lineTo(xp, this.yOf(lane, p.v, a));
      if (!q) break;
      const xq = this.xOf(q.t);
      if (p.c && Math.abs(p.c) > 1e-3 && xq - xp > 3) {
        const steps = Math.min(48, Math.ceil((xq - xp) / 3));
        const na = norm(lane.param, p.v);
        const nb = norm(lane.param, q.v);
        for (let k = 1; k < steps; k++) {
          const f = k / steps;
          g.lineTo(xp + f * (xq - xp), a.top + (1 - (na + bend(f, p.c) * (nb - na))) * a.h);
        }
      }
      if (p.t > t1) break; // the rest is right of the screen
    }
    const last = pts[pts.length - 1];
    if (last.t < t1) g.lineTo(this.w, this.yOf(lane, last.v, a));
    g.stroke();
  }

  /** Point dots only when they're far enough apart to grab (else: zoom in). */
  private dotsVisible(lane: Lane) {
    let n = 0;
    for (const p of lane.points) if (p.t >= this.viewStart && p.t <= this.viewStart + this.span) n++;
    return n <= this.w / 14;
  }

  /** A small label above a point. */
  private bubble(x: number, y: number, text: string) {
    const g = this.ctx;
    g.font = '700 12px system-ui, -apple-system, sans-serif';
    const tw = g.measureText(text).width + 16;
    const bx = Math.min(this.w - tw - 4, Math.max(4, x - tw / 2));
    const by = y - 40 < RULER + 4 ? y + 16 : y - 36;
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(bx, by, tw, 22, 11);
    g.fill();
    g.fillStyle = '#120c1f';
    g.textAlign = 'center';
    g.fillText(text, bx + tw / 2, by + 11);
    g.textAlign = 'left';
  }

  private drawWave(x: number, sw: number, t0: number, len: number, top: number, height: number, alpha: number) {
    const peaks = this.peaks;
    const b = this.host.buffer();
    if (!peaks || !b) return;
    const g = this.ctx;
    const mid = top + height / 2;
    const amp = height / 2 - 4;
    const perSec = b.sampleRate / PEAK_HOP;
    const from = Math.max(0, -x);
    const to = Math.min(sw, this.w - x);
    g.fillStyle = `rgba(255,255,255,${0.75 * alpha})`;
    for (let px = from - (from % 2); px < to; px += 2) {
      const a = Math.floor((t0 + (px / sw) * len) * perSec);
      const z = Math.max(a + 1, Math.floor((t0 + ((px + 2) / sw) * len) * perSec));
      let v = 0;
      for (let k = a; k < z && k < peaks.length; k++) if (peaks[k] > v) v = peaks[k];
      const hh = Math.max(1, v * amp);
      g.fillRect(x + px, mid - hh, 1.5, hh * 2);
    }
  }

  /** Curve handles on screen: the middle of each sloped, wide-enough segment. */
  private handles(lane: Lane, a: { top: number; h: number }) {
    const out: { index: number; x: number; y: number }[] = [];
    const pts = lane.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const na = norm(lane.param, p.v);
      const nb = norm(lane.param, q.v);
      const xa = this.xOf(p.t);
      const xb = this.xOf(q.t);
      if (Math.abs(nb - na) < 0.03 || xb - xa < 44 || xb < 0 || xa > this.w) continue;
      const n = na + bend(0.5, p.c) * (nb - na);
      out.push({ index: i, x: (xa + xb) / 2, y: a.top + (1 - n) * a.h });
    }
    return out;
  }

  /** The points of the shape being drawn (normalised levels). */
  private shapeOf(d: { t0: number; n0: number; t1: number; n1: number }) {
    const kind = this.shape === 'points' ? 'line' : this.shape;
    const [a, b] = d.t1 >= d.t0 ? [d.t0, d.t1] : [d.t1, d.t0];
    const g = this.gridLines();
    const beat = this.host.grid()?.beat;
    const period = g ? g.step : beat ?? (b - a) / 4;
    return shapePoints(kind, a, b, d.n0, d.n1, period);
  }

  // ---------- input ----------

  private where(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pinchInfo() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2 };
  }

  /** Is this tap the second of a double-tap? (Remembers it as the first otherwise.) */
  private isDouble(x: number, y: number) {
    const now = performance.now();
    const hit = now - this.lastTap.at < DOUBLE_MS && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < DOUBLE_PX;
    this.lastTap = hit ? { x: -1e9, y: -1e9, at: 0 } : { x, y, at: now };
    return hit;
  }

  private down(e: PointerEvent) {
    if (!this.length) return;
    const { x, y } = this.where(e);
    this.pointers.set(e.pointerId, { x, y });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    if (this.pointers.size === 2) {
      // Second finger: zoom/scroll instead of whatever the first one started.
      this.drag = { kind: 'pinch' };
      this.live = null;
      const { d, cx } = this.pinchInfo();
      this.pinch = { d0: d, span0: this.span, t0: this.tOf(cx) };
      return;
    }
    if (this.pointers.size > 2) return;
    if (y < RULER) {
      this.drag = { kind: 'seek' };
      this.host.seek(this.tOf(x));
      return;
    }
    const focus = this.focusLane();
    if (!focus) {
      // Overview: the track, or a lane (× removes it, anything else opens it).
      if (y < RULER + TRACK) {
        const starts = sectionStarts(this.host.edit());
        const t = this.tOf(x);
        let index = starts.findIndex((s, i) => t >= s && (i === starts.length - 1 || t < starts[i + 1]));
        if (index < 0) index = 0;
        this.drag = { kind: 'section', index, x0: x, dx: 0, moved: false };
        return;
      }
      const li = Math.floor((y - RULER - TRACK) / this.laneH());
      const lane = this.lanes()[li];
      if (!lane) return;
      this.drag = { kind: 'tap', lane, x0: x, y0: y, view0: this.viewStart, moved: false };
      return;
    }

    // Close-up.
    if (x < 150 && y < RULER + 36) {
      this.drag = { kind: 'tap', lane: null, x0: x, y0: y, view0: this.viewStart, moved: false }; // the back chip
      return;
    }
    const a = this.area(focus)!;
    if (this.shape !== 'points') {
      const t = this.snap(this.tOf(x));
      const n = this.normFromY(y, a);
      this.drag = { kind: 'shape', lane: focus, t0: t, n0: n, t1: t, n1: n };
      return;
    }
    // The nearest point within reach, then a curve handle, else empty space.
    // (Too dense to see the dots? Then they can't be grabbed either: zoom in.)
    let index = -1;
    let best = HIT;
    const dots = this.dotsVisible(focus);
    if (dots) focus.points.forEach((p, i) => {
      const dist = Math.hypot(this.xOf(p.t) - x, this.yOf(focus, p.v, a) - y);
      if (dist < best) {
        best = dist;
        index = i;
      }
    });
    if (index >= 0) {
      if (this.isDouble(x, y)) {
        this.host.checkpoint();
        removePoint(focus, index);
        this.drag = null;
        this.host.changed();
        return;
      }
      this.drag = { kind: 'point', lane: focus, index, x0: x, y0: y, moved: false };
      this.live = { lane: focus, index };
      return;
    }
    const hnd = dots ? this.handles(focus, a).find((q) => Math.hypot(q.x - x, q.y - y) < HANDLE_HIT) : undefined;
    if (hnd) {
      if (this.isDouble(x, y)) {
        if (focus.points[hnd.index].c) {
          this.host.checkpoint();
          delete focus.points[hnd.index].c; // straight again
          this.host.changed();
        }
        this.drag = null;
        return;
      }
      this.drag = { kind: 'curve', lane: focus, index: hnd.index, x0: x, y0: y, moved: false };
      return;
    }
    this.drag = { kind: 'tap', lane: focus, x0: x, y0: y, view0: this.viewStart, moved: false };
  }

  private move(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    const { x, y } = this.where(e);
    this.pointers.set(e.pointerId, { x, y });
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pinch') {
      if (this.pointers.size < 2 || !this.pinch) return;
      const { d: dist, cx } = this.pinchInfo();
      this.viewSpan = this.pinch.span0 * (this.pinch.d0 / dist);
      this.clampView();
      this.viewStart = this.pinch.t0 - (cx / this.w) * this.span; // the time under the fingers stays put
      this.clampView();
      this.userMovedAt = performance.now();
      return;
    }
    if (d.kind === 'seek') {
      this.host.seek(this.tOf(x));
      return;
    }
    if (d.kind === 'section') {
      d.dx = x - d.x0;
      if (Math.abs(d.dx) > 6) d.moved = true;
      return;
    }
    if (d.kind === 'tap') {
      // One finger on empty space scrolls the view (when zoomed in).
      if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 8) return;
      d.moved = true;
      if (this.viewSpan) {
        this.viewStart = d.view0 - ((x - d.x0) / this.w) * this.span;
        this.clampView();
        this.userMovedAt = performance.now();
      }
      return;
    }
    const lane = d.lane;
    const a = this.area(lane);
    if (!a) return;
    if (d.kind === 'shape') {
      d.t1 = this.snap(this.tOf(x));
      d.n1 = this.normFromY(y, a);
      return;
    }
    // Points and curves only start moving after a small threshold, so a
    // resting finger (or the first tap of a double-tap) changes nothing.
    if (!d.moved) {
      if (Math.hypot(x - d.x0, y - d.y0) < 6) return;
      d.moved = true;
      this.lastTap.at = 0;
      this.host.checkpoint();
    }
    if (d.kind === 'curve') {
      const p = lane.points[d.index];
      const q = lane.points[d.index + 1];
      if (!q) return;
      const na = norm(lane.param, p.v);
      const nb = norm(lane.param, q.v);
      if (Math.abs(nb - na) < 1e-3) return;
      p.c = bendFor((this.normFromY(y, a) - na) / (nb - na));
    } else {
      movePoint(lane, d.index, this.snap(this.tOf(x)), denorm(lane.param, this.normFromY(y, a)));
    }
    this.host.changed();
  }

  private up(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (d?.kind === 'pinch') {
      if (this.pointers.size === 0) {
        this.drag = null;
        this.pinch = null;
      }
      return;
    }
    this.drag = null;
    this.live = null;
    if (!d) return;
    const { x, y } = this.where(e);
    if (d.kind === 'tap') {
      if (d.moved) return; // it was a scroll
      if (!this.focusLane()) {
        // Overview: × removes the lane, a tap anywhere else opens it.
        if (d.lane && x < 22 && y - (RULER + TRACK + this.lanes().indexOf(d.lane) * this.laneH()) < 26) this.host.removeLane(d.lane.id);
        else if (d.lane) this.setFocus(d.lane.id);
        return;
      }
      if (!d.lane) {
        this.setFocus(null); // the back chip
        return;
      }
      // Close-up, empty spot: only a double-tap adds a point.
      if (this.isDouble(x, y)) {
        const a = this.area(d.lane);
        if (!a) return;
        this.host.checkpoint();
        addPoint(d.lane, this.snap(this.tOf(x)), denorm(d.lane.param, this.normFromY(y, a)));
        this.host.changed();
      }
      return;
    }
    if (d.kind === 'point' || d.kind === 'curve') return; // (a tap on one was counted on the way down)
    if (d.kind === 'shape') {
      const pts = this.shapeOf(d);
      if (pts.length >= 2) {
        this.host.checkpoint();
        applyShape(d.lane, pts);
        this.host.changed();
      }
      return;
    }
    if (d.kind !== 'section') return;
    if (!d.moved) {
      this.host.seek(this.tOf(x)); // a tap on the track seeks
      return;
    }
    // Drop: the section goes where its middle landed.
    const ed = this.host.edit();
    const starts = sectionStarts(ed);
    const seg = ed.segments[d.index];
    const mid = this.tOf(this.xOf(starts[d.index] + (seg.end - seg.start) / 2) + d.dx);
    let to = starts.findIndex((s, i) => mid >= s && (i === starts.length - 1 || mid < starts[i + 1]));
    if (to < 0) to = mid <= 0 ? 0 : starts.length - 1;
    if (to !== d.index) this.host.moveSection(d.index, to);
  }
}
