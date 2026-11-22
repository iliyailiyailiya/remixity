// SoundCloud: connect (OAuth 2.1 Authorization Code + PKCE), upload a track,
// and file it in a "Remixity" playlist.
//
// The audio goes straight from this browser to api.soundcloud.com (the API
// allows CORS); it never touches our server. Only the one-time login code
// goes through /api/sc-token, because SoundCloud requires the app's client
// secret to turn it into a token, and a secret can't live in a web page.
//
// The token is kept in sessionStorage: this tab only, gone when it closes,
// and it is never logged.

const CLIENT_ID = (import.meta.env.VITE_SC_CLIENT_ID as string | undefined) || '';
const API = 'https://api.soundcloud.com';
const AUTHORIZE = 'https://secure.soundcloud.com/authorize';
const TOKEN_KEY = 'sc-token';
const RESULT_KEY = 'sc-auth-result';
export const PLAYLIST_TITLE = 'Remixity';

/** The button only shows once the app is registered and the ID is set. */
export const soundcloudEnabled = CLIENT_ID !== '';

export const redirectUri = () => `${location.origin}/sc-callback.html`;

export class SoundCloudError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = '',
  ) {
    super(message);
  }
}

// ---------- token (this tab only) ----------

interface StoredToken {
  token: string;
  expiresAt: number;
}

export function getToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (!t.token || Date.now() > t.expiresAt - 60_000) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t.token;
  } catch {
    return null;
  }
}

function saveToken(token: string, expiresIn: number) {
  const t: StoredToken = { token, expiresAt: Date.now() + Math.max(60, expiresIn || 3600) * 1000 };
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  } catch {
    /* storage blocked: the token lives only in memory below */
  }
  memoryToken = t;
}
let memoryToken: StoredToken | null = null;

function currentToken(): string | null {
  return getToken() ?? (memoryToken && Date.now() < memoryToken.expiresAt - 60_000 ? memoryToken.token : null);
}

export const isConnected = () => currentToken() !== null;

function forgetToken() {
  memoryToken = null;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- connect (PKCE) ----------

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

interface PendingAuth {
  verifier: string;
  challenge: string;
  state: string;
}
let pending: PendingAuth | null = null;

/**
 * Prepare the PKCE pair ahead of time: the popup has to open synchronously
 * inside the tap, and hashing is async.
 */
export async function prepareConnect() {
  if (pending) return;
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  pending = {
    verifier,
    challenge: b64url(new Uint8Array(digest)),
    state: b64url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

interface AuthResult {
  code?: string;
  state?: string;
  error?: string;
}

/** Open SoundCloud's sign-in. Call directly from a tap (popups need it). */
export function connect(): Promise<void> {
  const p = pending;
  if (!p || !soundcloudEnabled) return Promise.reject(new SoundCloudError('not_ready'));
  pending = null;
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    display: 'popup',
  }).toString();
  try {
    localStorage.removeItem(RESULT_KEY);
  } catch {
    /* ignore */
  }
  const popup = window.open(url.toString(), 'sc-connect', 'width=480,height=720');
  if (!popup) return Promise.reject(new SoundCloudError('popup_blocked'));

  return new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (r: AuthResult) => {
      if (done) return;
      done = true;
      cleanup();
      if (r.error) return reject(new SoundCloudError(r.error === 'access_denied' ? 'denied' : r.error));
      if (!r.code || r.state !== p.state) return reject(new SoundCloudError('bad_state'));
      exchange(r.code, p.verifier).then(resolve, reject);
    };
    // The callback page posts back to us, or (if the opener link was lost,
    // as some mobile browsers do) leaves the result in localStorage.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== 'sc-auth') return;
      finish(e.data as AuthResult);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== RESULT_KEY || !e.newValue) return;
      try {
        finish(JSON.parse(e.newValue) as AuthResult);
      } finally {
        localStorage.removeItem(RESULT_KEY);
      }
    };
    const timer = window.setInterval(() => {
      if (popup.closed && !done) {
        // Give a late storage/message event a moment before giving up.
        window.setTimeout(() => {
          if (!done) {
            done = true;
            cleanup();
            reject(new SoundCloudError('cancelled'));
          }
        }, 800);
        window.clearInterval(timer);
      }
    }, 500);
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
  });
}

