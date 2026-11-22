import './style.css';
import { applyI18n, getLang, Lang, setLang, t } from './i18n';
import { DEFAULT_PARAMS, FxParams } from './engine/chain';
import { decodeData, niceName, safeFileName } from './engine/decode';
import { Player } from './engine/player';
import { exportAudio, Format, Stage } from './engine/render';
import { addMarker, assemble, cut, EditState, initialEdit, keepOnly, removeMarker } from './engine/edit';
import { readMeta, metaFromFileName } from './engine/meta';
import { detectBpm } from './engine/bpm';
import { readbackIsNoisy } from './engine/noisecheck';
import { Waveform } from './ui/waveform';
import { EqView } from './ui/eqview';
import { initShare } from './share/ui';
import { initAds } from './ads';
import { findCover, findCoversEnabled, setFindCovers } from './ui/coverSearch';
import { withTags } from './engine/tags';
import { Backdrop } from './ui/backdrop';
import { defaultPalette, generatedCover, paletteFrom } from './ui/palette';
import { Pedal, MAX_RATIO, MIN_RATIO } from './ui/pedal';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------

const params: FxParams = { ...DEFAULT_PARAMS };
let origBpm: number | null = null;
let detectingBpm = false;
let autoSpace = true; // reverb follows the pedal
let original: AudioBuffer | null = null; // as decoded, never modified
let buffer: AudioBuffer | null = null; // after trims and cuts; what plays and exports
let edit: EditState = initialEdit(0);
let history: EditState[] = [];
let sel: [number, number] | null = null; // selection in buffer seconds
let trackName = '';
// The song's own title/artist (for tags and the cover search).
let songTitle = '';
let songArtist: string | null = null;
let coverIsGenerated = false;
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
    render();
  });
}
applyI18n();

// ---------- file loading ----------

const fileInput = $<HTMLInputElement>('file');
const home = $('home');
const playerView = $('player');
const status = $('status');

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void load(f);
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
  if (f) void load(f);
});

async function load(file: File) {
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
      player.onEnded = render;
      player.onInterrupted = render;
    }
    void player.ctx.resume();

    // A new song starts fresh: normal speed, its own BPM, no effects.
    player.pause();
    Object.assign(params, DEFAULT_PARAMS);
    autoSpace = true;
    origBpm = null;
    detectingBpm = true;
    apply();

    const data = await file.arrayBuffer();
    const name = niceName(file.name);
    const fromName = metaFromFileName(name);
    const meta = readMeta(data);
    const decoded = await decodeData(data);
    if (token !== loadToken) return;

    original = buffer = decoded;
    edit = initialEdit(decoded.duration);
    history = [];
    sel = null;
    trackName = name;
    player.setLoop(null);
    player.load(decoded);
    wave.setBuffer(decoded);

    const title = meta.title || fromName.title || name;
    $('title').textContent = title;
    $('artist').textContent = meta.artist || fromName.artist || t('yourTrack');
    document.title = `${title} · THE REMIXITY`;

    // Cover art (or a generated one) drives the background colours.
    const cover = $<HTMLImageElement>('cover');
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    coverUrl = URL.createObjectURL(meta.cover ?? (await generatedCover(title)));
    cover.onerror = async () => {
      // Embedded art the browser can't show: fall back to a generated cover.
      cover.onerror = null;
      URL.revokeObjectURL(coverUrl);
      coverUrl = URL.createObjectURL(await generatedCover(title));
      cover.src = coverUrl;
      setGeneratedCover(true);
    };
    cover.onload = async () => {
      // Paint the cover itself as the background (no pixel readback, so it
      // works even where Safari blocks reading canvas pixels).
      backdrop.setImage(cover.src);
      backdrop.setPalette(await paletteFrom(cover)); // CSS fallback, best effort
    };
    cover.src = coverUrl;
    setBlur(false); // blur is per song

    // No cover in the file: look it up by artist and title (just the name).
    songTitle = title;
    songArtist = meta.artist || fromName.artist || null;
    setGeneratedCover(!meta.cover);
    if (!meta.cover && findCoversEnabled()) void searchCover(token, false);

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
    updateMediaSession(title, meta.artist || fromName.artist || '');
    setTimeout(showSwipeHint, 700);
    detectBpm(decoded)
      .then((bpm) => {
        if (token === loadToken) origBpm = bpm;
      })
      .catch((err) => console.warn('bpm', err))
      .finally(() => {
        if (token !== loadToken) return;
        detectingBpm = false;
        render();
      });
  } catch (err) {
    console.error(err);
    status.textContent = t('loadError');
    home.hidden = false;
    playerView.hidden = true;
  }
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

