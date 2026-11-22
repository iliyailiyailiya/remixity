// Getting cleaned songs back out of the library.
//
// Each file keeps its audio untouched; MP3 and WAV get their old tags
// replaced with the cleaned title, artist and cover. Other formats (M4A,
// FLAC, OGG…) keep their tags but get the clean "Artist - Title" name.
//
// iPhone: the share sheet ("Save to Files"), in batches it can handle.
// Desktop Chrome/Edge: straight into a folder you pick, or "update the
// original files" in your music folder. Elsewhere: one zip download.

import { safeFileName } from '../engine/decode';
import { withTags } from '../engine/tags';
import { getAudio, type Track } from './db';

const BATCH_FILES = 20;
const BATCH_BYTES = 180 * 1024 * 1024; // keep a share sheet's files under ~180 MB

const extOf = (name: string) => (name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '.mp3').toLowerCase();

export const cleanName = (tr: Track) =>
  safeFileName(tr.artist ? `${tr.artist} - ${tr.title}` : tr.title) + extOf(tr.fileName);

/** The library song as a file, with cleaned tags where the format allows. */
export async function cleanedFile(tr: Track): Promise<File> {
  const audio = await getAudio(tr.id);
  if (!audio) throw new Error('missing audio');
  const ext = extOf(tr.fileName);
  const kind = ext === '.mp3' ? 'mp3' : ext === '.wav' ? 'wav' : null;
  let blob: Blob = audio;
  if (kind) {
    const cover = tr.cover ? { data: new Uint8Array(await tr.cover.arrayBuffer()), mime: tr.cover.type || 'image/jpeg' } : null;
    blob = await withTags(audio, kind, { title: tr.title, artist: tr.artist ?? '', cover });
  }
  return new File([blob], cleanName(tr), { type: tr.type || blob.type || 'audio/mpeg' });
}

const canShareFiles = (files: File[]) => typeof navigator.canShare === 'function' && navigator.canShare({ files });

function download(file: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** Hand files to the share sheet (iPhone: "Save to Files"), or download them. Call right after a tap. */
export async function shareOrDownload(files: File[]): Promise<boolean> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files });
      return true;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return false;
      throw err;
    }
  }
  if (files.length === 1) download(files[0], files[0].name);
  else download(await zip(files), 'THE REMIXITY.zip');
  return true;
}

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
};
const pickFolder = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
/** Desktop Chrome/Edge can write into folders you pick. */
export const canUseFolders = typeof pickFolder === 'function';
/** Phones: the share sheet can take files (needs batches, one tap each). */
export const canShareBatches = () =>
  canShareFiles([new File([new Blob([''], { type: 'audio/mpeg' })], 'x.mp3', { type: 'audio/mpeg' })]);

export type BatchProgress = (done: number, total: number) => void;

/** Build the next share-sheet batch (≤ 20 songs, ≤ ~180 MB). */
export async function prepareBatch(tracks: Track[], onProgress: BatchProgress): Promise<{ files: File[]; used: number }> {
  const files: File[] = [];
  let bytes = 0;
  for (const tr of tracks) {
    if (files.length >= BATCH_FILES || (files.length && bytes + tr.size > BATCH_BYTES)) break;
    onProgress(files.length, Math.min(tracks.length, BATCH_FILES));
    const f = await cleanedFile(tr);
    files.push(f);
    bytes += f.size;
  }
  return { files, used: files.length };
}

/** Desktop Chrome/Edge: write cleaned copies into a folder you pick. Call right after a tap. */
export async function saveToFolder(tracks: Track[], onProgress: BatchProgress): Promise<number> {
  const dir = await pickFolder!({ mode: 'readwrite', id: 'remixity-export' });
  for (let i = 0; i < tracks.length; i++) {
    onProgress(i, tracks.length);
    const file = await cleanedFile(tracks[i]);
    const w = await (await dir.getFileHandle(file.name, { create: true })).createWritable();
    await w.write(file);
    await w.close();
  }
  onProgress(tracks.length, tracks.length);
  return tracks.length;
}

/** Anything else: everything in one zip download. */
export async function saveAsZip(tracks: Track[], onProgress: BatchProgress): Promise<number> {
  const files: File[] = [];
  for (let i = 0; i < tracks.length; i++) {
    onProgress(i, tracks.length);
    files.push(await cleanedFile(tracks[i]));
  }
  download(await zip(files), 'THE REMIXITY.zip');
  onProgress(tracks.length, tracks.length);
  return tracks.length;
}

/**
 * Desktop: rewrite the original files in your music folder. Each library
 * song whose original file name is found in the folder (or its subfolders)
 * is replaced by the cleaned file, under the clean name.
 */
export async function updateOriginals(tracks: Track[], onProgress: BatchProgress): Promise<{ updated: number; notFound: number }> {
  if (!canUseFolders) throw new Error('not supported');
  const root = await pickFolder!({ mode: 'readwrite', id: 'remixity-music' });
  // Find where each original file lives (a few folder levels deep).
  const where = new Map<string, DirHandle>();
  const walk = async (dir: DirHandle, depth: number) => {
    for await (const h of dir.values()) {
      if (h.kind === 'file') {
        if (!where.has(h.name)) where.set(h.name, dir);
      } else if (depth < 4) await walk(h as DirHandle, depth + 1);
    }
  };
  await walk(root, 0);

  let updated = 0;
  let notFound = 0;
  for (let i = 0; i < tracks.length; i++) {
    onProgress(i, tracks.length);
    const tr = tracks[i];
    const dir = where.get(tr.fileName);
    if (!dir) {
      notFound++;
      continue;
    }
    const file = await cleanedFile(tr);
    const handle = await dir.getFileHandle(file.name, { create: true });
    const w = await handle.createWritable();
    await w.write(file);
    await w.close();
    if (file.name !== tr.fileName) await dir.removeEntry(tr.fileName);
    updated++;
  }
  onProgress(tracks.length, tracks.length);
  return { updated, notFound };
}

// ---------- a tiny zip writer (stored, not compressed: audio is already compressed) ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function zip(files: File[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = new Uint8Array(await f.arrayBuffer());
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, f);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
