// The gas pedal: a tall vertical slider for playback speed.
// Up = faster, down = slower, the middle line = original speed.
// Dragging is relative (grab anywhere, it never jumps), it clicks into the
// classic speeds, and a double-tap returns to the original.

export const MIN_RATIO = 0.5;
export const MAX_RATIO = 1.5;
const NOTCHES = [0.8, 1, 1.25];
const NOTCH_GRAB = 0.012;

export class Pedal {
  private value = 1;
  private track: HTMLElement;
  private thumb: HTMLElement;
  private fill: HTMLElement;
  private lastNotch: number | null = 1;

  constructor(
    private el: HTMLElement,
    private onChange: (ratio: number) => void,
  ) {
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-orientation', 'vertical');
    el.setAttribute('aria-valuemin', String(MIN_RATIO));
    el.setAttribute('aria-valuemax', String(MAX_RATIO));
    el.tabIndex = 0;
    el.innerHTML = `
      <span class="pedal-cap up" aria-hidden="true">+</span>
      <div class="pedal-track">
        <div class="pedal-fill"></div>
        <div class="pedal-mid"></div>
        ${NOTCHES.filter((n) => n !== 1)
          .map((n) => `<div class="pedal-notch" style="top:${this.toY(n) * 100}%"></div>`)
          .join('')}
        <div class="pedal-thumb"><i></i><i></i><i></i></div>
      </div>
      <span class="pedal-cap down" aria-hidden="true">−</span>`;
    this.track = el.querySelector('.pedal-track')!;
    this.thumb = el.querySelector('.pedal-thumb')!;
    this.fill = el.querySelector('.pedal-fill')!;

    let startY = 0;
    let startValue = 1;
    let moved = false;
    let lastTap = 0;
    let active = false;

    this.track.addEventListener('pointerdown', (e) => {
      active = true;
      moved = false;
      startY = e.clientY;
      startValue = this.value;
      this.track.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    this.track.addEventListener('pointermove', (e) => {
      if (!active) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      const h = this.track.getBoundingClientRect().height;
      this.set(startValue - (dy / h) * (MAX_RATIO - MIN_RATIO), true);
    });
    const end = () => {
      if (!active) return;
      active = false;
      el.classList.remove('dragging');
      if (!moved) {
        const now = performance.now();
        if (now - lastTap < 320) this.set(1, true);
        lastTap = now;
      }
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);

    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      const map: Record<string, number> = {
        ArrowUp: step,
        ArrowRight: step,
        ArrowDown: -step,
        ArrowLeft: -step,
        PageUp: 0.1,
        PageDown: -0.1,
      };
      if (e.key in map) this.set(this.value + map[e.key], true, false);
      else if (e.key === 'Home') this.set(1, true);
      else return;
      e.preventDefault();
    });

    this.render();
  }

  private toY(v: number) {
    return (MAX_RATIO - v) / (MAX_RATIO - MIN_RATIO);
  }

  get ratio() {
    return this.value;
  }

  /** Set the speed. `user` fires onChange; `snap` applies notch magnetism. */
  set(v: number, user = false, snap = true) {
    v = Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));
    let notch: number | null = null;
    for (const n of NOTCHES) if (Math.abs(v - n) < NOTCH_GRAB) notch = n;
    if (snap && notch !== null) v = notch;
    if (user && notch !== null && notch !== this.lastNotch) {
      try {
        navigator.vibrate?.(8);
      } catch {
        /* not supported */
      }
    }
    this.lastNotch = notch;
    v = Math.round(v * 1000) / 1000;
    if (v === this.value && user) return;
    this.value = v;
    this.render();
    if (user) this.onChange(v);
  }

  private render() {
    const y = this.toY(this.value) * 100;
    this.thumb.style.top = `${y}%`;
    const up = this.value >= 1;
    this.fill.style.top = `${up ? y : 50}%`;
    this.fill.style.bottom = `${up ? 50 : 100 - y}%`;
    this.el.classList.toggle('up', this.value > 1);
    this.el.classList.toggle('down', this.value < 1);
    this.el.setAttribute('aria-valuenow', String(this.value));
    this.el.setAttribute('aria-valuetext', `×${this.value.toFixed(2)}`);
  }
}
