# r5 — fruit-geo (`src/fruit/geometry.js`)

Round-4: **56/100 (+5)**. The orientation bug is fixed, so this is the first round
the shape I author actually reaches the frame. I re-measured on `shots/r4b/`,
found that both of the r4 critic's named blockers are gone, and then answered the
orchestrator's question — *what is the equivalent silhouette event for the three
that still read as balls?* — with a measurement rather than a guess.

**The answer is mostly a negative result, and it is the most useful thing in this
report: no relief field of any frequency or amplitude can put detail on a
silhouette. I proved it on the real geometry.** The only mechanism left is
appendages, and ours were built wrong. That is what I changed.

Only `src/fruit/geometry.js` was written (mtimes: geometry 18:44; species 18:37,
fluid 18:15, stage 17:37 — other agents). **Zero new draw calls. Triangles go
DOWN by 972 per full species set.**

---

## 1. Where r4b actually landed

Same probe the r4 critic used (max-channel luminance, threshold 8, largest
connected component, 720-ray radial trace from the bbox centre, residual taken
above a k≤3 low-pass fit), run on r3 / r4 / r4b `01-whole-watermelon`:

| | r3 | r4 | **r4b** | plate-01 |
|---|---|---|---|---|
| bbox aspect | 1.099 | 1.000 | **0.824** | — |
| radial trace cv | 0.105 | 0.085 | **0.170** | — |
| max local protrusion | 7.9% | 5.4% | **8.6%** | — |
| limb 80%→15% falloff | 17.5% of r | 32% of r | **14.1% of r** | 9.0% of r |

Both r4 blockers cleared. The critic's own decision rule was "if protrusion does
not clear +12%, the binding constraint is the limb bloom, not the pose". It went
to 8.6% and the limb sharpened from 32% to 14.1% of radius on its own — so
*neither* is now the binding constraint, and the r4 fix list is spent. The
remaining gap between 8.6% delivered and the 18.1% the geometry carries is
orientation luck across a single shot, not a defect.

## 2. The negative result: the depth envelope is total

The r4 note in this file says an envelope "erases smooth bumps" and infers that a
**sharp, high-frequency** local maximum would therefore survive — a pineapple's
bracts, an orange's pebbling, the "diamond-tessellated skin" the critic named.
That inference is wrong, and it is the obvious next move, so it was worth killing
precisely.

**Correct statement.** For an orthographic view of `r(dir) = 1 + a·f(dir)`, the
outline at screen angle ψ is `max over t of (1 + a·f)·cos t ≈ 1 + a·f(t) − t²/2`,
where `t` is the out-of-screen angle. So the outline is `f` **max-filtered along
depth with a kernel half-width of √(2a) radians**. A bump train of angular period
T survives only if `T/2 > √(2a)`, i.e. `a < T²/8`. Raising the amplitude widens
the kernel exactly as fast as it deepens the teeth. **There is no
(frequency, amplitude) pair that wins.**

Verified against the real `makeFruitGeometry` with an orthographic silhouette
rasteriser I wrote for this (24 uniform-on-SO(3) orientations, 720-ray trace,
boundary energy in harmonics k = 6…60 normalised by mean radius; the rasteriser's
own noise floor on a smooth body is **0.021**):

| field tried | range swept | hf (median over 24 orientations) |
|---|---|---|
| pineapple eye lattice (existing) | amp 0.030 → **0.100** | 0.0928 → 0.0941 |
| cusped cellular relief, cone falloff, Fibonacci-sphere sites | **N = 12 / 24 / 60 / 150**, amp 5–10%, exponent 0.6–1.0 | 0.0223 → **0.0257** |
| longitudinal ribs | **N = 6 / 8 / 14 / 28**, amp up to 10% | 0.0223 → 0.0228 |
| position-domain `lumps` | 1.2% → 8% | 0.0223 → 0.0220 |

Every one is inside the noise floor. A rib *does* show, at hf 0.060, in the
single view straight down the polar axis — where the rib is constant along depth
so the kernel has nothing to average — and in no other view. That is the
exception that proves the mechanism.

Same probe with the crown deleted: **pineapple hf 0.0928 → 0.0210**. The
pineapple's entire boundary signature is its crown; none of it is its skin.

**Consequences, and they are scope boundaries rather than excuses:**

1. The critic's *"the plate's orange, kiwi and strawberry all have limb-level
   relief; ours are airbrushed blobs with zero high-frequency boundary energy"*
   **cannot be answered from this file.** A granular limb is a *shading* event —
   grazing-angle bump/sheen in `species.js` — never a geometric one, at any
   triangle budget. **Materials owner: this is yours, and it is real headroom.**
