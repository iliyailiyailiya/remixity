// Live preview. Uses the browser's playbackRate for instant response (speed
// and pitch change together, like vinyl); the export path uses a
// high-quality resampler instead (see render.ts). With "keep pitch" on, the
// song plays through Signalsmith Stretch (WASM, loaded on first use), which
// changes speed without changing pitch.
import { buildChain, CEILING_DB, Chain, FxParams } from './chain';
import { makeImpulse } from './impulse';
import { LIMITER_WORKLET } from './limiter';

/** The parts of Signalsmith Stretch's node we use. */
export type StretchNode = AudioWorkletNode & {
  addBuffers(channels: Float32Array[], transfer?: Transferable[]): Promise<number>;
  dropBuffers(): Promise<unknown>;
  schedule(change: Record<string, number | boolean>): Promise<unknown>;
};

export async function createStretch(ctx: BaseAudioContext): Promise<StretchNode> {
  const { default: SignalsmithStretch } = await import('signalsmith-stretch');
  // If its audio-thread code fails to start, it would wait forever: give up.
  return (await Promise.race([
    SignalsmithStretch(ctx),
    new Promise<never>((_, fail) => setTimeout(() => fail(new Error('keep pitch failed to start')), 8000)),
  ])) as StretchNode;
}

/** Copies of a buffer's channels as stereo, ready to hand over (transfer) to the stretcher. */
export function stereoCopies(buffer: AudioBuffer): Float32Array<ArrayBuffer>[] {
  const l = buffer.getChannelData(0).slice();
  const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : l.slice();
  return [l, r];
}

export class Player {
  ctx: AudioContext;
  private chain: Chain;
  private buffer: AudioBuffer | null = null;
  private src: AudioBufferSourceNode | null = null;
  private offset = 0; // position in source seconds when last (re)started
  // Seconds of playback since the last (re)start. Counted with the system
  // clock while the audio engine runs, not with ctx.currentTime: on iOS
  // Safari that clock can stall (e.g. after the audio route changes)
  // while the sound keeps playing, which froze the timeline.
  private elapsed = 0;
  private wallLast = 0;
  private ratio = 1;
  private irKey = '';
  // Keep-pitch playback
  private keepPitch = false;
  private stretch: StretchNode | null = null;
  private stretchLoading: Promise<StretchNode | null> | null = null;
  private stretchHas: AudioBuffer | null = null; // which song the stretcher holds
  private stretchRunning = false;
  private startToken = 0; // ignores a stretched start that's no longer wanted
  private endTimer = 0;
  private waitingForStretch = false;
  playing = false;
  /** What you hear, for the EQ's spectrum display. */
  analyser: AnalyserNode;
  onEnded: () => void = () => {};
  onInterrupted: () => void = () => {};

  constructor(params: FxParams) {
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.chain = buildChain(this.ctx, params);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.75;
    this.chain.output.connect(this.analyser);
    // If the system takes the audio away (a call, Siri, another app),
    // pause properly so the play button and timeline stay truthful.
    this.ctx.addEventListener('statechange', () => {
      const st = this.ctx.state as string;
      if (this.playing && (st === 'suspended' || st === 'interrupted')) {
        this.pause();
        this.onInterrupted();
      }
    });

    // Until the look-ahead limiter worklet has loaded (or if the browser
    // can't run it), a gentle compressor keeps playback from clipping.
    const fallback = this.ctx.createDynamicsCompressor();
    fallback.threshold.value = CEILING_DB - 2;
    fallback.knee.value = 6;
    fallback.ratio.value = 12;
    fallback.attack.value = 0.005;
    fallback.release.value = 0.25;
    this.chain.output.connect(fallback).connect(this.ctx.destination);
    void this.useWorkletLimiter(fallback);

    this.setParams(params);
  }

