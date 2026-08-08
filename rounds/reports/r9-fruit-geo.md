# r9 — fruit/geometry.js (outline identity)

FILE TOUCHED: `/home/claude/juice/src/fruit/geometry.js`. **Nothing else.**
`tools/probes.py` byte-for-byte unchanged — md5 `92cfaa0558c7ab6bd3547bfc8cc97ade`,
PROBE_VERSION 10; canary re-run after all edits:
`python3 tools/probes.py clip shots/r5/05-cut+500ms.png` → **mask_px 9490 /
pct_R_ge_255 5.227**. I added no probe and modified none.

Contact sheet: `/home/claude/juice/rounds/reports/r9-fruit-geo-silhouettes.png`
(6 shipping poses × 6 species, r8 row above r9 row for each).

---

## 0. HEADLINE

Five parameter-level edits, all in the `SHAPE` table. `limb pose=ship n=32
rays=128 res=256` — the pose distribution the game actually ships:

| species | hull_concave_frac_pct | hull_concave_depth_pct | protr_height_pct | tris |
|---|---|---|---|---|
| watermelon | 7.81 → **6.64** | 7.64 → **10.22** | 2.86 → **3.47** | 3636 → **3636** |
| orange | 0.78 → **18.75** | 2.38 → **13.90** | 3.02 → **8.98** | 2120 → **2394** |
| kiwi | **0.00** → **11.72** | 1.58 → **14.13** | 5.94 → **7.35** | 2560 → **2520** |
| apple | 41.80 → **50.78** | 45.59 → 45.05 | 8.15 → **13.10** | 2464 → **2576** |
| strawberry | 37.89 → **50.39** | 16.01 → **30.22** | 11.50 → **16.92** | 3048 → **3244** |
| pineapple | 67.19 (untouched) | 34.58 | 8.08 | 6752 |

Under uniform SO(3) the fraction column reads 8.20 / 16.41 / 12.50 / 41.80 /
52.34 / 64.06: **no species has a convex outline any more.** Two did.
`star_multivalued_total` **0** at detail 4/6/8/11 with `star=4096`.

---

## 1. ⚠ THE GATE I WAS HANDED IS ALSO SATURATED. MEASURED BEFORE I EDITED.

The brief says "STEER BY identity_recall". I ran it on the **r8** geometry first:

```
probes.py species pose=so3 n=32, r8 geometry — identity_accuracy by raster
  res    48      64      96      128     256        (chance 0.1667)
       0.9635  0.9844  0.9896  0.9896  0.9948
probes.py species pose=ship n=32 res=256  ->  1.0000, every species 1.000
```

That is the r8 geometry the critic looked at and could not name a single fruit
in. `identity` is a **6-way closed-set 1-NN on the full 64–128-bin normalised
radial signature**, and six bodies at elongation 1.01 / 1.14 / 1.33 / 1.35 /
1.62 / 2.57 are trivially mutually discriminable. "Not confusable with these
five" is not "nameable as an apple". Its entire dynamic range across everything
I tried is 8 misclassified poses out of 192, so every parameter moved it by 1–3
poses in whichever direction. **It cannot steer this piece.**

It is still a good CONTROL, and it earned its keep once: it is not gameable by
smoothing exactly as advertised, and it caught a real design error of mine — see
§4, the kiwi. r8 → r9 it goes 0.9635..0.9948 → **0.9688..0.9792** across the
five rasters, i.e. flat to within ±2 poses, and `pose=ship` stays **1.0000**.
I am not claiming an identity win. I am claiming I did not pay one.

## 2. WHAT I STEERED BY: `limb`'s CONVEX-HULL PAIR