2. **The orange is correct as a ball.** A real orange's peel bumps subtend ~3° of
   arc, so `T²/8` caps their silhouette contribution at 0.14% of radius = **0.09 px**
   at our framing. plate-01's own orange has a perfectly smooth limb — I checked
   the crop. Pushing the orange further would make it read as diseased, not as
   fruit.
3. Only three things reach an outline: global axis ratios, plane cuts,
   appendages. r3 and r4 spent the first two. **Only appendages are left.**

## 3. The structural change: appendages stop being needles

With relief ruled out, the crown is not merely the existence proof — it is the
*only* proof. And ours was wrong in exactly the way the r4 critic named: *"the
plate's pineapple is unmistakable from its diamond-tessellated skin and grey-green
crown; ours is a gold feather-duster fan."*

**The cause was in the model, not the parameters.** `wa` was

```js
wa: Math.min(w.wArc / Math.max(0.12, Math.sin(ax)), step * 0.44)
```

— the footprint was explicitly capped **below** the blade's own angular share so
neighbours could never touch. The pineapple's three whorls all came out at
wa = 0.087 rad against sectors of 1.047 / 0.524 / 0.524: thirty blades covering a
third of the azimuth with bare skin between them. That is a comb, and a comb seen
from the side is a hand of bananas. Real leaf crowns do two things ours could not
express:

- they **tile** — leaves meet at the root and separate only where they taper;
- they **lean** — a leaf's tip is at a different azimuth from its root, so leaves
  cross each other in projection.

Two new whorl fields, both pure functions of the direction added along the
vertex's own radius:

| field | what it does |
|---|---|
| `tile` | azimuthal footprint as a fraction of the blade's own sector. Turns the cap into a **floor**: `wa ≥ tile·step·0.5`. Nothing fuses into a collar because every blade's height is exactly 0 at its own footprint edge, and the separable `(1−x1)^pAz` profile still takes each blade to a point. |
| `skew` | the spine's azimuth drifts linearly with the **signed** polar offset, in units of `wa`, so the footprint is a leaning parallelogram in (polar, azimuth) instead of an axis-aligned lozenge. Sign and magnitude jittered per blade off the existing hashes, so the whorl spirals unevenly instead of shearing as a rigid unit. |

**The skew shift is snapped to a whole vertex column** (`b.cs`), for the same
reason `buildBlades` already snaps `az`: the azimuthal profile has a *corner* at
its peak, so a continuously drifting spine lands off-column on most rings and
samples the corner up to half a column out — at the pineapple's tiled width that
is a ~20% height loss on some rings and none on others, i.e. a blade with random
notches taken out of it. I built it unsnapped first, measured the raggedness, and
snapped it.

Both fields default to absent/0, so **every whorl that does not set them is
bit-identical to r4** — verified: watermelon 2708 tris / cv 0.1398, orange 2434 /
0.0993, apple 2668 / 0.1830, kiwi 1760 / 0.1055, all exactly the r4 values.

### Parameters retuned on top of the mechanism

- **pineapple**: whorls `0.13/0.40/0.70 → 0.11/0.33/0.58` rad (a fountain, not a
  sideways ruff), `len 1.80/1.58/0.92 → 2.25/2.00/1.40`, `tile 0.90/0.95/0.98`,
  `skew 1.0`, `pAz 1.25 → 2.4` (narrows mid-blade without narrowing the root),
  `jit 0.42…0.52 → 0.60…0.70` (strays).
- **strawberry**: same medicine. `tile 0.88/0.92`, `skew 0.9`, `pAz 1.10 → 2.00`,
  `wp 0.29/0.27 → 0.33/0.31`.

### Measured, 24 orientations + 6-view binary silhouette contact sheets

| | cv mean | cv p10 | max protrusion (median) | by eye |
|---|---|---|---|---|
| pineapple r4 | 0.3115 | 0.2938 | 0.355 | 5–7 separated fingers |
| pineapple **r5** | **0.3264** | **0.3111** | **0.411** | dense plume, ~14 fine tips |
| strawberry r4 | 0.1507 | 0.1378 | 0.213 | 2–3 stray needles |
| strawberry **r5** | **0.1515** | 0.1329 | 0.183 | serrated green cap over the shoulder |

The strawberry's protrusion goes **down**, deliberately: the sepals now overlap
into one cap instead of each poking the limb alone. That is the correct trade —
the pole-up silhouette is the first one that reads as a strawberry unlabelled, and
it is what plate-01 shows.