  private async useWorkletLimiter(fallback: AudioNode) {
    try {
      const url = URL.createObjectURL(new Blob([LIMITER_WORKLET], { type: 'text/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(this.ctx, 'remixity-limiter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        processorOptions: { ceilingDb: CEILING_DB },
      });
      node.connect(this.ctx.destination);
      this.chain.output.connect(node);
      this.chain.output.disconnect(fallback);
      fallback.disconnect();
      this.limiter = 'worklet';
    } catch (err) {
      console.warn('limiter worklet unavailable, using compressor', err);
    }
  }

  /** Which limiter live playback uses (for diagnostics). */
  limiter: 'compressor' | 'worklet' = 'compressor';

  /** Swap in a new buffer. keepAt keeps (and clamps) the given position. */
  load(buffer: AudioBuffer, keepAt?: number) {
    const wasPlaying = this.playing && keepAt !== undefined;
    this.stopSource();
    this.buffer = buffer;
    this.playing = false;
    this.offset = keepAt !== undefined ? Math.min(Math.max(0, keepAt), buffer.duration) : 0;
    if (this.loop && this.loop[1] > buffer.duration) this.loop = null;
    if (wasPlaying) this.play();
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  private loop: [number, number] | null = null;
  private repeatAll = false;

  get repeating() {
    return this.repeatAll;
  }

  /** Repeat the whole track, gaplessly. A chop loop region still wins. */
  setRepeat(on: boolean) {
    this.repeatAll = on;
    if (this.playing) this.seek(this.position);
  }

  /** The region the source loops over right now, if any. */
  private loopRegion(): [number, number] | null {
    if (this.loop) return this.loop;
    if (this.repeatAll && this.duration > 0.05) return [0, this.duration];
    return null;
  }

  get looping() {
    return this.loop !== null;
  }

  /** Loop a region (buffer seconds) during playback, or pass null to stop looping. */
  setLoop(region: [number, number] | null) {
    this.loop = region && region[1] - region[0] > 0.02 ? region : null;
    if (this.playing) this.seek(this.position);
  }

  private restartClock() {
    this.elapsed = 0;
    this.wallLast = performance.now();
  }

  /** Playback seconds since the last restart (only while audio is running). */
  private clock() {
    const now = performance.now();
    if (this.ctx.state === 'running') this.elapsed += (now - this.wallLast) / 1000;
    this.wallLast = now;
    return this.elapsed;
  }

  /** Current position in source seconds. */
  get position() {
    if (!this.playing || this.waitingForStretch) return this.offset;
    let p = this.offset + this.clock() * this.ratio;
    const region = this.loopRegion();
    if (region) {
      const [a, b] = region;
      if (p >= b) p = a + ((p - a) % (b - a));
    }
    return Math.min(p, this.duration);
  }

  /**
   * Start playback. Synchronous on purpose: the old version awaited
   * ctx.resume() first, so a quick second tap (or a seek) could start a
   * second source that pause() no longer knew about.
   */
  play() {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (this.offset >= this.duration - 0.01) this.offset = 0;
    if (this.keepPitch) {
      this.playStretched();
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    const region = this.loopRegion();
    if (region) {
      const [a, b] = region;
      if (this.offset < a || this.offset >= b) this.offset = a;
      src.loop = true;
      src.loopStart = a;
      src.loopEnd = b;
    }
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
    this.restartClock();
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.position;
    this.stopSource();
    this.stopStretch();
    this.playing = false;
  }

  // ---------- keep pitch ----------

  /** Load the stretcher once, connected into the effect chain. */
  private loadStretch(): Promise<StretchNode | null> {
    this.stretchLoading ??= createStretch(this.ctx).then(
      (node) => {
        node.connect(this.chain.input);
        this.stretch = node;
        return node;
      },
      (err) => {
        console.warn('keep pitch unavailable', err);
        this.stretchLoading = null;
        return null;
      },
    );
    return this.stretchLoading;
  }

  /** Start playing through the stretcher (async: it may need loading first). */
  private playStretched() {
    const token = ++this.startToken;
    this.playing = true;
    this.waitingForStretch = true;
    void (async () => {
      const node = await this.loadStretch();
      if (token !== this.startToken || !this.playing || !this.buffer) return;
      if (!node) {
        // Couldn't load it: fall back to normal (vinyl-style) playback.
        this.keepPitch = false;
        this.playing = false;
        this.waitingForStretch = false;
        this.play();
        return;
      }
      if (this.stretchHas !== this.buffer) {
        const channels = stereoCopies(this.buffer);
        await node.dropBuffers();
        await node.addBuffers(channels, channels.map((c) => c.buffer));
        this.stretchHas = this.buffer;
        if (token !== this.startToken || !this.playing) return;
      }
      const region = this.loopRegion();
      if (region && (this.offset < region[0] || this.offset >= region[1])) this.offset = region[0];
      void node.schedule({
        active: true,
        input: this.offset,
        rate: this.ratio,
        semitones: 0,
        loopStart: region ? region[0] : 0,
        loopEnd: region ? region[1] : 0,
        output: this.ctx.currentTime,
      });
      this.stretchRunning = true;
      this.waitingForStretch = false;
      this.restartClock();
      // The stretcher has no "ended" event: watch for the end ourselves.
      clearInterval(this.endTimer);
      this.endTimer = window.setInterval(() => {
        if (!this.playing || this.loopRegion() || this.position < this.duration - 0.02) return;
        this.offset = this.duration;
        this.stopStretch();
        this.playing = false;
        this.onEnded();
      }, 150);
    })();
  }

  private stopStretch() {
    this.startToken++;
    this.waitingForStretch = false;
    clearInterval(this.endTimer);
    if (this.stretch && this.stretchRunning) void this.stretch.schedule({ active: false, output: this.ctx.currentTime });
    this.stretchRunning = false;
  }

  seek(seconds: number) {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) this.play();
  }

  setParams(p: FxParams) {
    if (p.keepPitch !== this.keepPitch) {
      // Switch engines in place, keeping the position.
      const wasPlaying = this.playing;
      this.pause();
      this.keepPitch = p.keepPitch;
      if (this.keepPitch) void this.loadStretch();
      if (wasPlaying) this.play();
    }
    if (p.ratio !== this.ratio) {
      // Rebase the clock so the position stays correct across speed changes.
      this.offset = this.position;
      this.restartClock();
      this.ratio = p.ratio;
      this.src?.playbackRate.setValueAtTime(p.ratio, this.ctx.currentTime);
      if (this.stretch && this.stretchRunning)
        void this.stretch.schedule({ rate: p.ratio, output: this.ctx.currentTime });
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
