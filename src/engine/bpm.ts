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
