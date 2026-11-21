import './style.css';
import { applyI18n, getLang, Lang, setLang, t } from './i18n';
import { DEFAULT_PARAMS, FxParams } from './engine/chain';
import { decodeFile, niceName, safeFileName } from './engine/decode';
import { Player } from './engine/player';
import { exportAudio, Format, Stage } from './engine/render';
import { Waveform } from './ui/waveform';
import { addMarker, assemble, cut, EditState, initialEdit, keepOnly, removeMarker } from './engine/edit';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------

const params: FxParams = { ...DEFAULT_PARAMS };
let origBpm: number | null = null;
let original: AudioBuffer | null = null; // as decoded, never modified
let buffer: AudioBuffer | null = null; // after trims and cuts; what plays and exports
let edit: EditState = initialEdit(0);
let history: EditState[] = [];
let sel: [number, number] | null = null; // selection in buffer seconds
let trackName = '';
let player: Player | null = null;
let exporting = false;

const PRESETS: Record<string, Partial<FxParams>> = {
  original: { ...DEFAULT_PARAMS },
  slowed: { ratio: 0.85, reverbMix: 0.45, decay: 3.6, tone: 0.4, bass: 3, volume: 0 },
  ultra: { ratio: 0.75, reverbMix: 0.6, decay: 5.5, tone: 0.3, bass: 4, volume: 0 },
  nightcore: { ratio: 1.25, reverbMix: 0.12, decay: 1.4, tone: 0.65, bass: 0, volume: 0 },
};

// ---------- language ----------

const langSel = $<HTMLSelectElement>('lang');
langSel.value = getLang();
langSel.addEventListener('change', () => {
  setLang(langSel.value as Lang);
  render();
});
applyI18n();

// ---------- file loading ----------

const fileInput = $<HTMLInputElement>('file');
const drop = $('drop');
const status = $('status');

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void load(f);
  fileInput.value = '';
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) void load(f);
});

async function load(file: File) {
  status.textContent = t('loading');
  try {
    // Create the AudioContext inside the user gesture so iOS lets it play.
    player ??= new Player(params);
    player.onEnded = render;
    void player.ctx.resume();
    const decoded = await decodeFile(file);
    original = buffer = decoded;
    edit = initialEdit(decoded.duration);
    history = [];
    sel = null;
    trackName = niceName(file.name);
    player.setLoop(null);
    player.load(decoded);
    wave.setBuffer(decoded);
    $('trackName').textContent = trackName;
    $('trackName').title = `${trackName} · ${decoded.sampleRate} Hz · ${decoded.numberOfChannels} ch`;
    $('editor').hidden = false;
    drop.classList.add('compact');
    status.textContent = '';
    $('downloadLink').hidden = true;
    render();
  } catch (err) {
    console.error(err);
    status.textContent = t('loadError');
  }
}

// ---------- waveform & transport ----------

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

const playBtn = $('play');
playBtn.addEventListener('click', togglePlay);
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || !buffer) return;
  const mod = e.metaKey || e.ctrlKey;
  if (e.code === 'Space' && tag !== 'BUTTON') togglePlay();
  else if (mod && e.code === 'KeyZ') undo();
  else if (mod || e.altKey) return;
  else if (e.code === 'KeyM') markerAtPlayhead();
  else if (e.code === 'KeyL') toggleLoop();
  else if (e.code === 'Delete' || e.code === 'Backspace') cutSelection();
  else if (e.code === 'Escape') clearSelection();
  else return;
  e.preventDefault();
});

// ---------- editing: trim, cut, loop, markers ----------

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

function togglePlay() {
  if (!player || !buffer) return;
  if (player.playing) player.pause();
  else void player.play().then(tick);
  render();
}

function tick() {
  if (!player) return;
  renderTransport();
  if (player.playing) requestAnimationFrame(tick);
}

const fmtTime = (s: number) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

function renderTransport() {
  if (!player) return;
  const pos = player.position;
  const dur = player.duration || 1;
  wave.setProgress(pos / dur);
  $('time').textContent = `${fmtTime(pos / params.ratio)} / ${fmtTime(dur / params.ratio)}`;
  playBtn.classList.toggle('playing', player.playing);
  playBtn.setAttribute('aria-label', t(player.playing ? 'pause' : 'play'));
}

