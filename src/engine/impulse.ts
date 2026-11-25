// Synthetic stereo reverb impulse responses, generated in the browser so there
// are no licensed IR files to ship. Seeded noise means the preview context and
// the export context (which may run at different sample rates) get the same
// reverb character.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeImpulse(ctx: BaseAudioContext, decay: number, tone: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const preDelay = 0.018;
  const length = Math.ceil((preDelay + decay) * sr);
  const ir = ctx.createBuffer(2, length, sr);
  const pre = Math.floor(preDelay * sr);
  const fadeIn = Math.floor(0.004 * sr);

  // High frequencies die faster than lows in real rooms: the low-pass cutoff
  // slides from bright to dark over the tail.
  const startHz = 2500 + tone * 14000;
  const endHz = startHz * 0.12;

  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    const rand = mulberry32(0x5eed + c * 7919);
    let y1 = 0;
    let y2 = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sr;
      const k = t / decay;
      const fc = startHz * Math.pow(endHz / startHz, k);
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      const n = rand() * 2 - 1;
      y1 = (1 - a) * n + a * y1;
      y2 = (1 - a) * y1 + a * y2;
      const env = Math.exp((-6.9078 * t) / decay); // -60 dB at t = decay
      const fade = i - pre < fadeIn ? (i - pre) / fadeIn : 1;
      data[i] = y2 * env * fade;
    }
  }
  return ir;
}

/**
 * Room settings rounded to steps you can't hear apart (4% of size, 0.05 of
 * tone), so automating them rebuilds the impulse only when it matters.
 */
export function roomStep(decay: number, tone: number): [number, number] {
  return [Math.exp(Math.round(Math.log(decay) / 0.04) * 0.04), Math.round(tone * 20) / 20];
}
