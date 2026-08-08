# r6 — fruit/geometry.js (species identity by proportion and profile)

FILES TOUCHED: `src/fruit/geometry.js` (mine), `tools/probes.py` (added ONE command,
bumped PROBE_VERSION — loud notice below), `tools/geometry-r5-snapshot.js` (new,
not imported by the game; it exists so the r5 baseline is re-derivable).
Nothing else.

---

## 0. LOUD NOTICE — PROBE_VERSION 3 -> 4

I added the `species` command to `tools/probes.py` and bumped `PROBE_VERSION` to 4,
as the rules require. **No existing probe's code changed by one character**;
`PROBES` and `SUITE` are untouched. Verified rather than asserted —
`python3 tools/probes.py suite shots/r5` under v4 reproduces every stored number:

```
clip:05-cut+500ms        5.227%   mask 9490                  ✓ (brief: 5.227%, 9490)
particles:15-fast        n=67  medArea 4.0   meanSat 0.7982  ✓ (brief: 67/4.0/.798)
particles:16-slow        n=48  medArea 15.5  meanSat 0.8103  ✓ (brief: 48/15.5/.810)
silhouette:01-whole      bbox 116x148  aspect 0.7838  cv 0.1333  maxProt 28.38%
void:12-idle-blade       cornerMax 15.13  medianLuma 4.0
```

The bump is bookkeeping, not an invalidation. Every v1/v2/v3 number in an earlier
verdict remains comparable.

**Why `species` had to exist.** The r5 geometry verdict turns on exactly one
number — *"the between-species silhouette distance is 0.91-1.18x the WITHIN-species
distance"* — and nothing in the frozen suite could measure it. `silhouette` reads
ONE fruit out of ONE delivered PNG; it is the right instrument for "did the shape
reach the frame" and it structurally cannot answer "are the six species different
from each other", because that needs many poses of many species and no delivered
frame contains them. So the r3, r4 and r5 critics each hand-rolled a rasteriser
and I would have been the fourth. The one ruler that decides this piece lived in
`tools/critic5/` where the next round could not run it.

`species` does not read a PNG. It builds the **shipping** geometry (imports
`src/fruit/geometry.js` under node — no reimplementation), rasterises an
orthographic silhouette per pose, and reports per species: median elongation,
boundary cv, triangle count, `mask_px_median`, a star-shapedness check, and

```
separation = median distance to the NEAREST OTHER species
             / median distance within the species itself
```

Distance is the r5 critic's own definition — flip-invariant RMS between
mean-normalised 360-ray radial signatures, minimised over circular shift —
reimplemented independently, and it lands on their numbers. Their SO(3) median
elongations on the r5 geometry were 1.363 / 1.208 / 1.222 / 1.225 / 1.094 / 1.867;
this probe on the same geometry gives 1.418 / 1.221 / 1.225 / 1.165 / 1.111 / 2.082.

**The mask is geometric and cannot see colour at all**: it is the rasterised
triangle footprint, traced from its own centroid. `mask_px_median` is reported.

**Two pose distributions, default `ship`, deliberately.** The r5 critic sampled
uniform SO(3). `director.js:93` does not — it keeps local +Y within 0.49 rad of the
screen plane and rolls freely about it. Uniform SO(3) measures a fruit the player
never sees. Both are provided: `so3` is the harsher bound and the only way to
reproduce the stored r5 verdict, `ship` is what ships. Cost ~5 s.

```
python3 tools/probes.py species
python3 tools/probes.py species pose=so3 n=32
python3 tools/probes.py species src=tools/geometry-r5-snapshot.js       # the r5 baseline
```

---

## 1. THE DIAGNOSIS — the measurement was right and the STRATEGY was wrong

The critic: *"Four rounds of profile authoring have produced four variations of the
same ovoid."* Correct, and the reason is mechanical rather than a lack of effort.

Every identifiability term this file has ever added — `lumps`, `asym`, `facets`,
`rib`, non-circular waists — buys **roughness**, not **identity**. Roughness is
shared: it moves a species away from the smooth ellipsoid, but it moves every
species to the same place. That is precisely why six species landed in one band
(elongation 1.21-1.36, cv 0.078-0.130) and why the between/within ratio sat at 1.0.

And the three biggest of those terms had gone actively counterproductive, for a
reason outside this file. `asym`, `facets` and `rx != rz` were all introduced in r3
and r4 to defeat ONE failure mode — *a prolate body seen down its own pole is a
circle* — back when `director.js` spawned a uniformly random Euler so half of all
views were near-polar. Each of them is a **fixed body direction**, which is exactly
what made them work then. **r5's director stopped doing that.** Under the r5 pose:

* the **meridian profile is on the silhouette in essentially every delivered
  frame**, because a surface of revolution seen perpendicular to its axis projects
  its profile exactly — there is no depth-max envelope to erase it. (The r5 note
  "no relief field can reach a silhouette" is about the DIRECTION domain and is
  still true; it never applied to the profile.) Wells, truncated poles, cone apexes
  and shoulders became first-class and nobody noticed.
