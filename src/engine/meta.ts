// Reads title, artist and cover art from the file itself (ID3v2 for MP3,
// iTunes atoms for M4A, Vorbis comments + PICTURE for FLAC). Everything is
// parsed locally; nothing leaves the device.

export interface TrackMeta {
  title?: string;
  artist?: string;
  cover?: Blob;
}

const ascii = (b: Uint8Array, at: number, n: number) => {
  let s = '';
  for (let i = 0; i < n && at + i < b.length; i++) s += String.fromCharCode(b[at + i]);
  return s;
};

const clean = (s: string | undefined) => {
  const v = s?.replace(/\u0000+$/g, '').replace(/\u0000/g, ' / ').trim();
  return v ? v.normalize('NFC') : undefined;
};

// Many Russian MP3s store CP1251 text in fields marked as Latin-1. If the
// Latin-1 reading is mostly accented gibberish, read it as CP1251 instead.
function decodeLatin1OrCp1251(bytes: Uint8Array): string {
  const latin = new TextDecoder('latin1').decode(bytes);
  let high = 0;
  let letters = 0;
  for (const c of bytes) {
    if (c >= 0xc0) high++;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c >= 0xc0) letters++;
  }
  if (letters > 0 && high / letters > 0.5) {
    try {
      return new TextDecoder('windows-1251').decode(bytes);
    } catch {
      /* decoder unavailable */
    }
  }
  return latin;
}

function decodeId3Text(enc: number, bytes: Uint8Array): string {
  switch (enc) {
    case 1:
      return new TextDecoder('utf-16').decode(bytes); // BOM decides endianness
    case 2:
      return new TextDecoder('utf-16be').decode(bytes);
    case 3:
      return new TextDecoder('utf-8').decode(bytes);
    default:
      return decodeLatin1OrCp1251(bytes);
  }
}

/** Index just past a null terminator (1 byte, or 2 aligned bytes for UTF-16). */
function skipTerminated(b: Uint8Array, at: number, end: number, wide: boolean) {
  if (wide) {
    for (let i = at; i + 1 < end; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2;
  } else {
    for (let i = at; i < end; i++) if (b[i] === 0) return i + 1;
  }
  return end;
}

const syncsafe = (b: Uint8Array, at: number) =>
  ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);

function parseId3(b: Uint8Array): TrackMeta {
  const meta: TrackMeta = {};
  const version = b[3];
  if (version < 3 || version > 4) return meta;
  const flags = b[5];
  const end = Math.min(b.length, 10 + syncsafe(b, 6));
  let p = 10;
  if (flags & 0x40) p += version === 4 ? syncsafe(b, 10) : 4 + new DataView(b.buffer, b.byteOffset).getUint32(10);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);

  while (p + 10 <= end) {
    const id = ascii(b, p, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = version === 4 ? syncsafe(b, p + 4) : dv.getUint32(p + 4);
    const body = p + 10;
    const bodyEnd = Math.min(end, body + size);
    if (size <= 0) break;

    if (id === 'TIT2' || id === 'TPE1') {
      const text = clean(decodeId3Text(b[body], b.subarray(body + 1, bodyEnd)));
      if (id === 'TIT2') meta.title ??= text;
      else meta.artist ??= text;
    } else if (id === 'APIC' && !meta.cover) {
      const enc = b[body];
      const mimeEnd = skipTerminated(b, body + 1, bodyEnd, false);
      let mime = ascii(b, body + 1, mimeEnd - body - 2).toLowerCase();
      if (!mime.includes('/')) mime = `image/${mime || 'jpeg'}`;
      const descEnd = skipTerminated(b, mimeEnd + 1, bodyEnd, enc === 1 || enc === 2);
      if (descEnd < bodyEnd) meta.cover = new Blob([b.slice(descEnd, bodyEnd)], { type: mime });
    }
    p = bodyEnd;
  }
  return meta;
}

function parseMp4(b: Uint8Array): TrackMeta {
  const meta: TrackMeta = {};
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const containers = new Set(['moov', 'udta', 'ilst', 'meta']);

  const walk = (start: number, end: number, depth: number) => {
    let p = start;
    while (p + 8 <= end && depth < 8) {
      let size = dv.getUint32(p);
      const type = ascii(b, p + 4, 4);
      let header = 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(p + 8));
        header = 16;
      } else if (size === 0) size = end - p;
      if (size < header || p + size > end) break;
      const body = p + header;
      const boxEnd = p + size;

      if (containers.has(type)) {
        walk(type === 'meta' ? body + 4 : body, boxEnd, depth + 1);
      } else if (type === '©nam' || type === '©ART' || type === 'covr') {
        // child 'data' box: size(4) 'data'(4) type(4) locale(4) payload
        if (ascii(b, body + 4, 4) === 'data') {
          const dataSize = dv.getUint32(body);
          const kind = dv.getUint32(body + 8) & 0xffffff;
          const payload = b.subarray(body + 16, Math.min(boxEnd, body + dataSize));
          if (type === 'covr') {
            if (!meta.cover) meta.cover = new Blob([payload.slice()], { type: kind === 14 ? 'image/png' : 'image/jpeg' });
          } else {
            const text = clean(new TextDecoder('utf-8').decode(payload));
            if (type === '©nam') meta.title ??= text;
            else meta.artist ??= text;
          }
        }
      }
      p = boxEnd;
    }
  };
  walk(0, b.length, 0);
  return meta;
}

