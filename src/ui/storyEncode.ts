// Story videos encoded frame by frame (WebCodecs): H.264 High profile at a
// fixed, generous bitrate + AAC, packed into an MP4. Unlike recording the
// canvas in real time, quality doesn't depend on the browser's recorder
// settings, it's faster than real time, and the sound can't crackle.
//
// Needs VideoEncoder and AudioEncoder (Chrome, Edge; Safari 26+). Older
// browsers use the real-time recorder in story.ts instead.

import type { StoryPainter } from './story';

const FPS = 30;
const VIDEO_BITRATE = 10_000_000;
const AUDIO_BITRATE = 192_000;
const AVC_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42002a']; // High 4.0, Main 4.0, Baseline 4.2

interface Plan {
  video: VideoEncoderConfig;
  audio: AudioEncoderConfig;
}

/** Why the last plan couldn't be made (for the diagnostics note). */
export let planProblem = '';

const supported = async (check: Promise<{ supported?: boolean }>) => {
  try {
    return !!(await check).supported;
  } catch {
    return false;
  }
};

/** The encoder settings this browser can do for a w×h story with this sound, or null. */
export async function encodePlan(w: number, h: number, sampleRate: number): Promise<Plan | null> {
  planProblem = '';
  if (typeof VideoEncoder === 'undefined') return (planProblem = 'no VideoEncoder'), null;
  if (typeof AudioEncoder === 'undefined') return (planProblem = 'no AudioEncoder'), null;
  if (typeof VideoFrame === 'undefined') return (planProblem = 'no VideoFrame'), null;
  // Try the best settings first, then simpler ones (browsers differ in what they accept).
  let audio: AudioEncoderConfig | null = null;
  for (const rate of [...new Set([[44100, 48000].includes(sampleRate) ? sampleRate : 48000, 48000, 44100])]) {
    for (const bitrate of [AUDIO_BITRATE, 128_000, undefined]) {
      const cfg: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: 2, ...(bitrate ? { bitrate } : {}) };
      if (await supported(AudioEncoder.isConfigSupported(cfg))) {
        audio = cfg;
        break;
      }
    }
    if (audio) break;
  }
  if (!audio) return (planProblem = 'AAC not supported'), null;
  for (const codec of AVC_CODECS) {
    const base: VideoEncoderConfig = { codec, width: w, height: h, bitrate: VIDEO_BITRATE, framerate: FPS };
    for (const video of [
      { ...base, latencyMode: 'quality', avc: { format: 'avc' } } as VideoEncoderConfig,
      { ...base, avc: { format: 'avc' } } as VideoEncoderConfig,
      base,
    ]) {
      if (await supported(VideoEncoder.isConfigSupported(video))) return { video, audio };
    }
  }
  planProblem = 'H.264 1080x1920 not supported';
  return null;
}

/**
 * AAC-LC "AudioSpecificConfig" (what the MP4 needs to describe the sound).
 * Written here rather than taken from the encoder: Safari's is wrong.
 */
function aacConfig(sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
  const idx = Math.max(0, rates.indexOf(sampleRate));
  return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (channels << 3)]);
}

/** Resample to `rate` if needed (the encoder only takes 44.1 / 48 kHz). */
async function atRate(clip: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (clip.sampleRate === rate) return clip;
  const off = new OfflineAudioContext(2, Math.ceil(clip.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = clip;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

export async function encodeStory(
  plan: Plan,
  canvas: HTMLCanvasElement,
  painter: StoryPainter,
  clip: AudioBuffer,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const sound = await atRate(clip, plan.audio.sampleRate);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: plan.video.width, height: plan.video.height, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: plan.audio.sampleRate },
    fastStart: 'in-memory', // index at the front: plays and uploads everywhere
    firstTimestampBehavior: 'offset',
  });

  let failure: unknown = null;
  const fail = (e: unknown) => (failure ??= e);
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: fail });
  venc.configure(plan.video);
  const description = aacConfig(plan.audio.sampleRate, 2);
  const aenc = new AudioEncoder({
    output: (chunk, meta) =>
      muxer.addAudioChunk(chunk, meta?.decoderConfig ? { decoderConfig: { ...meta.decoderConfig, description } } : meta),
    error: fail,
  });
  aenc.configure(plan.audio);

  try {
    // Sound first (quick), in 1024-sample pieces.
    const ch = [sound.getChannelData(0), sound.getChannelData(sound.numberOfChannels > 1 ? 1 : 0)];
    const rate = plan.audio.sampleRate;
    for (let at = 0; at < sound.length; at += 1024) {
      const n = Math.min(1024, sound.length - at);
      const data = new Float32Array(n * 2);
      data.set(ch[0].subarray(at, at + n), 0);
      data.set(ch[1].subarray(at, at + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at / rate) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }

    // Then the pictures, one frame at a time.
    let viaBitmap = false;
    const frames = Math.max(1, Math.round(clip.duration * FPS));
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      if (failure) throw failure;
      const t = i / FPS;
      painter.draw(t, Math.min(1, t / clip.duration));
      const ts = { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) };
      let frame: VideoFrame | null = null;
      if (!viaBitmap) {
        try {
          frame = new VideoFrame(canvas, ts);
          // Some browsers hand over a smaller picture than the canvas: then go via a full-size bitmap.
          if (frame.codedWidth !== plan.video.width || frame.codedHeight !== plan.video.height) {
            frame.close();
            frame = null;
            viaBitmap = true;
          }
        } catch {
          viaBitmap = true;
        }
      }
      if (!frame) {
        const bmp = await createImageBitmap(canvas, { resizeWidth: plan.video.width, resizeHeight: plan.video.height, resizeQuality: 'high' });
        frame = new VideoFrame(bmp, ts);
        bmp.close();
      }
      venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      // Don't run ahead of the encoder (keeps memory flat), and let the page breathe.
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (i % 10 === 0) {
        onProgress(i / frames);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await Promise.all([venc.flush(), aenc.flush()]);
    if (failure) throw failure;
    muxer.finalize();
    onProgress(1);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (venc.state !== 'closed') venc.close();
    if (aenc.state !== 'closed') aenc.close();
  }
}
