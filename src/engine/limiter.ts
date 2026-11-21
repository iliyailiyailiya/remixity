// Look-ahead peak limiter.
//
// The browser's DynamicsCompressorNode reacts within a few milliseconds,
// which bends low-frequency waveforms and sounds dirty on loud, bassy songs.
// This limiter looks 8 ms ahead, so it can lower the gain smoothly *before*
// a peak arrives, and recovers slowly afterwards. The gain curve moves far
// slower than the audio, so it does not distort the waveform.
//
// Per sample:
//   req[i]  = gain needed so that sample i stays under the ceiling (≤ 1)
//   hold[i] = min(req[i .. i+L-1])                 (look ahead L samples)
//   env[i]  = min(hold[i], env[i-1] recovering toward 1)   (release)
//   g[i]    = mean(env[i-L+1 .. i])                 (smooth attack)
// Every env value averaged into g[i] looked ahead far enough to see sample
// i, so g[i] <= req[i]: no sample can exceed the ceiling, with no delay.

export const LOOKAHEAD_MS = 8;
export const RELEASE_MS = 200;

/** Limit in place (channels are linked). Returns the deepest gain reduction in dB. */
export function limit(channels: Float32Array[], sampleRate: number, ceilingDb: number): number {
  const n = channels[0].length;
  if (n === 0) return 0;
  const ceiling = Math.pow(10, ceilingDb / 20);
  const L = Math.max(1, Math.round((LOOKAHEAD_MS * sampleRate) / 1000));
  const rel = 1 - Math.exp(-1 / ((RELEASE_MS * sampleRate) / 1000));

  const req = new Float32Array(n);
  let anyOver = false;
  for (let i = 0; i < n; i++) {
    let peak = 0;
    for (const ch of channels) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
    }
    if (peak > ceiling) {
      req[i] = ceiling / peak;
      anyOver = true;
    } else req[i] = 1;
  }
  if (!anyOver) return 0;

  // hold[i] = min(req[i .. i+L-1]) via a monotonic deque, scanning backwards.
  const hold = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && req[dq[tail - 1]] >= req[i]) tail--;
    dq[tail++] = i;
    if (dq[head] > i + L - 1) head++;
    hold[i] = req[dq[head]];
  }

  // Release, then a moving average of length L for a smooth attack.
  const ring = new Float32Array(L);
  let sum = 0;
  let count = 0;
  let env = 1;
  let minGain = 1;
  for (let i = 0; i < n; i++) {
    env = Math.min(hold[i], env + (1 - env) * rel);
    const slot = i % L;
    if (count === L) sum -= ring[slot];
    else count++;
    ring[slot] = env;
    sum += env;
    const g = sum / count;
    if (g < minGain) minGain = g;
    for (const ch of channels) {
      // The clamp only catches floating-point rounding at the ceiling.
      const v = ch[i] * g;
      ch[i] = v > ceiling ? ceiling : v < -ceiling ? -ceiling : v;
    }
  }
  return 20 * Math.log10(minGain);
}

/**
 * The same limiter as an AudioWorklet for live playback. It delays the audio
 * by the look-ahead (8 ms, unnoticeable) instead of reading ahead.
 * Kept as a string so it loads from a Blob URL in dev and production alike.
 */
export const LIMITER_WORKLET = `
class RemixityLimiter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.ceiling = Math.pow(10, (o.ceilingDb ?? -1) / 20);
    this.L = Math.max(1, Math.round(${LOOKAHEAD_MS} * sampleRate / 1000));
    this.rel = 1 - Math.exp(-1 / (${RELEASE_MS} * sampleRate / 1000));
    this.req = new Float32Array(this.L);   // last L required gains
    this.envRing = new Float32Array(this.L);
    this.delay = [new Float32Array(this.L), new Float32Array(this.L)];
    this.pos = 0;
    this.sum = 0;
    this.count = 0;
    this.env = 1;
    this.req.fill(1);
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const frames = output[0].length;
    const L = this.L;
    const chIn = [input[0] || null, input[1] || input[0] || null];
    for (let k = 0; k < frames; k++) {
      const a = chIn[0] ? chIn[0][k] : 0;
      const b = chIn[1] ? chIn[1][k] : 0;
      const peak = Math.max(Math.abs(a), Math.abs(b));
      const slot = this.pos;
      this.delay[0][slot] = a;
      this.delay[1][slot] = b;
      this.req[slot] = peak > this.ceiling ? this.ceiling / peak : 1;
      // Output the oldest sample still inside the look-ahead window, so every
      // gain value averaged below has already seen it.
      const old = (slot + 1) % L;
      const outA = this.delay[0][old];
      const outB = this.delay[1][old];
      // Lowest gain needed anywhere in the next L samples of output.
      let hold = 1;
      const r = this.req;
      for (let j = 0; j < L; j++) if (r[j] < hold) hold = r[j];
      this.env = Math.min(hold, this.env + (1 - this.env) * this.rel);
      if (this.count === L) this.sum -= this.envRing[slot];
      else this.count++;
      this.envRing[slot] = this.env;
      this.sum += this.env;
      const g = this.sum / this.count;
      const c = this.ceiling;
      const ya = outA * g;
      const yb = outB * g;
      output[0][k] = ya > c ? c : ya < -c ? -c : ya;
      if (output[1]) output[1][k] = yb > c ? c : yb < -c ? -c : yb;
      this.pos = (slot + 1) % L;
    }
    return true;
  }
}
registerProcessor('remixity-limiter', RemixityLimiter);
`;
