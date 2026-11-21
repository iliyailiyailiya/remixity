// Heavy lifting off the main thread: band-limited resampling for export and
// MP3 encoding.
import { Mp3Encoder } from '@breezystack/lamejs';

type Req =
  | { id: number; kind: 'resample'; channels: Float32Array[]; step: number; outLength: number }
  | { id: number; kind: 'mp3'; channels: Float32Array[]; sampleRate: number; kbps: number };

const post = (msg: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    if (req.kind === 'resample') {
      const out = resample(req.channels, req.step, req.outLength, (p) =>
        post({ id: req.id, progress: p }),
      );
      post({ id: req.id, result: out }, out.map((c) => c.buffer));
    } else {
      const bytes = encodeMp3(req.channels, req.sampleRate, req.kbps, (p) =>
        post({ id: req.id, progress: p }),
      );
      post({ id: req.id, result: bytes });
    }
  } catch (err) {
    post({ id: req.id, error: String(err) });
  }
};

// ---------- Windowed-sinc resampler ----------
// The browser's own playbackRate uses cheap interpolation that aliases. For
// export we resample properly: a Kaiser-windowed sinc kernel (about -86 dB
// stopband) with the cutoff lowered when speeding up, so nothing folds back.

function besselI0(x: number) {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

const PHASES = 4096;
const HALF_TAPS = 24;
const BETA = 8.6;

function buildTable(step: number) {
  const fc = Math.min(1, 1 / step) * 0.97; // cutoff as fraction of Nyquist
  const half = Math.ceil(HALF_TAPS / Math.min(1, 1 / step));
  const taps = half * 2;
  const table = new Float32Array((PHASES + 1) * taps);
  const i0b = besselI0(BETA);
  for (let p = 0; p <= PHASES; p++) {
    const frac = p / PHASES;
    for (let k = 0; k < taps; k++) {
      const x = k - half + 1 - frac; // distance in input samples
      const r = x / half;
      const w = Math.abs(r) >= 1 ? 0 : besselI0(BETA * Math.sqrt(1 - r * r)) / i0b;
      const s = x === 0 ? 1 : Math.sin(Math.PI * fc * x) / (Math.PI * fc * x);
      table[p * taps + k] = fc * s * w;
    }
  }
  return { table, half, taps };
}

function resample(
  channels: Float32Array[],
  step: number,
  outLength: number,
  onProgress: (p: number) => void,
): Float32Array[] {
  const { table, half, taps } = buildTable(step);
  const out: Float32Array[] = [];
  const total = channels.length * outLength;
  let done = 0;
  for (const input of channels) {
    const n = input.length;
    const o = new Float32Array(outLength);
    for (let j = 0; j < outLength; j++) {
      const pos = j * step;
      const i = Math.floor(pos);
      const p = Math.round((pos - i) * PHASES);
      const base = p * taps;
      const start = i - half + 1;
      let acc = 0;
      if (start >= 0 && start + taps <= n) {
        for (let k = 0; k < taps; k++) acc += input[start + k] * table[base + k];
      } else {
        for (let k = 0; k < taps; k++) {
          const idx = start + k;
          if (idx >= 0 && idx < n) acc += input[idx] * table[base + k];
        }
      }
      o[j] = acc;
      if ((j & 0xffff) === 0) onProgress((done + j) / total);
    }
    done += outLength;
    out.push(o);
  }
  onProgress(1);
  return out;
}

// ---------- MP3 ----------

function toInt16Dithered(f: Float32Array): Int16Array {
  // TPDF dither: we are dropping to 16 bits, so decorrelate the rounding error.
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const d = Math.random() - Math.random();
    let v = Math.round(f[i] * 32767 + d);
    if (v > 32767) v = 32767;
    else if (v < -32768) v = -32768;
    out[i] = v;
  }
  return out;
}

function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  kbps: number,
  onProgress: (p: number) => void,
): Uint8Array {
  const stereo = channels.length > 1;
  const left = toInt16Dithered(channels[0]);
  const right = stereo ? toInt16Dithered(channels[1]) : undefined;
  const enc = new Mp3Encoder(stereo ? 2 : 1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const block = 1152 * 16;
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const buf = right ? enc.encodeBuffer(l, right.subarray(i, i + block)) : enc.encodeBuffer(l);
    if (buf.length) parts.push(buf.slice());
    if ((i / block) % 20 === 0) onProgress(i / left.length);
  }
  const end = enc.flush();
  if (end.length) parts.push(end.slice());
  const size = parts.reduce((s, p) => s + p.length, 0);
  const bytes = new Uint8Array(size);
  let off = 0;
  for (const p of parts) {
    bytes.set(p, off);
    off += p.length;
  }
  onProgress(1);
  return bytes;
}
