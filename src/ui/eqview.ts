// The visual equalizer: a live spectrum of what you hear, the EQ's actual
// frequency response drawn over it, and five nodes you drag up or down.
//
// The curve is computed from the same filter types and settings the audio
// chain uses (RBJ cookbook biquads), so what you see is what you hear.
// Dragging is vertical only, so a sideways swipe still flips the page.

import type { FxParams } from '../engine/chain';

type BandKey = 'bass' | 'eqLow' | 'eqMid' | 'eqHigh' | 'eqAir';

interface Band {
  key: BandKey;
  f: number;
  type: 'lowshelf' | 'peaking' | 'highshelf';
  q: number;
  min: number;
  max: number;
  label: string;
}

const BANDS: Band[] = [
  { key: 'bass', f: 110, type: 'lowshelf', q: 0.7071, min: -6, max: 12, label: 'Bass' },
  { key: 'eqLow', f: 250, type: 'peaking', q: 0.9, min: -12, max: 12, label: '250' },
  { key: 'eqMid', f: 1000, type: 'peaking', q: 0.9, min: -12, max: 12, label: '1k' },
  { key: 'eqHigh', f: 4000, type: 'peaking', q: 0.9, min: -12, max: 12, label: '4k' },
  { key: 'eqAir', f: 12000, type: 'highshelf', q: 0.7071, min: -12, max: 12, label: 'Air' },
];

const FS = 48000;
const F_MIN = 20;
const F_MAX = 20000;
const DB_RANGE = 15; // ± dB shown

/** |H(f)| in dB for one RBJ biquad. */
function biquadDb(type: string, f0: number, q: number, gainDb: number, f: number): number {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / FS;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'peaking') {
    const al = sin / (2 * q);
    [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cos, 1 - al * A, 1 + al / A, -2 * cos, 1 - al / A];
  } else if (type === 'lowshelf' || type === 'highshelf') {
    const al = (sin / 2) * Math.SQRT2; // shelf slope S = 1, as in Web Audio
    const s = 2 * Math.sqrt(A) * al;
    if (type === 'lowshelf') {
      b0 = A * (A + 1 - (A - 1) * cos + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - s);
      a0 = A + 1 + (A - 1) * cos + s;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - s;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + s);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - s);
      a0 = A + 1 - (A - 1) * cos + s;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - s;
    }
  } else {
    const al = sin / (2 * q);
    const lp = type === 'lowpass';
    b0 = lp ? (1 - cos) / 2 : (1 + cos) / 2;
    b1 = lp ? 1 - cos : -(1 + cos);
    b2 = b0;
    [a0, a1, a2] = [1 + al, -2 * cos, 1 - al];
  }
  const w = (2 * Math.PI * f) / FS;
  const mag = (c0: number, c1: number, c2: number) =>
    Math.hypot(c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w), c1 * Math.sin(w) + c2 * Math.sin(2 * w));
  return 20 * Math.log10(mag(b0, b1, b2) / mag(a0, a1, a2));
}

function responseDb(p: FxParams, f: number): number {
  let db = 0;
  for (const b of BANDS) if (p[b.key]) db += biquadDb(b.type, b.f, b.q, p[b.key], f);
  if (p.lowCut > F_MIN) db += biquadDb('highpass', p.lowCut, 0.7071, 0, f);
  if (p.highCut < F_MAX) db += biquadDb('lowpass', p.highCut, 0.7071, 0, f);
  return db;
}

const fmtHz = (f: number) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

export interface EqViewOptions {
  get(): FxParams;
  set(key: BandKey, value: number): void;
  analyser(): AnalyserNode | null;
  /** Text for the readout next to the title (the band being dragged). */
  onReadout(text: string): void;
}

export class EqView {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private drag: { band: Band; pointer: number } | null = null;
  private hover: Band | null = null;
  private lastTap = { key: '', at: 0 };
  private spectrum: Float32Array<ArrayBuffer> | null = null;
  private smooth: number[] = [];
  /** Only animate while the EQ page is on screen. */
  active = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: EqViewOptions,
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('pointerleave', () => {
      if (!this.drag) this.hover = null;
    });
    requestAnimationFrame(this.frame);
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  // ----- geometry -----
  private pad = { l: 12, r: 12, t: 12, b: 20 };
  private x(f: number) {
    const { l, r } = this.pad;
    return l + ((this.w - l - r) * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN);
  }
  private f(x: number) {
    const { l, r } = this.pad;
    return F_MIN * Math.pow(F_MAX / F_MIN, (x - l) / (this.w - l - r));
  }
  private y(db: number) {
    const { t, b } = this.pad;
    const mid = t + (this.h - t - b) / 2;
    return mid - (db / DB_RANGE) * ((this.h - t - b) / 2);
  }
  private db(y: number) {
    const { t, b } = this.pad;
    const half = (this.h - t - b) / 2;
    return ((t + half - y) / half) * DB_RANGE;
  }

  // ----- input -----
  private nearest(px: number, py: number): Band | null {
    const p = this.opts.get();
    let best: Band | null = null;
    let bestD = 40;
    for (const b of BANDS) {
      // Horizontal distance counts most: nodes sit on one row of columns.
      const d = Math.hypot(this.x(b.f) - px, (this.y(p[b.key]) - py) * 0.35);
      if (d < bestD) [best, bestD] = [b, d];
    }
    return best;
  }

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private down = (e: PointerEvent) => {
    const [px, py] = this.local(e);
    const band = this.nearest(px, py);
    if (!band) return;
    // Double tap a node to flatten it.
    const now = performance.now();
    if (this.lastTap.key === band.key && now - this.lastTap.at < 320) {
      this.opts.set(band.key, 0);
      this.lastTap = { key: '', at: 0 };
      this.readout(band);
      return;
    }
    this.lastTap = { key: band.key, at: now };
    this.drag = { band, pointer: e.pointerId };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    this.setFromY(band, py);
  };

