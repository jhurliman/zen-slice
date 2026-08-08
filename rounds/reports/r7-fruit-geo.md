# r7 — fruit/geometry.js (identity on the LIMB: the stalk, the calyx star, the crown)

**FILES TOUCHED**
- `src/fruit/geometry.js` — mine.
- `tools/probes.py` — **added ONE command, `limb`; PROBE_VERSION 6 → 7.** Loud notice in §0.
- `tools/geometry-r6-snapshot.js` — **new, not imported by the game.** It is the r6
  shipping table verbatim, so every delta below is re-derivable in one command
  instead of quoted. Same pattern, same reason, as `tools/geometry-r5-snapshot.js`.
- `rounds/reports/r7-fruit-geo-silhouettes.png` — r6-vs-r7 contact sheet, 6 species
  × 6 shipping poses each, rendered from the same rasteriser the probe uses.

Nothing else. No new deps, no network, `npx esbuild src/fruit/geometry.js --bundle`
clean.

---

## 0. ⚠ LOUD NOTICE — PROBE_VERSION 6 → 7, ADDED AT THE START OF THE ROUND

I added the `limb` command to `tools/probes.py` and bumped `PROBE_VERSION` to 7.
**No existing probe's executable code changed by one character** — `clip`, `void`,
`ring`, `silhouette`, `droplets`, `particles`, `tintlaw`, `lens`, `foam`, `collar`
and `species` are byte-identical, `PROBES` and `SUITE` are untouched, and
`_SPECIES_JS` (the node harness `species` runs) is untouched, so `limb` and
`species` rasterise the *same* silhouettes from the *same* code.

Verified, not asserted — I diffed the full JSON:

```
suite shots/r5   under v7 == under v6   IDENTICAL   (all 16 rows)
suite shots/r6   under v7 == under v6   IDENTICAL   (all 16 rows)
species pose=ship n=24 on the r6 table  IDENTICAL   (7.73/10.92/10.18/2.55/2.90/2.77,
                                                     worst 2.55, median 5.31,
                                                     tris 23212, star_bad 0)
```

The bump is bookkeeping. Every v1–v6 number in an earlier verdict remains comparable.

**I did it because the r6 verdict told me to, in its own words:** *"elongation,
boundary cv and the signature distance are all blind to CONCAVITY-vs-convexity and
to appendage WIDTH … I deliberately did NOT bump PROBE_VERSION for it … Next round
should add it on purpose."* Its `fix` field then specified the instrument exactly —
*"the angular fraction of the boundary that is CONCAVE beyond 2% of mean radius,
and the median angular WIDTH of every convex protrusion above a k<=3 fit"*. That is
what `limb` reports, verbatim, over the same pose set, from the same geometric mask
(the rasterised triangle footprint — it cannot see colour at all), with `mask_px_median`
printed exactly as `species` prints it so the two can be cross-checked on one build.

### ⚠ AND I SHIPPED A CONTROL, BECAUSE THE SPECIFIED STATISTIC IS GAMEABLE AND I CAUGHT IT

A k≤3 **fit** is dragged upward by a narrow spike, which drops the baseline above
most of a perfectly convex body. Run on **r6 as delivered**, the specified statistic
reports:

| | `concave_frac_pct` (k≤3 fit) | `hull_concave_frac_pct` (control) |
|---|---|---|
| kiwi — a convex barrel, no concavity anywhere | **25.56%** | **0.00%** |
| apple — the verdict's "smooth 1.13 spheroid" | **43.47%** | 48.19% |
| pineapple — the crown | 35.28% | 72.64% |

The verdict's own gates were *"apple concave fraction ≥ 6%, strawberry ≥ 8%"*, and
**r6 already passed both** at 43.5% and 38.3%. Shipped alone, that statistic would
have let round 7 claim a win for doing nothing. So `limb` also reports the distance
from the outline to **its own convex hull**, per ray, in % of mean radius: that is
what concavity *is*, it has no baseline to fool, it is exactly 0 on any convex
outline at any elongation, and no spike can make a convex region read as a notch.
**Quote both.** Only one of them can be talked into a number it did not earn.

Cost ~6 s, same as `species`; not in `SUITE` for the same reason (SUITE takes a
shots dir, this takes none).

---

## 1. HEADLINE — `species pose=ship n=24`, r6 → r7

All "before" numbers re-derived, not quoted:
`python3 tools/probes.py species src=tools/geometry-r6-snapshot.js pose=ship n=24`

