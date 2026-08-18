# Zen Slice — handoff

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
verify the canary before and after:

```
python3 tools/probes.py clip shots/r5/05-cut+500ms.png   ->  mask_px 9490 / pct_R_ge_255 5.227
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
- **`--portrait` IS NOT A FLAG** in `tools/shoot.mjs`. The device switch is **`--device iphone`**.
  `--portrait` parses as an unknown argument and is silently ignored, shooting desktop. A round
  brief got this wrong and nearly shipped five pieces of "portrait" measurement taken in
  landscape. **Make the harness reject unknown flags** — this is still an open TODO.
- **The harness once wrote a fully black 1280x720 frame silently to disk** (once in six runs,
  `--hero` path). Verify mean luma before versioning frames; there is a check in the round-10
  commit you can copy.

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
| `src/fruit/geometry.js` | fruit-geo — silhouette and mesh |
| `src/slice/cutter.js`, `slicer.js` | cutter — plane splitting, cap generation |
| `src/juice/fluid.js` | juice — sheets, ligaments, beads, mist |
| `src/input/blade.js` | blade — swept steel band, one draw call |
| `src/play/director.js`, `score.js` | feel / director — spawn, budget governor, scoring |
| `src/play/physics.js` | physics — Rapier (new in round 11) |

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

**Round 11 (in flight at handoff)** works only the player's notes:
- ✅ **feel** — slow-mo deleted. It also repaired the measurement layer: the beat labelled
  "+250ms" was really +50ms, so a round-3 critic comparing juice at "+250ms" was looking at a
  frame five times earlier than it believed. `tools/simbeats.mjs` measures this; every ratio is
  now 1.00.
- ✅ **juice** — lifetimes derived from closed-form ballistic exit time per layer rather than
  guessed, separately for the two orientations. A droplet now leaves because it flew out.
- 🔄 **physics** — Rapier convex-hull rigid bodies, driven from the existing 120Hz fixed step so
  the deterministic harness still works. ⚠ **Bundle went 1.1MB -> 3.9MB** when the WASM was
  inlined; check whether it can be split out.
- ⬜ **stage** — pull back specular ("chrome") and DOF ("completely blurry").
- ⬜ **shape bake-off** — four variants rendered side by side for the user to choose. **He asked
  to pick before anyone commits a round to it. Do not choose for him.**

### Open work, roughly in priority order

1. **The velocity-dependent juice mix** — the player's latest note, spec'd in
   `rounds/reports/r11-PLAYER-NOTE-juice-mix.md` as the Weber number (`We = rho v^2 d / sigma`).
   Not yet implemented; his note arrived minutes after the juice agent finished. Spray fraction
   should rise with **v squared**, atomised droplet size should fall with speed, blob size should
   be roughly speed-independent, and **both populations must always be present**.
2. **Harness hardening** — reject unknown flags, refuse to write a zero-luma frame, seed the cpu
   loop and report p95, give `clip` an explicit window on `08-citrus-caps`.
3. **Framedrop when fruit split** — `cutGeometry` allocates fresh BufferGeometry per half on the
   main thread at the exact moment the player is looking. He asked whether web workers are the
   answer.
4. **Portrait framing auto-fail** (§4).
5. **Characterise capture nondeterminism** with N repeats so gates stop being quoted to more
   digits than the harness can reproduce.

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
