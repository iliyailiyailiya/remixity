// Lyrics from LRCLIB (lrclib.net): a free, open database of song lyrics,
// many with per-line timestamps ("synced"). Searches go through our relay
// (functions/api/lyrics.ts), which shares one cache between everyone, so a
// popular song is fetched from LRCLIB about once, not once per listener. If
// the relay can't be reached, the browser asks LRCLIB directly. Only the
// artist and title are sent (the length only picks between results, here).
//
// Timestamps are in the original song's time, which is what the player's
// position is in too, so the highlight stays in sync at any speed.

import { artistMatches, closeMatch, HAN, loadChinese, log, nameInTitle, nameReadings } from './coverSearch';

const API = 'https://lrclib.net/api';
const SETTING_KEY = 'findLyrics';

export function findLyricsEnabled(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setFindLyrics(on: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, on ? 'on' : 'off');
  } catch {
    /* applies to this visit only */
  }
}

export interface LyricLine {
  t: number; // seconds in the original song
  text: string;
}
export interface Lyrics {
  synced: boolean;
  lines: LyricLine[]; // synced: timed lines; plain: t = 0
}

interface LrcRecord {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

/** "[01:02.34]text" (several stamps per line allowed; [offset:±ms] honoured). */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  let offset = 0;
  for (const raw of lrc.split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
    if (off) {
      offset = Number(off[1]) / 1000;
      continue;
    }
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: Math.max(0, Number(m[1]) * 60 + Number(m[2].replace(':', '.')) - offset), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

// Searches already done in this visit (replays, the next song's lookups): in
// memory only, gone when the page closes.
const seen = new Map<string, unknown>();

async function get<T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T | null> {
  const query = new URLSearchParams(params).toString();
  if (seen.has(query)) return seen.get(query) as T;
  // Our relay first (shared cache), then LRCLIB itself.
  try {
    const r = await fetch(`/api/lyrics?${query}`, { signal });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const data = (await r.json()) as T;
      seen.set(query, data);
      return data;
    }
    log(`lyrics relay → HTTP ${r.status}, asking LRCLIB directly`);
  } catch (err) {
    if (signal.aborted) throw err;
    log(`lyrics relay → ${(err as Error).message}, asking LRCLIB directly`);
  }
  const url = new URL(`${API}/${path}`);
  url.search = query;
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) {
      log(`lyrics ${path} ${params.track_name ?? params.q} → HTTP ${r.status}`);
      return null;
    }
    const data = (await r.json()) as T;
    seen.set(query, data);
    return data;
  } catch (err) {
    if (signal.aborted) throw err;
    log(`lyrics ${path} → ${(err as Error).message}`);
    return null;
  }
}

/** Pick the record for this song: names must match; synced and right length preferred. */
function pick(records: LrcRecord[], title: string, artist: string | null, duration: number): LrcRecord | undefined {
  const fits = records.filter(
    (r) =>
      !r.instrumental &&
      (r.syncedLyrics || r.plainLyrics) &&
      (artist
        ? closeMatch(r.trackName ?? '', title) && artistMatches(r.artistName ?? '', artist)
        : nameInTitle(r.trackName ?? '', r.artistName ?? '', title)),
  );
  const score = (r: LrcRecord) => (r.syncedLyrics ? 0 : 1000) + Math.abs((r.duration ?? 0) - duration);
  return fits.sort((a, b) => score(a) - score(b))[0];
}

