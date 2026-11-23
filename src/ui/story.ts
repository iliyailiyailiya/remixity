// Stories for Instagram (or anywhere): a 1080×1920 card with the cover,
// title, artist and the remix's speed, over the cover blurred.
//
// Image: drawn once, saved as PNG.
// Video: the same card animated, recorded in real time with a clip of the
// remix (rendered with all its effects, at its speed). Everything happens on
// the device.

export const W = 1080;
export const H = 1920;

export interface StoryInfo {
  title: string;
  artist: string;
  cover: HTMLImageElement;
  /** "Slowed ×0.85", "Sped up ×1.25", or '' for the original. */
  badge: string;
  /** 'lyrics': the sung lines, following along, instead of the big cover card. */
  style?: 'card' | 'lyrics';
  lyrics?: {
    lines: { t: number; text: string }[];
    /** Seconds into the story → seconds into the original song. */
    at: (storySeconds: number) => number;
  };
}

const PAD = 90;
const LYRIC_W = W - PAD * 2;
const LYRICS_TOP = 470;
const LYRICS_BOTTOM = 1490;
const FOCUS = 760; // where the line being sung sits
const FONT = 'system-ui, -apple-system, "Helvetica Neue", "Segoe UI", sans-serif';

/** Blur an image's pixels in place (three box-blur passes ≈ a gaussian). */
function boxBlur(d: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Float32Array(d.length);
  const pass = (src: ArrayLike<number>, dst: Float32Array | Uint8ClampedArray, horiz: boolean) => {
    const len = horiz ? w : h;
    const lines = horiz ? h : w;
    for (let line = 0; line < lines; line++) {
      for (let ch = 0; ch < 4; ch++) {
        const at = (i: number) => {
          const k = Math.min(len - 1, Math.max(0, i));
          return ((horiz ? line * w + k : k * w + line) << 2) + ch;
        };
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += src[at(i)];
        for (let i = 0; i < len; i++) {
          dst[at(i)] = sum / (2 * r + 1);
          sum += src[at(i + r + 1)] - src[at(i - r)];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) {
    pass(d, tmp, true);
    pass(tmp, d, false);
  }
}

/** The cover cropped to the story's shape and heavily blurred (small; scaled up when drawn). */
function blurred(img: HTMLImageElement): HTMLCanvasElement {
  const w = 108;
  const h = 192;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const c = out.getContext('2d', { willReadFrequently: true })!;
  let sw = img.naturalWidth || 1;
  let sh = img.naturalHeight || 1;
  let sx = 0;
  let sy = 0;
  if (sw / sh > w / h) {
    sx = (sw - (sh * w) / h) / 2;
    sw = (sh * w) / h;
  } else {
    sy = (sh - (sw * h) / w) / 2;
    sh = (sw * h) / w;
  }
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  try {
    const px = c.getImageData(0, 0, w, h);
    boxBlur(px.data, w, h, 7);
    c.putImageData(px, 0, 0);
  } catch {
    /* pixels unreadable here: the plain downscale still looks soft */
  }
  return out;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Up to `max` lines that fit `width`; the last one ends in … if cut. */
function wrap(c: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (c.measureText(next).width <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === max) {
      line = '';
      lines[max - 1] += ` ${words.slice(i).join(' ')}`;
      break;
    }
  }
  if (line) lines.push(line);
  // Shorten anything still too wide (a single long word, or the cut-off last line).
  return lines.slice(0, max).map((l) => {
    if (c.measureText(l).width <= width) return l;
    while (l.length > 1 && c.measureText(`${l}…`).width > width) l = l.slice(0, -1);
    return `${l.trimEnd()}…`;
  });
}

/** Letter-spaced text (canvas letterSpacing isn't everywhere yet). */
function spaced(c: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number): number {
  for (const ch of text) {
    c.fillText(ch, x, y);
    x += c.measureText(ch).width + gap;
  }
  return x;
}

export class StoryPainter {
  private bg: HTMLCanvasElement;

  constructor(
    private c: CanvasRenderingContext2D,
    private info: StoryInfo,
  ) {
    this.bg = blurred(info.cover);
  }

  /** Draw a frame. `t` = seconds (drift), `progress` 0–1 for a video, or null for the still. */
  draw(t: number, progress: number | null) {
    if (this.info.style === 'lyrics' && this.info.lyrics) this.drawLyrics(t, progress);
    else this.drawCard(t, progress);
  }

  /** The blurred, slowly drifting cover behind everything. */
  private background(t: number, shade: number) {
    const { c } = this;
    c.fillStyle = '#120c1f';
    c.fillRect(0, 0, W, H);
    const zoom = 1.15 + 0.05 * Math.sin(t * 0.6);
    const bw = W * zoom;
    const bh = H * zoom;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.bg, (W - bw) / 2 + 20 * Math.sin(t * 0.35), (H - bh) / 2 + 30 * Math.cos(t * 0.27), bw, bh);
    c.fillStyle = `rgba(0,0,0,${shade})`;
    c.fillRect(0, 0, W, H);
  }

  // ---- lyrics style ----
  private wrapped = new Map<number, string[]>();
  private scroll: number | null = null;
  private lastT = 0;

  private linesOf(i: number): string[] {
    let w = this.wrapped.get(i);
    if (!w) {
      const text = this.info.lyrics!.lines[i]?.text.trim() || '♪';
      this.c.font = `800 74px ${FONT}`;
      w = wrap(this.c, text, LYRIC_W, 3);
      this.wrapped.set(i, w);
    }
    return w;
  }

  private drawLyrics(t: number, progress: number | null) {
    const { c, info } = this;
    const ly = info.lyrics!;
    c.save();
    this.background(t, 0.42);

    // Header: small cover, title, artist (below Instagram's own top bar).
    const top = 250;
    const size = 132;
    c.save();
    roundRect(c, PAD, top, size, size, 20);
    c.clip();
    const iw = info.cover.naturalWidth || 1;
    const ih = info.cover.naturalHeight || 1;
    const s = Math.max(size / iw, size / ih);
    c.drawImage(info.cover, PAD + (size - iw * s) / 2, top + (size - ih * s) / 2, iw * s, ih * s);
    c.restore();
    const tx = PAD + size + 30;
    const tw = W - tx - PAD;
    c.textBaseline = 'top';
    c.fillStyle = '#fff';
    c.font = `800 50px ${FONT}`;
    c.fillText(wrap(c, info.title, tw, 1)[0] ?? '', tx, top + 14);
    if (info.artist) {
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.font = `500 40px ${FONT}`;
      c.fillText(wrap(c, info.artist, tw, 1)[0] ?? '', tx, top + 78);
    }

    // Which line is being sung.
    const orig = ly.at(t);
    let cur = -1;
    let lo = 0;
    let hi = ly.lines.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ly.lines[mid].t <= orig + 0.15) {
        cur = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }

    // Lay the lines out from the current one; scroll smoothly between them.
    const LINE = 88;
    const GAP = 34;
    const blockH = (i: number) => this.linesOf(i).length * LINE + GAP;
    const anchor = Math.max(0, cur);
    // y of each line's top, relative to the anchor line's top
    const from = Math.max(0, anchor - 4);
    const to = Math.min(ly.lines.length - 1, anchor + 8);
    const rel = new Map<number, number>();
    let y = 0;
    for (let i = anchor; i <= to; i++) {
      rel.set(i, y);
      y += blockH(i);
    }
    y = 0;
    for (let i = anchor - 1; i >= from; i--) {
      y -= blockH(i);
      rel.set(i, y);
    }
    // The current line sits at FOCUS. When the next line starts, keep every
    // line where it was on screen, then glide up to the new one.
    const target = cur < 0 ? FOCUS + 120 : FOCUS;
    const dt = Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
    if (this.scroll === null || progress === null) this.scroll = target;
    else if (this.prevAnchor !== null && this.prevAnchor !== anchor && rel.has(this.prevAnchor))
      this.scroll -= rel.get(this.prevAnchor)!;
    this.prevAnchor = anchor;
    this.scroll += (target - this.scroll) * (1 - Math.exp(-dt * 9));

    c.save();
    c.beginPath();
    c.rect(0, LYRICS_TOP, W, LYRICS_BOTTOM - LYRICS_TOP);
    c.clip();
    c.font = `800 74px ${FONT}`;
    for (let i = from; i <= to; i++) {
      const top0 = this.scroll + (rel.get(i) ?? 0);
      const lines = this.linesOf(i);
      if (top0 > LYRICS_BOTTOM || top0 + lines.length * LINE < LYRICS_TOP) continue;
      const now = i === cur;
      c.fillStyle = now ? '#fff' : i < cur ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.45)';
      lines.forEach((l, k) => {
        // Fade lines out softly toward the top and bottom edges.
        const ly0 = top0 + k * LINE;
        const edge = Math.min((ly0 - LYRICS_TOP) / 170, (LYRICS_BOTTOM - (ly0 + LINE)) / 220);
        c.globalAlpha = Math.max(0, Math.min(1, edge));
        c.fillText(l, PAD, ly0);
      });
      c.globalAlpha = 1;
    }
    c.restore();

    // Footer: progress, THE REMIXITY, the speed badge.
    let fy = 1540;
    if (progress !== null) {
      c.fillStyle = 'rgba(255,255,255,0.25)';
      roundRect(c, PAD, fy, W - PAD * 2, 8, 4);
      c.fill();
      c.fillStyle = '#fff';
      roundRect(c, PAD, fy, Math.max(8, (W - PAD * 2) * Math.min(1, progress)), 8, 4);
      c.fill();
    }
    fy += 64;
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.font = `300 30px ${FONT}`;
    const x = spaced(c, 'THE', PAD, fy, 9);
    c.font = `800 30px ${FONT}`;
    spaced(c, 'REMIXITY', x + 14, fy, 9);
    if (info.badge) {
      c.font = `700 30px ${FONT}`;
      const bw = c.measureText(info.badge).width + 40;
      const bx = W - PAD - bw;
      c.fillStyle = '#fff';
      roundRect(c, bx, fy - 26, bw, 52, 26);
      c.fill();
      c.fillStyle = '#111';
      c.fillText(info.badge, bx + 20, fy + 1);
    }
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = `600 30px ${FONT}`;
    c.fillText('remixity.app', W / 2, fy + 70);
    c.restore();
  }
  private prevAnchor: number | null = null;

  private drawCard(t: number, progress: number | null) {
    const { c, info } = this;
    c.save();
    this.background(t, 0.22);

    // The card.
    const cw = 760;
    const pad = 44;
    const art = cw - pad * 2;
    c.font = `800 62px ${FONT}`;
    const titleLines = wrap(c, info.title, art, 2);
    c.font = `500 52px ${FONT}`;
    const artistLines = info.artist ? wrap(c, info.artist, art, 2) : [];
    const textH = titleLines.length * 72 + artistLines.length * 64;
    const ch = pad + art + 34 + textH + 26 + 52 + (progress !== null ? 40 : 0) + pad;
    const cx = (W - cw) / 2;
    const cy = Math.round((H - ch) / 2 - 40);

    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 60;
    c.shadowOffsetY = 20;
    c.fillStyle = '#fff';
    roundRect(c, cx, cy, cw, ch, 46);
    c.fill();
    c.shadowColor = 'transparent';

    // Cover
    c.save();
    roundRect(c, cx + pad, cy + pad, art, art, 22);
    c.clip();
    const iw = info.cover.naturalWidth || 1;
    const ih = info.cover.naturalHeight || 1;
    const s = Math.max(art / iw, art / ih);
    c.drawImage(info.cover, cx + pad + (art - iw * s) / 2, cy + pad + (art - ih * s) / 2, iw * s, ih * s);
    c.restore();

    // Title + artist
    let y = cy + pad + art + 34;
    c.textBaseline = 'top';
    c.fillStyle = '#111';
    c.font = `800 62px ${FONT}`;
    for (const l of titleLines) {
      c.fillText(l, cx + pad, y);
      y += 72;
    }
    c.fillStyle = '#222';
    c.font = `500 52px ${FONT}`;
    for (const l of artistLines) {
      c.fillText(l, cx + pad, y);
      y += 64;
    }

    // Progress bar (video)
    y += 26;
    if (progress !== null) {
      c.fillStyle = 'rgba(0,0,0,0.12)';
      roundRect(c, cx + pad, y, art, 10, 5);
      c.fill();
      c.fillStyle = '#111';
      roundRect(c, cx + pad, y, Math.max(10, art * Math.min(1, progress)), 10, 5);
      c.fill();
      y += 40;
    }

    // THE REMIXITY + the speed badge
    c.textBaseline = 'middle';
    const my = y + 26;
    c.fillStyle = '#6b6b6b';
    c.font = `300 30px ${FONT}`;
    let x = spaced(c, 'THE', cx + pad, my, 9);
    c.font = `800 30px ${FONT}`;
    spaced(c, 'REMIXITY', x + 14, my, 9);
    if (info.badge) {
      c.font = `700 30px ${FONT}`;
      const bw2 = c.measureText(info.badge).width + 40;
      x = cx + cw - pad - bw2;
      c.fillStyle = '#111';
      roundRect(c, x, my - 26, bw2, 52, 26);
      c.fill();
      c.fillStyle = '#fff';
      c.fillText(info.badge, x + 20, my + 1);
    }

    // A small line under the card (Instagram's own buttons cover the very bottom).
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = `600 34px ${FONT}`;
    c.fillText('made with THE REMIXITY · remixity.app', W / 2, cy + ch + 80);
    c.restore();
  }
}

