# Chord Cut — handoff

*(Product renamed from Zen Slice, r26. The repo, code identifiers — `ZenSlice.boot`, `zs-` prefixes, `window.ZS` — and harness names deliberately keep the old name: the rename is docs and user-facing surfaces only.)*

Read this before touching anything. The **readable architecture docs** live in
`docs/` — [MUSIC.md](docs/MUSIC.md) for the generative music system,
[GRAPHICS.md](docs/GRAPHICS.md) for rendering, [NATIVE.md](docs/NATIVE.md) for
the iOS wrapper — and the README covers build/harness basics. This file is the
**dense engineering log**: per-round design decisions with their reasons, the
conventions that keep rounds safe, and the open items.

---

## 1. What this is

A zen fruit-slicing game in three.js + WebGPU/TSL where every cut plays into a
generative music system, targeting Safari on the latest iPhone, iPad and
desktop at 120 fps. Repo: `github.com/jhurliman/zen-slice`. The user is John
Hurliman, a principal engineer (C++/Python, agricultural robots) who prefers
domain modelling first and working backwards from the goal.

The founding spec: *"Relaxing, meditative, and absurdly satisfying — ultra HD
fruit, high-quality fluid/juice simulation, dramatic lighting, and
swipe-slicing that feels perfect. Simple scoring and level progression; depth
doesn't matter, feel does."* The visual bar was real 4K slow-motion fruit
footage (the plates in `reference/`); early rounds were scored blind against
it by critic agents. The project now iterates in **player-feedback rounds**:
he plays a build, sends notes, a round ships fixes as one PR.

## 2. ⚠ THE MOST IMPORTANT LESSON

**Nine rounds of rising metric scores were contradicted by the player's first
real session — and he was right.** A still photograph cannot express a motion
property, and a metric derived from one will confidently reward the wrong
thing (juice taught to delete itself, geometry taught to grow spikes, DOF
tuned for a macro still). **When a metric and the player disagree, the player
wins. Do not "fix" a complaint by finding a metric that agrees with you.**
Render your change and look at it; play it when you can.

---

## 3. Architecture

`src/core/contract.js` is a **FROZEN SPINE**: domain nouns (Species, Fruit, Solid, Half, Body,
Blade, `SliceStroke`, JuiceBurst, Director, Score), an event `Bus`, `Plane`, the `TIER` enum,
`STAGE` framing constants, and a virtual `Clock`/`nowSec()`. It exists so N agents can own
separate files without collision. `SliceStroke` is the load-bearing noun.

**File ownership (one owner per file per round, always):**

