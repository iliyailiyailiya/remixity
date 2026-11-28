import './style.css';
import { applyI18n, getLang, Lang, setLang, t } from './i18n';
import { DEFAULT_PARAMS, FxParams } from './engine/chain';
import { decodeData, niceName, quickPart, safeFileName } from './engine/decode';
import { Player } from './engine/player';
import { exportAudio, Format, renderClip, Stage, type RenderAuto } from './engine/render';
import { canRecordVideo, levelsOf, storyImage, storyVideo, type StoryInfo, type StoryStyle } from './ui/story';
import { shareOrDownload } from './library/export';
import { addMarker, assemble, cut, EditState, initialEdit, keepOnly, removeMarker } from './engine/edit';
import { readMeta, songNames, tidyName } from './engine/meta';
import { detectBpm, detectGrid, type BeatGrid } from './engine/bpm';
import { readbackIsNoisy } from './engine/noisecheck';
import { Waveform } from './ui/waveform';
import { EqView } from './ui/eqview';
import { initShare } from './share/ui';
import { initAds } from './ads';
import { findCover, findCoversEnabled, includesArtist, sameName, searchLog, setFindCovers } from './ui/coverSearch';
import { withTags } from './engine/tags';
import { findLyrics, findLyricsEnabled, LyricsView, setFindLyrics } from './ui/lyrics';
import { getAudio, getTrack, updateTrack, type Track } from './library/db';
import { initLibrary } from './library/ui';
import { initMove } from './move';
import { NowPlaying } from './nowPlaying';
import { debugOn, initDebugPanel, npLog } from './debugLog';
import { initFix } from './library/fix';
import { Backdrop } from './ui/backdrop';
import { defaultPalette, generatedCover, paletteFrom } from './ui/palette';
import { Pedal, MAX_RATIO, MIN_RATIO } from './ui/pedal';
import { AUTO_PARAMS, addLane, emptyAutomation, moveLanesWithSection, moveSection, paramsAt, removeLane, split, valueAt, type Automation, type AutoParam, type Lane } from './automation/model';
import { Timeline } from './automation/timeline';
import { deleteTimeline, loadTimeline, saveTimeline, songKey } from './automation/store';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------

const params: FxParams = { ...DEFAULT_PARAMS };
let origBpm: number | null = null;
let detectingBpm = false;
let autoSpace = true; // reverb follows the pedal
// Speed lock: the pedal keeps its speed when the song changes (remembered).
let speedLocked = (() => {
  try {
    return localStorage.getItem('speedLock') === '1';
  } catch {
    return false;
  }
})();
let original: AudioBuffer | null = null; // as decoded, never modified
let buffer: AudioBuffer | null = null; // after trims and cuts; what plays and exports
let edit: EditState = initialEdit(0);
// Undo: how the song's sections and the automation lanes were before each change.
let history: { edit: EditState; lanes: Lane[] }[] = [];
// Automation lanes for the timeline (per song, not saved yet: see docs/automation-plan.md).
let automation = emptyAutomation();
let autoDirty = false; // re-apply the lanes on the next frame
// Saved timeline: which song it belongs to, and whether to keep it (only songs
// whose timeline was opened, so plain Chop edits work as before).
let timelineKey: string | null = null;
let timelineUsed = false;
// The beat grid (detected once per song, or set with "Beat 1 here").
let gridInfo: BeatGrid | null = null;
let gridDetecting = false;
// Quick start: while only the start of the song is decoded, the whole one is
// on its way. Export, stories and chop wait for it (a moment).
let fullReady: Promise<void> | null = null;
let estDuration: number | null = null; // the whole song's length meanwhile (estimated)
let sel: [number, number] | null = null; // selection in buffer seconds
let trackName = '';
// The song's own title/artist (for tags and the cover search).
let songTitle = '';
let songArtist: string | null = null;
let coverIsGenerated = false;
// The cover embedded in the file (kept so a found cover can be undone).
let fileCoverUrl = '';
let coverUrl = '';
let loadToken = 0;
let player: Player | null = null;
let exporting = false;

// Built-in presets set speed and tone; with "follows the pedal" on, the
// reverb comes from the speed (see spaceFor).
const PRESETS: Record<string, Partial<FxParams>> = {
  original: {},
  slowed: { ratio: 0.85, bass: 3 },
  ultra: { ratio: 0.75, bass: 4 },
  nightcore: { ratio: 1.25 },
};

/** The pedal's reverb: slower = bigger, darker space; faster = a touch of air. */
function spaceFor(r: number): Pick<FxParams, 'reverbMix' | 'decay' | 'tone'> {
  if (r < 1) {
    const k = 1 - r;
    return {
      reverbMix: Math.min(0.55, 2.4 * k),
      decay: Math.min(6.5, 1.8 + 12 * k),
      tone: Math.max(0.25, 0.5 - 1.2 * k),
    };
  }
  return { reverbMix: 0.1 * Math.min(1, (r - 1) / 0.25), decay: 1.4, tone: 0.65 };
}

// ---------- background ----------

// Home-screen app (no browser toolbars): see --vh in style.css.
if ((navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches)
  document.documentElement.classList.add('standalone');

const backdrop = new Backdrop($<HTMLCanvasElement>('bg'), defaultPalette());
const glowRed = $('glowRed');
const glowBlue = $('glowBlue');

// ---------- language ----------

const langSels = [$<HTMLSelectElement>('lang'), $<HTMLSelectElement>('lang2')];
for (const s of langSels) {
  s.value = getLang();
  s.addEventListener('change', () => {
    setLang(s.value as Lang);
    langSels.forEach((o) => (o.value = s.value));
    shown.playing = null; // re-label the play buttons in the new language
    render();
  });
}
applyI18n();
initMove();
initDebugPanel();

// ---------- file loading ----------

const fileInput = $<HTMLInputElement>('file');
const home = $('home');
const playerView = $('player');
const status = $('status');

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) {
    setQueue([], 0);
    void load(f);
  }
  fileInput.value = '';
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  home.classList.add('dragover');
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) home.classList.remove('dragover');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  home.classList.remove('dragover');
  const f = e.dataTransfer?.files?.[0];
  if (f) {
    setQueue([], 0);
    void load(f);
  }
});

/** Load a song. `known` = a library song, whose stored names and cover win. */
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Read a file's tags and decode its audio (the slow part of loading a song). */
async function prepare(file: File) {
  const data = await file.arrayBuffer();
  const meta = readMeta(data);
  const decoded = await decodeData(data);
  return { meta, decoded };
}
type Prepared = Awaited<ReturnType<typeof prepare>>;

async function load(file: File, known?: Track, ready?: Promise<Prepared>) {
  flushTimelineSave(); // the previous song's timeline, if a save was pending
  const token = ++loadToken;
  status.textContent = t('loading');
  try {
    // Create the AudioContext inside the user gesture so iOS lets it play.
    if (!player) {
      // Ask for "media playback" audio: keeps playing with the screen
      // locked or the tab in the background, and ignores the silent switch.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      player = new Player(params);
      player.setRepeat(repeatOn);
      player.onEnded = () => {
        if (nextInQueue(true)) return;
        nowPlaying.set(false); // the end of the queue: nothing plays any more
        render();
      };
      player.onInterrupted = () => {
        npLog(`audio interrupted (ctx ${player?.ctx.state})`);
        render();
      };
      player.ctx.addEventListener('statechange', () => npLog(`audio ctx ${player?.ctx.state}`));
      player.onPlay = () => {
        announcePlaying();
        nowPlaying.set(true); // the lock screen's controls follow
      };
    }
    void player.ctx.resume();

    // A new song starts fresh: normal speed, its own BPM, no effects.
    player.pause();
    // (Keep pitch is a way of listening, not a song setting: it carries over.)
    // Locked speed carries over to the next song too.
    Object.assign(params, DEFAULT_PARAMS, { keepPitch: params.keepPitch }, speedLocked ? { ratio: params.ratio } : {});
    autoSpace = true;
    origBpm = null;
    detectingBpm = true;
    apply();

    const name = niceName(file.name);
    let meta: ReturnType<typeof readMeta>;
    let decoded: AudioBuffer;
    let rest: Promise<AudioBuffer> | null = null; // the whole song, when `decoded` is just its start
    let fraction = 1;
    if (ready) ({ meta, decoded } = await ready);
    else {
      const data = await file.arrayBuffer();
      meta = readMeta(data);
      // Keep pitch copies the whole song into the stretcher, so it skips quick start.
      const quick = params.keepPitch ? null : quickPart(data);
      if (quick) {
        const first = decodeData(quick.part).catch(() => null); // started first: it's small
        rest = decodeData(data);
        const head = await first;
        if (head) {
          decoded = head;
          fraction = quick.fraction;
        } else {
          decoded = await rest;
          rest = null;
        }
      } else decoded = await decodeData(data);
    }
    if (token !== loadToken) return;

    original = buffer = decoded;
    edit = initialEdit(decoded.duration);
    history = [];
    automation = emptyAutomation();
    fillLaneMenu(); // the "+ Automation" list follows the lanes
    timelineKey = songKey(known?.id ?? null, file);
    timelineUsed = false;
    gridInfo = null;
    timeline.fit();
    sel = null;
    trackName = tidyName(name) || name;
    player.setLoop(null);
    player.load(decoded);
    estDuration = null;
    fullReady = null;
    $('dash').classList.remove('decoding');
    if (rest) {
      // Playing from the start of the song; the rest arrives in a moment.
      player.provisional = true;
      estDuration = decoded.duration / fraction;
      $('dash').classList.add('decoding');
      const whole = rest;
      fullReady = whole.then(
        (full) => {
          if (token !== loadToken) return;
          player!.extend(full);
          original = buffer = full;
          edit = initialEdit(full.duration);
          history = [];
          automation = emptyAutomation();
          fillLaneMenu(); // the "+ Automation" list follows the lanes
          sel = null;
          wave.setBuffer(full);
          void restoreTimeline(token);
          estDuration = null;
          fullReady = null;
          $('dash').classList.remove('decoding');
          if (page === 'chop') renderEdit();
          void loadLyrics(token);
          startBpm(token, full);
          render();
        },
        (err) => {
          console.error(err);
          if (token !== loadToken) return;
          player!.provisional = false;
          estDuration = null;
          fullReady = null;
          $('dash').classList.remove('decoding');
          status.textContent = t('loadError');
        },
      );
    } else {
      wave.setBuffer(decoded);
      void restoreTimeline(token);
    }

    // Tags from download sites are often wrong; songNames() sorts that out.
    const names = songNames(meta, name);
    const title = known?.title ?? names.title;
    const artistTag = known ? known.artist : names.artist;
    const hasCover = known ? !!known.cover : !!meta.cover;
    const coverBlob = known ? known.cover : meta.cover;
    libraryId = known?.id ?? null;
    $('title').textContent = title;
    $('artist').textContent = artistTag || t('yourTrack');
    document.title = `${title} · THE REMIXITY`;

    // Cover art (or a generated one) drives the background colours.
    const cover = $<HTMLImageElement>('cover');
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    if (fileCoverUrl && fileCoverUrl !== coverUrl) URL.revokeObjectURL(fileCoverUrl);
    coverUrl = URL.createObjectURL(coverBlob ?? (await generatedCover(title)));
    fileCoverUrl = hasCover ? coverUrl : '';
    cover.onerror = async () => {
      // Embedded art the browser can't show: fall back to a generated cover.
      cover.onerror = null;
      URL.revokeObjectURL(coverUrl);
      fileCoverUrl = '';
      coverUrl = URL.createObjectURL(await generatedCover(title));
      cover.src = coverUrl;
      setGeneratedCover(true);
      setAltCover('search');
    };
    cover.onload = async () => {
      // Paint the cover itself as the background (no pixel readback, so it
      // works even where Safari blocks reading canvas pixels).
      backdrop.setImage(cover.src);
      backdrop.setPalette(await paletteFrom(cover)); // CSS fallback, best effort
    };
    cover.src = coverUrl;
    setBlur(false); // blur is per song
    hideNameSuggestion();

    // No cover in the file: look it up by artist and title (just the name).
    songTitle = title;
    songArtist = artistTag;
    setGeneratedCover(!hasCover);
    // A file's own cover is left alone (search on request); without one,
    // the search runs by itself. The 🔍 button is there either way.
    setAltCover('search');
    coverStatus(null);
    if (!hasCover && findCoversEnabled()) void searchCover(token, false);
    if (!rest) void loadLyrics(token); // (with quick start: once the whole song is in, for its length)

    home.hidden = true;
    playerView.hidden = false;
    window.scrollTo(0, 0); // the home screen scrolls; the player is one screen
    status.textContent = '';
    $('downloadLink').hidden = true;
    lastExport = null;
    share.refreshWebShare();
    share.trackChanged();

    origBpm = null;
    detectingBpm = true;
    render();
    updateMediaSession(title, artistTag ?? '');
    if (lyricsOpen) fillLyricsHead();
    setTimeout(showSwipeHint, 700);
    if (!rest) startBpm(token, decoded);
  } catch (err) {
    console.error(err);
    status.textContent = t('loadError');
    home.hidden = false;
    playerView.hidden = true;
  }
}

