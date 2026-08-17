# r10 — fruit-geo. The equator, and the two mechanisms that do not work

**File owned and touched:** `src/fruit/geometry.js` only (plus one ADDITIVE probe, below).
**Build:** `node build.mjs` clean.
**Canary, before and after my probes.py edit:**
`python3 tools/probes.py clip shots/r5/05-cut+500ms.png` → **mask_px 9490 / pct_R_ge_255 5.227** ✅

---

## 0. THE ONE CLAIM I PROVED

> **An azimuthal lobe cannot reach a side-on silhouette unless its PHASE varies with
> latitude.** The untwisted lobe this file has shipped since round 4 is worth
> **0.07 pp** of hull-concave depth; adding a twist takes the same body from
> *mathematically convex* to a real outline event, at the delivered fruit's own
> pixel size, in **both** delivered rasters.

Measured on the apple **with the stalk and the calyx ablated**, so that nothing polar
can contribute anything — 24 `director.js` poses, rasterised at the delivered fruit's
own mask size, traced by the **frozen `outline` probe** (`probes.probe_outline`,
unmodified, imported not copied):

| apple BODY only, mask 5.8–6.3k (shipped landscape apple is 6255) | hull_concave_frac_pct | hull_concave_depth_pct |
|---|---|---|
| body, no lobes at all | **0.00** | 1.94 |
| + the lobe that has shipped since r4 (k=5, a=0.075, **no twist**) | 0.39 | **2.01** |
| + `asym` (direction-domain fbm) raised 0.026 → 0.11 @ f2.4 | 24.61 | 7.48 |
| + `bend2` (quadratic banana) 0 → 0.20 | **0.00** | **1.87** |
| + k=3, a=0.11, **twist 6.0 rad** | 17.58 | **13.43** |
| + k=3, a=0.14, **twist 8.0 rad** | 22.27 | **20.96** |

Three results in that table, and two of them are negative:

1. **The verdict's prescription as literally written does not work.** It asked for
   `a_k cos(k·theta + phase(y))` with *phase drifting ~0.15 rad*. At 0.15 rad the
   term is the one already in the file, and the file's own six-round-old version of
   it moves hull depth by 0.07 pp. **The strength of that family lives entirely in
   `phase(y)`, not in `a_k`.** The mechanism: with phase and amplitude independent of
   `y`, the side-on outline half-width factorises as `rho(y)·M(roll)` — the meridian
   profile times *one number* — so there is no new event on it and `_limb_stats`'s
   k≤3 Fourier baseline absorbs the residue exactly. Only when the phase varies with
   `y` does the depth-max envelope pick a *different* azimuth at different heights.
2. **`bend2` (a quadratic bend) is exactly zero to three digits.** The r9 critic
   ruled out a linear shear on the grounds that an affine image of an axisymmetric
   silhouette is axisymmetric from another direction; that ruling extends to the
   quadratic banana term, because it is still a fibre-wise translation of each
   cross-section and the max over depth is unchanged. I built it before I trusted the
   argument.
3. **`asym` does reach the outline** (its wavelength is ~200°, far outside the
   `sqrt(2a)` envelope kernel) — but only at amplitudes where the fruit reads as
   diseased, which is the r5 corollary again.

---

## 1. WHAT SHIPPED

Two new SHAPE fields, both **default 0**, so every earlier round reproduces bit for bit
(verified: `limb`/`species` on the watermelon and pineapple are byte-identical, below).

* **`lobeTwist`** — lobe phase drift in radians per unit of profile `u`.
* **`lobeBias`** — 0 = the symmetric cosine of rounds 4–9; **1 = the same wave carved
  entirely INWARD as furrows.** Every species that took a lobe took it at bias 1, so
  the body's **max radius, on-screen height and the gap between the mesh's 1.05 R and
  `slicer.js`'s 0.975 R cut gate are exactly what they were.** A fruit must never be
  visibly wider than the radius a swipe has to cross to cut it (REFERENCE_BAR R3, hit
  generosity) — at `bias 0` a 24 % lobe would have widened that dead band by a third.
  Furrows are also what an apple's lobes and a melon's ribs physically are.
