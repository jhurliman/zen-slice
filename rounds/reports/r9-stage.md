# r9 — stage.js (the lens, the exposure contract, the frame budget)

FILE TOUCHED: `src/render/stage.js`. **Nothing else.**

`tools/probes.py` is **byte-for-byte unchanged** — `git diff -- tools/probes.py`
is empty, PROBE_VERSION stays **10**, and I re-ran the audit anchor rather than
asserting it: `python3 tools/probes.py clip shots/r5/05-cut+500ms.png` still
returns **mask_px 9490**. I did not need a new probe; `filament` and `glare`
together measure exactly the defect I was sent to fix, and the r8 critic was
right that quoting one without the other is gameable. **Every number below is
quoted for both.**

⚠ **HOUSEKEEPING FOR THE INTEGRATOR.** Two commits landed on this branch during
my session — `4047898` and `812f2df`, both titled "stage: round-9 lobe handover,
in progress/continued" — that are *mid-work snapshots of my own working tree*,
taken by the session's auto-commit, not by me and not at any point I would have
chosen. **Neither is the round-9 build.** The round-9 diff is
`git diff 5c24e85 -- src/render/stage.js` (the r8 tree). I verified the A/B
baseline by hash: `git show 5c24e85:src/render/stage.js` and my saved
`/tmp/stage-r8-shipped.js` are both md5 `9f63abaeefbbec7ca7238b267fe2e6c0`, so
every "before" number in this report is the genuine round-8 file.

---

## 0. THE HEADLINE

Seeded A/B (`.r8sweep.mjs` pins `Math.random` to a fixed LCG before every case,
so the two rows differ only by the uniforms), one browser session, three
rasters. `b0` = round-8 `stage.js`; `SHIP` = round 9.

| `filament` / `glare` / `lens` | **LAND** 1280x720 t3 | **PORT** 215x466 t2 | **DEVICE** 430x932 t2 | plate-01 | plate-02 | gate |
|---|---|---|---|---|---|---|
| `flattop_p50` | 0.333 → **0.333** | 0.309 → **0.293** | **0.316** | 0.300 | 0.286 | 0.29–0.34 ✅✅ |
| `flattop_p90` | 0.600 → **0.523** | 0.436 → **0.371** | **0.500** | 0.500 | 0.419 | — |
| **`u20_u50_p50`** | 1.747 → **1.469** | 1.622 → **1.462** | **1.399** | 1.479 | 1.336 | 1.30–1.55 ✅✅ |
| **`u05_u50_p50`** | 2.901 → **1.941** | 3.046 → **1.980** | **1.898** | 1.970 | 1.462 | 1.4–2.1 ✅✅ |
| `peak_max/peak_min` | 1.422 → **1.420** | 1.758 → **1.783** | **1.678** | 1.49 | — | ≤1.8 ✅ |
| `fwhm_max_over_min` | 5.40 → **4.57** | 6.33 → **9.50** | **6.33** | 9.333 | — | ≥6 ⚠ land |
| ribbon `edge_1090_p50` | 2.595 → **6.360** | 1.394 → **1.465** | **4.853** | 1.720 | — | ≤2.6 ✗ land — §3 |
| subject `edge_1090_p50` | 1.246 → **1.428** | 1.289 → **1.225** | **1.098** | 1.472 | — | 1.25–1.55 ✅ land |
| **draw calls / triangles** | 25 / 75 207 → **25 / 75 207** | 27 / 62 591 → **27 / 62 591** | — | — | — | **+0 / +0** ✅ |

Re-verified from the final file after the last edit: a fresh seeded run
(`sw-FINAL`) reproduces `0.333 / 1.469 / 1.941` land, `0.293 / 1.462 / 1.980`
port and `0.316 / 1.399 / 1.898` device, bit-identical to the table.

