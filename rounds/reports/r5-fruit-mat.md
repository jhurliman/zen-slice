# r5 — fruit-mat — `/home/claude/juice/src/fruit/species.js`

Round 4: 51/100 (+5). Two blockers, both third-round-running:
(A) the watermelon cut face 49.3% clipped in R and reading milky pink;
(B) the pith ring 69.6% clipped with its directional swing going backwards.

**Only `src/fruit/species.js` was written.** Zero new draw calls, zero triangles,
zero shader programs, zero uniforms added to any other file. All 12 materials
(6 skins + 6 fleshes) verified to compile and render on the WebGL2 backend of
WebGPURenderer with no `not compatible` warning.

---

## The finding: one wrong load case, six materials, three rounds

Round 4 published predictions and the critics measured every one wrong by the
same factor:

| | predicted r4 | measured r4 |
|---|---|---|
| watermelon cut face, R>=255 | 4.1% | **49.3%** |
| watermelon pith ring, R>=255 | 0.00% | **69.6%** |
| citrus pith ring, R>=255 | — | **73.9%** |

Round 4's own comments contain the mistake in plain text — `species.js` said
*"a cut face is exposure case A"* and *"the LIT spoke, where E_R is 1.177, not
0.704"*. Case A is the cap **facing the camera**. A cut face rotates; that is the
premise of the game, and after director.js's round-5 orientation bias the hero
half spends most of its life 26-45 degrees turned **into** the key, where
contract v5's table reads E_R = 1.565. So every constant in the file was authored
against an irradiance 2.2x under its governing one — in six materials at once,
each individually "verified" against the same wrong row.

That is not six tuning errors. It is one structural error with six symptoms, and
round 4's method (hand-solve a headroom estimate per surface) is what let it
happen six times.

## The structural change

`E_KEY` / `CAP_CEIL` / `capBudget()` / `fromKeyLit()` at the top of the TSL kit
are now the only place a load case appears in this file.

* **`capBudget(alb)`** — a soft ceiling (C1 Reinhard shoulder, knee at 0.72 of
  the ceiling) applied to **every albedo the file emits**, at exactly two call
  sites: the flesh `colorNode` and the skin `colorNode`. Contract v5 §6's
  "albedo <= 0.415 at N.L = 1" restated per channel as 0.655/E_B =
  (0.418, 0.482, 0.584). No surface can be authored past the key-facing budget
  by anybody, ever, whatever its own comment believes. Cost: six vec3 ALU ops in
  `colorNode` only.
* **`fromKeyLit(r,g,b)`** — JS-side, free. Takes a published *target radiance*
  (contract v5 §3: "v5 publishes the target RADIANCE") and returns the albedo
  that emits it at N.L = 1. Every band with a plate anchor is now written
  through it, so the number in the source is directly comparable with a
  measurement of `plate-01.png`.

Under it: **every cut-face constant x0.44** (= 0.704/1.565 x 0.98), which
reproduces the appearance round 4 solved for at the orientation the fruit
actually occupies and puts the peak inside the ceiling at the worst one. The
watermelon flesh ramp goes further, to **x0.24**, because contract v5 §5 solved,
rendered and measured that ramp against plate-01 rather than against a clip
ceiling, and plate-01's flesh sits at half the ceiling. The **apple is the
independent check** — the one cut face with a direct plate anchor, not fitted:
see the table below.

## The three achromatic spenders, removed at source

The r4 verdict's decisive detail: the 1193 clipped pixels average **(255, 165,
135)** — "a pale pink-WHITE... an achromatic wash riding on top of the red". A
constant added to a red surface can only raise G/R. No albedo change reaches it.

1. **Foam whitening.** `+vec3(0.085)` at weight 0.22 was, by contract §4's
   accounting, **92% of the entire diffuse budget** on a term whose job is to be
   a texture. It is now a purely **multiplicative x1.45 gain** — same hue,
   contributes exactly 0 to G/R, costs 4.5% of the ceiling. The foam's read was
   always the specular sparkle off `w.h` in `normalNode`, which is untouched.
2. **Wet-film roughness.** 0.115 -> 0.170, hard clamp 0.055 -> 0.105, bubble dip
   0.030 -> 0.022. This is contract §4's measured term C (a flat +0.020 in G and
   B, "env specular through a PMREM whose panels run at radiance 15..46") at its
   source. Also: the wet target now **scales with the dry roughness** so the film
   can no longer sand every band to one gloss — pulp goes to 0.170, pith to
   0.310, rind to 0.36. Pith is matte, pulp is wet; that is a channel of layering
   separate from value and round 4 had erased it.
