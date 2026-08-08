# r7 — species.js (the cut face: the missing top quartile)

**FILE TOUCHED: `src/fruit/species.js` only.**
**`tools/probes.py` is byte-for-byte unchanged — md5 `a4ce559b3d557565a151857f69d62822`, PROBE_VERSION still 6. I added no probe, deleted no probe, and changed no probe by one character.** I did add a bench, `tools/r7bench-fruit-mat/`, which is a descendant of the r6 builder's `r6bench-fruit-mat` and carries the same warning in its README: **it is not a probe and its numbers are not suite numbers.**

I cannot run the harness, so every number below is either (a) the frozen probe on an existing shipped frame or on `reference/plate-01.png`, or (b) the bench, clearly labelled. Where the two meet I say so.

---

## 1. THE FINDING THAT MADE THE REST EASY: THE FACE IS NOT DARK, IT IS TRUNCATED

Both critics are right and they are describing one thing. I measured it instead of arguing about it. Take **plate-01's own melon face**, the frozen `foam` region (`win 320:565:545:805`, mask 42154 px), keep the reddish flesh, split it into quartiles of R, and invert each quartile through the shipped chain:

| plate-01 flesh | display RGB | scene-linear | display G/R |
|---|---|---|---|
| dark quartile | (139.3, 20.4, 10.8) | 0.2070 0.0293 0.0254 | 0.146 |
| mid | (192.7, 53.8, 35.4) | 0.3914 0.0633 0.0473 | 0.279 |
| **top quartile** | **(235.2, 114.7, 95.4)** | **0.5614 0.1626 0.1281** | **0.488** |

Divide by `E` at the load case measured in §2 and you get albedos — and this is the whole round:

```
plate ground albedo  (0.0733, 0.0126, 0.0172)    r6 `deep`  (0.0696, 0.0122, 0.0102)
plate mid    albedo  (0.2251, 0.0447, 0.0419)    r6 `ripe`  (0.2160, 0.0362, 0.0295)
plate BUNDLE albedo  (0.3650, 0.1385, 0.1332)    r6 has NOTHING here
```

**r6's `deep` is plate-01's ground to three digits and r6's `ripe` is plate-01's MID to two.** The r5/r6 solve was not too dark; it simply stopped at the plate's middle tone. The entire missing brightness is a missing *top quartile*, and that quartile is not "ripe pulp with the gain up" — it is **half as saturated** (albedo G/R 0.379 against the ground's 0.14), because a pale fibre bundle is dense scattering tissue, not juicier flesh.

This is exactly why EXPOSURE CONTRACT v5 §8.5 is right that a gain cannot fix it, and it is why the fix is a third population that exists **only where a resolved bundle is**.

## 2. THE FROZEN PROBE'S LOAD CASE, MEASURED FOR THE FIRST TIME

Rounds 3, 4, 5 and 6 all argued about this face's brightness without knowing its irradiance. `tools/r7bench-fruit-mat` sweeps the cap's orientation under the contract's exact rig. Running the **r6 file** through it:

| bench, r6 file | N.L 0.005 | 0.487 | **0.755** | **0.932** | 0.996 |
|---|---|---|---|---|---|
| flesh_mean R | 109.9 | 120.7 | **138.3** | **154.0** | 162.8 |
| % over linear 0.655 | 0.10 | 0.66 | **7.50** | **8.23** | 27.18 |

The shipped `foam 05-cut+500ms` row for r6 is `pct_R_ge_255` **6.780%**, `flesh_mean_rgb` R **125.7**. Only the N.L 0.755–0.932 band reproduces the clipping; the 125.7 sits under the bench's 138–154 because the shipped frame also carries the depth cue (×0.7 max) and the flare/bloom over the cut. **The probe's region is contract case M, not case A and not case B.** Everything below is solved there and checked at all five orientations.

## 3. WHAT CHANGED, AND WHY EACH THING IS THE ROUND-6 RULE AND NOT A NEW ONE

**(a) `pxFade` — `blobFade` for a noise field.** r6 applied "nothing below the pixel goes into the normal" to the foam; the r6 verdict then found the sparkle had merely *changed owner* (`speck_median_area` 3→2 px, `speck_pct_single_px` 28.7→36.0 against plate 16.4). The new owner was this file's own flesh detail, which never went through the guard. At the 640×360 review size, on a 104 px face:

| term | noise unit | finest octave | verdict |
|---|---|---|---|
| `ringN(ang, 10)` | 5.2 px | 5.2 px | marginal |
| `ringN(ang, 19)` | 2.7 px | 2.7 px | **sub-pixel** |
| `ringN(ang, 34)` | 1.5 px | 1.5 px | **sub-pixel** |
| `fbm2(q*9.5, 2)` | 5.5 px | 2.7 px | **sub-pixel** |

`pxFade(coord, px)` takes the coordinate the noise is sampled at and returns 1 while one noise unit spans `px` pixels, from `fwidth`. It is therefore automatically right under foreshortening, at hero size, and in portrait — which a radius threshold is not (see §6).

**(b) `fibreBundles` — one resolved anisotropic ridge field, three bifurcating octaves.** `1 - |angle-periodic value noise|` has a ridge at every zero crossing; the coordinate walks `2πK` noise units around the ring and only `2.14·Z` from centre to rim, so the anisotropy is free. The measured std of `1-|n|` is 0.227, so a threshold **is a band width**: `> 0.86` selects `|n| < 0.14` = 0.28 noise units = **4.6 px at the rim**, which is the "4–8 px wide, 14–20 px pitch" the verdict asked for.

| octave | K | strands | owns rad | pitch in its band | weight @114 px | @228 px |
|---|---|---|---|---|---|---|
| coarse | 3.5 | 11 | 0.26–0.66 | 13–16 px | 0.13 | 0.20 |
| mid | 7.0 | 22 | 0.22–1.00 | 16 px at rim | 0.66 | 0.88 |
| fine | 14.0 | 44 | 0.50–1.00 | 8 px at rim | **0.01** | **0.58** |

That weight column is `pxFade`, not a hand-set LOD: the fine octave is worth 1% of the field on the review frame and 58% on the hero. One expression, both distances, no popping, no second graph. Crest coverage 12% at review, 25% at hero — plate-01's top quartile.

**Two things I tried first and rejected on a rendered A/B, because both are r6's defect in a new costume:** a *wide* smoothstep on the ridge (0.70→0.985) renders as broad soft radial wedges with a sub-pixel core; a *single fixed* strand count renders as a starburst of wedges (pitch 16 px at the rim, 3 px at rad 0.2). Real fibre bifurcates. Hence three octaves, combined with `max` so the strands stay thin instead of summing into blobs.

**(c) The groove is the same field read from the other end.** `grv` is the complement of "is there fibre near this pixel", gated so the un-resolved cap centre falls back to the plain ramp instead of going uniformly dark. It costs no extra hashes and it is where plate-01's dark quartile and its standing juice actually live. r6 had no groove at all — its dark end came from noise symmetric about the middle of the ramp, which is a face with a mean and no shape.

**(d) The FLOOR gets the same structure, at the same area mean.** At key N.L = 0, `E_R` is 0.136, so **88% of what a cut-face pixel emits is the transmission floor and 12% is the albedo**. A constant floor makes the shadow-side half of every cut flat *by construction*, and no albedo work can reach it — that is the "flat maroon plate" reading, stated as arithmetic. `sssMask` is now multiplied by `(0.90 + 0.42·bun)`, whose area mean is 1.00, so contract v5 §4's budget line ("≤ 0.162 linear R, AREA MEAN at key N.L = 0") is held to two digits while the term stops being featureless.

**(e) `capBudget` was missing the floor, and it matters by 13%.** `CAP_CEIL = 0.655/E_B` is the albedo whose *diffuse alone* clips at N.L = 1 — but this file also spends §4's floor, which still delivered 0.115 linear R there. The real ceiling is `(0.655 − S)/E_B`. `capBudget` now takes that factor, computed per material from its own published `o.floor`. Skins pass nothing and are bit-identical.

