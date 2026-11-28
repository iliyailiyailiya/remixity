// Product screenshots and story samples for the feature pages, made from the
// real app with fictional demo songs (generated covers, made-up names and
// lyrics: no real artwork or lyrics in marketing images).
//
//   1. npm run dev                (the app at http://localhost:5179)
//   2. a Chromium-based browser in headless mode with a debugging port, e.g.
//        "/Applications/Opera Air.app/Contents/MacOS/Opera" --headless=new \
//          --user-data-dir=<a scratch folder> --remote-debugging-port=9333
//   3. node scripts/shots.mjs     (writes public/img/*.webp, needs cwebp)

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const APP = 'http://localhost:5179/';
// The app's language for the screenshots: en (default), ru or ro, e.g.
//   UI_LANG=ru node scripts/shots.mjs   → public/img/*-ru.webp
const LANG = process.env.UI_LANG || 'en';
const SUF = LANG === 'en' ? '' : `-${LANG}`;
const BADGE = { en: 'Slowed ×0.85', ru: 'Замедлено ×0.85', ro: 'Încetinit ×0.85' }[LANG];
const DEBUG = 'http://127.0.0.1:9333';
const OUT = new URL('../public/img/', import.meta.url).pathname;
const TMP = join(OUT, '.tmp');
mkdirSync(TMP, { recursive: true });