// ---------- tempo ----------

const speed = $<HTMLInputElement>('speed');
const origInput = $<HTMLInputElement>('origBpm');
const targetInput = $<HTMLInputElement>('targetBpm');

const clampRatio = (r: number) => Math.min(1.5, Math.max(0.5, r));

function setRatio(r: number) {
  params.ratio = Math.round(clampRatio(r) * 100000) / 100000;
  apply();
}

speed.addEventListener('input', () => setRatio(+speed.value));

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
  return `${sign}${st} ${t('st')}${ct ? ` ${ct} ${t('ct')}` : ''}`;
}

// ---------- effects ----------

type SliderKey = Exclude<keyof FxParams, 'ratio'>;
interface SliderDef {
  id: string;
  key: SliderKey;
  fmt: (v: number) => string;
  /** param → slider position (defaults to identity) */
  to?: (v: number) => number;
  /** slider position → param */
  from?: (s: number) => number;
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
  { id: 'mix', key: 'reverbMix', fmt: pct },
  { id: 'decay', key: 'decay', fmt: (v) => `${v.toFixed(1)} s` },
  { id: 'tone', key: 'tone', fmt: (v) => (v < 0.34 ? t('dark') : v > 0.66 ? t('bright') : pct(v)) },
  { id: 'bass', key: 'bass', fmt: db },
  { id: 'volume', key: 'volume', fmt: db },
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
    apply();
  });
}

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

// Built-in presets start from the defaults so they also clear EQ and effects.
document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    Object.assign(params, DEFAULT_PARAMS, PRESETS[b.dataset.preset!]);
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
  player?.setParams({ ...params });
  render();
}

// ---------- export ----------

const exportBtn = $<HTMLButtonElement>('export');
const progress = $('progress');
const bar = progress.firstElementChild as HTMLElement;
const exportStatus = $('exportStatus');
const link = $<HTMLAnchorElement>('downloadLink');

function outputName(fmt: Format) {
  const r = params.ratio;
  let tag = 'remix';
  if (r < 0.999) tag = params.reverbMix > 0.05 ? 'slowed + reverb' : 'slowed';
  else if (r > 1.001) tag = r >= 1.15 ? 'nightcore' : 'sped up';
  else if (params.reverbMix > 0.05) tag = 'reverb';
  return safeFileName(`${trackName} (${tag})`) + (fmt === 'mp3' ? '.mp3' : '.wav');
}

exportBtn.addEventListener('click', async () => {
  if (!buffer || exporting) return;
  exporting = true;
  exportBtn.disabled = true;
  link.hidden = true;
  progress.hidden = false;
  const fmt = (document.querySelector('input[name="fmt"]:checked') as HTMLInputElement).value as Format;
  const label: Record<Stage, () => string> = {
    resample: () => t('stageResample'),
    render: () => t('stageRender'),
    encode: () => t('stageEncode'),
  };
  try {
    const blob = await exportAudio(buffer, { ...params }, fmt, (stage, f) => {
      exportStatus.textContent = `${label[stage]()}${f === null ? '…' : ` ${Math.round(f * 100)}%`}`;
      progress.classList.toggle('indeterminate', f === null);
      bar.style.width = `${Math.round((f ?? 0) * 100)}%`;
    });
    if (link.href) URL.revokeObjectURL(link.href);
    link.href = URL.createObjectURL(blob);
    link.download = outputName(fmt);
    link.hidden = false;
    link.textContent = `${t('download')} · ${(blob.size / 1048576).toFixed(1)} MB`;
    exportStatus.textContent = link.download;
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

function render() {
  speed.value = String(params.ratio);
  $('rRatio').textContent = `×${params.ratio.toFixed(3)}`;
  $('rPitch').textContent = pitchText(params.ratio);
  const target = origBpm ? origBpm * params.ratio : null;
  $('rBpm').textContent = target ? target.toFixed(1) : '—';
  if (document.activeElement !== origInput) origInput.value = origBpm ? String(origBpm) : '';
  if (document.activeElement !== targetInput) targetInput.value = target ? target.toFixed(1) : '';
  targetInput.disabled = !origBpm;
  $('nudgeUnit').textContent = origBpm ? 'BPM' : '%';

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

  renderEdit();
  renderTransport();
}

render();
