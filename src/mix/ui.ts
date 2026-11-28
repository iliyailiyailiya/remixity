// The Mix sheet: the queue with a transition between every two songs (as in
// Spotify's Mix), and an editor for one transition. Unlike Spotify's it works
// on any queue (library, playlists, shuffle), it's free, and the editor
// saves as you go.

import { t } from '../i18n';
import { getAudio, getTrack } from '../library/db';
import { decodeData } from '../engine/decode';
import { detectBpm, detectGrid } from '../engine/bpm';
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
  type Transition,
  type VolumeShape,
} from '../engine/mix';

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
  /** Play the current transition from a few seconds before it. */
  preview(): void | Promise<void>;
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

// ---------- songs for the editor ----------

interface Song {
  id: string;
  title: string;
  artist: string;
  buffer: AudioBuffer | null;
  bpm: number | null;
  grid: Grid | null;
  edges: { start: number; end: number } | null;
}
const cache = new Map<string, Promise<Song>>();

async function songInfo(id: string, host: MixHost, wantAudio: boolean): Promise<Song> {
  const tr = await getTrack(id);
  const base: Song = { id, title: tr?.title ?? '—', artist: tr?.artist ?? '', buffer: null, bpm: null, grid: null, edges: null };
  if (!wantAudio) return base;
  const hit = cache.get(id);
  if (hit) return hit;
  const p = (async () => {
    let buffer = id === host.playingId() ? host.playingBuffer() : host.aheadBuffer(id);
    if (!buffer) {
      const audio = await getAudio(id);
      if (!audio) return base;
      buffer = await decodeData(await audio.arrayBuffer());
    }
    const playing = id === host.playingId();
    const bpm = playing && host.playingBpm() ? host.playingBpm() : await detectBpm(buffer).catch(() => null);
    const grid = (playing ? host.playingGrid() : null) ?? (bpm ? await detectGrid(buffer, bpm).catch(() => null) : null);
    return { ...base, buffer, bpm: grid ? 60 / grid.beat : bpm, grid, edges: musicEdges(buffer) };
  })();
  cache.set(id, p);
  // Keep only a few songs' audio around (each is tens of MB).
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  p.catch(() => cache.delete(id));
  return p;
}

// ---------- the sheet ----------

