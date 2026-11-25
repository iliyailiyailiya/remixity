// Time warp for speed automation: where each piece of the output comes from
// in the input when the speed changes over the song.
//
// The output is cut into blocks of B samples; each block plays at one speed
// (the speed at the input position where the block starts). 256 samples is
// ~5 ms, far finer than any automation curve, so the steps can't be heard.

export const WARP_BLOCK = 256;

export interface Warp {
  sr: number;
  /** Input samples consumed per output sample, per output block. */
  steps: Float32Array;
  /** Input sample position at the start of each output block (one extra at the end). */
  starts: Float64Array;
  outLength: number;
}

/** `ratioAt(inputSeconds)` gives the speed at that point of the input. */
export function makeWarp(inLength: number, sr: number, ratioAt: (t: number) => number): Warp {
  const steps: number[] = [];
  const starts: number[] = [0];
  let x = 0;
  while (x < inLength) {
    const r = Math.min(4, Math.max(0.25, ratioAt(x / sr)));
    steps.push(r);
    x += WARP_BLOCK * r;
    starts.push(x);
  }
  // The last block only partly used: trim the output to where the input ends.
  const n = steps.length;
  const lastStart = starts[n - 1];
  const lastLen = n ? Math.ceil((inLength - lastStart) / steps[n - 1]) : 0;
  return {
    sr,
    steps: Float32Array.from(steps),
    starts: Float64Array.from(starts),
    outLength: Math.max(1, (n - 1) * WARP_BLOCK + lastLen),
  };
}

/** Input seconds heard at output second `t`. */
export function inputAt(w: Warp, t: number): number {
  const o = t * w.sr;
  const b = Math.min(w.steps.length - 1, Math.max(0, Math.floor(o / WARP_BLOCK)));
  return (w.starts[b] + (o - b * WARP_BLOCK) * w.steps[b]) / w.sr;
}

/** Output second where input second `t` is heard. */
export function outputAt(w: Warp, t: number): number {
  const x = t * w.sr;
  let lo = 0;
  let hi = w.steps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (w.starts[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return (lo * WARP_BLOCK + (x - w.starts[lo]) / w.steps[lo]) / w.sr;
}