/** Look up lyrics for a song, or null. `duration` is the original length (s). */
export async function findLyrics(title: string, artist: string | null, duration: number): Promise<Lyrics | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    if (HAN.test(`${title} ${artist ?? ''}`)) await loadChinese();
    for (const [t, a] of nameReadings(title, artist).slice(0, 4)) {
      const params: Record<string, string> = a ? { track_name: t, artist_name: a } : { q: t };
      const found = (await get<LrcRecord[]>('search', params, ctl.signal)) ?? [];
      const hit = pick(found, t, a, duration);
      log(`lyrics "${t}" / "${a ?? ''}" → ${found.length} results${hit ? `, using ${hit.syncedLyrics ? 'synced' : 'plain'}` : ''}`);
      if (!hit) continue;
      if (hit.syncedLyrics) {
        const lines = parseLrc(hit.syncedLyrics);
        if (lines.length) return { synced: true, lines };
      }
      const plain = (hit.plainLyrics ?? '').split(/\r?\n/).map((text) => ({ t: 0, text: text.trim() }));
      if (plain.some((l) => l.text)) return { synced: false, lines: plain };
    }
    return null;
  } catch (err) {
    log(`lyrics gave up: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- the Lyrics page ----------

export class LyricsView {
  private lyrics: Lyrics | null = null;
  private lineEls: HTMLElement[] = [];
  private current = -1;
  private userScrollUntil = 0;
  /** Shown big (full screen): tapping a line jumps there. */
  expanded = false;
  /** Tapped while small: open the big view. */
  onTap: () => void = () => {};
  /** A sideways swipe on the small widget (the box itself only scrolls up/down). */
  onSwipe: (dir: 1 | -1) => void = () => {};

  constructor(
    private box: HTMLElement,
    private status: HTMLElement,
    private onSeek: (originalSeconds: number) => void,
  ) {
    // Let the reader scroll around; pick the auto-scroll back up after a bit.
    const pause = () => (this.userScrollUntil = performance.now() + 3500);
    box.addEventListener('wheel', pause, { passive: true });
    box.addEventListener('touchmove', pause, { passive: true });
    box.addEventListener('click', (e) => {
      if (this.expanded) {
        const i = this.lineEls.indexOf(e.target as HTMLElement);
        if (i >= 0 && this.lyrics?.synced) {
          this.userScrollUntil = 0;
          this.onSeek(this.lyrics.lines[i].t);
        }
      } else this.onTap();
    });
    let x0 = 0;
    let y0 = 0;
    box.addEventListener(
      'touchstart',
      (e) => {
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
      },
      { passive: true },
    );
    box.addEventListener(
      'touchend',
      (e) => {
        if (this.expanded) return;
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) this.onSwipe(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );
  }

  /** Jump straight to the current line (after the box moved or resized). */
  recenter() {
    this.userScrollUntil = 0;
    const el = this.lineEls[this.current];
    if (el) this.box.scrollTop = el.offsetTop - this.box.clientHeight * 0.38;
    else this.box.scrollTop = 0;
  }

  /** The loaded lyrics when they're timed (for the story's lyrics card). */
  get synced(): Lyrics | null {
    return this.lyrics?.synced && this.lyrics.lines.length ? this.lyrics : null;
  }

  /** Show a state message instead of lyrics. */
  message(text: string) {
    this.lyrics = null;
    this.lineEls = [];
    this.current = -1;
    this.box.replaceChildren();
    this.status.textContent = text;
    this.status.hidden = false;
  }

  show(lyrics: Lyrics, notSyncedText: string) {
    this.lyrics = lyrics;
    this.current = -1;
    this.lineEls = lyrics.lines.map((l) => {
      const p = document.createElement('p');
      p.className = 'ly-line';
      p.textContent = l.text || '♪';
      if (!l.text) p.classList.add('gap');
      return p;
    });
    this.box.replaceChildren(...this.lineEls);
    this.box.classList.toggle('plain', !lyrics.synced);
    this.status.textContent = lyrics.synced ? '' : notSyncedText;
    this.status.hidden = lyrics.synced;
    this.box.scrollTop = 0;
  }

  /** Highlight the line being sung at this point of the original song. */
  update(originalSeconds: number) {
    const ly = this.lyrics;
    if (!ly || !ly.synced || !ly.lines.length) return;
    // Last line that has started (binary search).
    let lo = 0;
    let hi = ly.lines.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ly.lines[mid].t <= originalSeconds + 0.15) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (idx === this.current) return;
    this.lineEls[this.current]?.classList.remove('now');
    this.current = idx;
    this.lineEls.forEach((el, i) => el.classList.toggle('past', i < idx));
    const el = this.lineEls[idx];
    if (!el) return;
    el.classList.add('now');
    if (performance.now() > this.userScrollUntil) {
      // Keep the current line a little above the middle.
      const top = el.offsetTop - this.box.clientHeight * 0.38;
      this.box.scrollTo({ top, behavior: 'smooth' });
    }
  }
}
