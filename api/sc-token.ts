// Swaps SoundCloud's one-time login code for an access token.
//
// This is the only server piece of the SoundCloud share, and it exists only
// because SoundCloud requires the app's client secret for the exchange.
// It never receives audio, stores nothing, logs nothing, and drops the
// refresh token (the browser keeps the access token for this tab only).
//
// Env vars (set in Vercel, never committed):
//   SC_CLIENT_ID, SC_CLIENT_SECRET   from soundcloud.com/you/apps
//   SC_REDIRECT_URI                  e.g. https://remixity.vercel.app/sc-callback.html

export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const TOKEN_URL = 'https://secure.soundcloud.com/oauth/token';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const isToken = (v: unknown, max = 512) => typeof v === 'string' && v.length > 0 && v.length <= max;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const { SC_CLIENT_ID, SC_CLIENT_SECRET, SC_REDIRECT_URI } = process.env;
  if (!SC_CLIENT_ID || !SC_CLIENT_SECRET || !SC_REDIRECT_URI) return json({ error: 'not_configured' }, 503);

  // Only our own pages may call this.
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(SC_REDIRECT_URI).origin) return json({ error: 'forbidden' }, 403);

  let body: { code?: unknown; code_verifier?: unknown; redirect_uri?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!isToken(body.code, 2048) || !isToken(body.code_verifier, 128) || body.redirect_uri !== SC_REDIRECT_URI)
    return json({ error: 'bad_request' }, 400);

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: SC_CLIENT_ID,
      client_secret: SC_CLIENT_SECRET,
      redirect_uri: SC_REDIRECT_URI,
      code_verifier: body.code_verifier as string,
      code: body.code as string,
    }),
  });
  const data = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !data.access_token) return json({ error: data.error || 'token_exchange_failed' }, 502);

  return json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600 });
}
