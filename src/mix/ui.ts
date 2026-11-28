// Mix: transitions between songs (Spotify's "Mix", done our way).
//
// - The Mix sheet: the queue with a transition pill between every two songs.
//   The playing song and the transition it's heading into are lit up.
// - The editor: full screen over the cover colours (like the big lyrics),
//   the two songs' waveforms stacked with their own beats, the transition's
//   curves, a live playhead. It saves as you go.
// - The Mix widget (a card in the dashboard): the playing song's waveform with
//   the curves of its transitions in, no labels. Tap it for the editor.
// - Mix two songs: pick two files on the home screen and mix them.

import { t } from '../i18n';
import { getAudio, getTrack } from '../library/db';
import { decodeData } from '../engine/decode';
import { camelot, harmony, semitonesOf, shiftKey, type Key } from '../engine/key';
import {
  DEFAULT_TRANSITION,
  PRESETS,
  musicEdges,
  planTransition,
  presetOf,
  stripAt,
  type EffectShape,
  type EqShape,
  type Grid,
  type Plan,
  type PresetName,
  type StripState,
  type Transition,
  type VolumeShape,
} from '../engine/mix';
import { knownInfo, songInfo } from './info';

/** The transition that brought the playing song in. */
export interface Incoming {
  id: string;
  tr: Pick<Transition, 'volume' | 'eq' | 'effect'>;
  dur: number;
  bIn: number;
  rateIn: number;
}

export interface MixHost {
  showSheet(el: HTMLElement): void;
  closeSheets(): void;
  /** The queue from the playing song on. */
  queue(): string[];
  playingId(): string | null;
  isOn(): boolean;
  setOn(on: boolean): void;
  /** The playing song's buffer (if it's the queue's current song). */
  playingBuffer(): AudioBuffer | null;
  playingBpm(): number | null;
  playingGrid(): Grid | null;
  /** The next song, if it's already decoded. */
  aheadBuffer(id: string): AudioBuffer | null;
  ratio(): number;
  /** The speed a new song starts at (1, or the locked pedal). */
  lockedRatio(): number;
  keepPitch(): boolean;
  position(): number;
  isPlaying(): boolean;
  /** A transition is sounding right now. */
  mixing(): boolean;
  /** The transition out of the playing song (rough until the next song is decoded). */
  nextPlan(): Plan | null;
  incoming(): Incoming | null;
  /**
   * Play the transition a → b (loading a if needed) and stop at its end;
   * `before` = start one bar earlier.
   */
  preview(a: string, b: string, before: boolean): Promise<void>;
  previewing(): boolean;
  stopPreview(): void;
  /**
   * Open a song's own automation (the timeline), loading the song if needed.
   * `back` runs when the timeline is closed (to come back to the mix).
   */
  editSong(id: string, back: () => void): void;
  /** Add two files to the library, queue them in this order; their ids. */
  startStudio(files: [File, File]): Promise<[string, string] | null>;
  /** The cover colours behind full-screen views are held still while covered. */
  setCovered(on: boolean): void;
  /** Render the transition a → b as one file and share / download it. */
  exportMix(a: string, b: string, onProgress: (fraction: number) => void): Promise<boolean>;
}

// ---------- saved transitions (per pair of songs) ----------

const KEY = 'mixPairs';
type Saved = Record<string, Transition>;

function saved(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function store(all: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full */
  }
}
const pairKey = (a: string, b: string) => `${a}|${b}`;

/** The transition from song a to song b: the one set by hand, or Auto. */
export function transitionFor(a: string, b: string): Transition {
  const s = saved()[pairKey(a, b)];
  return s ? { ...DEFAULT_TRANSITION, ...s } : { ...DEFAULT_TRANSITION };
}
function saveTransition(a: string, b: string, tr: Transition | null) {
  const all = saved();
  if (tr) all[pairKey(a, b)] = { ...tr, custom: true };
  else delete all[pairKey(a, b)];
  store(all);
}

// ---------- options ----------

const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];
const VOLUME: VolumeShape[] = ['fade', 'rise', 'early', 'cut'];
const EQS: EqShape[] = ['none', 'bassMid', 'bassEnd', 'blend'];
const EFFECTS: EffectShape[] = ['none', 'rise', 'wave', 'melt'];
const BARS = [2, 4, 8, 16];
const SECONDS = [3, 6, 10, 16];

