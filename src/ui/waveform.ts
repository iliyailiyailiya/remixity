// Canvas waveform with a playhead, selection and markers.
// Tap to seek; drag to select a range (snaps to markers).

const BUCKETS = 3000;
const DRAG_PX = 6;
const SNAP_PX = 10;

export interface WaveformEvents {
  onSeek(fraction: number): void;
  onSelect(a: number, b: number): void; // fractions, a < b
}

export class Waveform {
  private peaks: Float32Array | null = null; // min/max pairs
  private progress = 0;
  private selection: [number, number] | null = null;
  private markers: number[] = [];
  private loop = false;
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private events: WaveformEvents,
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);

    let downX: number | null = null;
    let dragging = false;
    const frac = (clientX: number) => {
      const r = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    };
    const snap = (f: number) => {
      const tol = SNAP_PX / canvas.getBoundingClientRect().width;
      for (const m of [0, 1, ...this.markers]) if (Math.abs(m - f) < tol) return m;
      return f;
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.peaks) return;
      downX = e.clientX;
      dragging = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (downX === null) return;
      if (!dragging && Math.abs(e.clientX - downX) < DRAG_PX) return;
      dragging = true;
      const a = snap(frac(downX));
      const b = snap(frac(e.clientX));
      if (Math.abs(a - b) > 0) this.events.onSelect(Math.min(a, b), Math.max(a, b));
    });
    const end = (e: PointerEvent) => {
      if (downX === null) return;
      if (!dragging) this.events.onSeek(frac(e.clientX));
      downX = null;
      dragging = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => {
      downX = null;
      dragging = false;
    });
  }

  setBuffer(buffer: AudioBuffer) {
    const peaks = new Float32Array(BUCKETS * 2);
    const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const per = buffer.length / BUCKETS;
    for (let b = 0; b < BUCKETS; b++) {
      let min = 0;
      let max = 0;
      const start = Math.floor(b * per);
      const end = Math.min(buffer.length, Math.floor((b + 1) * per));
      const stride = Math.max(1, Math.floor((end - start) / 400));
      for (let i = start; i < end; i += stride) {
        let v = 0;
        for (const ch of chans) v += ch[i];
        v /= chans.length;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks[b * 2] = min;
      peaks[b * 2 + 1] = max;
    }
    this.peaks = peaks;
    this.draw();
  }

  setProgress(f: number) {
    this.progress = f;
    this.draw();
  }

  setOverlay(selection: [number, number] | null, markers: number[], loop: boolean) {
    this.selection = selection;
    this.markers = markers;
    this.loop = loop;
    this.draw();
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    if (!this.peaks) return;

    const css = getComputedStyle(canvas);
    const played = css.getPropertyValue('--wave-played').trim() || '#c084fc';
    const rest = css.getPropertyValue('--wave-rest').trim() || '#555';
    const sel = css.getPropertyValue('--wave-sel').trim() || '#c084fc33';
    const marker = css.getPropertyValue('--wave-marker').trim() || '#f472b6';
    const top = Math.round(14 * dpr); // room for marker labels
    const bar = Math.max(2, Math.round(3 * dpr));
    const gap = Math.max(1, Math.round(1.5 * dpr));
    const bars = Math.floor(w / (bar + gap));
    const mid = top + (h - top) / 2;
    const playedX = this.progress * w;

    if (this.selection) {
      const [a, b] = this.selection;
      ctx.fillStyle = sel;
      ctx.fillRect(a * w, top, (b - a) * w, h - top);
      ctx.fillStyle = played;
      ctx.fillRect(a * w - dpr, top, 2 * dpr, h - top);
      ctx.fillRect(b * w - dpr, top, 2 * dpr, h - top);
      if (this.loop) {
        ctx.font = `${Math.round(11 * dpr)}px system-ui, sans-serif`;
        ctx.fillText('⟲', a * w + 4 * dpr, top + 12 * dpr);
      }
    }

    for (let i = 0; i < bars; i++) {
      const b0 = Math.floor((i / bars) * BUCKETS);
      const b1 = Math.max(b0 + 1, Math.floor(((i + 1) / bars) * BUCKETS));
      let amp = 0;
      for (let b = b0; b < b1; b++) {
        amp = Math.max(amp, -this.peaks[b * 2], this.peaks[b * 2 + 1]);
      }
      const bh = Math.max(dpr, Math.min(1, amp * 1.1) * ((h - top) * 0.9));
      const x = i * (bar + gap);
      ctx.fillStyle = x + bar / 2 <= playedX ? played : rest;
      ctx.fillRect(x, mid - bh / 2, bar, bh);
    }

    ctx.font = `600 ${Math.round(10 * dpr)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    this.markers.forEach((m, i) => {
      const x = Math.round(m * w);
      ctx.fillStyle = marker;
      ctx.fillRect(x - Math.floor(dpr / 2), top, Math.max(1, dpr), h - top);
      ctx.fillText(String(i + 1), Math.min(w - 6 * dpr, Math.max(6 * dpr, x)), top - 3 * dpr);
    });
    ctx.textAlign = 'start';

    // Playhead
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(playedX) - Math.floor(dpr / 2), top, Math.max(1, dpr), h - top);
  }
}
