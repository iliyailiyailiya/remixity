// Title, artist and cover art written into exported files.
//
// MP3: an ID3v2.3 tag in front of the audio (what every player reads).
// WAV: a LIST/INFO chunk (title, artist) plus an "id3 " chunk carrying the
// same ID3 tag, which is how most players and taggers store WAV artwork.

export interface Tags {
  title: string;
  artist: string;
  cover: { data: Uint8Array; mime: string } | null;
}

const enc = new TextEncoder();

/** ID3v2.3 text: UTF-16 with BOM (encoding 1), so Cyrillic etc. survive. */
function utf16(text: string): Uint8Array {
  const out = new Uint8Array(3 + text.length * 2);
  out[0] = 1; // encoding: UTF-16 with BOM
  out[1] = 0xff; // BOM, little endian
  out[2] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[3 + i * 2] = c & 0xff;
    out[4 + i * 2] = c >> 8;
  }
  return out;
}

function frame(id: string, body: Uint8Array): Uint8Array {
  const f = new Uint8Array(10 + body.length);
  f.set(enc.encode(id), 0);
  new DataView(f.buffer).setUint32(4, body.length); // v2.3: plain 32-bit size
  f.set(body, 10);
  return f;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** A complete ID3v2.3 tag, or null if there's nothing to write. */
export function id3(tags: Tags): Uint8Array<ArrayBuffer> | null {
  const frames: Uint8Array[] = [];
  if (tags.title) frames.push(frame('TIT2', utf16(tags.title)));
  if (tags.artist) frames.push(frame('TPE1', utf16(tags.artist)));
  frames.push(frame('TSSE', utf16('THE REMIXITY')));
  if (tags.cover) {
    const mime = enc.encode(tags.cover.mime);
    // encoding 0, MIME, 0, picture type 3 (front cover), empty description
    frames.push(frame('APIC', concat([new Uint8Array([0]), mime, new Uint8Array([0, 3, 0]), tags.cover.data])));
  }
  if (!frames.length) return null;
  const body = concat(frames);
  const head = new Uint8Array(10);
  head.set(enc.encode('ID3'), 0);
  head[3] = 3; // version 2.3
  // Tag size is "syncsafe": 7 bits per byte.
  const n = body.length;
  head[6] = (n >> 21) & 0x7f;
  head[7] = (n >> 14) & 0x7f;
  head[8] = (n >> 7) & 0x7f;
  head[9] = n & 0x7f;
  return concat([head, body]);
}

function chunk(id: string, data: Uint8Array): Uint8Array {
  const pad = data.length & 1;
  const c = new Uint8Array(8 + data.length + pad);
  c.set(enc.encode(id), 0);
  new DataView(c.buffer).setUint32(4, data.length, true);
  c.set(data, 8);
  return c;
}

function infoText(id: string, text: string): Uint8Array {
  return chunk(id, concat([enc.encode(text), new Uint8Array([0])]));
}

/** An MP3 without its ID3v2 tag(s) at the start and ID3v1 tag at the end. */
function stripMp3Tags(b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let start = 0;
  // Some files carry more than one ID3v2 tag in a row.
  while (b[start] === 0x49 && b[start + 1] === 0x44 && b[start + 2] === 0x33) {
    const size = ((b[start + 6] & 0x7f) << 21) | ((b[start + 7] & 0x7f) << 14) | ((b[start + 8] & 0x7f) << 7) | (b[start + 9] & 0x7f);
    const footer = b[start + 5] & 0x10 ? 10 : 0;
    start += 10 + size + footer;
    if (start >= b.length) return b; // broken tag: leave the file alone
  }
  let end = b.length;
  if (end - start > 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) end -= 128; // "TAG"
  return b.subarray(start, end);
}

/** A WAV's chunks without its old title/artist (LIST INFO) and ID3 chunks. */
function stripWavTags(b: Uint8Array): Uint8Array[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const id = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  const parts: Uint8Array[] = [b.subarray(0, 12)];
  let at = 12;
  while (at + 8 <= b.length) {
    const cid = id(at);
    const size = view.getUint32(at + 4, true);
    const next = Math.min(b.length, at + 8 + size + (size & 1));
    const drop = cid === 'id3 ' || cid === 'ID3 ' || (cid === 'LIST' && id(at + 8) === 'INFO');
    if (!drop) parts.push(b.subarray(at, next));
    at = next;
  }
  return parts;
}

/** Add tags to an exported file, replacing any it already had. */
export async function withTags(file: Blob, kind: 'mp3' | 'wav', tags: Tags): Promise<Blob> {
  const tag = id3(tags);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === 'mp3') {
    const audio = stripMp3Tags(bytes);
    return new Blob(tag ? [tag, audio] : [audio], { type: 'audio/mpeg' });
  }

  // WAV: drop the old tag chunks, append ours, and fix the RIFF size.
  const kept = stripWavTags(bytes);
  const info: Uint8Array[] = [];
  if (tags.title) info.push(infoText('INAM', tags.title));
  if (tags.artist) info.push(infoText('IART', tags.artist));
  info.push(infoText('ISFT', 'THE REMIXITY'));
  const extra = [chunk('LIST', concat([enc.encode('INFO'), ...info]))];
  if (tag) extra.push(chunk('id3 ', tag));
  const out = concat([...kept, ...extra]);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return new Blob([out], { type: 'audio/wav' });
}
