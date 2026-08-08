# r8 — fruit/geometry.js (the appendage contract, verified end to end; the strawberry; the leek)

**FILE TOUCHED: `src/fruit/geometry.js`. Nothing else in `src/`.**

New, none of it imported by the game or by `build.mjs` (whose only entry point is
`src/main.js`):

- `tools/geometry-r7-snapshot.js` — byte copy of r7's shipping `geometry.js`, so
  every "before" number below is **re-derived in one command**, not quoted. Same
  pattern and same reason as the existing `geometry-r5-snapshot.js` /
  `geometry-r6-snapshot.js`.
- `tools/.r8geo-meas.py`, `.r8ab.py`, `.r8sheet.mjs`, `.r8verify.mjs`,
  `.r8cut.mjs` — my harnesses. `.r8geo-meas.py` and `.r8ab.py` **shell out to
  `tools/probes.py` and do nothing else**; they compute no statistic of their own.
- `rounds/reports/r8-fruit-geo-silhouettes.png` — r7 left 6 poses, r8 right 6,
  six species, rasterised by the same fill rule `probes.py` uses.

`npx esbuild src/fruit/geometry.js --bundle --outfile=/dev/null` clean.

---

## 0. ⚠ `tools/probes.py` IS BYTE-FOR-BYTE UNCHANGED

md5 **`d6b2b531421be7b2745370c5c2ac4659`**, `PROBE_VERSION` stays **8**. I added no
probe and modified none: the r7 builder added `limb` to measure exactly the thing
this round is judged on, and it measures it.

Verified rather than asserted — the canary the brief names still reproduces:

```
python3 tools/probes.py suite shots/r5
  clip:05-cut+500ms.png        mask_px 9490      (5.227%)
  clip:08-citrus-caps.png      mask_px 2104
  silhouette:01-whole-watermelon.png mask_px 12139  boundary_cv 0.1333
```

---

## 1. HEADLINE

`python3 tools/probes.py species pose=so3 n=32` (+ `limb`, same pose set),
r7 re-derived from `tools/geometry-r7-snapshot.js`:

| species | tris | elongation | boundary cv | within | **nearest-other** | **separation** |
|---|---|---|---|---|---|---|
| watermelon | 3636 → 3636 | 1.334 | 0.105 | .0131 | .0424 | 3.24 → **3.24** |
| orange | 2120 → 2120 | 1.010 | 0.008 | .0060 | .0349 | 5.81 → **5.81** |
| kiwi | 2560 → 2560 | 1.622 | 0.173 | .0091 | .0688 | 7.54 → **7.54** |
| apple | 2464 → 2464 | 1.138 | 0.090 | .0180 | .0734 | 4.07 → **4.07** |
| **strawberry** | 3408 → **3048** | 1.191 → **1.345** | 0.113 → **0.139** | .0292 → **.0239** | .0769 → .0749 | 2.63 → **3.13** |
| **pineapple** | 7464 → **6752** | 2.803 → **2.576** | 0.352 → 0.322 | .0593 → **.0430** | .1838 → .1494 | 3.10 → **3.47** |
| | **21652 → 20580** | | | | | **worst 2.63 → 3.13, median 3.66 → 3.77** |

`star_multivalued_total` **0**, on both pose sets and at detail 4 / 6 / 8 / 11 —
cutter.js's star-shaped precondition holds everywhere.

`pose=ship n=24` (what the game actually spawns): worst **4.06 → 4.46**, median
6.65 → 6.65. Strawberry 4.50 → 4.46 (**−0.04, flat**) but its two *body-shape*
numbers, the ones the r7 verdict said had REGRESSED while the species was being
worked on, are up hard: elongation 1.222 → **1.372**, cv 0.123 → **0.149**.
Pineapple 4.06 → **4.46**.

Smaller pose sets and lower tiers, so nobody has to take n=32 on faith:

