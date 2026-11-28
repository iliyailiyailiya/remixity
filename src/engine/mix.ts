// Mixing two songs (Spotify's "Mix", done our way).
//
// While one song hands over to the next, both play at once, each through its
// own effect chain and then its own small DJ strip:
//
//   chain → high-pass → low-pass → low / mid / high EQ → fader → (bus)
//
// A transition is three choices, as in Spotify's editor: how the Volume
// moves, what the EQ does (bass swap, a smooth 3-band blend), and an Effect
// (filter sweeps). Each is a curve over the transition, x = 0 → 1, for the
// song that leaves (A) and the one that comes in (B). The same curves are
// scheduled on the audio clock live and will drive the export.

export type VolumeShape = 'fade' | 'rise' | 'early' | 'cut';
export type EqShape = 'none' | 'bassMid' | 'bassEnd' | 'blend';
export type EffectShape = 'none' | 'rise' | 'wave' | 'melt';

export interface Transition {
  volume: VolumeShape;
  eq: EqShape;
  effect: EffectShape;
  /** Length: bars when the BPM is known (2, 4, 8, 16), else seconds. */
  bars: number;
  seconds: number;
  /** Where B comes in, relative to the automatic point (seconds of real time, + = later). */
  shift: number;
  /** No transition between these two: back to back, as without Mix. */
  off?: boolean;
  /** Line the beats up when the tempos are close enough (default on). */
  sync?: boolean;
  /** Chosen by hand (true) or the automatic default. */
  custom?: boolean;
}

export const PRESETS = {
  fade: { volume: 'fade', eq: 'bassMid', effect: 'none' },
  rise: { volume: 'rise', eq: 'bassEnd', effect: 'rise' },
  blend: { volume: 'fade', eq: 'blend', effect: 'none' },
  wave: { volume: 'fade', eq: 'bassMid', effect: 'wave' },
  melt: { volume: 'fade', eq: 'bassMid', effect: 'melt' },
  slam: { volume: 'cut', eq: 'none', effect: 'none' },
} as const satisfies Record<string, Pick<Transition, 'volume' | 'eq' | 'effect'>>;
export type PresetName = keyof typeof PRESETS;

export const DEFAULT_TRANSITION: Transition = { ...PRESETS.fade, bars: 8, seconds: 8, shift: 0, sync: true };

/** How far apart two tempos may be and still be matched (8%, as DJs nudge). */
export const MAX_NUDGE = 0.08;

/** A song's beat grid (as detectGrid gives it): beat length and a downbeat, in its own seconds. */
export interface Grid {
  beat: number;
  offset: number;
}

export interface PlanInput {
  tr: Transition;
  /** A's music ends here, B's starts here (their own seconds). */
  aEnd: number;
  bStart: number;
  /** A's speed now; B's speed after the transition. */
  rateA: number;
  rateB: number;
  gridA: Grid | null;
  gridB: Grid | null;
  bDuration: number;
}

export interface Plan {
  /** Real seconds. */
  dur: number;
  /** A's own second where the transition begins (x = 0). */
  startA: number;
  /** B's own second that plays at x = 0. */
  bIn: number;
  /** B's speed during the transition (its tempo matched to A's). */
  rateIn: number;
  /** The beats are lined up. */
  synced: boolean;
  /** How far B's speed is nudged (rateIn / rateB − 1). */
  nudge: number;
  /** The transition actually used (Auto resolved). */
  tr: Transition;
  /** One bar of A, in real seconds (when synced or the tempo is known). */
  bar: number | null;
}

/**
 * Where and how a transition happens. With both beat grids and tempos within
 * 8% (or half / double), B is sped up or slowed down to A's tempo and comes
 * in on its first downbeat exactly when A reaches a downbeat; the transition
 * is counted in A's bars and ends at A's last note (moved by whole bars).
 * Otherwise it's a plain fade by the clock. Auto picks for you: an 8-bar
 * beat-matched Fade when the songs fit, a 6-second Fade when they don't.
 */
