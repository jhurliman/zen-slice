# The generative music system

Every sound in Chord Cut is synthesized at runtime — nothing is loaded, ever
(the no-assets rule). The music is not a backing track with sound effects on
top: the player's cuts **are** the melody, voiced from a per-level chord
palette and quantized to a beat inferred from their own slicing tempo. This
document explains the architecture, the signal chain, and the small set of
laws that keep an unpredictable player consonant.

## The modules

```
src/audio/audio.js        the orchestrator — owns the bus, velocity/pan/wet
                          laws, the stroke gather, and every event handler
src/audio/engine.js       plumbing — AudioContext, master chain, reverb,
                          voice pools, ducking, metering. No musical opinions.
src/audio/harmony.js      the pure harmonic field — palettes, chord state,
                          note selection. No audio nodes, fully unit-testable.
src/audio/instruments.js  sound generators — the rendered piano, the swish
                          bank, the thump. Pure functions of (engine, params).
src/audio/conductor.js    time — tempo inference, the 16-step scheduler,
                          bloom, motifs, echoes, the chain stem.
src/ui/tuner.js           dev-only ?tune voicing panel over engine.setVoicing
```

The separation is strict: harmony.js decides **what** pitch, conductor.js
decides **when**, instruments.js decides **how it sounds**, engine.js carries
signal, audio.js wires the game to all four.

## Signal chain

```
piano voices ──┬─ per-voice: lpf (velocity-tracked) → gain → pan ─┐
swish/thump ───┤                                                  ├─→ master
pad bank ──────┴─ padBus → padLp → padGain → padDuck ─────────────┘     │
                                                                        ▼
                              warmth low-shelf (240 Hz) → air high-shelf (7.5 kHz)
                                → trim → 28 Hz rumble highpass → destination
                              (compressor −17.6 dB / 3.3:1 on the percussive bus;
                               the sustained bed bypasses it so it never pumps)
```

Reverb is a **pair of crossfaded convolvers** with procedurally rendered
impulse responses (`engine.SPACES`: dawn / open / night). The room follows the
day: each level maps to a space (`SPACE_FOR_LEVEL`), so dawn is close and dry,
noon is open, night blooms long.

The shipped voicing (shelf gains, wet level, compressor curve, bed level) was
tuned by ear on the target device through the `?tune` panel and then **baked
into the defaults** — the tuner's macros are identity at ship values.

## The harmonic field (harmony.js)

- Ten **palettes**, one per level of the 20-minute day arc, all over an A
  pedal family (A–E roots). Each palette is a progression of chords —
  `{bass, tones, color}` as pitch classes — advanced by the conductor every
  few bars.
- Every fruit species maps to a **chord role** (bass / tone / color), so what
  you cut chooses register and function, not a fixed pitch: `noteFor(species,
  climb)` selects the nearest chord-legal pitch in that role's register.
- `voiceChord(entries)` voices a multi-fruit stroke as one rolled chord —
  wide at the bottom, close at the top, no interval smaller than a third in
  the bass. `place()` clamps everything to the piano's span [−25, +31]
  semitones from A3.
- `runNotes(octaves)` builds the 4+/5+ reward run: chord tones ascending 2–3
  octaves, crowned with the color tone.

**The temporal-coherence law:** every pitch is derived **at sound time, never
at contact time**. The whole stroke is voiced in one `flush()` ≤30 ms before
its grid tick; echoes re-check their pitch class against the *current* chord
when they drain and stay silent if the chord moved; queued hums pitch
themselves ≤150 ms before onset. Nothing pins a pitch early — this is what
keeps a note that sounds *after* a chord change from clashing with it.

## Time (conductor.js)

- **Tempo is inferred from the player.** Slicing cadence nudges the bpm
  within 60–90; a calm player gets a slow world, a hot streak accelerates it.
  `ctx.beatSec` is published every frame.
- A 16-step look-ahead scheduler walks the grid; chords advance on bar
  boundaries per the palette's `BARS_PER_CHORD`.
- **The cut is quantized, the air is not.** A swipe's swish plays immediately
  (unpitched — latency is felt in the air sound); the stroke's piano snaps to
  the next 16th (`conductor.quantize`). The gather deadline runs to the grid
  tick, so a multi-fruit stroke is collected and voiced as one chord.