/** Tempo detection, a moment after playback starts so it doesn't compete with it. */
function startBpm(token: number, decoded: AudioBuffer) {
  wait(1200)
    .then(() => (token === loadToken ? detectBpm(decoded) : null))
    .then((bpm) => {
      if (token === loadToken) origBpm = bpm;
    })
    .catch((err) => console.warn('bpm', err))
    .finally(() => {
      if (token !== loadToken) return;
      detectingBpm = false;
      render();
    });
}

// ---------- pedal ----------

const pedal = new Pedal($('pedal'), (r) => setRatio(r));

function setRatio(r: number) {
  params.ratio = Math.round(Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)) * 100000) / 100000;
  apply();
}

// ---------- transport ----------

const playToggles = document.querySelectorAll<HTMLButtonElement>('.play-toggle');
playToggles.forEach((b) => b.addEventListener('click', togglePlay));
$('cover').addEventListener('click', togglePlay);

// ---------- repeat, cover blur, cover search ----------

const repeatBtn = $<HTMLButtonElement>('repeatBtn');
let repeatOn = false;
repeatBtn.addEventListener('click', () => {
  repeatOn = !repeatOn;
  player?.setRepeat(repeatOn);
  repeatBtn.setAttribute('aria-pressed', String(repeatOn));
});

const blurBtn = $<HTMLButtonElement>('blurBtn');
function setBlur(on: boolean) {
  blurBtn.setAttribute('aria-pressed', String(on));
  $('coverFrame').classList.toggle('blurred', on);
}
blurBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // not a play/pause tap on the cover
  setBlur(blurBtn.getAttribute('aria-pressed') !== 'true');
});

// ---------- song info: fix the title/artist (names the export, finds covers) ----------

const infoSheet = $('infoSheet');
const infoTitleIn = $<HTMLInputElement>('infoTitle');
const infoArtistIn = $<HTMLInputElement>('infoArtist');
function openInfo() {
  if (!buffer) return;
  infoTitleIn.value = songTitle;
  infoArtistIn.value = songArtist ?? '';
  showSheet(infoSheet);
}
$('editInfo').addEventListener('click', openInfo);
$('editInfo').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openInfo();
  }
});

async function saveInfo() {
  closeSheets();
  await applyNames(infoTitleIn.value.trim() || songTitle, infoArtistIn.value.trim() || null);
}

/** Rename the song everywhere: player, export name/tags, lock screen. */
async function applyNames(newTitle: string, newArtist: string | null) {
  hideNameSuggestion();
  if (newTitle === songTitle && newArtist === songArtist) return;
  songTitle = newTitle;
  songArtist = newArtist;
  trackName = newArtist ? `${newArtist} - ${newTitle}` : newTitle;
  $('title').textContent = newTitle;
  $('artist').textContent = newArtist ?? t('yourTrack');
  document.title = `${newTitle} · THE REMIXITY`;
  void loadLyrics(loadToken); // the right names may find lyrics now
  if (libraryId) void updateTrack(libraryId, { title: newTitle, artist: newArtist });
  // Export details and the SoundCloud review start over from the new names.
  exportKey = '';
  fileEdited = false;
  share.trackChanged();
  updateMediaSession(newTitle, newArtist ?? '');

  // Still on a generated cover: redraw it with the new title, then search.
  if (coverIsGenerated) {
    const token = loadToken;
    const blob = await generatedCover(newTitle);
    if (token !== loadToken) return;
    URL.revokeObjectURL(coverUrl);
    coverUrl = URL.createObjectURL(blob);
    $<HTMLImageElement>('cover').src = coverUrl;
    void searchCover(token, true);
  }
}
$('infoSave').addEventListener('click', () => void saveInfo());
for (const el of [infoTitleIn, infoArtistIn])
  el.addEventListener('keydown', (e) => e.key === 'Enter' && void saveInfo());

const findBox = $<HTMLInputElement>('findCovers');
findBox.checked = findCoversEnabled();
findBox.addEventListener('change', () => setFindCovers(findBox.checked));

// ---------- library + queue (⏮ ⏭, auto-advance, lock screen) ----------

let queue: string[] = []; // library song ids
let queueIndex = 0;
let libraryId: string | null = null; // the library song that's loaded, if any
const prevBtn = $<HTMLButtonElement>('prevTrack');
const nextBtn = $<HTMLButtonElement>('nextTrack');

function updateTrackButtons() {
  const on = queue.length > 1;
  prevBtn.hidden = nextBtn.hidden = !on;
  nextBtn.disabled = queueIndex >= queue.length - 1;
}

function setQueue(ids: string[], index: number) {
  queue = ids;
  queueIndex = index;
  updateTrackButtons();
}

// The next song in the queue, fetched ahead of time: its file right after
// the current song starts (cheap: the browser keeps it on disk), and decoded
// during the current song's last 30 seconds, so auto-advance is instant.
// Only one song is ever held ahead, to keep memory in check.
interface Ahead {
  id: string;
  track: Track;
  file: File;
  ready?: Promise<Prepared>;
}
let ahead: Ahead | null = null;

async function fetchAhead() {
  const id = queue[queueIndex + 1];
  if (!id) return (ahead = null);
  if (ahead?.id === id) return;
  ahead = null;
  const [track, audio] = await Promise.all([getTrack(id), getAudio(id)]);
  if (!track || !audio || queue[queueIndex + 1] !== id) return;
  ahead = { id, track, file: new File([audio], track.fileName, { type: track.type }) };
}

function decodeAhead() {
  const a = ahead;
  // (Only while a queue song is playing, not a file opened on its own.)
  if (!a || a.ready || a.id !== queue[queueIndex + 1] || libraryId !== queue[queueIndex]) return;
  a.ready = prepare(a.file);
  a.ready.catch(() => {
    if (ahead === a) ahead = null;
  });
}

/** Load (and by default start) the queue's song at `index`. */
async function playFromQueue(index: number, autoplay = true): Promise<boolean> {
  const id = queue[index];
  npLog(`playFromQueue(${index}) of ${queue.length}`);
  if (!id) return false;
  // Start the lock screen's media element now, before anything is awaited:
  // iOS only lets it start inside the tap itself. (Loading and decoding come
  // after, and by then iOS refused, so the lock-screen buttons never worked
  // for songs started from the library.)
  if (autoplay) nowPlaying.set(true);
  queueIndex = index;
  updateTrackButtons();
  let track: Track | undefined;
  let file: File;
  let ready: Promise<Prepared> | undefined;
  if (ahead?.id === id) {
    ({ track, file, ready } = ahead);
    ahead = null;
  } else {
    const [t, audio] = await Promise.all([getTrack(id), getAudio(id)]);
    if (!t || !audio) {
      nowPlaying.set(!!player?.playing); // nothing new to play after all
      return false;
    }
    track = t;
    file = new File([audio], t.fileName, { type: t.type });
  }
  await load(file, track, ready);
  if (queue[queueIndex] !== id) return true;
  if (autoplay && player && !player.playing) {
    player.play();
    render();
  }
  void fetchAhead();
  return true;
}

/** Go to the next song; returns false at the end of the queue. */
function nextInQueue(_auto: boolean): boolean {
  if (queueIndex + 1 >= queue.length) return false;
  void playFromQueue(queueIndex + 1);
  return true;
}

/** Like every player: back to the start first, then the previous song. */
async function prevInQueue() {
  if (player && (player.position > 3 || queueIndex === 0)) {
    player.seek(0);
    render();
    return;
  }
  await playFromQueue(queueIndex - 1);
}

prevBtn.addEventListener('click', () => void prevInQueue());
nextBtn.addEventListener('click', () => void nextInQueue(false));

// While the library is open, it covers everything: hide what's under it
// (no blur needed on top) and hold the background still.
function libraryOpen() {
  return !document.getElementById('library')!.hidden;
}
new MutationObserver(() => {
  const open = libraryOpen();
  document.body.classList.toggle('library-open', open);
  if (!openSheet) backdrop.covered = open;
}).observe(document.getElementById('library')!, { attributes: true, attributeFilter: ['hidden'] });

const library = initLibrary({
  play: (ids, index) => {
    setQueue(ids, index);
    void playFromQueue(index);
  },
  playNext: (id) => {
    if (!queue.length) {
      if (libraryId) queue = [libraryId];
      else {
        setQueue([id], 0);
        void playFromQueue(0);
        return;
      }
    }
    queue = queue.filter((q, i) => q !== id || i === queueIndex);
    queue.splice(queueIndex + 1, 0, id);
    updateTrackButtons();
  },
  currentId: () => libraryId,
  showSheet,
  closeSheets,
});
$('openLibrary').addEventListener('click', () => library.open());
const fixer = initFix({ showSheet, closeSheets, onApplied: () => void library.refresh() });
$('libFix').addEventListener('click', () => fixer.open());
$('openLibraryHome').addEventListener('click', () => library.open());