* a **fixed body direction is now pure within-species variance** — it swings on and
  off the limb with roll, inflating exactly the denominator of the critic's ratio
  while adding nothing to the numerator.

So r6 spends the entire budget on the two levers that are pose-stable AND
species-specific — **gross proportion** and **the meridian profile** — and deletes
the pose-unstable ones. Every `facets` entry in the file is gone. `rx == rz` on all
six species.

## 2. WHAT CHANGED, per species

| | r5 | r6 |
|---|---|---|
| **orange** | oblate 0.752, 2 facets, rib 0.042, asym 0.062, 7-nub navel crown | **a true sphere.** rx=ry=rz=1, p=2.04, navel+stem dimples only |
| **kiwi** | oblate 0.645 — the SAME BODY as the orange to 3 digits, both wrong in opposite directions | **truncated prolate barrel.** ry 1.44, pTop/pBot 5.2/4.6 so the poles are FLAT and the outline is a rounded rectangle with k=4 corner energy no ovoid here has |
| **watermelon** | ry 1.235, rz 0.818 (a 1.24:1 out-of-round waist that reads as a dent), 2 facets | ry 1.36, **circular waist**, facets deleted, deeper polar wells |
| **apple** | wellTop 0.265 = a 5% notch, i.e. decorative; stem r 0.076 | **the wells ARE the apple.** 0.52 / 0.42 with a narrower footprint so the crest is not dragged down with the floor: the dish is 37% deep and the outline reads shoulder -> crest -> dish -> stalk. Stalk r 0.076 -> 0.106 (21% of body diameter) |
| **strawberry** | pBot 1.34, a soft ogive; calyx sepals 0.66 long, i.e. the LEAVES were the widest part of the fruit and cancelled the cone (measured elongation 1.094) | **a real cone.** pBot 1.08 ≈ rho = 1-\|u\|, apex curvature <3% of the waist, ry 1.42; calyx halved to 0.34/0.27 and pulled onto the shoulder so it serrates the profile instead of replacing it |
| **pineapple** | rz 0.882 | rz 1.0. **Crown untouched** — it is the one thing the r5 critic accepted |

## 3. THE NUMBER — through the new frozen probe, both pose distributions

```
                 director pose (ship)      uniform SO(3)  (the r5 critic's test)
                 r5      r6                r5      r6
  watermelon    1.94 -> 7.73              2.08 -> 3.24
  orange        1.64 -> 10.92             1.21 -> 5.55
  kiwi          2.07 -> 10.18             2.20 -> 7.54
  apple         2.69 -> 2.55              1.68 -> 2.47
  strawberry    2.08 -> 2.90              1.73 -> 2.06
  pineapple     3.20 -> 2.77              2.79 -> 2.13
  WORST         1.64 -> 2.55              1.21 -> 2.06
  median        2.08 -> 5.31              1.90 -> 2.86
```

The critic's ship bar was *"do not ship until the ratio clears 1.6 for every
species"*. The worst species clears it by **29% under uniform SO(3)** and by **59%
again under the pose the game actually ships**. It also holds at every quality
tier: worst 1.73 at detail 4 (LOW), 1.93 at 6, 2.09 at 8, 2.55 at 11.

Median elongation, which was the critic's headline "one band 1.21-1.36":

```
                r5      r6                          r5      r6
  orange       1.208 -> 1.013     watermelon       1.363 -> 1.349
  apple        1.225 -> 1.161     kiwi             1.222 -> 1.636
  strawberry   1.094 -> 1.251     pineapple        1.867 -> 2.089
```

Six species now occupy 1.01 / 1.16 / 1.25 / 1.35 / 1.64 / 2.09 instead of four
sitting inside 0.15 of each other.

**Both columns are re-derivable, not quoted.** `tools/geometry-r5-snapshot.js` is a
reconstruction of the r5 table whose fidelity is pinned by triangle count —
3480/3144/2300/3376/5616/8376, total 26292, exactly what the r5 critic got
rebuilding it independently — and the two commands above print the two rows.
Round 5 plateaued partly because each round's baseline lived in that round's
scratch directory.

**Eye check**: `rounds/reports/r6-fruit-geo-silhouettes.png` is an unlabelled 6x6
binary contact sheet, one species per row, six shipping poses, **shared world
scale** so relative size shows too. Rows 1-3 of the r5 sheet were "unsortable, the
same lumpy ball five times over". These are a prolate melon with a stem spur, a
circle, a capsule, a dished apple with a stalk, a heart with a serrated cap, and a
crowned pineapple.

## 4. PERFORMANCE — it is 11.7% CHEAPER, and that is a second structural change

The brief says a change that costs a draw call or a millisecond must say so. This
one costs neither and *returns* triangles.

Columns buy screen-space quantities (silhouette smoothness, relief and crown
resolution), so they should scale with on-screen size. `layoutRings` has always
applied that rule WITHIN a fruit (`cols ∝ ring radius`) and **nothing applied it
ACROSS species**, so a 0.62-unit strawberry carried the same 60 columns as a
1.55-unit watermelon and spent ~2.4x the triangles per covered pixel.
`resolution()` now takes the species radius and applies a gentle `sizeF`,
floored at 0.72 and reaching 1.0 by radius 1.35 — so **the watermelon and the
pineapple are bit-identical to r5** and the crown the r5 critic finally accepted
is not touched at all.

