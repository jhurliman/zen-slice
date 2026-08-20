# Chord Cut — handoff

*(Product renamed from Zen Slice, r26. The repo, code identifiers — `ZenSlice.boot`, `zs-` prefixes, `window.ZS` — and harness names deliberately keep the old name: the rename is docs and user-facing surfaces only.)*

You are taking over a project mid-flight. Read this file completely before you touch anything.
It is written to save you from repeating nine rounds of expensive mistakes, most of which were
mistakes about *measurement*, not about rendering.

---

## 1. What this is

A Fruit-Ninja-style slicing game in three.js + WebGPU/TSL, targeting Safari on the latest
iPhone, iPad and desktop. Repo: `github.com/jhurliman/zen-slice` (private). The user is John
Hurliman, a principal engineer who writes C++ and Python and works on agricultural robots. He
prefers domain modelling first, working backwards from the goal, and analogies when learning
something new.

### The founding spec, verbatim intent

> Relaxing, meditative, and absurdly satisfying — ultra HD fruit, high-quality fluid/juice
> simulation, dramatic lighting, and swipe-slicing that feels perfect. Simple scoring and level
> progression; depth doesn't matter, feel does.

The bar he set: real 4K slow-motion footage of fruit being sliced (Slow Mo Guys style) for
visuals and fluid, Fruit Ninja 2 gameplay capture for feel and mechanics, and a sustained 120fps
on ProMotion iPhone/iPad, never below 60.

### The method he specified

> Divide the goal into the smallest pieces that can be improved and judged independently. For
> each piece, fan out a builder sub-agent and a separate harsh-critic sub-agent with fresh
> context. Each critic must inspect the real output, compare it blind side-by-side against the
> bar, name the single biggest remaining gap, and send it back. Keep looping until our version
> wins the blind comparison or I stop you.

Plus: maintain a live progress page, fan out sub-agents, and `/loop` until it is perfect.

---

## 2. ⚠ THE MOST IMPORTANT THING IN THIS FILE

**On 2026-08-17 the user played the game for the first time. His notes contradicted nine rounds
of rising metric scores. He was right and the metrics were wrong.**

His six notes:

1. "the juice disappears way too quickly, ideally i don't see it fade at all but it instead
   sprays off the screen"
2. "the fruit-to-fruit intersections look janky, i think we need a physics engine to keep the
   pieces from intersecting and get nice bounces off each other in air. is it possible to quickly
   generate convex hulls in realtime as we slice the fruit?"
3. "performance is not great. it slows down every time i slice, is there an intentional slo-mo
   effect? if so get rid of it, it's distracting. but i am also seeing framedrop when fruits
   split apart, do we need web workers or a perf optimization round or what?"
4. "the fruit hulls look like they are some jank low poly? like they are spiky? but the slicing
   looks really nice"
5. "the specular lighting is overdone, it makes the fruits look like chrome or something when the
   light hits fruits in certain ways"
6. "the depth of field is overdone, many of the fruits are completely blurry"

And a follow-up on the juice mix (see `rounds/reports/r11-PLAYER-NOTE-juice-mix.md`):

> "both the high speed fluid spray and lower speed fluid blobs are both great, we should always
> show some combination of both with each hit but weighted more toward fluid blobs and slower
> speeds"
>
> "the weighting should change based on the velocity of the blade. more spray at higher
> velocities"

**Three of those six describe damage the measurement loop itself caused:**

- The juice deletes itself because a round-3 critic compared it against **plate-01, a still
  photograph**, and concluded lifetimes were 4x too long. A still cannot express a motion
  property. Optimising toward one taught the simulation to delete juice as fast as possible.
- The fruit are spiky because three rounds of critics demanded "outline events" and round 10's
  geometry builder duly took the orange from mathematically convex to `hull_concave_frac` 22.27.
  The metric measures **deviation from a sphere**, not resemblance to fruit.
- The lens blurs what he is trying to aim at because DOF was tuned to match a shallow-focus hero
  photograph, and `stage.js` latches halves as the focus subject for 1.6s by design.

**THE LESSON, and the thing to protect: a still photograph cannot express a motion property, and
a metric derived from one will confidently reward the wrong thing. When a metric and the player
disagree, the player wins. Do not "fix" his complaint by finding a metric that agrees with you.**

---