// ---------- lyrics (LRCLIB), synced to the original song's time ----------

/** Edited-timeline seconds → original song seconds (chop cuts shift time). */
function toOriginal(pos: number): number {
  let t = 0;
  for (const s of edit.segments) {
    const len = s.end - s.start;
    if (pos < t + len) return s.start + (pos - t);
    t += len;
  }
  const last = edit.segments[edit.segments.length - 1];
  return last ? last.end : pos;
}
/** Original song seconds → edited timeline (a cut-out moment maps to the next kept one). */
function fromOriginal(orig: number): number {
  let t = 0;
  for (const s of edit.segments) {
    if (orig < s.start) return t;
    if (orig < s.end) return t + (orig - s.start);
    t += s.end - s.start;
  }
  return t;
}

const lyricsView = new LyricsView($('lyricsBox'), $('lyricsStatus'), (orig) => {
  if (!player) return;
  player.seek(fromOriginal(orig));
  render();
});
lyricsView.onSwipe = (dir) => goPage(pageIndex() + dir);

// Big lyrics: tap the widget. The same lyrics box moves into the full view
// and back, so it keeps following the song.
const lyricsFull = $('lyricsFull');
const lyricsWrap = $('lyricsWrap');
const lyricsHome = lyricsWrap.parentElement!;
let lyricsOpen = false;

function fillLyricsHead() {
  $('lyFullTitle').textContent = $('title').textContent;
  $('lyFullArtist').textContent = $('artist').textContent;
  $<HTMLImageElement>('lyFullCover').src = $<HTMLImageElement>('cover').src;
}

function openLyrics() {
  if (lyricsOpen) return;
  lyricsOpen = true;
  fillLyricsHead();
  $('lyricsFullBody').append(lyricsWrap);
  lyricsFull.hidden = false;
  document.body.classList.add('lyrics-open');
  lyricsView.expanded = true;
  requestAnimationFrame(() => lyricsView.recenter());
}

function closeLyrics() {
  if (!lyricsOpen) return;
  lyricsOpen = false;
  lyricsFull.hidden = true;
  document.body.classList.remove('lyrics-open');
  lyricsHome.append(lyricsWrap);
  lyricsView.expanded = false;
  requestAnimationFrame(() => lyricsView.recenter());
}

lyricsView.onTap = openLyrics;
$('lyricsClose').addEventListener('click', closeLyrics);

async function loadLyrics(token: number) {
  if (!original) return;
  if (!findLyricsEnabled()) return lyricsView.message(t('lyricsOff'));
  lyricsView.message(t('lyricsLoading'));
  const found = await findLyrics(songTitle, songArtist, original.duration);
  if (token !== loadToken) return;
  if (found) lyricsView.show(found, t('lyricsNotSynced'));
  else lyricsView.message(t('lyricsNone'));
}

const lyricsBox = $<HTMLInputElement>('findLyrics');
lyricsBox.checked = findLyricsEnabled();
lyricsBox.addEventListener('change', () => {
  setFindLyrics(lyricsBox.checked);
  void loadLyrics(loadToken);
});

// ---------- finding a missing cover ----------

const findCoverBtn = $<HTMLButtonElement>('findCoverBtn');
const findCoverLabel = $('findCoverLabel');

function setGeneratedCover(generated: boolean) {
  coverIsGenerated = generated;
}

// The pill on the cover only reports what the search is doing.
let statusTimer = 0;
function coverStatus(text: string | null, hideAfter = 0) {
  clearTimeout(statusTimer);
  findCoverBtn.hidden = !text;
  findCoverBtn.disabled = true;
  if (text) findCoverLabel.textContent = text;
  if (text && hideAfter) statusTimer = window.setTimeout(() => (findCoverBtn.hidden = true), hideAfter);
}

/** Search for the current song's cover; swap it in if a real match turns up. */
async function searchCover(token: number, manual: boolean) {
  altCoverBtn.disabled = true;
  coverStatus(t('findingCover'));
  const found = await findCover(songTitle, songArtist);
  if (token !== loadToken) return;
  altCoverBtn.disabled = false;
  if (!found) {
    coverStatus(manual ? t('noCoverFound') : null, 2500);
    return;
  }
  coverStatus(null);
  showCover(URL.createObjectURL(found.image));
  if (libraryId) void updateTrack(libraryId, { cover: found.image, coverFound: true });
  setGeneratedCover(false);
  // A file's own cover can be brought back; a generated one isn't worth it.
  setAltCover(fileCoverUrl ? 'restore' : 'search');
  updateMediaSession(songTitle, songArtist ?? '');
  suggestNames(found.title, found.artist);
}

/** Put a new cover in place (the file's own cover is kept for "restore"). */
function showCover(url: string) {
  const cover = $<HTMLImageElement>('cover');
  cover.onerror = null;
  if (coverUrl && coverUrl !== fileCoverUrl) URL.revokeObjectURL(coverUrl);
  coverUrl = url;
  cover.src = url; // onload repaints the background
}

// ---------- the search button on every cover (and "restore" after a swap) ----------

const altCoverBtn = $<HTMLButtonElement>('altCoverBtn');
function setAltCover(mode: 'search' | 'restore' | null) {
  altCoverBtn.hidden = mode === null;
  altCoverBtn.disabled = false;
  altCoverBtn.classList.toggle('restore', mode === 'restore');
  const label = t(mode === 'restore' ? 'restoreCover' : 'findOtherCover');
  altCoverBtn.setAttribute('aria-label', label);
  altCoverBtn.title = label;
}
altCoverBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // not a play/pause tap on the cover
  if (altCoverBtn.classList.contains('restore')) {
    showCover(fileCoverUrl);
    hideNameSuggestion();
    setAltCover('search');
    return;
  }
  void searchCover(loadToken, true);
});

// ---------- "Use these names?" (the catalogue's names for a messy file) ----------

const nameSuggest = $('nameSuggest');
let suggestion: { title: string; artist: string } | null = null;

function suggestNames(title: string, artist: string) {
  if (!title) return;
  // Keep what's already right: a title that only differs in case/punctuation
  // ("Виновата сама" vs "Виновата сама.."), or an artist line that already
  // names the catalogue's artist and more ("ARTIFEX27 & axaero" vs "Artifex27").
  const newTitle = sameName(title, songTitle) ? songTitle : title;
  const newArtist = !artist || (songArtist && includesArtist(songArtist, artist)) ? songArtist ?? artist : artist;
  if (newTitle === songTitle && newArtist === songArtist) return;
  suggestion = { title: newTitle, artist: newArtist ?? '' };
  title = suggestion.title;
  artist = suggestion.artist;
  $('suggestTitle').textContent = title;
  $('suggestArtist').textContent = artist;
  nameSuggest.hidden = false;
}
function hideNameSuggestion() {
  suggestion = null;
  nameSuggest.hidden = true;
}
$('suggestUse').addEventListener('click', (e) => {
  e.stopPropagation();
  if (suggestion) void applyNames(suggestion.title, suggestion.artist || null);
});
$('suggestNo').addEventListener('click', (e) => {
  e.stopPropagation();
  hideNameSuggestion();
});

// Your own picture as the cover (for songs no catalogue has).
const coverFileIn = $<HTMLInputElement>('coverFile');
$('chooseCoverBtn').addEventListener('click', (e) => e.stopPropagation()); // not a play/pause tap
$('chooseCoverBtn').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    coverFileIn.click();
  }
});
coverFileIn.addEventListener('change', () => {
  const file = coverFileIn.files?.[0];
  coverFileIn.value = '';
  if (!file || !file.type.startsWith('image/') || !buffer) return;
  showCover(URL.createObjectURL(file));
  if (libraryId) void updateTrack(libraryId, { cover: file, coverFound: true });
  setGeneratedCover(false);
  if (fileCoverUrl) setAltCover('restore');
  hideNameSuggestion();
  updateMediaSession(songTitle, songArtist ?? '');
});

function togglePlay() {
  if (!player || !buffer) return;
  npLog(`togglePlay → ${player.playing ? 'pause' : 'play'}`);
  if (player.playing) player.pause();
  else player.play();
  nowPlaying.set(player.playing);
  render();
}

// The timeline runs off one loop that never stops (cheap when paused), so
// nothing that restarts playback (seek, skip, loop) can leave it frozen.
function tick() {
  requestAnimationFrame(tick); // schedule first: an error below can't stop the loop
  if (!player || document.hidden) return;
  try {
    renderTransport();
  } catch (err) {
    console.error(err);
  }
}
requestAnimationFrame(tick);

// Lock screen / Control Center / headphone buttons.
// The cover for the lock screen as a data: URL. The lock screen and Dynamic
// Island are drawn by another process that can't open this page's blob: URLs
// (that's why they showed a white square), but it can read image data.
let artFor = '';
let artData = '';
async function lockScreenArt(): Promise<string> {
  if (!coverUrl) return '';
  if (artFor === coverUrl) return artData;
  const src = coverUrl;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    artFor = src;
    artData = c.toDataURL('image/jpeg', 0.86);
  } catch {
    artFor = src;
    artData = '';
  }
  return artData;
}

function updateMediaSession(title: string, artist: string) {
  if (!('mediaSession' in navigator)) return;
  const set = (art: string) => {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'THE REMIXITY',
      artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
  };
  set(artFor === coverUrl ? artData : '');
  void lockScreenArt().then((art) => {
    // Still the same song? Then add the cover.
    if (art && navigator.mediaSession.metadata?.title === title) set(art);
  });
}
/**
 * Attach the lock-screen buttons. Also called again when iOS resets its
 * widget (see nowPlaying.onLoop): it then forgets them and shows ⏪ ⏩.
 */
function registerMediaHandlers() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const on = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
    try {
      ms.setActionHandler(
        a,
        h &&
          ((d) => {
            npLog(`LOCK SCREEN: ${a}`);
            h(d);
          }),
      );
    } catch (err) {
      npLog(`setActionHandler(${a}) failed: ${(err as Error)?.message}`);
    }
  };
  on('play', () => player && !player.playing && togglePlay());
  on('pause', () => player?.playing && togglePlay());
  // No seek ±10 s handlers: when they exist, iOS shows ⏪ ⏩ (skip seconds)
  // instead of ⏮ ⏭, and the lock screen can't change the song.
  on('seekbackward', null);
  on('seekforward', null);
  on('previoustrack', () => void prevInQueue());
  on('nexttrack', () => void nextInQueue(false));
  on('seekto', (d) => {
    if (!player || d.seekTime === undefined) return;
    player.seek(d.seekTime * params.ratio);
    render();
  });
}
registerMediaHandlers();