export function planTransition(i: PlanInput): Plan {
  const auto = !i.tr.custom;
  const { gridA, gridB } = i;
  if (i.tr.off)
    return {
      dur: 0.05,
      startA: Math.max(0, i.aEnd - 0.05 * i.rateA),
      bIn: 0,
      rateIn: i.rateB,
      synced: false,
      nudge: 0,
      tr: { ...i.tr, volume: 'cut', eq: 'none', effect: 'none' },
      bar: null,
    };
  if (i.tr.sync !== false && gridA && gridB && gridA.beat > 0.2 && gridB.beat > 0.2) {
    const heard = i.rateA / gridA.beat; // A's beats per real second
    let best: { rate: number; dev: number } | null = null;
    for (const k of [0.5, 1, 2]) {
      const rate = (heard * gridB.beat) / k; // B's speed that puts k of its beats on each of A's
      const dev = Math.abs(rate / i.rateB - 1);
      if (dev <= MAX_NUDGE && (!best || dev < best.dev)) best = { rate, dev };
    }
    if (best) {
      const tr: Transition = auto ? { ...i.tr, ...PRESETS.fade, bars: 8 } : i.tr;
      const barA = 4 * gridA.beat; // A's seconds
      const len = tr.bars * barA;
      const shiftBars = Math.round((tr.shift * i.rateA) / barA);
      const lastFit = gridA.offset + Math.floor((i.aEnd - len - gridA.offset) / barA) * barA;
      const startA = Math.max(gridA.offset, lastFit + shiftBars * barA);
      const barB = 4 * gridB.beat;
      let bIn = gridB.offset + Math.ceil((i.bStart - 0.02 - gridB.offset) / barB) * barB;
      while (bIn < 0) bIn += barB;
      if (bIn > i.bDuration - 5) bIn = Math.max(0, i.bStart);
      return {
        dur: len / i.rateA,
        startA,
        bIn,
        rateIn: best.rate,
        synced: true,
        nudge: best.rate / i.rateB - 1,
        tr,
        bar: barA / i.rateA,
      };
    }
  }
  const tr: Transition = auto ? { ...i.tr, ...PRESETS.fade } : i.tr;
  const bar = gridA ? (4 * gridA.beat) / i.rateA : null;
  const dur = auto ? 6 : bar ? Math.max(1, Math.min(45, tr.bars * bar)) : tr.seconds;
  return {
    dur,
    startA: Math.max(0, i.aEnd - (dur - tr.shift) * i.rateA),
    bIn: i.bStart,
    rateIn: i.rateB,
    synced: false,
    nudge: 0,
    tr,
    bar,
  };
}

/** Which preset (if any) a transition matches. */
export function presetOf(tr: Transition): PresetName | null {
  for (const [name, p] of Object.entries(PRESETS))
    if (p.volume === tr.volume && p.eq === tr.eq && p.effect === tr.effect) return name as PresetName;
  return null;
}

/** The strip's settings at one moment. */
export interface StripState {
  gain: number; // 0..1
  low: number; // dB
  mid: number; // dB
  high: number; // dB
  hp: number; // Hz (20 = open)
  lp: number; // Hz (20000 = open)
}

