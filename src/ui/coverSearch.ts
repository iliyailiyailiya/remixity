// Finds cover art for songs whose files have none, in Apple's iTunes
// catalogue (its search API allows browser requests; Google Images has no
// public API). Only the artist and title are sent, never the audio.
//
// A result is used only if its title (and artist, when we know it) really
// match, so a wrong cover is never shown; otherwise the generated cover stays.

const SEARCH = 'https://itunes.apple.com/search';
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

/** Lowercase letters and digits only, without accents or "feat." parts. */
function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(feat|ft|featuring)\b.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
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

interface ITunesResult {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

/**
 * Look the song up and return its cover as an image Blob, or null.
 * Gives up quietly after a few seconds or on any error.
 */
export async function findCover(title: string, artist: string | null): Promise<Blob | null> {
  const t = cleanTitle(title);
  if (!t) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const url = new URL(SEARCH);
    url.search = new URLSearchParams({
      term: [artist, t].filter(Boolean).join(' '),
      media: 'music',
      entity: 'song',
      limit: '10',
    }).toString();
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    const { results = [] } = (await r.json()) as { results?: ITunesResult[] };
    const hit = results.find(
      (x) =>
        x.artworkUrl100 &&
        (matches(x.trackName ?? '', t) || matches(x.collectionName ?? '', t)) &&
        (!artist || matches(x.artistName ?? '', artist)),
    );
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
