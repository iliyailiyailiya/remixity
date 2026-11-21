// The effect chain. The same function builds the live preview graph and the
// offline export graph, so what you hear is what you export.
//
// input (-3 dB headroom) → 4th-order high-pass @ 25 Hz → bass shelf
//   ├─ dry ───────────────┐
//   └─ convolver → wet ───┴→ master volume → limiter → output

export interface FxParams {
  ratio: number; // playback speed; repitch, so pitch follows speed
  reverbMix: number; // 0..1
  decay: number; // reverb RT60 in seconds
  tone: number; // 0 = dark, 1 = bright
  bass: number; // dB
  volume: number; // dB
}

export const DEFAULT_PARAMS: FxParams = {
  ratio: 1,
  reverbMix: 0,
  decay: 2.5,
  tone: 0.5,
  bass: 0,
  volume: 0,
};

export const HEADROOM_DB = -3;
export const CEILING_DB = -1;

export const dbToGain = (db: number) => Math.pow(10, db / 20);

export interface Chain {
  input: AudioNode;
  output: AudioNode;
  set(p: FxParams): void;
  setImpulse(ir: AudioBuffer): void;
}

export function buildChain(ctx: BaseAudioContext, p: FxParams): Chain {
  const input = ctx.createGain();
  input.gain.value = dbToGain(HEADROOM_DB);

  // Two biquads with Butterworth Q values make a 24 dB/oct high-pass that
  // clears out sub-sonic rumble before the bass boost and the reverb.
  const hp1 = ctx.createBiquadFilter();
  hp1.type = 'highpass';
  hp1.frequency.value = 25;
  hp1.Q.value = 0.5412;
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.frequency.value = 25;
  hp2.Q.value = 1.3066;

  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 110;

  const dry = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  const wet = ctx.createGain();

  const master = ctx.createGain();

  // A fast, hard-knee compressor near 0 dBFS works as a limiter. The export
  // path adds a final peak check on top of this (see render.ts).
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = CEILING_DB - 1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  input.connect(hp1).connect(hp2).connect(bass);
  bass.connect(dry).connect(master);
  bass.connect(convolver).connect(wet).connect(master);
  master.connect(limiter);

  const set = (q: FxParams) => {
    const t = ctx.currentTime;
    bass.gain.setTargetAtTime(q.bass, t, 0.02);
    // Keep the dry signal strong; slowed+reverb lives on a wet tail on top.
    dry.gain.setTargetAtTime(1 - q.reverbMix * 0.45, t, 0.02);
    wet.gain.setTargetAtTime(q.reverbMix * 1.1, t, 0.02);
    master.gain.setTargetAtTime(dbToGain(q.volume), t, 0.02);
  };

  // Offline contexts render from t=0, so set values directly there.
  bass.gain.value = p.bass;
  dry.gain.value = 1 - p.reverbMix * 0.45;
  wet.gain.value = p.reverbMix * 1.1;
  master.gain.value = dbToGain(p.volume);

  return {
    input,
    output: limiter,
    set,
    setImpulse(ir) {
      convolver.buffer = ir;
    },
  };
}