| | r7 | r8 |
|---|---|---|
| so3 n=16 detail 11, worst | 2.15 | **2.60** |
| so3 n=16 detail 8, worst | 2.07 | **2.63** |
| so3 n=16 detail 6, worst | 2.31 | **2.67** |
| so3 n=16 detail 4, worst | 2.17 | **2.54** |

**Both verdict gates on the strawberry are met**: `elongation_median` 1.345 against
≥ 1.30, `boundary_cv` 0.139 against ≥ 0.125.

---

## 2. ⚠ PERF — TRIANGLES AND DRAW CALLS, STATED EXPLICITLY

**DRAW CALLS: +0.** This file emits one `BufferGeometry` per species per tier. It
creates no mesh, no material, no pass, no texture. Nothing in it can touch the
123/120 number.

**TRIANGLES: NEGATIVE AT EVERY TIER.** Whole-fruit meshes, one of each species
(`tools/.r8verify.mjs`):

| detail (tier) | r7 | **r8** | Δ |
|---|---|---|---|
| 4 (LOW) | 5528 | **5292** | **−236 (−4.3%)** |
| 6 (MED) | 9302 | **8676** | **−626 (−6.7%)** |
| 8 (HIGH) | 13672 | **12786** | **−886 (−6.5%)** |
| 11 (ULTRA) | 21652 | **20580** | **−1072 (−5.0%)** |

**AND THE PEAK EVENT GOT CHEAPER TOO**, which matters more than the static count:
240 pseudo-random legal planes per species through the real `cutGeometry`, zero
failures on both builds (`tools/.r8cut.mjs`):

| | cap mean | cap max | **largest single half** |
|---|---|---|---|
| watermelon / orange / kiwi / apple | identical | identical | **identical** |
| strawberry | 1046 → 1050 | 1235 → 1235 | 4582 → **4278 (−6.6%)** |
| **pineapple** | 1231 → **1157** | 3679 → **2548 (−31%)** | 11136 → **9646 (−13.4%)** |

The pineapple's worst-case half is the single largest mesh this game can produce
and it is **1490 triangles lighter**. The r7 report had to *admit* +144 on the
pineapple cap; this one gives it back and more.

**Nothing was added to buy this.** The saving is `pineapple crown.cols` 108 → 88
and `strawberry crown.cols` 140 → 90, both of which are affordable *because* the
blades got wider — see §4 and §5.

---

## 3. THE ASSIGNED JOB: VERIFY THE CONTRACT AS IT STANDS **TODAY**

I did not assume the fix matches my comments. I read `src/fruit/species.js` at
HEAD (md5 `055d53c6a2ce9302a9e1cc0674471f2c`) and grepped every consumer of the
fruit's uv in the whole tree.

**It is implemented. My comments were wrong about it in two ways, and both are
now fixed on my side.** The consumers, quoted:

```
species.js:1771  wood  = smoothstep(1.680, 1.755, uv.y)
species.js:1772  leafy = smoothstep(1.020, 1.120, uv.y) * (1 - wood)
species.js:1774  green = smoothstep(1.260, 1.600, uv.y)
species.js:1775  bh    = clamp01((uv.y - 1.00) / 0.70)
species.js:1776  sh    = clamp01((uv.y - 1.75) / 0.20)
species.js:1258  capCoords()  uv().y.clamp(0,1)      — the CUT FACE, untouched
```

`grep -rn 'uv()' src/` returns nothing else against fruit geometry: `stage.js`'s
three hits are its own lens quad. `src/slice/cutter.js:998/1062` write cap and
collar uv.y in [0,1] with exactly 1.0 on the rim, and `cutter.js:1113` blits the
retained skin's original uv, so a sliced half keeps its mask. All verified by
reading those lines, not by trusting a comment — including my own.

### 3.1 ⚠ FINDING ONE — EVERY STALK IN THE GAME WOULD HAVE SHADED AS PALE STRAW

species.js reads the stem band as a **height fraction**, "0 at the root and 1 at
the tip on every appendage in the game", and mixes a pale dry broken end
(`A_WTIP`, ~1.55× brighter than `A_WUD`) in at `sh → 1`.

