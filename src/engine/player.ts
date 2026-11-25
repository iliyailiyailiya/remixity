// Live preview. Uses the browser's playbackRate for instant response (speed
// and pitch change together, like vinyl); the export path uses a
// high-quality resampler instead (see render.ts). With "keep pitch" on, the
// song plays through Signalsmith Stretch (WASM, loaded on first use), which
// changes speed without changing pitch.
import { buildChain, CEILING_DB, Chain, FxParams } from './chain';
import { makeImpulse, roomStep } from './impulse';
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
  // Where the current source is, in the audio engine's own time: at engine
  // time srcCtx0 it was at buffer second srcOff0 (moving at `ratio`).
  private srcCtx0 = 0;
  private srcOff0 = 0;
  /**
   * The buffer is only the start of the song (decoded first so playback can
   * begin right away); extend() swaps in the whole song. Until then, the end
   * of this buffer isn't the end of the song.
   */
  provisional = false;
  private stalled = false; // reached the end of a provisional buffer
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
  /** Playback started (by any route: button, lock screen, auto-advance). */
  onPlay: () => void = () => {};

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
    this.stalled = false;
    this.provisional = false; // (the caller marks a provisional buffer after loading it)
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
    if (this.stalled) return; // waiting for the rest of the song (extend() resumes)
    if (this.ctx.state !== 'running') void this.ctx.resume();
    this.onPlay();
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
      // Only the start of the song is decoded yet: wait for the rest.
      if (this.provisional) this.stalled = true;
      else this.onEnded();
    };
    src.start(0, this.offset);
    this.src = src;
    this.srcCtx0 = this.ctx.currentTime;
    this.srcOff0 = this.offset;
    this.restartClock();
    this.playing = true;
  }

  /**
   * Swap the provisional start of the song for the whole song, without a gap:
   * the new source picks up at the exact sample the old one reaches.
   */
  extend(buffer: AudioBuffer) {
    const old = this.src;
    const wasStalled = this.stalled;
    this.provisional = false;
    this.stalled = false;
    if (wasStalled) {
      // It ran out before the rest arrived: carry on from there.
      this.load(buffer, this.offset);
      this.play();
      return;
    }
    if (!this.playing || !old || this.keepPitch || this.waitingForStretch) {
      // Not playing a plain source: just swap, keeping the position (and playing).
      this.load(buffer, this.position);
      return;
    }
    const at = this.ctx.currentTime + 0.05;
    let offset = this.srcOff0 + (at - this.srcCtx0) * this.ratio;
    if (old.loop && old.loopEnd > old.loopStart) {
      const [a, b] = [old.loopStart, old.loopEnd];
      if (offset >= b) offset = a + ((offset - a) % (b - a));
    }
    if (offset >= (old.buffer?.duration ?? 0) - 0.08) {
      this.load(buffer, this.position);
      return;
    }
    this.buffer = buffer;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const region = this.loopRegion();
    if (region) {
      src.loop = true;
      src.loopStart = region[0];
      src.loopEnd = region[1];
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
    src.start(at, offset);
    old.onended = null;
    try {
      old.stop(at);
    } catch {
      /* already stopped */
    }
    setTimeout(() => old.disconnect(), 300);
    this.src = src;
    this.srcCtx0 = at;
    this.srcOff0 = offset;
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
    // While only the start is decoded, stay inside it (the rest comes in a moment).
    const end = this.provisional ? Math.max(0, this.duration - 0.5) : this.duration;
    this.offset = Math.max(0, Math.min(seconds, end));
    if (wasPlaying) this.play();
  }

  /**
   * Apply settings. `fromLanes` = automation is driving them (many small
   * changes a second): the speed glides instead of stepping, and the reverb
   * room is rebuilt on a steady beat instead of waiting for changes to stop.
   */
  setParams(p: FxParams, fromLanes = false) {
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
      const now = this.ctx.currentTime;
      this.srcOff0 += (now - this.srcCtx0) * this.ratio;
      this.srcCtx0 = now;
      this.ratio = p.ratio;
      const rate = this.src?.playbackRate;
      if (rate) {
        rate.cancelScheduledValues(now);
        if (fromLanes) rate.linearRampToValueAtTime(p.ratio, now + 0.04);
        else rate.setValueAtTime(p.ratio, now);
      }
      if (this.stretch && this.stretchRunning)
        void this.stretch.schedule({ rate: p.ratio, output: this.ctx.currentTime });
    }
    this.chain.set(p);
    if (fromLanes) {
      // Rounded to steps you can't hear apart, at most ~6 rebuilds a second.
      const [d, t] = roomStep(p.decay, p.tone);
      const key = `${d.toFixed(3)}|${t.toFixed(2)}`;
      const now = performance.now();
      if (key !== this.irKey && now - this.irAt > 160) {
        this.irKey = key;
        this.irAt = now;
        clearTimeout(this.irTimer);
        this.chain.setImpulse(makeImpulse(this.ctx, d, t));
      }
      return;
    }
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
  private irAt = 0;

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