const blurBox = $<HTMLInputElement>('blurCover');
function setBlur(on: boolean) {
  blurBox.checked = on;
  $('coverFrame').classList.toggle('blurred', on);
}
blurBox.addEventListener('change', () => setBlur(blurBox.checked));

const findBox = $<HTMLInputElement>('findCovers');
findBox.checked = findCoversEnabled();
findBox.addEventListener('change', () => setFindCovers(findBox.checked));

// ---------- finding a missing cover ----------

const findCoverBtn = $<HTMLButtonElement>('findCoverBtn');
const findCoverLabel = $('findCoverLabel');

function setGeneratedCover(generated: boolean) {
  coverIsGenerated = generated;
  findCoverBtn.hidden = !generated;
  findCoverBtn.disabled = false;
  findCoverLabel.textContent = t('findCover');
}

/** Search for the current song's cover; swap it in if a real match turns up. */
async function searchCover(token: number, manual: boolean) {
  findCoverBtn.disabled = true;
  findCoverLabel.textContent = t('findingCover');
  const found = await findCover(songTitle, songArtist);
  if (token !== loadToken) return;
  if (!found) {
    findCoverBtn.disabled = false;
    findCoverLabel.textContent = manual ? t('noCoverFound') : t('findCover');
    if (manual) setTimeout(() => token === loadToken && coverIsGenerated && (findCoverLabel.textContent = t('findCover')), 2500);
    return;
  }
  const cover = $<HTMLImageElement>('cover');
  cover.onerror = null;
  URL.revokeObjectURL(coverUrl);
  coverUrl = URL.createObjectURL(found);
  cover.src = coverUrl; // onload repaints the background
  setGeneratedCover(false);
  updateMediaSession(songTitle, songArtist ?? '');
}
findCoverBtn.addEventListener('click', () => void searchCover(loadToken, true));

function togglePlay() {
  if (!player || !buffer) return;
  if (player.playing) player.pause();
  else player.play();
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
function updateMediaSession(title: string, artist: string) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    album: 'THE REMIXITY',
    artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512' }] : [],
  });
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const on = (a: MediaSessionAction, h: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(a, h);
    } catch {
      /* action not supported here */
    }
  };
  on('play', () => player && !player.playing && togglePlay());
  on('pause', () => player?.playing && togglePlay());
  on('seekbackward', () => skip(-10));
  on('seekforward', () => skip(10));
  on('seekto', (d) => {
    if (!player || d.seekTime === undefined) return;
    player.seek(d.seekTime * params.ratio);
    render();
  });
}

// It's an app, not a document: no pinch zoom (iOS ignores user-scalable).
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());

// Coming back to the page: wake the audio if the system parked it.
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
  player.seek(scrubbing * player.duration);
  scrubbing = null;
  barEl.classList.remove('active');
  render();
};
barEl.addEventListener('pointerup', endScrub);
barEl.addEventListener('pointercancel', endScrub);
barEl.addEventListener('lostpointercapture', endScrub); // Safari can drop the pointer silently

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
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
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  scrim.classList.add('open');
  renderEdit();
}
function closeSheets() {
  for (const s of document.querySelectorAll<HTMLElement>('.sheet')) {
    s.classList.remove('open');
    s.setAttribute('aria-hidden', 'true');
  }
  scrim.classList.remove('open');
  openSheet = null;
}
scrim.addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
$('openMenu').addEventListener('click', () => showSheet($('menu')));
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