The **woody-crown** path was fine: `1.75 + 0.20 * clamp01(h/crownMax)` really is 0
at the root.

The **profile-stem** path was not. It wrote `1.75 + 0.20 * ring.v`, and `ring.v`
is `i / (n - 1)` — the fraction of the **whole profile array**, which on the first
stem ring (the well floor) is already ≈ 0.96, because a stem is spliced onto the
top of a 360-sample profile. Measured on the delivered geometry, every stem vertex
in the game sat in `uv.y ∈ [1.75, 1.95]` at `sh ≈ 0.96–1.00`, i.e. `sh²` ≈ 0.92–1.0:
**the apple's 0.70-unit stalk, the watermelon's stem scar, the orange's and the
kiwi's stem buttons would all have rendered end-to-end in the pale cut-end
colour** the moment the appendage contract went live. Neither file was wrong on
its own. This is the same class of bug as the one the r7 critic found, one round
later, on the same contract.

Fix: `layoutRings` now carries `sv`, the **stem-local** fraction
`(i - stemStart) / (n - 1 - stemStart)`, and the mark uses it. Verified on the
built geometry: the wood band now spans 1.750 → 1.950 on the apple and the kiwi
(it spanned 1.94 → 1.95 before).

### 3.2 ⚠ FINDING TWO — 14% OF THE GOLD BODY SKIN WAS LEAKING BACK ONTO THE CROWN TIPS

species.js:1771's comment says its wood ramp "is deliberately ZERO at 1.70, the
top of the leaf band". **It is 0.175.** `smoothstep(1.680, 1.755, 1.70)` = 0.175,
because the ramp's *foot* (1.680) lies **inside** the foliage band this file
documents as (1.00, 1.70]. Since `leafy` is multiplied by `(1 - wood)`, the tip of
the longest pineapple blade resolved to

```
0.175 * woodC + 0.144 * BODY SKIN + 0.681 * leafC
```

— 14% of the gold pineapple peel, on the most visible vertices in the crown, which
is the *exact* "gold feather-duster" tell the whole contract exists to kill.

Fix, from my side alone and monotone-safe if species.js later moves that foot
**up**: the foliage band now tops out at **1.66**, `1.00 + 0.66 * clamp01(h/crownMax)`.
`bh` still reaches 0.943 (the dry-tip blend `smoothstep(0.80,1.00,bh)` still
resolves 0.97) and `green` still completes at `h/crownMax` = 0.909.
`.r8verify.mjs` asserts no vertex lands in either forbidden gap, (0.98, 1.00) or
(1.66, 1.75), at any tier.

**→ ONE THING FOR THE MATERIALS OWNER**, and it is a comment, not a request: your
`wood` foot at 1.680 is now unreachable from below by construction, so nothing is
broken either way; but the comment claiming it is zero at 1.70 is false and the
next person to move a band will believe it.

### 3.3 A STRAWBERRY'S STALK IS GREEN — `stemLeaf`

The mask is defined on **uv.y ranges**, not on which geometric feature produced
them, so a species may now set `stemLeaf: true` and put its profile stem in the
FOLIAGE band (`1.00 + 0.66 * sv`) instead of the wood band. The strawberry does;
nothing else does. It is also strictly the *more* continuous of the two: a
leaf-band stem starts at exactly 1.0, where `leafy` is still 0 and the body skin
ends at 0.98, so there is **no fringe quad at all** — whereas the wood band's 1.75
floor steps across one quad (species.js documents that trap and defuses it by
putting `green` late in the band).

Per-species uv band occupancy on the built ULTRA mesh, so the next reader does not
have to derive it:

| | body [0.02,0.98] | leaf (1.00,1.66] | wood [1.75,1.95] |
|---|---|---|---|
| watermelon | 10524 | 0 | 384 (spur + scar, woody) |
| orange | 6216 | 0 | 144 |
| kiwi | 7486 | 0 | 194 |
| apple | 6384 | 0 | 1008 (stalk + dried calyx) |
| strawberry | 7982 | **1162** (calyx + green stalk) | 0 |
| pineapple | 11496 | **8760** | 0 |