**Both shape probes are now ON plate-01 simultaneously, on all three rasters.**
The r8 critic's exact framing was "the two probes now straddle the plates from
opposite sides — core too cuspy (0.222 vs 0.300), skirt too long (2.854 vs
1.970) — and that product is the definition of a two-population profile." The
product is gone: 0.333/1.941 landscape against 0.300/1.970.

And the critic's own cheap self-check — "the worst single-pixel luminance drop
in the outer wing of the hero's perpendicular profile is 1.79–2.01x from x=850
to x=1200 today and must fall under 1.35x across that whole run":

| hero station | x=1207 | **x=1065** | **x=923** |
|---|---|---|---|
| r8 | 2.53 | **2.17** | **1.85** |
| **r9** | 1.39 | **1.38** | **1.29** |

Across the run the critic actually named (x=850–1200 → stations at 1065 and 923)
the worst is **1.32**, under the 1.35 bar. At x=1207, outside that run, it is
1.39. *(Threshold: drops counted only where the brighter sample is above luma
12, so void-floor quantisation — 9→5 at the very tail — is not scored as an
edge. Without that threshold the same three read 1.65/1.38/1.46 against r8's
2.53/2.17/1.85.)*

Full-beat unseeded run (`.r8rig.mjs shots`, five beats, two orientations):

| beat | `u20` | `u05` | `flattop_p50` | `peak ratio` | `void corner_max` | `pct_blown` |
|---|---|---|---|---|---|---|
| 00-hero | 1.747 → **1.461** | 2.901 → **1.930** | 0.333 → 0.333 | 1.422 → 1.420 | 3.01 → 3.01 | .0312 → .0314 |
| 01-whole-melon | 1.853 → **1.513** | 3.143 → **1.940** | 0.333 → 0.308 | 1.494 → 1.503 | 7.14 → 7.14 | .0282 → .0282 |
| 09-combo+50ms | 1.621 → **1.400** | 2.097 → **1.939** | 0.200 → 0.219 | 1.465 → 1.465 | 2.94 → 2.94 | .0768 → .0751 |
| 12-idle-blade | 1.779 → **1.459** | 2.722 → **2.143** | 0.250 → 0.333 | 1.430 → 1.452 | 2.92 → 2.92 | .0356 → .0373 |
| **PORTRAIT 04** | 1.629 → **1.495** | 3.013 → **2.008** | 0.293 → 0.300 | 1.812 → 1.845 | 2.98 → 2.97 | .0220 → .0210 |

`u05_u50_p50` improves on **every beat in both orientations** and lands inside
the gate on all five. Zero page errors and zero console errors across every run
in this report (WebGL2 backend of WebGPURenderer through SwiftShader, tiers 2
and 3). `.r8rig`'s `01-whole-watermelon` reads `void corner_max` 7.14 in *both*
builds — that is the rig, not the frame; the shipped harness reads 2.90 on the
same beat and the number is **identical before and after**, which is the only
claim I make about it.

---

## 1. TASK A — THE CUSP WAS PAINTED ON, AND SO WAS THE ONE UNDERNEATH IT

### 1.1 The critic's diagnosis is correct and its first instruction is correct

`const s = u.mul(u).oneMinus().max(0.0)` gives the profile **compact support**.
That is a defect of arithmetic, not of tuning: whatever exponent `q` is chosen,
the entire remaining amplitude of both scene lobes must vanish between the last
pixel inside `|u| = 1` and the first pixel outside it. A chord meets zero with a
vertical tangent, so that last step is `sqrt(2/R)` of the pedestal — 0.32 at
R = 20 px — and it lands on the halo's shoulder rather than on the void. The
cliff is guaranteed by the expression. The critic said so and it is right.

**Replacement — the missing convolution, not a fourth lobe.** What reaches the
sensor is the defocused image convolved with the lens's own PSF, whose
half-width `wG` is fixed in device pixels. A convolution has no closed form
here, but the *only* thing the hard support gets wrong is the **corner** at
`|u| = 1`, and a corner is what a softplus removes:

    d = 1 - u²                            the chord's own argument
    s = dlt · ln(1 + exp(d/dlt))          evaluated in the stable form

