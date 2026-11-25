// Export: high-quality resample → offline render through the same chain →
// look-ahead limiter → WAV or MP3. Everything stays on the device.
import { buildChain, CEILING_DB, delayTail, FxParams, IR_FADE } from './chain';
import { makeImpulse, roomStep } from './impulse';
import { limit } from './limiter';
import { encodeMp3, resample, resampleWarp } from './dsp';
import { createStretch } from './player';
import { inputAt, makeWarp, outputAt, WARP_BLOCK, type Warp } from './warp';

export type Format = 'mp3' | 'wav16' | 'wav24';
export type Stage = 'resample' | 'render' | 'encode';

/**
 * Automation for an offline render: the settings at each second of the
 * input (counted from the start of the audio handed to the render).
 */
export interface RenderAuto {
  at(t: number): FxParams;
  /** The speed changes over time. */
  speed: boolean;
  /** Reverb size or tone change over time. */
  room: boolean;
}

/** Shift automation so input second 0 is `offset` seconds into the song. */
const shifted = (a: RenderAuto, offset: number): RenderAuto => ({ ...a, at: (t) => a.at(t + offset) });

/** How often automation values are written into the offline render. */
const AUTO_STEP = 0.025;

/**
 * Speed change + effects + limiter, in 32-bit float. With `tail`, room is
 * added for the reverb and echo to ring out. Also returns where each input
 * second ends up in the output.
 */
async function processChannels(
  channels: Float32Array<ArrayBuffer>[],
  sr: number,
  p: FxParams,
  tail: boolean,
  onProgress: (stage: Stage, fraction: number | null) => void,
  auto?: RenderAuto,
): Promise<{ out: Float32Array<ArrayBuffer>[]; outAt: (t: number) => number }> {
  const inLength = channels[0].length;
  const keepPitch = p.keepPitch;
  // 1. Change speed: repitch with a band-limited resampler (keeps the
  //    original sample rate), or with "keep pitch", time-stretch instead.
  let outAt = (t: number) => t / p.ratio;
  let inAt = (t: number) => t * p.ratio;
  if (auto?.speed) {
    const w = makeWarp(inLength, sr, (t) => auto.at(t).ratio);
    outAt = (t) => outputAt(w, t);
    inAt = (t) => inputAt(w, t);
    if (keepPitch) {
      onProgress('resample', null);
      channels = await stretchOffline(channels, sr, 1, w.outLength, w);
    } else {
      onProgress('resample', 0);
      channels = await resampleWarp(channels, w.steps, w.starts, WARP_BLOCK, w.outLength, (f) => onProgress('resample', f));
    }
  } else if (Math.abs(p.ratio - 1) >= 1e-6) {
    const outLength = Math.floor(inLength / p.ratio);
    if (keepPitch) {
      onProgress('resample', null);
      channels = await stretchOffline(channels, sr, p.ratio, outLength);
    } else {
      onProgress('resample', 0);
      channels = await resample(channels, p.ratio, outLength, (f) => onProgress('resample', f));
    }
  }

  // 2. Render effects offline in 32-bit float, adding room for the reverb and
  //    echo tails so nothing gets cut off at the end.
  onProgress('render', null);
  const start = auto ? auto.at(0) : p;
  const end = auto ? auto.at(inLength / sr) : p;
  const ring = tail ? Math.max(end.reverbMix > 0 ? end.decay : 0, delayTail(end)) + 0.1 : 0;
  const len = channels[0].length;
  const total = len + Math.ceil(ring * sr);
  const off = new OfflineAudioContext(2, total, sr);
  const src = off.createBufferSource();
  const srcBuf = off.createBuffer(channels.length, len, sr);
  channels.forEach((ch, c) => srcBuf.copyToChannel(ch, c));
  src.buffer = srcBuf;
  const chain = buildChain(off, { ...start, ratio: 1 });
  const [d0, t0] = auto?.room ? roomStep(start.decay, start.tone) : [start.decay, start.tone];
  chain.setImpulse(makeImpulse(off, d0, t0));
  if (auto) {
    // Every setting follows its lane, by where the output is in the song.
    const outSec = len / sr;
    for (let t = AUTO_STEP; t < outSec + AUTO_STEP; t += AUTO_STEP) chain.rampTo({ ...auto.at(inAt(t)), ratio: 1 }, t);
    // Reverb room changes: a new impulse, crossfaded at that moment.
    if (auto.room) {
      let key = `${d0}|${t0}`;
      let last = -1;
      const quantum = 128 / sr;
      for (let t = 0.05; t < outSec; t += 0.05) {
        if (t - last < IR_FADE + 0.03) continue;
        const q = auto.at(inAt(t));
        const [d, tn] = roomStep(q.decay, q.tone);
        const k = `${d}|${tn}`;
        if (k === key) continue;
        key = k;
        const at = Math.ceil(t / quantum) * quantum;
        last = at;
        void off.suspend(at).then(() => {
          chain.setImpulse(makeImpulse(off, d, tn), at);
          void off.resume();
        });
      }
    }
  }
  src.connect(chain.input);
  chain.output.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();

  // 3. Look-ahead limiter (the same algorithm live playback uses): keeps
  //    peaks under the ceiling without bending the waveform.
  const out = [rendered.getChannelData(0), rendered.getChannelData(1)] as Float32Array<ArrayBuffer>[];
  limit(out, sr, CEILING_DB);
  return { out, outAt };
}

