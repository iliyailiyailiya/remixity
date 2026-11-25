// The timeline overlay (see docs/automation-plan.md): a ruler, the song cut
// into sections, and up to 5 automation lanes, on a beat grid.
//
//   ruler     tap / drag to seek
//   track     drag a section left or right to move it (Split makes sections)
//   lane name tap it for a close-up of that lane (and the track), tap again to go back
//   lanes     tap to add a point, drag to move it, double-tap to delete it;
//             drag the dot in the middle of a segment to curve it (double-tap
//             it to straighten); with a shape picked, drag across a lane to
//             draw it (start/end height = the two levels)
//   zoom      pinch, ctrl/⌘ + wheel (trackpad pinch), or the − / + buttons
//   scroll    two fingers, or the wheel / trackpad; follows the playhead
//
// Drawn on one canvas; the toolbar is plain HTML in index.html.

import type { EditState } from '../engine/edit';
import {
  AUTO_PARAMS,
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
const HIT = 16; // px around a point that grabs it
const COLORS = ['#ff7ab6', '#7ac8ff', '#ffd166', '#8affc1', '#c49bff'];
const PEAK_HOP = 256; // samples per waveform peak (~5 ms): sharp even zoomed in
const MIN_SPAN = 2; // seconds on screen at the closest zoom

type Drag =
  | { kind: 'seek' }
  | { kind: 'section'; index: number; x0: number; dx: number; moved: boolean }
  | { kind: 'pending'; lane: Lane; x0: number; y0: number } // a tap that may become a new point
  | { kind: 'point'; lane: Lane; index: number }
  | { kind: 'curve'; lane: Lane; index: number }
  | { kind: 'shape'; lane: Lane; t0: number; n0: number; t1: number; n1: number }
  | { kind: 'pinch' };

export class Timeline {
  private ctx: CanvasRenderingContext2D;
  private peaks: Float32Array | null = null;
  private peaksOf: AudioBuffer | null = null;
  private raf = 0;
  private drag: Drag | null = null;
  private lastTap = { lane: '', index: -1, at: 0 };
  private w = 0;
  private h = 0;
  /** Grid size in beats (4 = a bar, 1 = a quarter, 2/3 = quarter triplets); 0 = off. */
  grid = 1;
  /** Snap to the grid (it can stay visible with snapping off). */
  snapOn = true;
  /** What dragging on a lane does: move/add points, or draw a shape. */
  shape: ShapeKind | 'points' = 'points';
  /** Turn the page with the playhead while playing (off = the view stays put). */
  followOn = true;
  /** Close-up: only this lane (by id) is shown, big, under a taller track. */
  focus: string | null = null;
  private nameChips: { lane: Lane; x0: number; x1: number; y0: number; y1: number }[] = [];
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
  /** Seconds per pixel → x of a duration. */
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

  /** The nearest grid line to t (t itself when the grid is off). */
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

  // ---------- drawing ----------

  /** The lanes on screen: all, or just the one in close-up. */
  private lanes(): Lane[] {
    const all = this.host.automation.lanes;
    if (this.focus) {
      const one = all.find((l) => l.id === this.focus);
      if (one) return [one];
      this.focus = null; // it was removed
    }
    return all;
  }
  /** Track row height: taller in a close-up. */
  private trackH() {
    return this.focus ? Math.max(TRACK, Math.round((this.h - RULER) * 0.38)) : TRACK;
  }
  private laneH() {
    const n = this.lanes().length;
    const room = this.h - RULER - this.trackH();
    if (this.focus) return Math.max(LANE_MAX, room);
    return n ? Math.min(LANE_MAX, room / n) : LANE_MAX;
  }
  private laneTop(i: number) {
    return RULER + this.trackH() + i * this.laneH();
  }
  /** Index of a lane among those on screen (-1 when hidden). */
  private shownIndex(lane: Lane) {
    return this.lanes().indexOf(lane);
  }

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
    const r = this.host.ratio();
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => this.px(s * r) >= 46) ?? 600;
    for (let s = Math.floor(this.viewStart / r / step) * step; s * r <= this.viewStart + this.span; s += step) {
      const x = this.xOf(s * r);
      g.fillRect(x, RULER - 6, 1, 6);
      g.fillText(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, x + 3, RULER / 2 - 2);
    }

    this.drawGrid();

    // Sections.
    const e = this.host.edit();
    const starts = sectionStarts(e);
    e.segments.forEach((s, i) => {
      const len = s.end - s.start;
      let x = this.xOf(starts[i]);
      const sw = this.px(len);
      const d = this.drag;
      const dragging = d?.kind === 'section' && d.index === i && d.moved;
      if (dragging) x += d.dx;
      if (x > w || x + sw < 0) return;
      g.fillStyle = dragging ? 'rgba(255,255,255,0.22)' : i % 2 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.14)';
      g.beginPath();
      g.roundRect(x + 1, RULER + 4, Math.max(2, sw - 2), this.trackH() - 8, 6);
      g.fill();
      this.drawWave(x, sw, starts[i], len);
    });

    // Lanes.
    const lh = this.laneH();
    this.nameChips = [];
    this.lanes().forEach((lane, i) => {
      const top = this.laneTop(i);
      const c = COLORS[Math.max(0, this.host.automation.lanes.indexOf(lane)) % COLORS.length]; // its own colour, in a close-up too
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
      g.fillRect(0, top, w, lh);
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = top + 4 + (1 - norm(lane.param, valueAt(lane, this.tOf(x)))) * (lh - 8);
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      g.fillStyle = c;
      // Dots only where they're far enough apart to grab (a drawn shape has
      // many points; zoom in to edit them one by one).
      let lastX = -Infinity;
      for (const p of lane.points) {
        const x = this.xOf(p.t);
        if (x < -6 || x > w + 6 || x - lastX < 7) continue;
        lastX = x;
        g.beginPath();
        g.arc(x, top + 4 + (1 - norm(lane.param, p.v)) * (lh - 8), 5, 0, Math.PI * 2);
        g.fill();
      }
      // Curve handles: a hollow dot in the middle of each sloped segment.
      if (this.shape === 'points') {
        g.strokeStyle = c;
        g.lineWidth = 1.5;
        for (const hnd of this.handles(lane, top, lh)) {
          g.beginPath();
          g.arc(hnd.x, hnd.y, 4, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // A shape being drawn.
      const d = this.drag;
      if (d?.kind === 'shape' && d.lane === lane) {
        const pts = this.shapeOf(d);
        const tmp: Lane = { id: '', param: lane.param, points: pts.map((q) => ({ t: q.t, v: denorm(lane.param, q.n), c: q.c })) };
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.setLineDash([4, 3]);
        g.beginPath();
        const xa = Math.max(0, this.xOf(pts[0]?.t ?? 0));
        const xb = Math.min(w, this.xOf(pts[pts.length - 1]?.t ?? 0));
        for (let x = xa; x <= xb; x += 2) {
          const y = top + 4 + (1 - norm(lane.param, valueAt(tmp, this.tOf(x)))) * (lh - 8);
          if (x === xa) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.setLineDash([]);
      }
      const info = AUTO_PARAMS[lane.param];
      const name = `${this.focus ? '‹ ' : ''}${this.host.label(lane)}${info.live ? '' : ' ·'}`;
      g.font = '650 11px system-ui, -apple-system, sans-serif';
      const tw = g.measureText(name).width;
      g.fillStyle = 'rgba(10,6,20,0.7)';
      g.beginPath();
      g.roundRect(4, top + 4, tw + 30, 18, 9);
      this.nameChips.push({ lane, x0: 22, x1: tw + 34, y0: top + 2, y1: top + 26 });
      g.fill();
      g.fillStyle = '#fff';
      g.fillText('×', 11, top + 13);
      g.fillStyle = c;
      g.fillText(name, 24, top + 13);
    });

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

  private drawWave(x: number, sw: number, t0: number, len: number) {
    const peaks = this.peaks;
    const b = this.host.buffer();
    if (!peaks || !b) return;
    const g = this.ctx;
    const th = this.trackH();
    const mid = RULER + th / 2;
    const amp = th / 2 - 8;
    const perSec = b.sampleRate / PEAK_HOP;
    const from = Math.max(0, -x);
    const to = Math.min(sw, this.w - x);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let px = from - (from % 2); px < to; px += 2) {
      const a = Math.floor((t0 + (px / sw) * len) * perSec);
      const z = Math.max(a + 1, Math.floor((t0 + ((px + 2) / sw) * len) * perSec));
      let v = 0;
      for (let k = a; k < z && k < peaks.length; k++) if (peaks[k] > v) v = peaks[k];
      const hh = Math.max(1, v * amp);
      g.fillRect(x + px, mid - hh, 1.5, hh * 2);
    }
  }

  /** Curve handles of a lane on screen: the middle of each sloped, wide-enough segment. */
  private handles(lane: Lane, top: number, lh: number) {
    const out: { index: number; x: number; y: number }[] = [];
    const pts = lane.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const na = norm(lane.param, a.v);
      const nb = norm(lane.param, b.v);
      const xa = this.xOf(a.t);
      const xb = this.xOf(b.t);
      if (Math.abs(nb - na) < 0.03 || xb - xa < 28 || xb < 0 || xa > this.w) continue;
      const n = na + bend(0.5, a.c) * (nb - na);
      out.push({ index: i, x: (xa + xb) / 2, y: top + 4 + (1 - n) * (lh - 8) });
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

  private normFromY(y: number, top: number, lh: number) {
    return Math.min(1, Math.max(0, 1 - (y - top - 4) / (lh - 8)));
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
      // Second finger: zoom/scroll instead of whatever the first one started
      // (a pending new point is simply never added).
      if (this.drag?.kind === 'section') this.drag = null;
      this.drag = { kind: 'pinch' };
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
    if (y < RULER + this.trackH()) {
      const starts = sectionStarts(this.host.edit());
      const t = this.tOf(x);
      let index = starts.findIndex((s, i) => t >= s && (i === starts.length - 1 || t < starts[i + 1]));
      if (index < 0) index = 0;
      this.drag = { kind: 'section', index, x0: x, dx: 0, moved: false };
      return;
    }
    const lh = this.laneH();
    const li = Math.floor((y - RULER - this.trackH()) / lh);
    const lane = this.lanes()[li];
    if (!lane) return;
    const top = this.laneTop(li);
    if (x < 22 && y < top + 24) {
      this.host.removeLane(lane.id);
      this.drag = null;
      return;
    }
    // The lane's name: close-up of it, or back to all lanes.
    if (this.nameChips.some((c) => c.lane === lane && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)) {
      this.focus = this.focus ? null : lane.id;
      this.drag = null;
      this.host.focusChanged?.(this.focus);
      return;
    }
    if (this.shape !== 'points') {
      const t = this.snap(this.tOf(x));
      const n = this.normFromY(y, top, lh);
      this.drag = { kind: 'shape', lane, t0: t, n0: n, t1: t, n1: n };
      return;
    }
    const yOf = (v: number) => top + 4 + (1 - norm(lane.param, v)) * (lh - 8);
    const index = lane.points.findIndex((p) => Math.hypot(this.xOf(p.t) - x, yOf(p.v) - y) < HIT);
    const now = performance.now();
    if (index < 0) {
      const hnd = this.handles(lane, top, lh).find((q) => Math.hypot(q.x - x, q.y - y) < 12);
      if (hnd) {
        const key = `${lane.id}#c`;
        if (this.lastTap.lane === key && this.lastTap.index === hnd.index && now - this.lastTap.at < 320) {
          delete lane.points[hnd.index].c; // double-tap: straight again
          this.lastTap.at = 0;
          this.drag = null;
          this.host.changed();
          return;
        }
        this.lastTap = { lane: key, index: hnd.index, at: now };
        this.drag = { kind: 'curve', lane, index: hnd.index };
        return;
      }
    }
    if (index >= 0 && this.lastTap.lane === lane.id && this.lastTap.index === index && now - this.lastTap.at < 320) {
      removePoint(lane, index);
      this.lastTap.at = 0;
      this.drag = null;
      this.host.changed();
      return;
    }
    if (index >= 0) {
      this.lastTap = { lane: lane.id, index, at: now };
      this.drag = { kind: 'point', lane, index };
      return;
    }
    // Empty spot: the point is added on release or once the finger moves,
    // so a pinch that starts on a lane doesn't leave a stray point.
    this.drag = { kind: 'pending', lane, x0: x, y0: y };
  }

  private valueFromY(lane: Lane, y: number, top: number, lh: number) {
    return denorm(lane.param, 1 - (y - top - 4) / (lh - 8));
  }

  private addAt(lane: Lane, x: number, y: number) {
    const li = this.shownIndex(lane);
    if (li < 0) return -1;
    const index = addPoint(lane, this.snap(this.tOf(x)), this.valueFromY(lane, y, this.laneTop(li), this.laneH()));
    this.lastTap = { lane: lane.id, index, at: performance.now() };
    this.host.changed();
    return index;
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
    } else if (d.kind === 'seek') this.host.seek(this.tOf(x));
    else if (d.kind === 'section') {
      d.dx = x - d.x0;
      if (Math.abs(d.dx) > 6) d.moved = true;
    } else if (d.kind === 'curve' || d.kind === 'shape') {
      const li = this.shownIndex(d.lane);
      if (li < 0) return;
      const n = this.normFromY(y, this.laneTop(li), this.laneH());
      if (d.kind === 'shape') {
        d.t1 = this.snap(this.tOf(x));
        d.n1 = n;
        return;
      }
      const pts = d.lane.points;
      const a = pts[d.index];
      const b = pts[d.index + 1];
      if (!b) return;
      const na = norm(d.lane.param, a.v);
      const nb = norm(d.lane.param, b.v);
      if (Math.abs(nb - na) < 1e-3) return;
      a.c = bendFor((n - na) / (nb - na));
      this.host.changed();
    } else if (d.kind === 'pending') {
      if (Math.hypot(x - d.x0, y - d.y0) < 5) return;
      const index = this.addAt(d.lane, d.x0, d.y0);
      this.drag = index >= 0 ? { kind: 'point', lane: d.lane, index } : null;
    } else {
      const li = this.shownIndex(d.lane);
      if (li < 0) return;
      movePoint(d.lane, d.index, this.snap(this.tOf(x)), this.valueFromY(d.lane, y, this.laneTop(li), this.laneH()));
      this.host.changed();
    }
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
    if (!d) return;
    if (d.kind === 'pending') {
      this.addAt(d.lane, d.x0, d.y0); // a tap adds a point
      return;
    }
    if (d.kind === 'shape') {
      const pts = this.shapeOf(d);
      if (pts.length >= 2) {
        applyShape(d.lane, pts);
        this.host.changed();
      }
      return;
    }
    if (d.kind !== 'section') return;
    const { x } = this.where(e);
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
