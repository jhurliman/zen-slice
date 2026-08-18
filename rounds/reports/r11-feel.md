# r11 — feel. Slow-motion is deleted, and the harness clock now tells the truth.

Owner: `src/play/score.js`, `src/play/director.js`. Added: `tools/simbeats.mjs` (a new
probe; nothing existing was modified).

Human note 3, first half: *"it slows down every time i slice, is there an intentional
slo-mo effect? if so get rid of it, it's distracting."* There was. It is gone.

---

## 1. THE SENTENCE EVERY OTHER PIECE NEEDS: THE BEAT LABELS NOW MEAN WHAT THEY SAY

`fluid.js` note (h) derived by hand that the harness beat labelled "+50 ms" was really
17-25 ms of sim time and "+250 ms" was 92 ms, because `score.js` emitted `slowmo` on every
cut and `main.js` feeds its fixed-step accumulator `dt * ctx.timeScale`. I measured it
instead of deriving it, with a new dark-run probe:

    node tools/simbeats.mjs --device desktop

Sim milliseconds actually elapsed per beat of the shipped `tools/shoot.mjs` beat sheet.
Properly paired: identical tree, only `score.js` differing between the two columns.

| beat                    | wall label | BEFORE (slow-mo) | AFTER  |
|-------------------------|-----------:|-----------------:|-------:|
| 02-cut+33ms             |      33 ms |          16.7 ms |  33.3 ms |
| 03-cut+100ms            |     100 ms |          41.7 ms | 100.0 ms |
| 04-cut+250ms            |     250 ms |          91.7 ms | 250.0 ms |
| 05-cut+500ms            |     500 ms |         241.7 ms | 500.0 ms |
| 06-cut+1000ms           |    1000 ms |         716.7 ms | 1000.0 ms |
| 07-citrus-cut (+120ms)  |     120 ms |          50.0 ms | 116.7 ms |
| 08-citrus-caps (+470ms) |     470 ms |         158.3 ms | 466.7 ms |
| 09-combo+50ms           |      50 ms |          25.0 ms |  50.0 ms |
| 10-combo+200ms          |     200 ms |          75.0 ms | 200.0 ms |
| 11-combo+550ms          |     550 ms |         283.3 ms | 550.0 ms |
| 15-fast-flick+50ms      |      50 ms |          25.0 ms |  50.0 ms |
| 16-slow-cleave+50ms     |      50 ms |          16.7 ms |  50.0 ms |

**Every beat is now exact.** Ratio sim/real is 1.000 everywhere, at every level, at every
cut rate I tested.

Two consequences nobody has written down before:

1. **The R1b fast-vs-slow comparison was never a controlled comparison.** `15-fast-flick`
   was sampled at 25.0 ms of sim time and `16-slow-cleave` at 16.7 ms — a 1.5x difference
   in sample instant between the two frames whose *morphological difference* is the whole
   point of the test. Worse, the settle beats before them differed too: "fast settle"
   200 ms wall = 141.7 ms sim, "slow settle" 200 ms wall = 75.0 ms sim, so the two fruits
   were not even at the same height or velocity when they were cut. Both are now exactly
   200 ms and 50 ms. Any round that concluded "the fast flick does not atomise enough"
   was reading a 1.5x-skewed pair.
2. **`fluid.js` lifetimes are now sampled 2.0-2.4x later in sim time than they were tuned
   for.** They were authored against the lying clock (RULE 2 block, `fluid.js:1729`). That
   is one mechanical reason the human sees juice "disappear way too quickly": at the
   +250 ms beat the fluid has now had 250 ms to live and die, not 92 ms. `fluid.js`
   RULE 2 and note (h) are obsolete as of this change and should be rewritten, not
   re-derived.

---

## 2. WHAT I CHANGED

**`src/play/score.js`** — the `slowmo` emit and its combo-scaled depth/duration
computation are deleted outright, not neutered. `clamp` is no longer imported. The file
now carries the whole story in its header comment, including the table above, so nobody
re-adds it as a "combo reward" in round 14.

The combo reward is now purely visual/audible:
- Score multiplier `0.35 → 0.50` per combo step. A 3-chain of watermelons paid
  24 + 32 + 41 = 97 and now pays 24 + 36 + 48 = 108. That +11% lands on the HUD score pop
  (`hud.js` eases the displayed total at 9/s), which is the number a player watches move.