**None of §3 moves a vertex.** Re-running the full table immediately after the uv
work and before any shape change reproduced r7 **bit-for-bit on all six species,
all four statistics**. That is the check that proves the mask did not leak into
the geometry, and it is the one the r7 verdict asked for in the other direction.

---

## 4. THE STRAWBERRY — the verdict's gate, and one of its instructions measured and REFUSED

The r7 verdict: *"the strawberry is now the WORST species under SO(3) (2.63) and
its two body-shape numbers REGRESSED while it was worked on … at 49 deg off the
pole with len 0.44 the tips project ~9% wider than the body's own waist."*

**Verified by ablation, not accepted on authority.** With `crown: null` the r7
body measures elongation **1.241** / cv **0.102**; with the calyx on, **1.191** /
0.113. The calyx really was cancelling 0.050 of the cone — this entry's own
round-6 note ("THE CALYX WAS EATING THE CONE") half re-committed in round 7.

What ships: `ry` 1.420 → **1.580**, `pTop` 3.30 → **3.60**, calyx **up the
shoulder and short** (a 0.86 → **0.74** rad, len 0.44 → **0.38**), **six** sepals
not five, `cols` 140 → **90**, `jit/jitA` 0.12/0.035 → **0.06/0.018**,
`wArc` 0.062 → 0.068, `stemLeaf: true`.

**Three of the verdict's own instructions I measured and did not follow, and here
is the arithmetic:**

1. **"pBot 1.08 → 1.02".** A sharper apex is worse on both of its own gates *and*
   on separation. Holding everything else: pBot 1.02 / 1.10 / 1.24 →
   elongation **1.314 / 1.345 / 1.390**, separation **3.12 / 3.13 / 2.98**, and
   1.02 also costs 80 triangles. Past ~1.16 the body drifts toward the
   apple/watermelon ovoid and `nearest_other` collapses. **pBot ships at 1.10,
   i.e. r7's value.** The strawberry's problem was never its point.
2. **"the calyx back to a = 0.52–0.60 rad".** I measured 0.58 / 0.66 / 0.74:
   separation **2.94 / 2.72 / 3.18**, triangles **4078 / 3920 / 3722**, same
   elongation to two digits. `layoutRings` walks the profile by **arc length**
   with the spacing scaled by the local radius, so a crown band nearer the pole is
   cheap in radius and expensive in ring count. The gate is met at the cheaper
   angle, so the cheaper angle wins: **0.74**.
3. **Five sepals.** n = 5 / 6 / 7, otherwise identical: within-species
   **.0250 / .0241 / .0265**, separation **3.00 / 3.12 / 3.05**. The calyx is the
   only thing on this fruit that changes with ROLL, so its `n` sets the
   within-species floor. **Six**, which is inside the botanical 5–10.

Result: elongation **1.191 → 1.345**, cv **0.113 → 0.139**, within **.0292 → .0239**,
separation **2.63 → 3.13**, and it is **360 triangles CHEAPER** despite a taller
body. The r7 shot `shots/r7/11-combo+550ms` cropped 6× shows a **spiked ball** —
a sea urchin with red thorns all round its equator. The r8 contact sheet shows a
cone with a point and a calyx sitting on its shoulder.

---

## 5. THE PINEAPPLE — "ours is a leek", and the change that actually paid

Two changes; the second is the one that mattered.

**Crown `len` × 0.78** (2.45/2.22/1.88 → 1.911/1.732/1.466). The crown now stands
~0.68 of the body's height above it, which is what plate-01 measures (crown ≈ 170
px over a ≈ 250 px body). `elongation_median` 2.803 → **2.576**.
**I am not going to claim more than that.** Even at ×0.62 it only reaches 2.336,
because this species' k=2 harmonic is dominated by the body plus the crown's mass;
you cannot get to plate-01's ~1.95 by shortening leaves without ending up with a
barrel wearing a bristle brush. The rest of that gap is a *shading* question, and
as of round 8 the crown finally shades as foliage instead of as gold body skin —
which is exactly the change the brief said should alter what I do next.