// It's an app, not a document: no pinch zoom (iOS ignores user-scalable).
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());

// Coming back to the page: wake the audio if the system parked it.
// Only one copy of the app plays at a time: another tab, the home-screen
// app, or an old page that kept running after a reload. Whichever starts
// playing tells the others to pause.
const appId = Math.random().toString(36).slice(2);
let others: BroadcastChannel | null = null;
try {
  others = new BroadcastChannel('remixity-playback');
  others.onmessage = (e: MessageEvent<{ playing?: string }>) => {
    if (e.data?.playing && e.data.playing !== appId && player?.playing) {
      player.pause();
      render();
    }
  };
} catch {
  /* not supported */
}
function announcePlaying() {
  try {
    others?.postMessage({ playing: appId });
  } catch {
    /* closed */
  }
}

// The site was updated after this page opened, and a piece it loads later
// (like the story encoder) isn't there any more: reload to the new version,
// unless music is playing (then say so instead of cutting the song off).
let staleApp = false;
addEventListener('vite:preloadError', (e) => {
  staleApp = true;
  if (player?.playing) return; // the error goes on to whatever asked; it shows a message
  try {
    if (Date.now() - Number(sessionStorage.getItem('staleReload') || 0) < 30_000) return; // no loops
    sessionStorage.setItem('staleReload', String(Date.now()));
  } catch {
    /* storage blocked: reload anyway */
  }
  e.preventDefault();
  location.reload();
});

// Leaving or reloading the page: silence it for good. (On iPhone, with the
// "playback" audio session, the old page's sound could otherwise keep going
// after a reload, unseen, and play on top of the next song.)
addEventListener('pagehide', (e) => {
  if (!e.persisted) others?.close();
  if (!player) return;
  player.pause();
  if (e.persisted) void player.ctx.suspend(); // may come back from the back/forward cache
  else void player.ctx.close();
});
addEventListener('pageshow', (e) => {
  if (e.persisted && player) render();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && player?.playing && player.ctx.state !== 'running') void player.ctx.resume();
});

// Progress bar: drag to scrub, seek on release.
const barEl = $('bar');
let scrubbing: number | null = null;
const barFrac = (x: number) => {
  const r = barEl.getBoundingClientRect();
  return Math.max(0, Math.min(1, (x - r.left) / r.width));
};
barEl.addEventListener('pointerdown', (e) => {
  if (!player) return;
  try {
    barEl.setPointerCapture(e.pointerId);
  } catch {
    /* pointer already gone */
  }
  barEl.classList.add('active');
  scrubbing = barFrac(e.clientX);
  renderTransport();
});
barEl.addEventListener('pointermove', (e) => {
  if (scrubbing === null) return;
  scrubbing = barFrac(e.clientX);
  renderTransport();
});
const endScrub = () => {
  if (scrubbing === null || !player) return;
  player.seek(scrubbing * (estDuration ?? player.duration));
  scrubbing = null;
  barEl.classList.remove('active');
  render();
};
barEl.addEventListener('pointerup', endScrub);
barEl.addEventListener('pointercancel', endScrub);
barEl.addEventListener('lostpointercapture', endScrub); // Safari can drop the pointer silently

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (e.key === 'Escape' && lyricsOpen) {
    closeLyrics();
    return;
  }
  if (e.key === 'Escape' && openSheet) {
    closeSheets();
    return;
  }
  if (tag === 'INPUT' || tag === 'SELECT' || !buffer) return;
  if ((e.target as HTMLElement).closest('.pedal')) return; // the pedal handles its own keys
  const mod = e.metaKey || e.ctrlKey;
  if (e.code === 'Space' && tag !== 'BUTTON') togglePlay();
  else if (mod && e.code === 'KeyZ') undo();
  else if (mod || e.altKey) return;
  else if (e.code === 'ArrowUp') setRatio(params.ratio + 0.01);
  else if (e.code === 'ArrowDown') setRatio(params.ratio - 0.01);
  else if (e.code === 'ArrowLeft') skip(-10);
  else if (e.code === 'ArrowRight') skip(10);
  else if (e.code === 'KeyM') markerAtPlayhead();
  else if (e.code === 'KeyL') toggleLoop();
  else if (e.code === 'Delete' || e.code === 'Backspace') cutSelection();
  else if (e.code === 'Escape') clearSelection();
  else return;
  e.preventDefault();
});

// ---------- sheets ----------

const scrim = $('sheetScrim');
let openSheet: HTMLElement | null = null;

function showSheet(sheet: HTMLElement) {
  closeSheets();
  openSheet = sheet;
  backdrop.covered = true; // the sheet covers the screen: hold the background still
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  scrim.classList.add('open');
  renderEdit();
}
let storyAbort: AbortController | null = null; // a story video being recorded
function closeSheets() {
  storyAbort?.abort(); // closing the story sheet stops a recording
  for (const s of document.querySelectorAll<HTMLElement>('.sheet')) {
    s.classList.remove('open');
    s.setAttribute('aria-hidden', 'true');
  }
  scrim.classList.remove('open');
  openSheet = null;
  backdrop.covered = libraryOpen();
}
scrim.addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
$('openMenu').addEventListener('click', () => showSheet($('menu')));
// ---------- story for Instagram (image or video) ----------

const storyCanvas = $<HTMLCanvasElement>('storyCanvas');
const storyStatus = $('storyStatus');
const storyBar = $('storyProgress');
const storyCreate = $<HTMLButtonElement>('storyCreate');
const storyShare = $<HTMLButtonElement>('storyShare');
let storyFile: File | null = null;

const storyKind = () => document.querySelector<HTMLInputElement>('input[name="storyKind"]:checked')!.value;

const storyStart = $<HTMLInputElement>('storyStart');
let storyColors: StoryInfo['colors'];
const picked = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';

/** Where in the song the story begins: the slider (it starts where you are). */
function storyStartAt(seconds: number): number {
  if (!buffer) return 0;
  return Math.max(0, Math.min(Number(storyStart.value), buffer.duration - seconds * params.ratio));
}

/** A short piece of the song as it is, for the still's "Waves" bars. */
function sliceOf(b: AudioBuffer, start: number, seconds: number): AudioBuffer {
  const from = Math.floor(start * b.sampleRate);
  const n = Math.max(1, Math.min(b.length - from, Math.floor(seconds * b.sampleRate)));
  const out = new AudioBuffer({ length: n, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
  for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(from, from + n), c);
  return out;
}

/** The story's details. `start` = where in the song (buffer seconds) it begins. */
function storyInfo(start: number): StoryInfo {
  const r = params.ratio;
  const synced = lyricsView.synced;
  let style = picked('storyStyle') as StoryStyle;
  if (style === 'lyrics' && !synced) style = 'card';
  return {
    title: $('title').textContent || trackName,
    artist: $('artist').textContent === t('yourTrack') ? '' : $('artist').textContent || '',
    cover: $<HTMLImageElement>('cover'),
    badge: !$<HTMLInputElement>('storyBadge').checked || Math.abs(r - 1) < 0.005 ? '' : $('badge').textContent || '',
    style,
    bg: picked('storyBg') as StoryInfo['bg'],
    colors: storyColors,
    subtitles: $<HTMLInputElement>('storySubs').checked,
    ratio: r,
    levels: style === 'waves' && buffer ? levelsOf(sliceOf(buffer, start, 2)) : undefined,
    lyrics: synced
      ? { lines: synced.lines, at: (s: number) => toOriginal(Math.min(start + s * r, buffer?.duration ?? 0)) }
      : undefined,
  };
}

function updateStoryHint() {
  const kind = storyKind();
  $('storyHint').textContent =
    kind === 'image' ? t('storyHintImage') : canRecordVideo() ? t('storyHintVideo').replace('{t}', $('storyStartTime').textContent ?? '') : t('storyNoVideo');
  storyCreate.disabled = kind !== 'image' && !canRecordVideo();
}

/** Redraw the still preview (and forget a story made with older settings). */
function storyReset() {
  const synced = !!lyricsView.synced;
  document.querySelectorAll<HTMLElement>('#storyStyles [data-needs-lyrics]').forEach((el) => (el.hidden = !synced));
  if (!synced && picked('storyStyle') === 'lyrics') document.querySelector<HTMLInputElement>('input[name="storyStyle"][value="card"]')!.checked = true;
  $('storySubsRow').hidden = !synced || picked('storyStyle') === 'lyrics';
  storyAbort?.abort();
  storyAbort = null;
  storyFile = null;
  storyShare.hidden = true;
  storyBar.hidden = true;
  storyStatus.textContent = '';
  storyCreate.disabled = false;
  storyCreate.textContent = t('storyCreate');
  const kind = storyKind();
  const start = storyStartAt(kind === 'image' ? 0 : Number(kind));
  $('storyStartTime').textContent = fmtTime(start / params.ratio);
  void storyImage(storyCanvas, storyInfo(start)).catch(() => {}); // still preview
  updateStoryHint();
}

$('openStory').addEventListener('click', async () => {
  if (fullReady) await fullReady; // quick start: the whole song first
  showSheet($('storySheet'));
  // Starts where you are; the slider can move it.
  storyStart.max = String(buffer?.duration ?? 1);
  storyStart.value = String(player?.position ?? 0);
  storyReset();
  storyColors = await paletteFrom($<HTMLImageElement>('cover')).catch(() => undefined);
  if (picked('storyBg') === 'color') storyReset();
});
document
  .querySelectorAll('input[name="storyKind"], input[name="storyStyle"], input[name="storyBg"], #storySubs, #storyBadge')
  .forEach((el) => el.addEventListener('change', storyReset));
let startTimer = 0;
storyStart.addEventListener('input', () => {
  $('storyStartTime').textContent = fmtTime(Number(storyStart.value) / params.ratio);
  clearTimeout(startTimer);
  startTimer = window.setTimeout(storyReset, 120);
});

storyCreate.addEventListener('click', async () => {
  if (fullReady) await fullReady;
  if (storyAbort) {
    // Pressed again while recording: stop.
    storyReset();
    return;
  }
  if (!buffer || !player) return;
  const kind = storyKind();
  // Near the end, the video starts earlier so the clip is full.
  const seconds = kind === 'image' ? 0 : Number(kind);
  const start = storyStartAt(seconds);
  const info = storyInfo(start);
  const base = safeFileName(`${info.title}${info.badge ? ` (${info.badge})` : ''} - THE REMIXITY`);
  storyFile = null;
  storyShare.hidden = true;
  try {
    if (kind === 'image') {
      const png = await storyImage(storyCanvas, info);
      storyFile = new File([png], `${base}.png`, { type: 'image/png' });
    } else {
      const wasPlaying = player.playing;
      player.pause();
      render();
      storyStatus.textContent = t('storyPreparing');
      storyAbort = new AbortController();
      storyCreate.textContent = t('fixStop');
      const clip = await renderClip(buffer, params, start, Math.min(seconds, buffer.duration / params.ratio), renderAuto());
      if (!storyAbort || storyAbort.signal.aborted) return;
      if (info.style === 'waves') info.levels = levelsOf(clip); // the bars follow what you hear
      storyBar.hidden = false;
      const fillBar = storyBar.firstElementChild as HTMLElement;
      const video = await storyVideo(
        storyCanvas,
        info,
        clip,
        (f) => {
          fillBar.style.width = `${Math.round(f * 100)}%`;
          storyStatus.textContent = t('storyRecording').replace('{n}', String(Math.round(f * 100)));
        },
        storyAbort.signal,
      );
      storyAbort = null;
      storyBar.hidden = true;
      storyCreate.textContent = t('storyCreate');
      const ext = video.type.includes('mp4') ? 'mp4' : 'webm';
      storyFile = new File([video], `${base}.${ext}`, { type: video.type });
      if (wasPlaying) {
        player.play();
        render();
      }
    }
    storyStatus.textContent = t('storyReady');
    storyShare.hidden = false;
  } catch (err) {
    storyAbort = null;
    storyBar.hidden = true;
    storyCreate.textContent = t('storyCreate');
    if ((err as DOMException).name === 'AbortError') return;
    console.error(err);
    storyStatus.textContent = staleApp ? t('appUpdated') : t('storyFailed').replace('{e}', (err as Error).message);
  }
});

// Sharing needs its own tap (the share sheet only opens right after one).
storyShare.addEventListener('click', async () => {
  if (!storyFile) return;
  try {
    await shareOrDownload([storyFile]);
  } catch (err) {
    storyStatus.textContent = t('storyFailed').replace('{e}', (err as Error).message);
  }
});

$('openExport').addEventListener('click', () => {
  updateExportName();
  showSheet($('exportSheet'));
  // Warn when the browser adds anti-tracking noise to read-back audio
  // (e.g. Safari Private tabs); exports would come out noisy there.
  void readbackIsNoisy().then((noisy) => ($('privateWarn').hidden = !noisy));
});
document.querySelectorAll('input[name="fmt"]').forEach((r) => r.addEventListener('change', updateExportName));

// ---------- chop: trim, cut, loop, markers ----------

const wave = new Waveform($<HTMLCanvasElement>('wave'), {
  onSeek(f) {
    if (!player) return;
    player.seek(f * player.duration);
    render();
  },
  onSelect(a, b) {
    if (!player) return;
    sel = [a * player.duration, b * player.duration];
    if (player.looping) player.setLoop(sel);
    renderEdit();
  },
});

// ---------- dashboard pages: swipe like a widget stack ----------

const PAGES = ['play', 'lyrics', 'drive', 'space', 'eq', 'chop'] as const;
const pagesEl = $('pages');
const dots = [...document.querySelectorAll<HTMLButtonElement>('#dots button')];
let page: (typeof PAGES)[number] = 'play';

function syncPage() {
  const i = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth));
  const next = PAGES[Math.min(PAGES.length - 1, Math.max(0, i))];
  dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
  $<HTMLButtonElement>('pagePrev').disabled = i <= 0;
  $<HTMLButtonElement>('pageNext').disabled = i >= PAGES.length - 1;
  if (next === page) return;
  page = next;
  if (i > 0) dismissSwipeHint();
  eq.active = page === 'eq';
  if (page === 'eq') eq.draw();
  if (page === 'chop') renderEdit();
}
pagesEl.addEventListener('scroll', syncPage, { passive: true });