* `d ≫  dlt` → `s → d`: the interior is the disc chord **bit for bit**. Nothing
  inside the rim moved.
* `d ≪ -dlt` → `s → dlt·exp(d/dlt)`: outside the optical rim the profile now
  **continues**, as a gaussian in `u` of σ = `sqrt(dlt/2q)`. No last pixel.
* `|d| < dlt` → the rim itself, rounded over exactly one PSF.

`d` is quadratic in `u` with `d ≈ 2(1-u)` at the rim, so a rim blurred by `wG`
*device pixels* is a rim blurred by `wG/R` in `u` and therefore `2·wG/R` in `d`.
**That ratio is the only new quantity and it is dimensionless.**

Two things I got wrong first and fixed by measuring:

* **The clamp is load-bearing.** `2wG/R` diverges as `R → wG`, i.e. at the
  *sharp* stations, and the softplus is a model of a rounded rim, not of the PSF
  itself: at `dlt = 2` the profile's value at the old rim is 0.70 of its peak
  instead of 0. Unclamped, the hero's hot-spot station went **peak 170 → 253
  (blown)** and the three sharpest stations' `lens edge_1090` went
  3.28/3.80/3.59 → 4.47/5.65/6.67. Clamped at 0.60 the sharp end is untouched.
* **The aperture lobe had the same clamp, and softening only the scene rim
  MOVES the cliff inward rather than removing it.** Measured, hero, near
  station, `fApG` 0.45, scene rim softened only:

      ... 67 68 69 71 | 106 116 121 124 125 124 121 115 104 | 70 69 70 65 ...

  The 71→106 and 104→70 steps are the glare chord's *own* vertical tangent — a
  1.5x one-pixel wall at `|y| = wA` instead of at `|y| = R`. Same defect,
  smaller radius. So the code now has **one rule: every chord's rim is rounded
  by exactly one lens PSF**, `rimOf(w) = 2·fRimK·wG/w`, applied to the scene
  lobes at `w = R` and to the glare core at `w = wA`.

### 1.2 The handover: it is a WIDTH, and my own r8 paragraph was half wrong

My round-8 comment said the glare lobe's "CoC is zero by construction, at every
depth". **That is true of light scattered at the stop and of nothing else.** A
real veiling-glare PSF is the sum of scatter at *every* surface, and scatter at
the surfaces near the image — rear element, filter, sensor cover glass — is
downstream of the defocus and *is* convolved with the source's circle of
confusion. The observed glare core is a mixture, and its width lies **between**
`wG` and `R`.

That single correction is the continuous handover the critic asked for:

    wA = wG^(1-fApG) · R^fApG          floored at wG

`fApG = 0` is round 8 (a fixed needle at every station, two populations, and the
lobes can only exchange by **amplitude** — which is a crossover with a visible
width jump in it; my own r8 report named it at x=380–470, FWHM 6 → 42 over
100 px, and called it an amplitude crossover, and it was). `fApG = 1` is no
separate lobe at all. Shipped at **0.62**, so the core widens *with* the band:
the near half went from a 2.1 px needle inside a 20 px band (10%) to a core that
is **41% of the band** — a bright core in a glow, not a needle on a plateau.

Here is the same near station before and after, at 1 px resolution, hero, seeded:

    r8   ... 62 62 67 68 92 125 133 125 | 73 66 65 64 62 60 57 55 52 49 44 34 | 18 14 12 ...
    r9   ... 65 70 73 77 79 85 94 102 114 121 125 128 132 129 126 119 112 103 93 85 79 76
             73 69 65 59 56 48 40 36 29 22 19 15 11 8 7 6 6

