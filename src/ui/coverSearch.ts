// Finds cover art for songs whose files have none, in Apple's iTunes
// catalogue (its search API allows browser requests; Google Images has no
// public API). Only the artist and title are sent, never the audio.
//
// A result is used only if its title (and artist, when we know it) really
// match, so a wrong cover is never shown; otherwise the generated cover stays.

const SETTING_KEY = 'findCovers';

export function findCoversEnabled(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setFindCovers(on: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked: applies to this visit only */
  }
}

// Cyrillic letters that look like Latin ones, folded together so a file
// typed with lookalikes ("HA ДЕНЬ" with a Latin H and A) still matches.
const LOOKALIKE: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p',
  с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j',
};

/** Lowercase letters and digits only, without accents, lookalikes or "feat." parts. */
function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(feat|ft|featuring|prod)\b.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/[авеёкмнорстухіј]/g, (c) => LOOKALIKE[c] ?? c);
}

/** Drop remix/upload noise: "(slowed + reverb)", "[Official Audio]", "(lyrics)"… */
export function cleanTitle(title: string): string {
  return title
    .replace(/[([{][^)\]}]*(slowed|reverb|sped|nightcore|remix|official|audio|video|lyric|visuali[sz]er|prod\.?|bass ?boost|8d|hq|hd)[^)\]}]*[)\]}]/gi, '')
    .replace(/\b\d{5,}\b/g, '') // download/upload IDs like "Blow Me 79435477"
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const matches = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
};

/** Stricter: the names are the same, or one only adds a little to the other. */
const closeMatch = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && short.length >= long.length * 0.7;
};

interface ITunesResult {
  wrapperType?: string;
  artistId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

async function get(params: Record<string, string>, path: string, signal: AbortSignal): Promise<ITunesResult[]> {
  const url = new URL(`https://itunes.apple.com/${path}`);
  url.search = new URLSearchParams(params).toString();
  const r = await fetch(url, { signal });
  if (!r.ok) return [];
  return ((await r.json()) as { results?: ITunesResult[] }).results ?? [];
}

/** Pass 1: a plain song search for "artist title". */
async function searchSongs(title: string, artist: string | null, signal: AbortSignal) {
  const results = await get(
    { term: [artist, title].filter(Boolean).join(' '), media: 'music', entity: 'song', limit: '10' },
    'search',
    signal,
  );
  return results.find(
    (x) =>
      x.artworkUrl100 &&
      (matches(x.trackName ?? '', title) || matches(x.collectionName ?? '', title)) &&
      (!artist || matches(x.artistName ?? '', artist)),
  );
}

/**
 * Pass 2: find the artist, then look through their songs (album tracks
 * included, which the plain search often misses). Without a known artist,
 * the first word or two of the title are tried as the artist, and the song
 * must then appear inside the full name.
 */
async function searchCatalogue(title: string, artist: string | null, signal: AbortSignal) {
  const words = title.split(/\s+/).filter(Boolean);
  const names = artist ? [artist] : [words[0], words.slice(0, 2).join(' ')].filter((n, i, a) => n && a.indexOf(n) === i);
  const whole = norm(title);
  for (const name of names) {
    const artists = (await get({ term: name, media: 'music', entity: 'musicArtist', limit: '3' }, 'search', signal))
      .filter((a) => a.artistId && matches(a.artistName ?? '', name))
      .slice(0, 2);
    for (const a of artists) {
      const songs = (await get({ id: String(a.artistId), entity: 'song', limit: '200' }, 'lookup', signal)).filter(
        (x) => x.wrapperType === 'track' && x.artworkUrl100,
      );
      const hit = artist
        ? songs.find((x) => closeMatch(x.trackName ?? '', title))
        : // No artist: the longest song name found inside the file name (4+ letters, to avoid flukes).
          songs
            .filter((x) => norm(x.trackName ?? '').length >= 4 && whole.includes(norm(x.trackName ?? '')))
            .sort((p, q) => norm(q.trackName ?? '').length - norm(p.trackName ?? '').length)[0];
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Look the song up and return its cover as an image Blob, or null.
 * Gives up quietly after a few seconds or on any error.
 */
export async function findCover(title: string, artist: string | null): Promise<Blob | null> {
  const t = cleanTitle(title);
  if (!t) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const hit = (await searchSongs(t, artist, ctl.signal)) ?? (await searchCatalogue(t, artist, ctl.signal));
    if (!hit?.artworkUrl100) return null;
    // The API links a 100px thumbnail; the same path serves bigger sizes.
    const big = hit.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1000x1000bb.$1');
    const img = await fetch(big, { signal: ctl.signal });
    if (!img.ok) return null;
    const blob = await img.blob();
    return blob.type.startsWith('image/') ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
