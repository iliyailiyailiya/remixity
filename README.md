# Remixity

A free slowed + reverb and nightcore maker that runs fully in the browser. No uploads, no account, no Pro tier.

Live: https://remixity.vercel.app. Deploy with `vercel deploy --prod` (settings are in `vercel.json`).

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

The button stays hidden until `VITE_SC_CLIENT_ID` is set. Audio goes straight from the
browser to SoundCloud; only the one-time login code passes through `api/sc-token.ts`,
because SoundCloud requires the client secret for the token exchange.

1. A SoundCloud **Artist Pro** account is required to register an API app.
2. Register the app at https://soundcloud.com/you/apps with the redirect URI
   `https://remixity.vercel.app/sc-callback.html`.
3. In Vercel → Project → Settings → Environment Variables (Production), add:
   - `VITE_SC_CLIENT_ID` = the client ID (public, turns the button on)
   - `SC_CLIENT_ID` = the same client ID
   - `SC_CLIENT_SECRET` = the client secret (server only)
   - `SC_REDIRECT_URI` = `https://remixity.vercel.app/sc-callback.html`
4. Redeploy (`vercel deploy --prod`). See `.env.example`; never commit real values.
