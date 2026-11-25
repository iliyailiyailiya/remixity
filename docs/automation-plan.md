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
- Live playback of **mix-type** lanes (reverb/echo mix, echo feedback, EQ, bass,
  cuts), applied about 30 times a second through `player.setParams` (the chain
  already glides with `setTargetAtTime`, so no zipper noise).
- Behind a flag for now: open the app with `?lab=1` once (remembered) to see
  the timeline button.

### Phase 2: the hard parameters
- **Speed automation.** The player's clock assumes one speed
  (`position = offset + elapsed × ratio`). With automation the clock becomes
  the integral of the speed curve: keep a table of (timeline t → heard time)
  and invert it. Live: schedule `playbackRate.linearRampToValueAtTime` per
  segment of the curve instead of `setParams` per frame. Keep-pitch: feed the
  stretch engine `schedule({ rate })` at each point.
- **Reverb size / tone.** The impulse is rebuilt on change (slow). Use two
  convolvers and crossfade between pre-built impulses (one per point), so
  automating size doesn't click.
- **Export.** `render.ts` gets the lanes: `AudioParam` automation in the
  `OfflineAudioContext` for gains/filters, a varying resample step for speed
  (the DSP worker's `resample` gets a step table instead of one number).
- Save per song in IndexedDB (lanes + edit), so a remix can be reopened.

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
