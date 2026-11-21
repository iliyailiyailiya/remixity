// Live preview. Uses the browser's playbackRate for instant response; the
// export path uses a high-quality resampler instead (see render.ts).
import { buildChain, Chain, FxParams } from './chain';
import { makeImpulse } from './impulse';

export class Player {
  ctx: AudioContext;
  private chain: Chain;
  private buffer: AudioBuffer | null = null;
  private src: AudioBufferSourceNode | null = null;
  private offset = 0; // position in source seconds when last (re)started
  private startedAt = 0; // ctx time of last (re)start
  private ratio = 1;
  private irKey = '';
  playing = false;
  onEnded: () => void = () => {};

  constructor(params: FxParams) {
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.chain = buildChain(this.ctx, params);
    this.chain.output.connect(this.ctx.destination);
    this.setParams(params);
  }

  load(buffer: AudioBuffer) {
    this.stopSource();
    this.buffer = buffer;
    this.offset = 0;
    this.playing = false;
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  /** Current position in source seconds. */
  get position() {
    if (!this.playing) return this.offset;
    const p = this.offset + (this.ctx.currentTime - this.startedAt) * this.ratio;
    return Math.min(p, this.duration);
  }

  async play() {
    if (!this.buffer) return;
    await this.ctx.resume();
    if (this.offset >= this.duration - 0.01) this.offset = 0;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.ratio;
    src.connect(this.chain.input);
    src.onended = () => {
      if (this.src !== src) return;
      this.offset = this.duration;
      this.playing = false;
      this.src = null;
      this.onEnded();
    };
    src.start(0, this.offset);
    this.src = src;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.position;
    this.stopSource();
    this.playing = false;
  }

  seek(seconds: number) {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) void this.play();
  }

  setParams(p: FxParams) {
    if (p.ratio !== this.ratio) {
      // Rebase the clock so the position stays correct across speed changes.
      this.offset = this.position;
      this.startedAt = this.ctx.currentTime;
      this.ratio = p.ratio;
      this.src?.playbackRate.setValueAtTime(p.ratio, this.ctx.currentTime);
    }
    this.chain.set(p);
    const key = `${p.decay.toFixed(2)}|${p.tone.toFixed(2)}`;
    if (key !== this.irKey) {
      this.irKey = key;
      // Regenerating the impulse is the slow part, so wait until a slider
      // drag settles. The first one is built right away.
      clearTimeout(this.irTimer);
      const build = () => this.chain.setImpulse(makeImpulse(this.ctx, p.decay, p.tone));
      if (this.irTimer === 0) build();
      else this.irTimer = window.setTimeout(build, 80);
      if (this.irTimer === 0) this.irTimer = -1;
    }
  }

  private irTimer = 0;

  private stopSource() {
    if (this.src) {
      const s = this.src;
      this.src = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
  }
}
