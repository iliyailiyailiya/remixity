// The timeline overlay (phase 1 scaffold, see docs/automation-plan.md):
// a ruler, the song cut into sections, and up to 5 automation lanes.
//
//   ruler     tap / drag to seek
//   track     drag a section left or right to move it (Split makes sections)
//   lanes     tap to add a point, drag to move it, double-tap to delete it
//
// Drawn on one canvas; the toolbar is plain HTML in index.html.

import type { EditState } from '../engine/edit';
import {
  AUTO_PARAMS,
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
  ratio(): number;
  /** One beat in timeline seconds (from the detected BPM), null when unknown. */
  beat(): number | null;
  seek(t: number): void;
  /** Move section `from` to `to` (the host commits it, so Undo works). */
  moveSection(from: number, to: number): void;
  /** Lanes changed (points moved, lane removed). */
  changed(): void;
  removeLane(id: string): void;
  label(lane: Lane): string;
}

const RULER = 22;
const TRACK = 70;
const LANE_MAX = 56;
const HIT = 16; // px around a point that grabs it
const COLORS = ['#ff7ab6', '#7ac8ff', '#ffd166', '#8affc1', '#c49bff'];

type Drag =
  | { kind: 'seek' }
  | { kind: 'section'; index: number; x0: number; dx: number; moved: boolean }
  | { kind: 'point'; lane: Lane; index: number };

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

  constructor(
    private canvas: HTMLCanvasElement,
    private host: TimelineHost,
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  open() {
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
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
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- geometry ----------

  private get length() {
    return this.host.buffer()?.duration ?? 0;
  }
  private xOf(t: number) {
    return this.length ? (t / this.length) * this.w : 0;
  }
  private tOf(x: number) {
    return this.w ? Math.min(this.length, Math.max(0, (x / this.w) * this.length)) : 0;
  }
  private laneH() {
    const n = this.host.automation.lanes.length;
    return n ? Math.min(LANE_MAX, (this.h - RULER - TRACK) / n) : LANE_MAX;
  }
  private laneTop(i: number) {
    return RULER + TRACK + i * this.laneH();
  }

  // ---------- grid ----------

  /** Grid spacing in seconds, or 0 when off / no BPM. */
  private step() {
    const b = this.host.beat();
    return b && this.grid ? b * this.grid : 0;
  }

  /** The nearest grid line to t (t itself when the grid is off). */
  snap(t: number) {
    const st = this.step();
    return st ? Math.min(this.length, Math.max(0, Math.round(t / st) * st)) : t;
  }

  private drawGrid() {
    const st = this.step();
    const beat = this.host.beat();
    if (!st || !beat || this.xOf(st) < 4) return;
    const g = this.ctx;
    const bar = beat * 4;
    const n = Math.floor(this.length / st);
    for (let i = 0; i <= n; i++) {
      const t = i * st;
      const onBar = Math.abs(t / bar - Math.round(t / bar)) < 1e-6;
      g.fillStyle = onBar ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
      g.fillRect(Math.round(this.xOf(t)), RULER, 1, this.h - RULER);
    }
  }

  // ---------- drawing ----------

  private ensurePeaks() {
    const b = this.host.buffer();
    if (!b || b === this.peaksOf) return;
    this.peaksOf = b;
    const n = 1600;
    const out = new Float32Array(n);
    const ch = b.getChannelData(0);
    const per = Math.max(1, Math.floor(ch.length / n));
    for (let i = 0; i < n; i++) {
      let m = 0;
      const end = Math.min(ch.length, (i + 1) * per);
      for (let k = i * per; k < end; k += 8) m = Math.max(m, Math.abs(ch[k]));
      out[i] = m;
    }
    // Quiet masters still fill the row.
    let top = 0;
    for (const v of out) top = Math.max(top, v);
    if (top > 0) for (let i = 0; i < n; i++) out[i] /= top;
    this.peaks = out;
  }

  private draw() {
    const g = this.ctx;
    const { w, h } = this;
    g.clearRect(0, 0, w, h);
    if (!this.length) return;
    this.ensurePeaks();

    // Ruler: heard time (after speed), a tick every 10 s.
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, w, RULER);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '600 10px system-ui, -apple-system, sans-serif';
    g.textBaseline = 'middle';
    const r = this.host.ratio();
    const heard = this.length / r;
    const step = [5, 10, 15, 30, 60, 120, 300].find((st) => (st / heard) * w >= 46) ?? 600;
    for (let s = 0; s * r < this.length; s += step) {
      const x = this.xOf(s * r);
      g.fillRect(x, RULER - 6, 1, 6);
      g.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x + 3, RULER / 2 - 2);
    }

    this.drawGrid();

    // Sections.
    const e = this.host.edit();
    const starts = sectionStarts(e);
    e.segments.forEach((s, i) => {
      const len = s.end - s.start;
      let x = this.xOf(starts[i]);
      const sw = this.xOf(len);
      const d = this.drag;
      const dragging = d?.kind === 'section' && d.index === i && d.moved;
      if (dragging) x += d.dx;
      g.fillStyle = dragging ? 'rgba(255,255,255,0.22)' : i % 2 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.14)';
      g.beginPath();
      g.roundRect(x + 1, RULER + 4, Math.max(2, sw - 2), TRACK - 8, 6);
      g.fill();
      this.drawWave(x, sw, starts[i], len);
    });

    // Lanes.
    const lh = this.laneH();
    this.host.automation.lanes.forEach((lane, i) => {
      const top = this.laneTop(i);
      const c = COLORS[i % COLORS.length];
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
      g.fillRect(0, top, w, lh);
      // The curve.
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = top + 4 + (1 - norm(lane.param, valueAt(lane, this.tOf(x)))) * (lh - 8);
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      // Points.
      g.fillStyle = c;
      for (const p of lane.points) {
        g.beginPath();
        g.arc(this.xOf(p.t), top + 4 + (1 - norm(lane.param, p.v)) * (lh - 8), 5, 0, Math.PI * 2);
        g.fill();
      }
      // Name + remove (×), top left.
      const info = AUTO_PARAMS[lane.param];
      const name = `${this.host.label(lane)}${info.live ? '' : ' ·'}`;
      g.font = '650 11px system-ui, -apple-system, sans-serif';
      const tw = g.measureText(name).width;
      g.fillStyle = 'rgba(10,6,20,0.7)';
      g.beginPath();
      g.roundRect(4, top + 4, tw + 30, 18, 9);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText('×', 11, top + 13);
      g.fillStyle = c;
      g.fillText(name, 24, top + 13);
    });

    // Playhead.
    const px = this.xOf(this.host.position());
    g.fillStyle = '#fff';
    g.fillRect(px - 1, 0, 2, h);
  }

  private drawWave(x: number, sw: number, t0: number, len: number) {
    if (!this.peaks) return;
    const g = this.ctx;
    const n = this.peaks.length;
    const mid = RULER + TRACK / 2;
    const amp = TRACK / 2 - 8;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let px = 0; px < sw; px += 2) {
      const t = t0 + (px / sw) * len;
      const v = this.peaks[Math.min(n - 1, Math.floor((t / this.length) * n))];
      const hh = Math.max(1, v * amp);
      g.fillRect(x + px, mid - hh, 1.5, hh * 2);
    }
  }

  // ---------- input ----------

  private where(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent) {
    if (!this.length) return;
    const { x, y } = this.where(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (y < RULER) {
      this.drag = { kind: 'seek' };
      this.host.seek(this.tOf(x));
      return;
    }
    if (y < RULER + TRACK) {
      const starts = sectionStarts(this.host.edit());
      const t = this.tOf(x);
      let index = starts.findIndex((s, i) => t >= s && (i === starts.length - 1 || t < starts[i + 1]));
      if (index < 0) index = 0;
      this.drag = { kind: 'section', index, x0: x, dx: 0, moved: false };
      return;
    }
    const lh = this.laneH();
    const li = Math.floor((y - RULER - TRACK) / lh);
    const lane = this.host.automation.lanes[li];
    if (!lane) return;
    const top = this.laneTop(li);
    // The × chip removes the lane.
    if (x < 22 && y < top + 24) {
      this.host.removeLane(lane.id);
      this.drag = null;
      return;
    }
    const yOf = (v: number) => top + 4 + (1 - norm(lane.param, v)) * (lh - 8);
    let index = lane.points.findIndex((p) => Math.hypot(this.xOf(p.t) - x, yOf(p.v) - y) < HIT);
    const now = performance.now();
    if (index >= 0 && this.lastTap.lane === lane.id && this.lastTap.index === index && now - this.lastTap.at < 320) {
      removePoint(lane, index);
      this.lastTap.at = 0;
      this.drag = null;
      this.host.changed();
      return;
    }
    if (index < 0) index = addPoint(lane, this.snap(this.tOf(x)), this.valueFromY(lane, y, top, lh));
    this.lastTap = { lane: lane.id, index, at: now };
    this.drag = { kind: 'point', lane, index };
    this.host.changed();
  }

  private valueFromY(lane: Lane, y: number, top: number, lh: number) {
    return denorm(lane.param, 1 - (y - top - 4) / (lh - 8));
  }

  private move(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    const { x, y } = this.where(e);
    if (d.kind === 'seek') this.host.seek(this.tOf(x));
    else if (d.kind === 'section') {
      d.dx = x - d.x0;
      if (Math.abs(d.dx) > 6) d.moved = true;
    } else {
      const li = this.host.automation.lanes.indexOf(d.lane);
      if (li < 0) return;
      const top = this.laneTop(li);
      movePoint(d.lane, d.index, this.snap(this.tOf(x)), this.valueFromY(d.lane, y, top, this.laneH()));
      this.host.changed();
    }
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    if (!d || d.kind !== 'section') return;
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
