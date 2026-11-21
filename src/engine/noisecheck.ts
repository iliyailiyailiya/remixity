// Some browsers deliberately add random noise to audio that a page reads
// back from the Web Audio engine, as an anti-fingerprinting measure (Safari
// Private tabs, or Safari with "Advanced Tracking and Fingerprinting
// Protection" on for all browsing). Exports go through that readback, so
// they come out noisy there.
//
// Rather than guess from the browser name, render a tiny known signal and
// check that it comes back exactly. A constant 0.25 is exact in float32, so
// any difference at all means the browser is altering the audio.

let cached: Promise<boolean> | null = null;

export function readbackIsNoisy(): Promise<boolean> {
  cached ??= (async () => {
    try {
      const ctx = new OfflineAudioContext(1, 4096, 44100);
      const src = ctx.createConstantSource();
      src.offset.value = 0.25;
      src.connect(ctx.destination);
      src.start();
      const data = (await ctx.startRendering()).getChannelData(0);
      for (let i = 0; i < data.length; i++) if (Math.abs(data[i] - 0.25) > 1e-6) return true;
      return false;
    } catch {
      return false; // can't tell; don't warn
    }
  })();
  return cached;
}