## 3. The measurement suite, and why it is the crown jewels

`tools/probes.py` (PROBE_VERSION 15) is the **frozen measurement suite**. Builders and critics
call the *same* code, so a target cannot be hit by choosing a friendlier instrument.

**Rules, both earned by a specific failure. They are in the file's header. Read it.**

1. **A mask must be defined GEOMETRICALLY (or by an explicit region), NEVER by the colour of the
   thing being measured.** Round 5: a builder's probe keyed on `G < 0.80R` could not see white
   foam pips, returned 4.89% and made a "<5%" target look met when the honest number was 14.07%.
2. **A probe is only valid against a reference at MATCHED SCALE, and normalising by
   `sqrt(mask_px)` does NOT make a pixel-domain statistic scale-invariant.** Round 9: a critic
   withdrew its own number *with the wrong sign* — "collar 39% too WIDE" was an artefact of
   comparing to a native-resolution plate; mask-matched it is 43-46% too NARROW.

**Discipline: ADD probes, NEVER modify them.** Bump `PROBE_VERSION` with a loud notice, and
verify the canary before and after.

⚠ **The canary every round pasted could not be run.** `shots/r5/` is gitignored and has not been in
the tree for six rounds, so `clip shots/r5/05-cut+500ms.png -> mask_px 9490 / pct_R_ge_255 5.227`
was being quoted from earlier reports rather than executed — the exact failure the rules exist to
prevent, in the instrument whose job is to prevent it. **Run BOTH of these instead; they are on
versioned frames:**

```
python3 tools/probes.py clip shots/r10/05-cut+500ms.png  ->  mask_px 10340 / pct_R_ge_255 4.333
python3 tools/probes.py clip shots/r9/05-cut+500ms.png   ->  mask_px 10057 / pct_R_ge_255 2.197
```

Paste the canary in every report. Multiple agents edit this file concurrently; re-read, re-apply
additively, re-canary on conflict.

### The graveyard of invalid metrics — read this before inventing another

| metric | round | how it failed |
|---|---|---|
| `separation` | 8 | Divided by within-species pose variance, so it was **maximised by deleting an appendage**. A builder duly tucked the strawberry calyx inside the waist to clear the gate. |
| `identity` | 9 | A 6-way **closed-set 1-NN** whose only referent is the five other bodies, all of which we authored. **Awards 1.000 to a mathematical sphere** (r8 orange: `hull_concave_frac_pct` exactly 0.00 over 32 poses, recall 1.000). |
| `referent` | 10 | Four **hand-traced real fruit outlines** — a genuine external ground truth. Audited by a different agent than its author: a featureless smooth egg with no stem, calyx or sepals scores **+0.434** where our fruit score **+0.300**. Quoted as (gain − smooth_ceiling) our reading is **negative**. Verdict ACCEPT-AS-CONTROL. |

`identity` and `referent` are kept as **controls** (they catch real regressions) and are
**retired as targets**. Do not set an acceptance threshold on either.

**The practice that finally worked: separate the author of a ground truth from the party scored
against it.** `referent` was caught before a single builder optimised against it, because the
auditor was a different agent with a mandate to break it. Keep doing this.

### Instruments that are known-broken

- **The capture path is NONDETERMINISTIC.** Three renders of one build, one scene, one virtual
  clock, zero code difference differ by up to 3 display counts — enough to flip 43px of the
  melon's mask and move `outline protr_width_deg` by **25%**. `shots/r10-perf-noise/` holds the
  three PNGs. **Characterise spread with N repeats before calling a 5% move a win.**
- **`shoot.mjs`'s `cpu.max` is unusable** — 1.8ms vs 15.3ms on the same build, unseeded loop.
  Quote **p50 and p95**, never max. (An earlier round published a headline from it; the sign
  reversed on re-shoot. See the `CORRECTION_r10` block in `rounds/r9.json`.)
- **`clip` on `08-citrus-caps` does not measure a fixed thing** — its ellipse is fitted from the
  frame's own second moments, so two runs of one build gave mask 5,046 vs 10,182 px and 1.13% vs
  4.96% clipped. Needs an explicit window. Do not steer on it.
- ✅ **FIXED r12 — `--portrait` IS NOT A FLAG.** The device switch is **`--device iphone`**.
  `shoot.mjs` now rejects any unknown flag with `exit 3` and names the right switch.
