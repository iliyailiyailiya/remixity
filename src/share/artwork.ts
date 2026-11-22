// Artwork for a SoundCloud upload: the track's cover, square, optionally
// with a small "THE REMIXITY" mark in the corner.

const SIZE = 1000; // SoundCloud shows artwork up to 500px; 1000 stays sharp

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('artwork'));
    img.src = src;
  });
}

/** The cover as a JPEG, with or without the watermark. */
export async function makeArtwork(coverSrc: string, watermark: boolean): Promise<Blob | null> {
  if (!coverSrc) return null;
  try {
    const img = await loadImage(coverSrc);
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d')!;
    // Centre-crop to a square, like the player shows it.
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIZE, SIZE);

    if (watermark) {
      const pad = SIZE * 0.035;
      const fontPx = SIZE * 0.026;
      ctx.font = `300 ${fontPx}px system-ui, -apple-system, sans-serif`;
      const the = 'THE ';
      const theW = ctx.measureText(the).width;
      ctx.font = `800 ${fontPx}px system-ui, -apple-system, sans-serif`;
      const name = 'REMIXITY';
      const nameW = ctx.measureText(name).width;
      const w = theW + nameW + fontPx * 1.4;
      const h = fontPx * 2;
      const x = SIZE - pad - w;
      const y = SIZE - pad - h;
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.textBaseline = 'middle';
      ctx.font = `300 ${fontPx}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(the, x + fontPx * 0.7, y + h / 2);
      ctx.font = `800 ${fontPx}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(name, x + fontPx * 0.7 + theW, y + h / 2);
    }
    return await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
  } catch {
    return null; // post without artwork rather than fail
  }
}