async function exchange(code: string, verifier: string) {
  const r = await fetch('/api/sc-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri() }),
  });
  const data = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !data.access_token) throw new SoundCloudError(data.error || 'token_failed', r.status);
  saveToken(data.access_token, data.expires_in ?? 3600);
}

/** Revoke this app's access (SoundCloud requires apps to offer this). */
export async function disconnect() {
  const token = currentToken();
  forgetToken();
  if (!token) return;
  try {
    await fetch(`${API}/disconnect`, { method: 'POST', headers: { Authorization: `OAuth ${token}` } });
  } catch {
    /* best effort: the token is gone from this browser either way */
  }
}

// ---------- API ----------

function authHeader(): Record<string, string> {
  const token = currentToken();
  if (!token) throw new SoundCloudError('not_connected', 401);
  return { Authorization: `OAuth ${token}`, Accept: 'application/json; charset=utf-8' };
}

async function errorFrom(status: number, body: unknown): Promise<SoundCloudError> {
  if (status === 401) forgetToken();
  const b = body as { errors?: { error_message?: string }[]; message?: string; error?: string } | null;
  const msg = b?.errors?.[0]?.error_message || b?.message || b?.error || `HTTP ${status}`;
  return new SoundCloudError(msg, status);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...authHeader(), ...(init.headers ?? {}) } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw await errorFrom(r.status, body);
  return body as T;
}

export interface Me {
  username: string;
  permalink_url?: string;
}
export const getMe = () => api<Me>('/me');

export interface TrackFields {
  title: string;
  description: string;
  tags: string;
  sharing: 'public' | 'private';
}

export interface Track {
  id: number;
  urn?: string;
  permalink_url: string;
  title: string;
}

/** Upload with progress (fetch can't report upload progress, XHR can). */
export function uploadTrack(
  fields: TrackFields,
  audio: File,
  artwork: Blob | null,
  onProgress: (f: number) => void,
): Promise<Track> {
  const headers = authHeader();
  const form = new FormData();
  form.append('track[title]', fields.title);
  form.append('track[sharing]', fields.sharing);
  if (fields.description) form.append('track[description]', fields.description);
  if (fields.tags) form.append('track[tag_list]', fields.tags);
  form.append('track[asset_data]', audio, audio.name);
  if (artwork) form.append('track[artwork_data]', artwork, 'artwork.jpg');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/tracks`);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new SoundCloudError('network'));
    xhr.onload = async () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Track);
      else reject(await errorFrom(xhr.status, body));
    };
    xhr.send(form);
  });
}

interface Playlist {
  id: number;
  title: string;
  permalink_url: string;
  tracks?: { id: number; urn?: string }[];
}

// SoundCloud's guide references playlist tracks by "id", its OpenAPI spec by
// "urn"; send both so either reading works.
const trackRef = (id: number, urn?: string) => ({ id, urn: urn ?? `soundcloud:tracks:${id}` });

/** Put the track in the user's "Remixity" playlist, creating it if needed. */
export async function addToPlaylist(track: Track): Promise<Playlist> {
  let next: string | null = '/me/playlists?limit=200&linked_partitioning=true&show_tracks=false';
  let found: Playlist | null = null;
  while (next && !found) {
    const page: { collection: Playlist[]; next_href?: string | null } = await api(next);
    found = page.collection.find((p) => p.title === PLAYLIST_TITLE) ?? null;
    next = page.next_href ? page.next_href.replace(API, '') : null;
  }
  if (!found) {
    return api<Playlist>('/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlist: { title: PLAYLIST_TITLE, sharing: 'private', tracks: [trackRef(track.id, track.urn)] },
      }),
    });
  }
  // A playlist update replaces the whole track list: send the old ones too.
  const full = await api<Playlist>(`/playlists/${found.id}?show_tracks=true`);
  const tracks = (full.tracks ?? []).map((t) => trackRef(t.id, t.urn));
  if (!tracks.some((t) => t.id === track.id)) tracks.push(trackRef(track.id, track.urn));
  return api<Playlist>(`/playlists/${found.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist: { tracks } }),
  });
}
