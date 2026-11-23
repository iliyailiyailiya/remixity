// The site moved from remixity.pages.dev to remixity.app.
//
// A browser keeps each address's storage apart, so a library made on the old
// address isn't visible on the new one. The old address therefore:
// - forwards straight to remixity.app when it has no library;
// - otherwise offers "Move my library": it opens remixity.app in a new tab
//   and hands it the songs, playlists and settings directly (window to
//   window, on this device; nothing goes through a server), then forwards.

import { t } from './i18n';
import { addTrack, allPlaylists, allTracks, getAudio, savePlaylist, type Playlist, type Track } from './library/db';

// Dev only: port 5179 plays the old address and 5181 the new one.
const DEV = import.meta.env.DEV;
const NEW_ORIGIN = DEV ? 'http://localhost:5181' : 'https://remixity.app';
const OLD_ORIGIN = DEV ? 'http://localhost:5179' : 'https://remixity.pages.dev';

type Msg =
  | { type: 'ready' }
  | { type: 'track'; track: Track; audio: Blob }
  | { type: 'playlist'; playlist: Playlist }
  | { type: 'settings'; items: Record<string, string> }
  | { type: 'done'; total: number }
  | { type: 'progress'; n: number; total: number }
  | { type: 'saved' };

const goNew = () => location.replace(NEW_ORIGIN + location.pathname + location.search + location.hash);

function overlay(): { box: HTMLElement; text: HTMLElement; button: HTMLButtonElement; note: HTMLElement } {
  const box = document.createElement('div');
  box.className = 'move-overlay';
  box.innerHTML = '<div class="move-card"><h2></h2><p class="move-text"></p><button class="primary"></button><p class="hint move-note"></p></div>';
  document.body.append(box);
  box.querySelector('h2')!.textContent = t('moveTitle');
  return {
    box,
    text: box.querySelector('.move-text')!,
    button: box.querySelector('button')!,
    note: box.querySelector('.move-note')!,
  };
}

/** On the old address: forward, or offer to move the library first. */
async function oldSide() {
  let tracks: Track[] = [];
  let playlists: Playlist[] = [];
  try {
    [tracks, playlists] = await Promise.all([allTracks(), allPlaylists()]);
  } catch {
    /* no storage: nothing to move */
  }
  if (!tracks.length && !playlists.length) return goNew();

  const ui = overlay();
  ui.text.textContent = t('moveText').replace('{n}', String(tracks.length));
  ui.button.textContent = t('moveButton');
  ui.note.textContent = t('moveNote');
  ui.button.addEventListener('click', () => {
    const win = window.open(`${NEW_ORIGIN}/?receive-library`, '_blank');
    if (!win) {
      ui.note.textContent = t('moveBlocked');
      return;
    }
    ui.button.disabled = true;
    ui.text.textContent = t('moveWaiting');
    addEventListener('message', async (e: MessageEvent<Msg>) => {
      if (e.origin !== NEW_ORIGIN || e.source !== win) return;
      const m = e.data;
      if (m.type === 'ready') {
        const items: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          items[k] = localStorage.getItem(k) ?? '';
        }
        win.postMessage({ type: 'settings', items } satisfies Msg, NEW_ORIGIN);
        for (const p of playlists) win.postMessage({ type: 'playlist', playlist: p } satisfies Msg, NEW_ORIGIN);
        let sent = 0;
        for (const tr of tracks) {
          const audio = await getAudio(tr.id);
          if (!audio) continue;
          win.postMessage({ type: 'track', track: tr, audio } satisfies Msg, NEW_ORIGIN);
          sent++;
        }
        win.postMessage({ type: 'done', total: sent } satisfies Msg, NEW_ORIGIN);
      } else if (m.type === 'progress') {
        ui.text.textContent = t('moveProgress').replace('{n}', String(m.n)).replace('{total}', String(m.total));
      } else if (m.type === 'saved') {
        ui.text.textContent = t('moveDone');
        setTimeout(goNew, 1200);
      }
    });
  });
}

/** On remixity.app, opened by the old address: take the library in. */
function newSide() {
  // Opened by the old address (or framed by it, which is how it's tested).
  const from = (window.opener as Window | null) ?? (window.parent !== window ? window.parent : null);
  history.replaceState(null, '', location.pathname); // drop ?receive-library
  if (!from) return;
  const ui = overlay();
  ui.button.hidden = true;
  ui.text.textContent = t('moveWaiting');
  let total = 0;
  let saved = 0;
  let expected = -1;
  let chain = Promise.resolve();
  const finish = () => {
    if (expected < 0 || saved < expected) return;
    from.postMessage({ type: 'saved' } satisfies Msg, OLD_ORIGIN);
    ui.text.textContent = t('moveDone');
    setTimeout(() => location.reload(), 1200);
  };
  addEventListener('message', (e: MessageEvent<Msg>) => {
    if (e.origin !== OLD_ORIGIN || e.source !== from) return;
    const m = e.data;
    chain = chain.then(async () => {
      try {
        if (m.type === 'settings') {
          for (const [k, v] of Object.entries(m.items)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
        } else if (m.type === 'playlist') {
          await savePlaylist(m.playlist);
        } else if (m.type === 'track') {
          total++;
          await addTrack(m.track, m.audio);
          saved++;
          ui.text.textContent = t('moveProgress').replace('{n}', String(saved)).replace('{total}', String(Math.max(total, expected)));
          from.postMessage({ type: 'progress', n: saved, total: Math.max(total, expected) } satisfies Msg, OLD_ORIGIN);
        } else if (m.type === 'done') {
          expected = m.total;
        }
      } catch (err) {
        ui.note.textContent = (err as Error).message;
      }
      finish();
    });
  });
  from.postMessage({ type: 'ready' } satisfies Msg, OLD_ORIGIN);
}

export function initMove() {
  if (DEV && !localStorage.getItem('moveTest')) return; // dev: only when testing the move
  if (location.origin === OLD_ORIGIN) void oldSide();
  else if (location.origin === NEW_ORIGIN && new URLSearchParams(location.search).has('receive-library')) newSide();
}
