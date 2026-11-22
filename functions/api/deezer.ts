// Relay for Deezer's public search API (it doesn't allow browser requests).
// Used to find cover art when Apple's catalogue is unreachable or has no
// match. Only the search text is forwarded; nothing is stored or logged.

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (!q || q.length > 300) return new Response('Bad request', { status: 400 });

  const target = new URL('https://api.deezer.com/search');
  target.searchParams.set('q', q);
  target.searchParams.set('limit', '15');
  const r = await fetch(target.toString(), {
    headers: { Accept: 'application/json' },
    cf: { cacheTtlByStatus: { '200-299': 86400, '300-599': 0 }, cacheEverything: true },
  } as RequestInit);
  return new Response(r.body, {
    status: r.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
};
