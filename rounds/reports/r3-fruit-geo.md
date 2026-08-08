# r3 — fruit-geo (`src/fruit/geometry.js`)

Round 2: **42/100**, biggestGap "the hero watermelon silhouette is still a
mathematically perfect circle — 108x108 px, aspect 1.000; radial boundary trace
mean r 53.90, std 2.53, std/mean 0.047; the authored ry=1.14 prolate axis and the
r=0.072/len=0.21 stem NEVER appear in the outline."

I reproduced the critic's measurement offline (see *Method*) and it splits into
three independent causes, **two of which were mine and are fixed; one is in
`src/play/director.js`, which I do not own.**

---

## 1. THE ONE THE ORCHESTRATOR MUST FIX — spawn orientation (`src/play/director.js:79`)

```js
quat: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rr(rng,0,6.28), rr(rng,0,6.28), rr(rng,0,6.28))),
```

Every fruit is spawned with a **uniformly random orientation on SO(3)**. The
critic is right that the prolate axis is pointing down the camera in
`01-whole-watermelon`: in that shot the green stripes *converge to a point* just
up-left of centre, which is the +Y pole facing the lens. A prolate body seen down
its own pole is a circle, and a stem seen down its own axis is a dot in the middle
of a disc — neither can ever reach the silhouette, no matter what I author.

Roughly **half of all uniformly random orientations put the long axis within 45
degrees of the view direction.**

Suggested fix, in director.js only — keep the roll free (that is where the visual
variety is) and bias the polar axis into the screen plane:

```js
// long axis across the camera, not down it: random roll about +Z (screen plane)
// times a modest tilt, so |localY . viewDir| stays small
const roll  = rr(rng, 0, 6.28);
const tilt  = rr(rng, -0.55, 0.55);      // radians away from the screen plane
const yaw   = rr(rng, 0, 6.28);          // free spin about the fruit's own axis
f.quat.setFromEuler(new THREE.Euler(tilt, yaw, roll, 'ZXY'));
```
and clamp `spin.x` / `spin.z` (currently ±1.4 / ±0.9) so the fruit does not tumble
straight back out of that pose within the ~0.3 s before the hero shot. The stem,
the crown and the prolate axis all become permanently legible for free.

With the geometry changes below, the fruit is now identifiable from *any single*
view; director.js is what makes the **good** view the common one.

## 2. Near-spherical axis triples (fixed here)

Round 2 authored a prolate `ry` but left the other two axes nearly equal — every
species had two of its three axes within 4%:

| species | round 2 (rx/ry/rz) | round 3 | smallest pairwise ratio r2 -> r3 |
|---|---|---|---|
| watermelon | 1.000 / 1.140 / 0.962 | 1.000 / 1.170 / **0.862** | 1.040 -> **1.160** |
| orange | 1.000 / 0.885 / 0.972 | 1.000 / 0.855 / **0.935** | 1.029 -> 1.070 |
| apple | 1.000 / 0.985 / 0.964 | 1.000 / 0.965 / **0.878** | 1.015 -> 1.099 |
| kiwi | 1.000 / 0.685 / 0.945 | 1.000 / 0.660 / **0.870** | 1.058 -> 1.149 |
| strawberry | 1.000 / 1.210 / 0.952 | 1.000 / 1.210 / **0.888** | 1.050 -> 1.126 |
| pineapple | 1.000 / 1.420 / 0.972 | 1.000 / 1.420 / **0.882** | 1.029 -> 1.134 |

The asymmetry is pushed into **rz, not ry**, on purpose: the final scale is
`k = R*1.05 / bodyExt` and `bodyExt` is set by the longest axis, so raising `ry`
would have shrunk the equator and with it the **cut face** that the flesh and juice
pieces are tuned against. Girth is within 2.6% of round 2 everywhere.

Also added a `rib` / `ribN` term (a low-amplitude longitudinal furrow, faded out
toward the poles by ring radius). Watermelon `rib 0.016, ribN 9`; orange `0.010,
9`. This is the only shape feature that survives on the outline when a fruit is
seen exactly end-on. It is kept under 2% specifically so it cannot be mistaken for
polygon faceting (an auto-fail on the bar).

