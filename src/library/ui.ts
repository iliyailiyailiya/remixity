// The library screen: Songs, Artists (grouped automatically) and Playlists,
// with search, import and per-song / per-playlist menus.

import { t } from '../i18n';
import { allPlaylists, allTracks, deletePlaylist, deleteTrack, newId, savePlaylist, type Playlist, type Track } from './db';
import { importFiles } from './import';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export interface LibraryContext {
  /** Play these songs in this order, starting at `index`. */
  play(ids: string[], index: number): void;
  /** Put a song right after the one playing. */
  playNext(id: string): void;
  currentId(): string | null;
  showSheet(el: HTMLElement): void;
  closeSheets(): void;
}

type Tab = 'songs' | 'artists' | 'playlists';
type Detail = { kind: 'artist'; name: string } | { kind: 'playlist'; id: string } | null;

/** The main artist of a line like "A & B feat. C" (songs are filed under it). */
export function mainArtist(artist: string | null): string {
  const first = (artist ?? '').split(/\s*(?:,|&|\+|\/|;|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b)\s*/i)[0]?.trim();
  return first || '';
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

export function initLibrary(ctx: LibraryContext) {
  const view = $('library');
  const list = $('libList');
  const title = $('libTitle');
  const status = $('libStatus');
  const search = $<HTMLInputElement>('libSearch');
  const empty = $('libEmpty');
  const actions = $('libActions');
  const tabs = $('libTabs');

  let tab: Tab = 'songs';
  let detail: Detail = null;
  let tracks: Track[] = [];
  let playlists: Playlist[] = [];
  let urls: string[] = [];
  let shown: Track[] = []; // the songs on screen, for Play / Shuffle

  const coverUrl = (b: Blob | null) => {
    if (!b) return '';
    const u = URL.createObjectURL(b);
    urls.push(u);
    return u;
  };

  function thumb(cover: Blob | null, label: string, round = false): HTMLElement {
    const u = coverUrl(cover);
    if (u) {
      const img = document.createElement('img');
      img.className = `lib-thumb${round ? ' round' : ''}`;
      img.alt = '';
      img.loading = 'lazy';
      img.src = u;
      return img;
    }
    const d = document.createElement('span');
    d.className = `lib-thumb${round ? ' round' : ''}`;
    d.textContent = (label.trim()[0] ?? '♪').toUpperCase();
    return d;
  }

  function row(opts: { cover: Blob | null; name: string; sub: string; round?: boolean; onClick: () => void; onMore?: () => void; playing?: boolean }) {
    const r = document.createElement('div');
    r.className = `lib-row${opts.playing ? ' playing' : ''}`;
    r.setAttribute('role', 'button');
    r.tabIndex = 0;
    const text = document.createElement('span');
    text.className = 'lib-text';
    const n = document.createElement('span');
    n.className = 'lib-name';
    n.textContent = opts.name;
    const s = document.createElement('span');
    s.className = 'lib-sub';
    s.textContent = opts.sub;
    text.append(n, s);
    r.append(thumb(opts.cover, opts.name, opts.round), text);
    if (opts.onMore) {
      const m = document.createElement('button');
      m.className = 'lib-more';
      m.textContent = '•••';
      m.setAttribute('aria-label', t('more'));
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onMore!();
      });
      r.append(m);
    }
    r.addEventListener('click', opts.onClick);
    r.addEventListener('keydown', (e) => e.key === 'Enter' && opts.onClick());
    return r;
  }

  const matchesQuery = (tr: Track, q: string) =>
    !q || `${tr.title} ${tr.artist ?? ''}`.toLocaleLowerCase().includes(q);

  function songRows(songs: Track[], inPlaylist?: Playlist) {
    shown = songs;
    const current = ctx.currentId();
    return songs.map((tr, i) =>
      row({
        cover: tr.cover,
        name: tr.title,
        sub: tr.artist || t('unknownArtist'),
        playing: tr.id === current,
        onClick: () => {
          ctx.play(songs.map((s) => s.id), i);
          close();
        },
        onMore: () => songMenu(tr, inPlaylist),
      }),
    );
  }

  async function render() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    const q = search.value.trim().toLocaleLowerCase();
    let rows: HTMLElement[] = [];
    shown = [];
    tabs.hidden = detail !== null;
    $('libBack').setAttribute('aria-label', t(detail ? 'back' : 'close'));

    if (detail?.kind === 'artist') {
      const name = detail.name;
      title.textContent = name || t('unknownArtist');
      const songs = tracks.filter((tr) => mainArtist(tr.artist) === name && matchesQuery(tr, q)).sort((a, b) => byText(a.title, b.title));
      rows = songRows(songs);
    } else if (detail?.kind === 'playlist') {
      const pl = playlists.find((p) => p.id === (detail as { id: string }).id);
      if (!pl) {
        detail = null;
        return render();
      }
      title.textContent = pl.name;
      const songs = pl.trackIds.map((id) => tracks.find((tr) => tr.id === id)).filter((x): x is Track => !!x && matchesQuery(x, q));
      rows = songRows(songs, pl);
    } else if (tab === 'songs') {
      title.textContent = t('library');
      rows = songRows(tracks.filter((tr) => matchesQuery(tr, q)).sort((a, b) => byText(a.title, b.title)));
    } else if (tab === 'artists') {
      title.textContent = t('library');
      const groups = new Map<string, Track[]>();
      for (const tr of tracks) {
        const a = mainArtist(tr.artist);
        if (q && !a.toLocaleLowerCase().includes(q) && !matchesQuery(tr, q)) continue;
        groups.set(a, [...(groups.get(a) ?? []), tr]);
      }
      rows = [...groups.entries()]
        .sort(([a], [b]) => (!a ? 1 : !b ? -1 : byText(a, b)))
        .map(([name, songs]) =>
          row({
            cover: songs.find((s) => s.cover)?.cover ?? null,
            name: name || t('unknownArtist'),
            sub: fill(t('songsCount'), { n: songs.length }),
            round: true,
            onClick: () => {
              detail = { kind: 'artist', name };
              search.value = '';
              void render();
            },
          }),
        );
    } else {
      title.textContent = t('library');
      const add = row({ cover: null, name: `＋ ${t('newPlaylist')}`, sub: '', onClick: () => askName(t('newPlaylist'), '', createPlaylist) });
      rows = [
        add,
        ...playlists
          .filter((p) => !q || p.name.toLocaleLowerCase().includes(q))
          .map((p) =>
            row({
              cover: tracks.find((tr) => tr.id === p.trackIds[0])?.cover ?? null,
              name: p.name,
              sub: fill(t('songsCount'), { n: p.trackIds.length }),
              onClick: () => {
                detail = { kind: 'playlist', id: p.id };
                search.value = '';
                void render();
              },
              onMore: () => playlistMenu(p),
            }),
          ),
      ];
    }

    list.replaceChildren(...rows);
    empty.hidden = tracks.length > 0;
    list.hidden = tracks.length === 0 && !(tab === 'playlists' && !detail);
    actions.hidden = shown.length === 0;
    if (tracks.length && !rows.length) status.textContent = t('noMatches');
  }

  async function refresh() {
    [tracks, playlists] = await Promise.all([allTracks(), allPlaylists()]);
    await render();
  }

  // ---------- menus ----------

  function actionSheet(heading: string, items: { label: string; danger?: boolean; run: () => void }[]) {
    $('actionTitle').textContent = heading;
    const box = $('actionList');
    box.replaceChildren(
      ...items.map((it) => {
        const b = document.createElement('button');
        b.textContent = it.label;
        if (it.danger) b.className = 'danger';
        b.addEventListener('click', () => {
          ctx.closeSheets();
          it.run();
        });
        return b;
      }),
    );
    ctx.showSheet($('actionSheet'));
  }

  function songMenu(tr: Track, inPlaylist?: Playlist) {
    const items = [
      { label: t('playNext'), run: () => ctx.playNext(tr.id) },
      { label: t('addToPlaylist'), run: () => pickPlaylist(tr) },
    ];
    if (inPlaylist)
      items.push({
        label: t('removeFromPlaylist'),
        run: async () => {
          await savePlaylist({ ...inPlaylist, trackIds: inPlaylist.trackIds.filter((id) => id !== tr.id) });
          await refresh();
        },
      });
    items.push({
      label: t('deleteSong'),
      danger: true,
      run: async () => {
        if (!confirm(`${t('deleteSong')}: ${tr.title}?`)) return;
        await deleteTrack(tr.id);
        await refresh();
      },
    } as (typeof items)[number]);
    actionSheet(tr.title, items);
  }

  function pickPlaylist(tr: Track) {
    actionSheet(t('addToPlaylist'), [
      ...playlists.map((p) => ({
        label: p.name,
        run: async () => {
          if (!p.trackIds.includes(tr.id)) await savePlaylist({ ...p, trackIds: [...p.trackIds, tr.id] });
          await refresh();
        },
      })),
      { label: `＋ ${t('newPlaylist')}`, run: () => askName(t('newPlaylist'), '', (name) => createPlaylist(name, [tr.id])) },
    ]);
  }

  function playlistMenu(p: Playlist) {
    actionSheet(p.name, [
      { label: t('renamePlaylist'), run: () => askName(t('renamePlaylist'), p.name, async (name) => {
        await savePlaylist({ ...p, name });
        await refresh();
      }) },
      {
        label: t('deletePlaylistAct'),
        danger: true,
        run: async () => {
          if (!confirm(`${t('deletePlaylistAct')}: ${p.name}?`)) return;
          await deletePlaylist(p.id);
          await refresh();
        },
      },
    ]);
  }

  async function createPlaylist(name: string, trackIds: string[] = []) {
    await savePlaylist({ id: newId(), name, trackIds, createdAt: Date.now() });
    await refresh();
  }

  let nameDone: ((name: string) => void) | null = null;
  function askName(heading: string, value: string, then: (name: string) => void) {
    $('nameSheetTitle').textContent = heading;
    const input = $<HTMLInputElement>('nameInput');
    input.value = value;
    nameDone = then;
    ctx.showSheet($('nameSheet'));
    setTimeout(() => input.focus(), 300);
  }
  const saveName = () => {
    const name = $<HTMLInputElement>('nameInput').value.trim();
    if (!name || !nameDone) return;
    const then = nameDone;
    nameDone = null;
    ctx.closeSheets();
    then(name);
  };
  $('nameSave').addEventListener('click', saveName);
  $('nameInput').addEventListener('keydown', (e) => e.key === 'Enter' && saveName());

  // ---------- import ----------

  async function importPicked(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    const res = await importFiles(files, (n, total) => {
      status.textContent = fill(t('libImporting'), { n: Math.min(n + 1, total), total });
    });
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
    status.textContent =
      fill(t('libImported'), { added: res.added.length, skipped: res.skipped }) + (standalone ? '' : ` ${t('libInstallTip')}`);
    detail = null;
    tab = 'songs';
    setTab();
    await refresh();
  }
  $<HTMLInputElement>('libFiles').addEventListener('change', (e) => void importPicked(e.target as HTMLInputElement));
  $<HTMLInputElement>('libFolder').addEventListener('change', (e) => void importPicked(e.target as HTMLInputElement));

  // ---------- navigation ----------

  function setTab() {
    tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  }
  tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      detail = null;
      search.value = '';
      status.textContent = '';
      setTab();
      void render();
    }),
  );
  search.addEventListener('input', () => {
    status.textContent = '';
    void render();
  });
  $('libPlayAll').addEventListener('click', () => {
    if (!shown.length) return;
    ctx.play(shown.map((s) => s.id), 0);
    close();
  });
  $('libShuffle').addEventListener('click', () => {
    if (!shown.length) return;
    const ids = shown.map((s) => s.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    ctx.play(ids, 0);
    close();
  });
  $('libBack').addEventListener('click', () => {
    if (detail) {
      detail = null;
      search.value = '';
      void render();
    } else close();
  });

  function open() {
    view.hidden = false;
    status.textContent = '';
    void refresh();
  }
  function close() {
    view.hidden = true;
  }

  return { open, close, refresh, isOpen: () => !view.hidden };
}