const label = (k: string) => t(k as Parameters<typeof t>[0]);
const presetLabel = (p: PresetName) => label(`mixP_${p}`);

// Colours of the three controls (the curves on the waveforms use them too).
const COLORS = { volume: '#29c8ff', eq: '#ffd23b', effect: '#c77dff' } as const;
type Tab = keyof typeof COLORS;

/** Curve heights, 0 (bottom) … 1 (top), for each control. */
const dbH = (d: number) => Math.max(0, 1 + d / 40);
const hzH = (f: number) => Math.log(f / 20) / Math.log(1000); // 20 Hz → 0, 20 kHz → 1
const SHOW: Record<Tab, (s: StripState) => number> = {
  volume: (s) => s.gain,
  eq: (s) => dbH(s.low),
  // The filter that's moving: a rising high-pass or a closing low-pass both dip the line.
  effect: (s) => Math.min(1 - hzH(s.hp), hzH(s.lp)),
};

const fmtTime = (s: number) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- songs for the editor ----------

interface Song {
  id: string;
  title: string;
  artist: string;
  buffer: AudioBuffer | null;
  bpm: number | null;
  grid: Grid | null;
  key: Key | null;
  edges: { start: number; end: number } | null;
}
const cache = new Map<string, Promise<Song>>();

async function loadSong(id: string, host: MixHost): Promise<Song> {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = (async () => {
    const tr = await getTrack(id);
    const base: Song = { id, title: tr?.title ?? '—', artist: tr?.artist ?? '', buffer: null, bpm: null, grid: null, key: null, edges: null };
    const playing = id === host.playingId();
    let buffer = playing ? host.playingBuffer() : host.aheadBuffer(id);
    if (!buffer) {
      const audio = await getAudio(id);
      if (!audio) return base;
      buffer = await decodeData(await audio.arrayBuffer());
    }
    const info = await songInfo(id, buffer, playing ? host.playingBpm() : null);
    // The playing song's grid may have been corrected by hand ("Beat 1 here").
    const grid = (playing ? host.playingGrid() : null) ?? info.grid;
    return { ...base, buffer, bpm: grid ? 60 / grid.beat : info.bpm, grid, key: info.key, edges: musicEdges(buffer) };
  })();
  cache.set(id, p);
  // Keep only a few songs' audio around (each is tens of MB).
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  p.catch(() => cache.delete(id));
  return p;
}

/** "124 BPM · 8A" for a song, from what's known (the key as you hear it at `rate`). */
function tempoKey(bpm: number | null | undefined, key: Key | null | undefined, rate: number, keepPitch: boolean) {
  const parts: string[] = [];
  if (bpm) parts.push(`${Math.round(bpm * rate)} BPM`);
  if (key) parts.push(camelot(keepPitch ? key : shiftKey(key, semitonesOf(rate))));
  return parts.join(' · ');
}

/** Peak per column, of `buffer` between seconds a and b. */
function peaks(buffer: AudioBuffer, a: number, b: number, cols: number): Float32Array {
  const out = new Float32Array(cols);
  const sr = buffer.sampleRate;
  const ch = [buffer.getChannelData(0), buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1))];
  const per = ((b - a) * sr) / cols;
  const stride = Math.max(1, Math.floor(per / 300));
  for (let c = 0; c < cols; c++) {
    const i0 = Math.floor(a * sr + c * per);
    const i1 = Math.floor(i0 + per);
    let m = 0;
    for (let i = Math.max(0, i0); i < Math.min(buffer.length, i1); i += stride) {
      const v = Math.abs(ch[0][i]) + Math.abs(ch[1][i]);
      if (v > m) m = v;
    }
    out[c] = m / 2;
  }
  return out;
}

function sizeCanvas(c: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(c.clientWidth * dpr));
  const h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return { w, h, dpr };
}

// ---------- the whole thing ----------

