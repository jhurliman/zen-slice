# r4 — fruit-mat — `/home/claude/juice/src/fruit/species.js`

Round 3: 46/100, **down 3**, and the verdict said why: "the albedo drop in
species.js was cancelled by stage.js raising the key from 6.2 to 7.7 and
environmentIntensity". Watermelon cut face still at **49.7%** R=255, orange half
**39.3% -> 54.0%**. Nothing else in the verdict moved because nothing else could
move until that was fixed.

This round there is a shared number. The exposure owner's `EXPOSURE CONTRACT`
block in `stage.js` is frozen, and **every albedo in this file is now a solution
of it**, not a guess. Only `src/fruit/species.js` was edited.

---

## Method

1. **Reproduced the contract's chain in closed form.** `albedo -> E(N.L) ->
   exposure 1.28 -> NeutralToneMapping (S=0.76, d=0.24) -> sRGB OETF ->
   stage.js's `gradeFn` (crush 0.010, contrast 1.10 about 0.34, sat 1.06 rolled
   off above lum 0.72, multiplicative split-tone, blackFloor 0.013)`.
   **Validated before using it**: it reproduces the contract's own measured
   albedo→display table to ≤2/255 in every cell, and the contract's stated
   anchor — flesh linear (0.45, 0.10, 0.06) face-on → sRGB (176, 63, 28) — comes
   out as (176, 64, 31).

2. **Extended the contract to tilted normals**, which it does not tabulate and
   which is where the pith band lives. cutter.js tilts the collar ~±20° about
   the cap normal, so the key's N·L on the ring runs **0.19 … 0.79**, not a
   constant 0.4895. A quadratic through the contract's three measured
   orientations (C at N·L 0, A at 0.4895, B at 1) gives

   ```
   E_R(N.L) = 0.5262 N.L^2 + 0.9028 N.L + 0.136
   E_G      = 0.4850 N.L^2 + 0.7370 N.L + 0.136
   E_B      = 0.3597 N.L^2 + 0.6063 N.L + 0.156
   ```

   so the band's own irradiance already swings **3.6x** around the ring, unaided.

3. **Monte-Carlo'd the actual shader expressions.** 200k samples over the
   watermelon cap and 120k over the orange peel hemisphere (projected-area
   weighted), transcribing every line of the albedo builders including the noise
   fields' real distributions, the foam, the pool, the groove, the seed halo and
   the layer bands, then through the chain of (1) with E from (2). The critic's
   own probes — inner-0.55 ellipse, whole-face, 48-spoke ring peak — are
   computed on the result.

4. **Measured the references with the same code.** All target numbers below are
   my own measurements of `plate-01.png` and `plate-02-highspeed-citrus.jpeg`,
   not quoted.

Scripts: `/tmp/r4fm/{model,E,sim,wm,orange,chk2,box,probe}.mjs`.

---

## The four things that were actually wrong

### A. Everything was 1.9x too dark for the new chain, not 1.3x too bright

E face-on went **1.357 -> 0.704**. Round 3's albedos were cut for the old chain;
under this one they render ~0.52x. Simulated with round-3 values unchanged, the
hero cut face lands at mean **(144, 44, 30)** against plate-01's (188, 72, 56) —
a maroon smear. So the fix is the opposite of round 3's: **albedos go UP**,
inside a hard ceiling.

### B. `capKey` squared a response the renderer already applies

Round 3 multiplied every cut-cap band's *albedo* by the key's N·L to "buy back
the shading swing". The renderer applies N·L too, so the product is squared, and
the critic measured it: 48-spoke first-harmonic amplitude **40% of mean,
max/min 6.41x**, with **15 of 48 spokes carrying no ring at all**. Round 2 — with
`capKey` effectively a constant — measured 15% / 2.48x, which is *already inside*
plate-01's watermelon pith (16% / 2.11x) and plate-02's lemon peel (19% / 2.31x).
Round 2's ring was not a decal; it was **clipped**, which the *other* critic saw
as "67% of ring pixels at R=255, only 1.32x variation". One bug, two readings.

`capKey`'s defaults go **amb 0.30 / gain 1.46 -> amb 0.86 / gain 0.29**: swing
across N·L 0.19…0.79 drops **2.83x -> 1.19x**, normalisation unchanged (a
camera-facing cap still lands at 1.002, so band brightness is set by the band
colour alone).

### C. The pale bands had no headroom

Watermelon pith 0.400 base × kr peak 1.76 = 0.704 albedo on a spoke whose own
E_R is 1.177 → scene-linear 0.83, i.e. 28% over the ceiling. Orange pith 0.52 ×
1.76 = 0.92 → **1.08, 66% over** — that is the white halo visible around the
citrus cut face in `shots/r3/08`. Rebuilt against the lit spoke, not the face-on
one. The cliff is brutal: watermelon pith at base 0.50 clips **0.00%** of the
band, at 0.56 it clips **11%**.

### D. The foam whitening was desaturating the pulp

`mix(alb, alb*0.66 + vec3(0.200), f*0.30)` resolves to `alb*0.898 + 0.060`.
0.060 linear on a pulp whose G is 0.050 **more than doubles G** — the critic's
"milky salmon", face G/R **0.350 -> 0.549** against plate-01's 0.383. Now
`vec3(0.085)` at weight 0.22 with the underlying albedo pulled to 0.80 instead
of 0.66 (max lift 0.0187, 37% of pulp G). The foam's real signal was never in the
albedo — it is `w.h` driving `normalNode`, untouched.

---

## Predicted verification, same probes the critic used

**Watermelon cut face** (200k-sample Monte-Carlo, inner-0.55 region):

| | r2b meas. | r3 meas. | **r4 predicted** | plate-01 |
|---|---|---|---|---|
| mean RGB | 239, 86, 85 | 231, 119, 97 | **189.1, 70.5, 55.7** | 188.4, 72.2, 55.8 |
| R ≥ 255 | 49.8% | 49.7% | **4.1%** (2.7% at the low specular estimate) | 0.6–1.06% |
| G/R | 0.350 | 0.549 | **0.373** | 0.383 |
| B/R | 0.345 | 0.443 | **0.295** | 0.296 |
| darkest 5%, lum | 51.0 | 63.2 | **6.3** | 10.0 |
| median lum | 115 | 143 | **101** | 86 |

All four of the round-4 targets clear: **R≥255 4.1% < 5%**, **G/R 0.373 inside
0.38 ± 0.03**, **darkest-5% lum 6.3 ≤ 25**, and the ripest pixel on the diffuse
ramp sits at scene-linear **0.644** against a 0.65 threshold — *nothing in the
diffuse term can clip at any t*. `ripe` is pinned at exactly the contract's
face-on budget of 0.90 for that reason. The residual 4.1% is entirely wet-film
specular pips; plate-01's 0.6–1.06% is the same thing.

**Pith ring** (48-spoke peak-luminance probe):

| | r2b | r3 | **r4** | plate-01 pith | plate-02 lemon peel |
|---|---|---|---|---|---|
| max/min | 2.48 | 6.41 | **2.25** | 2.11 | 2.31 |
| cv | 0.172 | 0.373 | **0.239** | 0.187 | 0.193 |
| R ≥ 255 in band | clipped | clipped | **0.00%** | 0.33% | 0.00% |
| spoke-peak mean | 231.5 | 188.7 | **154.2** | 198.7 | 129.0 |

**Orange** (120k over the peel hemisphere + 80k over the cap):

| | r2b meas. | r3 meas. | **r4 predicted** | reference |
|---|---|---|---|---|
| near half, R ≥ 255 | 39.3% | **54.0%** | **2.8%** | plate-01 orange 2.07% |
| near half, mean RGB | 205, 135, 66 | 225, 147, 69 | **165.3, 94.5, 24.0** | plate-01 221, 127, 28 |
| near half, G/R | 0.655 | 0.652 | **0.572** | plate-01 0.576 |
| peel alone, mean | — | — | **150.3, 79.7, 10.7** | plate-02 lemon peel 156.4, 94.7, 11.1 |
| peel alone, R ≥ 255 | — | — | **3.2%** | plate-02 0.00%, plate-01 2.37% |

The peel is deliberately landed on plate-02's lemon rather than plate-01's much
harder-lit orange: pushing the base from 0.46 to 0.50 takes the clip fraction
from 3.2% to **6.4%**, and 54% → 6% would not have been a fix.

---

## Every value that changed

**Shared**

| | r3 | r4 | why |
|---|---|---|---|
| `capKey(amb, gain)` | 0.30 / 1.46 | **0.86 / 0.29** | renderer already applies N·L; see B |
| foam white lift | `vec3(0.200)` @ 0.30, alb×0.66 | **`vec3(0.085)` @ 0.22, alb×0.80** | see D |
| `sssTint` | 0.55 | **0.40** | key dropped 2.26x; peak lobe now 0.074 linear = 11% of budget |

**Watermelon** — flesh `deep (0.147,0.018,0.014) -> (0.2900, 0.0510, 0.0427)`,
`ripe (0.551,0.071,0.054) -> (0.9000, 0.1507, 0.1228)`, ramp offset `0.56 ->
0.618` with fibre `0.40 -> 0.55` and gran `0.15 -> 0.24` (mid-tone rises without
the top of the ramp having to), pale heart `-> (0.4950,0.2865,0.2394)`, seed halo
R multiplier `1.30 -> 1.10`, wet-line `1.35 -> 1.18`, pith `(0.400,0.405,0.325)
-> (0.5000,0.4130,0.2770)` (also re-hued: plate-01's pith is G/R 0.816 / B/R
0.566, a warm cream, against round 3's cold 1.01 / 0.81), rind band
`(0.023,0.048,0.009) -> (0.0520,0.1080,0.0200)` — the contract calls this one out
by name: at G 0.048 it "will look like a black ball". Skin `dark
(0.013,0.045,0.0085) -> (0.0300,0.0520,0.0110)`, `lite (0.088,0.198,0.025) ->
(0.1450,0.2100,0.0400)`; note R rises toward G because plate-01's melon light
stripe measures display (122, 106, 26) — a yellow-green under a warm key, not the
pure green round 3 had.

**Orange** — peel `0.36 -> (0.4600,0.1463,0.0136)` with pore shadow deepened
0.22 → 0.30 (subtractive, costs no headroom), pulp `(0.420,0.102,0.0055) ->
(0.6000,0.2010,0.0168)` with the multiplicative tail trimmed again (peak 1.26 →
1.14, tips 1.10 → 1.08 — at the higher base it is the tail that decides the clip
fraction: 7.3% vs 2.1% in simulation), membrane `-> (0.5500,0.4450,0.2760)`,
core `-> (0.5200,0.4380,0.2860)`, pith `0.52 -> (0.4600,0.3864,0.2760)`, zest
`0.32 -> (0.4000,0.1280,0.0120)`.

**Kiwi / apple / strawberry / pineapple** — raised into the contract, each value
checked at the orientation it is actually seen in (skins at N·L 1, cut faces at
0.4895, layered bands at 0.79). Notable: the apple's blush multiplier drops
2.0 → 1.55 because `mix(a, a*2.0, 0.45)` is a 1.45x lift and at the new base that
alone put the sunlit shoulder at 0.58 linear; the pineapple shell plate drops
0.42 → 0.325 because its grain tail peaks at 1.14, making its real budget
0.40/1.14 = 0.351 (round 3's value was 20% over that *before* counting light);
the strawberry skin is **held** at 0.36, already at 0.607 linear facing the key.

Also updated the six `fleshHex`/`rindHex` metadata fields so they match the
albedos actually used. `juiceHex`/`juiceColor` is **untouched** — `fluid.js:1023`
reads it and it is the only field any other module consumes.

### Everything I deliberately did NOT change

- **`roughnessNode` / the wet floor.** The key dropped 2.26x but
  `environmentIntensity` is *held* at 1.31, so the env-specular term did not
  scale with the diffuse. Relaxing the floor to chase back the lost sparkle
  would have moved the one part of the pixel budget the contract does not model
  per-albedo. The residual R≥255 is all specular pips, and so is plate-01's.
  There is a note in the source saying so. Next round, with a frame in hand.
- Foam/bubble geometry, band widths, the radius warp, the SSS lobe's shape, the
  contact shadows, every relief function. All unmeasured this round; churning
  them would make the next verdict unattributable.

---

## Constraints held

- Exports, factory names and `init/fixed/frame/quality/resize` signatures
  unchanged; `GLSL_NOISE`, `SPECIES`, `SPECIES_LIST`, `setSpeciesQuality` intact.
- **Zero cost delta.** Every change is a numeric constant except `capKey`'s two
  defaults, which are also constants. No new nodes, slots, materials, draw calls,
  textures or shader programs; the graph topology is byte-for-byte round 3's.
  Budget (112 draws / 179k tris / 0.6 ms) cannot move.
- Everything animated is still a `uniform()`; no graph is rebuilt, so no
  first-slice recompile.
- Verified: `npx esbuild src/fruit/species.js --bundle` clean (the two
  `MeshStandardNodeMaterial is undefined` warnings are pre-existing and are an
  artefact of bundling standalone without build.mjs's `three -> three/webgpu`
  plugin). Bundled *with* that plugin and run under `three/webgpu`, all six
  species construct both materials with all four flesh node slots populated and
  **zero console errors**, at quality tiers 0 and 3.

## What a critic should check first

The mean and the clip fraction on the watermelon inner-0.55 ellipse. If the mean
is right (≈188, 70, 56) and the clip fraction is still high, the residual is
wet-film specular and the knob is the roughness floor in `fleshMaterial`, not any
albedo. If the mean is *low*, my Monte-Carlo's noise-field distributions are
softer than the real ones and the ramp offset (0.618) is the single knob.

Second: the pith ring's max/min. Predicted 2.25 against plate-01's 2.11. If it
reads high, `capKey`'s `gain` goes below 0.29; if it reads flat, the collar
normals swing less than the ±20° cutter.js's profile implies and `gain` goes up —
but do **not** put it back near 1.46, that is the squaring bug.