- The `'combo'` event payload is widened to `{count, at, mult, gain, peak}`. `count` and
  `at` are unchanged so `hud.js` keeps working untouched; `mult`, `gain` and `peak`
  (true only on a cut that sets a new session-best combo) are there so `hud.js`,
  `blade.js` and `audio.js` can scale a response without reaching into `ctx.score`.
- No screen shake. The founding spec says "relaxing, meditative".

**`src/play/director.js`** — comment only, no behaviour change. The block justifying
budget enforcement in the `frame` phase argued from slow-mo ("five or six consecutive
ticks run no fixed step at all"). That mechanism is gone, so I rewrote the justification
to the residual one that is permanent and was always the real argument: `SIM_DT` is
1/120 s, a 60 Hz display ticks at 1/60 s, `acc` is chronically out of phase with the
render, and `MAX_SUBSTEPS` 4 dumps the accumulator on a stall. The hook stays.

**`tools/simbeats.mjs`** — new probe. Renders nothing, runs in ~15 s under SwiftShader,
replays the exact `shoot.mjs` beat sheet plus four play-cadence sessions.

`node build.mjs` is clean. Both orientations shot with zero page errors and zero failed
beats.

---

## 3. PERF — WHAT IS REAL AND WHAT IS A HARNESS ARTIFACT

The headline looks great and **most of it is not a rendering win. Do not bank it.**

`shoot.mjs` complexity probe, peak draw calls / peak triangles / live bodies:

| run | before | after |
|---|---|---|
| desktop, vs r10 baseline | 71 / 143,863 / 51 | 49 / 110,021 / 25 |
| desktop, isolated CTRL vs TEST | 99 / 184,941 / 51 | 59 / 125,183 / 30 |
| portrait (iphone), vs r10 baseline | 115 / 162,751 / 51 | 69 / 116,457 / 34 |

Portrait is now 69 draw calls against the 120 ceiling and 116k triangles against 250k.

**Why this is mostly an artifact:** the complexity probe spawns a fruit every 10 *ticks*
and swipes every 8 *ticks*, but the world advances on the *sim* clock. With slow-mo live
it was injecting up to 3x more spawns and cuts per sim second than the probe's author
intended, so the population it measured was roughly double what the same wall-clock play
produces. Rounds 4-10 were checking the perf ceilings against a scene about twice as
heavy as real play. Round 10's "portrait 115 draw calls" was a worst case reality does
not reach.

**Realistic-play population is unchanged.** `simbeats.mjs` cadence probe, 24 real seconds,
level 5 ("Deep Calm"), a cut every 0.5 real seconds:

| | BEFORE | AFTER |
|---|---|---|
| mean live bodies | 5.8 | 5.7 |
| peak live bodies | 10 | 10 |
| mean draw calls (13 + 2n) | 24.7 | 24.4 |

**The real per-frame effect is different, and it is exactly what the human felt.** I
histogrammed `stats.steps` — how many fixed steps each tick ran — over the same sessions:

| session | ticks running ZERO fixed steps, BEFORE | AFTER |
|---|---:|---:|
| level 0, cut every 2.5 s | 4.8% | 0.0% |
| level 0, cut every 1.2 s | 5.9% | 0.0% |
| level 5, cut every 1.2 s | 7.2% | 0.0% |
| level 5, cut every 0.5 s | **15.7%** | **0.0%** |

Up to one rendered frame in six advanced the world by nothing at all, and they clustered
immediately after every cut. **Negative result worth recording: no tick ever ran 2 or
more fixed steps in either build**, so there was no catch-up burst and no frame-time
spike — the defect was *judder*, not a hitch. "It slows down every time i slice" is a
literally accurate description of a game that stopped simulating on 16% of its frames
right after you sliced. CPU/frame is unchanged within noise (desktop median 0 ms,
p95 0.2 ms; portrait median 0.1 ms, p95 0.9 ms).

Note 3's *second* half — framedrop when fruits split apart — is not addressed by this
change and belongs to the perf/pieces owners. What I can hand them: the population data
above says the split itself is not adding bodies beyond budget in real play, so the cost
is per-body work or the burst of juice at the cut instant, not body count.

---

## 4. THE FROZEN SUITE, AS A CONTROL

Canary before and after, unchanged and exact:

    python3 tools/probes.py clip shots/r5/05-cut+500ms.png
    mask_px 9490   pct_R_ge_255 5.227

Black floor intact — `void`, `01-whole-watermelon.png`, isolated CTRL vs TEST:
corners `2.90/2.90/2.97/2.94` → `2.90/2.86/2.86/2.81`, `median_luma` 3.0 → 3.0,
`pct_exact_black` 0.0 → 0.0. Nothing broke.

**A probe score fell and it is correct that it fell.** `clip` on `05-cut+500ms.png`,
isolated CTRL vs TEST: `mask_px` 15,520 → 2,039, `pct_R_ge_255` 2.339 → 0.0. That frame is
now a genuine 500 ms instead of 242 ms. I looked at it: the halves have separated far
enough that one is leaving the frame and the juice is a wide outward-travelling spray of
discrete droplets — which is what note 1 asks for ("sprays off the screen"). A juice-mask
area probe on a beat that is now twice as late measures dispersal, not disappearance. Do
not chase it back up.

**`11-combo+550ms.png` has become nearly empty.** I viewed it: at a true 550 ms the melon,
pineapple, strawberry and apple have all left frame and one orange half is left mid-screen.
It is now an honest frame and a much less informative one — and the `defocus` probe reads
it. Recommendation for whoever owns the beat sheet (not me): consider moving that beat to
+250 ms. Do not change it silently.

I also diffed the whole frozen suite r10 → r11 desktop (403 scalars moved), but **that
comparison is worthless this round** — `fluid.js` was reworked by a concurrent agent in
the same worktree while I was shooting, and its md5 changed between my CTRL and TEST runs.
The `simbeats` before/after in section 1 and the step histogram in section 3 are the
numbers here that are properly isolated; treat the pixel deltas as directional only.

---

## 5. JUDGED BY EYE

- **`shots/r11-feel-CTRL/00-hero.png` vs `shots/r11-feel-TEST/00-hero.png`.** Same cut,
  same `advance(0.25)`. In CTRL the two halves have barely parted and still read as one
  melon with a line through it. In TEST the top cap is fully clear of the bottom and you
  can see through the gap. That single pair is the clock fix, visible, in one image.
- **The blade streak is visibly thinner and warmer in TEST**, where CTRL's is a thick
  white-hot blown bar. See the request to `stage.js` below — I believe this is mine and it
  is the one place my change made something look *worse* than round 10 intended.
- **`shots/r11-feel/09-combo+50ms.png`** now reads as an instant of impact: the pineapple
  is coming apart, the blade is mid-frame, the other four fruits are still whole. Before,
  the same file was a 25 ms frame that looked like a held pose.
- The game no longer stutters when you cut. That is the entire point and it is not
  something a probe can tell you.

---

## 6. CADENCE — MEASURED, AND DELIBERATELY NOT RETUNED

`director.js` counts `nextSpawn` down in sim seconds, so removing slow-mo makes fruit
arrive faster in *real* time. Measured (`simbeats` cadence probe, spawns per real minute):

| session | BEFORE | AFTER |
|---|---:|---:|
| level 0, cut every 2.5 s | 25.0 | 27.5 |
| level 0, cut every 1.2 s | 25.0 | 27.5 |
| level 5, cut every 1.2 s | 90.0 | 97.5 |
| level 5, cut every 0.5 s | 80.0 | 97.5 |

That is +10% to +22%. At level 0 it means a fruit every 2.2 s instead of every 2.4 s,
which is inside the existing per-level jitter (`every: [1.9, 2.6]`). **I am not retuning
`LEVELS`.** If the human plays it and it feels rushed, the fix is one line — multiply every
`every[]` pair by 1.10 — and it should be made on his word, not on my guess.

`COMBO_WINDOW` stays at 0.55 real seconds, also deliberately, and this one is closer to a
coin flip. Slow-mo never touched the window (it was always real seconds) but it changed
how far the world drifts inside it: **0.29 s of sim drift before, 0.55 s after**, so a
stroke-to-stroke chain is ~1.9x harder now. I did not widen it because (a) the chain that
matters is one arc through two fruits, which resolves in milliseconds, and (b) the direct
evidence disagrees with itself — mean combo at each swipe, level 5: every 1.2 s went
1.60 → 2.25, every 0.5 s went 1.73 → 1.43, on unpaired cut counts. That is not evidence.
It needs a human with a thumb. Both numbers and the reasoning are written into
`score.js` so the next owner can overturn it cheaply.

---

## 7. REQUESTS FOR OTHER OWNERS (I did not touch these files)

Nothing below is required for correctness — with the emit gone, every one of these is
already a no-op. They are cleanup and one look regression.

1. **`src/main.js` — remove the plumbing.** Delete the `bus.on('slowmo', …)` block and
   `slowUntil`/`slowTarget` (~L193-198), and in `tick()` delete the `target` /
   `ctx.timeScale = damp(...)` lines (~L256-258), leaving `ctx.timeScale = 1` set once at
   construction (keep the field — `contract.js` publishes it). Change
   `acc = Math.max(0, acc + dt * ctx.timeScale)` to `acc = Math.max(0, acc + dt)`.
   Removes the last path that can silently reintroduce a time scale.

2. **`src/main.js` — a real harness bug I found on the way.** `ZS.swipe` stamps
   `t: performance.now() / 1000`, but `blade.js` stamps `t: nowSec()`. Under `ZS.step()`
   `nowSec()` is the *virtual* clock, so `score.js` compares a real-clock stroke time
   (`e.stroke.t`) against a virtual-clock frame time in `api.frame`. Harness combo
   behaviour therefore does not match real play. One-word fix: `ZS.swipe` should use
   `nowSec()`. This is why my cadence probe's combo numbers are not trustworthy (section 6).

3. **`src/render/stage.js` — ⚠ THE ONE THING MY CHANGE MADE LOOK WORSE.** Line 2852,
   `const fdt = dt * (0.35 + 0.65 * ctx.timeScale)`, is now exactly `dt`. Measured
   `ctx.timeScale` at the +250 ms hero instant was **0.34**, so that factor was 0.571
   through the whole post-cut window the flare was tuned in — the flare now decays
   **1.75x faster**. By the hero instant `flare.i` loses 2.6 × 0.25 = 0.65 instead of
   0.371, and the falloff is quadratic, so flare energy at that instant drops roughly
   3.3x (0.63² = 0.40 → 0.35² = 0.12). My CTRL/TEST hero pair shows exactly that: a streak
   core that no longer blows out. If round 10's bleached core (`core_sat` 0.434 → 0.017)
   is to be preserved, the `2.6` and `9.0` coefficients want multiplying by ~0.57
   (→ ~1.5 and ~5.1) — but please re-measure rather than take my arithmetic, because my
   pixel evidence is confounded by the concurrent `fluid.js` rework.
   Also at line 2756, `slow = 1 - min(1, (ctx.timeScale - 0.15) / 0.85)` is now always 0,
   so `U.slow` settles to 0 and the slow-mo grade term at line 1167
   (`c.assign(mix(c, …, U.slow))`) is an identity mix on every pixel of every frame.
   Removing the uniform and that line is a free per-pixel saving in the tone-map path.

4. **`src/audio/audio.js`** — the `bus.on('slowmo', …)` lowpass-sweep subscriber
   (L65-72) is now dead; remove it and the mention in the file header. If you want the
   audible half of the combo reward back, subscribe to `'combo'` instead: the payload now
   carries `count`, `mult`, `gain` and `peak`. Something gentle — a brief pad swell, or a
   single soft shimmer on `peak` only. The pentatonic chime already climbs with
   `ctx.score.combo` and still works, so this is optional, not a hole.

5. **`src/juice/fluid.js`** — RULE 2 (L1729-1737) and note (h) (L67-76) are obsolete.
   Rewrite them against the table in section 1 rather than re-deriving a correction
   factor. Every lifetime, birth delay and drag constant in the file is now being sampled
   2.0-2.4x later in sim time than it was authored for.

6. **`src/core/contract.js`** — drop `'slowmo'` from the event vocabulary (L229) and
   update the two-clocks note (L52-53): `sdt` is still `SIM_DT` but `timeScale` is pinned
   at 1 and nothing scales it.

7. **`src/ui/hud.js`** (optional) — the combo callout could scale with `e.count` or flash
   on `e.peak`. Currently every combo renders identically.

---

## FILES

- `/home/claude/juice/src/play/score.js` — slow-mo deleted; combo reward is score + event payload
- `/home/claude/juice/src/play/director.js` — comment correction only
- `/home/claude/juice/tools/simbeats.mjs` — new probe (added, nothing modified)
- `/home/claude/juice/rounds/r11-simbeats-before-desktop.json`
- `/home/claude/juice/rounds/r11-simbeats-after-desktop.json`
- `/home/claude/juice/shots/r11-feel/` — desktop, delivered build
- `/home/claude/juice/shots/r11-feel-iphone/` — portrait, delivered build
- `/home/claude/juice/shots/r11-feel-CTRL/` — same tree, slow-mo still in (isolation pair)
- `/home/claude/juice/shots/r11-feel-TEST/` — same tree, slow-mo removed (isolation pair)
