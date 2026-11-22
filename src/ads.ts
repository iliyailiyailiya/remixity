// One AdSense banner on the home screen. Never in the player.
//
// Off until both IDs are set at build time (.env.production.local):
//   VITE_ADSENSE_CLIENT=ca-pub-…   your publisher ID
//   VITE_ADSENSE_SLOT=…            the ad unit's slot ID
// In AdSense, keep "Auto ads" OFF so Google can't place ads anywhere else
// (like over the player). The EU/UK consent popup comes from AdSense's own
// "Privacy & messaging" tool through the same script.

const CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined) || '';
const SLOT = (import.meta.env.VITE_ADSENSE_SLOT as string | undefined) || '';

export const adsEnabled = CLIENT !== '' && SLOT !== '';

export function initAds() {
  if (!adsEnabled) return;
  const slot = document.getElementById('adSlot');
  if (!slot) return;

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.dataset.adClient = CLIENT;
  ins.dataset.adSlot = SLOT;
  // Fixed size (set in CSS) so the page never jumps when the ad arrives.
  ins.style.display = 'block';
  slot.append(ins);
  slot.hidden = false;

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
  document.head.append(script);

  const w = window as unknown as { adsbygoogle?: unknown[] };
  (w.adsbygoogle ??= []).push({});
}