```
one of every species, detail 11 (ULTRA)          detail 4 (LOW)
  watermelon  3480 -> 3636   strawberry 5616 -> 3780
  orange      3144 -> 2120   pineapple  8376 -> 8376      6528 -> 5840  (-10.5%)
  kiwi        2300 -> 2560   TOTAL     26292 -> 23212
  apple       3376 -> 2740                      (-11.7%)
```

Auto-fail check ("visible polygon facets on a fruit silhouette"): worst case is the
strawberry at 46 columns on a body 120 px across at review framing → silhouette
sagitta `60*(1-cos(pi/46))` = **0.14 px**, two orders of magnitude under a pixel.

* **Draw calls: +0.** No new mesh, group, material input or attribute.
* **Shader programs: +0.** Nothing here touches a material.
* **JS frame time: +0.** Build is the same single O(vertices) pass; geometry is
  built at spawn, not per frame, and is now *smaller*.
* **Peak triangles**: the r5 harness measured 215606 of 250000. The delta from this
  file is negative in every configuration, so headroom only grows.

Also, size on screen — the axis the critic keeps marking down. r5's note 5C blamed
`k` for giving away 14-22% of linear size; it was only half `k`, the other half was
the out-of-round waist, which loses area in every view and (post-r5-director) buys
nothing. Mean silhouette area over 24 shipping poses, fixed 4.0-unit window:

```
  watermelon 5.587 -> 5.981  (+7.1%)     apple      2.325 -> 2.507 (+7.8%)
  orange     2.327 -> 3.096  (+33.0%)    strawberry 1.333 -> 0.958 (-28.1%)
  kiwi       1.400 -> 1.458  (+4.1%)     pineapple  9.186 -> 10.172 (+10.7%)
```

Five of six get bigger; the hero watermelon is **+3.5% linear for free**. The
strawberry pays 28% of its area, which is what a cone costs against a lozenge and
is the entire point — and it costs **no frame height**, because height is pinned at
`2.1 * species.radius` by the normalisation regardless of profile.

## 5. SAFETY — this round changed profiles that the cutter walks, so it is verified

* **Star-shapedness (the hard cutter.js precondition) is now MEASURED, and it never
  was before.** A ray cast from the origin in 4096 Fibonacci directions hits the
  shell exactly once for all six species at detail 11, and in 2048 directions at
  detail 3/4/6/8. **Zero multi-valued directions anywhere.** The deep apple wells
  were the specific worry. This check is part of the new probe
  (`star_multivalued_total`, which MUST read 0) so it can never silently rot.
* **Cut topology.** 400 random legal planes per species (`|d| <= 0.975*radius`, the
  slicer's own gate), counting connected components of the intersection curve. The
  apple — the species I changed most — is at **23.9%** multi-loop against **22.8%**
  for the identical geometry carrying r5's shallow wells, i.e. inside the noise and
  driven by the calyx and stem both versions share. Ring segment counts (the cap
  cost driver) unchanged: apple mean 112 / max 199.
* **Output contract**, asserted over 36 builds (6 species x 6 detail levels):
  non-indexed; `position`(3)/`normal`(3)/`uv`(2) with equal counts and count%3==0;
  exactly two groups `[0,n,mat 0]` and `[n,0,mat 1]`; every normal unit length;
  bounding sphere present. All pass.
* **uv bands unchanged** (`species.js` reads `leaf = smoothstep(1.0,1.14,uv.y)`,
  `wood = step(1.72,uv.y)`): uv.y range is [0, 1.95] for the five species with a
  stem and [0, 1.70] for the pineapple, exactly as documented.
* **Exported signature unchanged**: `makeFruitGeometry(species, detail = 3)`.

**A stale note in this file was corrected, and it mattered.** Rounds 3-5 warned that
a second disjoint cut loop "cutter.js does not cap, leaving that blade tip
unsealed". That has not been true for some time — `cutter.js:286` iterates EVERY
closed loop and caps each one. I checked before relying on it, because the deep
apple well produces annular sections by construction.

## 6. WHAT I DID NOT DO, and what I would aim at next

* **I did not chase surface granularity.** The r5 note proving relief cannot reach a
  silhouette is correct and I re-verified nothing about it; a granular limb is a
  shading event in `species.js`, not a geometric one.
* **The apple is now the weakest species (2.55 / 2.47)** and its weakness is a high
  *within*-species distance (0.0286, three times the melon's) because its stalk and
  calyx swing around with roll. If someone wants the next increment here, it is a
  second appendage on the apple that is not on the polar axis, not a bigger stalk.
* **`species.radius` is still the wrong lever for size and it is not mine.** The
  kiwi is 0.78 against the apple's 0.92, which is backwards for real fruit, and the
  r5 note 5C's suggestion (raise `species.radius` and the slicer tolerance together)
  is still unspent and still the biggest single scale win available.
