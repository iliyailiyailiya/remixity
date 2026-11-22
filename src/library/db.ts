// The music library, stored in the browser (IndexedDB): song details and
// covers in one store, the audio in another (so listing the library never
// touches the big files), and playlists. Nothing leaves the device.

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number; // seconds
  fileName: string;
  type: string;
  size: number;
  addedAt: number;
  cover: Blob | null;
  /** The file's own cover was replaced (by search or by hand). */
  coverFound?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

const DB_NAME = 'remixity-library';
const VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export async function allTracks(): Promise<Track[]> {
  const db = await open();
  return done(db.transaction('tracks').objectStore('tracks').getAll() as IDBRequest<Track[]>);
}

export async function getTrack(id: string): Promise<Track | undefined> {
  const db = await open();
  return done(db.transaction('tracks').objectStore('tracks').get(id) as IDBRequest<Track | undefined>);
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  const db = await open();
  return done(db.transaction('audio').objectStore('audio').get(id) as IDBRequest<Blob | undefined>);
}

export async function addTrack(track: Track, audio: Blob): Promise<void> {
  const db = await open();
  const tx = db.transaction(['tracks', 'audio'], 'readwrite');
  tx.objectStore('tracks').put(track);
  tx.objectStore('audio').put(audio, track.id);
  await finished(tx);
}

export async function updateTrack(id: string, changes: Partial<Track>): Promise<Track | undefined> {
  const db = await open();
  const tx = db.transaction('tracks', 'readwrite');
  const store = tx.objectStore('tracks');
  const cur = (await done(store.get(id) as IDBRequest<Track | undefined>)) ?? undefined;
  if (!cur) return undefined;
  const next = { ...cur, ...changes, id };
  store.put(next);
  await finished(tx);
  return next;
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(['tracks', 'audio', 'playlists'], 'readwrite');
  tx.objectStore('tracks').delete(id);
  tx.objectStore('audio').delete(id);
  // Take it out of every playlist too.
  const lists = tx.objectStore('playlists');
  const all = (await done(lists.getAll() as IDBRequest<Playlist[]>)) ?? [];
  for (const p of all) if (p.trackIds.includes(id)) lists.put({ ...p, trackIds: p.trackIds.filter((t) => t !== id) });
  await finished(tx);
}

export async function allPlaylists(): Promise<Playlist[]> {
  const db = await open();
  const lists = await done(db.transaction('playlists').objectStore('playlists').getAll() as IDBRequest<Playlist[]>);
  return lists.sort((a, b) => a.createdAt - b.createdAt);
}

export async function savePlaylist(p: Playlist): Promise<void> {
  const db = await open();
  const tx = db.transaction('playlists', 'readwrite');
  tx.objectStore('playlists').put(p);
  await finished(tx);
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction('playlists', 'readwrite');
  tx.objectStore('playlists').delete(id);
  await finished(tx);
}

/** Ask the browser not to clear the library when space runs low. */
export async function keepStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

export const newId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
