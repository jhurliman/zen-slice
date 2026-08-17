# r10 — perf. The frame budget on the configuration that ships.

Key: `perf` (new piece). Files I own and changed: **`src/core/contract.js`** (one new
additive `BUDGET` block; no existing constant touched) and **`src/play/director.js`**.
No material, no shader, no silhouette, no colour, no new draw call, no new program.

## Canary (rule 1)

```
python3 tools/probes.py clip shots/r5/05-cut+500ms.png
-> mask_px 9490,  pct_R_ge_255 5.227     (probe_version 13)
```
Verified before my first edit, after every edit, and again after another agent bumped
`PROBE_VERSION` 12 -> 13 underneath me mid-round. **I added no probe and modified no
probe. `tools/probes.py` is byte-untouched by me.** Every number below comes from the
frozen suite, from `tools/shoot.mjs`, or from `renderer.info` read inside the page.

## THE ONE CLAIM I PROVED

**Portrait is inside every R4 ceiling, and the mechanism was not a cost — it was an
unbounded population.** Draw calls in this game are exactly `13 + 2 x liveBodies`; the
only cap that existed (`quality.maxFruit`) counts *generation-0 fruit only*, and every
cut turns one body into two, so the quantity that sets the draw-call count had no upper
bound at all. Portrait hit it first because a stroke is authored in NDC and portrait's
camera sits 2.17x further back, so one swipe sweeps 2.17x more playfield and cuts far
more fruit per stroke.

### Before / after, both orientations, `tools/shoot.mjs --scale 0.5 --deadline 600`

| | draw calls | triangles | JS median | JS p95 | JS max | liveBodies |
|---|---|---|---|---|---|---|
| **LANDSCAPE 1280x720 tier 3** | | | | | | |
| r9 as published (`rounds/r9.json`) | 111 | 199,753 | 0.1 | 0.5 | 2.5 | 46 |
| r9 code, re-shot today `shots/r10-perf-base` | **121** | 217,157 | 0.0 | 0.7 | 6.6 | 54 |
| r9 code, isolated tree `/tmp/iso/shots/A` | **133** | 239,017 | 0.0 | 0.2 | 3.8 | 60 |
| **r10 shipped `shots/r10-perf`** | **83** | **153,273** | 0.0 | 0.5 | 6.2 | 50 |
| r10, isolated tree `/tmp/iso/shots/C` | **73** | **145,065** | 0.0 | 0.6 | 17.0 | 51 |
| **PORTRAIT 430x932 tier 2** | | | | | | |
| r9 as published (`rounds/r9.json`) | 187 | 266,879 | 0.1 | 0.8 | 7.6 | 87 |
| r9 code, re-shot today `shots/r10-perf-base-iphone` | **205** | 289,087 | 0.1 | 0.4 | 3.8 | 96 |
| r9 code, isolated tree `/tmp/iso/shots/A-iphone` | **169** | 229,003 | 0.1 | 0.8 | 16.7 | 78 |
| **r10 shipped `shots/r10-perf-iphone`** | **115** | **160,435** | 0.1 | 1.2 | 12.1 | 51 |
| r10, isolated tree `/tmp/iso/shots/C-iphone` | **115** | **160,299** | 0.0 | 0.4 | 2.8 | 51 |

Four further r10 runs taken while converging (governor identical, plus a retirement
rule I later removed — see below): landscape 105 / 184,671 and 99 / 181,601; portrait
113 / 163,839 and 115 / 164,117. **Across eight post-fix runs the worst draw-call count
is 115 portrait and 105 landscape, and the worst triangle count is 184,671.** Ceilings
are 120 and 250,000. `liveBodies` is pinned at 50-51 in every single run, which is the
governor's cap of 51 doing exactly what it says.

R4 also asks for <=40 shader programs: `programs` is 0 in every report (the node
renderer does not populate it) and I added none — no material, no `onBeforeCompile`,
no `EffectComposer`, nothing that could compile a pipeline.

### JS frame time — I must refuse the `max` column, and here is why

My acceptance said "under 2.5 ms worst JS frame". **I cannot meet that target and
neither could r9, because the statistic does not exist.** `shoot.mjs`'s `cpu.max` is the
single worst of 400 samples from an unseeded loop, and it swings by 8.5x between two
back-to-back runs of one build on one machine: **1.8 ms and 15.3 ms**, `shots/r10-perf`
and `shots/r10-perf-rep`, same dist, minutes apart. The r9 headline "7.6 ms portrait
against landscape's 2.5" is two draws from that distribution; re-shooting r9's own code
today gave 6.6 landscape / 3.8 portrait, i.e. the sign reversed.

