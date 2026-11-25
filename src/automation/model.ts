// Timeline + automation model (see docs/automation-plan.md).
//
// Times are seconds of the edited buffer (what player.position counts), before
// the speed change. Sections are the edit's segments, in timeline order.

import type { FxParams } from '../engine/chain';
import type { EditState } from '../engine/edit';

export type AutoParam =
  | 'ratio'
  | 'reverbMix'
  | 'decay'
  | 'tone'
  | 'delayMix'
  | 'delayTime'
  | 'delayFeedback'
  | 'bass'
  | 'eqLow'
  | 'eqMid'
  | 'eqHigh'
  | 'eqAir'
  | 'lowCut'
  | 'highCut';

export interface ParamInfo {
  min: number;
  max: number;
  group: 'pedal' | 'reverb' | 'echo' | 'eq';
  /** Hz-like: interpolate and draw on a log scale. */
  log?: boolean;
  /** Can be played live from the lane yet (phase 1). See the plan for the rest. */
  live: boolean;
  /** i18n key of its name (existing slider labels where possible). */
  label: string;
}

export const AUTO_PARAMS: Record<AutoParam, ParamInfo> = {
  ratio: { min: 0.5, max: 1.5, group: 'pedal', live: true, label: 'speed' },
  reverbMix: { min: 0, max: 1, group: 'reverb', live: true, label: 'autoReverbMix' },
  decay: { min: 0.6, max: 8, group: 'reverb', live: true, label: 'autoReverbSize' },
  tone: { min: 0, max: 1, group: 'reverb', live: true, label: 'autoReverbTone' },
  delayMix: { min: 0, max: 1, group: 'echo', live: true, label: 'autoEchoMix' },
  delayTime: { min: 0.05, max: 1.5, group: 'echo', live: true, label: 'autoEchoTime' },
  delayFeedback: { min: 0, max: 0.85, group: 'echo', live: true, label: 'autoEchoFeedback' },
  bass: { min: -6, max: 12, group: 'eq', live: true, label: 'bass' },
  eqLow: { min: -12, max: 12, group: 'eq', live: true, label: 'autoEqLow' },
  eqMid: { min: -12, max: 12, group: 'eq', live: true, label: 'autoEqMid' },
  eqHigh: { min: -12, max: 12, group: 'eq', live: true, label: 'autoEqHigh' },
  eqAir: { min: -12, max: 12, group: 'eq', live: true, label: 'autoEqAir' },
  lowCut: { min: 20, max: 2000, group: 'eq', log: true, live: true, label: 'lowCut' },
  highCut: { min: 1000, max: 20000, group: 'eq', log: true, live: true, label: 'highCut' },
};

export const MAX_LANES = 5;

export interface AutoPoint {
  t: number; // timeline seconds
  v: number; // the parameter's own value
}

export interface Lane {
  id: string;
  param: AutoParam;
  points: AutoPoint[]; // sorted by t
}

export interface Automation {
  lanes: Lane[];
}

export const emptyAutomation = (): Automation => ({ lanes: [] });