| species | tris | within-species | **nearest-other** | **separation** |
|---|---|---|---|---|
| watermelon | 3636 → 3636 | .0094 → .0094 | .0730 → .0730 | 7.73 → 7.73 |
| orange | 2120 → 2120 | .0058 → .0058 | .0638 → .0772 | 10.92 → 13.21 |
| kiwi | 2560 → 2560 | .0070 → .0070 | .0709 → .0709 | 10.18 → 10.18 |
| **apple** | 2740 → **2464** | .0286 → **.0181** | .0728 → **.1008** | **2.55 → 5.57** |
| **strawberry** | 3780 → **3408** | .0308 → **.0203** | .0891 → **.0915** | **2.90 → 4.50** |
| **pineapple** | 8376 → **7464** | .0619 → **.0490** | .1715 → **.1991** | **2.77 → 4.06** |
| | **23212 → 21652** | | | **worst 2.55 → 4.06, median 5.31 → 6.65** |

Under the harsher uniform-SO(3) set the r5 critic used
(`species pose=so3 n=32`): worst **2.06 → 2.63**, median **2.86 → 3.66**; apple
2.47 → 4.07, strawberry 2.06 → 2.63, pineapple 2.13 → 3.10.

**The r6 verdict's sharpest criticism was "THE SEPARATION GAIN IS MOSTLY
DENOMINATOR, NOT NUMERATOR — for four of six species the between-species distance
FELL." This round the numerator rose for all three targeted species in BOTH pose
sets** (+38% / +3% / +16% ship; +30% / +17% / +13% so3) **and the denominator fell
as well.** The orange's separation moved only because its nearest *neighbour* (the
apple) moved away from it; its mesh is bit-identical.

`limb pose=ship n=24`, the two numbers the verdict asked for:

| species | `protr_width_deg` r6 → r7 | `hull_concave_frac_pct` r6 → r7 |
|---|---|---|
| apple | 11.0 → 9.0 | 48.2 → 44.7 |
| strawberry | 12.0 → 13.0 | 35.0 → 46.2 |
| **pineapple** | **5.0 → 7.0** (gate: ≥ 6) | 72.6 → 76.4 |

The apple's two numbers went slightly *down* and I am not going to pretend
otherwise: both were inflated in r6 by a 0.096-wide hair of a stalk, and a narrow
spike maximises both statistics (it drags the fit up and it makes the hull bridge a
long arc) while looking like nothing. The apple's honest evidence is its
separation, 2.55 → 5.57, and the contact sheet.

`star_multivalued_total` = **0** on both pose sets and at detail 4 / 6 / 8 / 11 —
the cutter.js star-shaped precondition holds everywhere.

---

## 2. THE APPLE — a theorem, and a negative result

The brief asked for the stem well as *"a notch in the top of its outline"*. **That
is geometrically impossible for an axisymmetric body, and proving it is what
decided this species.**

For an axisymmetric solid whose polar axis is tilted `t` out of the image plane,
the outline height above screen-x = X is a maximum over the surface points at that
X. At X = 0 that maximum runs over **both** meridians, so the *far* one contributes
`+ r sin t`. Therefore

> `Ymax(0) ≥ Ymax(X)` for every X and every t > 0.

The top of the outline is **always on the axis**. No dish of any depth and no crest
of any height can put a notch beside it. Only `t = 0` exactly — and `director.js`'s
pose has |t| uniform on [0, 0.49] rad, median 0.245.

Numerically, on the **r6** apple at t = 14° the outline sits at 0.804 body units at
X = 0 and 0.689 at the well rim (X = 0.436): a dome, with a 0.36-deep dish
contributing exactly nothing. **That is the mechanism behind "boundary cv actually
FELL 0.095 → 0.069 while you worked on it."** It generalises the round-4 envelope
note from "smooth bumps" to "every axisymmetric concavity".

What survives the envelope is a **local maximum**. So:

- **The stalk is the identity.** r 0.106 → 0.145, len 0.72 → 0.92 of body radius —
  0.13 × 0.70 in final units, a 5.4:1 stalk clearing the well rim by 0.42, against
  r6's 0.096 × 0.71 hair. **Ablated in isolation this one change is worth
  +0.036 on nearest-other (0.0652 → 0.1008): numerator.**
- **The crest is real but it is a profile cue.** shoulder 0.075 → 0.100, width
  halved (0.50 → 0.30), moved up (0.25 → 0.32). Widest ring now at u = 0.32 and
  **5.9% outside the equator** — the verdict asked for 4–7%. r6's broad shoulder
  inflated the whole upper half uniformly and its crest measured **0.3%**.
- **taper 0.14 → 0.28 at taperK 2.2.** K is what decides whether narrowing the
  calyx end also shaves the waist: K = 1.6 cost **11%** of the girth for the same
  profile, K = 2.2 costs 4.1%.