export const NEUTRAL: StripState = { gain: 1, low: 0, mid: 0, high: 0, hp: 20, lp: 20000 };
const KILL = -40; // dB: a DJ mixer's "kill"
const DIP = -14;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0 before a, 1 after b, smooth in between. */
const ease = (x: number, a: number, b: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Frequencies sweep evenly to the ear (log scale). */
const sweep = (from: number, to: number, k: number) => from * Math.pow(to / from, k);

function volume(shape: VolumeShape, deck: 'a' | 'b', x: number): number {
  switch (shape) {
    case 'fade': // equal power: the loudness stays even
      return deck === 'a' ? Math.cos((x * Math.PI) / 2) : Math.sin((x * Math.PI) / 2);
    case 'rise': // B rises under A; A leaves at the end
      return deck === 'a' ? Math.cos((ease(x, 0.7, 1) * Math.PI) / 2) : Math.sin((ease(x, 0, 0.75) * Math.PI) / 2);
    case 'early': // B takes over early; A trails away
      return deck === 'a' ? Math.cos((ease(x, 0.2, 1) * Math.PI) / 2) : Math.sin((ease(x, 0, 0.3) * Math.PI) / 2);
    case 'cut': // a hard swap in the middle
      return deck === 'a' ? (x < 0.5 ? 1 : 0) : x < 0.5 ? 0 : 1;
  }
}

function eq(shape: EqShape, deck: 'a' | 'b', x: number): Pick<StripState, 'low' | 'mid' | 'high'> {
  const out = { low: 0, mid: 0, high: 0 };
  switch (shape) {
    case 'bassMid': // one bass at a time: they swap in the middle
      out.low = deck === 'a' ? lerp(0, KILL, ease(x, 0.45, 0.55)) : lerp(KILL, 0, ease(x, 0.45, 0.55));
      break;
    case 'bassEnd':
      out.low = deck === 'a' ? lerp(0, KILL, ease(x, 0.85, 0.97)) : lerp(KILL, 0, ease(x, 0.85, 0.97));
      break;
    case 'blend': // highs of B first, then mids, then the bass
      if (deck === 'a') {
        out.high = lerp(0, DIP, ease(x, 0.1, 0.5));
        out.mid = lerp(0, DIP, ease(x, 0.3, 0.75));
        out.low = lerp(0, KILL, ease(x, 0.5, 0.65));
      } else {
        out.high = lerp(DIP, 0, ease(x, 0, 0.4));
        out.mid = lerp(DIP, 0, ease(x, 0.25, 0.7));
        out.low = lerp(KILL, 0, ease(x, 0.5, 0.65));
      }
      break;
  }
  return out;
}

function effect(shape: EffectShape, deck: 'a' | 'b', x: number): Pick<StripState, 'hp' | 'lp'> {
  const out = { hp: 20, lp: 20000 };
  switch (shape) {
    case 'rise': // A thins out (high-pass up), B opens (low-pass up)
      if (deck === 'a') out.hp = sweep(20, 1500, ease(x, 0, 1));
      else out.lp = sweep(250, 20000, ease(x, 0, 0.85));
      break;
    case 'wave': // A sinks under a low-pass, B surfaces from one
      if (deck === 'a') out.lp = sweep(20000, 350, ease(x, 0, 0.65));
      else out.lp = sweep(350, 20000, ease(x, 0.35, 1));
      break;
    case 'melt': // both through a high-pass: A thins away, B fills in
      if (deck === 'a') out.hp = sweep(20, 900, ease(x, 0.2, 1));
      else out.hp = sweep(900, 20, ease(x, 0, 0.8));
      break;
  }
  return out;
}

/** The strip for one deck at x (0 = transition start, 1 = end). */
export function stripAt(tr: Pick<Transition, 'volume' | 'eq' | 'effect'>, deck: 'a' | 'b', x: number): StripState {
  x = clamp01(x);
  return { gain: volume(tr.volume, deck, x), ...eq(tr.eq, deck, x), ...effect(tr.effect, deck, x) };
}

/** A DJ strip: two filters, a 3-band EQ and a fader. */
export class Strip {
  readonly input: BiquadFilterNode;
  readonly output: GainNode;
  private hp: BiquadFilterNode;
  private lp: BiquadFilterNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;

  constructor(private ctx: BaseAudioContext) {
    const bq = (type: BiquadFilterType, f: number, q = 0.7071) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    this.hp = bq('highpass', 20);
    this.lp = bq('lowpass', Math.min(20000, ctx.sampleRate / 2 - 100));
    this.low = bq('lowshelf', 180);
    this.mid = bq('peaking', 1000, 0.7);
    this.high = bq('highshelf', 3500);
    this.output = ctx.createGain();
    this.input = this.hp;
    this.hp.connect(this.lp).connect(this.low).connect(this.mid).connect(this.high).connect(this.output);
  }

  private params(): [AudioParam, (s: StripState) => number][] {
    const nyq = this.ctx.sampleRate / 2 - 100;
    return [
      [this.output.gain, (s) => s.gain],
      [this.low.gain, (s) => s.low],
      [this.mid.gain, (s) => s.mid],
      [this.high.gain, (s) => s.high],
      [this.hp.frequency, (s) => s.hp],
      [this.lp.frequency, (s) => Math.min(s.lp, nyq)],
    ];
  }

  /** Jump to a state (cancels anything scheduled). */
  set(s: StripState, at = this.ctx.currentTime) {
    for (const [p, get] of this.params()) {
      p.cancelScheduledValues(at);
      p.setValueAtTime(get(s), at);
    }
  }

  /** Play a transition's curves for `deck` from context time `at`, over `dur` seconds, starting at x0. */
  run(tr: Pick<Transition, 'volume' | 'eq' | 'effect'>, deck: 'a' | 'b', at: number, dur: number, x0 = 0) {
    const n = Math.max(8, Math.min(1024, Math.round(dur * 60)));
    const states = Array.from({ length: n }, (_, i) => stripAt(tr, deck, x0 + ((1 - x0) * i) / (n - 1)));
    const len = dur * (1 - x0);
    for (const [p, get] of this.params()) {
      p.cancelScheduledValues(at);
      if (len < 0.02) {
        p.setValueAtTime(get(states[n - 1]), at);
        continue;
      }
      p.setValueCurveAtTime(Float32Array.from(states, get), at, len);
    }
  }

  disconnect() {
    for (const n of [this.hp, this.lp, this.low, this.mid, this.high, this.output]) n.disconnect();
  }
}

// ---------- finding where the music is ----------

/** Loudness (RMS) per 50 ms window, mono. */
function rmsWindows(buffer: AudioBuffer, from: number, to: number): { t: number; rms: number }[] {
  const sr = buffer.sampleRate;
  const win = Math.round(sr * 0.05);
  const chans = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i));
  const out: { t: number; rms: number }[] = [];
  const a = Math.max(0, Math.floor(from * sr));
  const b = Math.min(buffer.length, Math.floor(to * sr));
  for (let i = a; i + win <= b; i += win) {
    let sum = 0;
    for (const c of chans) for (let j = i; j < i + win; j += 4) sum += c[j] * c[j];
    out.push({ t: i / sr, rms: Math.sqrt(sum / ((win / 4) * chans.length)) });
  }
  return out;
}

