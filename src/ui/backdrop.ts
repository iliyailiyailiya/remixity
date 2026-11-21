// The living background.
//
// With a track loaded, it paints the cover art itself: shrunk to a 12×12
// thumbnail, then stretched over the screen in a few slowly drifting,
// rotating layers, which blurs it into a soft colour field. This only ever
// *draws* the image and never reads pixels back, which matters because
// Safari blocks or scrambles canvas readback as an anti-fingerprinting
// measure. Before a track is loaded it shows soft blobs in the house colours.
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

const BLOBS: Blob[] = [
  { ax: 0.28, ay: 0.18, fx: 0.11, fy: 0.07, px: 0, py: 1, r: 0.55 },
  { ax: 0.26, ay: 0.24, fx: 0.07, fy: 0.12, px: 2.4, py: 0.5, r: 0.5 },
  { ax: 0.3, ay: 0.2, fx: 0.09, fy: 0.05, px: 4.2, py: 3, r: 0.48 },
  { ax: 0.22, ay: 0.28, fx: 0.06, fy: 0.09, px: 1.3, py: 5.1, r: 0.58 },
];
const HOMES = [
  [0.25, 0.22],
  [0.75, 0.3],
  [0.3, 0.75],
  [0.72, 0.8],
];

// Drifting cover layers: home position, size (× screen diagonal), spin speed.
const LAYERS = [
  { hx: 0.3, hy: 0.28, s: 1.05, spin: 0.05, ph: 0 },
  { hx: 0.72, hy: 0.4, s: 0.95, spin: -0.04, ph: 2.1 },
  { hx: 0.4, hy: 0.78, s: 1.0, spin: 0.035, ph: 4.2 },
];

/** Lift a colour to a minimum brightness, keeping its hue. */
function lift(c: RGB): RGB {
  const max = Math.max(...c);
  const floor = 135;
  if (max >= floor) return c;
  if (max < 8) return [floor * 0.5, floor * 0.5, floor * 0.6];
  const k = floor / max;
  return c.map((v) => Math.round(v * k)) as RGB;
}

/** Shrink an image to a tiny canvas: a colour map of the cover. */
function thumbnail(img: CanvasImageSource): HTMLCanvasElement {
  // Two steps (→64 → 12) average colours better than one big jump.
  const mid = document.createElement('canvas');
  mid.width = mid.height = 64;
  const m = mid.getContext('2d')!;
  m.imageSmoothingEnabled = true;
  m.imageSmoothingQuality = 'high';
  m.drawImage(img, 0, 0, 64, 64);
  const tiny = document.createElement('canvas');
  tiny.width = tiny.height = 12;
  const t = tiny.getContext('2d')!;
  t.imageSmoothingEnabled = true;
  t.imageSmoothingQuality = 'high';
  t.drawImage(mid, 0, 0, 12, 12);
  return tiny;
}

export class Backdrop {
  private ctx: CanvasRenderingContext2D;
  private palette: RGB[];
  private img: HTMLCanvasElement | null = null;
  private prevImg: HTMLCanvasElement | null = null;
  private fade = 1; // 0..1 cross-fade to the newest cover
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
    this.palette = palette.map(lift);
    // Small canvas, stretched by CSS: the content is soft anyway, and no CSS
    // blur is needed (iOS Safari is unreliable with filters on a canvas).
    canvas.width = 90;
    canvas.height = 160;
    this.setCssFallback(this.palette);
    requestAnimationFrame(this.frame);
  }

  /** Paint this cover as the background (cross-fades from the previous one). */
  setImage(img: CanvasImageSource) {
    try {
      this.prevImg = this.img;
      this.img = thumbnail(img);
      this.fade = 0;
    } catch (err) {
      console.warn('backdrop', err);
    }
  }

  /** Colours for the CSS fallback gradient under the canvas (best effort). */
  setPalette(p: RGB[]) {
    this.setCssFallback(p.map(lift));
  }

  private setCssFallback(p: RGB[]) {
    const root = document.documentElement.style;
    p.forEach((c, i) => root.setProperty(`--c${i + 1}`, `rgb(${c.join(',')})`));
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.reduced) this.t += dt * this.speed;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / 1.2);
    if (!document.hidden) this.draw();
    requestAnimationFrame(this.frame);
  };

  private draw() {
    const { ctx } = this;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Underneath: the house-colour blobs (all you see before a track loads).
    if (!this.img || this.fade < 1 || this.prevImg) {
      if (this.prevImg) this.drawCover(this.prevImg, 1);
      else this.drawBlobs();
    }
    if (this.img) this.drawCover(this.img, this.fade);
  }

  private drawBlobs() {
    const { ctx, canvas, t } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cols = this.palette;
    const base = [...cols].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))[0];
    ctx.fillStyle = `rgb(${base.map((v) => Math.round(v * 0.55)).join(',')})`;
    ctx.fillRect(0, 0, w, h);
    BLOBS.forEach((b, i) => {
      const c = cols[i % cols.length];
      const x = (HOMES[i][0] + b.ax * Math.sin(t * b.fx * 6 + b.px)) * w;
      const y = (HOMES[i][1] + b.ay * Math.sin(t * b.fy * 6 + b.py)) * h;
      const r = b.r * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c.join(',')},0.9)`);
      g.addColorStop(1, `rgba(${c.join(',')},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  private drawCover(src: HTMLCanvasElement, alpha: number) {
    if (alpha <= 0) return;
    const { ctx, canvas, t } = this;
    const w = canvas.width;
    const h = canvas.height;
    const diag = Math.hypot(w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // The whole cover stretched over the screen keeps its layout: colours
    // from the top-left of the artwork end up top-left on screen.
    ctx.globalAlpha = alpha;
    ctx.drawImage(src, -w * 0.1, -h * 0.05, w * 1.2, h * 1.1);

    // Drifting, slowly turning copies add the living motion.
    for (const l of LAYERS) {
      const x = (l.hx + 0.18 * Math.sin(t * 0.5 + l.ph)) * w;
      const y = (l.hy + 0.14 * Math.cos(t * 0.37 + l.ph)) * h;
      const size = l.s * diag;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * l.spin * 6 + l.ph);
      ctx.globalAlpha = alpha * 0.5;
      ctx.drawImage(src, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    // Brighten dark covers a little ('screen' only ever lightens).
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * 0.3;
    ctx.drawImage(src, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
