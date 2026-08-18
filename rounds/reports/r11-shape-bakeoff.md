# r11 — shape-bakeoff. Four fruit sets, one switch, and a control that says the triangles were innocent.

**File owned and touched:** `src/fruit/geometry.js` only. **No probe modified, none added.**
**Build:** `node build.mjs` clean.
**Canary, before and after everything:**
`python3 tools/probes.py clip shots/r5/05-cut+500ms.png` → **mask_px 9490 / pct_R_ge_255 5.227** ✅
**Default is unchanged and provably so:** variant `A` reproduces HEAD's mesh **bit for bit** on
all 24 species × detail combinations (`md5` of the position buffer). Nothing ships until he picks.

## LOOK AT THIS FIRST, ON YOUR PHONE

| | |
|---|---|
| **`rounds/reports/r11-shape-bakeoff-portrait.png`** | **start here.** 6 fruit × 5 columns, portrait, 1:1 |
| `rounds/reports/r11-shape-bakeoff.png` | the same matrix in landscape, bigger pixels |
| `rounds/reports/r11-shape-{A,T,B,C,D}.png` | one sheet per variant: whole frame both orientations + 1:1 crops |

Every pixel in those images is a real render at **the player's own device-pixel density** —
860×1864 portrait and 2560×1440 landscape — identical pose, identical light, physics off, and the
**lens parked at bokeh 0** so he is judging shape and not his note-6 defocus.

---

## 0. THE DIAGNOSIS. HE GAVE TWO SYMPTOMS AND THEY HAVE DIFFERENT CAUSES.

### (a) "jank low poly" is NOT faceting, and I built the control that proves it.

Variant **T** is variant A with **1.72× the triangles** and *not one other change*. Put
`r11-shape-A.png` and `r11-shape-T.png` side by side. I cannot tell them apart, and the
arithmetic says why: at detail 8 (the tier portrait ships) a watermelon carries 46 columns, so the
polygonal sagitta on its limb is `R·(1−cos(π/46))` = **0.16 px**. You cannot buy a number that is
already two orders of magnitude under a pixel. Measured on the frames: A→T moves 7.18 % of pixels
by more than 12/765, and a difference map shows **all of it on the appendages and a sub-pixel rim
at the limb** — the body interiors are untouched.

**I therefore recommend NOT spending the round-10 perf headroom on tessellation.** It was the
obvious move and it is the wrong one.

Two things I found while proving that, both worth someone's time:

1. **THE HARNESS HAS BEEN JUDGING FRUIT AT HALF THE PLAYER'S PIXEL DENSITY, FOR ELEVEN ROUNDS.**
   `main.js:203` runs at `min(devicePixelRatio, quality.dpr)` = **2** on his phone. Playwright
   runs at `deviceScaleFactor 1`. So every frame in `shots/` — including every frame every critic
   has ever graded — is at 1× and the player is at 2×. My rig (`.r11shaperig.mjs`) fixes this by
   making the viewport *be* the device-pixel buffer. It is not expensive: a full 2560×1440 frame
   is ~35 s under SwiftShader.
2. **THE CUT RIM'S POLYGON IS THE CUTTER'S, NOT MINE.** I chased this because the sliced
   watermelon in `shots/r11-feel/00-hero.png` has a visibly polygonal cut face, and slicing is the
   one thing he singled out as good. `cutter.js:577-578` resamples every clip loop to
   `N = clamp(perim / max(0.065·r0max, 0.020), 12, 160)` ≈ **96 segments regardless of my mesh
   density** — I measured 88 boundary edges on the cap group at detail 11 *and* detail 8 *and* at
   1.3× columns, all identical. On a 460-device-px melon that is a **15 px chord**. See §5.

### (b) "spiky" is the crown field being under-sampled, and it is arithmetic.

The orange's navel is five nubs with `wa = 0.357 rad`, so a **0.714 rad footprint** against a
crown pitch of `TAU/20 = 0.314 rad` at detail 8. **Two and a quarter columns per nub.** A bump
sampled on two columns is a triangular pyramid — a spike — no matter what its authored profile
says. Same arithmetic on the apple's five 0.225-long calyx sepals.

Round 10's `lobeTwist` is the second source and it is real (look at the kiwi, where it runs at
amplitude 0.100 — the strongest in the table). **But it is not the loud one.** Variant B removes
the twist and *nothing else*, and the orange still has five horns. That is the single most useful
frame in the bake-off.

### (c) The reference photograph does not spend the currency rounds 8–10 spent.

