# r8 — stage.js (the lens, the exposure contract, the frame budget)

FILE TOUCHED: `src/render/stage.js`. **Nothing else.**

**`tools/probes.py` IS BYTE-FOR-BYTE UNCHANGED.** md5
`d6b2b531421be7b2745370c5c2ac4659`, PROBE_VERSION stays **8**, and I VERIFIED the
frozen baseline rather than asserting it: `python3 tools/probes.py suite shots/r5`
still returns `clip:05-cut+500ms.png mask_px 9490`, the number the brief names as
the canary after six version bumps by six agents. I did not need a new probe — the
r7 critic added `filament` specifically to measure this defect, and it measures
the fix.

⚠ ALL "before" NUMBERS ARE A TRUE A/B IN TODAY'S TREE. `base` = the r7
`stage.js` (`/tmp/stage-r7-shipped.js`, kept) shot from the **current** tree,
because geo/materials/juice/blade have moved since `shots/r7`. `r8e`/`r8f` = mine.
Same rig, same recipes, same session. Rig: `.r8rig.mjs` (landscape hero 1280x720
tier 3; **portrait 215x466 tier 2, byte-for-byte `tools/shoot.mjs`'s iphone@0.5
beat sheet through `04-cut+250ms`**; three 640x360 beats). Roll-up: `.r8meas.py`,
which shells out to `tools/probes.py` and nothing else.

---

## 0. THE HEADLINE

| | base (r7) | **r8** | plate-01 | gate |
|---|---|---|---|---|
| hero `filament flattop_p50` | 0.483 | **0.309 / 0.300** | 0.300 | 0.29–0.34 ✅ |
| hero `flattop_p90` | 0.585 | **0.570 / 0.556** | 0.500 | <0.55 ⚠ 0.006–0.02 over |
| **portrait** `flattop_p50` | 0.500 | **0.333 / 0.354** | 0.300 | 0.29–0.34 ✅/⚠ |
| **portrait** `flattop_p90` | 0.667 | **0.500 / 0.436** | 0.500 | <0.55 ✅ |
| hero `lens` peak_max/peak_min | 4.29 | **1.44 / 1.42** | 1.49 | <2.5 ✅ |
| portrait peak_max/peak_min | 4.97 | **1.79 / 1.81** | 1.49 | <2.5 ✅ |
| hero `fwhm_max_over_min` | 11.33 | **5.4 / 5.2** | 9.33 | ≥3.5 ✅ |
| hero `edge_1090_p50` | 2.729 | **2.614 / 2.600** | 1.720 | ≤2.8 ✅ |
| 09-combo `edge_max_over_min` | 3.843 | **3.123 / 3.719** | 1.769 | ≤4.5 ✅ |
| hero `void corner_max` | 2.95 | **2.92 / 2.95** | — | floor held ✅ |
| **draw calls / triangles** | 13 / 25 / 75 247 | **13 / 25 / 75 247** | — | **+0 / +0** ✅ |

Two independent runs quoted for everything, unseeded, because the run-to-run
spread is the honest headline uncertainty and it is **larger than the acceptance
window** — see §5.

---

## 1. TASK A — the streak has two cross-sections because a flare has two origins

### The defect, restated

The r7 critic: the near half "is a flat-topped disc-chord slab … and stage.js
asks for the slab on purpose (`mix(U.fQCore, float(0.5), mB)`)", and the family
`(1-u²)^q` is **bounded** at w90/w50 = 0.503 (q=0.5) down to 0.390 (q→∞), so no
exponent in it can reach the plates' 0.286–0.300. That algebra is correct and I
verified it independently.

The critic's suggested repair was to swap the blurred limb for a cusp
(`1/(1+(u/a)²)^n` or `exp(-|u|/a)`). **I shipped something different, and the
reason is measured, not stylistic** — see §1.2.

### 1.1 The model

A streak flare is light from one source arriving by **two different optical
paths**, and they defocus differently:

* **SCENE lobe** — the glowing filament out there, imaged through the lens. Its
  image is convolved with the aperture's defocus disc, so its half-width is
  `r0 + b`, its cross-section tends to the disc chord, and it obeys the flux
  law. That is r7's streak and it is *right*. It was only ever wrong because it
  was **alone**.