export function initMix(host: MixHost) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const sheet = $('mixSheet');
  const onBox = $<HTMLInputElement>('mixOn');
  const list = $('mixQueue');
  const empty = $('mixEmpty');
  const full = $('mixFull');
  const studio = $('mixStudio');
  const editView = $('mixEditView');
  const canvas = $<HTMLCanvasElement>('mixCanvas');
  const info = $('mixStageInfo');
  const mini = $<HTMLCanvasElement>('mixMini');
  let tab: Tab = 'volume';
  /** Where Back goes from the editor. */
  let backTo: 'list' | 'close' = 'close';

  // The transition being edited.
  let ed: { a: Song; b: Song; tr: Transition; rateA: number } | null = null;

  onBox.addEventListener('change', () => {
    host.setOn(onBox.checked);
    void renderList();
  });

  // ---------- the list ----------

  let listTimer = 0;
  async function renderList() {
    onBox.checked = host.isOn();
    sheet.classList.toggle('mix-off', !host.isOn());
    const ids = host.queue().slice(0, 40);
    empty.hidden = ids.length > 1;
    const tracks = await Promise.all(ids.map((id) => getTrack(id)));
    list.replaceChildren();
    tracks.forEach((tr, i) => {
      const id = ids[i];
      const li = document.createElement('li');
      li.className = 'mix-song' + (i === 0 && id === host.playingId() ? ' now' : '');
      const name = document.createElement('b');
      name.textContent = tr?.title ?? '—';
      const by = document.createElement('span');
      const known = knownInfo(id);
      const rate = i === 0 ? host.ratio() : host.lockedRatio();
      const tk = tempoKey(known?.bpm, known?.key, rate, host.keepPitch());
      by.textContent = [tr?.artist, tk].filter(Boolean).join(' · ');
      li.append(name, by);
      if (i === 0) {
        const bar = document.createElement('i');
        bar.className = 'mix-progress';
        li.append(bar);
      }
      list.append(li);
      const next = ids[i + 1];
      if (!next) return;
      const trn = transitionFor(id, next);
      const pill = document.createElement('li');
      pill.className = 'mix-link' + (i === 0 ? ' live' : '');
      const btn = document.createElement('button');
      btn.className = 'mix-pill';
      btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4c4 0 6 10 10 10h4" /><path d="M3 17h4c4 0 6-10 10-10h4" /></svg>`;
      const txt = document.createElement('span');
      const p = presetOf(trn);
      // Auto: the app decides (style and length). Custom: you changed this one.
      txt.textContent = trn.custom
        ? `${t('mixCustom')} · ${p ? `${presetLabel(p)} · ` : ''}${trn.bars} ${t('mixBars')}`
        : t('mixAuto');
      pill.classList.toggle('custom', !!trn.custom);
      btn.append(txt);
      if (i === 0) {
        const when = document.createElement('em');
        when.className = 'mix-when';
        btn.append(when);
      }
      btn.addEventListener('click', () => {
        backTo = 'list';
        host.closeSheets();
        void openEditor(id, next);
      });
      pill.append(btn);
      list.append(pill);
    });
    tickList();
  }

  /** The live bits of the list: the song's progress and the countdown to its transition. */
  function tickList() {
    const bar = list.querySelector<HTMLElement>('.mix-progress');
    const buf = host.playingBuffer();
    if (bar && buf) bar.style.setProperty('--p', String(Math.min(1, host.position() / buf.duration)));
    const when = list.querySelector<HTMLElement>('.mix-when');
    const live = list.querySelector<HTMLElement>('.mix-link.live');
    if (when && live) {
      const plan = host.nextPlan();
      let text = '';
      let mixingNow = false;
      if (host.mixing()) {
        text = t('mixNow');
        mixingNow = true;
      } else if (plan && host.isOn()) {
        const left = (plan.startA - host.position()) / host.ratio();
        text = left > 0 ? `${t('mixIn')} ${fmtTime(left)}` : t('mixNow');
      }
      when.textContent = text;
      live.classList.toggle('mixing', mixingNow);
    }
  }
  const observeSheet = new MutationObserver(() => {
    clearInterval(listTimer);
    if (sheet.classList.contains('open')) listTimer = window.setInterval(tickList, 500);
  });
  observeSheet.observe(sheet, { attributes: true, attributeFilter: ['class'] });

  // ---------- the full-screen view ----------

  function show(view: 'studio' | 'edit') {
    full.hidden = false;
    studio.hidden = view !== 'studio';
    editView.hidden = view !== 'edit';
    $<HTMLButtonElement>('mixPreview').hidden = view !== 'edit';
    full.querySelector<HTMLElement>('.mix-pair')!.style.visibility = view === 'edit' ? '' : 'hidden';
    document.body.classList.add('mix-open');
    host.setCovered(true);
    startLoop();
  }
  function closeFull() {
    full.hidden = true;
    document.body.classList.remove('mix-open');
    host.setCovered(false);
    ed = null;
  }
  $('mixBack').addEventListener('click', () => {
    const wasList = backTo === 'list' && !editView.hidden;
    closeFull();
    if (wasList) open();
  });

  async function openEditor(a: string, b: string) {
    show('edit');
    $('mixA').textContent = '…';
    $('mixB').textContent = '';
    info.textContent = t('loading');
    ed = null;
    stale = true;
    const [sa, sb] = await Promise.all([loadSong(a, host), loadSong(b, host)]);
    if (full.hidden) return;
    const rateA = a === host.playingId() ? host.ratio() : host.lockedRatio();
    ed = { a: sa, b: sb, tr: transitionFor(a, b), rateA };
    $('mixSongA').textContent = `1 · ${sa.title}`;
    $('mixSongB').textContent = `2 · ${sb.title}`;
    renderHead();
    renderControls();
    stale = true;
  }

  function renderHead() {
    if (!ed) return;
    const pl = plan();
    const kp = host.keepPitch();
    const ta = tempoKey(ed.a.bpm, ed.a.key, ed.rateA, kp);
    const tb = tempoKey(ed.b.bpm, ed.b.key, pl?.rateIn ?? host.lockedRatio(), kp);
    $('mixA').textContent = ed.a.title + (ta ? ` · ${ta}` : '');
    $('mixB').textContent = ed.b.title + (tb ? ` · ${tb}` : '');
  }

  const before = $<HTMLInputElement>('mixBefore');
  try {
    before.checked = localStorage.getItem('mixBefore') === '1';
  } catch {
    /* storage blocked */
  }
  before.addEventListener('change', () => {
    try {
      localStorage.setItem('mixBefore', before.checked ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  });
  $('mixPreview').addEventListener('click', () => {
    if (!ed) return;
    if (host.previewing()) host.stopPreview();
    else void host.preview(ed.a.id, ed.b.id, before.checked);
  });
  for (const [btn, side] of [
    ['mixSongA', 'a'],
    ['mixSongB', 'b'],
  ] as const)
    $(btn).addEventListener('click', () => {
      if (!ed) return;
      const pair = [ed.a.id, ed.b.id] as const;
      const back = backTo;
      closeFull();
      // Closing the timeline brings you back here, to this transition.
      host.editSong(side === 'a' ? pair[0] : pair[1], () => {
        backTo = back;
        cache.delete(pair[0]); // its cuts or automation may have changed
        cache.delete(pair[1]);
        void openEditor(pair[0], pair[1]);
      });
    });

  let exporting = false;
  $('mixExport').addEventListener('click', async () => {
    if (!ed || exporting) return;
    exporting = true;
    const btn = $<HTMLButtonElement>('mixExport');
    const lbl = $('mixExportLabel');
    btn.disabled = true;
    lbl.textContent = `${t('mixExporting')} 0%`;
    try {
      const ok = await host.exportMix(ed.a.id, ed.b.id, (f) => (lbl.textContent = `${t('mixExporting')} ${Math.round(f * 100)}%`));
      lbl.textContent = ok ? t('mixExported') : t('loadError');
    } catch (err) {
      console.error(err);
      lbl.textContent = t('loadError');
    }
    exporting = false;
    btn.disabled = false;
    setTimeout(() => {
      if (!exporting) lbl.textContent = t('mixExport');
    }, 2500);
  });

  /** Where and how the transition happens (the same planner playback uses). */
  function plan(): Plan | null {
    if (!ed || !ed.a.buffer || !ed.b.buffer) return null;
    return planTransition({
      tr: ed.tr,
      aEnd: ed.a.edges?.end ?? ed.a.buffer.duration,
      bStart: ed.b.edges?.start ?? 0,
      rateA: ed.rateA,
      rateB: host.lockedRatio(),
      gridA: ed.a.grid,
      gridB: ed.b.grid,
      bDuration: ed.b.buffer.duration,
    });
  }

  function change(next: Partial<Transition>) {
    if (!ed) return;
    ed.tr = { ...ed.tr, ...next, custom: true };
    saveTransition(ed.a.id, ed.b.id, ed.tr);
    if (!host.isOn()) host.setOn(true); // editing a transition means you want to hear it
    renderControls();
    renderHead();
    stale = true;
  }

  function chip(text: string, on: boolean, run: () => void) {
    const b = document.createElement('button');
    b.textContent = text;
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', run);
    return b;
  }

  function renderControls() {
    if (!ed) return;
    const tr = ed.tr;
    const pl = plan();
    const shown = pl?.tr ?? tr;
    const len = pl?.bar
      ? BARS.map((n) => chip(`${n} ${t('mixBars')}`, tr.custom ? tr.bars === n : !!pl.synced && shown.bars === n, () => change({ bars: n })))
      : SECONDS.map((n) => chip(`${n} s`, tr.custom ? tr.seconds === n : false, () => change({ seconds: n })));
    const sync = chip(t('mixSync'), tr.sync !== false, () => change({ sync: tr.sync === false }));
    sync.className = 'sync' + (pl?.synced ? '' : ' idle'); // on, but these two can't be synced
    sync.disabled = !(ed.a.grid && ed.b.grid);
    $('mixLen').replaceChildren(...len, sync);
    const p = tr.custom ? presetOf(tr) : null;
    $('mixPresets').replaceChildren(
      chip(t('mixAuto'), !tr.custom, () => {
        if (!ed) return;
        saveTransition(ed.a.id, ed.b.id, null);
        ed.tr = transitionFor(ed.a.id, ed.b.id);
        renderControls();
        renderHead();
        stale = true;
      }),
      ...PRESET_NAMES.map((n) => chip(presetLabel(n), p === n, () => change({ ...PRESETS[n] }))),
    );
    const valueOf: Record<Tab, string> = {
      volume: label(`mixV_${shown.volume}`),
      eq: label(`mixE_${shown.eq}`),
      effect: label(`mixF_${shown.effect}`),
    };
    for (const b of document.querySelectorAll<HTMLButtonElement>('#mixTabs button')) {
      const k = b.dataset.tab as Tab;
      b.setAttribute('aria-pressed', String(k === tab));
      b.querySelector('.tab-val')!.textContent = valueOf[k];
      b.classList.toggle('idle', (k === 'eq' || k === 'effect') && shown[k] === 'none');
    }
    const opts =
      tab === 'volume'
        ? VOLUME.map((v) => chip(label(`mixV_${v}`), shown.volume === v, () => change({ volume: v })))
        : tab === 'eq'
          ? EQS.map((v) => chip(label(`mixE_${v}`), shown.eq === v, () => change({ eq: v })))
          : EFFECTS.map((v) => chip(label(`mixF_${v}`), shown.effect === v, () => change({ effect: v })));
    const box = $('mixOptions');
    box.dataset.tab = tab;
    box.replaceChildren(...opts);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#mixTabs button'))
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      renderControls();
      stale = true;
    });

  // ---------- the stage: two waveforms, stacked, as in Spotify ----------

  /** The view, in real seconds from the transition's start (0). */
  function view(pl: Plan) {
    const pad = Math.max(4, pl.dur * 0.4);
    return { from: -pad, to: pl.dur + pad * 0.7 };
  }

  // The still picture is drawn once per change into `still`; each frame adds the playhead.
  const still = document.createElement('canvas');
  let stale = true;

  function drawStill(w: number, h: number, dpr: number, pl: Plan) {
    if (!ed) return;
    still.width = w;
    still.height = h;
    const g = still.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const { a, b } = ed;
    const tr = pl.tr;
    const v = view(pl);
    const x = (u: number) => ((u - v.from) / (v.to - v.from)) * w;
    const rowH = h / 2;
    const ra = ed.rateA;
    const rb = pl.rateIn;

    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(x(0), 0, x(pl.dur) - x(0), h);

    // Each song's own beats; bar lines (beat 1) in green, as in Spotify:
    // when the songs are in sync, the green lines meet.
    const beats = (grid: Grid | null, start: number, rate: number, top: number) => {
      if (!grid) return;
      const k0 = Math.ceil((start + v.from * rate - grid.offset) / grid.beat);
      for (let k = k0; ; k++) {
        const u = (grid.offset + k * grid.beat - start) / rate;
        if (u > v.to) break;
        const bar = ((k % 4) + 4) % 4 === 0;
        g.fillStyle = bar ? (pl.synced ? 'rgba(80,255,150,0.8)' : 'rgba(255,255,255,0.35)') : 'rgba(255,255,255,0.1)';
        g.fillRect(x(u) - dpr / 2, top, dpr, rowH);
      }
    };
    beats(a.grid, pl.startA, ra, 0);
    beats(b.grid, pl.bIn, rb, rowH);

    const cols = Math.floor(w / (2 * dpr));
    const lane = (buf: AudioBuffer | null, sec: (u: number) => number, top: number, live: (u: number) => boolean) => {
      if (!buf) return;
      const pk = peaks(buf, sec(v.from), sec(v.to), cols);
      const mid = top + rowH / 2;
      for (let c = 0; c < cols; c++) {
        const u = v.from + ((c + 0.5) / cols) * (v.to - v.from);
        const s = sec(u);
        if (s < 0 || s > buf.duration) continue;
        const amp = Math.min(1, pk[c] * 1.6) * (rowH / 2 - 6 * dpr);
        g.fillStyle = live(u) ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.16)';
        g.fillRect(c * 2 * dpr, mid - amp, dpr * 1.4, Math.max(dpr, amp * 2));
      }
    };
    lane(a.buffer, (u) => pl.startA + u * ra, 0, (u) => u <= pl.dur);
    lane(b.buffer, (u) => pl.bIn + u * rb, rowH, (u) => u >= 0);

    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, rowH - dpr / 2, w, dpr);
    const curve = (deck: 'a' | 'b', top: number, val: (s: StripState) => number, color: string, alpha = 1, width = 2.2) => {
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.lineWidth = width * dpr;
      g.beginPath();
      const n = 120;
      for (let i = 0; i <= n; i++) {
        const xx = i / n;
        const yy = top + 6 * dpr + (1 - val(stripAt(tr, deck, xx))) * (rowH - 12 * dpr);
        const px = x(xx * pl.dur);
        if (i === 0) g.moveTo(px, yy);
        else g.lineTo(px, yy);
      }
      g.stroke();
      g.globalAlpha = 1;
    };
    /** Does this control do anything in this transition (else its line would just sit at the top)? */
    const moves = (k: Tab, deck: 'a' | 'b') => {
      for (let i = 0; i <= 20; i++) if (SHOW[k](stripAt(tr, deck, i / 20)) < 0.98) return true;
      return false;
    };
    for (const [deck, top] of [
      ['a', 0],
      ['b', rowH],
    ] as const) {
      // The other two controls, faint, so you see everything a style does.
      for (const k of ['volume', 'eq', 'effect'] as Tab[])
        if (k !== tab && moves(k, deck)) curve(deck, top, SHOW[k], COLORS[k], 0.4, 1.4);
      if (tab === 'volume') curve(deck, top, (s) => s.gain, COLORS.volume);
      else if (tab === 'eq') {
        curve(deck, top, (s) => dbH(s.low), COLORS.eq);
        curve(deck, top, (s) => dbH(s.mid), COLORS.eq, 0.55);
        curve(deck, top, (s) => dbH(s.high), COLORS.eq, 0.3);
      } else {
        curve(deck, top, (s) => 1 - hzH(s.hp), COLORS.effect);
        curve(deck, top, (s) => hzH(s.lp), COLORS.effect, 0.55);
      }
    }

    // The corner: tempo, sync, keys.
    const bpmA = a.bpm ? Math.round(a.bpm * ra) : '–';
    const bpmB = b.bpm ? Math.round(b.bpm * host.lockedRatio()) : '–';
    const state = pl.synced
      ? `${t('mixInSync')} ${pl.nudge >= 0 ? '+' : '−'}${Math.abs(pl.nudge * 100).toFixed(1)}%`
      : !a.grid || !b.grid
        ? t('mixNoBeat')
        : ed.tr.sync === false
          ? `${pl.dur.toFixed(1)} s`
          : t('mixTooFar');
    let keys = '';
    if (a.key && b.key) {
      const kp = host.keepPitch();
      const ka = kp ? a.key : shiftKey(a.key, semitonesOf(ra));
      const kb = kp ? b.key : shiftKey(b.key, semitonesOf(rb));
      const h = harmony(ka, kb);
      keys = ` · ${camelot(ka)} → ${camelot(kb)} ${h === 'match' ? '✓' : h === 'ok' ? '~' : '✕'}`;
      info.dataset.harmony = h;
    } else delete info.dataset.harmony;
    info.textContent = `${bpmA} → ${bpmB} BPM · ${state}${keys}`;
  }

  /** Where the playhead is, in the editor's time (null: not in view). */
  function playheadU(pl: Plan): number | null {
    if (!ed || !host.isPlaying()) return null;
    const id = host.playingId();
    if (id === ed.a.id) return (host.position() - pl.startA) / ed.rateA;
    if (id === ed.b.id) return (host.position() - pl.bIn) / pl.rateIn;
    return null;
  }

  function drawEditor() {
    const { w, h, dpr } = sizeCanvas(canvas);
    const g = canvas.getContext('2d')!;
    const pl = plan();
    if (!ed || !pl) {
      g.clearRect(0, 0, w, h);
      return;
    }
    if (stale || still.width !== w || still.height !== h) {
      drawStill(w, h, dpr, pl);
      stale = false;
    }
    g.clearRect(0, 0, w, h);
    g.drawImage(still, 0, 0);
    const u = playheadU(pl);
    const v = view(pl);
    if (u !== null && u >= v.from && u <= v.to) {
      const px = ((u - v.from) / (v.to - v.from)) * w;
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(px - 4 * dpr, 0, 8 * dpr, h);
      g.fillStyle = '#fff';
      g.fillRect(px - dpr, 0, 2 * dpr, h);
    }
  }

  // One animation loop while the full view is open (the editor's playhead).
  let raf = 0;
  function startLoop() {
    if (raf) return;
    const frame = () => {
      if (full.hidden) {
        raf = 0;
        return;
      }
      if (!editView.hidden) {
        drawEditor();
        const on = host.previewing();
        const btn = $('mixPreview');
        if (btn.classList.contains('stop') !== on) {
          btn.classList.toggle('stop', on);
          $('mixPreviewLabel').textContent = t(on ? 'mixStop' : 'mixPreview');
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // Drag the stage sideways to move where B comes in.
  let drag: { x: number; shift: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!ed) return;
    drag = { x: e.clientX, shift: ed.tr.shift };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !ed) return;
    const pl = plan();
    if (!pl) return;
    const v = view(pl);
    const secPerPx = (v.to - v.from) / canvas.clientWidth;
    // Dragging B right = it comes in later (the transition moves later).
    let shift = drag.shift + (e.clientX - drag.x) * secPerPx;
    // In sync: whole bars, so the downbeats stay together. Otherwise beats.
    const step = pl.bar ? (pl.synced ? pl.bar : pl.bar / 4) : 0.1;
    shift = Math.round(shift / step) * step;
    shift = Math.max(-40, Math.min(pl.dur * 0.5, shift));
    if (shift !== ed.tr.shift) {
      ed.tr = { ...ed.tr, shift };
      stale = true;
    }
  });
  const endDrag = () => {
    if (!drag || !ed) return;
    const moved = ed.tr.shift !== drag.shift;
    drag = null;
    if (moved) change({});
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---------- the widget: the playing song, its transitions, no labels ----------

  let miniPeaks: { buffer: AudioBuffer; cols: number; pk: Float32Array } | null = null;

  function drawMini() {
    const { w, h, dpr } = sizeCanvas(mini);
    const g = mini.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const buf = host.playingBuffer();
    const nextId = host.queue()[1];
    $('mixMiniInfo').textContent = !host.isOn()
      ? t('mixOffShort')
      : nextId
        ? `→ ${miniNextTitle(nextId)}`
        : '';
    if (!buf) return;
    const cols = Math.max(20, Math.floor(w / (3 * dpr)));
    if (miniPeaks?.buffer !== buf || miniPeaks.cols !== cols) miniPeaks = { buffer: buf, cols, pk: peaks(buf, 0, buf.duration, cols) };
    const pos = host.position();
    const x = (s: number) => (s / buf.duration) * w;
    const mid = h / 2;
    for (let c = 0; c < cols; c++) {
      const s = ((c + 0.5) / cols) * buf.duration;
      const amp = Math.min(1, miniPeaks.pk[c] * 1.5) * (h / 2 - 4 * dpr);
      g.fillStyle = s <= pos ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
      g.fillRect((c / cols) * w, mid - amp, Math.max(dpr, (w / cols) * 0.55), Math.max(dpr, amp * 2));
    }
    // The three curves of each transition on this song.
    const curves = (tr: Pick<Transition, 'volume' | 'eq' | 'effect'>, deck: 'a' | 'b', s0: number, s1: number) => {
      if (s1 - s0 < 0.05) return;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x(s0), 0, x(s1) - x(s0), h);
      for (const k of ['effect', 'eq', 'volume'] as Tab[]) {
        g.strokeStyle = COLORS[k];
        g.lineWidth = 2 * dpr;
        g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const xx = i / 60;
          const y = 3 * dpr + (1 - SHOW[k](stripAt(tr, deck, xx))) * (h - 6 * dpr);
          const px = x(s0 + (s1 - s0) * xx);
          if (i === 0) g.moveTo(px, y);
          else g.lineTo(px, y);
        }
        g.stroke();
      }
    };
    if (host.isOn()) {
      const pl = host.nextPlan();
      if (pl && nextId) curves(pl.tr, 'a', pl.startA, Math.min(buf.duration, pl.startA + pl.dur * host.ratio()));
      const inc = host.incoming();
      if (inc && inc.id === host.playingId()) curves(inc.tr, 'b', inc.bIn, inc.bIn + inc.dur * inc.rateIn);
    }
    g.fillStyle = '#fff';
    g.fillRect(x(pos) - dpr, 0, 2 * dpr, h);
  }
  const titles = new Map<string, string>();
  function miniNextTitle(id: string) {
    const known = titles.get(id);
    if (known !== undefined) return known;
    titles.set(id, '…');
    void getTrack(id).then((tr) => titles.set(id, tr?.title ?? '—'));
    return '…';
  }

  const openFromWidget = () => {
    const q = host.queue();
    if (q.length > 1 && q[0] === host.playingId()) {
      backTo = 'close';
      void openEditor(q[0], q[1]);
    } else open();
  };
  mini.addEventListener('click', openFromWidget);
  mini.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') openFromWidget();
  });

  // ---------- mix two songs (from the home screen) ----------

  const files: [File | null, File | null] = [null, null];
  const slotText = () => {
    $('mixSlot1').textContent = files[0]?.name ?? t('mixPickSong');
    $('mixSlot2').textContent = files[1]?.name ?? t('mixPickSong');
    $('mixSlot1').parentElement!.classList.toggle('set', !!files[0]);
    $('mixSlot2').parentElement!.classList.toggle('set', !!files[1]);
    $<HTMLButtonElement>('mixGo').disabled = !(files[0] && files[1]);
  };
  for (const [i, id] of [
    [0, 'mixFile1'],
    [1, 'mixFile2'],
  ] as const) {
    const input = $<HTMLInputElement>(id);
    input.addEventListener('change', () => {
      files[i] = input.files?.[0] ?? null;
      input.value = '';
      slotText();
    });
  }
  $('mixSwap').addEventListener('click', () => {
    files.reverse();
    slotText();
  });
  $('mixGo').addEventListener('click', async () => {
    if (!files[0] || !files[1]) return;
    const go = $<HTMLButtonElement>('mixGo');
    go.disabled = true;
    $('mixStudioStatus').textContent = t('loading');
    const ids = await host.startStudio([files[0], files[1]]).catch(() => null);
    $('mixStudioStatus').textContent = ids ? '' : t('loadError');
    go.disabled = false;
    if (!ids) return;
    host.setOn(true);
    backTo = 'close';
    await openEditor(ids[0], ids[1]);
  });

  function open() {
    host.showSheet(sheet);
    void renderList();
  }

  return {
    open,
    /** Open the two-song mixer (home screen). */
    openStudio() {
      slotText();
      $('mixStudioStatus').textContent = '';
      backTo = 'close';
      show('studio');
    },
    turnOn() {
      host.setOn(true);
      onBox.checked = true;
      sheet.classList.remove('mix-off');
    },
    /** Called with the page's tick while the Mix card is showing. */
    tickWidget: drawMini,
    /** A song's tempo / key may be known now: refresh what shows it. */
    refresh() {
      if (sheet.classList.contains('open')) void renderList();
    },
    get open_() {
      return !full.hidden;
    },
  };
}