`hull_concave_frac_pct` / `hull_concave_depth_pct` — the angular fraction and
depth of the gap between the traced outline and its own convex hull. That is
almost literally "is there something sticking out that a hull has to bridge",
which is what a viewer reads as a stem, a calyx, a crown or a flat. It has no
within-species denominator, so an appendage cannot be deleted to raise it; and
unlike a Fourier-residual statistic it cannot be faked by a narrow spike
dragging its own baseline up — which is precisely why the r7 author added the
hull control alongside `concave_frac_pct`. **Zero means convex**, and the orange
and the kiwi measured exactly 0.00 over 32 poses. Both probes were already in
the frozen suite; I added nothing.

## 3. THE FOUR DELETIONS THE INVALID GATE BOUGHT, ALL QUOTED FROM THIS FILE

| species | this file's own words | round |
|---|---|---|
| watermelon | "`facets` deleted: … pure within-species variance" | 6 |
| orange | "a sphere's normalised radial signature is FLAT … within-species distance collapses toward zero" | 6 |
| apple | "ablated entirely they take within-species distance 0.0320 → 0.0113 and separation 2.53 → 4.88" | 7 |
| strawberry | "so the tips sit inside the waist instead of 9% outside it" | 8 |

All four are within-species-variance arguments, i.e. arguments about
`separation`'s **denominator**, now marked DO NOT OPTIMISE. All four reversed.
The watermelon one matters most structurally: this file's own **5A theorem**
names exactly three mechanisms that can reach a silhouette — axis ratios, plane
cuts, appendages — and r6 deleted one of the three from every species.

## 4. ⚠ ONE DESIGN ERROR THE CONTROL CAUGHT, REPORTED BECAUSE IT IS INSTRUCTIVE

I first authored the kiwi's spur at `a 0.62 / len 0.34 / wArc 0.150` — which is
near-identical to the watermelon's shipped `0.72 / 0.36 / 0.150`. `identity`
fell on **both** species (melon 1.000 → 0.969, kiwi 1.000 → 0.906) and the
kiwi↔watermelon confusions rose 5 → 7. Making the kiwi's spur longer and the
melon's flat distinct (the ground spot) separated them again: melon back to
1.000 at res 96. A distinguishing feature that two species share is not a
distinguishing feature, and `separation` would never have said so.

## 5. ⚠ I DECLINE THE VERDICT'S APPLE FIX — AND I AGREE WITH HALF ITS REASON

The `fix` field: *"an on-axis PROTRUSION fails [because] the stalk sits at
screen-x 0 where the dome is already highest … which is exactly why the apple
measures protr_height_pct 6.38 while its stalk is authored at len 0.92 of body
radius"*, prescribing a ~15° tilt.

**(a) The premise is the wrong pose.** The 7A theorem it generalises is about an
axis tilted *out of the image plane* by `t`, constraining the outline at
screen-x 0. `director.js:93` holds local +Y **within 0.49 rad of the SCREEN
PLANE** — the probe harness encodes this as `shipQuat` — so the polar axis lies
*across* the frame and the stalk is at the SIDE of the outline. 7A is a theorem
about the well and it does not transfer to a protrusion under this pose.

**(b) The statistic quoted is not the stalk.** `protr_height_pct` is the MEDIAN
over every protrusion run in every pose, so it is dominated by lump-scale
events. The stalk is the apple's `hull_concave_depth_pct`, and that was already
**45.59** under the shipping pose — the largest single outline event in the
table bar the pineapple crown.

**(c) I built it anyway and measured it.** Profile stem cut to a 0.12 stub, the
stalk moved to a crown whorl `n:1, a 0.34, len 0.86`:
`hull_concave_frac_pct 36.72 → 26.56`, `hull_concave_depth_pct 35.28 → 17.14`,
`protr_height_pct 6.38 → 5.20`, `boundary_cv 0.090 → 0.077`, apple
`identity_recall 1.000 → 0.938`, **+324 triangles**. On a 90 px silhouette sheet
the shipped stalk is a thick unmistakable stalk and the tilted one is a hair.
The cause is in this file's own blade model: a crown blade is a *radial bump*
whose meridian half-width is `x2(e)·wp·(Rb + len·e)` and which tapers to a
point; the profile stem is a real constant-width tapered cylinder. **A stalk is
a cylinder.**

