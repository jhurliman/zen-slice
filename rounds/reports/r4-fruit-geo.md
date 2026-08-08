# r4 — fruit-geo (`src/fruit/geometry.js`)

Round-3 score **51/100**. The critic's whole gap:

> "Three of the six fruits — watermelon, apple, orange — are still outline-identical
> smooth balls: every authored appendage (0.115r stem, 0.54-long apple stem, 0.165
> navel, five 6.2% lobes) is a surface-shading event only and NONE of them reaches
> the silhouette."

They were right, and the reason turned out to be a geometry fact I had not
reasoned about, not a size problem. **The features were big enough. They were in
the wrong place.** All measured below, on the real `makeFruitGeometry` output.

---

## 1. Why r3's features measured zero — the depth envelope

The silhouette of a solid is the **max over depth** of the projected radius. That
max is an *upper envelope*, and an envelope erases smooth bumps: wherever a
low-frequency radial field dips, some other point at a different depth on the same
screen ray is still out at the mean radius, so the outline does not move.

Measured directly: raising the watermelon's `lumps` from 1.3% to **8%** — a
six-fold increase, plainly visible in shading — moved the radial boundary trace
cv from 0.068 to 0.070. Essentially nothing.

Only three kinds of feature survive the envelope:

| survives | why | example |
|---|---|---|
| a **local maximum** sharp enough to win the max | it *is* the max on its rays | pineapple blade, strawberry sepal |
| a **plane cut** | removes every depth on one side at once | a flat facet |
| the **global axis ratios** | the outline of an ellipsoid is an ellipse | prolate / oblate |