export function initMix(host: MixHost) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const sheet = $('mixSheet');
  const listView = $('mixListView');
  const editView = $('mixEditView');
  const onBox = $<HTMLInputElement>('mixOn');
  const list = $('mixQueue');
  const empty = $('mixEmpty');
  const canvas = $<HTMLCanvasElement>('mixCanvas');
  const info = $('mixStageInfo');
  let tab: Tab = 'volume';

  // The transition being edited.
  let ed: { a: Song; b: Song; tr: Transition; current: boolean } | null = null;

  onBox.addEventListener('change', () => {
    host.setOn(onBox.checked);
    renderList();
  });

  async function renderList() {
    onBox.checked = host.isOn();
    sheet.classList.toggle('mix-off', !host.isOn());
    const ids = host.queue().slice(0, 40);
    empty.hidden = ids.length > 1;
    const songs = await Promise.all(ids.map((id) => songInfo(id, host, false)));
    list.replaceChildren();
    songs.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'mix-song' + (i === 0 ? ' now' : '');
      const name = document.createElement('b');
      name.textContent = s.title;
      const by = document.createElement('span');
      by.textContent = s.artist;
      li.append(name, by);
      list.append(li);
      const next = songs[i + 1];
      if (!next) return;
      const tr = transitionFor(s.id, next.id);
      const pill = document.createElement('li');
      pill.className = 'mix-link';
      const btn = document.createElement('button');
      btn.className = 'mix-pill';
      const p = presetOf(tr);
      const len = `${tr.bars} ${t("mixBars")}`;
      btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4c4 0 6 10 10 10h4" /><path d="M3 17h4c4 0 6-10 10-10h4" /></svg>`;
      const txt = document.createElement('span');
      txt.textContent = `${tr.custom ? (p ? presetLabel(p) : t('mixCustom')) : t('mixAuto')} · ${len}`;
      btn.append(txt);
      btn.addEventListener('click', () => void openEditor(s.id, next.id));
      pill.append(btn);
      list.append(pill);
    });
  }

  // ---------- editor ----------

  async function openEditor(a: string, b: string) {
    listView.hidden = true;
    editView.hidden = false;
    $('mixA').textContent = '…';
    $('mixB').textContent = '';
    info.textContent = t('loading');
    ed = null;
    draw();
    const [sa, sb] = await Promise.all([songInfo(a, host, true), songInfo(b, host, true)]);
    if (editView.hidden) return;
    ed = { a: sa, b: sb, tr: transitionFor(a, b), current: a === host.playingId() };
    $('mixA').textContent = sa.title;
    $('mixB').textContent = sb.title;
    $<HTMLButtonElement>('mixPreview').hidden = !ed.current;
    renderControls();
    draw();
  }

  function backToList() {
    editView.hidden = true;
    listView.hidden = false;
    void renderList();
  }
  $('mixBack').addEventListener('click', backToList);
  $('mixPreview').addEventListener('click', () => void host.preview());

  /** Where and how the transition happens (the same planner playback uses). */
  function plan(): Plan | null {
    if (!ed || !ed.a.buffer || !ed.b.buffer) return null;
    return planTransition({
      tr: ed.tr,
      aEnd: ed.a.edges?.end ?? ed.a.buffer.duration,
      bStart: ed.b.edges?.start ?? 0,
      rateA: ed.current ? host.ratio() : host.lockedRatio(),
      rateB: host.lockedRatio(),
      gridA: ed.a.grid,
      gridB: ed.b.grid,
      bDuration: ed.b.buffer.duration,
    });
  }
  const rateA = () => (ed?.current ? host.ratio() : host.lockedRatio());

  function change(next: Partial<Transition>) {
    if (!ed) return;
    ed.tr = { ...ed.tr, ...next, custom: true };
    saveTransition(ed.a.id, ed.b.id, ed.tr);
    if (!host.isOn()) host.setOn(true); // editing a transition means you want to hear it
    renderControls();
    draw();
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
        draw();
      }),
      ...PRESET_NAMES.map((n) => chip(presetLabel(n), p === n, () => change({ ...PRESETS[n] }))),
    );
    for (const b of document.querySelectorAll<HTMLButtonElement>('#mixTabs button'))
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    const opts =
      tab === 'volume'
        ? VOLUME.map((v) => chip(label(`mixV_${v}`), tr.volume === v, () => change({ volume: v })))
        : tab === 'eq'
          ? EQS.map((v) => chip(label(`mixE_${v}`), tr.eq === v, () => change({ eq: v })))
          : EFFECTS.map((v) => chip(label(`mixF_${v}`), tr.effect === v, () => change({ effect: v })));
    const box = $('mixOptions');
    box.dataset.tab = tab;
    box.replaceChildren(...opts);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#mixTabs button'))
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      renderControls();
      draw();
    });

  // ---------- the stage: two waveforms, stacked, as in Spotify ----------

  /** The view, in real seconds from the transition's start (0). */
  function view(pl: Plan) {
    const pad = Math.max(4, pl.dur * 0.4);
    return { from: -pad, to: pl.dur + pad * 0.7 };
  }

  /** Peak per pixel column, of `buffer` between seconds a and b. */
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

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const pl = plan();
    if (!ed || !pl) return;
    const { a, b } = ed;
    const tr = pl.tr;
    const v = view(pl);
    const x = (u: number) => ((u - v.from) / (v.to - v.from)) * w;
    const rowH = h / 2;
    const ra = rateA();
    const rb = pl.rateIn;
    const secA = (u: number) => pl.startA + u * ra;
    const secB = (u: number) => pl.bIn + u * rb;

    // The transition region.
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
        const xx = x(u);
        const bar = ((k % 4) + 4) % 4 === 0;
        g.fillStyle = bar ? (pl.synced ? 'rgba(80,255,150,0.8)' : 'rgba(255,255,255,0.35)') : 'rgba(255,255,255,0.1)';
        g.fillRect(xx - dpr / 2, top, dpr, rowH);
      }
    };
    beats(a.grid, pl.startA, ra, 0);
    beats(b.grid, pl.bIn, rb, rowH);

    // Waveforms: A on top (its end), B below (its start).
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
    lane(a.buffer, secA, 0, (u) => u <= pl.dur);
    lane(b.buffer, secB, rowH, (u) => u >= 0);

    // The divider and the curves of the chosen control.
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, rowH - dpr / 2, w, dpr);
    const curve = (deck: 'a' | 'b', top: number, val: (s: ReturnType<typeof stripAt>) => number, color: string, alpha = 1) => {
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.lineWidth = 2.2 * dpr;
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
    const db = (d: number) => Math.max(0, 1 + d / 40);
    const hz = (f: number) => Math.log(f / 20) / Math.log(1000); // 20 Hz → 0, 20 kHz → 1
    for (const [deck, top] of [
      ['a', 0],
      ['b', rowH],
    ] as const) {
      if (tab === 'volume') curve(deck, top, (s) => s.gain, COLORS.volume);
      else if (tab === 'eq') {
        curve(deck, top, (s) => db(s.low), COLORS.eq);
        curve(deck, top, (s) => db(s.mid), COLORS.eq, 0.55);
        curve(deck, top, (s) => db(s.high), COLORS.eq, 0.3);
      } else {
        curve(deck, top, (s) => 1 - hz(s.hp), COLORS.effect);
        curve(deck, top, (s) => hz(s.lp), COLORS.effect, 0.55);
      }
    }
    const bpmA = a.bpm ? Math.round(a.bpm * ra) : '–';
    const bpmB = b.bpm ? Math.round(b.bpm * host.lockedRatio()) : '–';
    const state = pl.synced
      ? `${t('mixInSync')} ${pl.nudge >= 0 ? '+' : '−'}${Math.abs(pl.nudge * 100).toFixed(1)}%`
      : !a.grid || !b.grid
        ? t('mixNoBeat')
        : ed.tr.sync === false
          ? `${pl.dur.toFixed(1)} s`
          : t('mixTooFar');
    info.textContent = `${bpmA} → ${bpmB} BPM · ${state}`;
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
      draw();
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
  new ResizeObserver(() => draw()).observe(canvas);

  return {
    open() {
      editView.hidden = true;
      listView.hidden = false;
      host.showSheet(sheet);
      void renderList();
    },
    turnOn() {
      host.setOn(true);
      onBox.checked = true;
      sheet.classList.remove('mix-off');
    },
  };
}
