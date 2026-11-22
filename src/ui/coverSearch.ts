// Finds cover art for songs whose files have none: Apple's iTunes catalogue,
// then Deezer's (through our relay), then MusicBrainz + Cover Art Archive.
// (Google Images has no public API.) Only the artist and title are sent,
// never the audio.
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

// Chinese titles come in Traditional (鴿哨) and Simplified (鸽哨) script, and
// catalogues don't agree on which. When a song has Chinese characters we load
// OpenCC's converter (only then, it's ~100 KB) and compare in Simplified.
export const HAN = /[\u3400-\u9fff]/;
let toSimplified: ((s: string) => string) | null = null;
export async function loadChinese() {
  if (toSimplified) return;
  try {
    const { Converter } = await import('opencc-js/t2cn');
    toSimplified = Converter({ from: 't', to: 'cn' });
  } catch {
    log('Chinese converter failed to load');
  }
}
const simplified = (s: string) => (toSimplified && HAN.test(s) ? toSimplified(s) : s);

/** Lowercase letters and digits only, without accents, lookalikes or "feat." parts. */
function norm(s: string): string {
  return simplified(s)
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
    .replace(/\s+\|\s+.*$/, '') // channel tails: "Pattern [Music Video] | GRM Daily"
    .replace(/[([{][^)\]}]*(slowed|reverb|sped|nightcore|remix|official|audio|video|lyric|visuali[sz]er|prod\.?|bass ?boost|8d|hq|hd|shot by|dir\.?|directed|filmed|performance|live)[^)\]}]*[)\]}]/gi, '')
    .replace(/[\s_-]+(processed|mastered|master|final( version)?|copy( \d+)?|exported|export|bounce|mixdown|v\d+)$/i, '') // "lucid-processed", "song_final"
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
export const closeMatch = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && short.length >= long.length * 0.7;
};

/**
 * "Fimiguerrero, Lancey & Len" → ["Fimiguerrero", "Lancey", "Len"]. Files often
 * shorten or reorder collaborators, so each artist is checked on its own.
 */
function artistsOf(artist: string): string[] {
  const parts = artist
    .split(/\s*(?:,|&|\+|\/|;|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b|\baka\b|\bи\b)\s*/i)
    .map((p) => p.trim())
    .filter((p) => norm(p).length >= 2);
  // "Default缺省": a Latin and a Chinese name glued together; try each too.
  const pieces = parts.flatMap((p) =>
    HAN.test(p) && /[a-z]/i.test(p)
      ? (p.match(/[\u3400-\u9fff]+|[^\u3400-\u9fff]+/g) ?? []).map((x) => x.trim()).filter((x) => norm(x).length >= 2)
      : [],
  );
  const all = [...new Set([...parts, ...pieces])];
  return all.length ? all : [artist];
}

/**
 * Without a known artist, a result only counts if both its song name and its
 * artist appear in the text we have ("Toxis JTIM B Soul HA ДЕНЬ"). A title
 * alone matches too many strangers' songs ("Животные" by a kids' channel).
 */
export const nameInTitle = (song: string, by: string, text: string) => {
  const whole = norm(text);
  const s = norm(song);
  const a = norm(by);
  return s.length >= 4 && a.length >= 2 && whole.includes(s) && whole.includes(a);
};

/** The catalogue's artist line contains one of the file's artists. */
export const artistMatches = (catalogue: string, artist: string) =>
  matches(catalogue, artist) || artistsOf(artist).some((a) => matches(catalogue, a));

