# r6 — fluid.js (droplet topology, the colour law, the density beat)

FILES TOUCHED: `src/juice/fluid.js` (mine) and `tools/probes.py` (added one
probe, bumped PROBE_VERSION — loud notice in §0). Nothing else.

---

## 0. LOUD NOTICE — PROBE_VERSION 2 -> 3, AND WHY

I added `tintlaw` to `tools/probes.py` and bumped `PROBE_VERSION` to 3.
**No existing probe's code changed by one character.** Verified rather than
asserted: `python3 tools/probes.py suite shots/r5` under v3 reproduces every
stored v2/v1 number exactly —

    clip:05-cut+500ms       5.227%  mask 9490                 ok (brief: 5.227%, 9490)
    particles:15-fast       n=67 medArea 4.0  meanSat 0.7982  ok (brief: 67 / 4.0 / .798)
    particles:16-slow       n=48 medArea 15.5 meanSat 0.8103  ok (brief: 48 / 15.5 / .810)
    droplets:04-cut+250ms   n=17 iou>=.90 52.94  mask 945     ok
    lens:00-hero            subject edge_1090 1.526           ok (r6-stage: 1.526)

The bump is bookkeeping, not an invalidation. Every v1/v2 number in an earlier
verdict remains comparable.

### `particles.mean_saturation` is blind, and I can prove it with the frozen suite

The brief says: *"Size separation WORKS: fast medArea 4.0 px vs slow 15.5 px, a
3.9x split. Saturation does NOT: 0.798 vs 0.810, indistinguishable... the fast
case must go achromatic."*

Run the same frozen probe on frames that contain **no juice at all**:

| frame | `particles.mean_saturation` |
|---|---|
| `12-idle-blade` — no cut, no droplets | **0.794** |
| `01-whole-watermelon` — no cut, no droplets | **0.818** |
| `15-fast-flick+50ms` | 0.798 |
| `16-slow-cleave+50ms` | 0.810 |

**The no-juice control sits between the two measurements it is meant to
separate.** 0.798 and 0.810 are the signature of the frame, not of the fluid.

Cause, found by stratifying that probe's **own mask** by luma (no new mask, no
new threshold — a decomposition of the identical pixel set):

| luma band | 15-fast n / meanSat / mean RGB | 16-slow n / meanSat / mean RGB |
|---|---|---|
| 0.03–0.06 | 7143 / 0.819 / (18, 10, 3) | 8205 / 0.816 / (21, 9, 4) |
| 0.06–0.12 | 134 / 0.537 | 195 / 0.886 |
| 0.12–0.25 | 116 / **0.188** | 86 / **0.609** |
| 0.25–0.50 | 54 / **0.056** | 80 / **0.375** |
| 0.50–1.00 | 3 / 0.085 | 11 / 0.195 |

96% of the mask is a dim warm wash at luma 0.03–0.06 — the blade streak's outer
glow and the bloom skirt, mean RGB ≈ (19, 10, 3), saturation 0.82, present in
identical quantity on the idle frame. It outnumbers the resolved droplet pixels
24:1 and owns the unweighted mean outright. **The droplets underneath it were
never the problem**: a fast flick's bright droplet pixels measure 0.188 and
0.056, a slow cleave's measure 0.609 and 0.375. The colour half of the speed
split has been working since r4 and no instrument in the project could see it.

This is the same class of failure the suite was built to end, and the third
instance found so far (refit ellipse mask; `G < 0.80R` foam mask; now a mask
whose 96% majority belongs to another module). I am not steering by a broken
ruler, so **I did not make the fast case whiter.** It is already white.

### `tintlaw` — what it measures and why each cut is legal

Two changes from `particles`, neither keyed on the colour being measured:

1. **Per BLOB, not per pixel**, and each blob's saturation is its own
   luma-weighted mean. A 7000 px wash cannot outvote 60 droplets, and a blob's
   core decides rather than its antialiased skirt (which sits on the background
   and takes the background's hue).
2. **Split by blob AREA.** REFERENCE_BAR R1b's actual law is *"tint must scale
   with droplet SIZE"* — a within-frame statement that no cross-frame scalar
   can test. Area is geometry; luma is brightness; neither is saturation.

`12-idle-blade` is now in the SUITE as a permanent **no-juice control**. Any
colour statistic that drifts toward the control's row is measuring the frame.

BASELINES (r5 frames, v3):

| frame | mask_px | n | sat_small | sat_large | **sat_blob_mean** |
|---|---|---|---|---|---|
| 15-fast-flick | 307 | 67 | 0.2486 | 0.1723 | **0.1879** |
| 16-slow-cleave | 372 | 17 | 0.6624 | 0.6002 | **0.5260** |
| 12-idle-blade (CONTROL) | 8857 | 12 | 0.6801 | 0.7370 | **0.5974** |
| plate-01 @640 | 8696 | 696 | 0.5768 | 0.5442 | 0.5686 |

Read: the fast/slow colour separation is **0.188 vs 0.526, a 2.8x split**, where
`particles` reported 1.015x. The fast frame is 3.2x clear of the control; the
slow frame is not, which is honest — a warm streak glow and red juice are
genuinely similar in hue, so the control bounds how much of the slow number one
should trust, and the *separation* is the number that matters.

`sat_size_slope` is slightly NEGATIVE in both (−0.076, −0.062): within a frame,
big blobs are not more tinted than small ones. That is the real, previously
invisible form of the critic's finding (B), and §3 fixes it.

CAVEAT I am obliged to state: on plate-02 this probe is near-useless (mask 210
px, 6 blobs) because the plate has a light background and
`largest_component(L > 0.06)` swallows the frame. plate-01 anchors it; plate-02
does not.

### And a plate anchor for `droplets` that nobody had published

The r5 verdict's ellipse numbers came from its own hand-rolled probe (plate-01
22.7% / 10.3%). Through the **frozen** `droplets` probe, plate-01 LANCZOS-resampled
to 640 wide (the shot width):

    plate-01 @640   n=110  medIoU 0.7436  pct_iou_ge_090 19.09
                           pct_boxfill_ge_078 3.64  medArea 23  p95/med 5.51

against r5:

    04-cut+250ms    n= 17  medIoU 0.9157  pct_iou_ge_090 52.94  boxfill 11.76  p95/med 3.40
    00-hero         n= 87  medIoU 0.9123  pct_iou_ge_090 56.32  boxfill 18.39  p95/med 4.53

---

## 1. TASK A — THE TOPOLOGY, and it is the whole round

### The r5 verdict is right, and it is a theorem, not an opinion

`R(theta) = 1 - lump*H` is a **single-valued radius about the particle's own
centre**, so the region is star-convex about that centre: every ray from the
centre crosses the boundary exactly once. A neck, a satellite, a pinched
doublet — every silhouette that dominates a real spray at 4–20 px — requires a
ray that crosses **twice**. No amplitude, phase, harmonic count or per-particle
random puts one in that family. Round 5 spent its entire budget searching a set
that did not contain the answer, which is exactly why 58.5% → 58.9% happened.

I tested the amplitude hypothesis before abandoning it, by rasterising the r5
field and pushing it through **probes.py's own `second_moment_ellipse`**
(400–500 seeds, 14 px diameter):

| family | `pct_iou_ge_090` | medArea |
|---|---|---|
| r5 outline, lump 0.30 (rim-bead median) | **99.2%** | 207 |
| r5 outline, lump 0.50 | 54.0% | 165 |
| r5 outline, lump 0.62 (past the authored max) | 33.8% | 144 |
| r6 union, lump 0.30 | **6.6%** | 144 |

The star-convex family bottoms out near 34% even driven past its authored range,
and it costs the drop a third of its area to get there. Amplitude was never the
lever.

### The change