// First time: point out that the box swipes, with a little peek.
const swipeHint = $('swipeHint');
function showSwipeHint() {
  try {
    if (localStorage.getItem('swiped')) return;
  } catch {
    /* storage blocked: show it anyway */
  }
  if (pageIndex() > 0) return;
  swipeHint.hidden = false;
  pagesEl.classList.remove('peek');
  void pagesEl.offsetWidth; // restart the animation
  pagesEl.classList.add('peek');
}
swipeHint.addEventListener('click', () => goPage(1));
function dismissSwipeHint() {
  swipeHint.hidden = true;
  try {
    localStorage.setItem('swiped', '1');
  } catch {
    /* ignore */
  }
}

// Skip 10 seconds as you hear them (the source moves faster when sped up).
function skip(seconds: number) {
  if (!player) return;
  player.seek(Math.min(player.duration, Math.max(0, player.position + seconds * params.ratio)));
  render();
}
function goPage(i: number) {
  i = Math.min(PAGES.length - 1, Math.max(0, i));
  pagesEl.scrollTo({ left: i * pagesEl.clientWidth, behavior: 'smooth' });
}
const pageIndex = () => Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth));
dots.forEach((d) => d.addEventListener('click', () => goPage(+d.dataset.go!)));
$('pagePrev').addEventListener('click', () => goPage(pageIndex() - 1));
$('pageNext').addEventListener('click', () => goPage(pageIndex() + 1));

const eq = new EqView($<HTMLCanvasElement>('eqCanvas'), {
  get: () => params,
  set(key, v) {
    params[key] = v;
    apply();
  },
  analyser: () => (player?.playing ? player.analyser : null),
  onReadout: (text) => ($('eqReadout').textContent = text),
});

/** Apply an edit, keeping it undoable, and rebuild the buffer if needed. */
function commit(next: EditState, keepAt?: number, lanesBefore?: Lane[]) {
  if (!original || !player) return;
  pushHistory(lanesBefore);
  const rebuild = next.segments !== edit.segments;
  edit = next;
  if (rebuild) {
    buffer = assemble(original, edit.segments);
    player.load(buffer, keepAt ?? player.position);
    wave.setBuffer(buffer);
  }
  saveTimelineSoon();
  render();
}

/** Remember the sections and lanes as they are now (before a change), for Undo. */
function pushHistory(lanesBefore?: Lane[]) {
  history.push({ edit, lanes: lanesBefore ?? structuredClone(automation.lanes) });
  if (history.length > 80) history.shift();
}

function clearSelection() {
  sel = null;
  player?.setLoop(null);
  renderEdit();
}

function cutSelection() {
  if (!sel || !player) return;
  const [a, b] = sel;
  const pos = player.position;
  const keepAt = pos < a ? pos : pos >= b ? pos - (b - a) : a;
  sel = null;
  player.setLoop(null);
  commit(cut(edit, a, b), keepAt);
}

function trimToSelection() {
  if (!sel || !player) return;
  const [a, b] = sel;
  const keepAt = Math.min(Math.max(0, player.position - a), b - a);
  sel = null;
  player.setLoop(null);
  commit(keepOnly(edit, a, b), keepAt);
}

function undo() {
  const step = history.pop();
  if (!step || !original || !player) return;
  automation.lanes = step.lanes;
  fillLaneMenu(); // the "+ Automation" list follows the lanes
  autoDirty = true;
  if (!automation.lanes.length) apply(); // no lanes left: back to the plain settings
  const prev = step.edit;
  const rebuild = prev.segments !== edit.segments;
  edit = prev;
  if (rebuild) {
    sel = null;
    player.setLoop(null);
    buffer = assemble(original, edit.segments);
    player.load(buffer, player.position);
    wave.setBuffer(buffer);
  }
  saveTimelineSoon();
  render();
}

function toggleLoop() {
  if (!player) return;
  if (player.looping) player.setLoop(null);
  else if (sel) player.setLoop(sel);
  renderEdit();
}

function markerAtPlayhead() {
  if (!player) return;
  const next = addMarker(edit, player.position);
  if (next !== edit) commit(next);
}

$('tMarker').addEventListener('click', markerAtPlayhead);
$('tLoop').addEventListener('click', toggleLoop);
$('tTrim').addEventListener('click', trimToSelection);
$('tCut').addEventListener('click', cutSelection);
$('tUndo').addEventListener('click', undo);

const fmtTime = (s: number) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const fmtPrecise = (s: number) => {
  s = Math.max(0, s);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

function renderEdit() {
  if (!player || !buffer) return;
  const dur = buffer.duration;
  const r = params.ratio; // times are shown as you hear them (after speed change)
  wave.setOverlay(
    sel ? [sel[0] / dur, sel[1] / dur] : null,
    edit.markers.map((m) => m / dur),
    player.looping,
  );

  $<HTMLButtonElement>('tLoop').disabled = !sel && !player.looping;
  $('tLoop').classList.toggle('active', player.looping);
  $<HTMLButtonElement>('tTrim').disabled = !sel;
  $<HTMLButtonElement>('tCut').disabled = !sel;
  $<HTMLButtonElement>('tUndo').disabled = history.length === 0;
  $<HTMLButtonElement>('tlUndo').disabled = history.length === 0;

  const info = $('selInfo');
  info.replaceChildren();
  if (sel) {
    const [a, b] = sel;
    info.append(`${fmtPrecise(a / r)} – ${fmtPrecise(b / r)} · ${((b - a) / r).toFixed(1)} s `);
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.setAttribute('aria-label', t('clearSel'));
    x.addEventListener('click', clearSelection);
    info.append(x);
  } else {
    info.textContent = t('editHint');
  }

  const list = $('markerList');
  list.replaceChildren();
  edit.markers.forEach((m, i) => {
    const chip = document.createElement('span');
    chip.className = 'user-chip';
    const go = document.createElement('button');
    go.textContent = `${i + 1} · ${fmtTime(m / r)}`;
    go.addEventListener('click', () => {
      player!.seek(m);
      render();
    });
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.setAttribute('aria-label', `${t('marker')} ${i + 1}`);
    del.addEventListener('click', () => commit(removeMarker(edit, i)));
    chip.append(go, del);
    list.append(chip);
  });
}

// ---------- speed & BPM (menu) ----------

const origInput = $<HTMLInputElement>('origBpm');
const targetInput = $<HTMLInputElement>('targetBpm');

document.querySelectorAll<HTMLButtonElement>('[data-nudge]').forEach((b) =>
  b.addEventListener('click', () => {
    const n = +b.dataset.nudge!;
    // With a known BPM, nudge in BPM; otherwise nudge in percent.
    if (origBpm) setRatio((origBpm * params.ratio + n) / origBpm);
    else setRatio(params.ratio + n / 100);
  }),
);

origInput.addEventListener('change', () => {
  const v = parseFloat(origInput.value.replace(',', '.'));
  origBpm = v >= 30 && v <= 300 ? v : null;
  render();
});

targetInput.addEventListener('change', () => {
  const v = parseFloat(targetInput.value.replace(',', '.'));
  if (origBpm && v > 0) setRatio(v / origBpm);
  else render();
});

// Tempo detectors often land on half or double the felt tempo.
$('bpmHalf').addEventListener('click', () => {
  if (origBpm) origBpm = Math.round((origBpm / 2) * 10) / 10;
  render();
});
$('bpmDouble').addEventListener('click', () => {
  if (origBpm) origBpm = Math.round(origBpm * 20) / 10;
  render();
});

let taps: number[] = [];
$('tap').addEventListener('click', () => {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  if (taps.length > 9) taps.shift();
  if (taps.length < 3) return;
  const heard = 60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1));
  // While playing you hear the sped-up/slowed track, so convert back.
  const bpm = player?.playing ? heard / params.ratio : heard;
  origBpm = Math.round(bpm * 10) / 10;
  render();
});

