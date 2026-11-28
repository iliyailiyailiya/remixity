// The Mix sheet: the queue with a transition between every two songs (as in
// Spotify's Mix), and an editor for one transition. Unlike Spotify's it works
// on any queue (library, playlists, shuffle), it's free, and the editor
// saves as you go.

import { t } from '../i18n';
import { getAudio, getTrack } from '../library/db';
import { decodeData } from '../engine/decode';
import { detectBpm } from '../engine/bpm';
import {
  DEFAULT_TRANSITION,
  PRESETS,
  musicEdges,
  presetOf,
  stripAt,
  type EffectShape,
  type EqShape,
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
  /** The next song, if it's already decoded. */
  aheadBuffer(id: string): AudioBuffer | null;
  ratio(): number;
  /** Play the current transition from a few seconds before it. */
  preview(tr: Transition): void;
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

/** A transition's length in real seconds (bars need the tempo you hear). */
export function mixSeconds(tr: Transition, bpm: number | null): number {
  if (bpm && bpm > 40) return Math.max(1, Math.min(45, (tr.bars * 4 * 60) / bpm));
  return tr.seconds;
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
  edges: { start: number; end: number } | null;
}
const cache = new Map<string, Promise<Song>>();

async function songInfo(id: string, host: MixHost, wantAudio: boolean): Promise<Song> {
  const tr = await getTrack(id);
  const base: Song = { id, title: tr?.title ?? '—', artist: tr?.artist ?? '', buffer: null, bpm: null, edges: null };
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
    const bpm = id === host.playingId() && host.playingBpm() ? host.playingBpm() : await detectBpm(buffer).catch(() => null);
    return { ...base, buffer, bpm, edges: musicEdges(buffer) };
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
  $('mixPreview').addEventListener('click', () => ed && host.preview(ed.tr));

  /** The tempo the transition is counted in: A's, as you hear it. */
  const bpmOf = () => (ed?.a.bpm ? ed.a.bpm * (ed.current ? host.ratio() : 1) : null);

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
    const bpm = bpmOf();
    $('mixLen').replaceChildren(
      ...(bpm
        ? BARS.map((n) => chip(`${n} ${t('mixBars')}`, tr.bars === n, () => change({ bars: n })))
        : SECONDS.map((n) => chip(`${n} s`, tr.seconds === n, () => change({ seconds: n })))),
    );
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

  /** The view, in real seconds around A's last note (0). */
  function view() {
    const dur = ed ? mixSeconds(ed.tr, bpmOf()) : 8;
    const shift = ed?.tr.shift ?? 0;
    const start = -(dur - shift);
    const pad = Math.max(4, dur * 0.45);
    return { dur, start, from: Math.min(start - pad, -dur - pad), to: Math.max(shift + pad * 0.6, 3) };
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
    if (!ed) return;
    info.textContent = '';
    const { a, b, tr } = ed;
    const v = view();
    const x = (u: number) => ((u - v.from) / (v.to - v.from)) * w;
    const rowH = h / 2;
    const ra = ed.current ? host.ratio() : 1;
    const rb = 1;

    // The transition region.
    g.fillStyle = 'rgba(255,255,255,0.07)';
    const x0 = x(v.start);
    const x1 = x(v.start + v.dur);
    g.fillRect(x0, 0, x1 - x0, h);

    // Bars, counted from the transition's start.
    const bpm = bpmOf();
    if (bpm) {
      const beat = 60 / bpm;
      const first = Math.ceil((v.from - v.start) / beat);
      for (let k = first; v.start + k * beat < v.to; k++) {
        const xx = x(v.start + k * beat);
        const bar = k % 4 === 0;
        g.fillStyle = bar ? (k === 0 ? 'rgba(80,255,150,0.85)' : 'rgba(255,255,255,0.28)') : 'rgba(255,255,255,0.1)';
        g.fillRect(xx - dpr / 2, bar ? 0 : rowH - 6 * dpr, dpr, bar ? h : 12 * dpr);
      }
    }

    // Waveforms: A on top (its end), B below (its start).
    const cols = Math.floor(w / (2 * dpr));
    const lane = (buf: AudioBuffer | null, sec: (u: number) => number, top: number, live: (u: number) => boolean, color: string) => {
      if (!buf) return;
      const pk = peaks(buf, sec(v.from), sec(v.to), cols);
      const mid = top + rowH / 2;
      for (let c = 0; c < cols; c++) {
        const u = v.from + ((c + 0.5) / cols) * (v.to - v.from);
        const s = sec(u);
        if (s < 0 || s > buf.duration) continue;
        const amp = Math.min(1, pk[c] * 1.6) * (rowH / 2 - 6 * dpr);
        g.fillStyle = live(u) ? color : 'rgba(255,255,255,0.16)';
        g.fillRect(c * 2 * dpr, mid - amp, dpr * 1.4, Math.max(dpr, amp * 2));
      }
    };
    const aEnd = a.edges?.end ?? a.buffer?.duration ?? 0;
    const bIn = b.edges?.start ?? 0;
    lane(a.buffer, (u) => aEnd + u * ra, 0, (u) => u <= v.start + v.dur, 'rgba(255,255,255,0.75)');
    lane(b.buffer, (u) => bIn + (u - v.start) * rb, rowH, (u) => u >= v.start, 'rgba(255,255,255,0.75)');

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
        const px = x(v.start + xx * v.dur);
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
    info.textContent = `${a.bpm ? Math.round(a.bpm) : '–'} → ${b.bpm ? Math.round(b.bpm) : '–'} BPM · ${v.dur.toFixed(1)} s`;
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
    const v = view();
    const secPerPx = (v.to - v.from) / canvas.clientWidth;
    let shift = drag.shift + (e.clientX - drag.x) * secPerPx;
    // Snap to beats when the tempo is known.
    const bpm = bpmOf();
    if (bpm) shift = Math.round(shift / (60 / bpm)) * (60 / bpm);
    shift = Math.max(-40, Math.min(v.dur * 0.5, shift));
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
