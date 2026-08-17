# r10 — fruit-mat (`src/fruit/species.js`, materials only)

**PROBE CANARY, verified before the first edit and after the last, unchanged:**
`python3 tools/probes.py clip shots/r5/05-cut+500ms.png` → **mask_px 9490 / pct_R_ge_255 5.227**
(PROBE_VERSION was 14 at the start of my round and 15 at the end — another agent added a probe
while I was working. I ADDED NOTHING and CHANGED NOTHING in `tools/probes.py`; `git diff` on that
file is entirely the other agent's. Every number below comes from the frozen suite.)

---

## THE ONE CLAIM I PROVED

**At matched pose, the coarsened `fleshCells` ladder plus a deeper `grv` notch raises the cut
face's `speck_cov_pct` by +1.40 pp on landscape while holding round 9's chroma win to
0.0006 of `flesh_GR`. On portrait it does nothing (−0.47 pp, chroma held to 0.0025).**

And the more important half: **most of what this window has been reporting for two rounds is not
the material.** See §2 — it is the single biggest thing I found and it retro-actively explains the
number that sent me here.

---

## 1. WHAT SHIPPED, and every constant is re-integrated

`src/fruit/species.js` only. **+0 draw calls, +0 triangles, +0 material programs, +0 shader taps,
+0 ALU** — `pxFade` is a multiplier, not a branch, so both octaves were always evaluated. Measured
from the sanctioned reports: `peakDrawCalls` 93 landscape / **115 portrait** (bar 120),
`peakTriangles` 173 007 / 157 489 (bar 250 000), `programs` 0 in both.

| line | r9 | r10 | why |
|---|---|---|---|
| `fleshCells` o1 | `oct(8.5, 31.0, 7.0, 3.4)` | `oct(4.3, …, 3.4)` | crest ~2.1 px → ~4.2 px at the review raster |
| `fleshCells` o2 | `oct(16.0, 5.0, 44.0, 3.4)` | `oct(9.0, …, **6.5**)` | keeps the 1:2.1 octave ratio AND keeps the fine octave faded at review (see §3) |
| crest mix-to-mean, full | `0.5600` | `0.5648` | re-integrated; and it is now the *intermediate*-regime mean, which is the only one the constant is ever consulted in |
| crest mix-to-mean, `lite` | `0.3658` | `0.3830` | re-integrated |
| fine-octave DC | `0.3279` | `0.3273` | re-integrated |
| `grv` mix-to-mean | `0.2324` | `0.2195` | re-integrated |
| flesh ramp `t` | `.add(0.98).sub(grv.mul(0.36))` | `.add(0.98).sub(grv.mul(0.50))` | the amplitude, bought from the DARK end as the verdict required |
| `rough` budget | `.add(0.0280)` | `.add(0.0317)` | `= 0.14·E[bun_lite] − 0.10·E[grv]`; a function of the ladder |
| `sssMask` budget | `bun.mul(0.42).add(0.8464)` | `.add(0.8391)` | `= 1 − 0.42·E[bun_lite]`; contract v5 §4 area mean held at 1.0000 |

The DCs were re-measured with **`.r10matmean.mjs`** (new, mine; replicates this file's `noise2`
with the same `h1` in float32, integrates over the cap disc with the 2·r·dr weight, 3 M samples,
in the shipped graph's order). It reproduces `.r9matmean.mjs`'s 0.3658 / 0.3279 / 0.5648 / 0.2324
to within 0.2 % on the old ladder, which is the check that the replica is the shipped field.

    ladder / notch / base        E[t]     E[alb.r]   SD[alb.r]  alb G/R  t clamped at 1
    r9   8.5,16.0 / 0.36 / 0.98  0.8883   0.32327     0.04015   0.1213   27.7 %
    r10  4.3, 9.0 / 0.36 / 0.98  0.8923   0.32427     0.04090   0.1210   29.1 %
    r10  4.3, 9.0 / 0.50 / 0.98  0.8617   0.31957     0.04797   0.1208   29.1 %   <- SHIPPED

**Blast radius:** all four `fleshCells` call sites (albedo, `relief`, `rough`, `sssMask`) sit
between `wmLayers` and `orLayers` — this is the **watermelon cut face only**. No other species'
material is touched.

---

## 2. ⚠ THE FINDING THAT MATTERS MORE THAN MY DELTA

**On an unseeded harness, `speck_cov_pct` and `flesh_GR` on the r9 verdict's own landscape face
window are ~60–70 % determined by a nuisance variable that the probe already prints.**

I shot **22 landscape captures across 8 builds** (five material variants plus the control, several
repeats each). Sorting them by `pct_lum_le_25` — the frozen probe's own "how much of this ellipse
is not lit face" statistic — sorts them almost perfectly by the two numbers I was sent to move,
*irrespective of which build produced them*:

    r(pct_lum_le_25, speck_cov_pct) = -0.765      (n = 22, 8 builds)
    r(pct_lum_le_25, flesh_GR)      = -0.642
    r(flesh_GR,      speck_cov_pct) = +0.832

    every run with pct_lum_le_25 < 4.2  ->  speck_cov 23.6-25.2, flesh_GR 0.368-0.425
    every run with pct_lum_le_25 > 5.2  ->  speck_cov 18.1-21.3, flesh_GR 0.349-0.364
    both bands contain runs from the CONTROL and from four different experimental builds.

Three consequences, and I am not asking anyone to take them on trust — the 22-row table is
reproducible from `shots/r10-mat-*` with two frozen probe calls per row.

**(a) MY OWN VERDICT'S HEADLINE MOVEMENT IS PARTLY THIS ARTEFACT.** The r9 fruit-mat verdict's
`speck_cov_pct` "went the WRONG way, 23.17 → 18.21" is one r8 capture against one r9 capture.
Run the frozen probe again and print the nuisance variable beside it:

| | mask_px | **pct_lum_le_25** | speck_cov_pct | speck_median_area | flesh_GR |
|---|---|---|---|---|---|
| `shots/r8/05-cut+500ms.png` | 2685 | **5.14** | 23.17 | 2.0 | 0.3838 |
| `shots/r9/05-cut+500ms.png` | 2740 | **6.75** | 18.21 | 2.0 | 0.3591 |

The regression fitted on my 22 runs, `speck_cov = 26.76 − 1.028·pct_lum_le_25`, predicts
21.48 → 19.82 from the pose difference alone: **about a third of the 4.96 pp drop is the nuisance
variable, before any material changed.** I am NOT retracting the finding — the residual is real and
r9 did flatten the face — but the magnitude was overstated and it should never have been quoted
from n = 1 vs n = 1. (Note also that r8→r9's `flesh_GR` fell 0.3838 → 0.3591 in the *same* pair,
which is the chroma win r9 was credited with; the same regression predicts −0.0130 of that
−0.0247 from pose. Both of that round's headline deltas are partly the same artefact, in
opposite directions, which is exactly why it took two rounds to see.)

**(b) THE PORTRAIT WINDOW HAS THE OPPOSITE SIGN, so no single rule of thumb saves you.** 15
portrait captures, same construction: `r(pct_lum_le_25, speck_cov) = **+0.616**`,
`r(pct_lum_le_25, flesh_GR) = **+0.858**`. Landscape's contamination is *shadow* (dark pixels,
coverage down); portrait's is *green rind* (dark pixels, G/R up, coverage up). The two windows do
not even fail the same way.

**(c) SO EVERY NUMBER IN §3 IS QUOTED AS A POSE-CONTROLLED RESIDUAL, n ≥ 3 PER SIDE.** A raw
comparison of two captures on this beat cannot resolve anything smaller than ~5 pp of
`speck_cov_pct` or ~0.05 of `flesh_GR`, and I have four rounds' worth of published deltas smaller
than that in front of me.

**REQUEST TO THE INTEGRATOR (not my file, so I have not done it):** `tools/shoot.mjs` needs a
`--seed` that fixes the toss and the spray RNG. The stage owner asked for the same thing this
round from a different direction (its `clip` mask on 08-citrus-caps moved 5 046 → 10 182 px
between two runs of one build). This is now two pieces independently blocked by it, and it is the
cheapest instrument fix available to this project.

---

## 3. THE NUMBERS, BOTH ORIENTATIONS, AGAINST A SCALE-MATCHED PLATE

**RULE 2 FIRST — the plate is resampled so its melon face carries OUR mask_px, and the resample
works AGAINST me on the statistic I am claiming.** `reference/plate-01.png` (1672×941) → Lanczos
to width 479 (landscape) and 305 (portrait), the r9 critic's plate window scaled with the raster.
`mask_px` printed on both sides:

| | mask_px | speck_cov | speck_median_area | speck_n | p95/median | ang_energy_hi | radial_coh_hi | flesh R | flesh_GR |
|---|---|---|---|---|---|---|---|---|---|
| `/tmp/plateW479.png win=91:162:156:231 scale=0.70` | **2710** | 26.53 | **5.0** | 89 | 4.64 | **23.42** | 0.6097 | 189.1 | 0.3262 |
| `/tmp/plateW305.png win=58:103:99:147 scale=0.70` | **1105** | 27.42 | **4.0** | 43 | 5.40 | **18.67** | 0.7686 | 189.4 | 0.3308 |

⚠ **TWO OF THE r9 ACCEPTANCE TARGETS ARE CROSS-RESOLUTION AND ONE OF THEM ASKS ME TO BEAT THE
REFERENCE.** The verdict cites plate-640 (mask 4782, i.e. **1.8× our subject area**) for
`speck_median_area` 4.0 and `ang_energy_hi` 25.92, and sets the gates from those.
Matched to our mask, the plate reads `speck_median_area` **5.0** (harder — good, cite it) and
`ang_energy_hi` **23.42** (easier). The gate `ang_energy_hi ≥ 25` would therefore have required a
render **7 % more angularly contrasted than the photograph it is copying**, at k ≥ 6, on a face
whose fine band was already within 5 % of the plate. I am declining that gate as a rule-2 error
and reporting the matched number instead. I am *keeping* the harder `speck_median_area` bar.

### Landscape — `foam`/`spokes shots/…/05-cut+500ms.png win=216:284:298:382 scale=0.70`

| statistic | CTRL (r9 ladder, n=3) | SHIP (n=5) | pose-controlled Δ | plateW479 |
|---|---|---|---|---|
| mask_px | 2676 (2673–2679) | 2667 (2605–2711) | — | 2710 |
| **speck_cov_pct** | 18.80 (18.07–19.84) | 20.38 (18.74–23.42) | **+1.40 pp** | 26.53 |
| speck_median_area | 2.33 (2–3) | 2.40 (2–3) | ~0 | **5.0** |
| speck_n | 78.0 (74–82) | **90.6** (75–102) | +12.6 | 89 |
| speck_area_p95_over_median | 8.23 (4.63–11.55) | 7.02 (5.50–8.07) | −1.2 | 4.64 |
| ang_energy | 28.60 | 29.26 | +0.66 | 36.22 |
| ang_energy_hi (k≥6) | 22.43 (22.14–22.79) | 22.74 (22.39–23.25) | +0.30 | 23.42 |
| radial_coh_hi | 0.6113 | **0.5896** | −0.022 | 0.6097 |
| flesh R | 179.3 (177.4–181.2) | 176.4 (173.2–181.2) | — | 189.1 |
| **flesh_GR** | 0.3573 (0.3571–0.3576) | 0.3581 (0.3516–0.3679) | **−0.0006** | 0.3262 |

### Portrait — `win=262:308:96:154 scale=0.70`

| statistic | CTRL (n=6) | SHIP (n=7) | pose-controlled Δ | plateW305 |
|---|---|---|---|---|
| mask_px | 1059 (1020–1086) | 1080 (1053–1100) | — | 1105 |
| speck_cov_pct | 21.02 (18.82–22.83) | 20.40 (18.68–22.93) | **−0.47 pp** | 27.42 |
| speck_median_area | 2.0 (1–4) | 2.0 (1–3) | 0 | 4.0 |
| speck_area_p95_over_median | 18.79 (9.88–25.50) | 15.81 (6.97–30.20) | — | 5.40 |
| ang_energy_hi | 17.93 (16.28–19.99) | 17.65 (16.34–19.99) | −0.28 | 18.67 |
| radial_coh_hi | 0.6766 | 0.6974 | +0.021 | 0.7686 |
| flesh R | 177.2 (**159.3–186.9**) | 177.5 (**151.3–188.3**) | — | 189.4 |
| flesh_GR | 0.4033 (0.3771–0.4515) | 0.4011 (0.3803–0.4684) | **+0.0019** | 0.3308 |

Look at the portrait `flesh R` ranges: **37 display counts of spread across six runs of ONE
build.** The r9 acceptance gate `flesh R ≥ 185` on this window is not a statistic that exists at
that precision on this harness.

### Guard rails, none moved

`void` on `01-whole-watermelon`: `corner_max` 2.90 → **2.97** landscape, 2.96 → **2.98** portrait
(bar ≤ 3.0), `median_luma` 3.0 in all four. Perf as §1. Round 9's mix-to-mean guard is
untouched in form — only its constants are re-solved, which is what keeps it correct.

---

## 4. WHY PORTRAIT IS A NULL, and it is the next round's real problem

The crest width is authored in **cap units**, and the cap is not the same size on the two rasters.
From the probes' own ellipses: the landscape cut face is ~83 px across, the portrait one ~52 px —
**1.6×**. So the same field that renders a 4.2 px crest at review renders a 2.6 px crest on the
shipping raster, and no single value of `S` can be right at both. This is the pixel-threshold
disease named in rule 3, one level down: it is not a *threshold* expressed in pixels, it is a
*feature size* expressed in world units, and the fix is the same shape as the one the juice critic
asked for on `opt` — drive the noise scale off screen-space size rather than object space. I did
not attempt it this round: it risks texture swimming under the halves' rotation, which is the one
motion artefact this face cannot afford, and it deserves a round with a swim test in it.

---

## 5. TWO THINGS I BUILT, MEASURED AND THREW AWAY

Both are in the file's comments so the next builder does not re-buy them.

**(a) THE MEAN-RESTORING OFFSET ON THE NOTCH — the obvious move, and it is wrong.** Deepening
`grv` 0.36 → 0.50 costs 1.1 % of E[alb.r]; the natural fix is to raise the ramp base so E[t] lands
back on r9's value, solved *through* the clamp at +0.052 (base 1.032). Built and shot: it does not
brighten the face, it **pins** it. `t` is capped at 1.0, so the clamped fraction goes 29 % → 56 %
and more than half the face becomes exactly `ripe` before the `bun` mix, losing `gran`'s and
`cellv`'s mottle. `speck_cov_pct` 20.43 with the offset against 19.7–23.4 without;
`flesh_mean_rgb` R **166.0** against 173–181. Buying a mean back through a rail is not buying it
back.

**(b) COARSENING `gran` AND `cellv` TOO — no residual gain, and it costs the chroma.** After the
ladder moved to 4.3, the *finest resolved* fields on the face are `gran` (6.2) and `cellv` (6.5),
both finer than the crest network they were supposed to sit under; coarsening them to 3.4 / 3.6
(with `pxFade` and the DC subtraction re-solved, 6 runs) raises the raw coverage impressively —
until you regress out the pose:

    group                                 n  cov residual   flesh_GR residual
    CTRL (r9 ladder)                      3     -1.612          -0.0056
    SHIPPED (coarse ladder + notch 0.50)  5     -0.210          -0.0062
    notch 0.58                            3     +0.002          -0.0100
    coarse ladder, NO notch               3     +1.916          +0.0229   <- chroma blows up
    all fields coarse (gran+cellv too)    6     -0.500          -0.0037   <- no gain

The fourth row is the important one and it is why **the two halves of the r9 verdict's fix are
coupled and neither ships alone**: the coarser ladder alone raises E[t], re-clips R while G keeps
climbing, and puts `flesh_GR` at 0.3742/0.4178/0.4254 across three runs against a control that
measures 0.3571/0.3571/0.3576 across three — a regression 45× the control's own spread. The
deeper `grv` notch is what pays for it. The verdict told me to re-integrate the constants "or the
r9 fix silently re-breaks"; the mechanism turned out not to be the constants but the ramp mean,
and the warning was right anyway.

---

## 6. WHAT I DID NOT SPEND THE ROUND ON

* **`wetField`'s `lig`** — retracted by the r9 critic and I did not touch it. My own matched-scale
  numbers second the retraction from a third direction: `radial_coh_hi` is **0.589 ours against
  the plate's 0.6097** landscape and **0.697 against 0.7686** portrait. We are *less* radially
  organised than the photograph on both rasters. There is no starburst.
* **The stage delta.** Read and accounted for, not chased. Stage's per-channel knee took
  `clip pct_R_ge_255` on the landscape cut face **down** 0.351 pp — it handed me budget rather
  than spending mine — and its portrait and 08-citrus rows were inside its own repeatability
  spread. My `clip` measurements agree that the beat is not reproducible: across my own runs of
  one build the `clip` ellipse landed on mask 10 113 / 4 936 / 10 235, i.e. on a different object
  entirely in one of three. **I steered on nothing from `clip` and neither should the next round
  until the harness is seeded.**
* **`pale`, `ripe`, `deep`** — unmoved. Round 9's chroma solve is intact by construction.

---

## 7. REQUESTS TO OTHER OWNERS (rule 5 — I have not made these changes)

1. **Integrator / harness owner:** `tools/shoot.mjs --seed`. See §2. Two pieces are blocked on it.
2. **Whoever owns the beat schedule:** `05-cut+500ms` is the only frame either face window exists
   on, and its pose varies enough that `pct_lum_le_25` swings 2.6 → 9.9 landscape and 3.6 → 6.9
   portrait. A second, *later-and-slower* cut beat with the near half held closer to face-on would
   give this axis a reproducible subject at no perf cost.
3. **Concurrency note, for the integrator's serialisation:** `src/fruit/species.js` was edited by
   the cutter piece (the `COLLAR_FRAY` / `capCoords.fray` work) while I was measuring. Both sets
   of changes are present and `node build.mjs` is clean, but **every capture in `shots/r10-mat-*`
   and `shots/r10-fruit-mat*` predates the fray change**, and `shots/r10-mat-CTRL*` also predates
   fruit-geo's equatorial-lobe commit. Nothing in either touches the watermelon flesh material
   (fruit-geo's own note records the melon mesh as bit-identical), but the numbers in §3 are a
   material-only A/B and should not be re-derived by diffing my directories against a
   post-integration shot.

---

## 8. ARTEFACTS

* Shipping capture: `shots/r10-fruit-mat/`, `shots/r10-fruit-mat-iphone/`
* Control (r9 material, same tree otherwise): `shots/r10-mat-CTRL/`, `-2`, `-3`, `-iphone`, `-2..-6-iphone`
* Ship repeats: `shots/r10-mat-D-1..4`, `shots/r10-mat-D-1..6-iphone`
* Rejected variants, kept for the residual table: `shots/r10-mat-A` (fine octave left resolved),
  `shots/r10-mat-B` (mean-restoring offset), `shots/r10-mat-C*` (ladder, no notch),
  `shots/r10-mat-E-*` (notch 0.58), `shots/r10-mat-G-*`, `shots/r10-mat-H-*` (all fields coarse)
* Integrator: `.r10matmean.mjs` (and `.r10mc2.mjs`, `.r10mc3.mjs`, the clamp/`grp` diagnostics)
* Scale-matched plates: `/tmp/plateW479.png`, `/tmp/plateW305.png` (rebuildable — Lanczos from
  `reference/plate-01.png` to width 479 / 305, window `122:216:208:308` scaled by W/640)

**Score I would give this round on my own axis: a small, honest +. The face is measurably chunkier
at matched pose and the chroma is held to 0.0006, but `speck_median_area` is 2.4 against a
matched-scale plate's 5.0 and portrait did not move at all. The round's real product is §2.**