function pitchText(r: number) {
  const cents = params.keepPitch ? 0 : Math.round(1200 * Math.log2(r));
  if (cents === 0) return `0 ${t('st')}`;
  const sign = cents < 0 ? '−' : '+';
  const a = Math.abs(cents);
  const st = Math.floor(a / 100);
  const ct = a % 100;
  if (st === 0) return `${sign}${ct} ${t('ct')}`;
  return `${sign}${st} ${t('st')}${ct ? ` ${ct} ${t('ct')}` : ''}`;
}

// Keep pitch: change speed without the vinyl-style pitch change.
$('keepPitchBtn').addEventListener('click', () => {
  params.keepPitch = !params.keepPitch;
  apply();
});

// Lock: the next songs start at this same speed.
$('lockSpeedBtn').addEventListener('click', () => {
  speedLocked = !speedLocked;
  try {
    localStorage.setItem('speedLock', speedLocked ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  render();
});

// ---------- sound & effects (menu) ----------

type SliderKey = Exclude<keyof FxParams, 'ratio' | 'keepPitch'>;
interface SliderDef {
  id: string;
  key: SliderKey;
  fmt: (v: number) => string;
  /** param → slider position (defaults to identity) */
  to?: (v: number) => number;
  /** slider position → param */
  from?: (s: number) => number;
  /** moving it takes the reverb off autopilot */
  space?: boolean;
}

const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);

// Cut filters use a log scale so the slider moves evenly through octaves.
const LC = [20, 1000];
const HC = [1000, 20000];
const logTo = ([a, b]: number[]) => (v: number) => Math.log(v / a) / Math.log(b / a);
const logFrom = ([a, b]: number[]) => (s: number) => Math.round(a * Math.pow(b / a, s));

const sliders: SliderDef[] = [
  { id: 'mix', key: 'reverbMix', fmt: pct, space: true },
  { id: 'decay', key: 'decay', fmt: (v) => `${v.toFixed(1)} s`, space: true },
  { id: 'tone', key: 'tone', fmt: (v) => (v < 0.34 ? t('dark') : v > 0.66 ? t('bright') : pct(v)), space: true },
  { id: 'bass', key: 'bass', fmt: db },
  { id: 'volume', key: 'volume', fmt: (v) => (v <= 0 ? t('off') : db(v)) },
  { id: 'eqLow', key: 'eqLow', fmt: db },
  { id: 'eqMid', key: 'eqMid', fmt: db },
  { id: 'eqHigh', key: 'eqHigh', fmt: db },
  { id: 'eqAir', key: 'eqAir', fmt: db },
  { id: 'lowCut', key: 'lowCut', fmt: (v) => (v <= 20 ? t('off') : hz(v)), to: logTo(LC), from: logFrom(LC) },
  { id: 'highCut', key: 'highCut', fmt: (v) => (v >= 20000 ? t('off') : hz(v)), to: logTo(HC), from: logFrom(HC) },
  { id: 'drive', key: 'drive', fmt: (v) => (v === 0 ? t('off') : pct(v)) },
  { id: 'delayMix', key: 'delayMix', fmt: (v) => (v === 0 ? t('off') : pct(v)) },
  { id: 'delayTime', key: 'delayTime', fmt: (v) => `${Math.round(v * 1000)} ms` },
  { id: 'delayFeedback', key: 'delayFeedback', fmt: pct },
];

for (const s of sliders) {
  const el = $<HTMLInputElement>(s.id);
  el.addEventListener('input', () => {
    params[s.key] = s.from ? s.from(+el.value) : +el.value;
    if (s.space) autoSpace = false;
    apply();
  });
}

const autoBox = $<HTMLInputElement>('autoSpace');
autoBox.addEventListener('change', () => {
  autoSpace = autoBox.checked;
  apply();
});

$('eqReset').addEventListener('click', () => {
  const { eqLow, eqMid, eqHigh, eqAir, lowCut, highCut } = DEFAULT_PARAMS;
  Object.assign(params, { eqLow, eqMid, eqHigh, eqAir, lowCut, highCut });
  apply();
});

// Reverb preset: the smallest room, half wet.
$('smallRoom').addEventListener('click', () => {
  autoSpace = false;
  Object.assign(params, { reverbMix: 0.5, decay: 0.6 });
  apply();
});

// Echo synced to the tempo you hear (original BPM × speed).
document.querySelectorAll<HTMLButtonElement>('[data-div]').forEach((b) =>
  b.addEventListener('click', () => {
    if (!origBpm) return;
    const beat = 60 / (origBpm * params.ratio);
    params.delayTime = Math.min(1.5, Math.max(0.05, beat * +b.dataset.div!));
    apply();
  }),
);

// Built-in presets reset everything and put the reverb back on the pedal.
document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    Object.assign(params, DEFAULT_PARAMS, PRESETS[b.dataset.preset!], { keepPitch: params.keepPitch });
    autoSpace = true;
    apply();
  }),
);

// ---------- saved presets (this browser only) ----------

interface UserPreset {
  name: string;
  params: Partial<FxParams>;
}

function loadUserPresets(): UserPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem('presets') || '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === 'string' && p.params) : [];
  } catch {
    return [];
  }
}

function saveUserPresets(list: UserPreset[]) {
  try {
    localStorage.setItem('presets', JSON.stringify(list));
  } catch {
    /* storage blocked or full */
  }
}

function renderUserPresets() {
  const box = $('userPresets');
  box.replaceChildren();
  loadUserPresets().forEach((p, i) => {
    const chip = document.createElement('span');
    chip.className = 'user-chip';
    const use = document.createElement('button');
    use.textContent = p.name;
    use.addEventListener('click', () => {
      // Only take known numeric keys from storage.
      const clean: Partial<FxParams> = {};
      for (const k of Object.keys(DEFAULT_PARAMS) as (keyof FxParams)[]) {
        const v = p.params[k];
        if (k === 'keepPitch') {
          if (typeof v === 'boolean') clean.keepPitch = v;
        } else if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
      }
      // A saved preset brings its own keep-pitch choice if it has one.
      Object.assign(params, DEFAULT_PARAMS, { keepPitch: params.keepPitch }, clean);
      params.volume = Math.max(0, params.volume); // older presets could cut volume
      autoSpace = false; // a saved preset keeps its own reverb
      apply();
    });
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.setAttribute('aria-label', `${t('deletePreset')}: ${p.name}`);
    del.addEventListener('click', () => {
      const list = loadUserPresets();
      list.splice(i, 1);
      saveUserPresets(list);
      renderUserPresets();
    });
    chip.append(use, del);
    box.append(chip);
  });
}

$('savePreset').addEventListener('click', () => {
  const name = prompt(t('savePrompt'))?.trim().slice(0, 40);
  if (!name) return;
  const list = loadUserPresets().filter((p) => p.name !== name);
  list.push({ name, params: { ...params } });
  saveUserPresets(list);
  renderUserPresets();
});

renderUserPresets();

function apply() {
  if (autoSpace) Object.assign(params, spaceFor(params.ratio));
  player?.setParams({ ...params });
  autoDirty = true; // lanes win over the plain settings
  render();
}

// ---------- timeline & automation (phase 1, behind ?lab=1) ----------