**(f) The SSS lobe is made properly `away`-weighted.** §4 allows a peak of 1.6× the budget *"because it then contributes ~0 exactly where the diffuse peaks"*. Ours contributed 0.71× of the budget at N.L = 1 — not ~0, and 0.115 linear R of pure clip pressure on the one orientation the contract says to solve at. `SSS_AMB/SSS_GAIN` 0.46/0.75 → 0.28/1.05: **identical at N.L = 0** (the budget is normalised there, so every species' published floor is unchanged), 0.084 at N.L = 1, and 1.59× at the most backlit a visible face can be — inside the 1.6× allowance.

**(g) Roughness.** Dry flesh 0.34 → 0.45, `wetRough` 0.170 → 0.270, and `body.rough` now adds `bun·0.20` (a pale bundle is dry open tissue, juice runs off it into the groove) plus the variance `pxFade` rejected from the granulation. This is the single change that killed the clipping: it turns one blown specular blob into broad sheen across the face, which is what R1b asks for anyway. It costs hue — see §5.

## 4. THE A/B, BENCH, r6 FILE vs THIS FILE, SAME FROZEN PROBE CODE

`node build.mjs r6 /tmp/species-r6-baseline.js` is a byte copy of the r6 `species.js` (md5 `a9ec80537506b55cdee8a7e719f952b4`) built from today's tree. Region: frozen `probe_foam` machinery (largest luma component → second-moment ellipse, scale 0.80) on the graded bench frame.

| key N.L | 0.005 | 0.487 | **0.755** | **0.932** | 0.996 |
|---|---|---|---|---|---|
| **flesh_mean R** r6 → r7 | 109.9 → 113.4 | 120.7 → 131.1 | **138.3 → 161.2** | **154.0 → 183.6** | 162.8 → 195.5 |
| **face p50, linear R** | 0.160 → 0.175 | 0.192 → 0.230 | **0.237 → 0.304** | **0.282 → 0.390** | 0.365 → 0.486 |
| **% over 0.655** | 0.10 → 0.02 | 0.66 → 0.08 | **7.50 → 1.77** | **8.23 → 3.82** | 27.18 → **32.42** |
| **speck_pct_single_px** | 22.6 → 38.6 | 22.0 → 26.7 | **21.9 → 19.8** | **21.2 → 17.4** | 30.2 → 28.8 |
| **speck_median_area** | 3.5 → 3.0 | 4.0 → 4.0 | **4.0 → 4.0** | **4.0 → 5.0** | 4.0 → 4.0 |
| **flesh_GR** | 0.197 → 0.123 | 0.242 → 0.246 | **0.352 → 0.396** | **0.364 → 0.408** | 0.431 → 0.477 |

plate-01, same probe on the plate: flesh_mean R **189.2**, p50 **0.428**, % over 0.655 **1.21**, speck_median_area **6**, speck_pct_single_px **16.4**, flesh_GR **0.3392**.

At the load case the frozen probe actually samples, **flesh_mean R is +17% to +19%, the clipping is down 4.2× and 2.2×, and the speck shape has moved onto the plate** (17.4% single-pixel against the plate's 16.4%, median area 5 against 6 — the first time either number has been inside the reference).

And the quartile split — the measurement the whole round is built on — at N.L 0.932:

| | ground | mid | bundle |
|---|---|---|---|
| plate-01 | (139.3, 20.4, 10.8) | (192.7, 53.8, 35.4) | **(235.2, 114.7, 95.4)** |
| r6 | (116.2, 27.8, 12.7) | (154.2, 46.0, 27.6) | (206.2, 103.8, 80.6) |
| **r7** | (129.4, 40.9, 25.8) | **(187.0, 69.3, 51.3)** | **(227.3, 113.3, 90.6)** |

The bundle population now lands within 4 counts of plate-01 in all three channels, and the mid within 6 in R.

Rendered A/B at review size (r6 left, r7 right): **`rounds/reports/r7-fruit-mat-ab.png`**.

## 5. WHAT I MADE WORSE, SAID PLAINLY

**(i) `flesh_GR` rose 0.35 → 0.40 at the probe's load case (plate 0.339).** The quartile table says exactly where: the *bundle* is right to within 0.01 of the plate, and the **ground and mid are not saturated enough** (G/R 0.316/0.371 against the plate's 0.146/0.279). That is contract §4's **term C** — the flat achromatic ~0.020 lift from the env specular — and change (g) made it worse on purpose: raising the roughness spreads the same specular integral over the whole face instead of concentrating it in one blown blob. I bought clipping with hue and I would make the same trade again, because the blob was a REFERENCE_BAR auto-fail ("blade trail blowing out into a featureless white blob" is the same failure on a different surface) and because the shipped frame's own `flesh_GR` was 0.4448 anyway. I partly paid for it by cutting the floor's G and B (0.0220/0.0140 → 0.0128/0.0076), which is §4's own prescription — *"subtract ~0.020 from your G and B floor and leave R alone"* — and which is why the N.L≈0 face went 0.197 → 0.123.

**(ii) Clipping at key N.L = 0.996 went 27.2% → 32.4%.** That orientation has N·V = 0.485, i.e. the face is 60.7° off camera and a narrow ellipse. It is worse because the face is genuinely brighter, and `capBudget` is not what is binding (I checked: adding the floor-aware ceiling of (e) moved it by 0.03 points). If the next critic measures a frame posed there, this is the number to hit, and the lever is `pale` — 0.415 → 0.33 halves the clipping and halves the structure with it.

**(iii) `speck_pct_single_px` at N.L ≈ 0 went 22.6 → 38.6.** That face is now very dark and very saturated; its `speck` population is 44 components and the statistic is noise at that count. I record it rather than hide it.

## 6. PORTRAIT — MEASURED, NOT ASSERTED

Nothing I added has an aspect-dependent term. `pxFade` and `blobFade` both derive from `fwidth` of the *shading coordinate* in the real framebuffer, so they respond to actual pixel size; every other constant in `fibreBundles` (K, z, the radial gates) is in **normalised cap radius**, which is `uv.y`, a per-object quantity. There is no frame height, no camera distance and no aspect anywhere in it.

Demonstrated, not argued: the same cap at the same **apparent size** in 360×640 portrait (camz 34.9) and 640×360 landscape (camz 19.6), same probe region code:

| | mask_px | flesh_mean R | p50 lin | % over 0.655 | speck_median_area |
|---|---|---|---|---|---|
| landscape | 5715 | 161.1 | 0.304 | 1.03 | 4.0 |
| **portrait** | 5663 | 162.4 | 0.307 | 1.06 | 4.0 |

0.9% on mask, 0.8% on the headline, 0.03 points on clipping. Aspect-invariant.

## 7. COST — WHAT IT BOUGHT AND WHAT IT COST

**Zero draw calls, zero triangles, zero shader programs, zero uniforms, zero per-frame JS, zero allocation.** The perf brief's three tracked numbers (draw calls 88/120, triangles 164k/250k, JS frame max 3.4 ms) are untouched by construction — this is fragment ALU on cut faces only.

Estimated added ALU per **cut-face** pixel, per node slot (a cut face is a few thousand pixels of a 230k–920k pixel frame):

| slot | added | removed | net |
|---|---|---|---|
| `colorNode` | 3 ridge octaves + group ≈ 180 | old `ringN×3` + `fbm2` ≈ 170 | **≈ +10** |
| `normalNode` | same field ≈ 180 | old `ringN` + `fbm2` ≈ 90 | **≈ +90** |
| `roughnessNode` | 1 octave (`lite`) ≈ 60 | — | **+60** |
| `emissiveNode` | 1 octave (`lite`) ≈ 60 | — | **+60** |

≈ **+220 ALU per cut-face pixel**, against r6's +30. That is the honest price of the round and it is why `roughnessNode` and `emissiveNode` take a `lite` path (one octave, no group term) — they want the bundle as a modulator, not as a resolved population, and two more `noise2` taps each would buy nothing measurable. If an integrator finds this shows up, the `lite` flag is the knob: passing it in `relief` too costs the hero-size fibre in the normal and saves another 120.

## 8. WHAT I DID NOT TOUCH

* **The collar.** The verdict says it is fixed; `capShade`, `collarTilt`, `capKey`, `wmLayers`, the pith and rind constants are unchanged. `ring 05-cut+500ms` should not move except through the face behind it.
* **`probes.py`.** Byte-identical, PROBE_VERSION 6.
* **The other five species' bodies.** Two *shared* things did change and both are one-sided: `SSS_AMB/SSS_GAIN` (every species' floor is identical at N.L = 0 and smaller at N.L = 1, i.e. strictly less clipping) and `capBudget`'s new ceiling factor (strictly tighter, and only for materials that publish an `o.floor`). All six species' flesh **and** skin materials compile in the bench (`built=6`); I did not re-solve the orange's cut face and the r6 verdict's two untouched defects — the orange peel's square dot lattice and the watermelon skin's sawtooth stripe — are **still untouched, for a third round**. They are the obvious next target now that the melon face has structure.

## 9. WHAT TO MEASURE NEXT ROUND

`python3 tools/probes.py foam shots/r7/05-cut+500ms.png` (default `win 208:300:288:392`, quote `mask_px`) and `clip`/`ring` on the same frame. The bench predicts, at the load case that frame occupies: `flesh_mean_rgb` R in the 155–185 band against r6's 125.7, `pct_R_ge_255` **down** from 6.780 toward 2–4%, `speck_median_area` 4–5 against 2, `speck_pct_single_px` 17–20 against 36.0. If `pct_R_ge_255` instead goes **up**, the frame is posed nearer N.L = 1 than the bench says and §5(ii) is the reason.