**What the verdict was right about is the calyx**, and that is the half I took —
`len 0.110 → 0.225`, jitter restored, for +112 triangles and
`hull_concave_frac_pct 41.80 → 50.78`, `protr_height_pct 8.15 → 13.10`, apple
`identity_recall` unchanged at 1.000.

I also decline the verdict's "STOP GATING on elongation_median". I stopped
*steering* by it, but I still report it, because it is the term the calyx eats:
strawberry `elongation_median` 1.348 → **1.279**, deliberately, still above r7's
1.191. That trade is the r8 gate being paid back, and it should be visible.

## 6. PIXELS — WHY THE FEATURES ARE FEW AND FAT

Delivered frames are **640×360** landscape and **215×466** portrait (only
`00-hero` and `14-hud` are 1280×720). Whole fruit in them are **49–107 px**
across in both. So an outline event needs ~3–4 px to survive, i.e. ≥6–8% of the
body diameter. That rule chose five big navel nubs over seven small ones (n =
5/6/7 at matched area gives hull depth 13.59 / 11.29 / 7.55 — seven nubs are
5.6° wide and 5.6° is sub-pixel here), kept the apple's cylinder, and put the
strawberry's sepal tips back outside the waist instead of 12% inside it.

## 7. PORTRAIT, EXPLICITLY

**Nothing in this file is a function of raster size, pixel width, `fwidth`, a
screen-space derivative, frame height or bokeh radius.** `makeFruitGeometry`
takes `detail` (the quality tier) and `species.radius` and emits world-space
vertices; `resolution()` reads only those two. **The same mesh ships in both
orientations**, so the r6/r7/r8 class of bug — a term correct at one raster and
wrong at another — cannot occur here.

What does differ is pixel scale, and it is *not* worse in portrait for the
gameplay frames: `r8-iphone/11-combo+550ms`'s two resolvable fruit are 106×156
and 64×49 px against landscape's 52–107. The one case where portrait is smaller
is the hero — `r8-iphone/01-whole-watermelon` at 18.45% of 466 = **86 px**
against landscape 40.56% of 360 = **146 px**, a 0.59× factor. So I re-rendered
every silhouette at **40 px**, under that worst case, and confirmed by eye that
the navel rosette, the kiwi spur, the apple serration, the strawberry horns and
the melon flat all still read. That 0.59× is also why the hero's facet was
placed for size rather than for strength: the botanically tidier placement
opposite the spur reads stronger (`hullF` 6.64 → 10.55) but costs **3.4% of
on-screen area**, and REFERENCE_BAR auto-fails a hero under 25% of frame height.
The chosen placement costs **0.65%** (`mask_px_median` 37749 → 37503) because
`kf = k·facetRaw/facetCut` puts the clipped body back on `radius*1.05`.

## 8. COST — MY DELTA

**Draw calls: +0.** No new object, attribute, group, material input, or exported
signature. `makeFruitGeometry(species, detail)` unchanged; output is still
non-indexed position/normal/uv with two groups (skin=0 all, cap=1 empty).

**Triangles, one of every species:**

| tier | r8 | r9 | Δ |
|---|---|---|---|
| detail 11 (ULTRA) | 20 580 | **21 122** | +542 (+2.6%) |
| detail 8 | 12 786 | **13 082** | +296 |
| detail 6 | 8 676 | **8 868** | +192 |
| detail 4 (LOW) | 5 292 | **5 324** | +32 (+0.6%) |

Per species at ULTRA: watermelon 3636 (**+0** — the facet is free), orange 2120
→ 2394, **kiwi 2560 → 2520 (cheaper)**, apple 2464 → 2576, strawberry 3048 →
3244, pineapple 6752 (**+0**). The kiwi is cheaper because `layoutRings` sets
`cols = res.crownCols` inside a band — it *replaces* a ring's column count
rather than adding to it — so a coarse crown band on a small fruit is a refund.
That is also why the orange navel runs `cols: 30` and not 42: 42 cost 220
triangles for a *worse* hull fraction (13.67 against 16.41).