// Unique across reloads (saved lanes come back with their ids).
const newLaneId = () => `lane${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A new lane for `param`, starting flat at its current value. Null when full or already there. */
export function addLane(a: Automation, param: AutoParam, current: number, length: number): Lane | null {
  if (a.lanes.length >= MAX_LANES || a.lanes.some((l) => l.param === param)) return null;
  const lane: Lane = { id: newLaneId(), param, points: [{ t: 0, v: current }, { t: length, v: current }] };
  a.lanes.push(lane);
  return lane;
}

export function removeLane(a: Automation, id: string) {
  a.lanes = a.lanes.filter((l) => l.id !== id);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 0..1 position of a value inside the parameter's range (log for Hz). */
export function norm(param: AutoParam, v: number) {
  const p = AUTO_PARAMS[param];
  if (p.log) return clamp(Math.log(v / p.min) / Math.log(p.max / p.min), 0, 1);
  return clamp((v - p.min) / (p.max - p.min), 0, 1);
}

export function denorm(param: AutoParam, n: number) {
  const p = AUTO_PARAMS[param];
  n = clamp(n, 0, 1);
  return p.log ? p.min * Math.pow(p.max / p.min, n) : p.min + n * (p.max - p.min);
}

/** The lane's value at time t: linear between points (in the normalised space), held outside. */
export function valueAt(lane: Lane, t: number): number {
  const pts = lane.points;
  if (!pts.length) return NaN;
  if (t <= pts[0].t) return pts[0].v;
  const last = pts[pts.length - 1];
  if (t >= last.t) return last.v;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return denorm(lane.param, norm(lane.param, a.v) + k * (norm(lane.param, b.v) - norm(lane.param, a.v)));
}

/** The parameters at time t: `base` with every live lane applied. */
export function paramsAt(base: FxParams, a: Automation, t: number, liveOnly = true): FxParams {
  const out = { ...base };
  for (const lane of a.lanes) {
    if (liveOnly && !AUTO_PARAMS[lane.param].live) continue;
    const v = valueAt(lane, t);
    if (Number.isFinite(v)) out[lane.param] = v;
  }
  return out;
}

/** Add a point (keeps the lane sorted). Returns its index. */
export function addPoint(lane: Lane, t: number, v: number): number {
  const p = { t, v };
  let i = lane.points.findIndex((q) => q.t > t);
  if (i < 0) i = lane.points.length;
  lane.points.splice(i, 0, p);
  return i;
}

/** Move point i, never past its neighbours. */
export function movePoint(lane: Lane, i: number, t: number, v: number) {
  const pts = lane.points;
  const lo = i > 0 ? pts[i - 1].t : 0;
  const hi = i < pts.length - 1 ? pts[i + 1].t : Infinity;
  pts[i] = { t: clamp(t, lo, hi), v };
}

export function removePoint(lane: Lane, i: number) {
  if (lane.points.length > 1) lane.points.splice(i, 1);
}

// ---------- sections (the edit's segments, in timeline order) ----------

/** Where each section starts on the timeline. */
export function sectionStarts(e: EditState): number[] {
  const out: number[] = [];
  let t = 0;
  for (const s of e.segments) {
    out.push(t);
    t += s.end - s.start;
  }
  return out;
}

/** Split the section under timeline time t into two. Same sound, one more handle. */
export function split(e: EditState, t: number): EditState {
  const starts = sectionStarts(e);
  const i = starts.findIndex((s, k) => t > s + 0.05 && t < s + (e.segments[k].end - e.segments[k].start) - 0.05);
  if (i < 0) return e;
  const s = e.segments[i];
  const at = s.start + (t - starts[i]);
  const segments = [...e.segments.slice(0, i), { start: s.start, end: at }, { start: at, end: s.end }, ...e.segments.slice(i + 1)];
  return { segments, markers: e.markers };
}

/** Move section `from` to index `to`. Markers travel with their section. */
export function moveSection(e: EditState, from: number, to: number): EditState {
  if (from === to || from < 0 || to < 0 || from >= e.segments.length || to >= e.segments.length) return e;
  const starts = sectionStarts(e);
  const tagged = e.markers.map((m) => {
    const k = Math.max(0, starts.findIndex((s, j) => m >= s && m < s + (e.segments[j].end - e.segments[j].start)));
    return { k, off: m - starts[k] };
  });
  const order = e.segments.map((_, k) => k);
  order.splice(to, 0, order.splice(from, 1)[0]);
  const segments = order.map((k) => e.segments[k]);
  const next = { segments, markers: [] as number[] };
  const newStarts = sectionStarts(next);
  next.markers = tagged.map(({ k, off }) => newStarts[order.indexOf(k)] + off).sort((x, y) => x - y);
  return next;
}

/** Automation follows a moved section too: shift each point by how far its section moved. */
export function moveLanesWithSection(a: Automation, e: EditState, from: number, to: number) {
  const before = sectionStarts(e);
  const lens = e.segments.map((s) => s.end - s.start);
  const order = e.segments.map((_, k) => k);
  order.splice(to, 0, order.splice(from, 1)[0]);
  const after: number[] = [];
  let t = 0;
  for (const k of order) {
    after[k] = t;
    t += lens[k];
  }
  for (const lane of a.lanes) {
    lane.points = lane.points
      .map((p) => {
        const k = before.findIndex((s, j) => p.t >= s && p.t < s + lens[j]);
        return k < 0 ? p : { t: p.t - before[k] + after[k], v: p.v };
      })
      .sort((x, y) => x.t - y.t);
  }
}