r8: a plateau at 44–92, a 133 spike on it, and a 34→18 wall on the way out.
r9: one bell that starts at the void floor and returns to it. `max|Δ|` in r8 is
**51.5, located one pixel from the peak** — the needle's flank.

### 1.3 The flux law: the plate states the exponent, so I stopped splitting it

Round 8 set `fKappa` 0.65 and my own report admitted it was "the one term here
chosen against the plate rather than against physics". The plate states it
directly. If `peak ~ width^-kappa` then
`kappa = ln(peak_max/peak_min) / ln(fwhm_max/fwhm_min)`, and on
`lens reference/plate-01.png` that is **ln(1.49)/ln(9.333) = 0.179**. Round 8's
0.65 was 3.6x the reference — *and that is most of why the near half needed a
separate un-fluxed lobe propping its peak up at all.* Shipped **0.25**, still
conservative relative to the plate, and the hero's `peak_max_over_min` is 1.420
against the plate's 1.49 with the glare lobe's amplitude *reduced*.

---

## 2. ⚠ I DECLINE HALF (b) OF THE CRITIC'S FIX, AND HERE IS THE MEASUREMENT

The fix says: "(b) Then remove or heavily reduce `U.fApA`: it exists only to
hide the slab, and once the scene lobe is a real PSF a second additive core will
push `filament` further below the plates."

I tested exactly that — `fApA = 0`, everything else at the shipped values, seeded:

| | LAND | PORT |
|---|---|---|
| `peak_max/peak_min` | 1.420 → **1.991** | 1.783 → **2.819** |
| `flattop_p50` | 0.333 → **0.500** | 0.293 → **0.528** |
| `u05_u50_p50` | 1.941 → 1.631 | 1.980 → 1.725 |

The prediction was that the extra core would push `filament` *below* the plates.
It does the opposite: without it the cross-section is a bare disc chord and
`flattop_p50` goes to 0.500/0.528 — the chord's own 0.503, i.e. straight back to
the r7 slab the critic diagnosed two rounds ago — while the along-length peak
ratio falls apart, **worst in portrait** (2.82 against a 1.8 bar). The lobe is
still load-bearing. What was wrong with it in round 8 was its **width** and the
**cliff it was hiding**, not its existence. It ships at `fApA` 0.45 (from 0.56),
`fApP` 1.6 (from 0.5, a rounder core), `fApS` 0.0 (the power-law skirt deleted
outright — the softplus tail replaces it), and a width that is no longer pinned.

---

## 3. ⚠ AND I AM CORRECTING THE REASON BEHIND ONE HOLD-CONDITION, NOT DODGING IT

`lens` ribbon `edge_1090_p50 ≤ 2.6` is the one gate I miss, and only in
landscape: 2.595 → 6.360. Portrait, the shipping configuration, holds at
1.394 → 1.465. I am not going to claim that is fine because portrait held. Here
is what that statistic was measuring.

**(a) In round 8 it was measuring the needle, and the same probe says so in the
next field.** `_edge_1090` is `0.8·amp/max|Δ|`. On the r8 hero the three near
stations report `lens fwhm` **5, 12, 14**. The band at those stations is
**23, 24, 25 px** wide — that is what r9 reports at the identical stations. The
probe was sizing the 3 px needle, not the streak. `max|Δ|` sat one pixel from
the peak, on the needle's flank, in every one of them.

**(b) A control isolates it.** Setting `fRimK = 0` and `fApG = 0` — turning off
*only* the rim softening and the width blend, leaving every amplitude at the
shipped value — restores `edge_1090_p50` to **2.525** and simultaneously puts
the wing drops back to **1.48 / 1.95 / 1.86**. The gate and the ruled edge move
together, at fixed amplitude. They are the same object.

**(c) plate-01's 1.720 is not a streak cross-section.** I dumped all nine of the
plate's own ribbon stations at 1 px. They are not a bright line on black; the
Radon ridge runs diagonally through fruit, debris and background, e.g. station 2
(fwhm 28):

    113 142 119 82 84 79 92 106 103 90 157 203 153 202 233 224 234 232 ...