Against r8's measured **214 619 landscape / 205 747 portrait** peak triangles at
a 250k bar (r8-integration §"Triangles"), a uniform +2.6% on the fruit
population would be ≈ +5.6k / +5.3k, i.e. **≈220k / 211k, still ~12–16% under
the bar.** No CPU-side change: the build is the same single O(vertices) pass and
`bladeHeight` still loops ≤24 blades.

**Cut cost, because four species gained appendages.** 300 random legal planes
per species (|d| ≤ 0.975 R, `slicer.js`'s own gate), counting connected
components of the section: planes whose SECOND loop is at or above
`cutter.js:289`'s 0.28 threshold — the ones that take the expensive layered cap
ring instead of `addFlatCap` — go **69 → 87 of 1800**, of which the pineapple is
53 in both. Section segment counts, which are what actually set cap triangles,
move mean 88–110 → 94–110 and max 156–212 → 174–212, with the pineapple's
dominant 746 unchanged.

## 9. CROSS-FILE SEAMS — WHAT I READ, NOT WHAT I ASSUMED

1. **`src/slice/cutter.js:278-292`** — read. It computes a per-loop radius,
   iterates every loop, and sends any loop under `0.28 * maxS` to `addFlatCap`.
   My added loops are appendage-tip clips; measured 2nd-loop size ratios are
   mean 0.093–0.285 against the pineapple's pre-existing 0.393.
2. **`src/fruit/species.js:1771-1786` `appendage()`** — read at HEAD. Two NEW
   consumers of the WOOD band appear this round (orange navel, kiwi spur, both
   `woody: true`). A woody blade's mark is `1.75 + 0.20·clamp01(h/crownMax)`, so
   at the root it is exactly 1.75 where `wood = ss(1.680, 1.755, uv.y)` = 0.991
   and `leafy = ss(1.020,1.120,uv.y)·(1-wood)` = 0.009 — no green on a brown nub.
   species.js's own documented FRINGE-QUAD trap applies to these two exactly as
   it already applies to the watermelon spur that ships today, and is defused
   the same way (`green` not completing until 1.600). **I did not need to touch
   species.js and did not.** `crownMax` on the apple moves 0.110 → 0.225 but it
   is that whorl's own `len`, so the calyx tip still marks 1.95 and `sh` still
   reaches 1.
3. **`director.js` pose** — the probe's `shipQuat` encodes ±0.49 rad of the
   screen plane; this is the fact §5(a) turns on, and it is why I quote
   `pose=ship` first everywhere.

## 10. STILL OPEN, HONESTLY

* **Mirror symmetry.** The r8 critic's "every silhouette is exactly
  mirror-symmetric about its projected axis" is only *partly* answered. The
  jittered calyx/navel/spur break it locally; the bodies are still solids of
  revolution plus a linear shear. I tested raising `bend` as a cheap fix and
  rejected it on theory, not taste: orthographic projection of a linear map of
  an axisymmetric solid is a 2-D *affine* image of that solid's silhouette from
  some other direction, so a shear converts a mirror symmetry into a skew
  symmetry and cannot create a spur that was not there. It would buy an
  appearance, not a feature.
* **The kiwi is still the weakest**, at `identity_recall` 0.938 and confused
  with the watermelon. A real kiwifruit's outline genuinely is a fuzzy barrel;
  its identity is texture and cut face, which are species.js's.
* **The orange body remains a sphere and should.** I restored only the navel.
  The r5 corollary (peel bumps are ~3° of arc, so `T²/8` caps them at 0.14% of
  radius) is a theorem about *relief* and still holds; plate-01's orange limb is
  smooth. What r6 also discarded was the one feature that is not relief.