- **The five calyx sepals shrink 0.215 → 0.110 with the jitter removed.** They were
  this species' largest source of pose variance: ablated entirely they take
  within-species 0.0320 → 0.0113 and separation 2.53 → 4.88. A real dried calyx is
  millimetres on an 80 mm fruit. Kept, small, only so species.js's `wood` uv band
  still has geometry under it. `lobeAmp` 0.115 → 0.075 for the same reason.

---

## 3. THE PINEAPPLE — the spearhead bug, and the cross-section bug

**"~8 thin drooping filaments that read as a squid."** Two causes, both arithmetic.

**(a) The blade was widest in the middle.** A blade is a radial bump, so its
meridian half-width in LINEAR units at extension fraction `e` is
`x2(e) · wp · (Rb + len·e)` with `x2 = sqrt(1 − e^(1/pPol))`. At r6's `pPol` 1.30
with Rb 1.5, len 2.0 that product is **0.33 / 0.38 / 0.22** at e = 0 / 0.5 / 0.9 —
wider at mid-length than at the root. Thirty of those, tiled at the root
(0.90/0.95/0.98) over three polar footprints that overlap completely
(0.11±0.30, 0.33±0.33, 0.58±0.33), weld into one mass exactly where they are
widest and separate only where they have already tapered away. **A fused cap with
a fringe of hairs is the only thing that geometry can produce.**
`pPol` 3.0 inverts it: **1.00 / 0.76 / 0.29** — width held, then a point. A sword.

**(b) The leaves were needles, not straps, and `wArc` is why.** `wa = wArc/sin(ax)`
is an ANGLE, so linear widths are `wArc·R` azimuthally against `wp·R` in the
meridian. r6's nominal 4.4:1 was then overridden by `tile` up to 0.44 of the whole
sector — a real **1.6:1** — and `(1−x1)^2.40` has a **corner at the spine**, so
every leaf carried a ridge down its middle and shaded as a spike. I found this only
by rendering a shaded z-buffer view; it is invisible in silhouette.
`round: true` swaps the azimuthal profile to `(1−x1²)^1.15`, flat-topped, no ridge.

Result: **24 leaves in three ranks**, sweep 7/17/26° (25–40° once each rank's own
±10° footprint and the projection at every azimuth are counted), `tile` gone so each
root is its own object, `wArc` 0.050–0.065 against `wp` 0.170 — an honest **2.9:1
strap, 0.51 wide at the base = 25% of the body's 2.0 diameter** against the
verdict's 9% floor.

**Jitter was the separation defect.** A crown of independently-jittered spikes has a
different outline at every roll, which is why the pineapple was the only species to
LOSE separation in r6. Measured, holding everything else: `jit` 0.20 → 0.08 moves
within-species 0.0758 → 0.0644 and separation 2.34 → 2.83. Final `jit` 0.07–0.09
against r6's 0.60–0.70.

---

## 4. THE STRAWBERRY — a star, not a serration

r6's calyx measured `limb protr_n` **10** at a median width of 12°: twelve tiled,
skewed, heavily jittered sepals welded into a continuous frill clinging to one side
of the shoulder. Its own in-file note argued *for* the welding — *"a calyx is not
six needles poking the limb, it is a continuous serrated cap"* — which is right
about a calyx seen from above and wrong about the only view this game shows, where
a continuous cap is indistinguishable from a lumpy shoulder.

**FIVE distinct sepals, one rank, `tile` removed, jitter 0.34/0.38 → 0.12, skew
0.9 → 0.22.** The verdict asked for *"5 distinct sepal tips standing PROUD of the
shoulder by ≥ 12% of body radius"*; these stand proud by **34%**. They sit at
a = 0.86 rad (49°), the polar angle that puts a tip on the **limb** rather than on
the cap. Same `round: true` flat cross-section as the crown — r6's sepals were
0.136 × 0.189, a **1.4:1 horn**; these are 0.062 × 0.175, **2.8:1**.

r6's second rank is deleted: 0.10–0.19 long, no tip, and its polar band [0.26, 0.66]
doubled the crown's ring count on the smallest fruit in the game. Deleting it paid
for `cols` 72 → 140 (which a 0.062-wide sepal needs to be sampled on more than one
column) and the species still got **cheaper: 3780 → 3408**.

The apex was already fine and I left it alone: measured curvature radius **2.3%** of
the equatorial radius against the verdict's ≤ 6% gate.

---

## 5. PERF — this round GAVE BACK, it did not spend

Geometry cost, one of every species:

| detail (tier) | r6 | r7 |
|---|---|---|
| 4 (LOW) | 5840 | **5528** |
| 6 (MED) | 9962 | **9302** |
| 8 (HIGH) | 14346 | **13672** |
| 11 (ULTRA) | 23212 | **21652** (−6.7%) |