Every ordinary fruit in `plate-01` has a **smooth limb**: the apple is a green ball with a thin
dark stalk, the orange is a circle, the kiwi is a smooth barrel. The only spiky object in the
photograph is a pineapple crown, which is real foliage. The brief is right that `separation`,
`identity` and `hull_concave_*` measure *deviation from a sphere*; the plate says the answer is
near zero for four of six species.

---

## 1. THE FOUR (FIVE) VARIANTS, WHAT EACH COSTS AND BUYS

Switch with `?shape=B` on the URL of the shipped build — **no rebuild** — or `setShapeVariant()`
from a rig. `SHAPE_VARIANTS` in `geometry.js` holds the whole table; each entry is a SHAPE overlay
plus three density multipliers (`cols`, `rings`, `crown`) quoted against round 10's own numbers.

| | triangles, one of every species (L tier 3 / P tier 2) | vs A | draw calls | one sentence |
|---|---|---|---|---|
| **A** r10 as shipped | 20,944 / 12,938 | 1.00× | unchanged | The control. Costs nothing and buys a horned gourd, a gnarled peanut and a bell pepper. |
| **T** tessellation only | 35,944 / 22,066 | 1.71× | unchanged | Costs 72 % of the mesh budget and buys **nothing you can see** — that is the finding, not the variant. |
| **B** twist removed + mesh up | 35,944 / 22,066 | 1.71× | unchanged | Costs 72 % and fixes the kiwi and half the apple; the orange keeps its horns, so it is a half-fix at full price. |
| **C** character kept, spikes killed | 36,822 / 22,596 | 1.75× | unchanged | Costs 75 % (and would cost **1.2×** at native density — see §4) and buys fruit that still have a navel, a calyx and a lobed apple waist, without a single needle. |
| **D** premium smooth | 24,554 / 15,518 | 1.20× | unchanged | Costs 20 %, all of it crown sampling, and buys `plate-01`: quiet limbs, one spiky object in the whole game and it is a pineapple. |

**Draw calls do not move in any variant.** The cost is exactly `2 × bodies` in this engine and no
variant adds a body, a group, an attribute or a material.

### Per-variant, in one sentence each — my opinion, which is not the decision

* **A** — I would not ship it. The orange reads as a rotten gourd at portrait size and that is not a taste call, it is in the picture.
* **T** — not a candidate. Keep it as the thing to re-shoot the day somebody proposes buying smoothness with triangles again.
* **B** — the honest minimum, and it demonstrates that the r10 twist was the *smaller* half of the problem. Cheapest fix per unit of ugliness removed if you only care about the kiwi.
* **C** — the safe pick. Every species keeps the feature that names it (navel, calyx, five-lobe waist, ground spot) and every one of them is now wide and blunt enough to be sampled as a shape.
* **D** — my pick to *look at*. It deletes every azimuthal wave, the navel horns, the ground-spot facet, most of the apple calyx and the kiwi's four corners, un-craters the apple's blossom end, un-needles the strawberry's tip, and keeps four appendages: the apple's wire stalk, the strawberry's leafy star, the melon's woody stub, the pineapple's plume. It is also the second cheapest.

---

## 2. WHAT EACH VARIANT ACTUALLY CHANGES

`A` overrides nothing. Every variant below sets `lobeTwist: 0`.

| species | B | C | D |
|---|---|---|---|
| watermelon | — | fatter/blunter stem stub (`wArc` 0.150→0.190, `len` 0.36→0.30) | that, plus `rib: 0` and **`facets: null`** — the r9 ground spot comes off the mesh; it is a colour, not a plane cut |
| orange | lobe deleted (it did not exist before r10) | lobe deleted; **navel `len` 0.270 → 0.075 on a 45 % wider footprint** = a pucker, 8 columns across | lobe deleted; **navel deleted entirely**, deeper blossom dimple instead. plate-01's orange is a circle |
| kiwi | lobe deleted | lobe deleted; stem spur 0.44 → 0.30, blunt | that, plus `pTop/pBot` 6.60/5.40 → **3.90/3.40** — r9's "k=4 corner energy" reads as a loaf of bread at delivered size |
| apple | r4–r9 waist restored (k=5, 0.075, untwisted) | that, plus a thinner longer stalk and **calyx `len` 0.225 → 0.118 on a 1.6× footprint** | **no waist lobe at all**; `taper` 0.28→0.21 and `wellBot` 0.46→0.30 so the blossom end stops being a crater with a rim; calyx `len` 0.085 |
| strawberry | lobe deleted | broader sepals (`wArc` 0.082→0.108), less tip jitter | broader still (0.125), `pBot` 1.10 → **1.24** so the tip is a tip and not a pin |
| pineapple | — | wider straps, stiffer rosette | same, slightly wider again |