| file | piece |
|---|---|
| `src/render/stage.js` | stage — lighting, grade, DOF, post, blade streak. **Serialised "exposure owner"**: round 3 was lost when two agents moved the same physical quantity in opposite directions. |
| `src/fruit/species.js` | fruit-mat (flesh/rind TSL) **and** cutter (the cap/collar code). Two owners, disjoint regions, stated explicitly in briefs. |
| `src/fruit/geometry.js` | fruit-geo — silhouette and mesh. r24: `S.leaves` builds REAL leaf blades (buildLeafCrown) — closed pillow strips appended to the body soup, standing FREE of the surface (a crown bump is attached along its whole footprint by construction and can never put air under a leaf; that structural fact killed every bump-calyx attempt). Legal with the cutter because chainLoops caps every closed loop per cut plane. Only the D-variant strawberry uses it; leaves land in the leaf uv band so species.js's `leafFresh` path paints them. |
| `src/slice/cutter.js`, `slicer.js` | cutter — plane splitting, cap generation. r29: MAX_GENERATION 2 → 3 (contract.js) — quarters cut into eighths; safe because cuts drain one per rendered frame (r19) and director.enforceBudget hard-caps calls/tris, retiring off-screen high-generation pieces first. Measured worst case (6 watermelons, 3 full sweeps to eighths): 29 bodies / 71 calls / ~150k tris vs 120 / 250k budgets. |
| `src/juice/fluid.js` | juice — sheets, ligaments, beads, mist. r32: `api.setCompute(on)` (surfaced as `ZS.setFluidCompute`) switches the per-frame turbulence kernel off for fast-forward probes — analytic wind path only, gameplay sim identical. |
| `src/input/blade.js` | blade — swept steel band, one draw call |
| `src/play/director.js`, `score.js` | feel / director — spawn, budget governor, scoring. r32: Deep Calm is rock-free (the coda is the bliss reward); THE CONSTELLATION — on a clear sky, from Morning Dew on, ~16% of toss opportunities (22 s cooldown, one rng draw at the gate so L≥2 spawn streams shift, L0-L1 frozen baselines intact) launch a 4-fruit fan (5 from Summer Weight, capped by quality.maxFruit) with a SHARED apex height and even x spacing via spawn()'s new optional `aim` override — the engineered CHORD/FLOURISH moment. ⚠ r22 vocabulary: HARMONY = fruit in ONE stroke (slicer stamps `strokeId` on the slice payload; score.js groups by it, 150 ms close, and emits `'harmony' {size,gain,at,flourish}` — hud renders DYAD/TRIAD/CHORD/FLOURISH·n, haptics double-taps at 3+). PHRASE = the cross-stroke chain (window 0.63 s since r26, +15% by player request; multiplier math unchanged, shown live as the gold ×N chip beside the score); the internal bus event keeps its historical name `'combo'` (audio's shimmer/nudge consume it) and `'phrase' {length}` fires when a 6+ run ends naturally (hud whispers `phrase · n`; never on rockhit or reset). Nothing player-facing says "combo" anywhere. |
| `src/play/physics.js` | physics — Rapier (new in round 11) |
| `src/core/prefs.js`, `src/input/haptics.js` | r21: prefs.js is the whole persistence layer (localStorage `zs-prefs`: sound/haptics/bestScore; hud WRITES + emits `'pref' {key,value}` on the bus, audio/haptics/score READ at init). haptics.js maps slice/harmony/rockhit/level to pulses; backend order (r26): 'native' (Capacitor shell — real UIImpactFeedbackGenerator via the injected window.Capacitor global, no import so the web bundle carries zero wrapper bytes) → 'vibrate' (Android) → 'switch' (iOS Safari label-click). r26 diagnostics: `ZS.haptics.state()` {backend, enabled, clicks, pending, grantAgeMs, standalone} on the ?debug strip as `hap switch·Nc[·SA]` — clicks rising with no buzz = WebKit swallows the tick in that context (home-screen standalone is the suspect; shelve until the native wrapper's UIImpactFeedbackGenerator), clicks stuck at 0 = our bug. It — `navigator.vibrate` on Android; on iOS (r23) the LABEL-CLICK technique from ios-vibrator-pro-max (MIT, Sam Denty): a hidden `<label>` wrapping a display:none `<input type="checkbox" switch>`, ticked via `label.click()` (input.click() stopped working on latest iOS) inside a ~850 ms grant opened by any trusted user event (move events refresh it, so mid-drag slices tick); unofficial, try/caught so it can only degrade to silence; swaps to Capacitor UIImpactFeedbackGenerator at native wrap. The settings UI itself (idle-only `···` glyph: sound/haptics/begin again) lives in hud.js, suppressed under `?capture`; hint fades after 3 swipes (r34 fixed the fade actually landing: the zsPulse animation held `opacity`, and CSS animations outrank normal declarations, so `.gone{opacity:0}` never won — `.gone` now also sets `animation:none`); `prefers-reduced-motion` stills the callouts and level text. |
| `capacitor.config.json`, `ios/`, `src/core/native.js`, `docs/NATIVE.md` | THE NATIVE WRAPPER (r26): Capacitor 8.5 SPM shell, min iOS 26.0 (WebGPU-in-WKWebView floor; this game is WebGPURenderer-only). App Store build runs at 60fps by Apple's design (WKWebView rAF cap, WebKit bug 294338 — game loop is delta-time so 120Hz is inherited if ever unlocked; the PWA stays the 120Hz path). ios/ is committed (synced web assets gitignored); build loop = `node build.mjs && npx cap sync ios`; everything except archive/sign works on Linux — Mac steps, review posture, silent-switch caveat (WebKit bug 167788) all in docs/NATIVE.md. native.js bootstraps StatusBar.hide + KeepAwake inside the shell, no-op elsewhere. |
| `src/audio/audio.js`, `engine.js`, `harmony.js`, `instruments.js`, `conductor.js` | audio — the generative music system (new in round 16). audio.js orchestrates the bus; engine.js is plumbing (master chain, procedural reverb, voice pools); harmony.js is the pure harmonic field (per-level chord palettes, species→chord-role mapping); instruments.js renders the piano sample-map offline (deferred 1.5s after unlock, 24 kHz — r18) and the per-level swish bank; conductor.js infers tempo from the player's slicing cadence, runs the look-ahead scheduler, and owns bloom/motifs/echo (r17) plus the Deep Calm arrival (r18). r30 bloom dynamics: diminishing gain (0.05·(1−0.55·bloom)) against a 26 s playing decay — equilibria ~0.5 calm / ~0.75 steady / pegged only on hot streaks (the old +0.06 vs 70 s pegged at ANY steady cadence); a rockhit halves bloom and knocks heat (conductor.onRockHit, called from audio's rock handler) — the mistake costs the arrangement you grew. r30 also baked the owner's device ?tune voicing into the shipped baseline (space 1.35 → wetBase 0.4725, bed 1.15 → padGain, glue 1.2 → comp −17.6 dB/3.3:1, swish 0.75 → audio's swish gain); tuner macros stay 1 == this new baseline. ⚠ The per-level arrays (PALETTES, BARS_PER_CHORD in harmony.js; MOTIFS, BASSES, PAD_COUNT in conductor.js; SWISH_FOR_LEVEL in instruments.js) are INDEX-MATCHED to director.js LEVELS — since r18 that is a 10-level dawn→night arc (r29: tightened to ~20 min — durs sum ~18.3 min to the coda, cadence up, burst 2 from First Light so dyads exist early; the arc: Still Water → First Light → Morning Dew → Orchard Rain → Noon Bloom → Summer Weight → Golden Hour → Dusk Ember → Night Jasmine → Deep Calm endless coda); a level added to one table must be added to all, and `tools/audioprobe.mjs` asserts the lengths agree. Verified by audioprobe (pure harmony laws in node + live-build assertions on `ZS.audio.state()`). `?nosound` disables it; `?debug` (hud.js) adds a level-jump remote showing chord/bpm/bloom. r18 also touched `director.js` (LEVELS + the dur/need dual gate) under the feel/director row. r20 added THE ROCK — a `noCut` species (`species.js` 'rock' entry with a per-instance `_zsDamage` crack uniform, `SHAPE.rock` in geometry.js): slicer.js emits `'rockhit'` instead of cutting, score.js charges −25 + combo reset and emits `'penalty'`, hud.js sinks a slate callout, audio.js answers (r23) with a WRONG-KEY piano flam — the minor 2nd above `noteFor('apple',0)` lands first and louder, the intended note stumbles in 15 ms behind (the game's only non-consonant sound; no cluster, no dead thud). Rocks spawn via `LEVELS[n].rock` chance (r25 pacing: 0 only at Still Water, 0.04 from First Light, ~double the r20 early rates, hard cap 0.18 by night — the player wanted the gameplay element sooner; the `L.rock > 0` guard keeps level 0's rng stream and frozen probe baselines byte-identical, rock-level baselines shift and re-baselining is expected). `tools/fruitviews.mjs` renders every species (rock included) top/side/three-quarter in game lighting for geometry iteration. r32: strawberry EXTERIOR went matte (roughness 0.42 base with glinting seeds, clearcoat 0.15) — the wet shine belongs to the cut face only. `tools/soak.mjs` (r32) simulates N minutes of continuous play and gates on step-cost growth, a scene-graph census (objects/geometries/materials, unique-by-uuid), DOM growth, and heap trend — the long-session leak detector. It runs with ZERO GPU work: no renders AND `ZS.setFluidCompute(false)` — module frame() hooks run per step even with doRender=false, and fluid dispatches its turbulence kernel in frame(), which under SwiftShader blocked single steps 3.6-60 s+ (v2/v3 lesson; on device the dispatch is once per display frame on real silicon and costs nothing). 15-min verdict (r32c): CLEAN across the whole L0→L9 arc — step cost flat, heap sawtooth, census/DOM/voices bounded, zero errors; the on-device 15-min slowdown is NOT a JS/scene leak (thermal throttling is the standing suspect). r23 — THE CUT IS THE NOTE: the FIRST fruit of a stroke plays its piano note AT CONTACT (zero hold); the 80 ms CHORD_GATHER collects only the stroke's later cuts, voiced around that fixed pitch by `harmony.voiceAround(fixedSemis, entries)` (octave lifts only, never moves the fixed note — audioprobe asserts the laws). The r22 snick is DELETED, the thump is tamed in r23 and DELETED from the slice in r25 ("muffled crunchy sound with a delay" — a slice is exactly two sounds now: air and the note; the thump buffer survives only as the rock's knuckle), and the swish bank is rebuilt all-air (breath/air/mist/dusk — no grain trains; the old 30/70 Hz grains read as "a closed hi-hat tick" / "an aluminum pan"). Perceived-latency ledger: app-side hold is now 0 ms; `?debug` `lat` shows `outputLatency` — ~10-30 ms on speakers, ~150-200 ms on Bluetooth (unfixable in web audio). r34 — THE EXCLAMATION POINT: at 3+ the stroke's ANCHOR note carries a size-scaled accent (×1.08/1.16/1.22 — the r18 boost only ever lifted the later cuts, so the downbeat landed at single-note weight), the sub foundation grows a step with the stroke (0.5/0.55/0.6), a triad gets its own light one-beat duckBed(0.78) breath, the 4+ duck deepens 0.6→0.55, and the run's crown rings 0.46→0.52. r26 — the GRAND RUN: a 4+ harmony triggers `harmony.runNotes(span)` (chord tones ascending 2 octaves at CHORD, 3 at FLOURISH, color-tone crown; probe-asserted in-chord/in-range/ascending), replacing the old short gliss as the reward moment (glissNotes stays as the conductor's arp pool). Headphone mastering pass: 28 Hz rumble highpass after the master fader (nothing musical below it), and the pad bank fans its voices ±0.18-0.42 static pan (lowest voice center; drone bass stays anchored center). COMBO_WINDOW is BEAT-SYNCED since r27 (player request reversed the r26 declination): audio.js publishes ctx.beatSec (60/bpm) each frame, score.comboWindow() clamps it to [0.60, 1.00] and falls back to 0.63 without audio — the chain window IS one beat of the player's own tempo. r27 also: THE ROOM FOLLOWS THE DAY — engine.SPACES dawn/open/night IR pair crossfaded via engine.setSpace, mapped by audio.js SPACE_FOR_LEVEL (index-matched, probe-asserted); SIDECHAIN BREATHING — engine.duckBed dips the pad bed for the 4+ grand run and hushes it ahead of every palette landing (conductor.setLevel estimates the bar, the landing releases it with the bloom); PIANO ROUND-ROBIN — renderPianoKit resolves after take 0 (first-note readiness unchanged) then detaches 2 more takes per center (strike point/detune/inharmonicity/hammer variation), pianoSample draws at random; r33 FELT VOICING (player: "a little shrieking and windchimey") — partial rolloff p^-1.05 → p^-1.35 with a felt shade /(1+(fp/3400)²) (D#6 attack energy ≥2.5 kHz: 23% → 3%), the tail handoff is frequency-shaded (0.12·min(1,√(600/fp)) — high partials die in the prompt stage, only warm lows keep the singing tail; ring τ 3→2.2·tauP), register-weighted normalization (treble ~2.5 dB back instead of equal-loud with bass), treble inharmonicity max B 0.0008 → 0.00065, hammer 6·f0/6 kHz → 5·f0/5.2 kHz, sympathetic fifth halved, and audio.js brightOf ceiling 7 → 5.2 kHz — measured by a one-off offline A/B (scratch, not committed): sustain RMS unchanged within 0.5 dB, so the piano still sings, it just stopped glinting; THE ?tune PANEL (src/ui/tuner.js, dev-only behind the URL flag) — 8 voicing macros (air/warmth dB shelves, space/bed/note/swish/glue/master scales) over engine.setVoicing, A/B against baseline, copy-JSON export, live meter; ship voicing is identity so the retail path is transparent; THE MIX METER — engine.meter() (lazy analyser after the whole voicing chain, rms/peak dBFS + lo/mid/hi bands) on the ?debug strip and in the tuner. r28 (the Rez round): THE NOTE IS QUANTIZED — the swish owns contact (immediate, unpitched), the stroke's piano snaps to the scheduler's next 16th via conductor.quantize (the gather deadline runs to the grid tick, floor CHORD_GATHER). r31 TEMPORAL COHERENCE: every pitch is derived AT SOUND TIME — the whole stroke is voiced in flush() (≤30 ms before the tick; r28's contact-fixed first-note pitch could make a stroke bichordal when the chord advanced mid-window, and the player heard it), echoes re-check their pitch class against the chord at drain and stay silent if it moved (the D-over-Amaj9 avoid-note case), and hums queue with pitch derived ≤150 ms before onset (harmony.voiceAround removed — nothing pins a pitch early anymore); BEAT-QUANTIZED TOSS — audio publishes ctx.toss8In (conductor.timeToNext8), director holds an expired spawn timer until the next audible 8th (0.75 s rail; no publisher → immediate; rng ORDER unchanged, only timing baselines shift); THE APEX HUM — playHum whispers a fruit's chord-role note centered on its arc apex, panned to where it will hang (rocks stay silent — the tell); gated off in hot play; WIDTH-AS-BLOOM — pad.setWidth and echo pan scale with bloom (idle narrow, full arrangement open); THE CHAIN STEM — while ctx.score.combo ≥ 2 a deterministic off-8th shimmer pulses (conductor gChain, dies within ~0.5 s of a break): the multiplier, audible. |

**Renderer facts that will bite you:** `WebGPURenderer` only, no WebGL2 fallback (the user chose
this). `ShaderMaterial` / `RawShaderMaterial` / `onBeforeCompile` / `EffectComposer` are
**unsupported and fail SILENTLY** — three logs "not compatible" and substitutes an empty
NodeMaterial. Everything is TSL (`three/tsl`), which compiles to both WGSL and GLSL.
`build.mjs` uses an **exact-match** esbuild `onResolve` (not `alias`, which does prefix
substitution and would rewrite `three/tsl`).

**Perf budget:** 120 draw calls, 250k triangles, 2.0ms JS p95, 8.3ms/frame for 120fps.
Draw calls are exactly `13 + 2 * liveBodies`. Round 10 got portrait from 187/267k to **115/160k**
and landscape to **83/153k**, so there is headroom now — spend it on things the player can see.

⚠ **`main.js resize()` contain-fits `STAGE.halfExtent`**, so at portrait's aspect the camera
retreats to z=22.02 and the visible world is 8.45 units tall against landscape's 3.90. Two
consequences: one swipe sweeps 2.17x more playfield in portrait, and portrait fruit occupy ~18.5% of frame
height against the reference plates' ~25% — a known framing gap, open.

---

## 4. The harness

Every probe drives the real bundle in headless Chromium through `window.ZS`
(virtual clock — `ZS.step()` detaches the game from wall time; `?capture=1`
forces the WebGL2 backend, which is what SwiftShader can run).

- **`tools/audioprobe.mjs`** — harmonic laws in pure node + live-build
  assertions on `ZS.audio.state()`. **House rule: green 3× consecutively
  before any audio-touching change ships.**
- **`tools/drawprobe.mjs`** — draw-call/triangle budgets on deterministic frames.
- **`tools/fruitviews.mjs`** — every species top/side/three-quarter in game
  lighting → `shots/fruit/` (committed; regenerate when geometry/materials move).
- **`tools/shoot.mjs`** — the screenshot corpus. Needs a FULL Chromium
  (`npx playwright install chromium`) — the headless shell has no
  `navigator.gpu`. Exits 0 even with failed beats, deliberately.
- **`tools/soak.mjs`** — long-session leak detector. Runs with ZERO GPU work
  (no renders, `ZS.setFluidCompute(false)`) — module `frame()` hooks run per
  step even with `doRender=false`, and fluid's kernel dispatch per
  fast-forwarded step chokes SwiftShader (r32 lesson). r32c verdict: 15 min,
  full L0→L9 arc, CLEAN — the on-device long-session slowdown is not a
  JS/scene/heap leak (thermal throttling is the standing suspect).
- **`tools/perfprofile.mjs`** — per-module, per-phase frame-cost attribution
  over `ZS.profile()`. Tail latency lives in p95/max per module, not the mean.

Launch-flag note: `--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader` is safe **with `?capture=1`** (WebGL2 path) and
is what audioprobe/soak use; the historical "these flags crash the renderer"
warning was about booting the **WebGPU adapter** under them (re-verified r32).

## 5. Conventions that keep rounds safe

- One PR per feedback round, non-draft, on branch
  `claude/zen-slicing-generative-audio-c4k4p5` (restarted from `main` after
  each merge). Update this file every round.
- **No runtime assets, no runtime network. Ever.** Everything procedural;
  build-time npm is fine.
- Frozen probe baselines: level 0's rng stream is deliberately kept
  byte-identical across changes when possible (`L.rock > 0` guards, gate-rng
  placement); when a change legitimately shifts higher-level streams, say so
  in the PR.
- Index-matched per-level tables (see the audio row above) — a level added to
  one must be added to all; audioprobe asserts lengths.
- Report negative results, retract wrong numbers, publish cross-file deltas
  before the other owner discovers them.
- The user is often on mobile. **Keep replies short.** Send files rather than
  describing them.

## 6. Open items

1. **Cut spike** — `cutGeometry` allocates fresh BufferGeometry per half on
   the main thread at the moment the player is looking. Steady-state JS is
   p50 0.1 ms / p95 0.3 ms, so measure the spike, not the mean.
2. **Bundle is ~4 MB** from inlined Rapier WASM; splitting is open.
3. **Portrait framing** — fruit occupy ~18.5% of frame height vs the plates'
   ~25%; portrait's contain-fit camera (z=22.02, 8.45 world units tall) is
   the cause. Needs serialising: it moves every framing-sensitive constant.
4. **Watermelon ground spot** should move to albedo in `species.js` (the
   plane cut that used to make it went away with shape D).
5. **Haptics on iOS web** — the label-click switch hack is instrumented but
   WebKit swallows it in some contexts; the real fix is the native shell's
   UIImpactFeedbackGenerator (`docs/NATIVE.md`). Awaiting device test.
6. **Thermal governor** — if the device confirms the 15-min slowdown is
   thermal (§4 soak), a stickier quality governor (downshift under sustained
   misses, stay down) is the fix.

## 7. ⚠ Security and access

- Early in the project the user pasted a GitHub PAT and an SSH deploy key
  into a chat transcript. Local copies were shredded; **he should revoke
  both** if he has not.
- Store any credential outside the repo so it can never enter a commit or a
  bundle. If a push is refused, ask — do not improvise around access control.
