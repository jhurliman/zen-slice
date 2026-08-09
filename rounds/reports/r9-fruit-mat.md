# r9 — species.js (the cut face: the resolution guard, and the radial profile)

FILE TOUCHED: `/home/claude/juice/src/fruit/species.js`. **Nothing else in `src/`.**
`tools/probes.py` byte-for-byte unchanged (md5 `92cfaa0558c7ab6bd3547bfc8cc97ade`,
PROBE_VERSION 10); canary re-run: `clip shots/r5/05-cut+500ms.png` returns
**mask_px 9490**.

⚠ **INTEGRATOR:** an auto-snapshot (`58388e0`, "materials + juice: round-9 work in
progress") committed my tree mid-session together with another builder's
`fluid.js`. My round-9 diff is `git diff 5c24e85 HEAD -- src/fruit/species.js`
and it is **12 code lines**; everything else in that commit is not mine.

Instruments added, all private, none of them a probe: `.r9matbuild.mjs`,
`.r9matrig.mjs`, `.r9matmeas.py`, `.r9matface.py`, `.r9matprof.py`,
`.r9matmean.mjs`, `.r9matsweep.mjs`.

---

## 0. HEADLINE

| | LAND 640x360 | PORT 215x466 | PORT 430x932 | HERO 1280x720 |
|---|---|---|---|---|
| frozen `foam` flesh R | 151.0 → **155.1** | 84.4 → **86.5** | 80.4 → **82.1** | 152.5 → **151.5** |
| frozen `foam` **flesh_GR** | 0.4227 → **0.4063** | 0.5703 → **0.5522** | 0.5902 → **0.5705** | 0.4615 → **0.4274** |
| frozen `clip` mean R | 112.1 → **114.4** | 81.4 → **82.6** | 80.6 → **81.8** | 114.7 → **115.5** |
| frozen `clip` **GR_ratio** | 0.5671 → **0.5534** | 0.7692 → **0.7563** | 0.7898 → **0.7773** | 0.5944 → **0.5697** |
| **draw calls / triangles** | 25 / 75 207 → **25 / 75 207** | 25 / 67 203 → **25 / 67 203** | — | 25 / 75 207 → **25 / 75 207** |

**+0 draw calls, +0 triangles, 0 new `noise2` taps, 0 new programs**, at all
three rasters. Zero page errors and zero console errors on every run.
plate-01 targets: `foam` flesh_GR **0.3505** scale-matched / 0.3392 native.

Every raster moves the same way — R up or flat, G/R down — which is the point:
**the change is a resolution-invariance fix, so its signature has to be that all
four rasters move together.** Face-only (see §1), the radial profile's *sign
defect* also closes on all three: ratio (mean of the t 0.62–0.88 bins) / (t
0–0.25 bin) goes **L 0.819 → 0.877, P 0.912 → 0.985, P2 0.898 → 0.956**, against
plate-01's 1.212 and r8's uniformly-below-1.

`b0` in every table is the r8 `species.js` rebuilt on TODAY's tree (which already
carries r9 `stage.js`), rendered by the same seeded rig in the same session. I
verified the tree difference is stage-only and that stage r9 is **not** the cause
of the portrait numbers: a build with `git show 82017c4:src/render/stage.js`
swapped in gives portrait `foam` flesh R 84.4 against the r9-stage tree's 84.1.

---

## 1. ⚠ I CORRECT THE VERDICT'S MEASUREMENT. The portrait cut face was never dark; the region is 69% NOT-FACE.

The verdict's headline number is *"portrait's cut face sits at R 96.3 against
plate-01's 190.3 — HALF"*, from frozen `foam` at `win=262:352:88:160`. That
window's region is not the cut face.

`foam` fits its ellipse to `largest_component(luma > 8)` **inside the window**.
On plate-01's published window that subject is almost entirely cut flesh. On
**our** frames it is the whole melon half — cut face *plus the green rind body* —
and the two orientations frame the half completely differently.