- ✅ **FIXED r12 — the black-frame hazard.** Every frame is luma-checked before it reaches the
  disk, retried once, then recorded as a failed beat. `report.json` carries a per-frame `luma` map
  and a `blackFrames` list.
- ✅ **FIXED r12 — the harness is seeded.** `--seed` (default 1) installs a seeded xorshift as the
  page's `Math.random` before any page script runs. ⚠ **Numbers from r12 onward are comparable to
  each other and NOT to r0-r11's.**
- ✅ **FIXED r12 — `cpu` repeats.** `--cpu-repeats` (default 3); reports median and spread of the
  per-run p50/p95, and files `max` under `max_do_not_quote`.
- ⚠ **`shoot.mjs` needs a FULL Chromium and must not get `chromium_headless_shell`,** which has no
  `navigator.gpu` at all. It now globs for `chromium-*` and refuses to start without one. And
  **`--use-gl=angle --use-angle=swiftshader` crashes the renderer in Chromium 151** — they were
  passed since round 0 and are now gone. Symptom was a boot that never completed with no error on
  any channel. Do not re-add them.
- ⚠ **`00-hero.png` IS NOT A CONTROLLED MEASUREMENT AND NEVER WAS.** One build, one beat:
  630 px / 6 blobs from `shoot.mjs` and **57,347 px / 219 blobs** from a bench that stages it
  identically. It is captured last, after 17 beats, a viewport resize and 1,200 probe steps, and it
  is downstream of the first-slice defect below. **Grade on the review-raster beats, not the hero.**

---