* **`crown.skin`** — a third option beside `woody`/`leafy`: leave a blade's `uv.y` in
  the BODY band so `species.js` paints it as peel. Used by the orange navel only.
  **This is a geometry-side choice of which uv band my mesh writes**, i.e. the
  contract at the head of `geometry.js`, and it required no change to `species.js`.

Per species: apple k=3 a=0.120 tw=6.0 bias=1 · kiwi k=3 a=0.100 tw=5.0 bias=1 ·
strawberry k=3 a=0.060 tw=2.5 bias=1 (shoulder band only) · orange k=3 a=0.055
tw=3.0 bias=1 + navel `skin:true`, len 0.185 → 0.270 · **watermelon and pineapple
untouched** (see §4).

---

## 2. MATCHED-SCALE, POSE-DISTRIBUTED DELIVERED PIXELS — BOTH RASTERS

Frozen `outline`, 24 director poses per species, **two rasters chosen to bracket the
delivered fruit** (landscape fruit are 49–110 px, portrait 39–107 px; mask_px printed
on both sides as rule 2 requires). Reported as the **MINIMUM over poses**, because the
verdict's whole point is that a median hides the pose lottery.

| `hull_concave_depth_pct`, WORST of 24 poses | mask ≈5.9k (landscape size) | mask ≈2.3k (portrait size) |
|---|---|---|
| apple | 30.90 → **35.47** | 31.78 → **35.42** |
| orange | 8.34 → **13.25** | 10.91 → **14.15** |
| **kiwi** | **2.32 → 14.73** | **5.21 → 17.59** |
| strawberry (r9's win — held) | 21.81 → 22.46 | 25.12 → 26.58 |
| watermelon (bit-identical) | 1.42 → 1.42 | 2.66 → 2.66 |

`mask_px` medians, HEAD → r10, at the two rasters: apple 5147→4666 / 1977→1797,
orange 6484→5887 / 2491→2264, kiwi 4887→4605 / 1773, strawberry 4355→4252 / 1634,
watermelon 5778→5778 / 2223→2223. (The rig auto-scales each pose to its own bbox, so
these are area-vs-bbox ratios, not on-screen size; on-screen size is set by
`species.radius` and `k`, and `bias 1` leaves the max radius alone.)

**The kiwi is the structural result.** r9 gave it a stem spur and left it convex in
every pose that hides the spur — worst-pose hull depth 2.32, i.e. nothing for a hull to
bridge. There is now **no pose of the kiwi that is convex**, at either raster.

`limb pose=ship n=32 rays=128 res=256`, HEAD → r10, reported beside `outline` as the
verdict asked:

| | hull_concave_frac_pct | hull_concave_depth_pct | mask_px_median |
|---|---|---|---|
| watermelon | 6.64 → 6.64 | 10.22 → 10.22 | 37503 → 37503 |
| orange | 18.75 → 25.39 | 13.90 → 20.63 | 42442 → 38653 |
| kiwi | 11.72 → 37.89 | 14.13 → 15.07 | 31984 → 30189 |
| apple | 50.78 → 66.80 | 45.05 → 48.08 | 33296 → 30386 |
| strawberry | 50.39 → 51.56 | 30.22 → 30.87 | 28560 → 27869 |
| pineapple | 67.19 → 67.19 | 34.58 → 34.58 | 24718 → 24718 |

---

## 3. DELIVERED FRAMES, BOTH ORIENTATIONS — INCLUDING THE ONE THAT DID NOT MOVE

⚠ **A concurrent agent (fruit-mat) was rewriting `src/fruit/species.js` throughout this
round** — its md5 changed *during* one of my capture runs. So I shot the A/B **twice**,
hours apart, and both pairs agree; where they disagree I say so.
Pair 1: `shots/r10-geo-base` (HEAD geometry) vs `shots/r10-geo` (mine).
Pair 2, back-to-back: `shots/r10-geo-C` (HEAD geometry) vs `shots/r10-geo-F` (mine).
All windows are the **frozen ones from my verdict**.

| `outline`, 11-combo+550ms | control mask | r10 mask | hull_concave_depth_pct |
|---|---|---|---|
| **L orange** `win=510:255:632:360` | 7956 | 7879 | **13.77 → 15.36** (both pairs, identical) |
| **L apple** `win=378:175:490:275` | 6269 | 5823 | **6.38 → 6.38** (both pairs, identical) |
| **P apple** `win=145:230:215:295` | 2250 | 1919 | 20.85 → 72.66 |
| L strawberry, r8's frozen crop of 09-combo+50ms `win=280:275:345:340` | 2268 | 2285 | 32.38 → 31.36, hull_frac 60.16 → 67.97, protr_max 26.82 → 27.56 — **held** |
| L / P whole watermelon `01-whole-watermelon` | 12616 / 4376 | 12600 / 4373 | 9.71 → 9.70 / 13.06 → 12.58 (mesh bit-identical) |

**The verdict's gate was `hull_concave_depth_pct ≥ 15` in both orientations for "apple
and kiwi".** Where I stand:

* **The window the verdict calls the kiwi contains the ORANGE.** There is no kiwi in
  `11-combo+550ms` in either orientation. The object at `510:255:632:360` is orange,
  has the pitted `pebble` peel only the orange carries, is 110×99 px (the kiwi is
  elongation 1.67 and much smaller), and carries the five-nub navel. I am not
  correcting a typo for its own sake — that window is the *gate*, and it now reads
  **15.36 ≥ 15 landscape**. In portrait, `11-combo+550ms` has only **two** resolvable
  components at all (a 107×152 merged blob and the apple); juice bridges everything
  else, so no portrait window for that fruit exists. I gate it instead on the
  matched-scale rig at portrait raster: worst-pose 10.91 → **14.15**, median 15.23 →
  **22.12**.
* **The landscape apple did not move: 6.38 → 6.38.** I am reporting that as a failure,
  and §5 is the measurement of why.
* Portrait apple 20.85 → 72.66 clears the gate, but I will not claim it as an
  equatorial result: rendered flat white, that number is the **stalk slot** (a polar
  event) cutting deeper into the mask. The honest equatorial number for the apple is
  the ablated-body table in §0.

---

## 4. GUARD-RAILS: I MOVED NONE, AND I DELETED WORK TO KEEP IT THAT WAY

`silhouette` on `01-whole-watermelon`, the r9 **cutter** verdict's ceiling
(≤ 0.0925 landscape / ≤ 0.0995 portrait), on the back-to-back pair:

```
control  boundary_cv 0.0926 L / 0.0995 P   max_protrusion 19.29 / 18.66  mask 12616 / 4376
r10      boundary_cv 0.0926 L / 0.0995 P   max_protrusion 19.40 / 18.58  mask 12600 / 4373
```

Identical to four decimal places, because **the watermelon mesh is bit-identical to
HEAD.** I built the melon lobe, shot it and measured it: it is worth **+0.7 pp** of
hull depth and it takes that same `boundary_cv` to **0.1208 L / 0.1272 P** — a 30 %
move on another piece's guard-rail, on the hero frame REFERENCE_BAR sizes with an
auto-fail. Not a trade worth making. The lobe came back out; `lobeN` is 0 on the
watermelon and `species`/`limb`/`outline` all reproduce HEAD byte for byte on it.

Other controls, all held:
* `species pose=so3 n=32 star=2048`: **star_multivalued_total 0** (cutter.js's
  star-shaped precondition), `identity` — the CONTROL, not a target —
  **0.9792 → 0.9896**.
* **Perf, both orientations, back-to-back pair.** control 75 draws / 147k tris L,
  115 / 151k P; r10 **89 / 165k L, 115 / 158k P**, `liveBodies` 51, 0 errors.
  Both inside the 120-draw / 250k-triangle ceilings **in portrait as well as
  landscape**. **Zero triangles added and zero draw calls added by construction** —
  `lobeTwist`/`lobeBias` are two extra multiplies inside the existing lathe loop and
  change no vertex count. One of every species at ULTRA **21122 → 21048 (−74)**, all
  of it the orange's crown band. Per species: watermelon 3636, orange 2394→**2320**,
  kiwi 2520, apple 2576, strawberry 3244, pineapple 6752.

---

## 5. THE OTHER HALF OF THE r9 FINDING, AND A NEW PROBE FOR IT

The r9 verdict proved the apple's mesh gain does not reach the shipped landscape
pixels and correctly ruled out "the calyx is dim" by sweeping the subject floor
8/4/2/1. There is a **second** mechanism it could not see, because nothing in the suite
could: **depth of field.**

**PROBE_VERSION 14 → 15. I ADDED ONE PROBE, `defocus`. I MODIFIED NOTHING.**
It reports the subject's limb 10-90 luma transition in pixels, using the *identical*
mask construction `outline` uses (`subject_mask` + `largest_component` inside an
explicit window — geometric, colour-blind) and the frozen `_radial_edges` /
`_edge_1090` pair, which it **calls rather than reimplements**. One SUITE row appended.
**Verified rather than asserted:** the full suite was captured on `shots/r5`,
`shots/r9`, `shots/r9-iphone`, `shots/r10-geo-base` and `shots/r10-geo-base-iphone`
under v14, the edit made, the suite re-run and **diffed key-by-key on all five — every
pre-existing row identical, only `defocus:11-combo+550ms.png` appears.** Canary
verified before *and* after.

⚠ `edge_1090_px` has a pixel-sized kernel, so **rule 2 binds it hard**: it is only ever
to be quoted as a **ratio between two subjects of comparable mask_px in the SAME
frame**, which is a within-raster comparison and immune to the resample problem that
reversed the sign of the r8 collar finding. It is documented that way in the file and I
have not gated anything on its absolute value.

**`shots/r9/11-combo+550ms.png` — one frame, one raster:**

| subject | mask_px | edge_1090_px med (p25 / p75) |
|---|---|---|
| **apple** `378:175:490:275` | 6260 | **3.656** (2.967 / 5.038) |
| orange `510:255:632:360` | 7955 | 1.225 (0.971 / 1.332) |
| strawberry `270:275:350:352` | 2239 | 1.202 (0.988 / 1.522) |

The apple's limb is **3.0× softer** than both fruit that bracket it in mask size, so it
is not a size effect: **in that frame the apple is the out-of-focus object.** The same
fruit in `shots/r9-iphone` reads **1.947 px — 1.9× sharper** — and portrait is exactly
the orientation where the r9 apple's outline scored (hull depth 20.85 against
landscape's 5.88). On my own frames: `r10-geo` L apple 4.916 px vs orange 1.094 px,
P apple 2.048 px.

Shallow DOF is **required** by REFERENCE_BAR R1b and is not a defect. What it means is
that an outline statistic on a defocused fruit is measured through a ~4-px kernel on a
99-px subject, and that **part of "the mesh gain did not transfer" is stage's focal
plane, not this file's geometry.** That is now checkable by anyone in one command.

---

## 6. THE ORANGE'S NAVEL: THE r9 NUMBER THERE WAS PART ARTEFACT

The verdict called that appendage *"a ragged tuft of disconnected islands that reads as
breakage or a rendering artefact"*. The cause is the uv contract at the head of my file:
the navel was `woody: true`, so `species.js` painted five blunt **peel** nubs dark
brown — and dark brown on a black background falls **below `subject_mask`'s luma
floor**. The nubs were scoring hull concavity **as holes in the mask**. That is the
"disconnected islands" reading and the r9 gain at that window in the same sentence.

`crown.skin` puts them in the body band so they shade as peel, which is what a navel
is; they then join the mask as real protrusions instead of gaps, and `len` 0.185 →
0.270 pays back the concavity the holes were counterfeiting. Delivered `outline`
13.77 → **15.36** landscape (both capture pairs), the species is **74 triangles
cheaper**, and by eye the navel is now a raised puckered ring rather than three black
chips (`shots/r10-geo-F/11-combo+550ms.png` at `510:255:632:360`, 4×).

---

## 7. WHERE I STOPPED, AND WHY THE EYE OVERRULED THE STATISTIC

The apple measures monotonically better all the way to a=0.170 / twist 7.5
(ablated-body hull depth 12.56 → 20.48). I **shot** that one: at 34 % peak-to-peak the
portrait apple in `11-combo+550ms` reads as a **faceted green gem**, not an apple
(`shots/r10-geo-A-iphone`). a=0.120 reads as a lopsided apple with a stalk
(`shots/r10-geo-F-iphone`). The statistic lost.

k=5 → 3 for a measured reason, not a botanical one: the depth-max envelope fills the
trough between two ridges 72° apart (cos 36° = 0.809) and barely touches one 120°
apart, so at equal amplitude k=3 delivers ~2× the outline swing. Ablated body, a=0.14,
tw=6: k=3/4/5/6/7 → hull depth **17.73 / 11.88 / 13.01 / 9.89 / 6.38**.

---

## 8. THE EXTERNAL REFERENT — NOT USED AS A TARGET

`rounds/verdicts/r10-referent-audit.json` returns **ACCEPT-AS-CONTROL**, not ACCEPT,
and its first fix reads *"Do not set an acceptance threshold on referent_gain this
round, and do not let any owner report a delta in it as progress."* My brief permits it
as a target **only** on ACCEPT. I did not target it, did not tune against it and quote
no number from it. I note only that its `whatWouldGameIt` §1 — "reshape any fruit as a
superellipse … with a k=2/k=3 bump of 3–12 % and the number goes 0.300 → 0.43–0.57" —
describes something adjacent to what I shipped, which is one more reason not to quote
it.

---

## 9. REQUESTS FOR THE INTEGRATOR (files I do not own)

1. **stage / DOF.** In `11-combo+550ms` landscape the apple sits 3.0× outside the focal
   plane of the two fruit either side of it (`defocus`, §5). REFERENCE_BAR wants
   shallow DOF and I am not asking for it to be removed. I am asking whoever owns the
   focal plane to check that the *hero-adjacent* fruit in the combo beats are not
   systematically the defocused ones, and to quote `defocus` on both orientations when
   they do. Every outline statistic this piece is scored on runs through that kernel.
2. **fruit-mat.** The orange navel now writes `uv.y` in the **body** band
   (`crown.skin`), not the stem band. `species.js:1771`'s `wood`/`leafy` ramps see
   nothing new — this *removes* five nubs from the appendage path rather than adding
   any — but it does mean the navel is now shaded by the orange peel shader at grazing
   angles. Worth a look on `08-citrus-caps`.
3. **A capture-hygiene problem that is nobody's piece and bit me twice.**
   `src/fruit/species.js` changed md5 *during* two of my capture runs. Delivered-pixel
   A/Bs are not attributable while two agents edit the same working tree. I worked
   round it by shooting the pair back-to-back and by re-running the whole A/B a second
   time (both pairs agree to 0.00 pp on the two headline windows), but the next round
   should serialise captures or give each builder a worktree.

---

## 10. ARTEFACTS

| path | what |
|---|---|
| `/home/claude/juice/src/fruit/geometry.js` | the only source file I changed; round-10 notes 10A–10D at the head |
| `/home/claude/juice/tools/probes.py` | **additive only**: `defocus`, PROBE_VERSION 15, one SUITE row |
| `/home/claude/juice/shots/r10-geo-F`, `…-F-iphone` | r10 geometry, both orientations |
| `/home/claude/juice/shots/r10-geo-C`, `…-C-iphone` | HEAD geometry control, shot back-to-back with F |
| `/home/claude/juice/shots/r10-geo`, `…-iphone`, `…-base`, `…-base-iphone` | the first (independent) A/B pair |
| `/home/claude/juice/shots/r10-geo-A`, `…-A-iphone`, `…-B`, `…-B-iphone` | the two rejected amplitude candidates, kept because §7 cites them |
| `/home/claude/juice/.r10georig.mjs` | private rig: rasterises silhouettes with the projection/scanline/centroid code copied **verbatim** from `_SPECIES_JS`, writes PGM per pose |
| `/home/claude/juice/.r10geoscore.py`, `.r10sweep.py` | drive the rig and score every pose through `probes.probe_outline` (imported, not copied) |
| `/home/claude/juice/.r10gate.py` | runs the frozen `outline`/`silhouette` gate on a shots dir, both orientations |

Re-derive the HEAD baseline in one command:
`git show HEAD:src/fruit/geometry.js > .geohead.js && python3 tools/probes.py limb src=.geohead.js pose=ship n=32 rays=128 res=256`