That is exactly why the r3 critic accepted the pineapple crown ("YES, real
geometry") and the strawberry calyx as identifiable, and why the r3 stem, well,
navel and lobes all measured 0.

## 2. The second, compounding reason — everything lived on +Y

`rx/ry/rz`, `wellTop`, `wellBot`, `stem` and the lobe ramp are **all features of
the polar axis**. A spawn that points +Y at the camera hides every one of them
*simultaneously*. The failures were perfectly correlated, which is why the worst
case was not "a slightly plain fruit" but "a circle".

Measured over 24 uniform-on-SO(3) orientations, radial-trace cv (std/mean — the
critic's own statistic, 720 rays from the bbox centre, 640×360):

| r3 | mean cv | worst cv | p10 |
|---|---|---|---|
| watermelon | 0.0700 | **0.0156** | 0.025 |
| apple | 0.0668 | 0.0326 | 0.038 |
| orange | 0.0386 | **0.0138** | 0.017 |
| kiwi | 0.0720 | 0.0216 | 0.027 |
| strawberry *(critic: identifiable)* | 0.1451 | 0.0884 | 0.098 |
| pineapple *(critic: identifiable)* | 0.2510 | 0.1353 | 0.198 |

The two species the critic named as identifiable are the two above ~0.14 / 0.09.
That is the bar, and it is the bar I aimed the three offenders at.

---

## 3. What I added

Three mechanisms, each chosen because it survives the depth envelope **and** is
uncorrelated with the polar axis. All three are pure radial graphs
`r = f(direction)`, so the star-shaped condition `cutter.js` needs is preserved by
construction (verified in §5).

### A. `facets` — soft plane clips
```js
facets: [{ d: [x, y, z], p: 0.73, k: 0.30 }]   // r <- smin(r, p/dot(dir,d), k)
```
Intersecting a star-shaped solid with a half-space that contains the origin is
star-shaped. A **watermelon's ground spot** — the flat where it sat in the field —
plus one on each of apple, orange and kiwi for the same reason real fruit have
flat sides. A plane is the one dent an envelope cannot fill in.

**Placement was searched, not guessed** (`.geoopt.mjs`): 80–90 random
(direction, offset, edge-radius) triples per species, scored on
`2·worst-cv + mean-cv` over 20 orientations, rejecting any candidate that lost
more than 4.5% of mean on-screen size. Directions were constrained away from +Y
after an unconstrained run cheerfully lopped the apple's stem off to win the
metric.

### B. `asym` — direction-domain lopsidedness
`fbm` evaluated on the **unit direction** rather than the position, ~3.6–6.2%.
Small effect on the trace by itself (see §1) but it is the only term no
orientation can hide, and it removes the last "this is an ellipsoid" reading.

### C. Off-axis appendages
- **watermelon**: the stem moved off the pole to a **41° radial spur**
  (`crown`, `n:1`, new `round:true` nub profile). A stem on +Y foreshortens to a
  dot in exactly the view that already made the body a circle; at 41° it still
  projects 71% of its length there. The profile stem stays as a short woody scar
  in the well. Body pushed to a genuine ovoid: `ry 1.17→1.235`, `rz 0.862→0.818`,
  `taper 0.048→0.135`.
- **apple**: the five lobes moved from the **calyx end** (profile radius 0.4 —
  a latitude that is never on the limb, which is why they measured 1.2 px) to a
  **gaussian at the equator** via the new `lobeYc/lobeYw` window, and raised
  0.062 → 0.122. A pole-on apple is now a five-lobed rosette (boundary FFT k=5
  amplitude 0.43 px → **3.18 px**). Plus five dried calyx sepals at 150° and a
  thinner, longer stem (0.092r/0.54 → 0.076r/0.72) so it reads as a spike.
- **orange**: a **seven-nub navel pucker** at 139°, oblateness pushed to
  `ry 0.855→0.752`, segment ribbing 0.010→0.042.
- **kiwi**: same medicine (it was quietly the roundest worst case in the game).

### D. Two supporting changes
- `crown.woody` — moves an appendage from the LEAF band of the uv.y mask into the
  STEM band. **Materials author: `wood = step(1.72, uv().y)` now covers the
  watermelon spur, the orange navel and the apple calyx; `leaf = smoothstep(1.0,
  1.14, uv().y)` still covers only the pineapple crown and the strawberry calyx.**
  No species test needed.
- Facet-aware normalisation: `k` was solved on the *un-dented* body, so a facetted
  fruit would render smaller than an identical un-facetted one. `kf` puts the
  facetted body back on `radius*1.05` exactly. Gated on `S.facets`, so every
  untouched species — and the eye lattice's phase lock with species.js — is
  bit-identical to round 3.

---

## 4. Measured result

Same 24 orientations, same statistic:

| | mean cv | worst cv | p10 | worst out-of-round |
|---|---|---|---|---|
| watermelon | 0.0700 → **0.1214** | 0.0156 → **0.0421** | 0.025 → **0.082** | 1.31 → **1.40** |
| apple | 0.0668 → **0.1325** | 0.0326 → **0.0784** | 0.038 → **0.095** | 1.16 → **1.44** |
| orange | 0.0386 → **0.0830** | 0.0138 → **0.0520** | 0.017 → **0.056** | 1.19 → **1.30** |
| kiwi | 0.0720 → **0.0853** | 0.0216 → **0.0335** | 0.027 → **0.051** | 1.42 → 1.42 |
| strawberry | 0.1451 (untouched) | 0.0884 | 0.098 | 1.27 |
| pineapple | 0.2510 (untouched) | 0.1353 | 0.198 | 1.79 |

Apple and watermelon now sit at or above the strawberry, which the r3 critic named
as identifiable by outline alone. The orange is still the roundest thing in the
game — an orange genuinely is close to a ball at 90 px, and I chose not to lie
about that beyond the oblateness, the navel and the lopsidedness.

Named signatures, so they cannot be swapped for each other:

| | boundary character | pole-on view |
|---|---|---|
| watermelon | 124 px, ovoid, k2-dominant (9.4 px on mean r 68), one flat side, one fat spur | 123×99, aspect 1.24 |
| apple | 87 px, waisted + shouldered, k1-dominant (11.1 px) from the long thin stem | 92×69, aspect 1.33, k5 = 3.2 px rosette |
| orange | 84 px, squat oblate, faint 6-fold ribbing | 95×78, aspect 1.22 |

**All of it is low-frequency, so it survives to LOW.** At detail 4 (864 triangles)
the watermelon still measures 0.130 mean / 0.083 worst; at detail 11 it is 0.136.
Nothing here depends on tessellation.

---

## 5. Validation (`.geostar.mjs`, `.geocut.mjs`)

Every species × detail tier {4, 6, 9, 11, 14}:

- **star-shaped**: 3000 uniform rays from the origin, **exactly one** surface
  crossing every time. `ALL OK`. This is the hard constraint and it holds.
- **non-indexed**, `position`/`normal`/`uv` only, groups exactly
  `[0, n, mat 0]` + `[n, 0, mat 1]`, no NaN, all normals unit, signed volume
  positive (outward winding). `ALL OK`.
- **the real cutter**: 540 random planes through `cutGeometry()` at |d| ≤ 0.78R.
  Cap triangles per cut min 481 / mean 1007–1092 / **max 1196** on the four
  changed species, versus the pineapple's pre-existing 6037. No throws, no NaN,
  no negative-volume halves, both groups present on every half. The only misses
  are planes that genuinely do not intersect the body (see §6).

## 6. Costs and one risk to hand on

- **Triangles**: +404 / +460 / +498 / −8 on watermelon / apple / orange / kiwi.
  One of every species at ULTRA = **21.2k** against a 250k budget. Build time
  6–10 ms per species, and `director.js:49` already prewarms every species at
  init, so it is load-time, not frame-time. Nothing here touches the hot loop.
- **The watermelon lost 7% of its *mean* on-screen height** (133.8 → 124.5 px),
  entirely because it is a real ovoid now (3.26 × 2.64 × 2.16 units, was
  3.26 × 2.78 × 2.40). In the **good** orientation it is *bigger* than r3 —
  148 px tall against ~144 — and only smaller seen down its own pole. If the
  orientation fix below lands, this is a size *gain*, not a loss.
- **RISK, not my file — `slicer.js:78`** sets `f.lastStroke = strokeId` *before*
  `cut()`, so a stroke whose plane passes within `radius*0.92` of the centre but
  misses the body immunises that fruit for the rest of the stroke. The melon's
  short half-axis is now 1.08 units against slicer's 1.51 accept radius (r3: 1.20
  vs 1.51), so that near-miss band widened. It is **not** a hit-generosity
  regression — a swipe that visually crosses the fruit necessarily has a plane
  that intersects it, and those all cut cleanly (measured, §5) — but if slicer
  ever wants to retry a near-miss, move the `lastStroke` write to after `cut()`
  succeeds.

## 7. STILL NOT IN THIS FILE — `src/play/director.js:79`

Unchanged from my r3 report, and the r3 critic independently reached the same
conclusion ("Root cause is src/play/director.js:79 … do this before spending any
more on appendage size"). It is **no longer the constraint on identifiability** —
round 4's whole point is that the worst orientation went from "a mathematically
round ball" to "13% out of round with a stem spur on the limb, a flat side and a
five-lobed waist". But it is still the constraint on getting the *good* view.

```js
// director.js:79 — replace the uniform Euler
const roll = rr(rng, 0, 6.28);            // free spin in the screen plane
const tilt = rr(rng, -0.55, 0.55);        // keep +Y near the screen plane
const yaw  = rr(rng, 0, 6.28);            // free spin about the fruit's own axis
f.quat.setFromEuler(new THREE.Euler(tilt, yaw, roll, 'ZXY'));
```
and clamp `spin.x`/`spin.z` (currently ±1.4 / ±0.9) so the fruit does not tumble
back out of that pose in the ~0.3 s before the hero shot. Every appendage in this
file is authored on or near +Y; that change makes the melon's long axis, the
apple's stem and the pineapple's crown legible on **every** spawn instead of on
the lucky half.

## 8. Tools left behind (all dot-prefixed, outside the `src/main.js` bundle)

| file | what it does |
|---|---|
| `.geosil.mjs` | orthographic silhouette probe at real framing — bbox, aspect, 720-ray radial trace, boundary FFT k=1..8 and k>20, over N uniform orientations. Reproduces the critic's statistic. |
| `.geoview.mjs` | shaded z-buffered contact sheet → PNG. Six orientations × N species. Use this before trusting any number; the first facet search produced a flat-topped, stemless apple that scored *better*. |
| `.geostar.mjs` | star-shape (3000 rays), winding, format, NaN and group validation across all detail tiers. |
| `.geocut.mjs` | 540 random planes through the real `cutGeometry()`; cap size, closure, throws. |
| `.geoopt.mjs` | random search over facet planes for one species. |