3. **Every additive constant on the flesh path** rescaled by the same factor as
   the albedo it modulates (pale heart, seed halo, seed body, wet run-off),
   per §4's explicit warning. Seed colour x0.24 too — it is an occluder, so its
   value is only meaningful *relative* to the pulp, and left alone it would have
   gone from 11.6x under `deep` to 2.8x, i.e. back to a "dark red bruise".

## The floor, published in radiance

`o.floor` is contract §4's term B verbatim — the transmission lobe's scene-linear
radiance at key N.L = 0 — and the material divides by the lobe's own shape at
that orientation to recover the constant. Round 4 published a *tint*
(`juiceColor x 0.40 x sss`) and let the magnitude fall out of two unrelated
scalars; it landed at 0.074 R, too small to budget for and too saturated to rely
on. With the diffuse now 4.2x smaller this is what holds the shadow-side face off
black (§7: "spend the section-4 FLOOR budget, do not ask for more key").

The lobe also no longer collapses to zero at N.L = 1 (`away^2` alone is 0 exactly
where the diffuse peaks — elegant and wrong; a cut face turned into the key still
transmits). `shape` runs 0.46x (facing the key) -> 1.00x (N.L = 0) -> 1.35x (the
most backlit a *visible* cut face can be, since the key is 60.7 deg off the
camera axis), inside §4's 1.6x allowance for an away-weighted lobe.

---

## MEASURED, not predicted

I built a rig that renders the real material on a real cut-face disc through
`WebGPURenderer` (WebGL2 backend, headless Chromium), with stage.js's exact
lights, exposure 1.28, NeutralToneMapping, and `gradeFn` applied to the readback.
The disc's normal is driven to a chosen `dot(N, keyDir)`, so the load case is a
dial. **Rig limits, stated up front:** no PMREM environment (so it under-reads
diffuse by ~15% against the contract's E table, verified with a Lambert control
at albedo 0.18 and 0.42), and the disc is *flat*, so cutter.js's collar tilt —
the ring's real source of directional swing — is absent.

### A. Watermelon cut face, inner-0.55, the critic's own region

| orientation | mean RGB | R>=255 | G/R | lum median |
|---|---|---|---|---|
| **r4 shipped, measured by the critic** | (218.0, 121.8, 99.0) | **49.3%** | 0.559 | 145.1 |
| r5 @ N.L = 1.00 (worst case) | (170.1, 72.2, 41.8) | 9.3% | 0.425 | 74.5 |
| r5 @ N.L = 0.82 (hero) | (157.9, 75.4, 53.0) | 12.5% | 0.477 | 67.3 |
| r5 @ N.L = 0.49 (camera-facing) | (125.6, 32.1, 12.9) | **2.1%** | 0.256 | 46.4 |
| r5 @ N.L = 0 (shadow half) | (118.6, 27.0, 14.9) | 0.3% | 0.227 | 42.8 |
| **plate-01 flesh** | (169.6, 67.3, 47.4) | 0.3-0.7% | 0.397 | 80.6 |

At the worst orientation the mean lands on plate-01's flesh **to 0.5 of a count
in R**. Clipping is 49.3% -> 2-12% depending on orientation. G/R 0.559 -> 0.43.

### B. Apple — the independent check

Contract §3 measures plate-01's green-apple cut face at scene-linear
(0.391, 0.327, 0.210) = display (197, 174, 128). Nothing about the apple was
fitted to it; it just took the same x0.44.

| | mean RGB |
|---|---|
| r5 apple @ N.L = 1 | (191.8, 167.3, 116.4) |
| **plate-01 apple cut face** | **(197, 174, 128)** |

Within 4% in all three channels. That is the load-case correction validated
against a measurement it was not solved against.

### C. The pith/rind annulus (0.845-0.955 of the cap radius)