Attributed with a labelled rig (`tools/.r10cpu.mjs`), the spike lands on steps where
**nothing happens** — no spawn, no cut (landscape i=363 48.2 ms, portrait i=344
45.6 ms). A plain integration step over 50 bodies cannot cost 45 ms of our JS; that is
GC/JIT, not the game.

The statistics that *are* stable, and the ones I stand behind:

| | median | p95 |
|---|---|---|
| landscape, r9 code (3 runs) | 0.0 – 0.1 | 0.2 – 0.7 |
| landscape, r10 (5 runs) | 0.0 | 0.2 – 1.4 |
| portrait, r9 code (3 runs) | 0.1 | 0.4 – 0.8 |
| portrait, r10 (4 runs) | 0.0 – 0.1 | 0.2 – 1.2 |

R4's bar is 2.0 ms. **p95 is under it in every run in both orientations, before and
after.** I also removed the one real per-step allocation I found in my file (the
`api.live.filter(...)` census, a throwaway array 120x/second) and made the budget check
O(1) on an incrementally maintained triangle total, so the governor adds no allocation
and no per-step scan when it is not firing.

## THE MECHANISM — measured, not inferred

`tools/.r10perf.mjs` (scratch rig, seeded LCG, both viewports, same page code):

| | landscape 640x360 tier 3 | portrait 215x466 tier 2 |
|---|---|---|
| camera aspect | 1.7778 | 0.4614 |
| camera z (from `resize()`) | 10.160 | **22.021** |
| world half-height at z=0 | 3.900 | **8.453** |
| world half-width at z=0 | 6.933 | 3.900 |
| draw calls, EMPTY scene | 13 | 13 |
| triangles, EMPTY scene | 53,391 | 53,391 |
| draw calls per live body | 2 | 2 |
| watermelon triangles | 3,636 | **2,302** |
| bodies at end of the load loop | 57 (gen0 41 / gen1 4 / gen2 12) | **105** (22 / 13 / **70**) |
| peak draw calls | 127 | 223 |
| peak triangles | 220,969 | 294,983 |

Read the two rows that matter together. **A portrait body is CHEAPER than a landscape
one** — tier 2, 2,302 triangles against tier 3's 3,636 — so the LOD/tier selector is
*not* the bug, and the round brief's prime suspect ("portrait's narrower raster may be
selecting a higher tier") is **wrong**; I checked it first and it points the other way.
Portrait's 1.5x triangles and 1.8x draw calls are 84% more *bodies*, and the generation
histogram says where they come from: landscape accumulates 16 fragments against
portrait's **83**.

The cause is `main.js: resize()`, which CONTAIN-fits `STAGE.halfExtent` on whichever
axis is short: `camera.position.z = max(halfExtent/tan(vfov), halfExtent/(tan(vfov)*aspect))`.
At aspect 0.461 the second term wins and the camera retreats to z=22.02, so the visible
world is 8.45 units tall instead of 3.90. `ZS.swipe` and a real thumb are both authored
in NDC, so **one stroke sweeps 2.17x more playfield in portrait, cuts ~2x the fruit, and
each cut is +1 body permanently**. This is the same disease as the pixel thresholds this
project keeps shipping — a quantity expressed in one frame of reference and consumed in
another — and it is why nine rounds of landscape-only perf never saw it.

## WHAT I CHANGED

1. **`contract.js`: a new `BUDGET` block.** The R4 ceilings expressed as something the
   director can enforce, with the fixed cost (13 calls / 53,400 tris) and the marginal
   cost (2 calls per body) as *measured* constants, not guesses. Purely additive.
2. **`director.js`: the scene budget governor.** Every fixed step and every frame,
   compute `13 + 4(reserve) + 2*bodies` and `53,400 + 15,000(reserve) + liveTris`; if
   either is over its R4 ceiling, retire bodies worst-first — **off-screen first, then
   highest generation, then oldest** — up to 32 per step. No sort, no closure, no
   temporary array. It is a *ceiling, not a target*: it can only ever remove bodies, so
   no frame can gain anything from it, and the five-fruit combo beat peaks at 10 bodies
   against a cap of 51, so it never fires on a shipped frame.
3. **`director.js`: frustum culling restored.** `mesh.frustumCulled = false` was set in
   two places with no comment. `makeFruitGeometry()`, `cutGeometry()` and `slicer.js`
   all compute the bounding sphere, so three's cull test is exact, and a body wholly
   outside the frustum contributes zero pixels to the scene target and therefore zero to
   bloom and DOF. Setting it in `api.add` covers whole fruit *and* halves from one line
   in my own file.
