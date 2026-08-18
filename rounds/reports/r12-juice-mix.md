# r12 — the velocity-dependent juice mix, and the reason it never worked on his phone

**Files touched:** `src/juice/fluid.js`, `src/slice/slicer.js`, `src/fruit/geometry.js`,
`tools/shoot.mjs`, `tools/probes.py` (**comment only** — see §5).

---

## 0. THE HEADLINE, WHICH IS NOT THE LAW

The player asked for a spray/blob mix that follows blade speed. Building it turned up the reason
the old one felt wrong, and it was not the law's shape:

> **`slicer.js` computed `worldSpeed` with no aspect-ratio term. In portrait — the orientation he
> plays in — the identical gesture read 2.16x faster than in landscape, and the two orientations
> were 3.85x apart. Every ordinary swipe on his phone was already past the old law's saturation
> point, so `filmness` was 0, the sheet never fired, the rim beads sat on their 5% floor, and every
> cut he made was aerosol.**

That is "we should always show some combination of both with each hit", in one missing multiply.

**Measured on the live bus, not asserted** (`tools/.r12speed.mjs` subscribes to `bus.on('juice')`
and reads `stroke.speed` back out of the event the emitter actually receives):

| harness gesture | landscape `S` | portrait `S` | ratio |
|---|---|---|---|
| slow cleave, 1.2 ndc/s | 6.72 | 14.54 | **2.16x** |
| melon cut, 5.0 ndc/s | 28.01 | 60.60 | **2.16x** |
| fast flick, 14.0 ndc/s | 78.42 | 169.67 | **2.16x** |

`speedNdc` is `hypot(dx, dy)/dt` where x and y are **each** mapped to [-1,1] over the viewport, so
one ndc-x is a different number of world units from one ndc-y unless the aspect ratio is 1. The
line read `sw.speedNdc * dist * 0.55` — one magic factor, aspect absent. The correct horizontal
conversion is `dist * tan(fov/2) * aspect`, which is just the **visible half-width at that depth**:
6.933 landscape, 3.900 portrait. Portrait should read **0.56x** landscape for the same finger
movement, because the frame is narrower and the blade covers less world. It read 2.16x.

Downstream of `stroke.speed`, and all of it wrong in portrait by the same factor: `fluid.js`'s
whole morphology gate, `sep` (half separation, saturated at its 3.2 ceiling on every portrait cut),
the halves' lateral velocity, and `amount` (saturated at its 1.5 ceiling on every portrait cut).

---

## 1. WHAT THE OLD LAW ACTUALLY DID, IN THE UNIT HE SEES

The measurable is the player's own words, not a class name: he can see a blob, and a grain reads as
mist. `fluid.js` already draws that line, at `small` — the size-to-tint crossover, `0.030*szScale`
units — so a droplet counts as a **BLOB** if its physical radius is at or above `small` and as
**SPRAY** below it. Per droplet, not per class: the fat tail of the `spray` class is a blob and the
file's own `cls()` says so. Weighted by **projected area**, because that is what he is looking at.

`tools/.r12mix.mjs` reproduces `api.burst`'s count and size arithmetic verbatim, 24 seeds per row.
**Spray share of on-screen droplet area, watermelon, SHIPPED law:**

| swipe (ndc/s) | 0.8 | 1.5 | 2.5 | 4 | 6 | 8 | 11 | 14 | 20 |
|---|---|---|---|---|---|---|---|---|---|
| landscape | 10.6 | 10.3 | 10.4 | 13.2 | 22.5 | 35.5 | 63.3 | 89.4 | 89.4 |
| **PORTRAIT** | 10.7 | 10.1 | **19.4** | **42.6** | **82.8** | 89.8 | 88.3 | 90.0 | 89.3 |

**That is not a law, it is two presets with a cliff between them, and in portrait the cliff sits at
2.5–6 ndc/s — exactly where ordinary swipes live.** Above 6 ndc/s the portrait mix is ~90% spray
and never changes again, at any speed, forever.

---

## 2. THE LAW

