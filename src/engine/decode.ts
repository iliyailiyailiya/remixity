// decodeAudioData resamples to the decoding context's rate, so to keep the
// file's original sample rate we read it from the file header first and
// decode in a context running at that rate.

const MP3_RATES = [
  [11025, 12000, 8000], // MPEG 2.5
  null,
  [22050, 24000, 16000], // MPEG 2
  [44100, 48000, 32000], // MPEG 1
] as const;

function ascii(b: Uint8Array, at: number, len: number) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[at + i]);
  return s;
}

export function sniffSampleRate(buf: ArrayBuffer): number | null {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (b.length < 64) return null;

  // WAV / RF64
  if ((ascii(b, 0, 4) === 'RIFF' || ascii(b, 0, 4) === 'RF64') && ascii(b, 8, 4) === 'WAVE') {
    let p = 12;
    while (p + 8 <= b.length) {
      const id = ascii(b, p, 4);
      const size = dv.getUint32(p + 4, true);
      if (id === 'fmt ') return dv.getUint32(p + 12, true);
      p += 8 + size + (size & 1);
    }
    return null;
  }

  // AIFF
  if (ascii(b, 0, 4) === 'FORM' && /AIF[FC]/.test(ascii(b, 8, 4))) {
    let p = 12;
    while (p + 8 <= b.length) {
      const id = ascii(b, p, 4);
      const size = dv.getUint32(p + 4, false);
      if (id === 'COMM') {
        // 80-bit extended float at offset 8 of the chunk body
        const q = p + 8 + 8;
        const exp = dv.getUint16(q, false) & 0x7fff;
        const mant = dv.getUint32(q + 2, false);
        return Math.round(mant * Math.pow(2, exp - 16383 - 31));
      }
      p += 8 + size + (size & 1);
    }
    return null;
  }

  // FLAC: STREAMINFO is always the first metadata block
  if (ascii(b, 0, 4) === 'fLaC') {
    return (b[18] << 12) | (b[19] << 4) | (b[20] >> 4);
  }

  // Ogg: Vorbis carries a rate; Opus always decodes at 48 kHz
  if (ascii(b, 0, 4) === 'OggS') {
    const head = ascii(b, 0, Math.min(b.length, 200));
    if (head.includes('OpusHead')) return 48000;
    const v = head.indexOf('\x01vorbis');
    if (v >= 0) return dv.getUint32(v + 12, true);
    return null;
  }

  // MP4 / M4A: AudioSampleEntry ('mp4a', 'alac', ...) has a 16.16 rate at +32
  if (ascii(b, 4, 4) === 'ftyp') {
    for (const tag of ['mp4a', 'alac', 'fLaC', 'Opus']) {
      for (let i = 8; i < b.length - 40; i++) {
        if (b[i] === tag.charCodeAt(0) && ascii(b, i, 4) === tag) {
          const rate = dv.getUint16(i - 4 + 32, false);
          if (rate >= 8000 && rate <= 384000) return rate;
        }
      }
    }
    return null;
  }

  // MP3: skip ID3v2, then read the first frame header
  let p = 0;
  if (ascii(b, 0, 3) === 'ID3') {
    p = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  }
  for (let i = p; i < Math.min(b.length - 4, p + 65536); i++) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
      const version = (b[i + 1] >> 3) & 3;
      const layer = (b[i + 1] >> 1) & 3;
      const rateIdx = (b[i + 2] >> 2) & 3;
      const table = MP3_RATES[version];
      if (table && layer !== 0 && rateIdx !== 3) return table[rateIdx];
    }
  }
  return null;
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  return decodeData(await file.arrayBuffer());
}

/** Decode at the file's own sample rate. The passed buffer may be detached afterwards. */
export async function decodeData(data: ArrayBuffer): Promise<AudioBuffer> {
  let rate = sniffSampleRate(data);
  if (!rate || rate < 8000 || rate > 384000) rate = 44100;
  try {
    const ctx = new OfflineAudioContext(1, 1, rate);
    return await ctx.decodeAudioData(data.slice(0));
  } catch {
    // Unusual rate the browser refuses: fall back to its default rate.
    const ctx = new OfflineAudioContext(1, 1, 48000);
    return await ctx.decodeAudioData(data);
  }
}

/** Clean up a file name for display and for the exported file. */
export function niceName(raw: string): string {
  let name = raw;
  if (/%[0-9a-f]{2}/i.test(name)) {
    try {
      name = decodeURIComponent(name);
    } catch {
      /* keep as-is */
    }
  }
  // macOS hands over decomposed Unicode (NFD); compose it so letters like
  // ș, ț, й render and save correctly.
  name = name.normalize('NFC').replace(/\.[^.]{1,5}$/, '').replace(/_/g, ' ').trim();
  return name || 'track';
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

// ---------- quick start ----------
// A whole song takes a moment to decode (seconds on a phone). For MP3s, the
// first ~20 seconds are decoded first so playback can start right away while
// the rest decodes; the player then swaps in the whole song without a gap.

const QUICK_AUDIO_BYTES = 768 * 1024; // ≈ 20 s at 320 kbps, more at lower bitrates

/** The start of an MP3 big enough to be worth it (tags + first audio), or null. */
export function quickPart(data: ArrayBuffer): { part: ArrayBuffer; fraction: number } | null {
  const b = new Uint8Array(data);
  let start = 0;
  // Skip ID3v2 tags (they can hold a big cover image).
  while (start + 10 < b.length && b[start] === 0x49 && b[start + 1] === 0x44 && b[start + 2] === 0x33) {
    const size = ((b[start + 6] & 0x7f) << 21) | ((b[start + 7] & 0x7f) << 14) | ((b[start + 8] & 0x7f) << 7) | (b[start + 9] & 0x7f);
    start += 10 + size + (b[start + 5] & 0x10 ? 10 : 0);
  }
  // The first MPEG audio frame (allowing a little padding after the tag).
  let sync = -1;
  for (let i = start; i < Math.min(b.length - 1, start + 8192); i++) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
      sync = i;
      break;
    }
  }
  if (sync < 0) return null;
  const audio = b.length - sync;
  if (audio < QUICK_AUDIO_BYTES * 3) return null; // short file: decoding it all is quick anyway
  return { part: data.slice(0, sync + QUICK_AUDIO_BYTES), fraction: QUICK_AUDIO_BYTES / audio };
}