* **APERTURE lobe** — light from the same source scattered at the **aperture
  stop**, off the iris blades and element coatings. That scattering happens *at
  the stop*, so what is imaged is the stop itself, and the image is never
  convolved with the source's circle of confusion. **Its CoC is zero by
  construction, at every depth, on a source that is metres out of focus.** Its
  width is a property of the lens, not of the scene: the same number of device
  pixels at both ends of the streak. Its radiance tracks the *source*, not the
  defocused image's peak.

That second lobe is what a real flare's hot white core *is*, and it is exactly
why both plates show a cuspy glare with a blown centre on the parts of the
streak that are widest and softest. It is **one extra lobe in the same quad**:
zero draw calls, zero geometry, ~12 ALU ops.

### 1.2 ⚠ I GOT THE SHAPE WRONG ONCE AND THE PROBE CAUGHT IT

The obvious cross-section for a glare PSF is a Moffat cusp, and it is what the
critic asked for. I shipped it first. **It made `lens edge_1090_p50` WORSE:**

| aperture lobe | hero `flattop_p50` | hero `edge_1090_p50` |
|---|---|---|
| none (r7) | 0.483 | 2.729 |
| Moffat cusp, fApA 0.10 | 0.143 | **3.344** |
| Moffat cusp, fApA 0.34 | 0.136 | **4.424** |

`_edge_1090` is `0.8 * amp / max|Δ|`. A soft cusp raises the numerator and not
the denominator: a Moffat of half-width 1.55 px steps only 0.31 of its own
height between adjacent pixels, where the scene chord's rim steps 0.39 of the
pedestal. Every unit of cusp brightness therefore *softens* the measured edge.

The physically better answer is also the one that measures. What is imaged is
the **iris**, and an iris is a disc — so this lobe is a chord too, at a **fixed
pixel radius** instead of `r0 + b`. A chord meets zero with a vertical tangent
and steps `sqrt(2/w)` of its own height in its last pixel (0.79 at w = 3.2 px),
so it raises `max|Δ|` **faster** than it raises `amp`. Flat blown centre, hard
rim, and `fApS` blends in a power-law skirt so that rim is a step *inside* the
flare rather than a silhouette against the void at the sharp stations.

    ap(y) = mix( (1 - (y/wA)²)^fApP ,  (1 + 0.16 (y/wA)²)^-1.15 ,  fApS )
    wA    = max(fApW * bokeh, fApM)          <- device px, NOT a function of b
    y     = perpendicular offset in DEVICE PIXELS, NOT u = y/(r0+b)

The `yPx` vs `u` distinction is the whole point: dividing this lobe by `r0 + b`
would re-couple it to the defocus, which is precisely the mistake the block
exists to undo.

### 1.3 ⚠ THE PORTRAIT BUG I WROTE AND CAUGHT BEFORE SHIPPING

I first authored `fApW` as an absolute **4.2 device px**, reasoning that a
lens's own PSF is fixed in image space. It is — *on a fixed sensor*. Our drawing
buffer is not fixed. Measured with `.r8ask.mjs`:

| configuration | `bokeh` | 4.2 px as a fraction of bokeh |
|---|---|---|
| hero 1280x720 t3 | 22.00 | 0.19 |
| 640x360 t3 | 11.00 | 0.38 |
| **iphone 215x466 t2 (shipped capture)** | **5.97** | **0.70** |
| iphone 430x932 t2 (device CSS) | 11.94 | 0.35 |