`We = rho v^2 d / sigma` — disruptive inertial shear across a ligament over the surface tension
holding it together. Above a critical We a sheet atomises; below it, it stays coherent and pinches
into large blobs by Rayleigh–Plateau. The atomised **mass fraction** is the share of the ligament
size distribution above the critical diameter, and for a log-spread distribution that share is a
logistic in log(We):

```js
const we   = (S / V_CRIT) ** 2;
const fast = we / (1 + we);          // replaces cl((S - 18) / 62, 0, 1)
```

Two properties, both of them the point:

* **Near zero it is exactly `we`, and `we` goes as v SQUARED** — the note's "a 2x faster flick
  should look dramatically more atomised, not 2x more".
* **It never reaches 0 or 1 at any speed.** "Always some combination of both" is a property of the
  algebra, not a floor someone remembered to add.

**Range and endpoints are preserved on purpose.** `fast` is still a [0,1] number, ~0 for a cleave
and ~1 for a flick, so `filmness`, `mistness`, `nSpr`, `beadReach`, `mistReach` and all six
`aimWedge` spreads keep the calibration eight rounds put into them. **Only the shape of the
transition moved.** That is what makes this round attributable, and it is why the slow-cleave frame
is visually unchanged (§4).

### 2.1 A NEGATIVE RESULT: THE WEBER NUMBER DOES NOT FIX THE CROSSOVER, AND I AM NOT PRETENDING IT DOES

I tried to derive `V_CRIT` as a world speed. Using this file's own median rim-bead diameter
(`(0.017 + 0.123*u^4.4)*szScale`, median radius 0.0228 units, so d = 4.56 mm at 1 unit = 1 dm),
`We_crit = 12`, and this world's `sqrt(1/7)` velocity scaling for its 14 dm/s² gravity:

| density the instability sees | `V_CRIT` |
|---|---|
| `rho_air` = 1.2 | **47.5 units/s** |
| `rho_water` = 1000 | **1.7 units/s** |

A **29x spread**, turning entirely on a modelling choice, and another ~3x on whether `v` is the
blade's speed or the sheet's ejection speed (`B.spd` is ~110 units/s for a cleave *regardless of
blade speed*). **The Weber number fixes the SHAPE of this law exactly and its crossover only to an
order of magnitude.** Quoting 47.5 as derived would be the same error as deriving juice lifetimes
from a still photograph: a real quantity, stated to digits it does not have.

So the shape is physics and the crossover is stated in the unit the player's half of it has. A
fast swipe is a *gesture*, and a gesture's unit is screen-widths per second — the r10 `GRAIN_PX`
lesson exactly: state the threshold in the unit the intent has, and convert where the frame is
known. `frameAt()` knows it.

```js
const CROSS_NDC = 9.0;                    // 4.5 frame crossings/s: 50/50 at 0.22 s per crossing
frameAt(e.at.z);
const V_CRIT = CROSS_NDC * (FB.w / EXIT_MARGIN);
```

**⚠ This makes the mix orientation-invariant BY CONSTRUCTION, and that is a feel decision, not a
physical one.** A blade genuinely sweeps fewer world units in portrait, so strict physics would
leave portrait blobbier for the same gesture. Stated here rather than buried, because it is the one
place this law is not derived and the first thing to revisit if one orientation feels wrong.

### 2.2 THE RESULT

Spray share of on-screen droplet area, watermelon, **new law**:

| swipe (ndc/s) | 0.8 | 1.5 | 2.5 | 4 | 6 | 8 | 11 | 14 | 20 |
|---|---|---|---|---|---|---|---|---|---|
| landscape | 10.6 | 11.6 | 13.3 | 18.2 | 26.3 | 37.7 | 53.2 | 65.4 | **79.0** |
| **PORTRAIT** | 10.9 | 11.6 | 13.6 | 17.7 | 26.5 | 35.6 | 52.2 | 64.3 | **77.3** |

* smooth and accelerating from the origin, no cliff anywhere
* **the two orientations now agree to about one point**, where the shipped build had them 3.85x apart
* every ordinary swipe (≤ 6 ndc/s) is 74–89% **blobs** — "weighted more toward fluid blobs"
* a hard flick (20 ndc/s) is **~80% spray** — "more like 80% spray 20% blobs at a higher speed"
* neither population is ever zero

