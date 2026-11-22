// Importing songs into the library: from many files picked in Files (iPhone)
// or a whole folder (desktop). Each file is copied into the library with its
// cleaned-up title, artist and cover; songs already there are skipped.

import { niceName } from '../engine/decode';
import { readMeta, songNames } from '../engine/meta';
import { addTrack, allTracks, keepStorage, newId, type Track } from './db';

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|aiff?|flac|ogg|opus|webm)$/i;

export const isAudioFile = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);

/** The length in seconds, read by the browser without decoding the whole file. */
function durationOf(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    const finish = (d: number) => {
      URL.revokeObjectURL(url);
      a.removeAttribute('src');
      resolve(Number.isFinite(d) ? d : 0);
    };
    const timer = setTimeout(() => finish(0), 8000);
    a.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(a.duration);
    };
    a.onerror = () => {
      clearTimeout(timer);
      finish(0);
    };
    a.src = url;
  });
}

export interface ImportResult {
  added: Track[];
  skipped: number; // already in the library
  failed: number; // not audio, or unreadable
}

export async function importFiles(files: File[], onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  await keepStorage();
  const existing = new Set((await allTracks()).map((t) => `${t.fileName}|${t.size}`));
  const audio = files.filter(isAudioFile);
  const result: ImportResult = { added: [], skipped: 0, failed: files.length - audio.length };
  for (let i = 0; i < audio.length; i++) {
    const file = audio[i];
    onProgress(i, audio.length);
    const key = `${file.name}|${file.size}`;
    if (existing.has(key)) {
      result.skipped++;
      continue;
    }
    try {
      const meta = readMeta(await file.arrayBuffer());
      const { title, artist } = songNames(meta, niceName(file.name));
      const track: Track = {
        id: newId(),
        title,
        artist,
        album: null,
        duration: await durationOf(file),
        fileName: file.name,
        type: file.type || 'audio/mpeg',
        size: file.size,
        addedAt: Date.now() + i, // keeps the picked order
        cover: meta.cover ?? null,
      };
      await addTrack(track, file);
      existing.add(key);
      result.added.push(track);
    } catch (err) {
      console.warn('import', file.name, err);
      result.failed++;
    }
  }
  onProgress(audio.length, audio.length);
  return result;
}
