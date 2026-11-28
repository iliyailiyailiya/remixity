// What the mixer knows about each library song: tempo, beat grid and key.
// Measured once (it takes a second or two) and kept in localStorage, so the
// Mix list can show BPM and key for every song it has met.

import { detectBpm, detectGrid } from '../engine/bpm';
import { detectKey, type Key } from '../engine/key';
import type { Grid } from '../engine/mix';

export interface SongInfo {
  bpm: number | null;
  grid: Grid | null;
  key: Key | null;
}

const KEY = 'mixSongInfo';
let all: Record<string, SongInfo> | null = null;

function load(): Record<string, SongInfo> {
  if (all) return all;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    all = v && typeof v === 'object' ? v : {};
  } catch {
    all = {};
  }
  return all!;
}

function save() {
  try {
    const entries = Object.entries(load());
    // Keep the last 500 songs.
    const kept = Object.fromEntries(entries.slice(-500));
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* storage full */
  }
}

export function knownInfo(id: string): SongInfo | null {
  return load()[id] ?? null;
}

const running = new Map<string, Promise<SongInfo>>();

/** Tempo, grid and key of a library song (measured once, then remembered). */
export function songInfo(id: string, buffer: AudioBuffer, bpmHint?: number | null): Promise<SongInfo> {
  const known = load()[id];
  if (known && known.key !== undefined && known.grid !== undefined) return Promise.resolve(known);
  const busy = running.get(id);
  if (busy) return busy;
  const p = (async () => {
    const bpm = bpmHint ?? (await detectBpm(buffer).catch(() => null));
    const grid = bpm ? await detectGrid(buffer, bpm).catch(() => null) : null;
    const key = await detectKey(buffer).catch(() => null);
    const info: SongInfo = { bpm: grid ? 60 / grid.beat : bpm, grid, key };
    load()[id] = info;
    save();
    return info;
  })();
  running.set(id, p);
  p.finally(() => running.delete(id));
  return p;
}
