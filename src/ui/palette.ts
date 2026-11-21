// Cover-art colours for the living background, plus a generated cover for
// tracks that ship without artwork.

export type RGB = [number, number, number];

const DEFAULT: RGB[] = [
  [124, 58, 210],
  [40, 92, 225],
  [214, 62, 150],
  [64, 36, 140],
];

function hsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** Pick four representative, reasonably distinct colours from an image. */
export async function paletteFrom(img: HTMLImageElement): Promise<RGB[]> {
  try {
    if (!img.complete) await img.decode();
    const size = 32;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, size, size);
    const px = ctx.getImageData(0, 0, size, size).data;

    // Bucket at 4 bits/channel. Score strongly favours vivid, bright pixels
    // (the glowing parts of a cover), so dim in-between shades and the
    // dark background don't win just by being common.
    const buckets = new Map<number, { n: number; r: number; g: number; b: number; w: number }>();
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const { s, l } = hsl(r, g, b);
      if (l < 0.1 || l > 0.94) continue;
      const vivid = Math.max(r, g, b) / 255;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, w: 0 };
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
      e.w += (0.06 + s * s) * vivid * vivid;
      buckets.set(key, e);
    }
    const ranked = [...buckets.values()]
      .map((e) => ({ c: [e.r / e.n, e.g / e.n, e.b / e.n] as RGB, w: e.w }))
      .sort((a, b) => b.w - a.w);

    const picked: RGB[] = [];
    for (const { c: col } of ranked) {
      if (picked.every((p) => Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]) > 70)) picked.push(col);
      if (picked.length === 4) break;
    }
    while (picked.length < 4) picked.push(picked[picked.length - 1] ?? DEFAULT[picked.length]);
    return picked.map((p) => p.map(Math.round) as RGB);
  } catch {
    return DEFAULT;
  }
}

export const defaultPalette = () => DEFAULT.map((c) => [...c] as RGB);

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

/** A cover in the house style for tracks without artwork. */
export async function generatedCover(title: string): Promise<Blob> {
  const size = 800;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h = hash(title);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 9) % 80)) % 360;

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, `hsl(${hue1} 70% 34%)`);
  g.addColorStop(1, `hsl(${hue2} 75% 14%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Record grooves
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let r = 60; r < size * 0.75; r += 18) {
    ctx.beginPath();
    ctx.arc(size * 0.72, size * 0.3, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.letterSpacing = '10px';
  ctx.font = '300 30px system-ui, -apple-system, sans-serif';
  ctx.fillText('THE ', 56, 84);
  const theW = ctx.measureText('THE ').width;
  ctx.font = '800 30px system-ui, -apple-system, sans-serif';
  ctx.fillText('REMIXITY', 56 + theW, 84);

  ctx.fillStyle = '#fff';
  ctx.letterSpacing = '-2px';
  ctx.font = '800 84px system-ui, -apple-system, sans-serif';
  const words = title.toUpperCase().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > size - 112 && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  shown.forEach((l, i) => ctx.fillText(l, 56, size - 64 - (shown.length - 1 - i) * 88, size - 112));

  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
}