`qn = min(qn_primary, qn_satellite)` — a **union of two distance fields**, in
the compact-drop branch of `shade()`. With the circles genuinely overlapping
(`|a−b| < sep < a+b`, guaranteed by the ranges) the boundary carries two
concave crease points and the silhouette is a peanut. The dome, the normal, the
fresnel rim and the caustic all follow whichever lobe won, so the crease is lit
as a crease and the drop reads as two beads mid-coalescence, not as one lozenge
with a dent.

Details that matter:

- **Quad remap.** The union spans `[-1, sep+bR]`, so the quad is remapped onto
  that box with a half-extent `hx` and centre `cx`. Perpendicular extent is
  `1 <= hx`, so the shape can never touch the quad edge and can never be clipped
  to a straight line. Verified over 500 seeds against both a square quad and its
  inscribed disc: 0 clipped.
- **The doublet axis IS the outline's roll axis.** No extra random, no extra
  transcendental.
- **The shading gradient is rotated back OUT of the roll frame.** r5 shaded from
  the unrolled quad on purpose — rolling the gradient puts every pip at a random
  angle again, which is the r4 defect the r5 header calls (l). With `dbl = 0`
  and `lump = 0` the new expression returns exactly `c/R`, so a single drop's
  highlight is bit-identical to r5's.
- **`lump` no longer carries `.mul(sharp)`** (r5 fix 1). It multiplied the only
  non-elliptical mechanism by `(1 − flat)`, i.e. to literally zero as a droplet
  defocused, so every soft blob in frame was an exact ellipse by construction —
  which is why `frac_Sol>=0.95` went UP. Convolving a peanut with an aperture
  leaves a peanut. Blur belongs in the alpha profile and the normal, and it is
  still there in both.

### A failure mode I found and killed — it would have passed the metric

`soft` fades alpha from `qn = vPlateau` (0.68 in focus), and on the doublet axis
the two lobes meet at exactly `qn = f`, the separation fraction. My first draft
used `f ∈ [0.66, 0.94]`. At f = 0.94 the bridge renders at 10% of the lobes'
alpha, the component labeller **splits the drop into two round dots**, and each
dot is a perfect ellipse — a worse picture that scores as more blobs. Simulated
through this exact alpha profile at thresholds 0.10 / 0.18 / 0.35:

| variant | fragments into 2 | `pct_iou_ge_090` |
|---|---|---|
| r5 single, lump 0.34 | 0 / 0 / 0 | 98.5 / 96.2 / 96.8% |
| doublet, f 0.66–0.94, no remap | **14 / 19 / 31%** | 3.8 / 2.0 / 0.8% |
| doublet, f 0.62–0.82, no remap | 0.8 / 2.3 / 7% | 7.5 / 7.0 / 4.0% |
| **doublet, f 0.62–0.82 + `qs` remap (shipped)** | **0.2 / 0.5 / 2%** | 9.8 / 8.8 / 8.0% |

The remap: `min(qn1, qn2)` overstates how close a texel is to the outline in the
waist, because the nearest real boundary there is the concave crease, not either
lobe's rim. `qs = 0.35*qn³ + 0.65*qn` pins `qs(0)=0` and `qs(1)=1` exactly (the
silhouette and the rim are untouched) and pulls the middle down, putting the
bridge back inside the plateau. `dblv` is 0 for every other particle, where this
is bit-identical to r5.

### Gating, and where it deliberately does NOT go

