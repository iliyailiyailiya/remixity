// The "Song info" sheet for library songs: fix a song's title and artist.

import { updateTrack, type Track } from './db';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let pending: ((t: Track | null) => void) | null = null;
let editing: Track | null = null;
let closeFn: () => void = () => {};

async function save() {
  if (!editing || !pending) return;
  const title = $<HTMLInputElement>('trackTitleIn').value.trim() || editing.title;
  const artist = $<HTMLInputElement>('trackArtistIn').value.trim() || null;
  const done = pending;
  pending = null;
  closeFn();
  const updated = await updateTrack(editing.id, { title, artist });
  done(updated ?? null);
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  $('trackSave').addEventListener('click', () => void save());
  for (const id of ['trackTitleIn', 'trackArtistIn'])
    $(id).addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && void save());
}

/** Ask for new names; resolves with the saved song, or null if closed without saving. */
export function editTrackNames(track: Track, showSheet: (el: HTMLElement) => void, closeSheets: () => void): Promise<Track | null> {
  wire();
  pending?.(null);
  editing = track;
  closeFn = closeSheets;
  $<HTMLInputElement>('trackTitleIn').value = track.title;
  $<HTMLInputElement>('trackArtistIn').value = track.artist ?? '';
  showSheet($('trackSheet'));
  return new Promise((resolve) => (pending = resolve));
}