### 2.3 THE OTHER TWO CLAUSES OF HIS NOTE WERE ALREADY TRUE, AND I CHANGED NOTHING FOR THEM

The note also asks that atomised droplet size **fall** with speed and blob size stay
**speed-independent**. Both already hold, and both now vary smoothly instead of on the old ramp:

* **atomised size falls**: the spray class's `base = (0.0085 + 0.0135*filmness)*szScale`, so its
  characteristic radius runs 0.0214 → 0.0095 `szScale` from cleave to flick, a **2.25x fall**.
* **blob size is flat**: rim beads draw `(0.017 + 0.123*u^4.4)*szScale`, with no speed term at all.
* **mist size is deliberately NOT made finer.** It draws at 0.010–0.022 units, which is 0.3–0.8 px
  of radius at every raster this project ships; it is already under the vertex shader's 0.98 px
  sub-pixel floor and is grown-and-dimmed by `grow^-1.8`. Shrinking it 24% (the `(1+we)^-0.18` I
  tried) costs ~40% of its alpha per grain and makes a fast flick's aerosol **dimmer**, not finer.
  Conserving volume by raising the count instead needs 2.27x of a 1500-grain class, which is
  ~10,000 emitter iterations per cut against a 9,000-slot pool. **Not shipped, and the arithmetic
  is here so nobody re-proposes it without redoing it.**

---

## 3. WHAT IT LOOKS LIKE — `rounds/reports/r12-mix-portrait.png`

**Portrait, his framing, shipped on the left of each pair.** Same seed, same beat, same tree,
nothing between the two runs but `src/juice/fluid.js` and `src/slice/slicer.js`.

* **`04-cut+250ms`, the ordinary cut** — the headline. Shipped is a **grey dust cloud with a
  handful of red specks**; it reads as ash. r12 has red beads through the whole frame, red spatter
  on and around the fruit, and the white grain still there behind it. That single pair is the
  player's note.
* **`16-slow-cleave+50ms`** — **visually unchanged**, and that is the control working. `we -> 0`
  at the slow end, so the law is a no-op there by construction and the pink torn film with fingers
  that r7–r11 built is untouched.
* **`15-fast-flick+50ms`** — the silver aerosol cone is intact and now carries a thin film at the
  cut and a few juice-coloured beads. "Always some combination of both", at the end where there
  used to be none.

Frozen suite, both orientations, control vs r12 (`droplets`, mask / blobs / median area px):

| beat | landscape ctrl | landscape r12 | portrait ctrl | portrait r12 |
|---|---|---|---|---|
| `04-cut+250ms` | 7376 / 95 / 25.5 | 6677 / 80 / 23.0 | 6454 / 21 / 17.0 | **2860 / 40 / 20.0** |
| `05-cut+500ms` | 8888 / 88 / 25.0 | 6470 / 100 / 23.5 | 8059 / 29 / 18.0 | **8198 / 44 / 20.0** |
| `15-fast-flick+50ms` | 2825 / 3 / 14.0 | 3083 / **10** / 14.0 | 1879 / 6 / 17.0 | 1340 / 5 / 16.0 |
| `16-slow-cleave+50ms` | 62 / 1 / 17.0 | 72 / 2 / 24.5 | 38 / 0 | 14 / 0 |

**Portrait blob count nearly doubles on both melon beats (21 → 40, 29 → 44) and median blob area
rises (17 → 20, 18 → 20)** — fewer sub-resolution grains, more resolvable beads, which is the
change stated in pixels. Landscape moves the other way by a little (95 → 80 blobs) and that is
expected and declared: the aspect fix makes landscape strokes **1.24x faster**, so landscape gets
slightly sprayier while portrait gets very much blobbier. Landscape is not the shipping
orientation; portrait and desktop now agree, which they never did.

---

## 4. ⚠ A DEFECT I FOUND, DID NOT CAUSE, AND COULD NOT FIX — THE FIRST SLICE OF A SESSION HAS NO JUICE

