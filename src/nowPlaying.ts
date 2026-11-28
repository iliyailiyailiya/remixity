// Lock screen, Control Center and Dynamic Island controls on iPhone.
//
// The app plays through Web Audio (the pedal and live effects need it). iOS
// shows that something is playing, but it only connects the lock-screen
// buttons (play/pause, ⏮ ⏭) to a page that plays a real media element. So a
// tiny silent <audio> loop plays and pauses together with the player: iOS
// then sends those buttons to our Media Session handlers. It's silent and
// a few kilobytes; the music itself still comes from Web Audio.

import { npLog } from './debugLog';

/**
 * 10 minutes of silence as a WAV file (8 kHz, 8-bit mono, ~4.8 MB in
 * memory, made here, nothing downloaded). Long on purpose: each time it starts
 * over, iOS resets its lock-screen widget (plain ⏪ ⏩, "paused") and forgets
 * our buttons — with a 30 s loop that happened every 30 seconds.
 */
function silentWav(): string {
  const rate = 8000;
  const n = rate * 600;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  s(8, 'WAVE');
  s(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true); // bytes per second
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true); // 8-bit: silence is 128
  s(36, 'data');
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export class NowPlaying {
  private el: HTMLAudioElement | null = null;
  private wanted = false;
  private lastTime = 0;
  /** The silent track started over (iOS may have reset its widget). */
  onLoop: () => void = () => {};

  private get audio() {
    if (!this.el) {
      const el = document.createElement('audio');
      el.src = silentWav();
      el.loop = true;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('aria-hidden', 'true');
      el.style.display = 'none';
      document.body.append(el); // in the page, like a normal player's element
      el.addEventListener('timeupdate', () => {
        if (el.currentTime + 1 < this.lastTime) this.onLoop(); // jumped back to the start
        this.lastTime = el.currentTime;
      });
      for (const ev of ['play', 'playing', 'pause', 'ended', 'stalled', 'waiting', 'error', 'suspend', 'emptied'])
        el.addEventListener(ev, () => npLog(`element ${ev}${ev === 'error' ? ` ${el.error?.code ?? ''}` : ''}`));
      this.el = el;
    }
    return this.el;
  }

  /**
   * Follow the player. Call it from the play tap itself the first time (iOS
   * only lets a media element start from a user's tap; after that it may
   * start on its own, e.g. when the next song begins).
   */
  set(playing: boolean) {
    const el = this.audio;
    if (playing !== this.wanted || playing === el.paused) npLog(`nowPlaying.set(${playing}) element ${el.paused ? 'paused' : 'playing'}`);
    this.wanted = playing;
    if (playing && el.paused) {
      el.play().then(
        () => npLog('element play() ok'),
        (err: Error) => npLog(`element play() REFUSED: ${err?.name} ${err?.message ?? ''}`),
      );
    } else if (!playing && !el.paused) el.pause();
  }

  get playing() {
    return this.wanted;
  }

  /** Is the silent element actually playing (for checks). */
  get active() {
    return !!this.el && !this.el.paused;
  }
}