interface ITunesResult {
  wrapperType?: string;
  artistId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

/** What each request did, for the ?debug panel (no personal data, just URLs). */
export const searchLog: string[] = [];
export const log = (line: string) => {
  searchLog.push(line);
  if (searchLog.length > 40) searchLog.shift();
  window.dispatchEvent(new Event('coversearchlog'));
};

// Some phones/networks can't reach Apple directly ("Load failed"). Then we
// switch to our own relay (functions/api/*) for the rest of the visit.
// ?coverproxy forces the relay, for testing.
let viaRelay = new URLSearchParams(location.search).has('coverproxy');

const isNetworkError = (err: unknown) => err instanceof TypeError; // fetch's "Load failed" / "Failed to fetch"

/** fetch, retried once through our relay if the direct request can't connect. */
async function fetchApple(direct: URL, relay: () => string, signal: AbortSignal): Promise<Response> {
  if (!viaRelay) {
    try {
      return await fetch(direct, { signal });
    } catch (err) {
      if (!isNetworkError(err) || signal.aborted) throw err;
      log(`direct request failed (${(err as Error).message}); using relay`);
      viaRelay = true;
    }
  }
  return fetch(relay(), { signal });
}

async function get(params: Record<string, string>, path: string, signal: AbortSignal): Promise<ITunesResult[]> {
  const url = new URL(`https://itunes.apple.com/${path}`);
  url.search = new URLSearchParams(params).toString();
  const t0 = performance.now();
  try {
    const r = await fetchApple(url, () => `/api/itunes?path=${path}&${url.searchParams}`, signal);
    if (!r.ok) {
      log(`${path} ${params.term ?? params.id} → HTTP ${r.status}`);
      return [];
    }
    const results = ((await r.json()) as { results?: ITunesResult[] }).results ?? [];
    log(`${path} ${params.term ?? params.id} → ${results.length} results, ${Math.round(performance.now() - t0)} ms${viaRelay ? ' (relay)' : ''}`);
    return results;
  } catch (err) {
    log(`${path} ${params.term ?? params.id} → ${(err as Error).name}: ${(err as Error).message}`);
    throw err;
  }
}

/** Pass 1: a plain song search for "artist title". */
async function searchSongs(title: string, artist: string | null, signal: AbortSignal) {
  const main = artist ? artistsOf(artist)[0] : null;
  const results = await get(
    { term: [main, title].filter(Boolean).join(' '), media: 'music', entity: 'song', limit: '15' },
    'search',
    signal,
  );
  return results.find(
    (x) =>
      x.artworkUrl100 &&
      (artist
        ? (matches(x.trackName ?? '', title) || matches(x.collectionName ?? '', title)) &&
          artistMatches(x.artistName ?? '', artist)
        : nameInTitle(x.trackName ?? '', x.artistName ?? '', title)),
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
  const names = artist
    ? artistsOf(artist).slice(0, 3)
    : [words[0], words.slice(0, 2).join(' ')].filter((n, i, a) => n && a.indexOf(n) === i);
  const whole = norm(title);
  for (const name of names) {
    // Many artists share a name ("hako", "HAKO", "HaKo"…): check every matching
    // profile, in one combined lookup to stay quick on mobile data.
    const ids = (await get({ term: name, media: 'music', entity: 'musicArtist', limit: '5' }, 'search', signal))
      .filter((a) => a.artistId && matches(a.artistName ?? '', name))
      .map((a) => a.artistId);
    if (!ids.length) continue;
    {
      const songs = (await get({ id: ids.join(','), entity: 'song', limit: '200' }, 'lookup', signal)).filter(
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

/** Same name apart from case, spaces, punctuation, lookalike letters or script. */
export const sameName = (a: string | null, b: string | null) => norm(a ?? '') === norm(b ?? '');

/** The artist line `full` already includes `part` (e.g. "ARTIFEX27 & axaero" ⊇ "Artifex27"). */
export const includesArtist = (full: string | null, part: string) => {
  const f = norm(full ?? '');
  const p = norm(part);
  return p.length > 0 && f.includes(p);
};

export interface FoundCover {
  image: Blob;
  /** The catalogue's own names for the song, e.g. to tidy a messy file name. */
  title: string;
  artist: string;
}

interface Hit {
  cover: string;
  title: string;
  artist: string;
  source: 'apple' | 'deezer' | 'musicbrainz';
  /** Already downloaded (MusicBrainz: we check the art exists while searching). */
  image?: Blob;
}

/** Apple's catalogue: plain song search, then the artist's full catalogue. */
async function appleHit(t: string, artist: string | null, signal: AbortSignal): Promise<Hit | undefined> {
  const h = (await searchSongs(t, artist, signal)) ?? (await searchCatalogue(t, artist, signal));
  if (!h?.artworkUrl100) return undefined;
  return {
    // The API links a 100px thumbnail; the same path serves bigger sizes.
    cover: h.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1000x1000bb.$1'),
    title: h.trackName ?? '',
    artist: h.artistName ?? '',
    source: 'apple',
  };
}

interface DeezerTrack {
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  album?: { cover_xl?: string };
}

/**
 * Deezer's catalogue, through our relay (Deezer doesn't allow browser
 * requests, and unlike Apple it doesn't rate-limit the relay). Without a
 * known artist, the whole name is searched, then a shortened version.
 */
async function deezerHit(t: string, artist: string | null, signal: AbortSignal): Promise<Hit | undefined> {
  const words = t.split(/\s+/).filter(Boolean);
  const titles = [...new Set([simplified(t), t])];
  const queries = artist
    ? // Each artist (and glued-name piece) with the title, Simplified first.
      [...new Set(artistsOf(artist).slice(0, 3).flatMap((a) => titles.map((x) => `${a} ${x}`)))].slice(0, 6)
    : [...new Set([...titles, words.length > 3 ? `${words[0]} ${words.slice(-2).join(' ')}` : ''])].filter(Boolean);
  const whole = norm(t);
  for (const q of queries) {
    let data: DeezerTrack[] = [];
    const t0 = performance.now();
    try {
      const r = await fetch(`/api/deezer?q=${encodeURIComponent(q)}`, { signal });
      if (!r.ok) {
        log(`deezer ${q} → HTTP ${r.status}`);
        continue;
      }
      data = ((await r.json()) as { data?: DeezerTrack[] }).data ?? [];
      log(`deezer ${q} → ${data.length} results, ${Math.round(performance.now() - t0)} ms`);
    } catch (err) {
      if (signal.aborted) throw err;
      log(`deezer ${q} → ${(err as Error).message}`);
      continue;
    }
    const hit = data.find((x) => {
      const name = x.title_short || x.title || '';
      const by = x.artist?.name ?? '';
      if (!x.album?.cover_xl) return false;
      if (artist) return closeMatch(name, t) && artistMatches(by, artist);
      // No artist: both the song and the artist must appear in the file name.
      return norm(name).length >= 4 && whole.includes(norm(name)) && norm(by).length >= 2 && whole.includes(norm(by));
    });
    if (hit) return { cover: hit.album!.cover_xl!, title: hit.title ?? '', artist: hit.artist?.name ?? '', source: 'deezer' };
  }
  return undefined;
}

interface MbRecording {
  title?: string;
  'artist-credit'?: { name?: string; joinphrase?: string }[];
  releases?: { id: string }[];
}

/**
 * Last resort: MusicBrainz, the open music database, with artwork from the
 * Cover Art Archive. Asked straight from the browser (it allows that, and
 * limits each visitor to about one request per second). Needs an artist.
 */
async function musicbrainzHit(t: string, artist: string | null, signal: AbortSignal): Promise<Hit | undefined> {
  if (!artist) return undefined;
  const main = artistsOf(artist)[0];
  const url = new URL('https://musicbrainz.org/ws/2/recording');
  const quote = (v: string) => v.replace(/["\\]/g, ' ');
  url.search = new URLSearchParams({
    query: `recording:"${quote(t)}" AND artist:"${quote(main)}"`,
    fmt: 'json',
    limit: '10',
  }).toString();
  let recs: MbRecording[] = [];
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) {
      log(`musicbrainz ${main} ${t} → HTTP ${r.status}`);
      return undefined;
    }
    recs = ((await r.json()) as { recordings?: MbRecording[] }).recordings ?? [];
    log(`musicbrainz ${main} ${t} → ${recs.length} results`);
  } catch (err) {
    if (signal.aborted) throw err;
    log(`musicbrainz → ${(err as Error).message}`);
    return undefined;
  }
  const credit = (r: MbRecording) => (r['artist-credit'] ?? []).map((c) => `${c.name ?? ''}${c.joinphrase ?? ''}`).join('');
  const good = recs.filter((r) => closeMatch(r.title ?? '', t) && artistMatches(credit(r), artist));
  const releases = [...new Set(good.flatMap((r) => (r.releases ?? []).map((x) => x.id)))].slice(0, 3);
  for (const id of releases) {
    try {
      const img = await fetch(`https://coverartarchive.org/release/${id}/front-500`, { signal });
      if (!img.ok) continue;
      const image = await img.blob();
      if (!image.type.startsWith('image/')) continue;
      const rec = good.find((r) => r.releases?.some((x) => x.id === id))!;
      return { cover: '', image, title: rec.title ?? t, artist: credit(rec), source: 'musicbrainz' };
    } catch (err) {
      if (signal.aborted) throw err;
    }
  }
  return undefined;
}

/**
 * Look the song up and return its cover (and proper names), or null.
 * Apple first, then Deezer, then MusicBrainz. If Apple can't be reached
 * directly, Deezer goes first (Apple rate-limits our relay).
 * Gives up quietly after a while or on any error.
 */
/**
 * Readings of a possibly messy title/artist tag, most reliable first: a title
 * that starts with the artist ("KORNELL AKA PIERMID-BALLS…", even without
 * spaces around the dash), a title holding "Artist - Song", the names as
 * given, the bare title before any bracket, then the title alone. A trailing
 * uploader credit ("… By Middiwest Music") is only dropped in a later
 * attempt, so "Stand By Me" stays intact first. Shared with the lyrics search.
 */
export function nameReadings(title: string, artist: string | null): [string, string | null][] {
  const t = cleanTitle(title);
  if (!t) return [];
  const readings: [string, string | null][] = [];
  const add = (rt: string, ra: string | null) => {
    readings.push([rt, ra]);
    const noBy = rt.replace(/\s+by\s+\S.*$/i, '').trim();
    if (noBy && noBy !== rt) readings.push([noBy, ra]);
  };
  if (artist) {
    const lead = t.toLowerCase().startsWith(artist.trim().toLowerCase());
    const rest = lead ? cleanTitle(t.slice(artist.trim().length).replace(/^\s*[-–—:|~]\s*/, '')) : '';
    if (rest) add(rest, artist);
  }
  const split = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (split) add(cleanTitle(split[2]), split[1].trim());
  add(t, artist);
  // The bare title before any bracket, e.g. "Pattern (feat. X) [Remix 2]".
  const base = (split ? cleanTitle(split[2]) : t).split(/\s*[([{]/)[0].trim();
  if (base) readings.push([base, split ? split[1].trim() : artist]);
  if (artist) readings.push([t, null]);
  const seen = new Set<string>();
  return readings.filter(([rt, ra]) => {
    const key = `${rt}|${ra ?? ''}`;
    if (!rt || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

export async function findCover(title: string, artist: string | null): Promise<FoundCover | null> {
  for (const [rt, ra] of nameReadings(title, artist)) {
    const found = await findCoverFor(rt, ra);
    if (found) return found;
  }
  return null;
}

async function findCoverFor(t: string, artist: string | null): Promise<FoundCover | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000); // generous for slow mobile data
  const { signal } = ctl;
  try {
    if (HAN.test(`${t} ${artist ?? ''}`)) await loadChinese();
    const apple = () => appleHit(t, artist, signal).catch((err) => (signal.aborted ? Promise.reject(err) : undefined));
    const deezer = () => deezerHit(t, artist, signal);
    const musicbrainz = () => musicbrainzHit(t, artist, signal);
    // Apple → Deezer → MusicBrainz; Deezer first when Apple is unreachable.
    const order = viaRelay ? [deezer, apple, musicbrainz] : [apple, deezer, musicbrainz];
    let hit: Hit | undefined;
    for (const source of order) if ((hit = await source())) break;
    if (!hit) {
      log(`no match for "${t}" / "${artist ?? ''}"`);
      return null;
    }
    log(`match (${hit.source}): ${hit.artist} – ${hit.title}`);
    if (hit.image) return { image: hit.image, title: hit.title, artist: hit.artist };
    const img =
      hit.source === 'apple'
        ? await fetchApple(new URL(hit.cover), () => `/api/art?u=${encodeURIComponent(hit.cover)}`, signal)
        : await fetch(hit.cover, { signal }).catch((err) => {
            if (signal.aborted) throw err;
            return fetch(`/api/art?u=${encodeURIComponent(hit.cover)}`, { signal });
          });
    if (!img.ok) return null;
    const image = await img.blob();
    if (!image.type.startsWith('image/')) return null;
    return { image, title: hit.title, artist: hit.artist };
  } catch (err) {
    log(`gave up: ${(err as Error).name}: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
