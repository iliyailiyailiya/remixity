# Timeline & automation: plan

Goal: an Ableton-style arrangement view inside THE REMIXITY. Move the track or
sections of it on a timeline, and draw automation for the pedal (speed),
reverb, echo and EQ. Later: mix two tracks (crossfade), as in Spotify.

## Principles

- **Nothing new under the hood unless needed.** The timeline sits on top of the
  existing non-destructive edit (`src/engine/edit.ts`). Sections are the same
  `segments` the Chop page cuts, so moving a section works with undo, export and
  stories without any extra code.
- **What you hear is what you export.** Every automation step lands in the live
  player first, then in `render.ts` (offline) with the same maths.
- **Phone first, sideways.** On a touch phone the timeline only works in
  landscape. In portrait a "Turn your phone" card covers it (CSS only:
  `(orientation: portrait) and (pointer: coarse)`), so it never needs JS.
- **At most 5 automation lanes**, one parameter per lane (Ableton's model).

## Data model (`src/automation/model.ts`)

| Thing | Shape | Notes |
|---|---|---|
| Timeline time | seconds of the *edited* buffer (= `player.position`) | Before speed change. The ruler shows heard time (÷ speed). |
| Section | `edit.segments[i]` (`{start, end}` in source seconds) | Order = order on the timeline. |
| Lane | `{ id, param, points: {t, v}[] }` | `t` timeline seconds, `v` the parameter's own value (dB, 0..1, Hz…). Sorted by `t`. |
| Automation | `{ lanes: Lane[] }` (≤ 5) | Lives next to `edit`, per song. |

Between points the value is linear (log for Hz parameters); before the first
point and after the last it holds.

Parameters that can be automated: speed (`ratio`), reverb mix / size / tone,
echo mix / time / feedback, bass, EQ low / mid / high / air, low cut, high cut.

## Phases

### Phase 1: scaffold (this commit)
- Model: lanes, points, `valueAt`, `paramsAt`, split + move for sections.
- Timeline overlay (`src/automation/timeline.ts`): ruler, the track's
  waveform split into sections, up to 5 lanes, playhead, tap-to-seek.
  - Sections: **Split** at the playhead, drag a section left/right to
    reorder it (commits through `commit()`, so Undo works).
  - Lanes: tap to add a point, drag to move it, double-tap to delete it.
- Grid from the song's BPM (1 bar, 1/2, 1/4, 1/8, 1/16 and triplets 1/4T, 1/8T,
  1/16T, or off). Split and automation points snap to it; bars are drawn
  brighter. The grid starts at 0 s (first downbeat detection is phase 3), and
  lines closer than 4 px are hidden until zoom exists.
- "Turn your phone" card in portrait on touch phones.
- Live playback of the mix-type lanes (reverb/echo mix, echo feedback, EQ,
  bass, cuts); phase 2 added the rest.
- Behind a flag for now: open the app with `?lab=1` once (remembered) to see
  the timeline button.

### Phase 2: the hard parameters (done)
- **Speed automation, live.** Every 40 ms (a timer, so it keeps running in a
  background tab) the lanes are applied with `player.setParams(q, fromLanes)`:
  the playback rate ramps over 40 ms instead of stepping, and the clock is
  rebased each time, so the position stays right. Measured: within 10 ms of
  the exact integral after 10 s of a 0.8→1.2 ramp. Keep pitch: the stretcher
  gets the new rate the same way. The pedal, BPM and glow follow the speed.
- **Reverb size / tone.** The chain has two convolvers; a new impulse fades in
  over 120 ms while the old one fades out (`chain.setImpulse(ir, at)`), so
  changing the room never clicks (sliders too). Live, the idle convolver gets
  no input. Automated values are rounded (`roomStep`: 4% of size, 0.05 of
  tone) and rebuilt at most ~6× a second. "Follows the pedal" makes the room
  follow an automated speed too; reverb lanes still win.
- **Export and story clips.** `RenderAuto` (settings by input second) goes to
  `processChannels`:
  - Speed: `makeWarp` (`src/engine/warp.ts`) maps output blocks of 256
    samples to input positions; the worker's `warp` resampler uses a kernel
    per speed bucket, so speeding up never aliases. Click-track test: every
    click lands at the predicted time (0 ms error).
  - Keep pitch: the stretcher keeps only one pending change (each
    `schedule()` replaces the later ones), so the offline render suspends
    every ~100 ms, hands over that change with the pinned input position, and
    resumes. Click-track test: within ±2 ms.
  - Every other setting is written as ramps every 25 ms of output time;
    room changes suspend the render and crossfade a new impulse.
- **Saved per song** (`src/automation/store.ts`, its own IndexedDB
  `remixity-timelines`): sections, markers and lanes, keyed by the library
  song's id (or file name + size), saved 400 ms after each change and on
  page hide, restored once the whole song is decoded. Only songs whose
  timeline was opened are kept, so plain Chop edits work as before. A
  different file under the same key (other length) is ignored. **Reset**
  clears the song (Undo brings it back) and deletes the save; deleting a song
  from the library deletes its timeline.

### Phase 3: arrangement freedom
- Gaps and overlaps: sections get their own `at` position (silence between).
- Find the first downbeat so the grid lines up with the music, not with 0 s.
- Zoom and scroll (pinch / two-finger) for long songs.
- Copy/duplicate a section (loops for edits).

### Phase 4: mix two tracks
- A second track row: the next song in the queue. Crossfade lane (equal power)
  between the end of A and the start of B, beat-matched by speed if the BPMs
  are close (we have both BPMs). Export as one file.

## Pedal lock (shipped with the scaffold)
A **Lock** chip next to Keep pitch: when on, a new song starts at the same
speed instead of ×1.00 (the reverb still follows the pedal). Remembered in
`localStorage['speedLock']`.

## Open questions
- Should a lane for speed show BPM instead of ×ratio? (Probably yes when BPM is known.)
- Desktop: keyboard shortcuts (S = split, Delete = remove point, Cmd+Z = undo).