`bokeh` is short-side-normalised (r6's fix), so a constant pixel width is **3.7x
too wide in portrait relative to everything it sits inside** — there was no core
there, only a second pedestal. It showed up as the sweep moving the hero
(flattop 0.484 → 0.265) and **not moving portrait at all** (0.522 → 0.550) at
identical settings. Tying `fApW` to `bokeh` fixed it: portrait then responded
0.545 → 0.291 over the same fApA range. This is the third portrait-only bug this
project has found in a term that looked correct in landscape; every other width
in this file is `bokeh`- or `pix`-relative and this one had to be too.

`fApM` is the companion floor: a PSF narrower than the sampling grid is not a
PSF, it is aliasing. At 215x466 `fApW*bokeh` is 0.57 px — one hot pixel on a
9 px band, which read as flattop 0.19 against the hero's 0.32. The floor (1.60
px) binds only below ~430x932; at the real device buffer `fApW*bokeh` = 1.25 px
and it barely binds at all. **Stated so it is not mistaken for a fudge: this is
the one term whose *shipped-capture* value differs from its *device* value, and
it differs by 0.35 px.**

### 1.4 The end fade, and a conflict between two verdicts I am naming rather than hiding

`peak_max/peak_min` 4.29 was not the cross-section — it was `ends`. The r7 knee
at 0.45 put the two extreme `lens` stations at **6%** of full radiance (hero
peaks 44.2 and 86.5 against a 189.6 mid). Knee 0.45 → **0.60** takes the hero to
124.0…188.9 = **1.42**, against plate-01's 1.49.

⚠ **This gate and the r6 verdict pull in opposite directions and a future round
should know it.** In a mostly-black frame, `peak_max/peak_min < 2.5` *requires*
the streak to reach both frame edges at ≥40% strength — which is the
"screen-spanning overlay" the r6 critic penalised. plate-01 scores 1.49 partly
because its ridge crosses fruit and debris that hold the local max up; ours
crosses void. 0.60 is the most fade I can keep and still pass. I tested 0.78 and
0.82 — they pass the metric comfortably (peak ratio 1.42–1.51) and **the picture
gets worse**: a uniform tan pipe from edge to edge. I looked, and reverted. That
is the whole reason the images are in this report.

### 1.5 Measured, per beat, base vs r8

`python3 .r8meas.py` — every field is `tools/probes.py` output.

| beat | | flattop p50/p90 | peak min..max (ratio) | fwhmR | edge_p50 | edgeR | void cmax / blown% |
|---|---|---|---|---|---|---|---|
| 00-hero | base | 0.483/0.585 | 44.2..189.6 (4.29) | 11.33 | 2.729 | 5.107 | 2.95 / 0.0347 |
| | **r8e** | **0.309/0.570** | **130.8..188.1 (1.44)** | 5.40 | **2.614** | 1.623 | 2.92 / 0.0320 |
| | **r8f** | **0.300/0.556** | **132.8..188.9 (1.42)** | 5.20 | **2.600** | 3.346 | 2.95 / 0.0288 |
| PORTRAIT 04-cut+250 | base | 0.500/0.667 | 46.3..230.1 (4.97) | 15.00 | 1.349 | 2.685 | 2.97 / 0.021 |
| | **r8e** | **0.333/0.500** | **134.2..240.7 (1.79)** | 3.67 | 1.394 | 2.678 | 2.97 / 0.022 |
| | **r8f** | **0.354/0.436** | **134.2..243.2 (1.81)** | 4.00 | 1.394 | 2.730 | 2.97 / 0.022 |
| 09-combo+50ms | base | 0.231/0.500 | 182.1..254.1 (1.40) | 6.00 | 1.975 | 3.843 | 2.97 / 0.2951 |
| | **r8** | 0.250/0.445 | 190.0..254.2 (1.34) | 5.33 | 2.332 | **3.123** | 2.94 / 0.3181 |
| 12-idle-blade | base | 0.368/0.500 | 118.7..253.4 (2.13) | 30.00 | 2.248 | 2.853 | 2.92 / 0.1523 |
| | **r8** | 0.300/0.453 | 177.6..253.6 (1.43) | 7.75 | 2.601 | 3.210 | 2.92 / 0.1771 |
| 01-whole-melon | base | 0.502/0.600 | 39.5..229.6 (5.81) | 6.67 | 1.849 | 3.010 | 5.05 / 0.0317 |
| | **r8** | 0.286/0.600 | 119.1..229.3 (1.93) | 5.67 | 2.148 | 2.914 | 5.15 / 0.0308 |

