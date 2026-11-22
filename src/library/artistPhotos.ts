// Artist photos for the library, from Deezer's catalogue (through our relay,
// the same one the cover search uses). Only the artist's name is sent.
//
// Results are remembered in this browser: a found photo's address, or that
// none was found (asked again after a week). Lookups run one at a time so a
// big library doesn't flood the catalogue.

import { findCoversEnabled, sameName } from '../ui/coverSearch';

const KEY = 'artistPhotos';
const RETRY_MS = 7 * 24 * 3600 * 1000;

type Entry = { url: string; at: number }; // url '' = none found
let cache: Record<string, Entry> | null = null;

function load(): Record<string, Entry> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, Entry>;
  } catch {
    cache = {};
  }
  return cache;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: just don't remember */
  }
}

interface DeezerArtist {
  name?: string;
  picture_medium?: string;
  picture_big?: string;
}

async function lookUp(name: string, song?: string): Promise<string> {
  // The name alone finds most artists; a common-word name ("FACE") needs one
  // of their songs next to it.
  const queries = [name, song ? `${name} ${song}` : ''].filter(Boolean);
  for (const q of queries) {
    const r = await fetch(`/api/deezer?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = ((await r.json()) as { data?: { artist?: DeezerArtist }[] }).data ?? [];
    for (const { artist } of data) {
      const pic = artist?.picture_big || artist?.picture_medium || '';
      // Artists without a photo get a placeholder address with an empty id.
      if (artist?.name && sameName(artist.name, name) && pic && !pic.includes('/artist//')) return pic;
    }
  }
  return '';
}

const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** The photo address for this artist, or null if there isn't one (yet). */
export function artistPhoto(name: string, song?: string): Promise<string | null> {
  const key = name.trim().toLocaleLowerCase();
  if (!key || !findCoversEnabled()) return Promise.resolve(null);
  const hit = load()[key];
  if (hit && (hit.url || Date.now() - hit.at < RETRY_MS)) return Promise.resolve(hit.url || null);
  let p = pending.get(key);
  if (!p) {
    p = queue.then(async () => {
      try {
        const url = await lookUp(name, song);
        load()[key] = { url, at: Date.now() };
        save();
        await new Promise((r) => setTimeout(r, 250)); // be gentle
        return url || null;
      } catch {
        return null; // offline or the relay failed: try again another time
      } finally {
        pending.delete(key);
      }
    });
    pending.set(key, p);
    queue = p;
  }
  return p;
}

/** A remembered photo, without looking anything up. */
export function knownArtistPhoto(name: string): string | null {
  return load()[name.trim().toLocaleLowerCase()]?.url || null;
}
