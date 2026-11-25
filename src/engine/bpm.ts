// Tempo detection, entirely in the browser.
//
// 1. Render up to 60 s of the track as mono at a low sample rate.
// 2. Build an onset envelope: rises in short-term log energy, with the local
//    average removed so steady sound doesn't count.
// 3. Autocorrelate the envelope over beat periods for 60-200 BPM and pick the
//    strongest, nudged toward common tempos and checked against half/double.

const RATE = 11025;
const HOP = 128; // ~86 envelope frames per second
const FPS = RATE / HOP;

export async function detectBpm(buffer: AudioBuffer): Promise<number | null> {
  const span = Math.min(60, buffer.duration);
  if (span < 6) return null;
  // Skip the intro when the track is long enough; intros are often beatless.
  const start = buffer.duration > 90 ? Math.min(30, buffer.duration * 0.2) : 0;

  const length = Math.floor(span * RATE);
  const ctx = new OfflineAudioContext(1, length, RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Emphasise kick/snare territory a little; hats alone are a weak signal.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500;
  src.connect(lp).connect(ctx.destination);
  src.start(0, start, span);
  const mono = (await ctx.startRendering()).getChannelData(0);

  // Onset envelope
  const frames = Math.floor(mono.length / HOP);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * HOP, e = i + HOP; i < e; i++) s += mono[i] * mono[i];
    energy[f] = Math.log(1e-9 + s / HOP);
  }
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
  // Subtract a moving average (~0.4 s) so only sharp rises remain.
  const win = Math.round(FPS * 0.4);
  const onset = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += flux[f];
    if (f >= win) acc -= flux[f - win];
    onset[f] = Math.max(0, flux[f] - acc / Math.min(f + 1, win));
  }

  // Autocorrelation over beat periods
  const minLag = Math.floor((60 / 200) * FPS);
  const maxLag = Math.ceil((60 / 60) * FPS);
  const ac = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f] * onset[f - lag];
    ac[lag] = s / (frames - lag);
  }

  // Score each tempo: its own peak plus support from the bar-level multiple,
  // weighted toward the 90-140 BPM range most songs sit in.
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * FPS) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.75, 2));
    const double = 2 * lag <= maxLag + 1 ? ac[2 * lag] : 0;
    const score = (ac[lag] + 0.5 * double) * prior;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return null;

  // Parabolic interpolation for sub-frame accuracy
  const y0 = ac[bestLag - 1];
  const y1 = ac[bestLag];
  const y2 = ac[bestLag + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
  let bpm = (60 * FPS) / (bestLag + shift);

  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

// ---------- beat grid ----------

/** Onset envelope (as above) of a mono signal at RATE. */
function onsetEnvelope(mono: Float32Array): Float32Array {
  const frames = Math.floor(mono.length / HOP);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * HOP, e = i + HOP; i < e; i++) s += mono[i] * mono[i];
    energy[f] = Math.log(1e-9 + s / HOP);
  }
  const win = Math.round(FPS * 0.4);
  const onset = new Float32Array(frames);
  let acc = 0;
  let prev = energy[0] ?? 0;
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    flux[f] = Math.max(0, energy[f] - prev);
    prev = energy[f];
  }
  for (let f = 0; f < frames; f++) {
    acc += flux[f];
    if (f >= win) acc -= flux[f - win];
    onset[f] = Math.max(0, flux[f] - acc / Math.min(f + 1, win));
  }
  return onset;
}

const at = (env: Float32Array, x: number) => {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  const k = x - i;
  return env[i] * (1 - k) + env[i + 1] * k;
};

export interface BeatGrid {
  /** One beat, in seconds (refined over the whole song). */
  beat: number;
  /** Where a bar starts (beat 1), in seconds, within [0, 4 beats). */
  offset: number;
}

/**
 * Lay a 4/4 grid over the song. The tempo is refined around `bpm` (±1.5 BPM,
 * so the grid doesn't drift over a long song) together with the beat phase:
 * the pair whose beats land on the most onsets wins. Beat 1 of the bar is
 * the phase where the low end (the kick) hits hardest.
 */
export async function detectGrid(buffer: AudioBuffer, bpm: number): Promise<BeatGrid> {
  const length = Math.max(1, Math.floor(buffer.duration * RATE));
  const ctx = new OfflineAudioContext(2, length, RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const merge = ctx.createChannelMerger(2);
  const mid = ctx.createBiquadFilter();
  mid.type = 'lowpass';
  mid.frequency.value = 2500;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 150;
  src.connect(mid).connect(merge, 0, 0);
  src.connect(low).connect(merge, 0, 1);
  merge.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  const env = onsetEnvelope(out.getChannelData(0));
  const kick = onsetEnvelope(out.getChannelData(1));

  // Coarse then fine: the detected BPM can be off by a beat or so a minute,
  // which over a whole song puts the grid a beat out by the end.
  let best = { score: -1, period: (60 / bpm) * FPS, phase: 0 };
  const search = (lo: number, hi: number, step: number, phaseStep: number) => {
    for (let b = lo; b <= hi + 1e-9; b += step) {
      const period = (60 / b) * FPS;
      for (let phase = 0; phase < period; phase += phaseStep) {
        let s = 0;
        for (let x = phase; x < env.length - 1; x += period) s += at(env, x);
        if (s > best.score) best = { score: s, period, phase };
      }
    }
  };
  search(bpm - 1.5, bpm + 1.5, 0.05, 0.5);
  const coarse = (60 * FPS) / best.period;
  search(coarse - 0.06, coarse + 0.06, 0.005, 0.25);
  const { period, phase } = best;
  let bestJ = 0;
  let bestKick = -1;
  for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let x = phase + j * period; x < kick.length - 1; x += 4 * period) s += at(kick, x);
    if (s > bestKick) {
      bestKick = s;
      bestJ = j;
    }
  }
  const beat = period / FPS;
  // An onset frame starts up to a frame before the hit itself: half a frame
  // later is where it lands on average (measured: −6 ms without this).
  const late = HOP / 2 / RATE;
  return { beat, offset: ((phase + bestJ * period) / FPS + late) % (4 * beat) };
}