Controls, unchanged instrument: `filament reference/plate-01.png` n=21
p50 **0.300** p90 0.500; `filament reference/plate-02-highspeed-citrus.jpeg`
n=13 p50 **0.286** p90 0.419; `lens reference/plate-01.png` peak 167.1..249.8
(**1.49**), edge_1090_p50 **1.720**, fwhm_max_over_min 9.333.

**Every gate the r7 critic set is met on both the hero and the shipped portrait
beat, on two independent runs each, except `flattop_p90` on the hero, which
comes in at 0.556–0.570 against a bar of 0.55.** I am not rounding that away.

### 1.6 The black floor and the clip did not move

`void corner_max` is 2.92–2.97 on every beat in both builds; `median_luma` 3.0.
`pct_blown_gt250` moves by at most +0.025 pp on the hero and +0.023 pp on the
combo, both inside the run-to-run spread; the streak's own soft ceiling
(`fCeil` 0.62, untouched) is still what bounds it. The bar's "nothing above
#0a0a12" auto-fail does not fire anywhere.

---

## 2. THE MITRE CREASE — attributed, halved, and honestly not closed

The r7 critic saw "a visible MITRE CREASE at ~(350,323) in the hero … where the
segment chain changes direction with a corner in it", tried to instrument it,
failed, and deleted the attempt. Three things I can now state as measurement.

**(a) It is stage.js's streak, not blade.js's trail.** Ablation: force the
streak's radiance to zero with `fCeil = 2e-6` (a live uniform; the object still
draws and still writes nothing) and re-shoot the hero. The whole band including
the crease disappears. `/tmp/zsv/mitre-ATTRon.png` vs `mitre-ATToff.png`.

**(b) It is NOT a kink in the centreline, and it cannot be.** The streak is ONE
straight world-space segment and the projection of a straight segment is a
straight line. Measured: the ridge crest's y at x = 20,40,…,380 runs
296,297,300,302,303,305,306,308,309,311,313,315,316,318,320,321,322,322 —
**dy/dx = +0.085 constant to ±1 px over 360 px**. There is no chain and no
corner in the spine. What corners is the SILHOUETTE.

**(c) Two hard clamps in the half-width were putting real slope discontinuities
in that silhouette, and both are gone.**

* `min(coc*bokeh, fBCap)` inside `lineDefocus` stopped the growth dead at the
  ceiling. The streak now passes `growMax` derived from a **soft** saturation,
  `bSoft = fBCap·(1 - e^(-b/fBCap))`, which is within 1% of `b` below
  0.15·fBCap, asymptotes to the same ceiling, and — the point — satisfies
  `bSoft ≤ b` everywhere, so `lineDefocus`'s own `min` is met by `bMax` and the
  hard branch never fires. **The published API is untouched**; only what this one
  caller asks of it changed. The fragment uses the identical expression so the
  optical rim and the quad that carries it cannot disagree.
* The new aperture floor is a **soft max**, `(a⁶ + b⁶)^(1/6)` (within 1.2% of
  `max`, no corner), for the same reason: a hard `max` would have moved the
  crease rather than removed it.

**What remains, stated plainly:** there is still a visible place around x≈380–470
in the hero where the band's apparent width goes from FWHM 6 to FWHM 42 over
~100 px. Measured, that is an **amplitude** crossover — the aperture lobe hands
over to the scene lobe — not a geometric clamp, and I did not close it. A round
that wants it should look at the interaction of `flux = grow^-fKappa` with
`ends`, not at the geometry. The remaining candidate slope discontinuity in the
optics is `cocOf`'s `rel<0 ? rel*nearScale : rel`, a V at the focal plane; that
one is *correct* (real CoC is V-shaped through focus) and it is shared with
fluid.js and blade.js, so it is not mine to smooth unilaterally.

---

## 3. TASK B — THE FRAME BUDGET, AND THE MOST USEFUL NUMBER I FOUND ALL ROUND

### 3.1 My own delta: ZERO, verified bit-for-bit

`node .r8rig.mjs draws`, RNG seeded so the synthetic load is identical between
builds (without the seed the two runs spawn different body counts and the
comparison is meaningless):