> ## ⛔ RETRACTED, 2026-08-18, BY ITS OWN AUTHOR. READ `r13-retraction.md`.
>
> **The measurement below is real and reproduces. The conclusion drawn from it —
> that this is player-visible — is WRONG, and I drew it without running the one
> experiment that discriminates.** A player renders every frame; `ZS.advance()`
> simulates dark and renders only the last one. Rendering every frame from the
> instant of the first cut shows juice on the very next frame and growing
> steadily after it (123 px / 2 blobs at +8 ms, 2797 px / 40 blobs at +117 ms).
> Same page, same cut, one variable:
>
> | | dark-advance (harness) | render every frame (player) |
> |---|---|---|
> | **first** cut of the page | **0 blobs** | **86 blobs** |
> | second cut of the page | 101 blobs | 82 blobs |
>
> So it is a **harness-path artefact on a cold page**, not a defect in the game,
> and the section below overstates it. §8's own warning — "a bit-exact capture of
> a probe that rewards deleting an appendage still rewards deleting an
> appendage" — applies to me: I had a reproducible measurement and I reported
> what I assumed it meant. The rest of this section stands as the record of the
> measurement; the headline does not.



**This is the most important thing in this report after §0, and it should be the next round's
first item.**

`node tools/.r12first.mjs` — three **identical** cuts, one page, one build, seeded RNG, nothing
between them:

| cut | fruit y before the cut | droplet `instanceCount` | what renders |
|---|---|---|---|
| 0 | 0.166 | **1850** | the two halves and **not one droplet** |
| 1 | 0.166 | 1829 | the full splash |
| 2 | 0.169 | 1829 | the full splash |

**The droplets are emitted and uploaded in all three** — the pool says so. They are not drawn.
Rendering the identical state a second frame brings the **sheet** in and still no droplets, so it
is not one frame of latency. It reproduces on the control build, so it is not this round's.

