// The living background.
//
// With a track loaded, the cover art itself is the background: a few copies
// of the image, heavily blurred with CSS, slowly drifting and turning over
// each other (the way Apple Music does it). It never copies the image through
// a canvas: Safari sometimes hands back an empty canvas there, and it blocks
// or scrambles pixel readback as an anti-fingerprinting measure.
// Before a track is loaded, a small canvas shows soft blobs in the house
// colours.
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

// Drifting cover layers: home position (fraction of the screen), size
// (× the longer screen side), spin speed and phase.
const LAYERS = [
  { hx: 0.25, hy: 0.25, s: 1.1, spin: 0.05, ph: 0 },
  { hx: 0.78, hy: 0.4, s: 1.0, spin: -0.04, ph: 2.1 },
  { hx: 0.4, hy: 0.8, s: 1.05, spin: 0.035, ph: 4.2 },
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

interface ArtGroup {
  el: HTMLDivElement;
  layers: HTMLImageElement[];
}

export class Backdrop {
  private ctx: CanvasRenderingContext2D;
  private palette: RGB[];
  private art: HTMLDivElement;
  private group: ArtGroup | null = null;
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
    canvas.width = 90;
    canvas.height = 160;
    this.art = document.createElement('div');
    this.art.className = 'bg-art';
    this.art.setAttribute('aria-hidden', 'true');
    canvas.after(this.art);
    this.setCssFallback(this.palette);
    requestAnimationFrame(this.frame);
  }

  /** Paint this cover as the background (cross-fades from the previous one). */
  setImage(src: string) {
    const el = document.createElement('div');
    el.className = 'bg-art-group';
    const base = document.createElement('img');
    base.className = 'bg-art-base';
    const layers = LAYERS.map(() => {
      const img = document.createElement('img');
      img.className = 'bg-art-layer';
      return img;
    });
    for (const img of [base, ...layers]) {
      img.alt = '';
      img.decoding = 'async';
      img.src = src;
      el.append(img);
    }
    this.art.append(el);
    const prev = this.group;
    this.group = { el, layers };
    this.place();
    // Fade the new cover in over the old one once it has decoded.
    const show = () => {
      el.classList.add('in');
      if (prev) setTimeout(() => prev.el.remove(), 1400);
    };
    base.decode().then(show, show);
  }

  /** Colours for the CSS fallback gradient under everything (best effort). */
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
    if (!document.hidden) {
      if (this.group) this.place();
      else this.drawBlobs();
    }
    requestAnimationFrame(this.frame);
  };

  /** Move the drifting cover layers. */
  private place() {
    if (!this.group) return;
    const w = innerWidth;
    const h = innerHeight;
    const side = Math.max(w, h);
    const { t } = this;
    this.group.layers.forEach((img, i) => {
      const l = LAYERS[i];
      const size = l.s * side;
      const x = (l.hx + 0.18 * Math.sin(t * 0.5 + l.ph)) * w - size / 2;
      const y = (l.hy + 0.14 * Math.cos(t * 0.37 + l.ph)) * h - size / 2;
      img.style.width = img.style.height = `${size}px`;
      img.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${(t * l.spin * 6 + l.ph).toFixed(3)}rad)`;
    });
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
}