const lab = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lab');
    if (q !== null) localStorage.setItem('lab', q === '0' ? '0' : '1');
    return localStorage.getItem('lab') === '1';
  } catch {
    return false;
  }
})();
const timelineEl = $('timeline');
const tlAdd = $<HTMLSelectElement>('tlAddLane');
$('openTimeline').hidden = !lab;
// The same switch in the ⋯ menu (a home-screen app has its own storage, so a
// ?lab=1 link opened in Safari never reaches it).
// Playback log (lock-screen bugs): turning it on reloads with the panel.
const debugBox = $<HTMLInputElement>('labDebug');
debugBox.checked = debugOn;
debugBox.addEventListener('change', () => {
  try {
    localStorage.setItem('npdebugOn', debugBox.checked ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  location.reload();
});
const labBox = $<HTMLInputElement>('labTimeline');
labBox.checked = lab;
labBox.addEventListener('change', () => {
  try {
    localStorage.setItem('lab', labBox.checked ? '1' : '0');
  } catch {
    /* storage blocked: on for this visit only */
  }
  $('openTimeline').hidden = !labBox.checked;
});

const laneName = (param: AutoParam) => (param === 'ratio' ? t('speed') : t(AUTO_PARAMS[param].label as Parameters<typeof t>[0]));

function fillLaneMenu() {
  const used = new Set(automation.lanes.map((l) => l.param));
  const full = automation.lanes.length >= 5;
  tlAdd.replaceChildren(new Option(full ? t('lanesFull') : t('addLane'), ''));
  if (full) return;
  for (const param of Object.keys(AUTO_PARAMS) as AutoParam[]) {
    if (used.has(param)) continue;
    const live = AUTO_PARAMS[param].live;
    tlAdd.append(new Option(live ? laneName(param) : `${laneName(param)} (${t('notLiveYet')})`, param));
  }
}

const timeline = new Timeline($<HTMLCanvasElement>('tlCanvas'), {
  buffer: () => buffer,
  edit: () => edit,
  get automation() {
    return automation;
  },
  position: () => player?.position ?? 0,
  ratio: () => params.ratio,
  playing: () => !!player?.playing,
  grid: () => currentGrid(),
  seek: (s) => {
    player?.seek(s);
    render();
  },
  moveSection: (from, to) => {
    // Undo puts the lanes back too (they moved with the section).
    const before = structuredClone(automation.lanes);
    moveLanesWithSection(automation, edit, from, to);
    commit(moveSection(edit, from, to), undefined, before);
  },
  checkpoint: () => {
    pushHistory();
    render();
  },
  changed: () => {
    autoDirty = true;
    saveTimelineSoon();
  },
  removeLane: (id) => {
    pushHistory();
    removeLane(automation, id);
    saveTimelineSoon();
    fillLaneMenu();
    apply(); // back to the plain settings for that parameter
  },
  label: (lane) => laneName(lane.param),
});

$('openTimeline').addEventListener('click', () => {
  if (!buffer) return;
  closeSheets();
  fillLaneMenu();
  $('tlInfo').textContent = t('timelineHint');
  timelineEl.hidden = false;
  document.body.classList.add('timeline-open');
  backdrop.covered = true; // the timeline covers everything: hold the background still
  timelineUsed = true; // from now on this song's timeline is kept
  timeline.open();
});
document.querySelectorAll('[data-tl-close]').forEach((b) =>
  b.addEventListener('click', () => {
    timeline.close();
    timelineEl.hidden = true;
    document.body.classList.remove('timeline-open');
    backdrop.covered = libraryOpen();
  }),
);
tlAdd.addEventListener('change', () => {
  const param = tlAdd.value as AutoParam;
  if (param && buffer) {
    pushHistory();
    const lane = addLane(automation, param, params[param], buffer.duration);
    if (lane) timeline.setFocus(lane.id); // straight into its close-up, ready to draw
  }
  fillLaneMenu();
  autoDirty = true;
  saveTimelineSoon();
});
$('tlSplit').addEventListener('click', () => {
  if (player) commit(split(edit, timeline.snap(player.position)));
});
/**
 * The grid in timeline seconds. Detected from the audio the first time it's
 * needed (the refined tempo and where bar 1 falls); if the BPM was changed by
 * hand since, the hand-set BPM wins and the bar start stays.
 */
function currentGrid(): BeatGrid | null {
  if (!origBpm) return null;
  if (!gridInfo && !gridDetecting && buffer && !fullReady) {
    gridDetecting = true;
    const token = loadToken;
    const bpm = origBpm;
    detectGrid(buffer, bpm)
      .then((g) => {
        if (token === loadToken && !gridInfo) {
          gridInfo = g;
          saveTimelineSoon();
        }
      })
      .catch((err) => console.warn('grid detection failed', err))
      .finally(() => (gridDetecting = false));
  }
  const handBeat = 60 / origBpm;
  if (!gridInfo) return { beat: handBeat, offset: 0 };
  return Math.abs(gridInfo.beat - handBeat) / handBeat < 0.005 ? gridInfo : { beat: handBeat, offset: gridInfo.offset };
}

/** A short message in the timeline bar, then the usual hint again. */
let infoTimer = 0;
function flashInfo(text: string) {
  const el = $('tlInfo');
  el.textContent = text;
  el.classList.add('flash');
  clearTimeout(infoTimer);
  infoTimer = window.setTimeout(() => {
    el.classList.remove('flash');
    el.textContent = t('timelineHint');
  }, 2500);
}

// "Beat 1 here": the bar starts at the playhead.
$('tlBeatOne').addEventListener('click', () => {
  const g = currentGrid();
  if (!g || !player) return;
  const bar = g.beat * 4;
  gridInfo = { beat: g.beat, offset: ((player.position % bar) + bar) % bar };
  saveTimelineSoon();
  flashInfo(t('beatOneSet'));
});
$('tlZoomIn').addEventListener('click', () => timeline.zoom(1.6));
// Snap on/off and the drawing tool (points or a shape). Both remembered.
const tlSnap = $('tlSnap');
const tlShape = $<HTMLSelectElement>('tlShape');
try {
  timeline.snapOn = localStorage.getItem('tlSnap') !== '0';
  const sh = localStorage.getItem('tlShape');
  if (sh && [...tlShape.options].some((o) => o.value === sh)) tlShape.value = sh;
} catch {
  /* storage blocked */
}
tlSnap.setAttribute('aria-pressed', String(timeline.snapOn));
// Follow: the view turns the page with the playhead; off = it stays where you put it.
const tlFollow = $('tlFollow');
try {
  timeline.followOn = localStorage.getItem('tlFollow') !== '0';
} catch {
  /* storage blocked */
}
tlFollow.setAttribute('aria-pressed', String(timeline.followOn));
tlFollow.addEventListener('click', () => {
  timeline.followOn = !timeline.followOn;
  tlFollow.setAttribute('aria-pressed', String(timeline.followOn));
  try {
    localStorage.setItem('tlFollow', timeline.followOn ? '1' : '0');
  } catch {
    /* storage blocked */
  }
});
timeline.shape = tlShape.value as typeof timeline.shape;
tlSnap.addEventListener('click', () => {
  timeline.snapOn = !timeline.snapOn;
  tlSnap.setAttribute('aria-pressed', String(timeline.snapOn));
  try {
    localStorage.setItem('tlSnap', timeline.snapOn ? '1' : '0');
  } catch {
    /* storage blocked */
  }
});
tlShape.addEventListener('change', () => {
  timeline.shape = tlShape.value as typeof timeline.shape;
  try {
    localStorage.setItem('tlShape', tlShape.value);
  } catch {
    /* storage blocked */
  }
});
$('tlZoomOut').addEventListener('click', () => timeline.zoom(1 / 1.6));

// Grid (from the song's BPM): splits and points snap to it. Remembered.
const tlGrid = $<HTMLSelectElement>('tlGrid');
try {
  const g = localStorage.getItem('tlGrid');
  if (g && [...tlGrid.options].some((o) => o.value === g)) tlGrid.value = g;
} catch {
  /* storage blocked */
}
timeline.grid = Number(tlGrid.value);
tlGrid.addEventListener('change', () => {
  timeline.grid = Number(tlGrid.value);
  try {
    localStorage.setItem('tlGrid', tlGrid.value);
  } catch {
    /* storage blocked */
  }
});
$('tlUndo').addEventListener('click', () => undo());
// Reset: the song as it was, no lanes (Undo brings it all back).
$('tlReset').addEventListener('click', () => {
  if (!original || !player) return;
  const before = structuredClone(automation.lanes);
  automation.lanes = [];
  fillLaneMenu();
  commit(initialEdit(original.duration), 0, before);
  apply();
});

// ---------- saved timelines ----------

let saveTimer = 0;
function saveTimelineSoon() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushTimelineSave, 400);
}
function flushTimelineSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!timelineUsed || !timelineKey || !original) return;
  const blank = automation.lanes.length === 0 && edit.segments.length === 1 && !edit.markers.length && !gridInfo &&
    edit.segments[0].start <= 0 && edit.segments[0].end >= original.duration - 1e-6;
  if (blank) void deleteTimeline(timelineKey);
  else
    void saveTimeline({
      key: timelineKey,
      duration: original.duration,
      segments: edit.segments.map((g) => ({ ...g })),
      markers: [...edit.markers],
      lanes: structuredClone(automation.lanes),
      grid: gridInfo ?? undefined,
      savedAt: Date.now(),
    });
}
addEventListener('pagehide', flushTimelineSave);

/** Bring back this song's saved timeline (once the whole song is decoded). */
async function restoreTimeline(token: number) {
  const key = timelineKey;
  if (!key) return;
  const rec = await loadTimeline(key);
  if (!rec || token !== loadToken || key !== timelineKey || !original || !player) return;
  if (Math.abs(rec.duration - original.duration) > 0.05) return; // another file under this name
  const fits = rec.segments.every((g) => g.start >= 0 && g.end <= original!.duration + 1e-3 && g.end > g.start);
  if (!fits || !rec.segments.length) return;
  timelineUsed = true;
  if (rec.grid && rec.grid.beat > 0.1 && rec.grid.beat < 2) gridInfo = rec.grid;
  automation = { lanes: rec.lanes.slice(0, 5) };
  fillLaneMenu(); // the "+ Automation" list follows the lanes
  edit = { segments: rec.segments, markers: rec.markers };
  history = [];
  buffer = assemble(original, edit.segments);
  player.load(buffer, Math.min(player.position, buffer.duration));
  wave.setBuffer(buffer);
  autoDirty = true;
  if (!automation.lanes.length) apply();
  render();
}

// Live automation: every lane is applied ~25×/s on top of the settings (the
// chain glides between values, the speed ramps, the reverb room crossfades).
// A timer, not the animation loop, so it keeps going in a background tab.
/** The settings at timeline second t, with the lanes applied. */
function automatedAt(base: FxParams, a: Automation, followPedal: boolean, t: number): FxParams {
  const speed = a.lanes.find((l) => l.param === 'ratio');
  // "Follows the pedal": the reverb follows the automated speed too (its own lanes still win).
  const b = followPedal && speed ? { ...base, ...spaceFor(valueAt(speed, t)) } : base;
  return paramsAt(b, a, t, false);
}

function tickAutomation() {
  if (!player || !automation.lanes.length) return;
  if (!autoDirty && !player.playing) return;
  autoDirty = false;
  const q = automatedAt(params, automation, autoSpace, player.position);
  player.setParams(q, true);
  // A speed lane moves the pedal and the BPM, so you see what you hear.
  if (automation.lanes.some((l) => l.param === 'ratio')) showSpeed(q.ratio);
}

/** Just the speed readouts (cheap enough for every automation tick). */
function showSpeed(r: number) {
  pedal.set(r);
  if (origBpm) $('bpmBig').textContent = String(Math.round(origBpm * r));
  $('gaugeSub').textContent = `×${r.toFixed(2)} · ${pitchText(r)}`;
  glowRed.style.opacity = String(clamp01((r - 1) / 0.4) * 0.95);
  glowBlue.style.opacity = String(clamp01((1 - r) / 0.4) * 0.95);
}
setInterval(tickAutomation, 40);

/** A frozen copy of the automation for an export or a story clip. */
function renderAuto(): RenderAuto | undefined {
  if (!automation.lanes.length) return undefined;
  const a = structuredClone(automation);
  const base = { ...params };
  const follow = autoSpace;
  const has = (k: AutoParam) => a.lanes.some((l) => l.param === k);
  return {
    at: (t) => automatedAt(base, a, follow, t),
    speed: has('ratio'),
    room: has('decay') || has('tone') || (follow && has('ratio')),
  };
}

// ---------- export ----------

const exportBtn = $<HTMLButtonElement>('export');
const progress = $('progress');
const progressBar = progress.firstElementChild as HTMLElement;
const exportStatus = $('exportStatus');
const link = $<HTMLAnchorElement>('downloadLink');
const currentFormat = () =>
  (document.querySelector('input[name="fmt"]:checked') as HTMLInputElement).value as Format;

function remixTag() {
  const r = params.ratio;
  if (r < 0.999) return params.reverbMix > 0.05 ? 'slowed + reverb' : 'slowed';
  if (r > 1.001) return r >= 1.15 ? 'nightcore' : 'sped up';
  return params.reverbMix > 0.05 ? 'reverb' : 'remix';
}

const extOf = (fmt: Format) => (fmt === 'mp3' ? '.mp3' : '.wav');
const baseName = () => safeFileName(`${trackName} (${remixTag()})`);

function outputName(fmt: Format) {
  return baseName() + extOf(fmt);
}

// Export details: file name, title, artist, cover. Pre-filled with the
// song's own details; your edits stick until the song or remix changes.
const fileIn = $<HTMLInputElement>('exportFile');
const titleIn = $<HTMLInputElement>('tagTitle');
const artistIn = $<HTMLInputElement>('tagArtist');
const keepCoverBox = $<HTMLInputElement>('keepCover');
let exportKey = '';
let fileEdited = false;
fileIn.addEventListener('input', () => (fileEdited = true));