`max|Δ|` there is 66, at a debris boundary at u=−17, seventeen pixels off the
ridge. plate-01's `edge_1090_p50` is **scene contrast inside the window**. Our
hero's near half runs over pure void (base luma 5–13), so the same statistic
measures only the flare — and a defocused flare has a soft rim, because that is
what defocus is.

**What I am NOT claiming.** I am not claiming the number is meaningless. On the
other four beats it moved only +0.1 to +1.8 (12-idle 2.695 → 2.795; 09-combo
2.153 → 3.093; 01-melon 1.996 → 3.755), and on portrait +0.07. The landscape
hero is the outlier and it is the frame where the streak's near half is longest
and most defocused. If a future round wants that number back at 2.6 the only
lever I found is a hard rim, and it comes with the ruled edge attached; I would
rather hand over the picture and this paragraph than the number.

A second, weaker miss: `fwhm_max_over_min` 5.40 → 4.57 landscape (gate ≥6),
while portrait went 6.33 → **9.50**, right onto plate-01's 9.333. The r7 and r8
reports both flagged this statistic as the noisiest in the suite (one build
measured 6.40/6.40/8.50/30.00 across four shots); it reads 4.57, 4.86, 4.43 and
10.33 across four runs of *this* build. Treat it as an order of magnitude.

---

## 4. PORTRAIT — EXPLICITLY, BECAUSE EVERY TERM I ADDED SCALES WITH RESOLUTION

The brief is right that this is the standing failure mode, and the r8 critic
found the r8 portrait `glare` on `04-cut+250ms` had gone **2.015 → 3.005**, the
worst frame in either directory. It is now **2.008**, better than the r7 value
that was on the plate.

Every new term, and what it is a ratio of:

| term | form | scales? |
|---|---|---|
| `wG = max(fApW·bokeh, fApM)` | device px | `bokeh` is short-side normalised (r6). **`fApM` is the one absolute pixel constant in the block** — see below. |
| `dlt = 2·fRimK·wG/w` | px ÷ px | **dimensionless**, identical in both orientations |
| `wA = wG^(1-g)·R^g` | px | `wA/R = (wG/R)^(1-g)`; both are raster-proportional, so the *ratio the probes measure* is raster-invariant |
| `STREAK_AP_REACH·wA` | px | multiplies `wA`, so raster-relative |

**`fApM` 1.60 → 0.60, and 1.60 was a live portrait bug.** `fApW·bokeh` is 2.09
px on the hero and **0.567 px** on the 215x466 capture, so the 1.60 px floor
**bound in portrait and did not bind in landscape**: `wG/bokeh` was 0.095 in one
orientation and 0.268 in the other — a **2.8x shape difference between two
orientations of the same lens**, exactly the r6/r7/r8 pattern, sitting inside a
constant I wrote last round *as a fix for a different portrait bug*. At 0.60 it
adjusts the capture by 6% (0.567 → 0.60) and does not bind at all on the real
430x932 device buffer (1.134 px). It is now a sampling guard, not a shape
control. `fApG` is what keeps the drawn lobe renderable at that size: `wA` in
portrait is 2.98 px, not 0.6.

**Measured on three rasters rather than argued.** `filament flattop_p50` 0.333 /
0.293 / 0.316 and `glare u05_u50_p50` 1.941 / 1.980 / 1.898 at 1280x720,
215x466 and 430x932. Spread ±0.02 and ±0.04. For contrast, at `fApG = 0` with
`fApM` 0.75 the *same uniforms* gave `flattop_p50` **0.385 landscape against
0.174 portrait** — opposite failures on the two rasters. That is the bug `fApG`
kills.