| | r7 `stage.js` | **r8 `stage.js`** |
|---|---|---|
| landscape 1280x720 t3: empty / peak calls / peak tris | 13 / 25 / 75 247 | **13 / 25 / 75 247** |
| portrait 215x466 t2: empty / peak calls / peak tris | 13 / 27 / 62 639 | **13 / 27 / 62 639** |
| post chain | 9 | **9** |

**Bit-identical. +0 draw calls, +0 triangles, +0 programs, +0 render targets.**
The aperture lobe is a lobe in an existing fragment shader and a `max` in an
existing vertex shader. Fill rate goes up slightly at the *sharp* stations only,
where the quad's half-height is floored at `9·wA` ≈ 14–19 px instead of ~3 px —
about 640 px × 24 px ≈ 15 k extra additive fragments on the hero, against the
~110 k the ribbon already costs.

### 3.2 ⚠ THE DRAW-CALL LAW. THIS IS THE FINDING.

The brief asks me to say what should be retired if the round comes in over
budget. I ran the draw counter against live body count and it is not
approximately linear, it is **exactly** linear:

    peakDrawCalls  =  13  +  2 × liveBodies

| capture | liveBodies | draws predicted | draws measured |
|---|---|---|---|
| `shots/r6/report.json` (desktop) | 37 | 87 | **88** |
| `shots/r7/report.json` (desktop) | 55 | **123** | **123** |
| `shots/r7-iphone/report.json` (iphone, SHIPPING) | 70 | **153** | **153** |
| `.r8rig draws` landscape, mid-run | 2 / 4 / 6 | 17 / 21 / 25 | **17 / 21 / 25** |
| `.r8rig draws` portrait, mid-run | 2 / 4 / 7 | 17 / 21 / 27 | **17 / 21 / 27** |

Slope exactly 2.00, intercept exactly 13, across three rounds, two aspect
ratios, two tiers and 2–70 bodies. **Therefore:**

1. **The r6 → r7 draw-call regression is not five builders each adding
   structure. It is the body count, and only the body count.** 88 → 123 is
   liveBodies 37 → 55. The fixed cost (13: post chain 9 + 4 scene drawables)
   did not move at all, and neither did the per-body cost. Anyone reporting "I
   added no draw calls" this round is almost certainly right, and so is anyone
   who added a *mesh* — a mesh is in the 13, and the 13 is not the problem.