function fillExportDetails() {
  const key = `${loadToken}|${remixTag()}`;
  if (key === exportKey) return;
  const sameSong = exportKey.split('|')[0] === String(loadToken);
  exportKey = key;
  if (!fileEdited || !sameSong) {
    fileIn.value = baseName();
    fileEdited = false;
  }
  if (!sameSong) {
    titleIn.value = songTitle;
    artistIn.value = songArtist ?? '';
    keepCoverBox.checked = true;
  }
}

function exportFileName(fmt: Format) {
  return (safeFileName(fileIn.value.trim()) || baseName()) + extOf(fmt);
}

async function coverBytes(): Promise<{ data: Uint8Array; mime: string } | null> {
  if (!coverUrl) return null;
  try {
    const b = await (await fetch(coverUrl)).blob();
    return { data: new Uint8Array(await b.arrayBuffer()), mime: b.type || 'image/jpeg' };
  } catch {
    return null;
  }
}

// The last file the user exported, for the share sheet.
let lastExport: { blob: Blob; name: string } | null = null;

const share = initShare({
  renderMp3: (onProgress) => {
    if (!buffer) return Promise.reject(new Error('no track'));
    return exportAudio(buffer, { ...params }, 'mp3', (_stage, f) => onProgress(f), renderAuto());
  },
  fileName: () => outputName('mp3'),
  remixTag,
  title: () => $('title').textContent || trackName,
  artist: () => {
    const a = $('artist').textContent || '';
    return a && a !== t('yourTrack') ? a : null;
  },
  coverSrc: () => coverUrl,
  lastExport: () => lastExport,
  showSheet,
});

function updateExportName() {
  fillExportDetails();
  $('exportExt').textContent = extOf(currentFormat());
}

exportBtn.addEventListener('click', async () => {
  if (fullReady) await fullReady; // quick start: wait for the whole song
  if (!buffer || exporting) return;
  exporting = true;
  exportBtn.disabled = true;
  link.hidden = true;
  progress.hidden = false;
  const fmt = currentFormat();
  const label: Record<Stage, () => string> = {
    resample: () => t('stageResample'),
    render: () => t('stageRender'),
    encode: () => t('stageEncode'),
  };
  try {
    const blob = await exportAudio(buffer, { ...params }, fmt, (stage, f) => {
      exportStatus.textContent = `${label[stage]()}${f === null ? '…' : ` ${Math.round(f * 100)}%`}`;
      progress.classList.toggle('indeterminate', f === null);
      progressBar.style.width = `${Math.round((f ?? 0) * 100)}%`;
    }, renderAuto());
    const tagged = await withTags(blob, fmt === 'mp3' ? 'mp3' : 'wav', {
      title: titleIn.value.trim(),
      artist: artistIn.value.trim(),
      cover: keepCoverBox.checked ? await coverBytes() : null,
    });
    const name = exportFileName(fmt);
    if (link.href) URL.revokeObjectURL(link.href);
    link.href = URL.createObjectURL(tagged);
    link.download = name;
    link.hidden = false;
    link.textContent = `${t('download')} · ${(tagged.size / 1048576).toFixed(1)} MB`;
    lastExport = { blob: tagged, name };
    share.refreshWebShare();
    exportStatus.textContent = '';
    link.click();
  } catch (err) {
    console.error(err);
    exportStatus.textContent = `${t('exportError')}: ${(err as Error).message}`;
  } finally {
    exporting = false;
    exportBtn.disabled = false;
    progress.hidden = true;
  }
});

// ---------- render ----------

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

let lastPositionSync = 0;
// The lock screen / Control Center: its controls only work while a media
// element plays along (see nowPlaying.ts).
const nowPlaying = new NowPlaying();
// When the silent track starts over, iOS resets its widget to plain ⏪ ⏩ and
// "paused": give it the buttons, the song and the state again right away.
nowPlaying.onLoop = () => {
  npLog('element looped: re-attaching lock-screen buttons');
  registerMediaHandlers();
  updateMediaSession(songTitle, songArtist ?? '');
  lastPositionSync = 0;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  syncLockScreen();
};

/** Play state and position for the lock screen. Also runs with the screen off. */
function syncLockScreen() {
  if (!player) return;
  // (The silent element is NOT paused here: a song change pauses the player
  // for a moment, and pausing the element then let iOS suspend our audio, so
  // the next song arrived paused. It only stops when you pause.)
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const state = player.playing ? 'playing' : 'paused';
  const dur = estDuration ?? (player.duration || 1);
  const r = params.ratio;
  // The lock screen extrapolates on its own; update it about once a second.
  const wall = performance.now();
  if (wall - lastPositionSync > 1000 || ms.playbackState !== state) {
    lastPositionSync = wall;
    try {
      ms.setPositionState({ duration: dur / r, position: Math.min(player.position, dur) / r, playbackRate: 1 });
    } catch {
      /* not supported */
    }
  }
  if (ms.playbackState !== state) ms.playbackState = state;
}
// The animation loop stops while the screen is off; this doesn't.
setInterval(syncLockScreen, 500);
// Back in the foreground while a song plays: wake the audio and the lock
// screen's element if iOS parked either of them.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !player?.playing) return;
  void player.ctx.resume();
  nowPlaying.set(true);
});
// Last values written by renderTransport: it runs every frame, so it only
// touches the page when something visible actually changed.
const shown = { bar: '', now: '', left: '', playing: null as boolean | null };
const barFill = $('barFill');
const tNow = $('tNow');
const tLeft = $('tLeft');

function renderTransport() {
  if (!player) return;
  const dur = estDuration ?? (player.duration || 1);
  const pos = scrubbing !== null ? scrubbing * dur : player.position;
  const r = params.ratio;
  const bar = `translateX(${((pos / dur) * 100 - 100).toFixed(2)}%)`;
  if (bar !== shown.bar) barFill.style.transform = shown.bar = bar;
  const now = fmtTime(pos / r);
  if (now !== shown.now) tNow.textContent = shown.now = now;
  const left = `−${fmtTime((dur - pos) / r)}`;
  if (left !== shown.left) tLeft.textContent = shown.left = left;
  if (player.playing !== shown.playing) {
    shown.playing = player.playing;
    playerView.classList.toggle('playing', player.playing);
    lyricsFull.classList.toggle('playing', player.playing);
    $('timeline').classList.toggle('playing', player.playing);
    playToggles.forEach((b) => b.setAttribute('aria-label', t(player!.playing ? 'pause' : 'play')));
  }
  syncLockScreen();
  backdrop.speed = (player.playing ? 1 : 0.3) * r;
  if (page === 'chop') wave.setProgress(pos / dur);
  if (page === 'lyrics' || lyricsOpen) lyricsView.update(toOriginal(pos));
  if (ahead && !ahead.ready && player.playing && dur - pos < 30) decodeAhead();
}

function render() {
  const r = params.ratio;
  pedal.set(r);

  // Dashboard
  const bpmBig = $('bpmBig');
  bpmBig.textContent = origBpm ? String(Math.round(origBpm * r)) : detectingBpm ? '···' : '—';
  bpmBig.classList.toggle('detecting', detectingBpm && !origBpm);
  $('gaugeSub').textContent = `×${r.toFixed(2)} · ${pitchText(r)}`;
  $('keepPitchBtn').setAttribute('aria-pressed', String(params.keepPitch));
  $('lockSpeedBtn').setAttribute('aria-pressed', String(speedLocked));
  const dash = $('dash');
  dash.classList.toggle('up', r > 1);
  dash.classList.toggle('down', r < 1);
  $('badge').textContent =
    r < 0.995
      ? `${t('slowed')} ×${r.toFixed(2)}`
      : r > 1.005
        ? `${r >= 1.2 ? t('presetNightcore') : t('spedUp')} ×${r.toFixed(2)}`
        : t('presetOriginal');

  // Red creeps in from the sides as you speed up, deep blue as you slow down.
  glowRed.style.opacity = String(clamp01((r - 1) / 0.4) * 0.95);
  glowBlue.style.opacity = String(clamp01((1 - r) / 0.4) * 0.95);

  // Menu
  $('rRatio').textContent = `×${r.toFixed(3)}`;
  $('rPitch').textContent = pitchText(r);
  const target = origBpm ? origBpm * r : null;
  $('rBpm').textContent = target ? target.toFixed(1) : '—';
  if (document.activeElement !== origInput) origInput.value = origBpm ? String(origBpm) : '';
  if (document.activeElement !== targetInput) targetInput.value = target ? target.toFixed(1) : '';
  targetInput.disabled = !origBpm;
  $('nudgeUnit').textContent = origBpm ? 'BPM' : '%';
  autoBox.checked = autoSpace;

  for (const s of sliders) {
    const v = params[s.key];
    $<HTMLInputElement>(s.id).value = String(s.to ? s.to(v) : v);
    $(`o${s.id[0].toUpperCase()}${s.id.slice(1)}`).textContent = s.fmt(v);
  }

  // Closed cards show a dot when something inside them is active.
  const eqOn =
    params.eqLow || params.eqMid || params.eqHigh || params.eqAir || params.lowCut > 20 || params.highCut < 20000;
  $('eqBadge').classList.toggle('on', !!eqOn);
  $('fxBadge').classList.toggle('on', params.drive > 0 || params.delayMix > 0);
  $('sync').hidden = !origBpm;
  if (page === 'eq' && !player?.playing) eq.draw();
  if (openSheet?.id === 'exportSheet') updateExportName();

  renderEdit();
  renderTransport();
}

apply();

// Dev only: ?autoload=/path.mp3 loads a test file without the picker.
if (import.meta.env.DEV) {
  const url = new URLSearchParams(location.search).get('autoload');
  if (url)
    void fetch(url)
      .then((r) => r.blob())
      .then((b) => load(new File([b], url.split('/').pop()!, { type: b.type })));
}

initAds();

// ?debug: show what the cover search did (to diagnose it on a phone).
if (new URLSearchParams(location.search).has('debug')) {
  const panel = document.createElement('pre');
  panel.style.cssText =
    'position:fixed;left:6px;right:6px;bottom:6px;z-index:99;max-height:40vh;overflow:auto;margin:0;padding:8px;' +
    'background:rgba(0,0,0,.85);color:#9f9;font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap;border-radius:8px';
  const show = () => (panel.textContent = `cover search (${navigator.userAgent.slice(0, 60)}…)\n` + searchLog.join('\n'));
  show();
  document.body.append(panel);
  window.addEventListener('coversearchlog', show);
}

// Installable app + offline (production only; dev keeps hot reload simple).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Development only (never in the live build): lets scripts/shots.mjs put the
// app into exact states for the feature pages' screenshots.
if (import.meta.env.DEV) {
  (window as unknown as { __remixity: unknown }).__remixity = {
    load,
    lyricsView,
    params,
    apply,
    render,
    setRatio,
    goPage,
    showSheet,
    library,
    get player() {
      return player;
    },
    get automation() {
      return automation;
    },
    touchAutomation: () => (autoDirty = true),
    nowPlaying: () => nowPlaying.active,
  };
}