/**
 * Where the song really ends and starts: skip a silent (or almost silent)
 * tail and intro, so a transition is music over music. Looks at the last /
 * first 30 seconds; "silent" = 36 dB under the song's loud parts there.
 */
export function musicEdges(buffer: AudioBuffer): { start: number; end: number } {
  const d = buffer.duration;
  const head = rmsWindows(buffer, 0, Math.min(d, 30));
  const tail = rmsWindows(buffer, Math.max(0, d - 30), d);
  const loud = (w: { rms: number }[]) => {
    const s = w.map((x) => x.rms).sort((p, q) => p - q);
    return s[Math.floor(s.length * 0.9)] ?? 0;
  };
  const th = (w: { rms: number }[]) => Math.max(1e-4, loud(w) * 0.016); // −36 dB
  const ht = th(head);
  const tt = th(tail);
  const first = head.find((w) => w.rms > ht);
  let last: { t: number } | undefined;
  for (let i = tail.length - 1; i >= 0; i--)
    if (tail[i].rms > tt) {
      last = tail[i];
      break;
    }
  const start = first ? Math.max(0, first.t - 0.05) : 0;
  const end = last ? Math.min(d, last.t + 0.1) : d;
  return end - start > 5 ? { start, end } : { start: 0, end: d };
}
