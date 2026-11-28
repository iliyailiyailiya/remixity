// One banner on the home screen. Never in the player. AdSense when its slot
// is set; otherwise, until then, one Adsterra banner (if its key is set).
//
// Set at build time (.env.production.local):
//   VITE_ADSENSE_CLIENT=ca-pub-…   your publisher ID. On its own it only adds
//                                  AdSense's code to the page (vite.config.ts)
//                                  so Google can review the site; no ad shows.
//   VITE_ADSENSE_SLOT=…            the ad unit's slot ID: the banner appears.
// In AdSense, keep "Auto ads" OFF so Google can't place ads anywhere else
// (like over the player). The EU/UK consent popup comes from AdSense's own
// "Privacy & messaging" tool through the same script.
//
// Adsterra (only while AdSense has no slot):
//   VITE_ADSTERRA_KEY=…            the key of ONE "Banner" ad unit (not
//                                  Popunder, Social Bar or Direct Link).
//   VITE_ADSTERRA_SIZE=320x50      the unit's size: 320x50, 468x60, 300x250 or 728x90.
// It runs in a sandboxed frame: it can open a tab when someone taps it, but
// it can't redirect this page, pop up by itself or read anything of ours.

const CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined) || '';
const SLOT = (import.meta.env.VITE_ADSENSE_SLOT as string | undefined) || '';

const ADSTERRA = (import.meta.env.VITE_ADSTERRA_KEY as string | undefined) || '';
const ADSTERRA_SIZE = (import.meta.env.VITE_ADSTERRA_SIZE as string | undefined) || '320x50';

export const adsEnabled = (CLIENT !== '' && SLOT !== '') || ADSTERRA !== '';

/** One Adsterra banner, boxed in a sandboxed frame. */
function adsterra(slot: HTMLElement) {
  const [w, h] = ADSTERRA_SIZE.split('x').map(Number);
  if (!/^[a-f0-9]{16,64}$/i.test(ADSTERRA) || !w || !h) return;
  const frame = document.createElement('iframe');
  frame.className = 'ad-frame';
  frame.title = 'Ad';
  frame.width = String(w);
  frame.height = String(h);
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer-when-downgrade';
  // No allow-same-origin and no allow-top-navigation: the ad stays in its box.
  frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
  frame.srcdoc =
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style></head><body>` +
    `<script>atOptions={key:'${ADSTERRA}',format:'iframe',height:${h},width:${w},params:{}};<\/script>` +
    `<script src="https://www.highperformanceformat.com/${ADSTERRA}/invoke.js"><\/script></body></html>`;
  frame.style.aspectRatio = `${w} / ${h}`;
  frame.style.maxWidth = `${w}px`;
  slot.append(frame);
  slot.hidden = false;
}

export function initAds() {
  if (!adsEnabled) return;
  const slot = document.getElementById('adSlot');
  if (!slot) return;
  if (!(CLIENT && SLOT)) return adsterra(slot);

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.dataset.adClient = CLIENT;
  ins.dataset.adSlot = SLOT;
  // Fixed size (set in CSS) so the page never jumps when the ad arrives.
  ins.style.display = 'block';
  slot.append(ins);
  slot.hidden = false;

  // (AdSense's script itself is in the page's <head>: see vite.config.ts.)
  const w = window as unknown as { adsbygoogle?: unknown[] };
  (w.adsbygoogle ??= []).push({});
}
