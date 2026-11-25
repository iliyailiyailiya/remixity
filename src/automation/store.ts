// Saved timelines: a song's sections and automation lanes, kept on this
// device (IndexedDB, its own small database next to the library) so a remix
// can be reopened. Keyed by the library song's id, or by file name + size for
// a file opened from outside the library.

import type { Segment } from '../engine/edit';
import type { Lane } from './model';

export interface SavedTimeline {
  key: string;
  /** Length of the decoded song: a different file under the same key is ignored. */
  duration: number;
  segments: Segment[];
  markers: number[];
  lanes: Lane[];
  /** The beat grid (seconds per beat, where bar 1 starts). */
  grid?: { beat: number; offset: number };
  savedAt: number;
}

const DB_NAME = 'remixity-timelines';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('timelines', { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbp = null;
      reject(req.error);
    };
  });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction('timelines', mode).objectStore('timelines'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const songKey = (libraryId: string | null, file: { name: string; size: number }) =>
  libraryId ?? `file:${file.name}|${file.size}`;

export async function loadTimeline(key: string): Promise<SavedTimeline | null> {
  try {
    const rec = await run('readonly', (s) => s.get(key) as IDBRequest<SavedTimeline | undefined>);
    return rec && Array.isArray(rec.segments) && Array.isArray(rec.lanes) ? rec : null;
  } catch {
    return null; // storage blocked (private mode etc.): just don't restore
  }
}

export async function saveTimeline(rec: SavedTimeline): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(rec));
  } catch {
    /* storage blocked or full */
  }
}

export async function deleteTimeline(key: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(key));
  } catch {
    /* nothing to do */
  }
}
