// "Fix my library": look every song up (names + cover) with the same search
// the player uses, then show a review list. Nothing changes until "Apply".
//
// Rules, the same as for single songs:
// - a song's own cover stays unless "also replace existing covers" is on;
// - names that only differ in case/punctuation/script aren't "fixed";
// - an artist line that already names the catalogue's artist (and more) stays.

import { t } from '../i18n';
import { findCover, includesArtist, sameName } from '../ui/coverSearch';
import { allTracks, updateTrack, type Track } from './db';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Proposal {
  track: Track;
  title: string | null; // new title, or null = unchanged
  artist: string | null; // new artist line, or null = unchanged
  cover: Blob | null; // new cover, or null = unchanged
  apply: boolean;
}

export interface FixContext {
  showSheet(el: HTMLElement): void;
  closeSheets(): void;
  /** The library changed: redraw it. */
  onApplied(): void;
}

export function initFix(ctx: FixContext) {
  const sheet = $('fixSheet');
  const startBtn = $<HTMLButtonElement>('fixStart');
  const applyBtn = $<HTMLButtonElement>('fixApply');
  const status = $('fixStatus');
  const list = $('fixList');
  const bar = $('fixProgress');
  const replaceCovers = $<HTMLInputElement>('fixReplaceCovers');
  const recheck = $<HTMLInputElement>('fixRecheck');

  let running = false;
  let stop = false;
  let proposals: Proposal[] = [];
  let urls: string[] = [];

  const url = (b: Blob | null) => {
    if (!b) return '';
    const u = URL.createObjectURL(b);
    urls.push(u);
    return u;
  };

  function thumb(b: Blob | null, label: string) {
    const u = url(b);
    if (u) {
      const img = document.createElement('img');
      img.className = 'lib-thumb';
      img.alt = '';
      img.src = u;
      return img;
    }
    const s = document.createElement('span');
    s.className = 'lib-thumb';
    s.textContent = (label.trim()[0] ?? '♪').toUpperCase();
    return s;
  }

  function renderList() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    list.replaceChildren(
      ...proposals.map((p) => {
        const row = document.createElement('label');
        row.className = 'fix-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = p.apply;
        box.addEventListener('change', () => {
          p.apply = box.checked;
          updateApply();
        });
        const thumbs = document.createElement('span');
        thumbs.className = 'fix-thumbs';
        thumbs.append(thumb(p.track.cover, p.track.title));
        if (p.cover) {
          const arrow = document.createElement('span');
          arrow.className = 'fix-arrow';
          arrow.textContent = '→';
          thumbs.append(arrow, thumb(p.cover, p.title ?? p.track.title));
        }
        const text = document.createElement('span');
        text.className = 'lib-text';
        const name = document.createElement('span');
        name.className = 'lib-name';
        name.textContent = p.title ?? p.track.title;
        const by = document.createElement('span');
        by.className = 'lib-sub';
        by.textContent = p.artist ?? p.track.artist ?? t('unknownArtist');
        text.append(name, by);
        if (p.title || p.artist) {
          const old = document.createElement('span');
          old.className = 'fix-old';
          old.textContent = `${p.track.title} — ${p.track.artist ?? t('unknownArtist')}`;
          text.append(old);
        } else if (p.cover) {
          const note = document.createElement('span');
          note.className = 'fix-old plain';
          note.textContent = t('fixNewCover');
          text.append(note);
        }
        row.append(box, thumbs, text);
        return row;
      }),
    );
    updateApply();
  }

  function updateApply() {
    const n = proposals.filter((p) => p.apply).length;
    applyBtn.hidden = proposals.length === 0;
    applyBtn.disabled = n === 0 || running;
    applyBtn.textContent = fill(t('fixApply'), { n });
  }

  async function scan() {
    running = true;
    stop = false;
    proposals = [];
    renderList();
    startBtn.textContent = t('fixStop');
    bar.hidden = false;
    const all = (await allTracks()).filter((tr) => recheck.checked || !tr.checkedAt);
    let checked = 0;
    for (const tr of all) {
      if (stop) break;
      status.textContent = fill(t('fixChecking'), { n: checked + 1, total: all.length });
      (bar.firstElementChild as HTMLElement).style.width = `${Math.round((checked / Math.max(1, all.length)) * 100)}%`;
      const found = await findCover(tr.title, tr.artist);
      checked++;
      await updateTrack(tr.id, { checkedAt: Date.now() });
      if (found) {
        const title = found.title && !sameName(found.title, tr.title) ? found.title : null;
        const artist =
          found.artist && !sameName(found.artist, tr.artist) && !(tr.artist && includesArtist(tr.artist, found.artist))
            ? found.artist
            : null;
        const cover = !tr.cover || replaceCovers.checked ? found.image : null;
        if (title || artist || cover) {
          proposals.push({ track: tr, title, artist, cover, apply: true });
          renderList();
        }
      }
      // Be gentle with the catalogues (MusicBrainz allows ~1 request/second).
      await wait(600);
    }
    running = false;
    bar.hidden = true;
    startBtn.textContent = t('fixStart');
    status.textContent = proposals.length
      ? fill(t('fixDone'), { total: checked, found: proposals.length })
      : checked
        ? t('fixNothing')
        : t('fixAllChecked');
    updateApply();
  }

  startBtn.addEventListener('click', () => {
    if (running) stop = true;
    else void scan();
  });

  applyBtn.addEventListener('click', async () => {
    const chosen = proposals.filter((p) => p.apply);
    for (const p of chosen) {
      const changes: Partial<Track> = {};
      if (p.title) changes.title = p.title;
      if (p.artist) changes.artist = p.artist;
      if (p.cover) Object.assign(changes, { cover: p.cover, coverFound: true });
      await updateTrack(p.track.id, changes);
    }
    proposals = proposals.filter((p) => !p.apply);
    renderList();
    status.textContent = fill(t('fixApplied'), { n: chosen.length });
    ctx.onApplied();
  });

  return {
    open() {
      if (!running) {
        status.textContent = '';
        renderList();
      }
      ctx.showSheet(sheet);
    },
  };
}