45% of **rim beads**, 35% of **spray above the resolvable threshold**. Not mist
(a 1 px grain has no silhouette to pinch, and round mist is what keeps the fast
flick's aerosol reading as aerosol). Not ligaments (already non-convex). **Not
cling** — cling sits ON the cut face, and a fatter cling sprite would push white
pixels into fruit-materials' `clip` metric, which is at 5.227% and is not mine
to move.

`DBL_AREA = 1.10` is a rendering compensation, not a size change: measured
through the rendered alpha profile (not the bare silhouette, which overstates
it) at thresholds 0.10/0.18/0.35 the areas are 140/173, 136/165, 130/151 px —
mean ratio 0.83, and 1/sqrt(0.83) = 1.10. `cls()` is still fed the
**uncompensated** size, so tint follows the droplet's real volume, not the quad
it happens to be drawn on.

### PREDICTION, stated before the render so it can be held against me

Simulating the shipped rim population (600 draws: p_dbl 0.45, lump 0.18–0.50,
the real `0.042 + 0.090u²` size law, the real alpha profile, threshold 0.18):

    r5 population   pct_iou_ge_090 96.33   boxfill>=.78 47.5   split 0/600
    r6 population   pct_iou_ge_090 53.83   boxfill>=.78 25.0   split 3/600

Relative factors 0.559 and 0.526. Transferred onto the frozen frame numbers:

| `droplets` | r5 | **r6 predicted** | plate-01 @640 |
|---|---|---|---|
| 04-cut+250ms `pct_iou_ge_090` | 52.94 | **~30** | 19.09 |
| 00-hero `pct_iou_ge_090` | 56.32 | **~31** | 19.09 |
| 04 `pct_boxfill_ge_078` | 11.76 | **~6** | 3.64 |

If the measured number lands above ~40 the change did not reach the pixels and I
want that said plainly. The residual gap to plate-01 after this is **content
diversity** (the plate has pineapple cubes, skin wedges, glassy fragments,
strawberry pieces), not topology — two analytic primitives cannot close it, and
pushing p_dbl higher would just swap one uniform shape for another.

---

## 2. TASK C — DENSITY, restored where it was actually lost

The verdict measured 04-cut+250ms losing 48% of its particle mass and the hero
56% of its blobs, while 02 (4413→4184) and 03 (7312→6196) roughly held. A loss
concentrated on the LATE beat with the early beats intact is a **lifetime**
signature, not a count one. Per RULE 2 the "+250 ms" beat is 92 ms of sim time.

Two levers, both on the class that is supposed to survive to that beat:

| | r5 | r6 |
|---|---|---|
| rim life draw | `0.060 + 0.245·rng()·rng()` | `0.070 + 0.300·rng()·rng()` |
| — median / max | 0.106 / 0.304 s | **0.126 / 0.369 s** |
| — alive at 92 ms sim | 60.3% | **73.5%** |
| `q.rim` tier 3 | 96 | **120** |
| spray life | `rr(0.048, 0.118)` | `rr(0.055, 0.145)` |

Compound expectation on 04-cut+250ms: 1.22 × 1.25 ≈ **1.53x** the surviving
mass, against the 1.92x that would fully undo the regression. RULE 3 holds: max
life 0.369 s is still clear of the 0.43 s citrus→fast-flick gap, so the two
speed-test frames stay independent measurements.

I deliberately did **not** raise `mist` (1500). 400 more grains is 4000 more
emitter iterations on a five-fruit combo frame against a JS budget that is
already blown at 7.7 ms max vs a 2.0 ms bar. The fast flick's aerosol-continuum
gap stays open and I am naming it rather than quietly trading perf for it.

---

## 3. TASK B — the ONE colour change the honest instrument supports

Not "make the fast case whiter" (§0: it is white, at 0.188 against a 0.597
control). The real defect `tintlaw` exposes is `sat_size_slope`, which is
**negative** in both test frames — within a frame, tint does not track size at
all. Cause, in the spray size law:

    base = 0.0085 + 0.050*filmness     ->  0.0585 for a cleave
    sz   = base * exp(0.9 * w^1.4)     ->  spans base .. base*2.46
    small (achromatic threshold)       =  0.022

For a cleave, `base` **alone** already sits 2.7x above the achromatic threshold,
so the entire slow-cleave spray population landed at `cls() >= 0.67` and every
grain of it was juice-coloured no matter how fine. plate-02 shows the opposite:
fine grains near the blade read silver while only the pooled film reads yellow,
because the scatter/transmit crossover is a function of DROPLET SIZE and of
nothing else.

Fix: a `low` factor that reshapes **only the bottom third of the draw**
(`w < 0.34`), scaled by `filmness` so a fast flick is untouched. Measured over
200k draws:

| | median sz | p95/med | frac achromatic | mean tint class |
|---|---|---|---|---|
| slow cleave r5 | 0.0824 | 1.64 | **0.0%** | 0.941 |
| slow cleave r6 | **0.0824** | **1.64** | **12.7%** | 0.773 |
| fast flick r5 | 0.0108 | 4.03 | 89.3% | 0.039 |
| fast flick r6 | 0.0108 | 4.03 | 89.3% | 0.039 |

The median and the whole fat end are **identical to four decimal places**, so
the fast/slow SIZE split — the one axis the brief says already works, 4.0 px vs
15.5 px — cannot move. What changes is that a cleave finally has a fine white
tail underneath its beads, which is also the heavier size tail the bar asks for.

Expected: `tintlaw:16-slow sat_small` falls from 0.6624 toward ~0.55 while
`sat_large` holds near 0.60, taking `sat_size_slope` from −0.062 to positive for
the first time. `tintlaw:15-fast` should not move at all — if it does, something
leaked.

---

## 4. WHAT THIS COST

| resource | before | after |
|---|---|---|
| draw calls (this file) | 2 | **2** |
| shader programs | 2 | **2** |
| instanced attributes | 6 | **6** |
| uniforms | unchanged | **unchanged** |
| fragment ALU per drop | — | **+~23** (union 14, inverse roll 4, `qs` 5) |
| JS per burst, tier 3 | — | **+24 rim iterations** (96 → 120) |

No new pass, target, texture, geometry or npm dep. No branch added (the union is
`min`/`select`, not an `If`). The +24 emitter iterations are ~40 float ops each,
i.e. well under 10 µs per burst against the 7.7 ms spike — I do not claim it
helps that spike and I do not believe it moves it.

The GPU cost that is real: rim beads live 19% longer and there are 25% more of
them, so slow-cleave rim overdraw rises ~1.5x. Rim is ~120 sprites against 1500
mist grains, so total drop fragment load on a cleave frame rises maybe 8–12%.
Fast-flick frames are unaffected (`nRim` there is ~5 beads by construction).

**peakDrawCalls 129 against a bar of 120 is still blocking and is still not
mine.** This file spends 2 of them and did not add one.

---

## 5. HANDOFF / RISKS

1. **Verify first:** `python3 tools/probes.py droplets shots/r6/04-cut+250ms.png`
   and `.../00-hero.png`. Predicted `pct_iou_ge_090` ~30 and ~31 against r5's
   52.94 / 56.32 and plate-01's 19.09. Above ~40 means the change did not reach
   the pixels.
2. **Then:** `python3 tools/probes.py tintlaw` on `15-`, `16-` and
   `12-idle-blade`. The control MUST be re-measured every round; it is the only
   thing that keeps a colour number honest.
3. **Watch for:** doublets fragmenting into two dots. Simulated at 0.2–2%, but
   `vPlateau` comes from stage.js's lens and I do not control it — if stage
   lowers the plateau for defocused sprites more aggressively this round, the
   bridge on a *defocused* doublet can thin. Symptom: `droplets.n_blobs` up
   sharply with `median_area_px` down. Remedy is one number: widen the `qs`
   cubic coefficient from 0.35 toward 0.55.
4. **Untouched on purpose:** cling (fruit-materials owns `clip`), mist count
   (perf), the sheet, the compute kernel, the lens boundary (§B4.1–B4.3 all
   still hold — `_lens.sprite()` is still the only CoC in this file and I added
   no second one).
5. **The measurement finding in §0 is the part most worth carrying forward.**
   If the next critic quotes `particles.mean_saturation` as a juice number
   without quoting the 12-idle-blade control next to it, the round is being
   steered by a statistic that reads 0.794 on an empty frame.