/** The still story as a PNG. */
export function storyImage(canvas: HTMLCanvasElement, info: StoryInfo): Promise<Blob> {
  canvas.width = W;
  canvas.height = H;
  new StoryPainter(canvas.getContext('2d')!, info).draw(0, null);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not draw the image'))), 'image/png'),
  );
}

const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export const canRecordVideo = () =>
  typeof MediaRecorder !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
  VIDEO_TYPES.some((t) => MediaRecorder.isTypeSupported(t));

/**
 * Record the story as a video with `clip` as its sound. Runs in real time
 * (a 15-second story takes 15 seconds); you hear the clip while it records.
 */
export async function storyVideo(
  canvas: HTMLCanvasElement,
  info: StoryInfo,
  clip: AudioBuffer,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  canvas.width = W;
  canvas.height = H;
  const painter = new StoryPainter(canvas.getContext('2d')!, info);
  painter.draw(0, 0);

  const mimeType = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t))!;
  const ac = new AudioContext();
  try {
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource();
    src.buffer = clip;
    src.connect(dest);
    src.connect(ac.destination); // hear it while it records
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

    rec.start(500);
    const t0 = ac.currentTime + 0.05;
    src.start(t0);
    let raf = 0;
    await new Promise<void>((resolve, reject) => {
      const frame = () => {
        const t = Math.max(0, ac.currentTime - t0);
        const p = Math.min(1, t / clip.duration);
        painter.draw(t, p);
        onProgress(p);
        if (p >= 1) return resolve();
        raf = requestAnimationFrame(frame);
      };
      signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
      raf = requestAnimationFrame(frame);
    }).finally(() => {
      cancelAnimationFrame(raf);
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    });
    await new Promise((r) => setTimeout(r, 250)); // let the last frames in
    rec.stop();
    stream.getTracks().forEach((tr) => tr.stop());
    await stopped;
    return new Blob(chunks, { type: mimeType.split(';')[0] });
  } finally {
    void ac.close();
  }
}