  private move = (e: PointerEvent) => {
    const [px, py] = this.local(e);
    if (this.drag && e.pointerId === this.drag.pointer) this.setFromY(this.drag.band, py);
    else if (e.pointerType === 'mouse') {
      this.hover = this.nearest(px, py);
      this.canvas.style.cursor = this.hover ? 'ns-resize' : '';
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointer) return;
    this.drag = null;
    this.opts.onReadout('');
  };

  private setFromY(band: Band, py: number) {
    const v = Math.round(Math.min(band.max, Math.max(band.min, this.db(py))) * 2) / 2;
    if (v !== this.opts.get()[band.key]) this.opts.set(band.key, v);
    this.readout(band);
  }

  private readout(band: Band) {
    this.opts.onReadout(`${band.key === 'bass' ? 'Bass' : band.key === 'eqAir' ? 'Air' : fmtHz(band.f)} · ${fmtDb(this.opts.get()[band.key])}`);
  }

  // ----- drawing -----
  private frame = () => {
    if (this.active && !document.hidden) this.draw();
    requestAnimationFrame(this.frame);
  };

  /** Redraw now (e.g. after a parameter changed while the page is visible). */
  draw() {
    const { ctx, w, h } = this;
    if (!w || !h) return;
    const p = this.opts.get();
    ctx.clearRect(0, 0, w, h);

    // Grid: decades and the 0 dB line.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    for (const f of [100, 1000, 10000]) {
      const x = Math.round(this.x(f)) + 0.5;
      ctx.moveTo(x, this.pad.t);
      ctx.lineTo(x, h - this.pad.b);
    }
    for (const d of [-10, 10]) {
      const y = Math.round(this.y(d)) + 0.5;
      ctx.moveTo(this.pad.l, y);
      ctx.lineTo(w - this.pad.r, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    const y0 = Math.round(this.y(0)) + 0.5;
    ctx.moveTo(this.pad.l, y0);
    ctx.lineTo(w - this.pad.r, y0);
    ctx.stroke();
    ctx.setLineDash([]);

    this.drawSpectrum();

    // The response curve.
    const steps = Math.max(60, Math.round(w / 3));
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const x = this.pad.l + ((w - this.pad.l - this.pad.r) * i) / steps;
      const db = Math.max(-DB_RANGE - 4, Math.min(DB_RANGE + 4, responseDb(p, this.f(x))));
      pts.push([x, this.y(db)]);
    }
    // Fill between the curve and 0 dB: warm above, cool below.
    const grad = ctx.createLinearGradient(0, this.pad.t, 0, h - this.pad.b);
    grad.addColorStop(0, 'rgba(255,170,120,0.55)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(120,170,255,0.55)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], y0);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts[pts.length - 1][0], y0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineWidth = 2.25;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Nodes and their labels.
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const b of BANDS) {
      const x = this.x(b.f);
      const y = this.y(p[b.key]);
      const hot = this.drag?.band === b || this.hover === b;
      const on = p[b.key] !== 0;
      ctx.fillStyle = `rgba(255,255,255,${hot ? 0.28 : 0.14})`;
      ctx.beginPath();
      ctx.arc(x, y, hot ? 17 : 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on || hot ? '#fff' : 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, hot ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hot ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.fillText(b.label, x, h - 5);
    }
  }

  private drawSpectrum() {
    const an = this.opts.analyser();
    if (!an) return;
    if (!this.spectrum || this.spectrum.length !== an.frequencyBinCount)
      this.spectrum = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(this.spectrum);
    const { ctx, w, h } = this;
    const binHz = an.context.sampleRate / an.fftSize;
    const n = 72;
    const top = this.pad.t;
    const bottom = h - this.pad.b;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const x = this.pad.l + ((w - this.pad.l - this.pad.r) * i) / n;
      // Average the bins under this slice of the (log) axis.
      const fa = this.f(x - (w / n) * 0.5);
      const fb = this.f(x + (w / n) * 0.5);
      const ia = Math.max(1, Math.floor(fa / binHz));
      const ib = Math.min(this.spectrum.length - 1, Math.max(ia, Math.ceil(fb / binHz)));
      let sum = 0;
      for (let k = ia; k <= ib; k++) sum += Math.pow(10, this.spectrum[k] / 10);
      let db = 10 * Math.log10(sum / (ib - ia + 1) + 1e-12);
      // Tilt +3 dB/oct so music reads roughly flat instead of bass-heavy.
      db += 3 * Math.log2(Math.max(20, (fa + fb) / 2) / 1000);
      const v = Math.max(0, Math.min(1, (db + 85) / 70));
      this.smooth[i] = this.smooth[i] === undefined ? v : this.smooth[i] * 0.7 + v * 0.3;
      pts.push([x, bottom - this.smooth[i] * (bottom - top)]);
    }
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], bottom);
    // Smooth the outline with midpoint quadratic curves.
    for (let i = 0; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[pts.length - 1][0], bottom);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
}