const PAGES = ['play', 'drive', 'space', 'eq', 'chop'] as const;
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
$('back10').addEventListener('click', () => skip(-10));
$('fwd10').addEventListener('click', () => skip(10));
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
function commit(next: EditState, keepAt?: number) {
  if (!original || !player) return;
  history.push(edit);
  if (history.length > 50) history.shift();
  const rebuild = next.segments !== edit.segments;
  edit = next;
  if (rebuild) {
    buffer = assemble(original, edit.segments);
    player.load(buffer, keepAt ?? player.position);
    wave.setBuffer(buffer);
  }
  render();
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
  const prev = history.pop();
  if (!prev || !original || !player) return;
  const rebuild = prev.segments !== edit.segments;
  edit = prev;
  if (rebuild) {
    sel = null;
    player.setLoop(null);
    buffer = assemble(original, edit.segments);
    player.load(buffer, player.position);
    wave.setBuffer(buffer);
  }
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
  const cents = Math.round(1200 * Math.log2(r));
  if (cents === 0) return `0 ${t('st')}`;
  const sign = cents < 0 ? '−' : '+';
  const a = Math.abs(cents);
  const st = Math.floor(a / 100);
  const ct = a % 100;
  if (st === 0) return `${sign}${ct} ${t('ct')}`;
  return `${sign}${st} ${t('st')}${ct ? ` ${ct} ${t('ct')}` : ''}`;
}

// ---------- sound & effects (menu) ----------

type SliderKey = Exclude<keyof FxParams, 'ratio'>;
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
    Object.assign(params, DEFAULT_PARAMS, PRESETS[b.dataset.preset!]);
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
        if (typeof p.params[k] === 'number' && Number.isFinite(p.params[k])) clean[k] = p.params[k];
      }
      Object.assign(params, DEFAULT_PARAMS, clean);
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
  render();
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
    return exportAudio(buffer, { ...params }, 'mp3', (_stage, f) => onProgress(f));
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
    });
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
function renderTransport() {
  if (!player) return;
  const dur = player.duration || 1;
  const pos = scrubbing !== null ? scrubbing * dur : player.position;
  const r = params.ratio;
  $('barFill').style.width = `${(pos / dur) * 100}%`;
  $('tNow').textContent = fmtTime(pos / r);
  $('tLeft').textContent = `−${fmtTime((dur - pos) / r)}`;
  playerView.classList.toggle('playing', player.playing);
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const state = player.playing ? 'playing' : 'paused';
    // The lock screen extrapolates on its own; update it about once a second.
    const now = performance.now();
    if (now - lastPositionSync > 1000 || ms.playbackState !== state) {
      lastPositionSync = now;
      try {
        ms.setPositionState({ duration: dur / r, position: Math.min(pos, dur) / r, playbackRate: 1 });
      } catch {
        /* not supported */
      }
    }
    if (ms.playbackState !== state) ms.playbackState = state;
  }
  playToggles.forEach((b) => b.setAttribute('aria-label', t(player!.playing ? 'pause' : 'play')));
  backdrop.speed = (player.playing ? 1 : 0.3) * r;
  if (page === 'chop') wave.setProgress(pos / dur);
}

function render() {
  const r = params.ratio;
  pedal.set(r);

  // Dashboard
  const bpmBig = $('bpmBig');
  bpmBig.textContent = origBpm ? String(Math.round(origBpm * r)) : detectingBpm ? '···' : '—';
  bpmBig.classList.toggle('detecting', detectingBpm && !origBpm);
  $('gaugeSub').textContent = `×${r.toFixed(2)} · ${pitchText(r)}`;
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
