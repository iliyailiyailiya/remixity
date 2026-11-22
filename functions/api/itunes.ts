// Relay for Apple's iTunes Search API, used only when a visitor's browser
// can't reach itunes.apple.com directly (some phones/networks block it).
// It forwards the song search and returns Apple's answer. Nothing is stored
// or logged; only a fixed set of search parameters is passed on.

const PATHS = new Set(['search', 'lookup']);
const PARAMS = ['term', 'id', 'media', 'entity', 'limit', 'country'];

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  if (!PATHS.has(path)) return new Response('Bad request', { status: 400 });

  const target = new URL(`https://itunes.apple.com/${path}`);
  for (const p of PARAMS) {
    const v = url.searchParams.get(p);
    if (v !== null && v.length <= 300) target.searchParams.set(p, v);
  }

  // Cloudflare caches identical searches for a day (fewer calls to Apple), and
  // a "too many requests" from Apple (shared Cloudflare IPs) gets one retry.
  const ask = () =>
    fetch(target.toString(), {
      headers: { Accept: 'application/json' },
      cf: { cacheTtlByStatus: { '200-299': 86400, '300-599': 0 }, cacheEverything: true },
    } as RequestInit);
  let r = await ask();
  if (r.status === 429) {
    await new Promise((done) => setTimeout(done, 800));
    r = await ask();
  }
  return new Response(r.body, {
    status: r.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Same search, same answer: let browsers and Cloudflare reuse it for a day.
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