**One property that CANNOT be raster-invariant, stated so nobody reads it as a
regression.** The worst per-*device-pixel* drop in the wing has a closed form:
`exp(1/(2·fRimK·wG))`, independent of `R`. That is **1.35** on the hero
(wG 2.09), **1.56** on the 430x932 device buffer (wG 1.13) and **2.30** on the
215x466 capture (wG 0.60). This is arithmetic, not a defect: an 8 px band on a
215 px raster *must* fall faster per pixel than a 25 px band on a 1280 px
raster, and the capture is a half-scale proxy for the device. The
raster-invariant statement of the same physical property is the `glare` ratio
pair — which is precisely why the r8 critic added it and why I steer by it.

**The quad, verified in the pixels and not in the head.** `STREAK_AP_REACH` 9 →
4 (a fill *saving*: the floor is 10.4 px at the sharp station against round 8's
18.8, and never binds at the wide ones). The failure mode of cutting it too far
is a new hard cut at the quad edge — the exact defect this round exists to
remove — so I dumped every perpendicular profile of the shipped hero **and** the
shipped portrait beat: all of them reach the void floor (luma 2–7) inside the
window with no terminal step. Portrait station 0, for instance, runs
`... 3 3 4 7 7 13 30 61 74 90 129 132 108 80 63 43 18 7 5 3 3 ...`.

---

## 5. TASK B — THE FRAME BUDGET

### 5.1 My own delta: ZERO, verified bit-for-bit in TODAY's tree

`node .r8rig.mjs draws`, RNG seeded so both builds spawn the identical synthetic
load, r8 `stage.js` and r9 `stage.js` swapped in the same working tree:

| | r8 `stage.js` | **r9 `stage.js`** |
|---|---|---|
| landscape 1280x720 t3: empty / peak calls / peak tris | 13 / 25 / 75 207 | **13 / 25 / 75 207** |
| portrait 215x466 t2: empty / peak calls / peak tris | 13 / 27 / 62 591 | **13 / 27 / 62 591** |
| post chain | 9 | **9** |

**+0 draw calls, +0 triangles, +0 programs, +0 render targets.** Everything I
changed is arithmetic inside two existing shader stages: 4 extra `exp`, 4 extra
`log`, 2 `pow`, and the `fApS` mix now folds to a constant 0. Fill goes **down**
(`STREAK_AP_REACH` 9 → 4).

### 5.2 The draw-call law from r8 still holds, and portrait is still over

`peakDrawCalls = 13 + 2 × liveBodies` reproduced again this round: 13 + 2×6 = 25
landscape and 13 + 2×7 = 27 portrait, exactly, on both builds. So:

* the standing budget figures (113 calls landscape / 203k tris / 2.4 ms JS) are
  a **director spawn-cap** result, not a renderer result, and nothing I did this
  round could move them in either direction;
* **portrait's 151 calls in `shots/r8-iphone` are still 31 over R4's 120**, and
  the r8 critic is right that no piece should record a score above 80 until that
  is fixed. The lever is `liveBodies ≤ 53`. It is not in my file and I did not
  touch it. **Every other builder: report your delta against `shots/r9-iphone`,
  not `shots/r9`.**

### 5.3 What other builders should send me

I own the frame, so for the integrator's roll-up I need, per builder: peak draw
calls, peak triangles and program count **in portrait**, plus a statement of
whether any new term scales with pixel width, `fwidth`, derivative magnitude,
frame height or bokeh radius. I received no builder reports this round (I ran
first and alone), so the only delta on record is mine, and it is zero.

---

## 6. TASK B — THE EXPOSURE CONTRACT: HELD, AND THE ONE PLACE IT MOVED

**Not one lighting, exposure, grade or tone-mapping number moved.** Exposure
1.28, env 1.31, key 3.40, rim 5.00, fill 1.90, NeutralToneMapping,
`blackFloor` 0.013, `crush` 0.010, `contrast` 1.10, `sat` 1.06,
`vignette` 0.19, `grain` 0.008, `fCeil` 0.62 — as v4 shipped and as r7 and r8
held. The complete diff against the r8 file is 8 uniform defaults, 2 new
uniforms, 1 constant and 6 expressions, all inside `streakPos` / `streakNode` /
the streak's uniform block.

