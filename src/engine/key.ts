// Musical key detection, shown the way DJs read it (Camelot: 8A, 9B …), so
// you can tell which songs mix well together.
//
// The song (up to 90 s from its middle) is mixed to mono at 11 025 Hz; each
// 4096-sample frame's spectrum is folded into 12 pitch classes (a chroma),
// summed over the song, and compared with the Krumhansl–Schmuckler profiles
// for the 24 major and minor keys. The best match wins.

const RATE = 11025;
const N = 4096;

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// Camelot numbers for C, C♯ … B: major (B) and minor (A).
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

export interface Key {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  minor: boolean;
}

/** In-place radix-2 FFT (re, im of length N). */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function correlate(a: number[], b: number[]) {
  const ma = a.reduce((s, x) => s + x, 0) / 12;
  const mb = b.reduce((s, x) => s + x, 0) / 12;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

export async function detectKey(buffer: AudioBuffer): Promise<Key | null> {
  const span = Math.min(90, buffer.duration);
  const from = Math.max(0, (buffer.duration - span) / 2);
  const length = Math.floor(span * RATE);
  if (length < N * 4) return null;
  const ctx = new OfflineAudioContext(1, length, RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start(0, from, span);
  const mono = (await ctx.startRendering()).getChannelData(0);

  // Which pitch class each FFT bin belongs to (55 Hz … 2 kHz), and a window.
  const pc = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = (k * RATE) / N;
    if (f < 55 || f > 2000) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    pc[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const chroma = new Array(12).fill(0);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let at = 0; at + N <= mono.length; at += N) {
    for (let i = 0; i < N; i++) {
      re[i] = mono[at + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const frame = new Array(12).fill(0);
    let total = 0;
    for (let k = 1; k < N / 2; k++) {
      if (pc[k] < 0) continue;
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      frame[pc[k]] += m;
      total += m;
    }
    if (total < 1e-3) continue; // silence
    for (let i = 0; i < 12; i++) chroma[i] += frame[i] / total; // each frame counts the same
  }
  if (chroma.every((x) => x === 0)) return null;

  let best: Key & { r: number } = { tonic: 0, minor: false, r: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = chroma.map((_, i) => chroma[(i + tonic) % 12]);
    const rMaj = correlate(rotated, MAJOR);
    const rMin = correlate(rotated, MINOR);
    if (rMaj > best.r) best = { tonic, minor: false, r: rMaj };
    if (rMin > best.r) best = { tonic, minor: true, r: rMin };
  }
  return { tonic: best.tonic, minor: best.minor };
}

/** The key you hear when the song plays `semitones` higher (speed without keep pitch). */
export function shiftKey(k: Key, semitones: number): Key {
  return { tonic: (((k.tonic + Math.round(semitones)) % 12) + 12) % 12, minor: k.minor };
}

/** Semitones a playback speed moves the pitch (vinyl style). */
export const semitonesOf = (ratio: number) => 12 * Math.log2(ratio);

export function camelot(k: Key): string {
  return `${(k.minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[k.tonic]}${k.minor ? 'A' : 'B'}`;
}

export function keyName(k: Key): string {
  return `${NAMES[k.tonic]}${k.minor ? 'm' : ''}`;
}

/**
 * How well two keys mix (the Camelot wheel): same key or a neighbour
 * (±1, or the relative major/minor) = 'match'; two steps = 'ok'; else 'clash'.
 */
export function harmony(a: Key, b: Key): 'match' | 'ok' | 'clash' {
  const na = (a.minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[a.tonic];
  const nb = (b.minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[b.tonic];
  const d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  if (a.minor === b.minor ? d <= 1 : d === 0) return 'match';
  if (a.minor === b.minor ? d <= 2 : d <= 1) return 'ok';
  return 'clash';
}