**This matters more this round than last.** `director.js` now biases the long axis
into the screen plane, and the pineapple's long axis is its polar axis — so the
crown is now nearly always seen **side-on**, which is precisely the view that read
as a hand of bananas. The orientation fix made this the visible defect.

## 4. Budget — this round GIVES triangles back

Tiled blades are 0.25 rad wide instead of 0.087, so they no longer need a fine
column pitch to be sampled on their peak. `crown.cols 144 → 108` on the pineapple:
silhouette identical-to-better (cv 0.333 at 108 vs 0.330 at 144) for **1104 fewer
triangles on the heaviest fruit in the game**.

| detail 9, one of each | r4 | r5 |
|---|---|---|
| pineapple | 7516 | **6412** (−14.7%) |
| strawberry | 4112 | **4244** (+132) |
| watermelon / orange / apple / kiwi | 2708 / 2434 / 2668 / 1760 | unchanged |
| **total** | 21198 | **20226 (−972)** |

- **Draw calls: +0.** No new attributes, groups, materials or programs.
- Cap triangles per cut: unchanged in kind (the pineapple's crown is what drives
  its cap cost and it did not get bigger — its polar span got *smaller*).
- Build cost: 4.5–15.3 ms per (species, detail), and `director.js:37` caches by
  that key, so it is a one-off at load.

## 5. Validity — the constraints in my brief, checked not assumed

| constraint | check | result |
|---|---|---|
| non-indexed, position/normal/uv | attribute dump, all tiers 3…14 | ✅ |
| two groups, skin=0 all, cap=1 empty | `groups` = `[{0,3N,0},{3N,0,1}]` | ✅ every species |
| **every cross-section star-shaped about the origin** | 400 random rays cast from the origin per species, counting forward triangle intersections | **exactly 1 hit, 400/400, all six species** |
| winding outward by construction | dot(face normal, centroid) > 0 | **100.0%** every species |
| no NaNs, unit normals | full scan | 0 / 0 |
| uv.y appendage mask unchanged | max uv.y = 1.95 (woody band) on stem species, 1.70 (leaf band) on pineapple | ✅ `leaf = smoothstep(1.0,1.14,uv.y)` and `wood = step(1.72,uv.y)` still mean exactly what they meant in r4 |
| exported names / signatures | `makeFruitGeometry(species, detail)` | unchanged |
| `npx esbuild src/fruit/geometry.js --bundle` | | clean |

Known limitation carried forward unchanged: the crown-islands note at the bottom
of the file header (a steeply vertical cut that clips a blade far from its root
leaves that one tip unsealed, because `chainLoop` keeps only the longest loop).
The new crown has a *tighter* polar span than r4's, so exposure is if anything
slightly lower. Still a `cutter.js` fix, not mine.

## 6. Handed off, measured, deliberately NOT shipped

**`k = R * 1.05 / bodyExt` normalises by the body's LONGEST semi-axis, so every
unit of out-of-roundness r3 and r4 bought was silently paid for in on-screen
SIZE** — the other half of the same critic's scorecard (*"00-hero is 35.7% of
frame height against plate-01's ~62%"*, and "fruit smaller than ~25% of frame
height in the hero shot" is an auto-fail in the bar).

Mean projected radius, measured over 32 orientations at `species.radius = 1`,
against the 1.05 a sphere of the same nominal radius would get:

| watermelon | apple | orange | kiwi | strawberry | pineapple |
|---|---|---|---|---|---|
| 0.855 | 0.907 | 0.875 | 0.821 | 0.980 | 1.147 |

**14–22% of linear size, 26–40% of covered area, given away.** I did not take it
back, because the fix is not safe in this file: `slicer.js:66` only cuts within
`f.radius * 0.92 = 0.975 R`, and the mesh already reaches `1.05 R`, so growing the
mesh grows the band where a swipe visibly crosses the fruit and **nothing
happens** — 7.1% of the long half-axis today, **24.5%** if this file normalised by
mean radius. That is the R3 "a swipe that visually crosses the fruit always cuts
it" bar, and I cannot edit `slicer.js`.

**Recommended to the orchestrator:** raise `species.radius` (species.js) and the
`0.92` slicer tolerance *together*. That buys the same 14–22% with no dead band,
costs zero triangles and zero draw calls, and moves the hero from 35.7% toward the
plate's 62% — which by my measurements is now the single largest silhouette-axis
gap left, larger than anything remaining inside geometry.js.

Also handed off, from §2: **a granular limb is achievable only in `species.js`**,
as grazing-angle bump/sheen. It is not reachable here at any budget, and I have
the sweep to prove it.