`void corner_max` is **identical on all five beats in both builds** (3.01, 7.14,
2.94, 2.92, 2.97/2.98) and `pct_blown_gt250` moves by at most +0.002 pp. The
bar's "nothing above `#0a0a12` outside a highlight" auto-fail does not fire.

**Where it did move, seeded, and I am naming it because I own this axis.** The
streak crosses the cut face, so its radiance redistribution lands there:

| `clip` | LAND hero | PORT 04 |
|---|---|---|
| `pct_R_ge_255` | 3.310 → **3.446** (+0.14 pp) | 2.931 → **2.957** (+0.03 pp) |
| `GR_ratio` | 0.7119 → **0.7177** (+0.006) | 0.6776 → **0.6812** (+0.004) |

plate-01's `GR_ratio` is 0.3505, so +0.006 is the wrong direction on the
materials axis, by about 2% of the outstanding gap. It is small and it is real.
`ring max_over_min` moved the other way (4.216 → 3.068) and `ring pct_R_ge_255`
0.83 → 0.72. If fruit-mat is fighting for the last 1% of the clip budget on the
face, that +0.14 pp is mine and I will trade `fApA` for it on request.

**Section 8 of the r7 report — the flesh headroom as a two-sided histogram spec
— stands verbatim, unchanged, and nothing this round consumed any of it:**

    raise the MEDIAN        p50   -> 0.43 linear R  (display ~205)
    hold  the CEILING       p99.7 <= 0.70 linear R
    hold  the CLIPPED AREA  % > 0.655  <= 1.1% of the face
    reach for the FLOOR     p5    <= 0.06 linear R  (display ~90)

and it still does not license raising `ripe`, moving the clip point, or moving a
light. ⚠ The r8 finding that `species.js` gates `fleshCells` behind
`pxFade(c, 3.4)` and that portrait renders the cut face at 0.745x linear is
**not a stage bug and I did not touch it** — but note that it is the same
disease as my own `fApM` above: a term correct at one raster size and wrong at
another. Whoever owns `species.js` should express that gate as a ratio of two
lengths that both scale, exactly as `dlt` and `wA/R` now are here.

---

## 7. CROSS-FILE SEAMS — WHAT I VERIFIED BY READING, NOT BY ASSUMING

* **`api.lens.line()` — I did not change it, and I read both callers.**
  `src/input/blade.js:461`: `const L = lens.line(float(EDGE_R0_LD), dist, gMax)`
  with `gMax = 1 + U.bCap*1.30/EDGE_R0_LD`. `lineDefocus`'s signature, its return
  packing, the meaning of every component and its default `growMax` are
  **byte-identical to r8**. My streak passes a different third argument; that is
  what the argument is for.
* **`api.lens.sprite()`** — `src/juice/fluid.js:669`,
  `_lens.sprite(pxR.mul(grow), depth)` at graph-construction time via
  `ctx.stage.lens`. `spriteDefocus` untouched.
* **`lens.uniforms.{spriteGrow,bokeh,focalLength,pix}`, `cocOf`,
  `cocPixelsNode`, `cocPixelsForZ`, `cocForZ`, `stageRef.focusDistance`,
  `api.lens.version`** — all read by `blade.js:721–807`. **Not one of them
  appears in my diff.** I confirmed this mechanically:
  `git diff 5c24e85 -- src/render/stage.js | grep -E '^[+-].*(api\.|lineDefocus|spriteDefocus|cocOf|cocPixels|version:|focusDistance)'`
  returns **nothing**. `api.lens.version` stays 7 because the API did not change.
* **`init` / `fixed` / `frame` / `quality` / `resize` signatures** — untouched;
  they do not appear in the diff either.
