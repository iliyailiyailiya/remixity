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
// The drift speeds up and slows down with the playback speed, so slowed
// tracks literally drift slower.

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

/**
 * The cover layers are drawn small (1/K of their size), blurred there, and
 * scaled up K× on the GPU: a blur on a small element is cheap, and the upscale
 * smooths it further. The drift itself is a compositor animation (no work on
 * the main thread per frame); its playbackRate follows the playback speed.
 */
const K = 8;
const LOOP_S = [40, 47, 53]; // one full drift loop per layer, in seconds at speed 1

export class Backdrop {
  private ctx: CanvasRenderingContext2D;
  private palette: RGB[];
  private art: HTMLDivElement;
  private group: ArtGroup | null = null;
  private anims: Animation[] = [];
  private t = Math.random() * 100;
  private last = performance.now();
  private lastDraw = 0;
  private running = false;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private rate = 0.35;

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
    this.startBlobs();
    let resizeTimer = 0;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => this.animate(), 200);
    });
  }

  /** Drift speed multiplier (1 = normal). */
  get speed() {
    return this.rate;
  }
  set speed(v: number) {
    if (Math.abs(v - this.rate) < 0.005) return;
    this.rate = v;
    for (const a of this.anims) a.playbackRate = v;
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
    this.running = false; // the blob canvas is covered now
    this.animate();
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

  /** (Re)start the cover layers' drift for the current screen size. */
  private animate() {
    if (!this.group) return;
    const w = innerWidth;
    const h = innerHeight;
    const side = Math.max(w, h);
    const old = this.anims;
    this.anims = this.group.layers.map((img, i) => {
      const l = LAYERS[i];
      const size = (l.s * side) / K;
      img.style.width = img.style.height = `${size.toFixed(1)}px`;
      const turns = Math.sign(l.spin) * 2;
      const at = (u: number) => {
        const x = (l.hx + 0.18 * Math.sin(u + l.ph)) * w - size / 2;
        const y = (l.hy + 0.14 * Math.cos(2 * u + l.ph)) * h - size / 2;
        const rot = l.ph + turns * u;
        return `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rot.toFixed(3)}rad) scale(${K})`;
      };
      if (this.reduced) {
        img.style.transform = at(0);
        return null;
      }
      const N = 32;
      const frames = Array.from({ length: N + 1 }, (_, k) => ({ transform: at((k / N) * Math.PI * 2) }));
      const a = img.animate(frames, { duration: LOOP_S[i] * 1000, iterations: Infinity, easing: 'linear' });
      // Carry on from where the previous drift was, so a resize doesn't jump.
      a.currentTime = (old[i]?.currentTime as number | null) ?? Math.random() * LOOP_S[i] * 1000;
      a.playbackRate = this.rate;
      return a;
    }).filter((a): a is Animation => !!a);
    for (const a of old) a.cancel();
  }

  private startBlobs() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  /** Blob background (before any cover): ~20 redraws a second is plenty. */
  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.reduced) this.t += dt * this.rate;
    if (!document.hidden && now - this.lastDraw > 50) {
      this.lastDraw = now;
      this.drawBlobs();
    }
    requestAnimationFrame(this.frame);
  };

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
