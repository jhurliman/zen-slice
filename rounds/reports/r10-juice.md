# r10 — `src/juice/fluid.js` (the juice): the POPULATION, and two of the verdict's own numbers refused with measurements

**FILE TOUCHED: `/home/claude/juice/src/juice/fluid.js` — nothing else.**
`tools/probes.py` untouched by me (md5 `9bf8a336f51f7032e4c1d7f264a0ab77`, PROBE_VERSION 15 —
other agents added `referent` (v14) and `defocus` (v15) this round; I added no probe and modified
none).

**CANARY, run before I started and again after everything below:**
```
python3 tools/probes.py clip shots/r5/05-cut+500ms.png
  -> mask_px 9490 / pct_R_ge_255 5.227 / probe_version 15   ✅ both times
```

**SCALE-MATCHED CONTROLS (RULE 2).** `reference/plate-01.png` (1672×941) Lanczos-resampled to each
shipping raster. My resample reproduces the r9 verdict's plate table **to the digit**, which is the
check that my control is the same control the critic used:

| plate | raster | mask_px | n_blobs | median_area_px | p95/med | iou090 |
|---|---|---|---|---|---|---|
| `/tmp/plate1280.png` | 1280×720 (hero L) | 34239 | 333 | 24.0 | 8.36 | 23.12 |
| `/tmp/plate640.png` | 640×360 (review L) | 8696 | 110 | 23.0 | 5.51 | 19.09 |
| `/tmp/plate430.png` | 430×932 (hero P) | 13573 | 172 | 26.0 | 6.15 | 18.02 |
| `/tmp/plate215.png` | 215×466 (review P) | 2850 | 40 | 17.0 | 3.94 | 22.50 |

Frames: `shots/r10-juice/` and `shots/r10-juice-iphone/`, both
`node tools/shoot.mjs --scale 0.5 --deadline 1000 --hero` (`--device iphone` for portrait;
**`--portrait` is silently ignored by shoot.mjs and falls through to desktop** — the referent
owner flagged this and I confirm it). Baselines: `shots/r10-juice-base` /
`-base-iphone` / `-base2` are the **current tree with only `fluid.js` reverted to HEAD**, shot the
same day with the same command, so the deltas are mine and not other pieces'.

---

## 0. THE ONE CLAIM I PROVED

**The frame's droplet POPULATION roughly triples at the review raster and doubles on the hero, in
both orientations, for +0 draw calls, +0 shader programs, +0 triangles and +0.1 ms of JS per
burst — and the emitter class that does it is `rim`, not `spray`, which is a measured refusal of
half the verdict's fix note.**

`droplets`, frozen, on the shipped frames. `off-subject blobs` is the same mask with the probe's
own `components(min_area=2)` — i.e. the whole field including everything under the 12 px counting
floor, which is where plate-01 keeps 60% of its objects and where "continuum vs countable" actually
lives.

| | mask_px | n_blobs | off-subj blobs | median_area | p95/med | iou090 |
|---|---|---|---|---|---|---|
| **LAND 04-cut+250ms** r9 shipped | 1608 | 20 | 85 | 25.0 | 5.14 | 20.00 |
| LAND 04 base (r9 code, today) | 1343 | 19 | 77 | 24.0 | 4.03 | 26.32 |
| **LAND 04 SHIPPED r10** | **3882** | **69** | **137** | 29.0 | 4.73 | 42.03 |
| plate-01 @640 | 8696 | 110 | 696 | 23.0 | 5.51 | 19.09 |
| **LAND 00-hero** base (same `--hero` recipe) | 8361 | 88 | 191 | 32.5 | 10.34 | 55.68 |
| **LAND 00-hero SHIPPED r10** | **13502** | **106** | **202** | 37.5 | 12.68 | 47.17 |
| plate-01 @1280 | 34239 | 333 | 1509 | 24.0 | 8.36 | 23.12 |
| **PORT 00-hero SHIPPED r10** (new artefact) | **1244** | **17** | **161** | 18.0 | 3.12 | 17.65 |
| plate-01 @430×932 | 13573 | 172 | 26.0 → | 6.15 | 18.02 | |
| **PORT 15-fast-flick** base | 249 | 1 | 46 | 37.5 | 1.61 | 0.00 |
| **PORT 15-fast-flick SHIPPED** | **682** | **8** | **116** | 16.0 | 2.42 | 0.00 |
| **PORT 04-cut+250ms** base | 163 | 3 | 17 | 23.0 | 1.90 | 33.33 |
| **PORT 04-cut+250ms SHIPPED** | 206 | 5 | 16 | 26.0 | 1.59 | 0.00 |

