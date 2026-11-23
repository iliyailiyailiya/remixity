# Remixity

A free slowed + reverb and nightcore maker that runs fully in the browser. No uploads, no account, no Pro tier.

Live: https://remixity.app (Cloudflare Pages). Deploy with `npm run deploy`, which builds and uploads `dist/` plus the `functions/` folder. Response headers are in `public/_headers`.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/, host anywhere
```

## How the audio works

- **Original sample rate kept.** `decodeAudioData` resamples to its context's rate, so `src/engine/decode.ts` reads the rate from the file header (WAV, AIFF, FLAC, MP3, OGG, M4A) and decodes at that rate.
- **Same chain for preview and export.** `src/engine/chain.ts`: −3 dB headroom → 24 dB/oct high-pass at 25 Hz → bass shelf → dry + convolution reverb → volume → limiter.
- **Export repitch is band-limited.** Live preview uses the browser's `playbackRate`. Export instead runs a Kaiser-windowed sinc resampler in a Web Worker (`src/engine/dsp.worker.ts`), so there's no aliasing.
- **Float all the way.** Rendering uses `OfflineAudioContext`, then a peak guard holds the ceiling at −1 dBFS.
- **Dither only for 16-bit.** WAV 16 and MP3 get TPDF dither. WAV 24 doesn't.
- **Reverb IRs are generated, not shipped.** They're seeded so preview and export sound the same at any sample rate.
- **Export formats:** MP3 320 kbps (via `@breezystack/lamejs`, in the worker), WAV 16-bit and WAV 24-bit.

## Roadmap

1. ~~MVP: load, waveform, tempo/BPM/tap, reverb, bass, volume, presets, MP3/WAV export, EN/RO/RU~~
2. ~~EQ, delay, filters, saturation (WaveShaper with `oversample: '4x'`), saved presets~~
3. ~~Trim, loop, markers, cuts, join~~ (non-destructive edit list in `src/engine/edit.ts`, 3 ms fades at joins, 50-step undo)
4. Privacy/terms pages, per-language SEO pages, Plausible/Umami, ads + donate

## Share to SoundCloud (setup)

The button stays hidden until `VITE_SC_CLIENT_ID` is set at build time. Audio goes straight
from the browser to SoundCloud; only the one-time login code passes through
`functions/api/sc-token.ts`, because SoundCloud requires the client secret for the token exchange.

1. A SoundCloud **Artist Pro** account is required to register an API app.
2. Register the app at https://soundcloud.com/you/apps with the redirect URI
   `https://remixity.app/sc-callback`.
3. In Cloudflare → Workers & Pages → remixity → Settings → Variables and secrets (Production), add:
   - `SC_CLIENT_ID` = the client ID
   - `SC_CLIENT_SECRET` = the client secret (as a secret)
   - `SC_REDIRECT_URI` = `https://remixity.app/sc-callback`
4. Because the site is built on your machine, put the public client ID in a local,
   gitignored file `.env.production.local`: `VITE_SC_CLIENT_ID=<client id>`.
5. `npm run deploy`. See `.env.example`; never commit real values.

## Ads (AdSense, home screen only)

One banner below "Choose a song" on the home screen; never in the player. It is off until
both IDs are set, and the build then also emits `ads.txt`.

1. Get approved on AdSense with the site's own domain.
2. In AdSense: keep **Auto ads off** (they could place ads over the player), create one
   display ad unit, and publish the EU/UK consent message under Privacy & messaging.
3. Add to `.env.production.local` (gitignored):
   `VITE_ADSENSE_CLIENT=ca-pub-…` and `VITE_ADSENSE_SLOT=…`
4. Regenerate the legal pages with the ad wording: `python3 scripts/build-legal.py --ads`
5. `npm run deploy`