## 3. Sub-threshold appendages (fixed here)

At the new framing the hero is ~140 px, so the visibility floor is ~4 px. Nearly
everything authored in round 2 sat at or under it. Roughly doubled:

| feature | r2 | r3 | on-screen (hero scale, 43.6 px/world) |
|---|---|---|---|
| watermelon stem | r 0.072, len 0.21 | **r 0.115, len 0.31, taper 0.46** | ~13 x 20 px |
| watermelon wells | 0.060 / 0.052 | **0.090 / 0.105** | readable dish + navel |
| apple stem | r 0.054, len 0.46 | **r 0.092, len 0.54** | ~8 x 22 px |
| apple 5-lobe waist | 2.8% | **6.2%** | 1.2 px -> 2.6 px |
| apple wells | 0.220 / 0.160 | **0.265 / 0.190** | stem well + calyx basin |
| orange navel | 0.118 | **0.165**, button stem r 0.105 | |
| kiwi | taper 0.090 | **0.105**, stem r 0.070/0.085 | |

Watermelon also got `taper 0.048` so the blossom end is narrower — a genuine egg
profile rather than a symmetric spheroid.

## 4. The crown: "fat blunt-tipped tubes / a hand of bananas" (fixed here)

The critic was right and the cause was a single inverted assumption in
`bladeHeight`. A leaf is flat: long radially, moderately **wide** across its face,
**thin** edge-on. The two transverse axes available in a radial-graph field are
polar (meridian) and azimuthal. Round 2 made them near-equal *and* put a
**plateau** on the azimuthal one, `pow(1-v*v, 0.55)`, which is still at 85% of full
width at 85% of the footprint. Measured at half length, a round-2 pineapple blade
was **10 px thick x 10 px wide over a 70 px length** — a round tube with a domed
end. Exactly a hand of bananas.

Round 3:

- **azimuth is the thin axis**, with a pointed `pow(1-|v|, pAz)` profile — a
  corner at v=0, so thickness shrinks *linearly* to zero, which is what makes a
  tip read as sharp;
- **meridian is the broad axis** (`wp` roughly tripled relative to `wArc`), with
  `pow(1-u*u, pPol)` — deliberately a rounded apex, see below;
- result at half length: **~5 px thick x ~19 px wide x ~70 px long**, tapering to a
  point. A flat leaf.

Two sampling fixes were needed to make a pointed profile safe:

- `buildBlades` now **snaps each blade's spine onto a vertex column**
  (whorl counts divide `crownCols` exactly, so it moves by at most half a
  column). Without this the blade is sampled only on its flanks and comes out
  short, blunt and a different length from its neighbours.
- `layoutRings` now **force-emits a ring exactly where the profile crosses each
  whorl's polar axis**, so the blade apex always lands on a vertex row.
  The polar profile keeps a rounded apex anyway, because each blade's axis is
  jittered off its whorl's by ±`jitA` and a corner there would cost ~25% of the
  length; the rounded form costs <5%.

Whorls retuned so the crown reads as *body plus top* rather than radiating in
every direction (the 09-combo complaint): outer whorl pulled in from 0.88 to 0.70
rad and cut from 18 to 12 blades, lengths 1.80 / 1.58 / 0.92, and length jitter
raised to 0.42–0.52 so the tuft is ragged rather than a uniform sea urchin.
30 blades, not 36.

Also: crown columns only go to rings **inside a whorl's polar band** now, instead
of the whole 0–1.17 rad crown zone. Round 2 was spending ~20 rings x 108 columns
mostly on bare skin between whorls. Banding it paid for `cols: 144` at ULTRA and a
0.60x polar step inside the bands, for less total cost than a naive bump.

Strawberry calyx got the same treatment (sepals: broad face, thin edge, blunter
exponents than pineapple needles, len 0.62/0.50), plus `cols: 84 -> 72`.

## Measured result

Offscreen rasteriser at review scale (43.6 px/world, i.e. hero framing), four
orientations, same statistics the critic used (bbox aspect; radial boundary trace
std/mean from the silhouette centroid):