**THE LEAVES ARE STRAPS: `wArc` × 1.35, `wp` 0.170 → 0.200.** This is the change
that pays, and it pays on the metric that settles identity rather than on taste.
Measured alone, holding length:

```
wp 0.170, wArc x1.00 :  within .0504   separation 3.07
wp 0.200, wArc x1.35 :  within .0427   separation 3.51     <-- ships
```

A crown of thin needles has a different outline at every roll; a crown of broad
straps does not. It is also plate-01's crown, which is ~10 wide grey-green blades
and not 24 hairs.

**`cols` 108 → 88 is the refund the wider blades pay for.** A 0.088-arc blade does
not need a 108-column pitch to be sampled on its peak: 7464 → **6752** triangles at
separation **3.47**, i.e. still +0.37 over r7 for −712 triangles. 72 columns also
measures 3.49, but at the LOW tier that is 32 crown columns for 8 blades per whorl
and the straps begin to touch at the root; 88 keeps 40 there.

**Blade count checked, not assumed.** n = 8/8/8 (24) beats every alternative on
separation at matched total width: 24 → **3.47**, 21 → 3.35, 18 → 3.13 (3.23 at cols 72), 15 → 2.82.
Fewer, fatter leaves lose to roll variance faster than they gain from coherence.

---

## 6. PORTRAIT, REASONED EXPLICITLY — AND THE PINEAPPLE WAS THE RISK

`geometry.js` contains **no aspect-dependent term of any kind**: no camera, no NDC,
no frame-relative constant. Every number is world units and `k` normalises on
`species.radius`, which is species.js data.

The coupling runs through framing. `main.js:208-209` fits ±`STAGE.halfExtent`
(contract.js: **3.9**) in **both** axes, so landscape binds on **height** and
portrait binds on **width**. A fruit's portrait risk is therefore its **diameter**:

| | landscape height % of frame | portrait width % of frame |
|---|---|---|
| **pineapple** | 93.8% → **80.3%** | 39.3% → **35.2%** |
| strawberry | 19.7% → 19.3% | 15.3% → **12.8%** |
| watermelon / orange / kiwi / apple | unchanged | unchanged |

The pineapple at **93.8% of landscape frame height** was the real number here and
I had not seen it before this round: an upright r7 pineapple essentially filled
the frame top to bottom. It is now 80.3%, and its portrait width is down 4.1
points. **The strawberry gives up 2.5 points of portrait width** — `k` divides by
`bodyExt` and `bodyExt` is now `ry` = 1.58 — and at 19.3% of landscape frame height
it is the smallest fruit in the game. I am naming that as the cost. It is not a
`REFERENCE_BAR` failure (the ≥25% floor is written for the hero shot, which is the
watermelon at 43.2%), and plate-01's own strawberry measures ≈19% of frame height,
but if a critic wants it bigger the lever is `species.radius` in **species.js**,
not this file.

---

## 7. CONTRACT RE-VERIFIED, MECHANICALLY (`tools/.r8verify.mjs`)

6 species × 4 detail tiers, **zero violations**:

- non-indexed; attributes exactly `position, normal, uv` and nothing else
- exactly two groups: `[0, n)` material 0, `[n, n)` **count 0** material 1
- no NaN in position or uv; all normals unit to 1e-3; `boundingSphere` present
- **signed volume > 0** everywhere (outward winding by construction; nothing flipped)
- uv.y never lands in a forbidden gap, (0.98, 1.00) or (1.66, 1.75), and never
  exceeds 1.95
- cross-sections star-shaped about the origin: `star_multivalued_total` **0** at
  detail 4 / 6 / 8 / 11 and on both pose sets
- `cutGeometry` over 240 pseudo-random legal planes per species: **0 failures**

---

## 8. WHAT I DID NOT DO, AND THE MEASUREMENTS THAT DECIDED IT

