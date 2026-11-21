// The effect chain. The same function builds the live preview graph and the
// offline export graph, so what you hear is what you export.
//
// input (-3 dB headroom) → 24 dB/oct high-pass @ 25 Hz → low cut → high cut
//   → bass shelf → 4-band EQ → saturation (4x oversampled)
//   ├─ dry ─────────────────────────┐
//   ├─ convolver → reverb wet ──────┤
//   └─ delay ⟲ feedback → delay wet ┴→ master volume → limiter → output

export interface FxParams {
  ratio: number; // playback speed; repitch, so pitch follows speed
  reverbMix: number; // 0..1
  decay: number; // reverb RT60 in seconds
  tone: number; // 0 = dark, 1 = bright
  bass: number; // dB
  volume: number; // dB
  lowCut: number; // Hz, 20 = off
  highCut: number; // Hz, 20000 = off
  eqLow: number; // dB @ 250 Hz
  eqMid: number; // dB @ 1 kHz
  eqHigh: number; // dB @ 4 kHz
  eqAir: number; // dB, shelf @ 12 kHz
  drive: number; // saturation 0..1
  delayMix: number; // 0..1
  delayTime: number; // seconds
  delayFeedback: number; // 0..0.85
}

export const DEFAULT_PARAMS: FxParams = {
  ratio: 1,
  reverbMix: 0,
  decay: 2.5,
  tone: 0.5,
  bass: 0,
  volume: 0,
  lowCut: 20,
  highCut: 20000,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  eqAir: 0,
  drive: 0,
  delayMix: 0,
  delayTime: 0.375,
  delayFeedback: 0.35,
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

/** How long the delay keeps ringing after the input stops (to -60 dB). */
export function delayTail(p: FxParams) {
  if (p.delayMix <= 0) return 0;
  const fb = Math.max(0.01, Math.min(0.85, p.delayFeedback));
  return Math.min(12, p.delayTime * (Math.log(0.001) / Math.log(fb) + 1));
}

// tanh soft clipper. The shaper's input is pre-scaled by 0.5 (and the output
// scaled back by 2) so the curve covers ±2 of headroom for EQ boosts. The
// curve's slope at zero is 1, so quiet signals pass at unity gain and the
// drive knob adds grit rather than loudness.
function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = 1 + drive * 7;
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * 2 * x) / (2 * k); // slope 1 at 0 after the ×0.5 / ×2 gain pair
  }
  return curve;
}

export function buildChain(ctx: BaseAudioContext, p: FxParams): Chain {
  const biquad = (type: BiquadFilterType, freq: number, q = 0.7071) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };

  const input = ctx.createGain();
  input.gain.value = dbToGain(HEADROOM_DB);

  // Two biquads with Butterworth Q values make a 24 dB/oct high-pass that
  // clears out sub-sonic rumble before any boost, saturation or reverb.
  const hp1 = biquad('highpass', 25, 0.5412);
  const hp2 = biquad('highpass', 25, 1.3066);
  const lowCut = biquad('highpass', p.lowCut);
  const highCut = biquad('lowpass', Math.min(p.highCut, ctx.sampleRate / 2 - 100));

  const bass = biquad('lowshelf', 110);
  const eqLow = biquad('peaking', 250, 0.9);
  const eqMid = biquad('peaking', 1000, 0.9);
  const eqHigh = biquad('peaking', 4000, 0.9);
  const eqAir = biquad('highshelf', 12000);

  const satIn = ctx.createGain();
  satIn.gain.value = 0.5;
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x'; // keeps the harmonics it adds from aliasing
  const satOut = ctx.createGain();
  satOut.gain.value = 2;

  const dry = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  const wet = ctx.createGain();

  const delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  const delayDamp = biquad('lowpass', 4500); // each repeat gets darker
  const delayWet = ctx.createGain();

  const master = ctx.createGain();

  // A fast, hard-knee compressor near 0 dBFS works as a limiter. The export
  // path adds a final peak check on top of this (see render.ts).
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = CEILING_DB - 1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  input
    .connect(hp1)
    .connect(hp2)
    .connect(lowCut)
    .connect(highCut)
    .connect(bass)
    .connect(eqLow)
    .connect(eqMid)
    .connect(eqHigh)
    .connect(eqAir)
    .connect(satIn)
    .connect(shaper)
    .connect(satOut);
  satOut.connect(dry).connect(master);
  satOut.connect(convolver).connect(wet).connect(master);
  satOut.connect(delay);
  delay.connect(delayDamp).connect(feedback).connect(delay);
  delayDamp.connect(delayWet).connect(master);
  master.connect(limiter);

  let lastDrive = -1;
  const setDrive = (d: number) => {
    if (d === lastDrive) return;
    lastDrive = d;
    // A null curve is a true bypass: no colouring at all when drive is off.
    shaper.curve = d > 0 ? saturationCurve(d) : null;
  };

  const values = (q: FxParams): [AudioParam, number][] => [
    [lowCut.frequency, q.lowCut],
    [highCut.frequency, Math.min(q.highCut, ctx.sampleRate / 2 - 100)],
    [bass.gain, q.bass],
    [eqLow.gain, q.eqLow],
    [eqMid.gain, q.eqMid],
    [eqHigh.gain, q.eqHigh],
    [eqAir.gain, q.eqAir],
    // Keep the dry signal strong; slowed+reverb lives on a wet tail on top.
    [dry.gain, 1 - q.reverbMix * 0.45],
    [wet.gain, q.reverbMix * 1.1],
    [delay.delayTime, q.delayTime],
    [feedback.gain, Math.min(0.85, q.delayFeedback)],
    [delayWet.gain, q.delayMix * 0.8],
    [master.gain, dbToGain(q.volume)],
  ];

  // Offline contexts render from t=0, so set values directly there.
  for (const [param, v] of values(p)) param.value = v;
  setDrive(p.drive);

  return {
    input,
    output: limiter,
    set(q) {
      const t = ctx.currentTime;
      for (const [param, v] of values(q)) param.setTargetAtTime(v, t, 0.02);
      setDrive(q.drive);
    },
    setImpulse(ir) {
      convolver.buffer = ir;
    },
  };
}