I built a colour-blind geometric mask to measure this: a DIAGNOSTIC BUILD of the
identical seeded beat in which every albedo in the file returns zero and the
flesh material emits a constant, so the cut cap — and nothing else — is bright.
Mask = `largest_component(luma > 150)` of that render, applied to the real frame,
which registers pixel-for-pixel because both come from the same seeded rig.
Composition of `foam`'s own region, r8 build:

| raster | foam region px | of which CUT FACE | non-face | flesh R **whole region** | flesh R **FACE ONLY** | flesh R non-face |
|---|---|---|---|---|---|---|
| L 640x360 | 5320 | 3938 (**74.0%**) | 1382 | 151.0 | **172.4** | 24.0 |
| P 215x466 | 2699 | 839 (**31.1%**) | 1860 | 84.4 | **189.0** | 18.6 |
| P2 430x932 | 10786 | 3295 (**30.5%**) | 7491 | 80.4 | **186.4** | 18.7 |

The probe's own `pct_lum_le_25` says the same thing without any of my machinery:
**4.85% on landscape, 21.23% on portrait.** Portrait's cut face in round 8 is
**R 189.0**, i.e. *brighter* than landscape's 172.4 and within 1% of plate-01's
190.3. It is not half of anything.

So the mechanism the verdict names is real and the number it names it with is
not, and the acceptance target built on that number — `foam` flesh R 96.3 → ≥140
— **is not reachable by any change to the cut face**: 69% of that region is dark
green rind and background, and the only way to move it to 140 is to light the
rind. I did not chase it. What the same probe DOES support is the ratio, and it
moves: portrait `foam` flesh_GR 0.5703 → 0.5522, `clip` GR_ratio 0.7692 → 0.7563.

**The verdict's conclusion survives its evidence, in a different form.** Portrait
was not dark; portrait was **flat**. The 8x crop is exactly what the critic
describes — an even salmon disc with seeds stamped on — and the mechanism it
gives for that is correct, which is §2.

---

## 2. FIX 1 — THE GUARD FADES TO THE MEAN, NEVER TO ZERO

`fleshCells` multiplied its two fields by `pxFade`: `crest.mul(o.w)`,
`ss(...).mul(wmax)`. So when the guard closed, the albedo mesh, the 1.20 relief,
the roughness redistribution and the sss floor all went to **zero together**.

The verdict frames this as a fade *tuned to the wrong raster*. I don't think the
tuning is the bug and I want to be precise about it, because the same class of
error is elsewhere in the file (§3): **`x.mul(w)` deletes a field's DC along with
its variance.** Round 6's rule is "nothing below the pixel goes into the normal",
and the band-limited value of a field below the sampling rate is its **area
mean** — that is what a mip level holds, and it is emphatically not zero.
`mix(mean, x, w)` deletes only the variance and keeps round 6's guarantee exactly
(the field goes CONSTANT, not absent). Then no fade threshold is load-bearing
any more, at any raster, which is the property that makes this class of bug stop
recurring rather than move.