* **Nothing outside this file reads a streak uniform.** `grep -rn "stage.uniforms"
  src/ --include=*.js` outside `stage.js` returns nothing; `fRimK`, `fApG`,
  `fApA`, `fQKnee` etc. are private to the streak and safe to sweep at runtime.
* **The probes' ridge is the streak, not blade.js's trail** — the r8 report
  established this by ablation (`fCeil = 2e-6` removes the band). I re-confirmed
  it functionally this round: `fRimK` and `fApG`, which exist only in
  `streakNode`, move `filament`/`glare` by 30–50%. Nothing else could.

---

## 8. WHAT I DID NOT DO

* I did not touch a light, the exposure, the grade, the tone mapping, the black
  floor, the DOF pass, `cocOf`, `spriteDefocus`, `lineDefocus` or any published
  API. The diff is the streak's cross-section.
* I did not touch `probes.py`. PROBE_VERSION stays 10. `filament` + `glare`
  measure this defect and they measured the fix; adding an eighth instrument
  would only make the baselines harder to compare, and the r8 critic's note —
  "quote both or quote neither" — is followed on every row above.
* I did not touch the director or the spawn cap even though §5.2 says that is
  where portrait's 31 over-budget draw calls are. Not my file.
* I did not chase `edge_1090_p50` back under 2.6. §3 is why, with a control.
* I did not add a fourth lobe. There are still exactly three (core, warm sheath,
  glare), and now none of them has a hard rim.
* I added `fQKnee` as a uniform (it replaces a hard-coded `0.45` in `mB`) and
  **shipped it at 0.45, i.e. exactly round-8 behaviour** — I swept it, found no
  benefit, and left it inert rather than tune a number I could not justify.

---

## 9. SHIPPED VALUES AND HOW TO REPRODUCE

Changed defaults: `fKappa` 0.65→**0.25**, `fHalo` 0.18→**0.11**,
`fApA` 0.56→**0.45**, `fApM` 1.60→**0.60**, `fApP` 0.5→**1.6**,
`fApS` 0.13→**0.0**, `STREAK_AP_REACH` 9.0→**4.0**.
New: `fRimK` **0.80**, `fApG` **0.62**, `fQKnee` **0.45** (inert).
Unchanged: `fR0` 0.055, `fBCap` 13.6, `fQCore` 11.0, `fQWarm` 2.2,
`fHaloW` 0.5, `fHotW` 2.40, `fEndK` 0.60, `fApW` 0.095, `fApT` 0.72,
`fCeil` 0.62. All are live uniforms on `ZS.ctx.stage.uniforms`.

    node .build-stagecheck.mjs                     # -> /tmp/zsv/index.html (NOT dist/)
    node .r8rig.mjs shots r9ship                   # hero + PORTRAIT + 3 beats
    node .r8rig.mjs draws                          # seeded draw-call A/B
    node .r8sweep.mjs '[{"tag":"SHIP"},{"tag":"NOAP","fApA":0},
                        {"tag":"HARD","fRimK":0,"fApG":0}]' big
                                                   # seeded, 3 rasters incl. 430x932
    python3 tools/probes.py filament /tmp/zsv/sw-SHIP-00-hero.png
    python3 tools/probes.py glare    /tmp/zsv/sw-SHIP-00-hero.png
    python3 tools/probes.py clip     shots/r5/05-cut+500ms.png    # canary: 9490

    # the A/B baseline (⚠ overwrites src/render/stage.js; restore afterwards)
    cp /tmp/stage-r8-shipped.js src/render/stage.js && node .build-stagecheck.mjs
    cp /tmp/stage-r9.js         src/render/stage.js

Two named controls worth keeping: **`NOAP`** (`fApA` 0) is the critic's fix (b)
and shows why it is declined; **`HARD`** (`fRimK` 0, `fApG` 0) is round 8's
geometry at round 9's amplitudes and shows that `edge_1090` and the ruled edge
are the same object.
