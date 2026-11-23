// Relay + shared cache for LRCLIB (lrclib.net) lyrics searches.
//
// Popular songs are looked up by many people. The first search goes to
// LRCLIB; the answer is kept in Cloudflare's cache (found: 30 days, nothing
// found: 1 day), and everyone after that gets it from the cache, so LRCLIB
// sees each song about once instead of once per listener.
//
// Only the search (artist + title, or a free-text query) is forwarded. What's
// cached is LRCLIB's answer under the normalised search, never who asked.
// Nothing is logged.

const LRCLIB = 'https://lrclib.net/api/search';
// LRCLIB asks apps to identify themselves; a browser can't set this, a server can.
const USER_AGENT = 'THE REMIXITY (https://remixity.app)';
const FOUND_TTL = 30 * 24 * 3600;
const EMPTY_TTL = 24 * 3600;
const MAX_RESULTS = 10;

// Cloudflare's edge cache (types kept minimal: no workers-types package here).
declare const caches: { default: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } };
interface Ctx {
  request: Request;
  waitUntil(p: Promise<unknown>): void;
}

interface LrcRecord {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

/** Same search, same cache entry: case, spacing and accents don't matter. */
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

const toClient = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // The browser keeps nothing: lyrics are only shown while the song is loaded.
      'Cache-Control': 'no-store',
    },
  });

export const onRequest = async ({ request, waitUntil }: Ctx): Promise<Response> => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const track = norm(url.searchParams.get('track_name') ?? '');
  const artist = norm(url.searchParams.get('artist_name') ?? '');
  const q = norm(url.searchParams.get('q') ?? '');
  if ((!track && !q) || track.length > 200 || artist.length > 200 || q.length > 300) return toClient('[]', 400);

  // The cache key: our own address with the normalised search, nothing else.
  const key = new URL('https://remixity.app/api/lyrics-cache');
  if (q) key.searchParams.set('q', q);
  else {
    key.searchParams.set('track_name', track);
    if (artist) key.searchParams.set('artist_name', artist);
  }
  const keyReq = new Request(key.toString());
  const cache = caches.default;
  const hit = await cache.match(keyReq);
  if (hit) return toClient(await hit.text());

  const target = new URL(LRCLIB);
  target.search = key.search;
  let r: Response;
  try {
    r = await fetch(target.toString(), { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  } catch {
    return toClient('[]', 502);
  }
  if (!r.ok) return toClient('[]', r.status === 404 ? 200 : 502); // errors aren't cached

  // Keep only what the app uses, for the closest few results.
  const all = ((await r.json().catch(() => [])) as LrcRecord[]) ?? [];
  const slim = all.slice(0, MAX_RESULTS).map(({ trackName, artistName, duration, instrumental, syncedLyrics, plainLyrics }) => ({
    trackName,
    artistName,
    duration,
    instrumental,
    syncedLyrics: syncedLyrics ?? null,
    // Plain text is only needed when there are no timed lyrics.
    plainLyrics: syncedLyrics ? null : (plainLyrics ?? null),
  }));
  const body = JSON.stringify(slim);
  const ttl = slim.length ? FOUND_TTL : EMPTY_TTL;
  waitUntil(
    cache.put(
      keyReq,
      new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` } }),
    ),
  );
  return toClient(body);
};
