// Canvas waveform with a playhead. Tap or drag to seek.

const BUCKETS = 3000;

export class Waveform {
  private peaks: Float32Array | null = null; // min/max pairs
  private progress = 0;
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private onSeek: (fraction: number) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);

    let dragging = false;
    const seekAt = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.peaks) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      seekAt(e);
    });
    canvas.addEventListener('pointermove', (e) => dragging && seekAt(e));
    canvas.addEventListener('pointerup', () => (dragging = false));
    canvas.addEventListener('pointercancel', () => (dragging = false));
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
    this.progress = 0;
    this.draw();
  }

  setProgress(f: number) {
    this.progress = f;
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
    const bar = Math.max(2, Math.round(3 * dpr));
    const gap = Math.max(1, Math.round(1.5 * dpr));
    const bars = Math.floor(w / (bar + gap));
    const mid = h / 2;
    const playedX = this.progress * w;

    for (let i = 0; i < bars; i++) {
      const b0 = Math.floor((i / bars) * BUCKETS);
      const b1 = Math.max(b0 + 1, Math.floor(((i + 1) / bars) * BUCKETS));
      let amp = 0;
      for (let b = b0; b < b1; b++) {
        amp = Math.max(amp, -this.peaks[b * 2], this.peaks[b * 2 + 1]);
      }
      const bh = Math.max(dpr, Math.min(1, amp * 1.1) * (h * 0.92));
      const x = i * (bar + gap);
      ctx.fillStyle = x + bar / 2 <= playedX ? played : rest;
      ctx.fillRect(x, mid - bh / 2, bar, bh);
    }
  }
}
