// Relay for cover images from Apple (*.mzstatic.com) and Deezer (*.dzcdn.net),
// used only when a visitor's browser can't load them directly. Only https
// URLs on those hosts are accepted. Nothing is stored or logged.

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const raw = new URL(request.url).searchParams.get('u') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (target.protocol !== 'https:' || !/(^|\.)(mzstatic\.com|dzcdn\.net)$/.test(target.hostname))
    return new Response('Forbidden', { status: 403 });

  const r = await fetch(target.toString(), { cf: { cacheTtlByStatus: { '200-299': 604800, '300-599': 0 }, cacheEverything: true } } as RequestInit);
  const type = r.headers.get('Content-Type') ?? '';
  if (!r.ok || !type.startsWith('image/')) return new Response('Not found', { status: 404 });
  return new Response(r.body, {
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' },
  });
};