// ---------- a tiny DevTools-protocol client ----------
const target = await (await fetch(`${DEBUG}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (code) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const phone = async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); // the phone layout, not the mouse one
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
};
const open = async (url = APP) => {
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (await run(`return document.readyState === 'complete' && !!window.__remixity`).catch(() => false)) break;
  }
  await sleep(600);
};
const webp = (png, name, width) => {
  const tmp = join(TMP, `${name}.png`);
  writeFileSync(tmp, png);
  const args = ['-quiet', '-q', '82', '-m', '6'];
  if (width) args.push('-resize', String(width), '0');
  name += SUF;
  execFileSync('cwebp', [...args, tmp, '-o', join(OUT, `${name}.webp`)]);
  // A half-size copy for normal screens (the pages pick it with srcset).
  const half = String(Math.round((width ?? 780) / 2));
  execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-resize', half, '0', tmp, '-o', join(OUT, `${name}-sm.webp`)]);
  console.log('  ✓', `${name}.webp`);
};
const shot = async (name) => {
  await sleep(700);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  webp(Buffer.from(data, 'base64'), name);
};
const dataUrlTo = (dataUrl, name, width) => webp(Buffer.from(dataUrl.split(',')[1], 'base64'), name, width);

await send('Page.enable');
await send('Runtime.enable');
await phone();

// ---------- the demo library (fictional) ----------
const SONGS = [
  ['Midnight Drive', 'Nova Lane'],
  ['Paper Moons', 'Juno Vale'],
  ['Glass Hearts', 'Nova Lane'],
  ['Slow Motion City', 'The Lowlights'],
  ['Neon Rain', 'Kairo'],
  ['Orbit', 'Juno Vale'],
  ['Velvet Hours', 'Mira Sol'],
];
// Original lines written for these screenshots.
const LYRICS = [
  'City lights are falling slow',
  'Like the records that we used to know',
  'Turn it down and let it ride',
  'Midnight drive, just you and I',
  'Every song a little longer',
  'Every word a little stronger',
  'Hold the moment, let it play',
  "Slow it down, don't fade away",
  'Ooh, let it play',
];

await open();
await run(`
  const db = await import('/src/library/db.ts');
  const { generatedCover } = await import('/src/ui/palette.ts');
  for (const t of await db.allTracks()) await db.deleteTrack(t.id);
  const audio = await (await fetch('/_test/zhivotnye.mp3')).blob();
  let i = 0;
  for (const [title, artist] of ${JSON.stringify(SONGS)}) {
    await db.addTrack({ id: 'demo' + i, title, artist, album: null, duration: 182, fileName: title + '.mp3', type: 'audio/mpeg',
      size: audio.size, addedAt: Date.now() - i * 1000, cover: await generatedCover(title) }, audio);
    i++;
  }
  localStorage.setItem('swiped', '1');
  localStorage.setItem('lang', '${LANG}');
  localStorage.setItem('artistPhotos', '{}');
  // Demo songs are fictional: no online lookups (they'd replace the demo lyrics).
  localStorage.setItem('findLyrics', 'off');
  localStorage.setItem('findCovers', 'off');
`);

// Load "Midnight Drive" into the player, slowed, paused at a good moment.
const loadDemo = async (seconds = 41) => {
  await open();
  await run(`
    const R = window.__remixity;
    const db = await import('/src/library/db.ts');
    const tr = await db.getTrack('demo0');
    const audio = await db.getAudio('demo0');
    await R.load(new File([audio], tr.fileName, { type: tr.type }), tr);
    document.querySelector('[data-preset="slowed"]').click();
    R.player.seek(${seconds});
    R.lyricsView.show({ synced: true, lines: ${JSON.stringify(LYRICS)}.map((text, i) => ({ t: 30 + i * 4, text })) }, '');
    R.render();
  `);
  await sleep(1500);
};

// Only some screenshots: ONLY=mix node scripts/shots.mjs
const ONLY = process.env.ONLY;

if (!ONLY || ONLY === 'mix') {
  console.log('mix…');
  await open();
  await run(`
    localStorage.setItem('mixOn', '1');
    localStorage.setItem('mixBefore', '1');
    localStorage.removeItem('mixPairs');
  `);
  await open(); // (Mix reads its switch when the page starts)
  await run(`
    window.__remixity.library.open();
    await new Promise((r) => setTimeout(r, 800));
    document.getElementById('libPlayAll').click();
    await new Promise((r) => setTimeout(r, 3000));
    document.getElementById('libBack').click();
    const R = window.__remixity;
    R.player.seek(Math.max(0, R.player.duration - 70));
    await new Promise((r) => setTimeout(r, 800));
    R.player.pause();
    R.render();
  `);
  await sleep(6000); // tempo, beat and key of both songs
  await run(`document.getElementById('openMix').click()`);
  await sleep(1500);
  await shot('app-mix-list');
  await run(`document.querySelector('.mix-link.live .mix-pill').click()`);
  await sleep(4000);
  await run(`[...document.querySelectorAll('#mixPresets button')].find((b) => b.textContent === 'Blend' || b.textContent === 'Blend')?.click()`);
  await sleep(800);
  await shot('app-mix-editor');
  await run(`document.getElementById('mixBack').click(); document.getElementById('sheetScrim').click(); window.__remixity.goPage(6)`);
  await sleep(3000);
  await shot('app-mix-card');
  await open();
  await run(`
    const audio = await (await fetch('/_test/zhivotnye.mp3')).blob();
    document.getElementById('mixTwoHome').click();
    await new Promise((r) => setTimeout(r, 400));
    for (const [id, name] of [['mixFile1', 'Midnight Drive.mp3'], ['mixFile2', 'Paper Moons.mp3']]) {
      const dt = new DataTransfer();
      dt.items.add(new File([audio], name, { type: 'audio/mpeg' }));
      const el = document.getElementById(id);
      el.files = dt.files;
      el.dispatchEvent(new Event('change'));
    }
  `);
  await shot('app-mix-two');
  await run(`localStorage.removeItem('mixPairs'); localStorage.setItem('mixOn', '0')`);
}

if (!ONLY) {
console.log('player…');
await loadDemo();
await shot('app-player');
for (const [i, name] of [[1, 'app-lyrics'], [2, 'app-pedal'], [3, 'app-space'], [4, 'app-eq'], [5, 'app-chop']]) {
  await run(`window.__remixity.goPage(${i})`);
  await sleep(900);
  await shot(name);
}
await run(`window.__remixity.goPage(1)`);
await sleep(600);
await run(`document.getElementById('lyricsBox').click()`);
await shot('app-lyrics-full');

console.log('export + story sheets…');
await loadDemo();
await run(`document.getElementById('openExport').click()`);
await shot('app-export');
await run(`document.getElementById('openStory').click()`);
await sleep(1200);
await run(`document.querySelector('input[name="storyStyle"][value="lyrics"]').click()`);
await sleep(800);
await shot('app-story-sheet');

console.log('library…');
await open();
await run(`window.__remixity.library.open()`);
await shot('app-library');
await run(`[...document.querySelectorAll('#libTabs button, #libTabs [role=tab]')].find((b) => /artists/i.test(b.textContent))?.click()`);
await shot('app-artists');

console.log('story samples…');
await loadDemo(44);
const stories = await run(`
  const { StoryPainter } = await import('/src/ui/story.ts');
  const cover = document.getElementById('cover');
  if (!cover.complete) await cover.decode();
  const lines = ${JSON.stringify(LYRICS)}.map((text, i) => ({ t: 30 + i * 4, text }));
  const base = { title: 'Midnight Drive', artist: 'Nova Lane', cover, badge: '${BADGE}', ratio: 0.85,
    lyrics: { lines, at: () => 43 } };
  const out = {};
  for (const [name, extra] of [
    ['card', { style: 'card', bg: 'blur' }],
    ['lyrics', { style: 'lyrics', bg: 'blur' }],
    ['vinyl', { style: 'vinyl', bg: 'color', colors: [[124, 58, 210], [214, 62, 150], [40, 92, 225]] }],
    ['full', { style: 'full', subtitles: true }],
    ['waves', { style: 'waves', bg: 'dark', subtitles: true }],
  ]) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    new StoryPainter(c.getContext('2d'), { ...base, ...extra }).draw(1.3, extra.style === 'card' ? null : 0.45);
    out[name] = c.toDataURL('image/png');
  }
  // Link preview (1200×630): the brand next to two stories.
  const og = document.createElement('canvas'); og.width = 1200; og.height = 630;
  const g = og.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1200, 630);
  bg.addColorStop(0, '#2a1450'); bg.addColorStop(0.6, '#120c1f'); bg.addColorStop(1, '#3a1030');
  g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
  const img = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [a, b] = await Promise.all([img(out.vinyl), img(out.lyrics)]);
  const sh = 540, sw = sh * 9 / 16;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 40;
  for (const [im, x, y] of [[b, 1200 - sw - 40, 45], [a, 1200 - sw * 2 - 70, 70]]) {
    g.save(); g.beginPath(); g.roundRect(x, y, sw, sh, 22); g.clip(); g.drawImage(im, x, y, sw, sh); g.restore();
  }
  g.restore();
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.font = '300 26px system-ui, -apple-system, sans-serif'; g.letterSpacing = '14px'; g.fillText('THE', 70, 210);
  g.font = '900 92px system-ui, -apple-system, sans-serif'; g.letterSpacing = '-4px'; g.fillText('REMIXITY', 62, 300);
  g.letterSpacing = '0px';
  g.font = '650 30px system-ui, -apple-system, sans-serif';
  ['Slowed + reverb, music player', '& story maker. Free, in your', 'browser.'].forEach((l, i) => g.fillText(l, 70, 380 + i * 42));
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '600 26px system-ui, -apple-system, sans-serif'; g.fillText('remixity.app', 70, 560);
  out.og = og.toDataURL('image/png');
  return out;
`);
for (const [name, url] of Object.entries(stories)) {
  if (name === 'og') {
    if (LANG !== 'en') continue; // one link preview, in English
    const png = join(TMP, 'og.png');
    writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
    // Link previews: JPEG keeps it small (Facebook, X, Telegram all take it).
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '86', png, '--out', join(OUT, 'og.jpg')], { stdio: 'ignore' });
    console.log('  ✓ og.jpg');
  } else dataUrlTo(url, `story-${name}`, 540);
}

}

rmSync(TMP, { recursive: true, force: true });
await fetch(`${DEBUG}/json/close/${target.id}`).catch(() => {});
ws.close();
console.log('done');