- **Bloom** is the arrangement's intensity — grown by successful play with
  diminishing gain, decayed over ~26 s, halved by a rock hit. It scales pad
  width (stereo opens with the arrangement), echo level, motif density.
- **Echoes**: the top three voices of a stroke (by pitch) come back as a
  quiet off-beat answer, drained by the scheduler, chord-checked at drain.
- **The chain stem**: while the score combo is ≥2, a deterministic off-8th
  shimmer pulses — the multiplier, audible. Dies within ~0.5 s of a break.
- Beat-synced gameplay: `score.comboWindow()` = one beat (clamped 0.6–1.0 s),
  and the director holds expired spawn timers to the next audible 8th
  (`ctx.toss8In`) so fruit *arrive* on the music.

## Instruments (instruments.js)

**The piano is rendered, not loaded.** At unlock, ten buffers (one per 6
semitones, A1–D#6) render in an OfflineAudioContext at 24 kHz; playback
pitch-shifts ≤±3 semitones via `playbackRate`. What makes it a piano and not
a music box:

- inharmonicity — partial *n* at `n·f0·√(1+Bn²)`, stretch growing to treble;
- **two-stage decay** per partial (fast prompt → quiet tail) — the entire
  difference between a chime and a piano — with the tail handoff shaded by
  frequency so high partials die in the prompt stage;
- a felt-steep spectral rolloff (`p^-1.35` with a shade above ~3.4 kHz);
- register-weighted loudness (treble sits ~2.5 dB back);
- a 6 ms bandpassed hammer transient; 2 detuned strings below ~500 Hz;
- a strike-point comb at ~1/8 string length.

Three **round-robin takes** per center render detached after the first take
resolves (strike point / detune / inharmonicity / hammer vary a few percent) —
repetition is the tell of procedural audio. Until the kit resolves, a simple
pluck plays so first-slice audio can never be missing.

**The swish bank** is the cut's immediate feedback: four recipes of pure
filtered air (breath / air / mist / dusk — no grain trains, nothing
percussive), one per stroke, mapped per level. **The thump** survives only as
the rock's knuckle.

A slice is exactly two sounds: **air at contact, the note on the grid.**

## Reward moments

| stroke size | callout | sound |
|---|---|---|
| 2 | DYAD | rolled dyad |
| 3 | TRIAD | accented anchor + chord + sub-octave foundation + a light bed dip |
| 4 | CHORD | all of the above, deeper sidechain, the **grand run** (2 octaves) |
| 5+ | FLOURISH | grand run across 3 octaves, crowned |

The anchor note of a 3+ stroke carries a size-scaled velocity accent; the
pad bed ducks (`engine.duckBed`) to make room and swells back while the run
rings — sidechain as authored breathing, not pumping. The rock is a piano
**mistake**, not a sound effect: a fat-finger flam, the wrong key (minor 2nd)
first and loudest, the intended note stumbling in 15 ms behind.

## Index-matched tables ⚠

The per-level arrays are INDEX-MATCHED to `director.js`'s `LEVELS` (the
10-level arc): `PALETTES`, `BARS_PER_CHORD` (harmony.js); `MOTIFS`, `BASSES`,
`PAD_COUNT` (conductor.js); `SWISH_FOR_LEVEL` (instruments.js);
`SPACE_FOR_LEVEL` (audio.js). A level added to one table must be added to
all — `tools/audioprobe.mjs` asserts the lengths agree.

## Verification

`node tools/audioprobe.mjs` runs two layers:

1. **Pure harmonic laws in node** — every palette chord is legal, every
   species role resolves in every chord, voicings respect span and spacing,
   runs are in-chord and ascending. No browser needed.
2. **Live-build assertions in Chromium** — boots the real bundle, drives
   strokes through `ZS.swipe()`, and asserts on `ZS.audio.state()`: voice
   counts, quantization timing, echo legality, table lengths, meter sanity.

House rule: **green three consecutive times before any audio change ships**
(the probe exercises real scheduling, so a marginal timing bug shows up as
flake before it ships as a bug).

## Debug & tuning

- `?debug` — chord / bpm / bloom / output-latency on the HUD strip, plus a
  level-jump remote.
- `?tune` — the dev voicing panel: 8 macros (air, warmth, space, bed, note,
  swish, glue, master) over `engine.setVoicing`, A/B against baseline,
  copy-JSON export, live level/spectrum meter.
- `?nosound` — disables the whole system.
