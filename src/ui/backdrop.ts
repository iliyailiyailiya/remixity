// The living background: soft blobs in the cover's colours drifting behind
// everything. It is drawn on a tiny canvas and stretched + blurred by CSS,
// which looks smooth and costs almost nothing, even on phones.
//
// The drift runs on its own clock that advances faster or slower with the
// playback speed, so slowed tracks literally drift slower.

import type { RGB } from './palette';

interface Blob {
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
  r: number;
}

// Each blob roams its own quadrant-ish area, so colours stay separate
// instead of averaging into mud.
const BLOBS: Blob[] = [
  { ax: 0.28, ay: 0.18, fx: 0.11, fy: 0.07, px: 0, py: 1, r: 0.55 },
  { ax: 0.26, ay: 0.24, fx: 0.07, fy: 0.12, px: 2.4, py: 0.5, r: 0.5 },
  { ax: 0.3, ay: 0.2, fx: 0.09, fy: 0.05, px: 4.2, py: 3, r: 0.48 },
  { ax: 0.22, ay: 0.28, fx: 0.06, fy: 0.09, px: 1.3, py: 5.1, r: 0.58 },
];

/** Dark covers would give a muddy background: lift each colour to a
 *  minimum brightness while keeping its hue. */
function lift(c: RGB): RGB {
  const max = Math.max(...c);
  const floor = 135;
  if (max >= floor) return c;
  if (max < 8) return [floor * 0.5, floor * 0.5, floor * 0.6];
  const k = floor / max;
  return c.map((v) => Math.round(v * k)) as RGB;
}

export class Backdrop {
  private ctx: CanvasRenderingContext2D;
  private from: RGB[];
  private to: RGB[];
  private mix = 1; // 0..1 cross-fade between palettes
  private t = Math.random() * 100;
  private last = performance.now();
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Drift speed multiplier (1 = normal). */
  speed = 0.35;

  constructor(
    private canvas: HTMLCanvasElement,
    palette: RGB[],
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.from = palette.map(lift);
    this.to = this.from;
    // Small canvas, stretched by CSS. The radial gradients are already soft,
    // so no CSS blur is needed (iOS Safari is unreliable with filters on a
    // fixed, constantly redrawn canvas).
    canvas.width = 90;
    canvas.height = 160;
    this.setCssFallback(this.to);
    requestAnimationFrame(this.frame);
  }

  setPalette(p: RGB[]) {
    // Start the cross-fade from whatever is currently on screen.
    this.from = this.current();
    this.to = p.map(lift);
    this.mix = 0;
    this.setCssFallback(this.to);
  }

  /** A plain CSS gradient in the same colours sits under the canvas, so the
   *  page still takes on the cover's colours if the canvas can't draw. */
  private setCssFallback(p: RGB[]) {
    const root = document.documentElement.style;
    p.forEach((c, i) => root.setProperty(`--c${i + 1}`, `rgb(${c.join(',')})`));
  }

  private current(): RGB[] {
    return this.to.map((c, i) => {
      const f = this.from[i] ?? c;
      return c.map((v, k) => f[k] + (v - f[k]) * this.mix) as RGB;
    });
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.reduced) this.t += dt * this.speed;
    if (this.mix < 1) this.mix = Math.min(1, this.mix + dt / 1.2);
    if (!document.hidden) this.draw();
    requestAnimationFrame(this.frame);
  };

  private draw() {
    const { ctx, canvas, t } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cols = this.current();
    // Base: the darkest colour, dimmed.
    const base = [...cols].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))[0];
    ctx.fillStyle = `rgb(${base.map((v) => Math.round(v * 0.55)).join(',')})`;
    ctx.fillRect(0, 0, w, h);

    const homes = [
      [0.25, 0.22],
      [0.75, 0.3],
      [0.3, 0.75],
      [0.72, 0.8],
    ];
    BLOBS.forEach((b, i) => {
      const c = cols[i % cols.length];
      const x = (homes[i][0] + b.ax * Math.sin(t * b.fx * 6 + b.px)) * w;
      const y = (homes[i][1] + b.ay * Math.sin(t * b.fy * 6 + b.py)) * h;
      const r = b.r * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c.join(',')},0.9)`);
      g.addColorStop(1, `rgba(${c.join(',')},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }
}