## 4. Architecture

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
| `src/slice/cutter.js`, `slicer.js` | cutter — plane splitting, cap generation |
| `src/juice/fluid.js` | juice — sheets, ligaments, beads, mist |
| `src/input/blade.js` | blade — swept steel band, one draw call |
| `src/play/director.js`, `score.js` | feel / director — spawn, budget governor, scoring. ⚠ r22 vocabulary: HARMONY = fruit in ONE stroke (slicer stamps `strokeId` on the slice payload; score.js groups by it, 150 ms close, and emits `'harmony' {size,gain,at,flourish}` — hud renders DYAD/TRIAD/CHORD/FLOURISH·n, haptics double-taps at 3+). PHRASE = the cross-stroke chain (window 0.63 s since r26, +15% by player request; multiplier math unchanged, shown live as the gold ×N chip beside the score); the internal bus event keeps its historical name `'combo'` (audio's shimmer/nudge consume it) and `'phrase' {length}` fires when a 6+ run ends naturally (hud whispers `phrase · n`; never on rockhit or reset). Nothing player-facing says "combo" anywhere. |
| `src/play/physics.js` | physics — Rapier (new in round 11) |
| `src/core/prefs.js`, `src/input/haptics.js` | r21: prefs.js is the whole persistence layer (localStorage `zs-prefs`: sound/haptics/bestScore; hud WRITES + emits `'pref' {key,value}` on the bus, audio/haptics/score READ at init). haptics.js maps slice/harmony/rockhit/level to pulses; backend order (r26): 'native' (Capacitor shell — real UIImpactFeedbackGenerator via the injected window.Capacitor global, no import so the web bundle carries zero wrapper bytes) → 'vibrate' (Android) → 'switch' (iOS Safari label-click). r26 diagnostics: `ZS.haptics.state()` {backend, enabled, clicks, pending, grantAgeMs, standalone} on the ?debug strip as `hap switch·Nc[·SA]` — clicks rising with no buzz = WebKit swallows the tick in that context (home-screen standalone is the suspect; shelve until the native wrapper's UIImpactFeedbackGenerator), clicks stuck at 0 = our bug. It — `navigator.vibrate` on Android; on iOS (r23) the LABEL-CLICK technique from ios-vibrator-pro-max (MIT, Sam Denty): a hidden `<label>` wrapping a display:none `<input type="checkbox" switch>`, ticked via `label.click()` (input.click() stopped working on latest iOS) inside a ~850 ms grant opened by any trusted user event (move events refresh it, so mid-drag slices tick); unofficial, try/caught so it can only degrade to silence; swaps to Capacitor UIImpactFeedbackGenerator at native wrap. The settings UI itself (idle-only `···` glyph: sound/haptics/begin again) lives in hud.js, suppressed under `?capture`; hint fades after 3 swipes; `prefers-reduced-motion` stills the callouts and level text. |
| `capacitor.config.json`, `ios/`, `src/core/native.js`, `docs/NATIVE.md` | THE NATIVE WRAPPER (r26): Capacitor 8.5 SPM shell, min iOS 26.0 (WebGPU-in-WKWebView floor; this game is WebGPURenderer-only). App Store build runs at 60fps by Apple's design (WKWebView rAF cap, WebKit bug 294338 — game loop is delta-time so 120Hz is inherited if ever unlocked; the PWA stays the 120Hz path). ios/ is committed (synced web assets gitignored); build loop = `node build.mjs && npx cap sync ios`; everything except archive/sign works on Linux — Mac steps, review posture, silent-switch caveat (WebKit bug 167788) all in docs/NATIVE.md. native.js bootstraps StatusBar.hide + KeepAwake inside the shell, no-op elsewhere. |
| `src/audio/audio.js`, `engine.js`, `harmony.js`, `instruments.js`, `conductor.js` | audio — the generative music system (new in round 16). audio.js orchestrates the bus; engine.js is plumbing (master chain, procedural reverb, voice pools); harmony.js is the pure harmonic field (per-level chord palettes, species→chord-role mapping); instruments.js renders the piano sample-map offline (deferred 1.5s after unlock, 24 kHz — r18) and the per-level swish bank; conductor.js infers tempo from the player's slicing cadence, runs the look-ahead scheduler, and owns bloom/motifs/echo (r17) plus the Deep Calm arrival (r18). ⚠ The per-level arrays (PALETTES, BARS_PER_CHORD in harmony.js; MOTIFS, BASSES, PAD_COUNT in conductor.js; SWISH_FOR_LEVEL in instruments.js) are INDEX-MATCHED to director.js LEVELS — since r18 that is a 10-level dawn→night arc (~30 min: Still Water → First Light → Morning Dew → Orchard Rain → Noon Bloom → Summer Weight → Golden Hour → Dusk Ember → Night Jasmine → Deep Calm endless coda); a level added to one table must be added to all, and `tools/audioprobe.mjs` asserts the lengths agree. Verified by audioprobe (pure harmony laws in node + live-build assertions on `ZS.audio.state()`). `?nosound` disables it; `?debug` (hud.js) adds a level-jump remote showing chord/bpm/bloom. r18 also touched `director.js` (LEVELS + the dur/need dual gate) under the feel/director row. r20 added THE ROCK — a `noCut` species (`species.js` 'rock' entry with a per-instance `_zsDamage` crack uniform, `SHAPE.rock` in geometry.js): slicer.js emits `'rockhit'` instead of cutting, score.js charges −25 + combo reset and emits `'penalty'`, hud.js sinks a slate callout, audio.js answers (r23) with a WRONG-KEY piano flam — the minor 2nd above `noteFor('apple',0)` lands first and louder, the intended note stumbles in 15 ms behind (the game's only non-consonant sound; no cluster, no dead thud). Rocks spawn via `LEVELS[n].rock` chance (r25 pacing: 0 only at Still Water, 0.04 from First Light, ~double the r20 early rates, hard cap 0.18 by night — the player wanted the gameplay element sooner; the `L.rock > 0` guard keeps level 0's rng stream and frozen probe baselines byte-identical, rock-level baselines shift and re-baselining is expected). `tools/fruitviews.mjs` renders every species (rock included) top/side/three-quarter in game lighting for geometry iteration. r23 — THE CUT IS THE NOTE: the FIRST fruit of a stroke plays its piano note AT CONTACT (zero hold); the 80 ms CHORD_GATHER collects only the stroke's later cuts, voiced around that fixed pitch by `harmony.voiceAround(fixedSemis, entries)` (octave lifts only, never moves the fixed note — audioprobe asserts the laws). The r22 snick is DELETED, the thump is tamed in r23 and DELETED from the slice in r25 ("muffled crunchy sound with a delay" — a slice is exactly two sounds now: air and the note; the thump buffer survives only as the rock's knuckle), and the swish bank is rebuilt all-air (breath/air/mist/dusk — no grain trains; the old 30/70 Hz grains read as "a closed hi-hat tick" / "an aluminum pan"). Perceived-latency ledger: app-side hold is now 0 ms; `?debug` `lat` shows `outputLatency` — ~10-30 ms on speakers, ~150-200 ms on Bluetooth (unfixable in web audio). r26 — the GRAND RUN: a 4+ harmony triggers `harmony.runNotes(span)` (chord tones ascending 2 octaves at CHORD, 3 at FLOURISH, color-tone crown; probe-asserted in-chord/in-range/ascending), replacing the old short gliss as the reward moment (glissNotes stays as the conductor's arp pool). Headphone mastering pass: 28 Hz rumble highpass after the master fader (nothing musical below it), and the pad bank fans its voices ±0.18-0.42 static pan (lowest voice center; drone bass stays anchored center). COMBO_WINDOW 0.55 → 0.63 s (+15%, player-requested after real sessions; the beat-synced window idea was declined as too structural for late polish). |

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
consequences: one swipe sweeps 2.17x more playfield in portrait, and **portrait fails a
`REFERENCE_BAR` auto-fail — fruit occupy 18.45% of frame height against a 25% floor**. That is
open, needs serialising because it moves every frozen window every piece cites.

---

## 5. Where things stand

Rounds 0-9 are scored in `rounds/r*.json` with per-piece verdicts in `rounds/verdicts/`. Round 9
was the best: **71.2 -> 75.4, all five pieces up**. Round 10's builders all landed but **no critic
ever ran** — the player's feedback arrived first and superseded it, so it is recorded UNSCORED.

**Round 11 is COMPLETE.** It worked only the player's notes:
- ✅ **feel** — slow-mo deleted. It also repaired the measurement layer: the beat labelled
  "+250ms" was really +50ms, so a round-3 critic comparing juice at "+250ms" was looking at a
  frame five times earlier than it believed. `tools/simbeats.mjs` measures this; every ratio is
  now 1.00.
- ✅ **juice** — lifetimes derived from closed-form ballistic exit time per layer rather than
  guessed, separately for the two orientations. A droplet now leaves because it flew out.
- ✅ **juice, the real finding** — it was a **velocity** bug, not a lifetime bug. A rim bead's
  median asymptotic travel was 2.20 units against a 6.93-unit half-width: it could not reach the
  frame edge at *any* lifetime. Drag constants were 9-62 where physically faithful drag for
  1.7-14mm droplets is 1-4. Off-screen-before-dying went rim 4.8% -> 96%, mist 0% -> 56-64%.
- ✅ **physics** — Rapier. Interpenetration median **1.276 -> 0.008** units (five converging
  fruit) and **1.065 -> 0.000** (four melon halves), by separating-axis over 48 directions on the
  world-space render meshes. Hulls in **0.98-1.4 ms per cut**, and only because the cloud is
  reduced from 10,908 loose vertices to <=48 exact support points first — naive was 34 ms.
  Draw calls *fell* to 33/53. ⚠ **Bundle 1.1MB -> 3.94MB** from inlined WASM; splitting is open.
- ✅ **stage** — specular and DOF pulled back, staged as three attributable captures.
- ✅ **shape bake-off** — `rounds/reports/r11-shape-bakeoff.png`. **He chose D on 2026-08-17;
  round 12 shipped it.** Its control column T (shipped mesh, +72% triangles, nothing else
  changed) is indistinguishable from shipped: **the polygon count was never the problem, the
  spikes were**, and the spikes are ours from three rounds of critics demanding outline events.
  Variant D is *cheaper* (1.20x vs B's 1.71x) because removing spikes removes mesh.

### Two more instrument failures round 11 found

- **The perf probe has been measuring a scene twice as heavy as real play.** It spawns and cuts
  on a *tick* schedule while the world runs on the *sim* clock, so slow-mo doubled the population
  it measured. Rounds 4-10 checked the ceilings against a fiction.
- **The `15-fast-flick` / `16-slow-cleave` pair was never controlled** — sampled at 25.0 vs 16.7ms
  of sim time. The two beats that exist to bracket blade speed differed by the harness, not the
  game. They now differ by design (the Weber-number note).

### The cross-file cancellation, and how it was caught

Deleting slow-mo made `ctx.timeScale` identically 1, turning `stage.js`'s
`fdt = dt * (0.35 + 0.65*timeScale)` into plain `dt` — decaying the blade flare 1.75x faster and
silently undoing round 10's bleach. **The `feel` owner does not own `stage.js`.** It measured the
damage in a file it was not allowed to touch and published the coefficients rather than letting a
critic find it. That is the behaviour to preserve. Recalibrated by the derived 0.571x; `core_sat`
sits at 0.112 (inside the <0.15 band, not back at r10's 0.017). A further 30% coefficient change
moved it 0.008, so the flare decay is no longer the dominant lever — and the baseline is
confounded anyway, since r11's juice puts 268 blobs in the hero where r10 had 8. **Left for a
critic rather than tuned by eye.**

## 5b. Round 12 — COMPLETE (`rounds/reports/r12-juice-mix.md`)

Worked the two things r11 left: the player's column choice, and his juice-mix note.

- ✅ **fruit shape** — **he picked column D, premium smooth.** `SHAPE_DEFAULT = 'D'` in
  `geometry.js`. A/T/B/C are kept and `?shape=A` still reproduces r10's mesh bit for bit, so every
  frame in `shots/r9`, `shots/r10` stays reproducible. Orange `hull_concave_frac_pct` 25.39 -> 0.00
  and kiwi 37.89 -> 2.34, which is the CORRECT outcome — those are controls, never targets.
- ✅ **the juice mix is a law** — `fast` is now `we/(1+we)` with `we = (S/V_CRIT)^2`, so the
  atomised fraction goes as **v squared** near the origin and never reaches 0 or 1 at either end.
  Range and endpoints preserved deliberately, so every downstream constant keeps eight rounds of
  calibration and **only the shape of the transition moved**.
- 🔴 **AND THE REASON IT NEVER WORKED ON HIS PHONE, which is the round's real finding:**
  **`slicer.js` computed `worldSpeed` with no aspect-ratio term.** Measured on the live bus, the
  identical gesture read **2.16x faster in portrait** — the orientation he plays in — and the two
  orientations were **3.85x apart**. Every ordinary swipe on his phone was already past the old
  law's saturation point, so `filmness` was 0, the sheet never fired and every cut was aerosol.
  Spray share of on-screen juice area for one ordinary cut: landscape 17.3%, **portrait 63.4%**.
  It also pinned `sep` and `amount` at their ceilings on every portrait cut.
- ✅ **`V_CRIT` is stated as a swipe rate, and the report says why** — the Weber derivation spans
  29x on the choice of density alone, so it fixes the law's SHAPE exactly and its crossover only to
  an order of magnitude. `CROSS_NDC = 9.0` ndc/s. **The mix is now orientation-invariant by
  construction, which is a feel decision and is flagged as the one un-derived number.**
- ✅ **harness hardening** — all four standing asks landed (§3), plus the harness could not produce
  a single frame at all when this round started (wrong Chromium, and two launch flags that crash
  Chromium 151).
- ✅ **the canary was unrunnable** and now has two replacements on versioned frames (§3).

### Open work, roughly in priority order

0. ⛔ **"THE FIRST SLICE OF A SESSION DRAWS NO JUICE" IS RETRACTED — it was a harness artefact.**
   See `rounds/reports/r13-retraction.md`. The measurement reproduces; the conclusion was wrong.
   `ZS.advance()` simulates dark and renders only the last frame; a player renders every frame.
   Same page, same cut, one variable: first cut via `advance()` = **0 blobs**, first cut with every
   frame rendered = **86 blobs**, and the juice is present on the very frame after the cut and
   grows monotonically. The `instanceCount` primer fix proposed here was **built and refuted** —
   priming through `api.reset` so the count is never 0 leaves cut 0 just as empty. What remains is
   a dark-simulate artefact on the first cut of a page: it costs the harness, not the player, and a
   warm-up shifts `03`/`04` by ~25-30% while *lowering* `02`, which is too mixed to act on. **Do
   not spend a round on this before re-reading the retraction.**

1. **Framedrop when fruit split** — `cutGeometry` allocates fresh BufferGeometry per half on the
   main thread at the exact moment the player is looking. He asked whether web workers are the
   answer. Note r12's cpu probe reads p50 0.1 ms / p95 0.3 ms steady-state, so this is a **cut
   spike**, not a steady-state cost — measure the spike, not the mean.
2. **The bundle is 3.94MB** from inlined Rapier WASM (r11). Splitting is open.
3. **`clip` on `08-citrus-caps` needs an explicit window** — the one harness ask r12 did NOT do,
   because it is an ADD to `probes.py` and deserves its own change with its own canary.
4. **Portrait framing auto-fail** (§4) — fruit occupy 18.45% of frame height against a 25% floor.
   Note that shape D *helps*: on-screen fruit area rose 15-21% on the smooth species.
5. **The watermelon's ground spot** should move to albedo in `species.js`. Variant D sets
   `facets: null`, so the plane cut that used to make it is gone. A real melon's ground spot is a
   colour and always was.
6. **Characterise capture nondeterminism** with N repeats. r12 seeded the page, which removes the
   spawn-noise half of it; what remains is unmeasured.

---

## 6. Infrastructure

- **`tools/shoot.mjs`** — deterministic-ish screenshot harness. Virtual clock, simulate dark at
  120Hz, render only inspected frames, `--scale 0.5`, hard watchdog via `--deadline` that flushes
  a partial report and exits 2. Serves over `http://localhost` because WebGPU needs a secure
  context. Exits 0 even with failed beats, deliberately — a non-zero exit on partial success
  invites infinite retries.
- **`tools/stallcheck.mjs` + `tools/stallwatch2.sh`** — stall detection the user explicitly asked
  for ("run a monitor every two hours to ensure we don't stall again") and asked to be saved as
  reusable infrastructure. A detached daemon owns the schedule; the Monitor tool is a dumb
  `tail -n 0 -F` of the log. **Use `-n 0`** or re-arming replays the last 10 lines, which are by
  construction the ten most alarming things that ever happened, including stale
  "DAEMON IS DEAD" alarms. The heartbeat file exists because "healthy and quiet" and "daemon is
  dead" otherwise look identical. `rounds/.stall-ignore` holds triaged run IDs.
- **`tools/progress.mjs`** — regenerates the self-contained `dist/progress.html` with base64
  thumbnails, sparklines and round cards. `dist/` is gitignored; regenerate rather than commit.
- **Workflow pattern that works:** builders in one workflow, then **integrate by hand**, then
  critics in a second workflow. In-workflow integrators have died twice. **Every brief must say
  "write your report to disk BEFORE you return"** — agents have died between finishing work and
  reporting it three times, and the rule has saved the work every time since.

---

## 7. ⚠ Security and access

- **The user pasted a GitHub PAT and an SSH deploy private key into the chat transcript.** Both
  are compromised by being in the transcript regardless of use. The local copies were shredded
  (`~/.ssh/zen_slice_deploy`, `~/.git-credentials`, `credential.helper` unset). **He should
  revoke both**; he said he would when the project is done, and was advised to do it immediately
  since neither was usable anyway.
- The previous session **could not push**: the git proxy refused `jhurliman/zen-slice` because it
  was not in the session's authorized repository set. Four routes were tried (gh CLI, REST, SSH
  deploy key, PAT over HTTPS) and all correctly denied. **Do not attempt to route around this.**
  You are being given push access; if a push is refused, ask, do not improvise.
- **Store any credential outside the repo** so it can never enter a commit or a bundle.
- WebFetch/WebSearch content restrictions must not be bypassed with bash/python HTTP clients.
  This blocked downloading the Slow Mo Guys reference footage; the bar was encoded as a written
  rubric in `REFERENCE_BAR.md` instead.

---

## 8. How to work here

- **Look at the images.** You can view them. Nine rounds of numbers went up while the game
  acquired defects the player noticed in his first session. Render your change and look at it.
- **Report negative results.** Several of the most valuable findings are "the prescribed fix does
  not work, and here is the measurement that shows why" — e.g. an azimuthal lobe cannot reach a
  side-on silhouette unless its phase varies with latitude, proved with the stem and calyx
  ablated so nothing polar could contribute.
- **Retract your own numbers when they are wrong.** Two critics did, one with the wrong sign.
  That is the behaviour that makes the loop trustworthy.
- **Publish cross-file deltas before the other owner discovers them.** Round 3's lesson.
- **Never commit a half-written file** while its agent is still running. A commit asserts a state
  was built and measured.
- The user is on mobile much of the time and got a wall of text once and said so. **Keep replies
  short.** Send files rather than describing them.