| species | bbox aspect (4 views) | std/mean (4 views) |
|---|---|---|
| **watermelon** | 0.71 / 0.79 / 0.87 / **1.22** | 0.062 / 0.070 / 0.081 / **0.097** |
| pineapple | 0.57 / 0.59 / 0.62 / 1.25 | 0.168 / 0.262 / 0.291 / 0.321 |
| kiwi | 1.15 / 1.15 / 1.22 / 1.35 | 0.052 / 0.058 / 0.105 / 0.148 |
| strawberry | 0.84 / 0.86 / 0.93 / 0.93 | 0.089 / 0.117 / 0.137 / 0.144 |
| apple | 0.85 / 0.93 / 1.01 / 1.14 | 0.039 / 0.048 / 0.065 / 0.081 |
| orange | 1.07 / 1.08 / 1.09 / 1.14 | 0.025 / 0.032 / 0.059 / 0.078 |

Round 2 measured **aspect 1.000, std/mean 0.047** on the watermelon. The worst of
the four new watermelon views is 1.22 / 0.070; there is no orientation left in
which it is a circle. The apple's round-on view (1.01 / 0.039) is the weakest
remaining number and is honest — an apple *is* round; its identity now comes from
the stem and calyx well, which are both above the visibility floor.

## Contract / invariants — verified, not assumed

Automated checks over all 6 species x detail 4/6/8/11 (24 geometries):

- non-indexed `position(3)/normal(3)/uv(2)`, **two groups**, `[0,3n)` mat 0 and
  `[3n,0)` mat 0-count mat 1 — 24/24 ok;
- **0 open/non-manifold edges** after welding, 24/24;
- **positive signed volume** on every one (winding outward by construction, still
  nothing flipped afterwards);
- 0 degenerate triangles, 0 NaN/Inf;
- `uv.y` stays inside the documented bands (max 1.70 on the crown-only pineapple,
  1.95 where there is a stem);
- **star-shape about the origin: 4000 random rays per species from the origin,
  every ray hits the surface exactly once, 0 failures.** This is the property
  cutter.js's clip ring and cap fan depend on, and the new blade field, the rib
  term and the deeper wells all preserve it.

Exported name and signature unchanged: `makeFruitGeometry(species, detail)`.

## Perf

- Triangles, all six species at ULTRA (detail 11): **20 332 -> 26 224** (+29%).
  Biggest single item is the pineapple, 7 020 -> 10 032. Against the 208 816
  measured peak and the 250k ceiling, the realistic worst case (6 live fruit +
  halves) is roughly +12–18k, i.e. ~226k. Base resolution also went from
  `4.2d+8` (54 cols at ULTRA) to `4.6d+10` (60), and the minimum ring column count
  from 6 to 8, so stems are not visible hexagons.
- **Draw calls: unchanged.** No new meshes, no new passes, no new materials, still
  one mesh and two groups per fruit. Draw calls were the metric under pressure
  (151 vs 120) and I did not touch it.
- Build cost is a **boot-time** cost only — `director.geomFor` caches per
  `species:detail` and `api.init` prewarms all six. ULTRA: 12.4 ms for the
  pineapple, ~34 ms for all six, once, before the first frame. Zero per-frame and
  zero steady-state allocation; nothing in the hot loop changed.

## Known limitation, unchanged in kind

The "crown island" note at the bottom of the file's header still applies, and now
applies to the fatter watermelon/apple stems too: a cut plane that clips an
appendage far from its root makes a second small loop that cutter.js does not cap,
leaving a hairline nick. The stem tip sits at ~2.0 world against a maximum legal
cut-plane distance of 0.975R = 1.51, so this was already reachable in round 2; it
is marginally more likely, and it is a `cutter.js` chainLoop change to fix
properly (return *all* loops, cap each).

## Method

Because I cannot run the harness, I wrote a throwaway z-buffered software
rasteriser (`/tmp/render.mjs`, `/tmp/go.mjs`) that renders the real
`makeFruitGeometry` output at the measured review scale and reports the same bbox
aspect and radial boundary trace the critic used, plus `/tmp/valid.mjs`
(manifold/winding/groups/uv) and `/tmp/star.mjs` (ray-cast star-shape proof).
Everything above is measured on the actual buffers this file emits, not estimated.
Those scripts are in /tmp and are not part of the build.