Against the critic's acceptance band on the named beat:
`mask_px >= 3000` → **3882 ✅**; `n_blobs >= 55` → **69 ✅**; `median_area_px <= 28` → **29.0, 1 px
over ⚠**; `area_p95_over_median >= 4.8` → **4.73, 0.07 under ⚠**. On the hero the band was
`n_blobs >= 150 / median <= 40 / p95med >= 7.5` → **106 ⚠ / 37.5 ✅ / 12.68 ✅**.

Two of the four land, two miss by a hair, one (hero count) misses by a third. I am not going to
dress that up. What I will do is show exactly which lever produced it and which lever the verdict
recommended that does not work.

---

## 1. THE VERDICT'S SPRAY NUMBER IS THE WRONG LEVER, AND HERE IS THE ABLATION

The fix note asked for **rim 120→200 AND spray 210→620**. I built the spray tripling, shot it and
it moves the frame the wrong way. All four builds shot through the frozen suite on the same beat,
same command, same day:

| build | 04-cut+250ms: mask_px | n_blobs | median_area_px | p95/med |
|---|---|---|---|---|
| r9 base | 1343 | 19 | **24.0** | 4.03 |
| rim 1.67× + spray 2.95× (the verdict's exact numbers) | 2808 | 40 | **44.0** | 2.70 |
| rim 2.50× + spray 2.95× | 4131 | 68 | **36.0** | 3.25 |
| **rim 2.50× + spray 1.00× (shipped)** | 3844 | 68 | **27.0** | 4.26 |

(the shipped row above is the private-rig capture; the canonical-harness capture of the same build
is the 3882 / 69 / 29.0 / 4.73 in §0. The two rigs differ by ~5% on this beat and I quote the
canonical one everywhere a number is claimed.)

**Mechanism, from the plate's own histogram.** Blob-area histograms, bins
`[2,4,6,9,12,16,24,36,56,90,150,∞)`, off-subject, `min_area=2`:

```
plate-01 @640      696 blobs / 8427 px   [256,165, 85, 44, 36, 41, 34, 12, 11,  6,  6]
r9 base LAND 04     77 blobs / 1310 px   [ 26, 12,  7,  7,  6,  6,  3,  3,  5,  1,  1]
SHIPPED LAND 04    137 blobs / 3856 px   [ 22, 14, 17,  5, 10, 24, 10, 16, 11,  4,  4]
```

plate-01 keeps **60% of its objects under 6 px** and **53% of its *counted* (≥12 px) blobs in the
12–24 px band**. The spray law is `base·exp(2.6·w^3.3)` — its added mass lands in the 36–150 px
bands, so tripling it inflates `median_area_px` faster than it adds legible objects. The rim law
`0.017 + 0.123·u^4.4` is the one that is piled at the bottom. **So the population has to come from
rim.** Shipped: `rim [26,54,90,120] -> [64,132,222,300]`, `spray` untouched.

Second-order consequence, declared: because spray is untouched, **03-cut+100ms does not improve**
(1323 → 1180 mask, 18 → 18 blobs). +100 ms is a spray beat; +250 ms and the hero are rim beats,
exactly as the r9 report established. If the next round wants 03, the honest lever is a *narrower*
spray exponent, not a bigger count.

---

## 2. THE PORTRAIT HALF: THE GRAIN FLOOR IS NOW STATED IN PIXELS

The brief named this as the number to watch and it is the same disease as the other pieces'
pixel-threshold bugs. Every size law in this file is WORLD-space and the raster is not. Measured
from `main.js` (fov 42, `halfExtent` 3.9, `camZ = max(distV, distH)`) and `shoot.mjs` (`--scale
0.5`), the conversion factor is **not** a constant across the shipping set, and the comment in this
file at the `small` crossover that claims "115 px per unit … the same number on both orientations"
has been false for several rounds:

| raster | `U.pix` | camZ | px per world unit |
|---|---|---|---|
| hero L 1280×720 | 937.8 | 10.16 | **92.3** |
| review L 640×360 | 468.9 | 10.16 | **46.2** |
| hero P 430×932 | 1214 | 22.02 | **55.2** |
| review P 215×466 | 606.9 | 22.02 | **27.6** |

r9's reshape put the bulk of the distribution at ~0.019–0.026 units. That is 1.8–2.4 px of radius
on the hero (resolvable) and **0.52–0.72 px in portrait**, i.e. under the vertex shader's own
0.98 px sub-pixel floor, where it is grown to 0.98 px and then **dimmed by `grow^-1.8` to ~44%
alpha**. The whole new small population exists in portrait and is invisible there.

Shipped: a **minimum feature size stated in device pixels** and converted at the burst, where the
raster is known —
```js
const wpx    = distance(camera, cutPoint) / U.pix.value;   // world units per device px
const gFloor = GRAIN_PX * wpx;                             // GRAIN_PX = 1.10
sz = Math.max(szW, gFloor * (0.80 + 0.45 * rng()));        // rim; spray's carries `filmness`
```
`cls()` — the size→tint classifier — is still fed the **unfloored, physical** `szW` everywhere, so
R1b's tint law is untouched by construction: a physically sub-millimetre grain drawn at 1.1 px still
reads WHITE.

**GRAIN_PX was swept, not chosen.** Six values built and shot, `droplets median_area_px` on
04-cut+250ms (at rim 2.5× / spray 2.95×): `0.00 → 44.0 | 0.90 → 38.5 | 1.15 → 40.0 | 1.35 → 39.0 |
1.55 → 36.5 | 2.15 → 44.0`. The floor is worth a few px of median in **landscape and no more**,
because at 46.2 px/unit the r9 law is already at ~1.05 px there. **It is not a landscape change.**
1.10 is the smallest value that lifts the portrait pile clear of the shader's 0.98 px floor at full
alpha while staying at or under the landscape law.

**What it bought, portrait, both frozen and by eye:**
`15-fast-flick` off-subject mask **249 → 682** and off-subject blobs **46 → 116**, and the frame now
reads as the dense white aerosol plate-02 demands rather than a sparse sprinkle.
`00-hero`, portrait, **is the first portrait hero this project has ever captured** (161 off-subject
blobs / 1244 px, histogram `[52,43,32,7,10,11,2,2,2,0,0]`).

**What it did NOT buy, declared plainly: `PORT 04-cut+250ms` is flat.** 163 → 206 px of
off-subject mask against a scale-matched plate's 2850, and `area_p95_over_median` 1.90 → **1.59**,
i.e. the number the brief told me to watch **went the wrong way by 0.31**. Portrait at 215×466
carries essentially no juice at all: the *entire frame* has 7830 pixels above the 0.06 luma floor
and 7600 of them are the subject. That is not a distribution problem, it is an absence problem, and
§4 records the two hypotheses I tested for it.

---

## 3. THE TWO INHERITED ITEMS, BOTH DONE, BOTH INSIDE MY FILE

**(1) THE RULER.** `shots/*/00-hero.png` has carried eleven preceding beats of juice for two rounds
because `ZS.clear() -> director.reset()` retired the fruit bodies and nothing retired the beads.
The r10 director owner published `ctx.bus.emit('reset', {})` for exactly this and left it a no-op
pending a listener (`src/play/director.js:319-331`). **This round is the listener**, plus a new
`api.reset()` that pushes every drop's and every sheet's birth time to the `-1e6` sentinel
`makeSheet` already initialises with — no new attribute, no new uniform, no branch in either shader.
Nothing outside `fluid.js` changed. **The shipped hero is now clean and reproducible from the
sanctioned artefacts.** Note the consequence for §0's table: the base hero (8361 px, 88 blobs) is
*contaminated* and the shipped hero (13502 px, 106 blobs) is not, so the shipped gain is understated
by whatever eleven beats of stale juice were worth.

**(2) THE SCALLOPED COMB / ZIPPER**, open since r8. `fluid.js` line ~1044:
```js
const opt = smoothstep(0.16, 0.52, big)
  .mul(select(morph.greaterThan(0.5), float(0.0), float(1.0))).toVar();
```
A ligament is a thread, not a lens; the optical ring was being evaluated against the periodic
Rayleigh–Plateau neck field at :763-772 and pinching once per neck. **Verified by looking**, crop
(820,100)-(1000,290) of `00-hero` at 5× NEAREST, r9 vs shipped: the 12-tooth hard aliased sawtooth
and the dark axis are **gone**. ⚠ **Partial, and I will say so:** the lobe *train* remains, because
it is the ligament's own `bn = 2..6` bead field and not the ring. It reads softer and rounder than
r9's but a congruent bead chain is still a congruent bead chain. Next round's cheapest move is to
de-congruentise `bn`'s lobe amplitudes per bead rather than to remove the field.

---

## 4. ONE HYPOTHESIS I TESTED AND REFUTED, RECORDED RATHER THAN QUIETLY DROPPED

**"The portrait spray is off the side of the screen."** Every reach in this file is a multiple of
the FRUIT radius and the frame is not: `main.js` CONTAIN-fits the stage box, so the visible
half-WIDTH at the cut is 6.93 units landscape and **3.90 units portrait** — 1.78× apart on the axis
the wedge actually travels, because the harness (and a player) swipes horizontally. At R = 1.9 a
melon cleave's asymptote is 7.9 units and the +250 ms beat covers 42% of it: 3.3 units of lateral
travel against a 3.9-unit half-width. It looked conclusive.

So I built it — `beadReach` capped at 1.5× the camera's own visible half-width, computed from
`camera.fov`/`aspect`/distance, the same construction the r10 director owner used to replace its
hard-coded retirement box; landscape arithmetically unchanged (cap 10.4 against a melon cleave's
7.9 and the harness's widest cleave at 10.0), portrait cut 7.9 → 5.85, lateral travel 3.3 → 2.5
units, comfortably inside the frame — and shot it. **Portrait off-subject mask 232 → 230 px. No
effect.** The portrait spray is not leaving the frame; it is too small and too dim inside it. Not
shipped; the note and the number are in the source at the `beadReach` line so nobody re-proposes it.

**A second one, same treatment.** I also bypassed the DOF lens for drops entirely
(`D = vec4(1,1,0.68,0)`) on the suspicion that at portrait's camZ 22 the lens was smearing beads
below the luma floor. It is the opposite: off-subject mask **fell** 230 → 152 portrait and
3844 → 2114 landscape. The lens is *inflating* drops, not erasing them, on both orientations.
Not a defect and not stage's problem.

---

## 5. GUARD-RAILS — four held, one moved in portrait

| guard-rail (critic's r9 value) | bar | LAND base | **LAND ship** | PORT base | **PORT ship** |
|---|---|---|---|---|---|
| `particles median_blob_area` 15-fast-flick | ≤ 6.0 | 4.0 | **4.0 ✅** | 4.0 | **3.0 ✅** |
| `tintlaw sat_small` 15-fast-flick | ≤ 0.145 | 0.1059 | **0.1209 ✅** | 0.1317 | **0.1602 ⚠** |
| `tintlaw sat_blob_mean` 15-fast-flick | ≤ 0.11 | 0.0865 | **0.0994 ✅** | 0.1167 | **0.1448 ⚠** |
| `tintlaw sat_size_slope` 16-slow-cleave | **positive** | +0.1487 | **+0.2882 ✅** | +0.2628 | **+0.3752 ✅** |
| 16-slow-cleave shows connected torn film | by eye | yes | **yes ✅** | yes | **yes ✅** |

**THE ONE THAT MOVED, and I am not hiding it.** Portrait `15-fast-flick` `sat_small`
0.1317 → 0.1602 and `sat_blob_mean` 0.1167 → 0.1448, both over bars the critic set on the landscape
frame (0.145 / 0.11). Mechanism, and it is mine: rim beads on a fast flick are ~11 objects and are
NOT filmness-gated in the floor, so in portrait they go from sub-pixel ghosts to visible specks, and
the fat 30% of the rim draw legitimately carries hue. **I LOOKED before I believed the number** (the
critic's own instruction): `shots/r10-juice-iphone/15-fast-flick+50ms.png` at 4× is a dense
silver-white aerosol cone with one visible red speck in it — it reads as plate-02, not as tinted
spray. The blob population also grew 2.5× and a large share of the new grains sit *on the warm blade
streak*, whose hue they take; `particles` already carries a documented caveat about exactly that
contamination on exactly this frame.

**The one-line remedy I did NOT ship, and why.** Gating the rim floor by `(1 - fast)` — the file's
own RULE 1 idiom — makes the fast flick arithmetically unchanged and restores both numbers exactly.
I did not ship it because it also weakens the portrait floor by 84% on the melon cut, which is where
the round's only portrait win lives, and I had no capture budget left to measure that trade instead
of asserting it. **Shipping it unmeasured would have been the thing this project keeps getting
burned by.** It is the first thing to try in r11 and it is one expression:
`gFloor * (1 - fast)` at the rim `sz` line.

### What I gave back, also declared

`pct_iou_ge_090` on LAND 04-cut+250ms: **26.32 (base) → 42.03**, against a scale-matched plate's
19.09. r9 closed this tell (25.00 → 20.00) and this round hands part of it back: a population whose
new members are small round floored specks is *more* ellipse-congruent, not less. It is the price
of the count and it is the largest single cost in this report. The lever that fixes it without
undoing the count is the doublet gate — now stated in pixels (`sz > 2.0 * wpx`, replacing `sz >
small`, which was 2.77 px on the hero, 1.39 px at the review raster and 0.83 px in portrait: three
different gates for one intent) — whose probability `dblSpray`/`dblRim` I deliberately did not touch
this round so that the count change could be attributed cleanly.

---

## 6. PERF — +0 draw calls, +0 programs, +0 triangles, +0.10 ms per burst

Drops are ONE instanced draw into a 9000-slot pool whose `geometry.instanceCount` is already
saturated at 9000 after the first few bursts, so more emission is free on the GPU by construction.
Measured, from `report.json`:

| run | liveBodies | peakDrawCalls | peakTriangles | programs |
|---|---|---|---|---|
| PORT base | 51 | **115** | 161343 | 0 |
| **PORT ship** | 51 | **115** | 155127 | 0 |
| LAND base (run 1) | 49 | 91 | 169629 | 0 |
| LAND base (run 2) | 39 | 57 | 110907 | 0 |
| **LAND ship** | 49 | **73** | 143863 | 0 |

**Portrait is the controlled comparison** — identical `liveBodies`, identical draw calls, triangles
differing only by which fruit meshes the unseeded spawner happened to make. Landscape's own
statistic swings 57 → 91 across two runs of the *same* build, which is the r10 perf owner's
unseeded-harness finding reproduced from a third direction; I quote the portrait row as the claim
and the landscape rows as noise. Both orientations are inside the 120-call / 250k-triangle ceilings
the perf owner restored this round, and I did not spend any of that headroom.

**JS cost, both orientations, measured directly** (`.r10jcpu.mjs`: 300 warm-up + 2000 timed
`bus.emit('juice')` with no render and no cut, median of 2000 — headless SwiftShader, so read the
DELTA, not the absolute):

| | base | ship | delta |
|---|---|---|---|
| burst, LANDSCAPE tier 3 | 0.6 ms | **0.7 ms** | **+0.10 ms** |
| burst, PORTRAIT tier 2 | 0.4 ms | **0.5 ms** | **+0.10 ms** |

A cut fires two bursts, so **+0.20 ms on a cut frame** in both orientations. The canonical harness's
`cpu` block reports `median 0.0 / p95 0.2 ms` on the shipped build in both orientations, against the
2.0 ms bar. `bk` (the per-frame emission budget `1 - emitted/3000`) now bites ~4% sooner on a
10-burst combo frame, which is the correct self-limiting behaviour for the worst case. `mist` (1500,
the largest loop in the file and the only class with a positive `fast` term) was deliberately NOT
raised.

`node build.mjs` is clean. No `ShaderMaterial` / `onBeforeCompile` / `EffectComposer`; the one
shader edit is a `select()` inside an existing TSL `Fn`.

---

## 7. REQUESTS TO THE INTEGRATOR — NOT MY FILES, SO I HAVE NOT TOUCHED THEM

1. **`tools/shoot.mjs`: accept `--portrait` or reject it loudly.** It is silently ignored and falls
   through to `--device desktop`. The brief I was given tells builders to use it. Two agents have
   now hit this.
2. **`tools/shoot.mjs --seed`.** Third independent request this round (fruit-mat, stage, now juice).
   My landscape draw-call statistic swung 57 → 91 on one build; `pct_iou_ge_090` on one beat swung
   20.00 → 26.32 between r9's capture and a re-shoot of r9's own code. Half of what the critics and
   I are steering by is spawn noise.
3. **Nothing else.** `director.reset` already emits `reset` and `fluid.js` now listens; the seam is
   closed with no change outside my file.

## 8. FOR MY NEXT CRITIC — where I think the remaining gap is

The population is still 3–5× short of the plate at every raster and the shortfall is entirely in the
**under-6-px band**: plate-01 @640 has 421 objects there and the shipped frame has 36. That band is
invisible to `droplets` (min_area 12) and therefore invisible to every acceptance gate this piece
has ever been given, which is why nine rounds of gates have not produced it. It is a real class —
long-lived fine grain, not the existing `mist`, which is dead by +100 ms — and building it is the
next round's work. Do not gate it on `n_blobs`; gate it on the off-subject `min_area=2` blob count,
which is the statistic that actually separates "a countable field" from "a continuum".
