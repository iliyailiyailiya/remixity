// Non-destructive editing. The original buffer is never touched: an edit is
// just a list of source ranges ("segments") plus markers, which makes undo
// cheap. The playable buffer is assembled from the segments after each edit.

export interface Segment {
  start: number; // source seconds
  end: number;
}

export interface EditState {
  segments: Segment[];
  markers: number[]; // edited-timeline seconds, sorted
}

const MIN_SEG = 0.001;

export const initialEdit = (duration: number): EditState => ({
  segments: [{ start: 0, end: duration }],
  markers: [],
});

export const editedDuration = (s: EditState) =>
  s.segments.reduce((sum, g) => sum + (g.end - g.start), 0);

/** Remove [a, b) of the edited timeline; the pieces either side are joined. */
function removeSegments(segments: Segment[], a: number, b: number): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  for (const s of segments) {
    const len = s.end - s.start;
    const e0 = t;
    const e1 = t + len;
    if (b <= e0 || a >= e1) out.push(s);
    else {
      if (a > e0) out.push({ start: s.start, end: s.start + (a - e0) });
      if (b < e1) out.push({ start: s.start + (b - e0), end: s.end });
    }
    t = e1;
  }
  return out.filter((s) => s.end - s.start >= MIN_SEG);
}

export function cut(state: EditState, a: number, b: number): EditState {
  const len = b - a;
  return {
    segments: removeSegments(state.segments, a, b),
    markers: state.markers.filter((m) => m < a || m >= b).map((m) => (m >= b ? m - len : m)),
  };
}

export function keepOnly(state: EditState, a: number, b: number): EditState {
  const segments = removeSegments(removeSegments(state.segments, b, Infinity), 0, a);
  return {
    segments,
    markers: state.markers.filter((m) => m >= a && m <= b).map((m) => m - a),
  };
}

export function addMarker(state: EditState, at: number): EditState {
  if (state.markers.some((m) => Math.abs(m - at) < 0.05)) return state;
  return { ...state, markers: [...state.markers, at].sort((x, y) => x - y) };
}

export function removeMarker(state: EditState, index: number): EditState {
  return { ...state, markers: state.markers.filter((_, i) => i !== index) };
}

/**
 * Build the playable buffer. Where two pieces that were not next to each
 * other in the source get joined, both sides get a 3 ms fade so the join
 * doesn't click. Fades don't overlap, so the timeline stays sample-exact and
 * markers stay where they were put.
 */
export function assemble(original: AudioBuffer, segments: Segment[]): AudioBuffer {
  const sr = original.sampleRate;
  const dur = original.duration;
  if (segments.length === 1 && segments[0].start <= 0 && segments[0].end >= dur - 1e-6) return original;

  const ranges = segments.map((s) => [
    Math.max(0, Math.round(s.start * sr)),
    Math.min(original.length, Math.round(s.end * sr)),
  ]);
  const length = Math.max(1, ranges.reduce((n, [a, b]) => n + (b - a), 0));
  const out = new AudioBuffer({ length, numberOfChannels: original.numberOfChannels, sampleRate: sr });
  const fade = Math.round(0.003 * sr);

  for (let c = 0; c < original.numberOfChannels; c++) {
    const src = original.getChannelData(c);
    const dst = out.getChannelData(c);
    let pos = 0;
    ranges.forEach(([a, b], i) => {
      dst.set(src.subarray(a, b), pos);
      const n = b - a;
      const f = Math.min(fade, Math.floor(n / 2));
      const fadeIn = a > 0 && (i === 0 || ranges[i - 1][1] !== a);
      const fadeOut = b < original.length && (i === ranges.length - 1 || ranges[i + 1][0] !== b);
      for (let k = 0; k < f; k++) {
        const g = Math.sin(((k + 0.5) / f) * (Math.PI / 2));
        if (fadeIn) dst[pos + k] *= g;
        if (fadeOut) dst[pos + n - 1 - k] *= g;
      }
      pos += n;
    });
  }
  return out;
}