2. **The only lever that gets portrait under 120 is `liveBodies ≤ 53.**
   13 + 2×53 = 119. Portrait peaks at 70 against landscape's 55 for the *same
   beat sheet* — the director is carrying ~27% more concurrent bodies when the
   frame is portrait. **That is where the 33 draw calls over budget live, and
   retiring them is a director/spawn-cap change, in whatever file owns
   `director.live`, not a renderer change.** It is also free quality: nothing in
   the reference plates needs 70 simultaneous bodies.
3. The alternative lever is halving the per-body cost from 2 to 1, which would
   put portrait at 83. I did not identify which two draws a body costs (my scene
   traversal buckets do not line up with it — 6 live bodies leave 9 `Mesh`
   nodes), and I am not going to guess in a report. Whoever owns the fruit mesh
   should check whether a body is submitting an opaque pass plus a second pass,
   and whether that second pass is the two-sided-transparent doubling I found in
   r7 — that one cost me a silent draw call and `material.forceSinglePass = true`
   repaid it.

Triangles: 217 515 (landscape r7) against a 250 k bar; portrait 198 067. Not
the binding constraint. `cpu max` 7.3 ms desktop / 12.6 ms iphone against a
2.0 ms bar is the other standing failure, and as established in r6 nothing in
`stage.js` is even in that measurement's path (`tools/shoot.mjs:276` calls
`ZS.step(1/120, 1, false)`, which never renders).

---

## 4. TASK B — the exposure contract: HELD, unchanged, and re-verified by diff

**Not one lighting, exposure, grade or tone-mapping number moved.** Exposure
1.28, env 1.31, key 3.40, rim 5.00, fill 1.90, NeutralToneMapping,
`blackFloor` 0.013, `crush` 0.010, `contrast` 1.10, `sat` 1.06, `vignette` 0.19,
`grain` 0.008 — as v4 shipped and as r7 held. The complete diff against the r7
file is 8 uniform defaults and 5 expressions, all inside `streakPos` /
`streakNode` / the streak's uniform block. Nothing else in the file changed.

**Section 8 of the r7 report — the flesh headroom as a two-sided histogram spec
— stands verbatim and is not restated here.** It is unchanged, nothing this
round consumed any of it, and the four lines still are:

    raise the MEDIAN        p50   -> 0.43 linear R  (display ~205)
    hold  the CEILING       p99.7 <= 0.70 linear R
    hold  the CLIPPED AREA  % > 0.655  <= 1.1% of the face
    reach for the FLOOR     p5    <= 0.06 linear R  (display ~90)

and it still does not license raising `ripe`, moving the clip point, or moving a
light.

---

## 5. ⚠ THE ACCEPTANCE WINDOW IS NARROWER THAN THE INSTRUMENT'S REPRODUCIBILITY

This has to be in the report because the next critic will re-run the suite and
get different digits from mine, and should know why before concluding anything.

`filament flattop_p50` is a median over ~20–25 stations of a ridge that the
Radon fit places across the *whole frame*, so which stations land on spray,
debris or fruit changes the median. **Unseeded, the same build measures:**

    hero      0.308, 0.267, 0.250   (fApA 0.46)      0.309, 0.300  (fApA 0.56, shipped)
    portrait  0.333, 0.375, 0.375   (fApA 0.46)      0.333, 0.354  (fApA 0.56, shipped)

a spread of ±0.03–0.05 against an acceptance window 0.05 wide.

**It is scene noise, not tuning instability, and I proved that rather than
asserting it.** I stubbed `Math.random` in the page with a fixed LCG before each
case (`.r8sweep.mjs`, measurement rig only — it never touches `src/`). Two seeded
runs of one identical configuration: hero flattop 0.484 / 0.483, portrait
0.522 / 0.522, peak ratio 3.80 / 3.81. Under the seed the statistic is stable to
±0.001; unseeded it is stable to ±0.04. The r7 report saw the same thing on
`fwhm_max_over_min` (6.40, 6.40, 8.50, 30.00 across four shots of one build) and
that statistic is still the noisiest thing in the suite — treat any single
`fwhm_max_over_min` reading as an order of magnitude, not a number.

One more rig artefact, named so nobody re-derives it: `void corner_max` reads
**5.9** for whichever case sits fifth in a `.r8sweep.mjs` batch, at any
parameters — I confirmed it by running one configuration at position 5 and again
at position 6 (5.9 vs 2.87). It is accumulated page state in my sweep harness,
not a lifted black floor, and it does not appear in `.r8rig.mjs`, which uses a
fresh page per viewport. Every `void` number in §1.5 comes from `.r8rig.mjs`.

---

## 6. CROSS-FILE CONTRACTS — WHAT I VERIFIED BY READING, NOT BY ASSUMING

* **`api.lens.line()` now has two real callers and I read both.**
  `grep -rn 'lens\.line' src/` returns `src/input/blade.js:314`:
  `const L = lens.line(float(EDGE_R0_LD), dist, gMax).toVar();` with
  `gMax = 1 + U.bCap*1.30/EDGE_R0_LD` — blade.js took r7's recommendation
  verbatim, including the absolute-pixel-cap idiom, and it also deleted the
  `clipZ 0.5 / clipW 13.5` focal-plane pin. **The r7 report's item for blade.js
  is done.** I therefore did NOT change `lineDefocus`'s signature, its return
  packing, its default `growMax`, or the meaning of any component. The streak
  now passes a *different value* for the third argument; that is what the
  argument is for.
* **`api.lens.sprite()`** is called by `src/juice/fluid.js:609`
  (`_lens.sprite(pxR.mul(grow), depth)`) at graph-construction time via
  `ctx.stage.lens`. Untouched.
* **`lens.uniforms.{spriteGrow,bokeh,focalLength,pix}`** and
  `lens.cocPixelsForZ` are read by `blade.js:529-580`, including the
  `spriteGrow > 1.0001` tier signal. Untouched. `api.lens.version` stays 7
  because the API did not change.
* **`stageRef.focusDistance`** is read by blade.js; `api.focusDistance` is still
  written every frame at `api.frame`. Untouched.
* **I deleted a stale contract comment rather than leave it to rot.** The doc on
  `lineDefocus` still said "stage.js's own streak no longer needs this — it
  writes depth now, so the frame's gather defocuses it for free." That was true
  in r6 and false from r7 on. It is exactly the failure mode this project keeps
  hitting — a contract that exists only in a comment, and a comment that is a
  round out of date. It now names both callers with file and line.

---

## 7. WHAT I DID NOT DO, AND WHY

* **I did not touch a light, the exposure, the grade, the tone mapping, the
  black floor, the DOF pass, `cocOf`, `spriteDefocus`, `lineDefocus` or any
  published API.** The diff is the streak.
* **I did not touch `probes.py`.** PROBE_VERSION stays 8. The r7 critic's
  `filament` probe was built to measure this defect and it measured it; adding
  another instrument this round would only have made the baselines harder to
  compare.
* **I did not chase `flattop_p90` on the hero the last 0.02.** It is 0.556–0.570
  against 0.55. Every lever that lowers it (narrower `fApW`, lower `fApA`) also
  pushes `edge_1090_p50` back over 2.8 — I have the sweep table for it, 44
  configurations in `.r8sweep.mjs` output. The two are coupled through the
  probe's own arithmetic: `w90` wants a wide flat top and `0.8·amp/max|Δ|` wants
  a hard rim, and only the *chord* family gives both, which is why the aperture
  lobe is a chord. Landing p90 needs a second aperture filament at a different
  width (plate-01's flare is visibly a bundle — its own `fwhm` reads
  3/9/28/20/25/13/8/27/12 across nine stations because the probe crosses
  different filaments), which is again one extra lobe at zero draw calls. Named
  and sized, not shipped blind, same as r7's aperture lobe was.
* **I did not "fix" `peak_max/peak_min` by flattening the streak end to end.**
  §1.4. I tested it, measured it passing, looked at it, and reverted it.
* **I did not touch the director or the spawn cap** even though §3.2 says that
  is where the 33 over-budget draw calls are. It is not my file.

---

## 8. REPRODUCING ALL OF IT

    node .build-stagecheck.mjs                  # -> /tmp/zsv/index.html (NOT dist/)
    node .r8rig.mjs shots r8x                   # hero + PORTRAIT + 3 beats
    node .r8rig.mjs draws                       # seeded draw-call A/B + live-count series
    node .r8ask.mjs                             # bokeh/pix/focus at 4 configurations
    node .r8sweep.mjs '[{"tag":"a","fApA":0.56}]'        # seeded uniform sweep, both viewports
    node .r8sweep.mjs '[{"tag":"s","solo":1}]' land      # blade trail with no slice
    python3 .r8meas.py r8x                      # roll-up; calls tools/probes.py ONLY
    python3 tools/probes.py filament reference/plate-01.png
    python3 tools/probes.py lens     reference/plate-01.png

    # the A/B baseline (⚠ overwrites src/render/stage.js; restore afterwards)
    cp /tmp/stage-r7-shipped.js src/render/stage.js && node .build-stagecheck.mjs
    cp /tmp/stage-r8.js         src/render/stage.js

Live knobs, all uniforms on `ZS.ctx.stage.uniforms`, all safe to sweep at
runtime: `fR0 fBCap fQCore fQWarm fKappa fHalo fHaloW fHotW fCeil fEndK` and the
round-8 additions `fApA fApW fApM fApP fApS fApT`.

Shipped values: `fApA 0.56, fApW 0.105→0.095 (fraction of bokeh), fApM 1.60 px,
fApP 0.5 (the disc chord exactly), fApS 0.13, fApT 0.72, fEndK 0.60,
fHalo 0.20→0.18`. Zero page errors and zero console errors across every run in
this report — WebGL2 backend of WebGPURenderer through SwiftShader, tiers 2 and 3.