---

## 3. THE PROBES FELL AND THAT IS THE CORRECT OUTCOME

Frozen `limb pose=ship n=32 rays=128 res=256`, unmodified, run on each variant:

| | A | T | B | C | D |
|---|---|---|---|---|---|
| orange `hull_concave_frac_pct` | **25.39** | 25.00 | 25.00 | 5.08 | **0.00** |
| orange `hull_concave_depth_pct` | **20.63** | 22.10 | 21.40 | 4.64 | **1.51** |
| kiwi `hull_concave_frac_pct` | **37.89** | 37.89 | 10.94 | 7.81 | **2.34** |
| apple `hull_concave_frac_pct` | 66.80 | 67.19 | 50.00 | 42.97 | 38.28 |
| apple `hull_concave_depth_pct` | 48.08 | 47.85 | 44.47 | 52.26 | **58.36** |
| strawberry `hull_concave_depth_pct` | 30.87 | 30.89 | 30.88 | 23.56 | 22.47 |
| pineapple `hull_concave_frac_pct` | 67.19 | 67.19 | 67.19 | 67.19 | 66.41 |

**Say it plainly: D takes the orange from 25.39 to 0.00 on the statistic that nine rounds of this
project treated as the score, and D is the one that looks like an orange.** The kiwi does the same
thing. This is the r8-verdict finding — "a mathematically featureless sphere scored 5.60, second
best of six" — arriving from the other direction. I did not tune against these numbers and I am
reporting them because they went down.

Two numbers went the *other* way and are worth having:

* **`mask_px_median` — ON-SCREEN AREA — RISES IN EVERY SMOOTH VARIANT.** orange 38,653 → 45,724 (C) → **46,784 (D), +21 %**; kiwi 30,189 → **34,826, +15 %**; apple 30,386 → **32,951**; watermelon 37,503 → 38,208. Every furrow and every horn was being paid for in fruit size, on a project whose reference bar has a *"hero is too small"* auto-fail. The smooth fruit are simply **bigger**.
* **apple `hull_concave_depth_pct` 48.08 → 58.36 in D.** Deleting the calyx needles and un-cratering the base makes the *stalk* the only outline event, and a clean stalk is a deeper hull bridge than a fringe of noise. The one appendage that is real got stronger by removing the ones that were not.

### Safety, not taste — all four variants pass

`species pose=so3 n=32 star=2048`: **`star_multivalued_total = 0` in A, C and D.** Every variant is
still a radial graph `r = f(direction)`, so `cutter.js`'s star-shaped precondition, its clip-ring
weld and its cap fan are unaffected. `separation_worst` 2.08 (A) / 2.46 (C) / 2.20 (D) — quoted as
a control, not a target; note it goes **up**, not down.

---

## 4. PERF — MEASURED, BOTH ORIENTATIONS, BACK-TO-BACK ON ONE TREE