function parseFlac(b: Uint8Array): TrackMeta {
  const meta: TrackMeta = {};
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 4;
  while (p + 4 <= b.length) {
    const head = b[p];
    const type = head & 0x7f;
    const len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    const body = p + 4;
    if (body + len > b.length) break;

    if (type === 4) {
      let q = body;
      q += 4 + dv.getUint32(q, true); // vendor string
      const count = dv.getUint32(q, true);
      q += 4;
      for (let i = 0; i < count && q + 4 <= body + len; i++) {
        const l = dv.getUint32(q, true);
        const entry = new TextDecoder('utf-8').decode(b.subarray(q + 4, q + 4 + l));
        q += 4 + l;
        const eq = entry.indexOf('=');
        const key = entry.slice(0, eq).toUpperCase();
        const val = clean(entry.slice(eq + 1));
        if (key === 'TITLE') meta.title ??= val;
        if (key === 'ARTIST') meta.artist ??= val;
      }
    } else if (type === 6 && !meta.cover) {
      let q = body + 4;
      const mimeLen = dv.getUint32(q);
      const mime = ascii(b, q + 4, mimeLen) || 'image/jpeg';
      q += 4 + mimeLen;
      q += 4 + dv.getUint32(q); // description
      q += 16; // width, height, depth, colours
      const dataLen = dv.getUint32(q);
      meta.cover = new Blob([b.slice(q + 4, q + 4 + dataLen)], { type: mime });
    }
    if (head & 0x80) break; // last metadata block
    p = body + len;
  }
  return meta;
}

/** "Artist - Title" is the most common way people name files. */
/**
 * Clean a file name that came from a downloader: drop site tags like
 * "KLICKAUD" or "y2mate.com", bitrate notes, "(Official Video)", and long
 * numeric IDs, and turn underscores into spaces.
 */
export function tidyName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/[([{][^)\]}]*(official|video|audio|lyric|visuali[sz]er|kbps|\bhq\b|\bhd\b)[^)\]}]*[)\]}]/gi, '')
    .replace(/\b(klickaud|y2mate(\.com)?|ytmp3(\.cc)?|savefrom(\.net)?|mp3juices?|spotifydown|sclouddownloader|soundcloud ?downloader|\d{2,3} ?kbps)\b/gi, '')
    .replace(/\b\d{5,}\b/g, '')
    // Suffixes audio apps add: "lucid-processed", "song_final", "beat mastered"
    .replace(/[\s_-]+(processed|mastered|master|final( version)?|copy( \d+)?|exported|export|bounce|mixdown|v\d+)$/i, '')
    .replace(/\s+[-–—]\s*$/, '')
    .replace(/^\s*[-–—]\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Artist tags that name where the file came from, not who made it
 * ("DatPiff", "YouTube", "SoundCloud", "Unknown artist", "Artist - Topic"…).
 */
export function isJunkArtist(artist: string | null | undefined): boolean {
  if (!artist) return true;
  return /^(datpiff|youtube|soundcloud|spotify|audiomack|bandcamp|deezer|apple music|music|artist|unknown( artist)?|various( artists)?|va|n\/a|topic|.+\s-\s*topic|www\..+|.+\.(com|net|org|ru|co))$/i.test(
    artist.trim(),
  );
}

/**
 * Some downloaders write every tag value twice ("Song, Song" or "Artist,
 * Artist"), and some add the songwriter's full legal name to the artist
 * ("ANIKV, LIL KRYSTALLL, Озеров Степан Александрович"). Clean both.
 */
export function undoubleTitle(title: string): string {
  return title.replace(/^(.+?)(?:\s*(?:,|;|\/)\s*\1)+$/u, '$1').trim();
}

// A Russian/Ukrainian full name with a patronymic ("Иванов Иван Иванович"):
// a songwriter credit, not a performing artist.
const LEGAL_NAME = /^\p{L}+\s+\p{L}+\s+\p{L}+(ович|евич|ьич|ична|овна|евна|івна|ович)$/iu;

export function undoubleArtist(artist: string): string {
  const parts = artist.split(/\s*(?:,|;|\s\/)\s*/u).filter(Boolean);
  if (parts.length < 2) return artist.trim();
  const seen = new Set<string>();
  const kept = parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key) || LEGAL_NAME.test(p)) return false;
    seen.add(key);
    return true;
  });
  return (kept.length ? kept : parts.slice(0, 1)).join(', ');
}

/** "Larry June & Cardo - Friday Activities" → { artist, title }, or null. */
export function splitArtistTitle(text: string): { artist: string; title: string } | null {
  const m = text.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : null;
}

export function metaFromFileName(name: string): TrackMeta {
  name = tidyName(name) || name;
  const m = name.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: name };
}

export function readMeta(data: ArrayBuffer): TrackMeta {
  const b = new Uint8Array(data);
  try {
    if (ascii(b, 0, 3) === 'ID3') return parseId3(b);
    if (ascii(b, 4, 4) === 'ftyp') return parseMp4(b);
    if (ascii(b, 0, 4) === 'fLaC') return parseFlac(b);
  } catch (err) {
    console.warn('metadata', err);
  }
  return {};
}

/**
 * The title and artist to show for a song, from its tags and file name.
 * Download-site tags are often wrong: the artist tag names the site
 * ("DatPiff") and the title holds "Artist - Song". `name` is the cleaned
 * file name without extension.
 */
export function songNames(meta: TrackMeta, name: string): { title: string; artist: string | null } {
  const fromName = metaFromFileName(name);
  let title = tidyName(undoubleTitle(meta.title || '')) || fromName.title || name;
  let artist: string | null = isJunkArtist(meta.artist) ? null : undoubleArtist(meta.artist!);
  const split = splitArtistTitle(title);
  if (split && !artist) [artist, title] = [split.artist, split.title];
  artist ??= fromName.artist || null;
  return { title, artist };
}