- **The verdict's third item — "every body is still a strict solid of revolution;
  `hull_concave_frac_pct` EXACTLY 0.00 for the orange and the kiwi".** True, and I
  tried to fix it. `asym` is the only lever (direction-domain, so it cannot be
  hidden by an unlucky spawn) and **it is priced in separation, because it is by
  construction pose-varying**: orange `asym` 0.016 → 0.040 takes separation
  **5.81 → 3.96**; → 0.060 takes it to **3.31**. Kiwi 0.020 → 0.055 takes
  7.54 → **6.70**. Watermelon 0.030 → 0.055 takes 3.24 → **2.66**, which would
  make the *hero* the worst species in the game. Against a worst-case of 3.13 I am
  not spending 2.7 points of separation on a lopsidedness of 2–4% of radius, on
  the two species (an orange and a kiwi) that genuinely **are** convex, when
  plate-01's own orange and melon have visibly smooth limbs. The verdict ranked
  this third and did not promote it; I agree with that ranking and I am recording
  the price so the next round does not have to re-derive it.
- **A curved apple stalk.** The sheet shows it as a rigid drinking straw and real
  stems bend. `bend2` is the only mechanism and it costs zero triangles — and
  0.61 of separation: apple `bend2` 0 / 0.05 / 0.09 → **4.07 / 3.46 / 3.34**, and
  the species' nearest neighbour flips from the watermelon to the strawberry.
  Refused. A stem that curves *independently of the body* needs a per-ring
  azimuthal offset in `buildProfile`, which is a real lever and is still untried.
- **The apple stem well as an outline notch.** Still impossible for an
  axisymmetric body — the r7 proof stands (at screen-x 0 the far meridian
  contributes +r·sin t, so the top of the outline is always on the axis). The only
  geometry that can deliver it is a **broken well rim**, i.e. 5 short woody
  knuckles as a second crown whorl at a ≈ 0.6 rad. Untried, and it is the one
  remaining structural idea in this file I would spend a round on.
- **The watermelon, orange, kiwi and apple are UNTOUCHED.** Bit-identical meshes
  (3636 / 2120 / 2560 / 2464 triangles, every statistic identical to four digits,
  identical cut cost over 240 planes). Four of six species still name the
  watermelon as their nearest neighbour, unchanged from r7, and it remains the
  generic ellipsoid the table is collapsing toward. A melon really is a smooth
  ellipsoid; what separates it in the plate is that it is **huge**, which is
  director/stage, not geometry.

**Could I name them from the outline alone?**
`rounds/reports/r8-fruit-geo-silhouettes.png`, r7 left 6 poses, r8 right 6.
Strawberry: a cone with a point and a calyx on its shoulder, where r7 gave a
spiked ball. Pineapple: a barrel wearing a crown that is now clearly shorter than
the fruit. Apple, kiwi, orange, watermelon: unchanged and already nameable.
On my own axis the remaining tell is the pineapple: 24 straps still read as a
brush rather than as plate-01's ten arched blades, and nothing in this file can
make a blade **arch** — `skew` moves a spine in azimuth, not in polar angle.

## Reproduce everything

```
md5sum tools/probes.py                                  # d6b2b531421be7b2745370c5c2ac4659
python3 tools/probes.py suite shots/r5                  # clip mask_px 9490, unchanged
python3 tools/.r8geo-meas.py tools/geometry-r7-snapshot.js so3 32     # the r7 column
python3 tools/.r8geo-meas.py -                          so3 32        # this build
python3 tools/.r8geo-meas.py tools/geometry-r7-snapshot.js ship 24
python3 tools/.r8geo-meas.py -                          ship 24
node    tools/.r8verify.mjs                             # tiers + contract invariants
node    tools/.r8cut.mjs ../tools/geometry-r7-snapshot.js ; node tools/.r8cut.mjs
node    tools/.r8sheet.mjs out.png tools/geometry-r7-snapshot.js,src/fruit/geometry.js ship 6
```