4. **`director.js`: the `api.live.filter(...)` allocation removed** (R4: zero
   steady-state allocation in the hot loop).
5. **`director.js`: `api.reset` now emits `bus.emit('reset', {})`.** See the handoff.

### The bug inside the fix, because it is the most useful thing here

My first version enforced the budget only in `api.fixed`, and portrait *stayed* at
131-165 draw calls with the count swinging run to run. `api.fixed` runs inside main.js's
`while (acc >= SIM_DT)` accumulator, and **slow-motion scales the accumulator**: score.js
emits `slowmo` at scale 0.16-0.34 on *every* cut, so for ~0.3 s after a slice a 1/120 s
tick advances the accumulator by as little as 1/750 s and five or six consecutive ticks
run **no fixed step at all**. Those ticks still render. The complexity probe renders on
i=19/39/59, which are themselves swipe steps, so it screenshotted the un-converged
frame. The `frame` phase runs exactly once per tick and is the only hook that cannot be
skipped; enforcement lives in both now. Anything else in this codebase that assumes
`fixed` runs before a render has the same latent bug.

### What I built, measured, and then DELETED

A raster-correct retirement box: retire when the body is outside the *camera-derived*
visible box rather than outside the two world constants (`floorY-2` = -9.5,
`halfWidth*2.4` = 10.56). Those constants mean "1.5 screen-widths past the edge" in
landscape and "2.7" in portrait on X, and "2.4 screens below" against "1.1 below" on Y —
textbook wrong-frame-of-reference, and exactly the thing this round was chartered to
find. **I took it out anyway**, and the code and the reason are left in place as a
comment at `director.js`. `rng` is one stream shared by every spawn and a fruit's whole
attitude comes off it; retiring a body sooner frees a `maxFruit` slot sooner, fires an
extra automatic spawn, and advances the stream, so every subsequent fruit lands at a
different attitude. That is four other pieces' evidence perturbed to save draw calls the
governor already saves — the governor is bounded by triangles as well as calls, so
nothing was lost. **If a future round wants it, reset the director's rng in `api.reset`
first.**

## NO-REGRESSION EVIDENCE, AND AN INSTRUMENT FINDING THAT OUTRANKS MY SCORE

Another agent was editing `src/render/stage.js` throughout my round (three different
hashes), so a naive before/after in the shared tree is meaningless. I built an
**isolation tree** with `stage.js` and every other file pinned byte-identical, and shot
r9-director (`A`) and r10-director (`C`) back to back in it. Frozen suite, all rows:

| comparison | keys | identical | median abs delta | p90 | max |
|---|---|---|---|---|---|
| **same build, two runs** (landscape) | 168 | 65 | **0.44%** | 24.6% | 600.1% |
| **my change, isolated** (landscape) | 166 | 41 | 2.19% | 33.3% | 227.3% |
| **same build, two runs** (portrait) | 118 | 38 | **0.80%** | 62.9% | 217.3% |
| **my change, isolated** (portrait) | 118 | 41 | **0.45%** | **13.5%** | **40.0%** |

In portrait my change moves the suite **less than re-running the same build does, on
every summary statistic**. In landscape it is the same order. Of the top-14 landscape
movers, 11 have a same-build noise on the identical key that is comparable or larger
(e.g. `lens:12.ribbon.fwhm_max_over_min` mine 133% / noise 600%;
`lens:12.drops.median_area_px` 67% / 67%; `clip:08.pct_R_ge_255` 181% / 27%).

**And here is why any of that noise exists at all, which I think is the round's most
important result.** `shots/r10-perf-noise/` holds three PNGs. They are three renders of
**one build, one scene, one virtual clock, zero code difference** — the
`01-whole-watermelon` beat, driven from one script, three browser pages:

| | runA | runB | runC |
|---|---|---|---|
| `silhouette mask_px` | 12642 | 12643 | **12600** |
| `silhouette boundary_cv` | 0.0925 | 0.0922 | 0.0926 |
| `silhouette max_protrusion_pct` | 19.32 | 19.34 | 19.40 |
| `outline protr_height_pct` | 4.61 | 4.67 | **4.76** |
| `outline protr_width_deg` | 11.25 | 11.25 | **8.44** |
| `outline hull_concave_frac_pct` | 17.19 | 17.19 | **17.97** |
| `void corner_max` | 2.93 | 2.94 | 2.90 |
| `void pct_blown_gt250` | 0.0095 | 0.0095 | 0.0091 |