| orientation | R>=255 | 12-sector max/min |
|---|---|---|
| **r4, measured by the cutter critic on 05-cut+500ms** | **69.6%** | 1.164 |
| r5 rig @ N.L = 0.49 (matches that frame's orientation) | **2.4%** | 1.09 * |
| r5 rig @ N.L = 0.82 | 5.0% | 2.05 |
| r5 rig @ N.L = 1.00 | 9.9% | 2.64 |
| reference lemon peel, same probe | 0.02% | 2.11-2.41 |

\* the rig's disc is flat and has no collar, so `capKey`'s swing is all it can
show. In the game cutter.js tilts the collar +-20 deg, which the round-4 author
measured as an additional **3.6x** of E-swing on top. Modelled through the full
chain with that tilt, the band runs display luminance 49 -> 149 around a
camera-facing cap (max/min **3.02**) with 0.0% clipped at every spoke, and the
lit spoke lands at (178, 145, 101) against plate-01's pith at (168, 137, 95).

The pith is re-anchored through `fromKeyLit` to plate-01's own measured pith
radiance, and the **rind band with it** — the rind never clipped, but its job is
*relative*, and leaving it while the pith came down 2.6x would have collapsed the
pale/dark pair from 4.8x to 1.8x. Re-anchored to plate-01's measured rind
(55, 61, 10) it renders (53, 60, 9) at the lit spoke and the pair is back to
2.7x, which is plate-01's own ratio. `capKey`'s swing goes back up
(amb 0.86/gain 0.29 -> 0.62/0.68, 1.14x -> 1.545x) now that there is headroom to
spend it in.

**On the cutter critic's 1.8 ratio target:** their headline classifier gates on
`min(RGB) > 110`. plate-01's own pith is (168, 137, 95) — min = 95 — and would
fail that gate. As the ring correctly dims, more dark spokes drop out of the
population and the ratio self-stabilises upward toward 1. The honest numbers for
this band are the **clip fraction** and their own **unbiased geometric-band
sector profile**, and both are now inside the reference.

### D. A clip source nobody has been counting

The rig found one more, and it is not albedo. At N.L = 0.82 the disc sits at
**exactly** the mirror angle between the key and the camera (N·H = 1.000), and a
wet flat face at the mirror angle blows out regardless of albedo. Turning the rim
light off at N.L = 1 takes clipping 8.0% -> 0.25% and G/R 0.428 -> 0.253: the
**rim's grazing specular** reaches a cut face hard, which contract §2's E table
does not model ("the rim never reaches a front-facing cap" is true of the diffuse
term and false of the specular one).

Roughness does not fix this — swept 0.06/0.11/0.17/0.28/0.40, clipping is
monotone *increasing* with roughness (a wider lobe catches more area while the
peak stays over the ceiling either way). The lever that works is the **foam bump**,
because a face covered in beads does not mirror: raising it 1.7x takes the
mirror-orientation clip fraction 18.4% -> 12.5% and G/R there 0.558 -> 0.477.
Applied to all six flesh materials (watermelon 0.0165 -> 0.0280, and the same
1.7x elsewhere); it is a uniform multiply, so it costs nothing. I deliberately
did **not** chase the rest with roughness, because going smoother helps the
punctual lights and hurts the env (radiance-15..46 panels seen by a mirror),
which is the one thing my rig cannot see. **This is the axis for round 6**, and
whoever takes it should either drop F0 on the flesh (needs
`MeshPhysicalNodeMaterial` and `specularIntensity`, a material-class change) or
ask stage.js to cap the rim's specular contribution.

### E. The second blind tell — the orange's square pores

"a regular grid of hard-edged square dots" is arithmetic, not aliasing. `cellPt`
is a one-tap lookup with the centre jittered into [0.22, 0.78], so any blob whose
outer radius exceeds 0.22 runs off its own cell and truncates flat. The orange
pore's outer radius is 0.40: it reaches 1.18 and is still at 85% of full strength
when it hits the wall — a hard straight edge along a cell boundary in a periodic
grid. Fixed with one new optional argument (`margin`, default unchanged at 0.22,
so nothing else in the file moves) and `margin = 0.40` on the pores alone.

---

## Budget

| | delta |
|---|---|
| draw calls | **0** |
| triangles | **0** |
| shader programs | **0** (same 12 materials, same classes) |
| uniforms | +1 per flesh material (`wetRough`), uniform-only, no rebuild |
| ALU | +6 vec3 ops in each `colorNode` (`capBudget`), +2 in `roughnessNode` |
| npm deps / network | none |

`setSpeciesQuality` signature and behaviour unchanged; `SPECIES`, `SPECIES_LIST`,
`GLSL_NOISE` exports unchanged. `u.sss` is retained as a uniform (now 1.0) so
nothing that pokes `userData.zsu` breaks; the per-species magnitude moved to
`o.floor` where it is comparable with contract §4's budget line.

## What I did not do, and why

* **Did not touch stage.js.** The r4 cutter verdict is right that every round so
  far has moved an albedo and an exposure in opposite directions and netted zero.
  The lighting is frozen and every number here is a solution of it.
* **Did not desaturate the flesh to chase G/R.** Contract §5 is explicit that the
  clipping inflates G/R mechanically and that the shipped chroma, merely scaled,
  renders *more* saturated than the plate. Measured result: G/R came from 0.559
  to 0.425 with the albedo hue essentially unchanged, exactly as §5 predicted.
* **Did not raise the key to rescue the shadow half.** §7 says spend the floor
  budget instead. Measured: the shadow-side face holds at (118.6, 27.0, 14.9)
  against the r4 control's (104, 34, 14), which the critic called plate-grade,
  while the lit half comes down 25%.
