// Export: high-quality resample → offline render through the same chain →
// look-ahead limiter → WAV or MP3. Everything stays on the device.
import { buildChain, CEILING_DB, delayTail, FxParams } from './chain';
import { makeImpulse } from './impulse';
import { limit } from './limiter';
import { encodeMp3, resample } from './dsp';
import { createStretch } from './player';

export type Format = 'mp3' | 'wav16' | 'wav24';
export type Stage = 'resample' | 'render' | 'encode';

export async function exportAudio(
  buffer: AudioBuffer,
  p: FxParams,
  format: Format,
  onProgress: (stage: Stage, fraction: number | null) => void,
): Promise<Blob> {
  const sr = buffer.sampleRate;
  const copy = () =>
    Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());

  // 1. Change speed: repitch with a band-limited resampler (keeps the
  //    original sample rate), or with "keep pitch", time-stretch instead.
  let channels: Float32Array<ArrayBuffer>[];
  const outLength = Math.floor(buffer.length / p.ratio);
  if (Math.abs(p.ratio - 1) < 1e-6) {
    channels = copy();
  } else if (p.keepPitch) {
    onProgress('resample', null);
    channels = await stretchOffline(copy(), sr, p.ratio, outLength);
  } else {
    onProgress('resample', 0);
    channels = await resample(copy(), p.ratio, outLength, (f) => onProgress('resample', f));
  }

  // 2. Render effects offline in 32-bit float, adding room for the reverb and
  //    echo tails so nothing gets cut off at the end.
  onProgress('render', null);
  const tail = Math.max(p.reverbMix > 0 ? p.decay : 0, delayTail(p)) + 0.1;
  const total = channels[0].length + Math.ceil(tail * sr);
  const off = new OfflineAudioContext(2, total, sr);
  const src = off.createBufferSource();
  const srcBuf = off.createBuffer(channels.length, channels[0].length, sr);
  channels.forEach((ch, c) => srcBuf.copyToChannel(ch, c));
  src.buffer = srcBuf;
  const chain = buildChain(off, { ...p, ratio: 1 });
  chain.setImpulse(makeImpulse(off, p.decay, p.tone));
  src.connect(chain.input);
  chain.output.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();

  // 3. Look-ahead limiter (the same algorithm live playback uses): keeps
  //    peaks under the ceiling without bending the waveform.
  const out = [rendered.getChannelData(0), rendered.getChannelData(1)];
  limit(out, sr, CEILING_DB);

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
): Promise<Float32Array<ArrayBuffer>[]> {
  const stereo = input.length > 1 ? input.slice(0, 2) : [input[0], input[0].slice()];
  // A little extra room at the end for the stretcher's own latency.
  const ctx = new OfflineAudioContext(2, outLength + Math.ceil(0.25 * sr), sr);
  const node = await createStretch(ctx);
  await node.addBuffers(stereo, stereo.map((c) => c.buffer));
  void node.schedule({ active: true, input: 0, rate: ratio, semitones: 0, output: 0 });
  node.connect(ctx.destination);
  const out = await ctx.startRendering();
  return [out.getChannelData(0).slice(0, outLength), out.getChannelData(1).slice(0, outLength)];
}