Max pixel difference between any pair: **3 display counts, everywhere in frame.** That
is enough to flip 43 px of the melon's mask and to move `protr_width_deg` by **-25%**.
Note the punchline: isolated-A reported exactly runB's numbers and isolated-C reported
exactly runC's. **The entire measured "difference" my change made to
`01-whole-watermelon` is reproducible with no code change at all.** Every gate quoted to
three or four significant figures on `silhouette`, `outline` or `void` has been steering
partly on a coin flip. This is not a probe defect — the probes are fine and I did not
touch them — it is the SwiftShader capture path, and it should be characterised (N
repeats, report the spread) before any future verdict calls a 5% move a win.

## GUARD-RAILS I MOVED

- **`slicer.js:111`'s `mesh.frustumCulled = false` is now dead code** — `api.add` runs
  after it and sets `true`. Cutter's owner and critic: this is deliberate, it changes no
  pixel (a sphere wholly outside the frustum renders nothing), and if you ever *need*
  culling off for halves, say so and I will special-case it rather than have two files
  fight over one boolean. **I did not edit `slicer.js`.**
- `director.js`'s expiry box is unchanged from r9 (see "deleted" above).
- `contract.js` is additive only; `STAGE`, `TIER`, `GRAVITY`, `MAX_GENERATION` and every
  existing value are byte-identical.
- No probe added, no probe modified, `PROBE_VERSION` not bumped by me.

## HANDOFF — things I found that are NOT mine to fix

1. **⚠ PORTRAIT FAILS A `REFERENCE_BAR` AUTO-FAIL AND HAS FOR NINE ROUNDS.** Frozen
   suite, `silhouette:01-whole-watermelon.png frame_height_pct`: **landscape 40.56,
   portrait 18.45.** The bar lists "Fruit smaller than ~25% of frame height in the hero
   shot" as an auto-fail. Same cause as my draw calls: `main.js resize()` contain-fits
   `STAGE.halfExtent`, so portrait's visible world is 8.45 units tall instead of 3.90 and
   every fruit is 46% of its intended size. **I did not fix it** — it is `main.js`
   camera framing, it would move every frozen window every other piece cites, and it
   needs the integrator to serialise it. Whoever takes it must also drop
   `STAGE.halfWidth`'s spawn spread in portrait or fruit will spawn off-frame.
2. **`shoot.mjs`'s `cpu` block should report p95 and seed its loop.** `max` is
   unusable (1.8 vs 15.3 ms, same build). One line: pin `Math.random` in an
   `addInitScript` the way `tools/drawprobe.mjs` already does, and quote p95.
   `slicer.js`'s unseeded `Math.random()` in the half spin is the other half of it.
3. **51,711 triangles and 9 draw calls per frame with an EMPTY scene**, identical in both
   orientations, from the post/RTT stack in `stage.js` — 21% of the R4 triangle budget
   before a single fruit exists. Not mine and not urgent now that we are at 160k, but it
   is the largest single line item left.
4. **Juice: `bus.on('reset', ...)` is now live.** The r9 juice verdict's open item (1)
   asked for `director.api.reset` to retire live beads/grains/strands/sheets so
   `00-hero.png` stops carrying eleven beats of prior juice. `director.js` is not yours
   and `fluid.js` is not mine, so I published the event instead of calling into you:
   subscribing in `fluid.js` is now the whole fix, with no change in `director.js` and
   none in `main.js`. Nothing listens today, so the emit is a no-op until you take it.

## ARTIFACTS

`shots/r10-perf/` and `shots/r10-perf-iphone/` (shipped r10), `shots/r10-perf-base/` and
`shots/r10-perf-base-iphone/` (r9 code re-shot today), `shots/r10-perf-rep/` and
`shots/r10-perf-rep-iphone/` (same-build repeat control, taken on the intermediate build
that still had the deleted expiry rule — use them only as a *noise* control, not as
r10's numbers), `shots/r10-perf-noise/{runA,runB,runC}.png` (three identical renders).
Isolation pair, `stage.js` pinned: `/tmp/iso/shots/{A,A-iphone,C,C-iphone}`.
Scratch rigs, none of them probes and none writing to `shots/`:
`tools/.r10perf.mjs` (seeded per-viewport attribution), `tools/.r10cpu.mjs` (labelled JS
frame-time attribution), `tools/.r10det.mjs` (harness start-state determinism),
`tools/.r10fc.mjs` (the three-render noise control).