export async function exportAudio(
  buffer: AudioBuffer,
  p: FxParams,
  format: Format,
  onProgress: (stage: Stage, fraction: number | null) => void,
  auto?: RenderAuto,
): Promise<Blob> {
  const sr = buffer.sampleRate;
  const copy = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
  const { out } = await processChannels(copy, sr, p, true, onProgress, auto);

  // 4. Encode.
  if (format === 'mp3') {
    onProgress('encode', 0);
    let data = out.map((c) => c.slice());
    let rate = sr;
    // MP3 at 320 kbps only exists at 32 / 44.1 / 48 kHz.
    if (![32000, 44100, 48000].includes(sr)) {
      rate = sr % 11025 === 0 ? 44100 : 48000;
      const step = sr / rate;
      data = await resample(data, step, Math.floor(data[0].length / step));
    }
    const bytes = await encodeMp3(data, rate, 320, (f) => onProgress('encode', f));
    return new Blob([bytes as BlobPart], { type: 'audio/mpeg' });
  }
  onProgress('encode', null);
  return encodeWav(out, sr, format === 'wav16' ? 16 : 24);
}

function encodeWav(channels: Float32Array<ArrayBuffer>[], sampleRate: number, bits: 16 | 24): Blob {
  const nCh = channels.length;
  const n = channels[0].length;
  const bytesPer = bits / 8;
  const dataSize = n * nCh * bytesPer;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, nCh, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * nCh * bytesPer, true);
  dv.setUint16(32, nCh * bytesPer, true);
  dv.setUint16(34, bits, true);
  str(36, 'data');
  dv.setUint32(40, dataSize, true);

  let o = 44;
  if (bits === 16) {
    // Dither only here, where we actually drop to 16 bits.
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < nCh; c++) {
        let v = Math.round(channels[c][i] * 32767 + (Math.random() - Math.random()));
        v = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
        dv.setInt16(o, v, true);
        o += 2;
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < nCh; c++) {
        let v = Math.round(channels[c][i] * 8388607);
        v = v > 8388607 ? 8388607 : v < -8388608 ? -8388608 : v;
        dv.setUint8(o, v & 0xff);
        dv.setUint8(o + 1, (v >> 8) & 0xff);
        dv.setUint8(o + 2, (v >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Time-stretch with Signalsmith Stretch in an offline context: same speed
 * change as the resampler, but the pitch stays where it was.
 */
async function stretchOffline(
  input: Float32Array<ArrayBuffer>[],
  sr: number,
  ratio: number,
  outLength: number,
  warp?: Warp,
): Promise<Float32Array<ArrayBuffer>[]> {
  const stereo = input.length > 1 ? input.slice(0, 2) : [input[0], input[0].slice()];
  // A little extra room at the end for the stretcher's own latency.
  const ctx = new OfflineAudioContext(2, outLength + Math.ceil(0.25 * sr), sr);
  const node = await createStretch(ctx);
  await node.addBuffers(stereo, stereo.map((c) => c.buffer));
  void node.schedule({ active: true, input: 0, rate: warp ? warp.steps[0] : ratio, semitones: 0, output: 0 });
  if (warp) {
    // Speed automation. The stretcher keeps only one pending change (each
    // schedule() replaces the ones after it), so the render pauses at each
    // change point (~every 100 ms), hands over that one change and goes on.
    // Each change also pins the input position, so the timing can't drift.
    const quantum = 128 / sr;
    const every = Math.max(1, Math.round((0.1 * sr) / WARP_BLOCK));
    let last = 0;
    for (let b = every; b < warp.steps.length; b += every) {
      const at = Math.ceil(((b * WARP_BLOCK) / sr) / quantum) * quantum;
      if (at <= last) continue;
      last = at;
      const rate = warp.steps[Math.min(warp.steps.length - 1, Math.floor((at * sr) / WARP_BLOCK))];
      void ctx.suspend(at).then(async () => {
        await node.schedule({ rate, input: inputAt(warp, at), output: at });
        await ctx.resume();
      });
    }
  }
  node.connect(ctx.destination);
  const out = await ctx.startRendering();
  return [out.getChannelData(0).slice(0, outLength), out.getChannelData(1).slice(0, outLength)];
}

/**
 * A short piece of the remix, as you hear it: `seconds` long (at the new
 * speed), starting at `start` seconds into `buffer`. A little audio before
 * the start goes through the effects too, so the reverb is already full when
 * the clip begins; the clip fades in and out.
 */
export async function renderClip(
  buffer: AudioBuffer,
  p: FxParams,
  start: number,
  seconds: number,
  auto?: RenderAuto,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const preroll = Math.min(start, 2); // seconds of source before the clip
  const from = Math.floor((start - preroll) * sr);
  // With speed automation, take enough source for the fastest speed.
  const most = auto?.speed ? 2 : p.ratio;
  const len = Math.min(buffer.length - from, Math.ceil((preroll + seconds * most) * sr));
  const slice = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice(from, from + len));
  const { out, outAt } = await processChannels(slice, sr, p, false, () => {}, auto && shifted(auto, start - preroll));
  const skip = Math.floor(outAt(preroll) * sr);
  const n = Math.max(1, Math.min(out[0].length - skip, Math.floor(seconds * sr)));
  const clip = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  const fadeIn = Math.min(n, Math.floor(0.25 * sr));
  const fadeOut = Math.min(n, Math.floor(1.2 * sr));
  for (let c = 0; c < 2; c++) {
    const ch = out[c].subarray(skip, skip + n);
    for (let i = 0; i < fadeIn; i++) ch[i] *= i / fadeIn;
    for (let i = 0; i < fadeOut; i++) ch[n - 1 - i] *= i / fadeOut;
    clip.copyToChannel(ch, c);
  }
  return clip;
}