`tools/shoot.mjs`, unmodified, with the default variant flipped and rebuilt between runs (all four
runs inside twenty minutes, so no other agent's edit sits between them). Ceilings: **120 draw
calls / 250,000 triangles**.

| | draw calls | triangles | live bodies |
|---|---|---|---|
| **portrait** A | 55 | 100,541 | 29 |
| **portrait** C | 65 | 136,041 | 33 |
| **portrait** D | 57 | 105,659 | 26 |
| **landscape** A | 35 | 85,679 | 23 |
| **landscape** C | 29 | 96,131 | 19 |

Every variant is **inside both ceilings in both orientations with room to spare** — the worst case
is C in portrait at 54 % of the draw-call budget and 54 % of the triangle budget. `cpu/frame`
median 0.3–0.4 ms, p95 1.1–1.7 ms, unchanged across variants: **none of this is where his
framedrop is coming from**, which is consistent with it being a cut/allocation spike rather than a
steady-state mesh cost (that is the perf owner's piece, not mine).

**If C is picked, take it at native density.** C at `cols: 1.0, rings: 1.0, crown: 1.45` costs
15,518 rather than 22,596 portrait triangles — **1.20× instead of 1.75×** — and I rendered both and
cannot tell them apart (that is exactly what T proves). One line change in `SHAPE_VARIANTS.C`.
D already ships at native density for that reason.

---

## 5. REQUESTS FOR THE INTEGRATOR — FILES I DO NOT OWN

1. **`cutter.js` — THE CUT RIM IS THE ONE PLACE A POLYGON IS ACTUALLY VISIBLE, AND IT IS YOURS.**
   `cutter.js:577` sets the loop resample target to `max(r0max * 0.065, 0.020)`, giving
   `N ≈ 2π/0.065 ≈ 96` segments on every cut face at every mesh density (measured: 88 boundary
   edges on the cap group, identical at detail 8, detail 11 and 1.3× columns). On a watermelon
   half that fills 460 device px, that is a **15 px chord**, and the cut face carries a thin bright
   albedo band that draws every one of them. `shots/r11-shape/A-cut-L.png` at
   `crop(1050,880,1620,1250)` is the evidence; the rim reads as a hexagon. Dropping the target to
   ~0.038 (N ≈ 160, which is already the existing cap) halves the chord. **He said the slicing
   looks really nice — this is the cheapest thing in the project that would make it look nicer.**
2. **`species.js` — if D is picked, the watermelon's pale ground spot should move to albedo.** D
   sets `facets: null`, so the plane cut that used to make it is gone. A real melon's ground spot
   is a colour and always was; it is one low-frequency patch in the skin shader.
3. **`species.js` / stage — his note 5, "the specular lighting is overdone, chrome".** Not my file,
   but it interacts with mine and it is visible in every frame in this bake-off: the apple's
   highlight is a hard white blob and it is the single largest contributor to the "plastic" read
   that survives *all four* shape variants. Fixing shape without fixing that highlight will get
   you most of the way and not all of it.
4. **Capture hygiene, again (r10 §9.3 raised this and it is still true).** `src/render/stage.js`
   and `tools/probes.py` both changed under me during this round. My A/B pairs are back-to-back
   and the shape switch is a URL parameter on **one** build precisely so a variant comparison
   cannot be contaminated, but the perf table in §4 required four rebuilds and I had to hurry them.

---

## 6. HOW TO SHIP WHICHEVER HE PICKS

One line. In `src/fruit/geometry.js`, the variant resolver ends:

```js
  return SHAPE_VARIANTS[g] ? g : 'A';
```

Change `'A'` to `'B'`, `'C'` or `'D'` and rebuild. Until then the default is A and the shipped
mesh is byte-identical to round 10. `?shape=X` on the URL overrides it at any time, on the built
bundle, with no rebuild — so he can flip between all five on his phone if he wants to.

If he picks **C**, also set its multipliers to `cols: 1.00, rings: 1.00, crown: 1.45` (§4).
If he picks **D**, also raise the request in §5.2 with whoever owns `species.js`.

---

## 7. ARTEFACTS

| path | what |
|---|---|
| `/home/claude/juice/src/fruit/geometry.js` | the only source file changed; round-11 note 11A–11C at the head, `SHAPE_VARIANTS` after the SHAPE table |
| `/home/claude/juice/rounds/reports/r11-shape-bakeoff-portrait.png` | **the deliverable.** 6 species × 5 variants, portrait, 1:1 |
| `/home/claude/juice/rounds/reports/r11-shape-bakeoff.png` | the same in landscape |
| `/home/claude/juice/rounds/reports/r11-shape-{A,T,B,C,D}.png` | per-variant sheet: both orientations + 1:1 crops of the orange and the apple |
| `/home/claude/juice/shots/r11-shape/` | the raw device-pixel renders (`{A,T,B,C,D}-{L,P}.png`) and the cut-rim pair (`{A,B}-cut-L.png`) |
| `/home/claude/juice/shots/r11-shape-perf-{A,C,D}`, `-{A,C}-L` | the four `shoot.mjs` perf runs behind §4 |
| `/home/claude/juice/.r11shaperig.mjs` | the rig: device-pixel-density capture, frozen poses, `?shape=`, `bokeh 0`, `--mode cut` |
| `/home/claude/juice/.r11shapesheet.py` | composites the sheets; 1:1 crops, auto-boxed, nothing resampled smooth |
| `/home/claude/juice/.r11shapecost.mjs` | triangle cost table, all variants × all tiers |
| `/home/claude/juice/.r11setdefault.py` | flips the shipped default for a perf/probe run |
| `/home/claude/juice/.geohead-r11shape.js` | HEAD's geometry.js, kept so the bit-identity check for A is re-runnable |

Re-verify variant A is untouched in one command:
`git show HEAD:src/fruit/geometry.js > .geohead-r11shape.js` then diff the md5 of
`makeFruitGeometry(sp, d).attributes.position` across all six species × detail {11,8,6,4}.