**The constants are measured.** `.r9matmean.mjs` replicates this file's `noise2`
(same `h1`, float32) and integrates each field over the cap disc with the
`2*r*dr` area weight, 6M samples. Cross-check that the replication is the shipped
noise: it puts the std of `1-|noise2|` at **0.2369** against the **0.227** this
file measured on the GPU three rounds ago (`fibreBundles`' own comment).

```
E[ss(0.690,0.845,r)] = 0.3658   E[0.88*ss(...)] = 0.3279
E[max(c1, 0.88 c2)]  = 0.5648   E[max(c1, 0.3279)] = 0.5513   -> ONE constant 0.560
E[grv] = 0.2324                 E[grp*0.46+0.54]   = 0.7224
```

The fade is applied **per octave, coarse last and to the combination**, because
that is the only ordering correct in the intermediate regime the review frame
actually occupies (coarse resolved, fine not): there the right value is
`max(c1, E[0.88 c2])`, which is what it now computes.

Consequence for the review raster: `bun`'s mean goes 0.185 → 0.400 on landscape
and ~0.00 → 0.405 on portrait, and is now **the same at every raster**. A free
and unexpected benefit: `grp` is a 2.4-unit field (~6 px per unit even on the
27-px-minor-axis portrait cap) and is resolved everywhere, so it now modulates
the field's DC — portrait gets a large-scale mottle where before the whole term
was zero. That is the only structure a 27 px cap can honestly carry.

## 3. TWO AREA-MEAN ERRORS THE SAME MISTAKE HAD HIDDEN

Both were invisible while the guard was zeroing the field, and both are the r8
defect in miniature — a constant derived from the field *after* `pxFade` had
scaled it at one particular raster, i.e. a property of the frame quoted as a
property of the field.

* `sssMask`'s comment: *"`bun` has area mean ~0.24, so `(0.90 + 0.42 bun)` has
  area mean 1.00"*. The field's own DC on that `lite` path is **0.3658**, so the
  term's mean was **1.0536** — it had been spending **5.4% more than contract v5
  section 4 budgets it**, by an amount that varied with the raster. Base
  0.90 → **0.8464** puts it back on 1.0000 exactly, everywhere, permanently.
* `rough`'s comment: *"Same total roughness, redistributed"*. At the true DCs
  `-0.14*0.3658 + 0.10*0.2324 = -0.0280`, not zero, so restoring the field made
  the whole cut face 0.028 shinier — achromatic specular on deep-red pulp, i.e. a
  direct push on `flesh_GR` and on the clipped fraction. `+0.0280` makes the
  sentence true.

## 4. ⚠ THE FINDING I DID NOT EXPECT: `pale` IS A BRIGHTER RED, NOT A PALER ONE

Restoring the field's DC multiplies the pale population's coverage by 2.2x, and
the first r9 build measured the price: face G/R **0.3987 → 0.4683** landscape and
**0.4330 → 0.4999** portrait. Re-solving `pale`'s chroma to hold the mixture
(`mix(ripe, pale, 0.408) == mix(ripe, pale_r8, 0.185)`) recovered only a third of
it, which meant my model of where the G was coming from was wrong. So I built the
control instead of theorising further — landscape 640x360, face-only mask:

| build | `pale` | face R | face G/R | face R255% |
|---|---|---|---|---|
| r8 (`b0`) | (.5200,.1248,.1030) | 155.6 | 0.3987 | 3.86 |
| r9 guard, `pale` **≡ `ripe`** | (.3000,.0414,.0334) | **156.3** | **0.3959** | 3.92 |
| r9 guard, **R only lifted** | (.3998,.0414,.0334) | **160.6** | **0.3865** | 4.25 |
| r9 guard, chroma-held solve | (.3998,.0791,.0650) | 160.9 | 0.4343 | 4.37 |

Line 2 is the control and it is exact: with `bun` removed from the albedo
entirely, the new guard reproduces r8 to **0.7 of a display count and 0.003 of
G/R**. So the relief, the roughness redistribution and the sss floor are
genuinely neutral under it, and **100% of the G/R movement was `pale`'s own G and
B.**

r7 inverted plate-01's top quartile to albedo G/R 0.379 and every round since has
spent part of it and apologised for the rest. The inversion is not wrong — it is
being **double-counted**. Everything achromatic in this chain that is not albedo
— the wet film's specular, the foam's multiplicative lift, `capBudget` compressing
R while leaving G five times under its own ceiling, and the grade's saturation
term — was *already in the pixel* when that quartile was measured off a
photograph. Putting the desaturation in the albedo as well adds it twice, and the
frozen probe has been reading the sum for three rounds. Line 3 is line 4 with the
correction and it beats r8 on every axis at once.

The mesh keeps its read: post-`capBudget` the ground and crest are R 0.2899 /
0.3210, an 11% step in the channel carrying ~90% of this surface's luminance,
against the 25–30 display counts the r8 note derives from the `speck` rule.
plate-01's own desaturation-toward-the-rim is still drawn — by §5's radial
density and by the pith collar, which is where a real melon's pale tissue is.

## 5. FIX 2 — THE RADIAL PROFILE, MEASURED ON THE FACE

Re-measured on the face-only mask (so it is not §1's region artefact), the
cut-faces critic's sign defect is **real**:

| t (elliptical radius) | 0–.25 | .25–.45 | .45–.62 | .62–.76 | .76–.88 |
|---|---|---|---|---|---|
| plate-01 melon face, display R | 163.8 | 169.4 | 185.0 | 196.5 | **200.6** |
| plate-01, G/R | 0.204 | 0.285 | 0.275 | 0.313 | **0.457** |
| ours r8, display R | **187.3** | 172.2 | 176.6 | 162.7 | 144.2 |
| ours r8, G/R | 0.379 | 0.373 | 0.426 | 0.407 | 0.404 |
| **ours r9**, display R | 183.0 | 173.8 | 184.2 | **168.4** | **152.7** |

The plate's face gets brighter **and 2.2x less saturated** outward; r8 did
neither. Three changes, each anatomy rather than a shading gradient, each
**area-mean-neutral by construction** so no budget moves:

1. **Radial density on `bun`** — `1 + 0.55*(ss(0.18,0.82,rad) - 0.7295)`, runs
   0.599 at the centre to 1.148 at the rim, area mean exactly 1.000 (the constant
   is the closed-form `2*r*dr`-weighted mean of that smoothstep). Pith-adjacent
   fibre really does concentrate toward the rind, and one population moving both
   R and G/R in the ratio the plate shows is exactly what the plate is asking
   for. ⚠ **Applied AFTER the fade, deliberately** — before it, it would be a
   term the guard can delete, which is the r8 defect exactly.
2. **`sssMask`'s radial sense is REVERSED, and the old sign was a physics error.**
   r5/r7/r8 all ran it hot at the centre on the argument that "a thick path
   through the middle of a melon transmits more than a thin one at the rim". For
   a medium whose absorption is what makes it red, that is backwards — transmitted
   radiance falls with path length, and every backlit fruit slice ever
   photographed glows at its **rim**. At key N.L = 0 this term is 88% of what a
   cut-face pixel emits, so its sign was most of the "centre-hot airbrushed dome".
   `0.665 + 0.20*ss(0.70,0.20,rad)` → `0.551 + 0.20*ss(0.20,0.70,rad)`: identical
   area mean 0.7080 to four digits (E[ss] = 0.785 closed form), reversed sense.
   **Contract v5 §4's floor budget is untouched.**
3. **The heart stops being pale.** plate-01's inner bin is the darkest *and* the
   most saturated part of its own face (R 163.8 at G/R 0.204 against its peak
   200.6 at 0.457); r8's (0.3550,0.1450,0.1180) at w=0.55 lifted R 10% over `ripe`
   and G by **139%**, doing the centre-hot defect twice, in value and in chroma.
   (0.2300,0.0300,0.0250) resolves over `ripe` to (0.2615,0.0351,0.0293): 0.87x
   the mid-face and G/R 0.134. The pale star of a real melon is a fibre structure
   and is still drawn — by `bun`, at 0.60x the rim's density.

Plus the `groove` albedo notch 0.34 → **0.22** over the narrower 0.792–0.842:
that band is rad 0.778–0.856, which is precisely where plate-01's face is at its
own **maximum** (200.6) and ours was at 144.2. A baked AO on a 2 px crease is
real; at 0.34 it was the single largest term in the outward fall.

## 6. WHAT I DID NOT DO, AND WHY

* **`speck_median_area` 2.0 → 4.0.** Deferred, as instructed. Unmoved (L 2.0,
  P 2.0, P2 3.0). It needs a coarser characteristic crest, which is a change to
  the octave ladder, not to a constant.
* **⚠ THE RADIAL STARBURST — LOCATED, NOT FIXED, AND HANDED OVER.** The r8
  verdict's *"a faint radial starburst converging on the exact cap centre — still
  radially symmetric, which REFERENCE_BAR lists as an auto-fail"* is **not** in
  `fleshCells` (round 8 moved that field to the cartesian `q` precisely to kill
  the spokes, and it worked). It is `wetField`'s `lig`, **species.js:1300**:
  `rdg2(vec2(cc.ang.mul(4.2), cc.rad.mul(6.5)), 2)` — sampled in ANGLE, so every
  crest is a spoke converging on the centre, and `fibreBundles`' own comment
  already flags that expression as not even seamless at ±PI. The substitution is
  one line, `rdg2(cc.q.mul(6.5).add(vec2(3.0, 11.0)), 2)`, same primitive, same
  cost, same characteristic size, same radial gate. **I declined to ship it
  unmeasured:** `wetField` is shared by all six species' cut faces and my rig only
  shoots the watermelon beat, so I cannot show the orange, apple, kiwi,
  strawberry and pineapple caps do not regress. It is the highest-value single
  line left on this axis and it needs a rig that shoots `07-citrus-cut` and
  `08-citrus-caps`.

## 7. PORTRAIT, EXPLICITLY (the standing requirement)

My change contains one resolution-dependent term and it is the one under repair.
The reasoning, stated:

* `mix(mean, field, w)` has area mean **independent of `w`**, so the deliverable
  is now raster-invariant *by construction* rather than by tuning. There is no
  threshold left to get wrong at another raster.
* Everything I added on top — the radial density, the reversed sss profile, the
  heart, the groove — is a function of `rad` only, which is `uv().y`. It contains
  no `fwidth`, no derivative, no pixel size, no frame height, no bokeh radius,
  and cannot change with the raster.
* Second-order residue, and I measured rather than assumed it: the chain
  (`capBudget`, tone map, grade) is concave, so the *rendered* mean of a
  band-limited field is not exactly the render of its mean. Measured across the
  2x portrait pair rendered in one session, r9 gives face R **186.7 (215x466)**
  vs **187.7 (430x932)** and G/R **0.4191** vs **0.4222** — 0.5% and 0.7%. r8's
  own pair was 181.4/182.9 and 0.4330/0.4380. So the residue is real, ~1%, and
  **no larger than r8's**.

⚠ **A RIG WARNING FOR THE INTEGRATOR AND THE NEXT BUILDER.** The 640x360 and
215x466 rasters reproduce exactly run to run (L `foam` flesh R 151.0 twice,
mask_px 5320/5326). **430x932 does not** — the same build re-rendered in a later
session moved the melon ~4 px and swung face R by 20 counts on *both* arms of the
A/B equally. Render that raster twice, and only ever quote it as a same-session
pair. Two of my intermediate readings were poisoned by this before I caught it;
every number in this report at that raster is a same-session pair.

Separately: `ZS.clear()` is `director.reset()` and does **not** clear
`src/juice/fluid.js`'s particle buffers, so a multi-case sweep inside one page
load inherits the previous case's juice — measured as the frozen `foam` subject
drifting mask_px 5321 → 6100 across a sweep in which nothing but a uniform
changed. `ZS.simulate(3.0)` before each case fixes it. Anyone doing a
uniform-only knockout sweep needs this or their sweep is noise.

## 8. PERF

`+0` draw calls, `+0` triangles, `+0` shader programs, at 640x360, 215x466 and
1280x720 (25 / 75 207, 25 / 67 203, 25 / 75 207 — identical before and after).
**No new `noise2` taps** in any slot. ALU: two scalar `mix` replace two scalar
multiplies, plus one `smoothstep`+`mul`+`add` for the radial density, in
`colorNode` / `normalNode` only — call it +6 ALU per cut-face pixel on a term
that was already ~30. Nothing changed on the CPU side, so the JS frame time is
untouched.

## 9. SCOPE

12 code lines, all inside the watermelon's flesh path and the shared
`fleshCells`, which only the watermelon calls (verified: the four call sites at
`albedo`, `relief`, `rough`, `sssMask` are all inside `makeFleshMaterial` for
`watermelon`). No other species, no skin material, no appendage block — the
appendage code at 1771–1905 is byte-identical, as instructed.
