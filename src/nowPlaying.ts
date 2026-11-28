// Lock screen, Control Center and Dynamic Island controls on iPhone.
//
// The app plays through Web Audio (the pedal and live effects need it). iOS
// shows that something is playing, but it only connects the lock-screen
// buttons (play/pause, ⏮ ⏭) to a page that plays a real media element. So a
// tiny silent <audio> loop plays and pauses together with the player: iOS
// then sends those buttons to our Media Session handlers. It's silent and
// a few kilobytes; the music itself still comes from Web Audio.

/** One second of silence as a WAV file (8 kHz, 16-bit mono). */
function silentWav(): string {
  const rate = 8000;
  const n = rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  s(8, 'WAVE');
  s(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, 'data');
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export class NowPlaying {
  private el: HTMLAudioElement | null = null;
  private wanted = false;

  private get audio() {
    if (!this.el) {
      const el = document.createElement('audio');
      el.src = silentWav();
      el.loop = true;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('aria-hidden', 'true');
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
    this.wanted = playing;
    const el = this.audio;
    if (playing && el.paused) {
      el.play().catch(() => {
        /* not allowed yet (no tap so far): the next tap will start it */
      });
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