**A fix I tried and REVERTED because it does not work**, recorded rather than deleted: the droplet
mesh is skipped while `instanceCount` is 0, so I primed the pool at `api.init` with one dead
droplet (`birth = -1e6`, the file's own sentinel) to force the draw call from frame one and build
the pipeline during the loading screen. Cut 0 was still empty. The `ZS.clear()` at the top of every
staging calls `api.reset()`, which sets `drops.head = 0` and therefore `instanceCount = 0` again —
so the primer cannot survive to the first cut in the harness, and the hypothesis is untested rather
than disproved. Whoever picks this up: test it with the primer re-emitted **after** reset.

**Two consequences that matter now:**

1. **It is player-visible.** The first slice of a session shows no juice, in the exact system he
   filed a note about.
2. **`00-hero.png` has never been a controlled measurement.** The same build and beat gave me
   630 px / 6 blobs from `shoot.mjs` and **57,347 px / 219 blobs** from a bench that stages it
   identically. The hero is captured last, after 17 beats, a viewport resize, and 1,200 probe
   steps, and it is downstream of this defect. Every hero frame this project has published is
   uncontrolled. **Do not grade on the hero.** The review-raster beats are shot in a fixed order
   and ARE controlled; grade on those.

---

## 5. THE FROZEN SUITE, AND A CANARY THAT COULD NOT BE RUN

`tools/probes.py` is **comment-only** this round. `PROBE_VERSION` stays **16**, deliberately: no
executable line changed, so nothing measurable moved. Verified rather than asserted — the file's
non-comment lines are byte-identical before and after, and `clip` and `droplets` return
byte-identical JSON on three frames across the edit.

**Why it was touched at all.** Every report since r5 pastes this as proof the suite was untouched:

```
clip shots/r5/05-cut+500ms.png  ->  mask_px 9490 / pct_R_ge_255 5.227
```

**`shots/r5/` is in `.gitignore` and is not in the tree, and has not been for six rounds.** The
canary has been quoted from earlier reports rather than re-run — the exact failure this project's
rules exist to prevent, in the instrument whose job is to prevent it. Two replacements, on frames
that are versioned and will stay, and you should run **both**:

```
clip shots/r10/05-cut+500ms.png  ->  mask_px 10340 / pct_R_ge_255 4.333
clip shots/r9/05-cut+500ms.png   ->  mask_px 10057 / pct_R_ge_255 2.197
```

---

## 6. CROSS-FILE DELTAS, PUBLISHED BEFORE ANYONE ELSE FINDS THEM

`slicer.js`'s `worldSpeed` feeds four things besides the juice. All four were wrong in portrait by
the same 3.11x and are now correct; all four move, and none of them is mine to tune:

| consumer | expression | what changed |
|---|---|---|
| half separation | `clamp(0.7 + S*0.045, 0.8, 3.2)` | was **saturated at its 3.2 ceiling on every portrait cut**; now varies |
| half lateral velocity | `stroke.dir * S*0.06` | portrait 3.11x lower, landscape 1.24x higher |
| juice `amount` | `clamp(0.55 + S*0.03, 0.6, 1.5)` | was **saturated at its 1.5 ceiling on every portrait cut**; now varies |
| `B.lean`, `aimWedge`, `nCling`'s `sep` | various in `fluid.js` | follow `S` and `fast` |

**Landscape harness beats all shift by 1.24x** (melon 27.9 → 34.7, flick 78.2 → 97.1, slow cleave
6.7 → 8.3). Every landscape number in r0–r11 was taken at the old speeds. They are not comparable.

`src/fruit/geometry.js` also changed this round, and only in its default: **the player picked
column D** from the r11 bake-off, so `SHAPE_DEFAULT` is `'D'`. A/T/B/C are kept and `?shape=A`
still reproduces r10's mesh bit for bit.

---

## 7. THE HARNESS, WHICH DID NOT RUN AT ALL WHEN I INHERITED IT

`tools/shoot.mjs` could not produce a single frame on this machine. Two causes, both now fixed and
both worth stating because they were silent:

* **Playwright's default executable is `chromium_headless_shell`, which has no `navigator.gpu`** —
  `!!navigator.gpu` is false there even with `--enable-unsafe-webgpu`. The file's hard-coded
  `/opt/pw-browsers` list did not exist, so `executablePath` was `undefined` and the launch fell
  through to that default. It now globs for a **full** `chromium-*` build and refuses to start
  without one.
* **`--use-gl=angle --use-angle=swiftshader`, passed since round 0, CRASHES the renderer process in
  Chromium 151** on the first `requestAdapter()`. The page dies, `page.evaluate` hangs, and the run
  looks like a boot failure with no error on any channel. Measured, same build, same scene:
  `headless_shell + angle=swiftshader` **boot timed out at 300 s**; full Chromium, no angle flags,
  **boot 1.98 s**. Both flags are gone; `--enable-unsafe-swiftshader` stays, because that is what
  permits the software WebGL2 path this harness actually captures through.

Then the four hardening asks that four reports had filed and nobody had landed:

* **H1 — unknown flags are fatal.** `--portrait` IS NOT A FLAG; it parsed as an unknown argument,
  was silently ignored, and shot **desktop**. Now `exit 3` with the correct switch named.
* **H2 — a zero-luma frame is never written.** Every frame is luma-checked before it reaches the
  disk, retried once, then recorded as a failed beat. Floor 0.35/255 over the whole frame, low
  enough that legitimately dark beats (`01`, `12`) pass. A missing file is a visible problem; a
  black file is an invisible one a critic will happily measure.
* **H3 — the page's `Math.random` is seeded** (asked four times). Covers this file's own probes,
  `slicer.js`'s per-half spin and `blade.js`'s streak phase. `fluid.js` was already seeded
  internally, which is precisely why the juice numbers were the steadiest thing in every report.
  ⚠ Every run after r12 is comparable to other r12+ runs and **not** to r0–r11's.
* **H4 — the CPU probe repeats and `max` is not a headline.** Default 3 runs, reporting the median
  and full spread of the per-run p50/p95, with `max` filed under `max_do_not_quote`. First run on
  the new harness, one build: **p50 0.1 ms (0.1–0.1), p95 0.3 ms (0.2–0.4), max 0.5 / 0.6 / 1.0** —
  the spread on `max` is 2x on identical code, which is the whole argument.

**Still open, and not done this round:** `clip` on `08-citrus-caps` still fits its ellipse from the
frame's own second moments and needs an explicit window. That is an ADD to `probes.py`, not an
edit, and it deserves its own change with its own canary rather than being smuggled in here.