**Draw calls: zero change.** This file emits one geometry per species per tier; it
does not create meshes, materials or passes. Nothing here touches the 88/120 budget.

**Cut cost**, 240 random legal planes per species through the real `cutGeometry`,
zero failures both builds:

| | cap tris mean | cap max | largest half |
|---|---|---|---|
| watermelon / orange / kiwi | 1076 / 1173 / 1069 → **identical** | identical | identical |
| apple | 1076 → 1089 | 2176 → 2371 | 5152 → 5278 |
| strawberry | 1067 → **1035** | 1299 → **1235** | 5338 → **4746** |
| pineapple | 1212 → **1356** | 3473 → 4290 | 12842 → 12920 |

**The one thing that got dearer is the pineapple's cap: +144 triangles on the mean
cut, so ~+290 per pineapple slice (two halves).** That is bought with the −1560
saved on the whole-fruit meshes, and the largest half a pineapple can produce moved
0.6%. Against a 250k ceiling and a 164k peak this is noise, but it is the cost and
I am naming it.

**Contract re-verified** for 6 species × 4 detail tiers: non-indexed, exactly
`position`/`normal`/`uv` and nothing else, exactly two groups
(`[0,n)` mat 0 / `[n,n)` mat 0-count mat 1), no NaN, all normals unit,
**signed volume positive** (outward winding by construction, nothing flipped), and
`boundingSphere` present.

---

## 6. PORTRAIT, REASONED EXPLICITLY

`geometry.js` contains **no aspect-dependent term of any kind** — no camera, no NDC,
no frame-relative constant. Every number in it is world units, and `k` normalises on
`species.radius`, which is species.js data. There is nothing in this file that can
behave differently in portrait.

The coupling that *does* exist is through framing, and it runs the good way.
`main.js:207` fits ±`STAGE.halfExtent` in **both** axes, so in landscape the binding
constraint is height and in portrait it is **width** (the camera pulls back until
3.9 units fit horizontally, and the visible half-height grows to 3.9/aspect). So a
fruit's portrait risk is its **diameter**, not its height:

| | landscape height, % of frame | portrait width, % of frame |
|---|---|---|
| pineapple | 69.5% → **64.5%** | 49.9% → **40.3%** |
| apple | 26.0% → 25.2% | 26.8% → 25.5% |
| strawberry | 17.9% → 17.9% | 14.5% → 15.4% |
| watermelon / orange / kiwi | unchanged | unchanged |

The pineapple was the species at portrait risk and its widest dimension came down by
**19%**. The apple gives up 0.8 points of landscape frame height (it is the calyx
taper plus the crest raising `bodyExt`, which `k` divides by) and stays above the
25% floor; the hero watermelon is untouched at 40.1%.

---

## 7. WHAT DID NOT MOVE, SAID PLAINLY

- **watermelon, orange and kiwi are UNTOUCHED**; their meshes are bit-identical
  (3636/2120/2560 tris, same cv to three digits, same cut cost over 240 planes).
- **Two of the verdict's three proposed gates were already met by r6** — apple
  concave 43.5% against ≥ 6%, strawberry 38.3% against ≥ 8%, both under the k≤3
  baseline the verdict specified. Only the pineapple width gate (5.0 against ≥ 6°)
  was failing; it now passes at 7.0. The gates are not the evidence. The separations
  and the contact sheet are.
- **A polar stem well still does not appear on the limb**, and per §2 it cannot. If
  the next critic wants the well as an *outline* event, the only geometry that can
  deliver it is a non-axisymmetric top — a broken crest ring, i.e. the well rim cut
  into 5 knuckles — and that is a real, untried lever I did not spend this round on.
- The apple's `protr_width_deg` and `hull_concave_frac_pct` both fell slightly. See
  §1.

**Could I name them from the outline alone?** Contact sheet
`rounds/reports/r7-fruit-geo-silhouettes.png`, r6 left, r7 right, 6 poses each.
Apple: body plus a stalk, every pose. Strawberry: cone, point, five sepal tips.
Pineapple: barrel plus a dense rosette of broad leaves. Watermelon, orange, kiwi
were already nameable and are unchanged. On my own axis the remaining tell is that
the pineapple's crown still spreads to ~45° in the poses where its axis is tilted
hardest, where plate-01's is a tighter fountain.

## Reproduce everything

```
python3 tools/probes.py species src=tools/geometry-r6-snapshot.js pose=ship n=24
python3 tools/probes.py limb    src=tools/geometry-r6-snapshot.js pose=ship n=24
python3 tools/probes.py species pose=ship n=24
python3 tools/probes.py limb    pose=ship n=24
python3 tools/probes.py species pose=so3  n=32     # the harsher r5-critic set
python3 tools/probes.py suite shots/r5             # unchanged under v7
```
