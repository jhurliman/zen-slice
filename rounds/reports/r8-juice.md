# r8 — juice (`src/juice/fluid.js`): the droplet gets an optical interior

FILE TOUCHED: `src/juice/fluid.js`. **Nothing else in `src/`.** (`git status`
also shows `src/fruit/species.js` modified — that is the materials builder
working concurrently, not me.)

**`tools/probes.py` IS BYTE-FOR-BYTE UNCHANGED.** md5
`d6b2b531421be7b2745370c5c2ac4659`, PROBE_VERSION stays **8**. I VERIFIED the
canary rather than asserting it: `python3 tools/probes.py clip
shots/r5/05-cut+500ms.png` still returns **mask_px 9490** after six version
bumps by six agents, and `droplets shots/r5/04-cut+250ms.png` still returns
mask_px 945 / n_blobs 17. I did **not** add a probe either, for a reason given
in §6 — four builders are editing this tree at once and probes.py is the one
file all five of us would collide on.

**PERF, up front, because the brief asks for it explicitly:
draw calls +0, triangles +0, shader programs +0, quad area +0.**
Measured, both orientations, not asserted — §5.

---

## 0. HEADLINE

Every "before" number is a **true A/B in today's tree**: the r7 *shipped*
`fluid.js` (`/tmp/fluid-r7-shipped.js`, kept) substituted into the current tree
by an esbuild `onResolve` redirect (`.r8jbuildbase.mjs`) so the repo file is
never swapped and no other builder's work is disturbed. Rig `.r8jrig.mjs`:
hero 1280×720 t3, the melon beat sheet + fast/slow at 640×360 t3 — **beat
recipes copied verbatim from `tools/shoot.mjs`** — and **portrait 215×466 t2,
the shipping configuration** (`tools/shoot.mjs` iphone @ 0.5). Roll-up
`.r8jmeas.py` shells out to `tools/probes.py` and nothing else. **Two unseeded
runs are quoted for everything.**

| `droplets` on 00-hero (1280×720) | r7 base (2 runs) | **r8 (2 runs)** | plate-01 |
|---|---|---|---|
| `pct_iou_ge_090` | 37.10 / 38.98 | **28.81 / 30.00** | **32.47** |
| `median_iou_to_ellipse` | 0.8675 / 0.8601 | **0.8399 / 0.8384** | **0.8228** |
| `pct_boxfill_ge_078` | 6.45 / 8.47 | **11.86 / 11.67** | **15.34** |
| `mask_px` (droplets NOT deleted) | 9147 / 9217 | **10026 / 10010** | — |
| `n_blobs` | 62 / 59 | **59 / 60** | 502 |
| `area_p95_over_median` | 3.62 / 4.30 | **4.69 / 4.66** | 8.84 |

| INTERIOR (§2, auxiliary — **not** a frozen probe) | r7 shipped shot | r7 base | **r8** | plate-01 |
|---|---|---|---|---|
| `peak_t_p50` — radius of the brightest annulus | 0.57 | **0.20 / 0.20** | **0.57 / 0.57** | **0.57** |
| `rim_over_core_p50` | 0.7222 | 0.7936 / 0.7663 | **0.9777 / 0.9914** | 0.6887 |
| `radial_contrast_p50` | 0.3560 | 0.2898 / 0.3077 | **0.3311 / 0.3289** | 0.5000 |
| `pct_edge_lit` | 16.36 | 21.74 / 22.73 | **45.65 / 50.00** | 28.57 |

| PERF | r7 base | **r8** |
|---|---|---|
| draw calls, landscape 1280×720 t3 | 25 | **25** |
| triangles, landscape | 75 247 | **75 247** |
| draw calls, **PORTRAIT** 215×466 t2 | 25 | **25** |
| triangles, portrait | 67 243 | **67 243** |

Three numbers moved the other way and I say so in §4.

---

## 1. THE GAP, AND WHY IT SPLITS IN TWO

The r7 verdict is right to separate them, and the separation is the round:

> "An individual droplet is still an opaque, flat-filled smooth lozenge with one
> stamped specular pip and no OPTICAL INTERIOR — 60.22% of the hero off-body
> blobs now fit a perfect ellipse at IoU>=0.90 …"

* **SHAPE** — rounds 5, 6 and 7 all attacked this. It is now, in today's tree,
  essentially solved; see §3, where I explain why I did **not** make the fix the
  verdict prescribed.
* **INTERIOR** — never attacked, not once, in eight rounds. It was **one flat
  fill**: `body = tint * mix(1.12, 0.26 + ndl²·0.62, big)`, a value that is
  *constant across the whole disc*, plus a stamped pip. Every drop in frame was
  a decal with a highlight on it, and at 1280×720 there are ~60 of them all
  agreeing.

---

## 2. WHAT A DROPLET ACTUALLY IS, AND THE FIVE TERMS THAT SAY SO

All of it lives in one block in `shade()` inside `makeDrops`. No new attribute,
no new uniform, no new varying, no new material, no new geometry, no branch.

**1. Fresnel / TIR.** `ct = n.z` is the cosine of the view angle at the impostor
surface. Schlick with water's F0 = 0.02 (n = 1.34) gives `Fex`, running 0.02 on
the axis to 1.0 at grazing; transmission through two surfaces is `(1-Fex)²` and
therefore **collapses in the last ~12% of the disc**. That collapse is total
internal reflection, and it is the thin dark ring plate-01 shows just inside
every drop's bright edge. r7 had no such term: its body was equally bright right
out to the silhouette.

**2. Off-axis gather — this is the term that makes the core dark.** A clear
drop's interior is not a glow, it is the *refracted image of what is behind it*.
The axial ray passes through undeviated and carries the background, which over
the void is **black**; away from the axis the deviation grows and the drop
gathers from an ever wider solid angle, so the interior brightens outward until
term 1 kills it. Dark core → bright annulus → thin dark grazing ring → hot edge,
in that order from the centre out. r7's own code comment (line ~922) already
said *"plate-01's red droplets are bright objects with dark centres and hot
rims"* — and then rendered a flat interior. This is that sentence, implemented.

**3. The rim survives defocus, and that was a category error not a missing
feature.** The r7 verdict: *"The defocused drops render as flat uniform discs
with no edge ring, where a real defocused specular drop bokehs to a bright
annulus."* r7's rim was `fres`, an **angular** term, and stage's §B4.3(c)
correctly flattens angular terms with the lens — so a bokeh'd drop lost its rim
entirely. Both facts are true: the defocused image of a rim-bright drop is that
rim **convolved with the aperture**, i.e. a *wider, dimmer ring*. So the angular
`fres` still flattens (contract untouched) and a **geometric** ring takes over.
Its width comes from the lens and nowhere else — see §7 for the verification.

**4. The caustic was invisible and is now not.** It was gated on `big² ×
(0.10 + gain·0.45)`, i.e. 0.012…0.067 of key at `big = 0.35` — under the probes'
0.06 luma floor on everything but the largest handful of drops, exactly as the
r7 fix note diagnosed. It is gated on `opt` now (so mist still gets none) and it
carries the **transmitted** colour, because a caustic is by definition light
that went through the juice.

**5. Transparency is radial — this is the clause "no drop shows the background
through it".** r7's alpha was constant across the disc, which is one fact with
two symptoms: opaque, and flat-filled. The undeviated ray is the axial one, so a
drop is most transparent at its **centre** and most opaque at the TIR rim.
Over the void that reads as the dark refractive core; over a cut face it reads
as the face seen *through* the drop. It is the only honest way to transmit a
background without a framebuffer copy — see §5 on why there is no copy.

**And sixth, the thing that stops this being "a ring".** Every term carries a
**per-particle** constant taken off the `rk()` randoms the drop already has:
core darkness `g0` (0.14…0.32), rim width (0.11…0.22), rim gain, caustic gain.
Plus the gather is **anisotropic** — the drop images the key's hemisphere, so
the limb facing the light is hotter and the interior is not radially symmetric.
A field of 60 identical annuli would be the r4 pip defect wearing a new shape.

**`opt = smoothstep(0.16, 0.52, big)` gates the whole model off for mist.**
A sub-pixel grain is a Mie scatterer, not a lens; REFERENCE_BAR R1b and plate-02
both say the aerosol must stay a field of flat silver specks. At `opt = 0` every
line above reduces algebraically to r7's, bit-for-bit. Measured: `tintlaw` on
15-fast-flick reads `sat_small` **0.1599 / 0.1613 base → 0.1557 / 0.1557 r8**,
`sat_blob_mean` 0.1129/0.1142 → 0.1084/0.1084. The aerosol did not move, and
where it moved it got *more* achromatic.

### The measurement of the interior itself

No frozen probe can see any of this: every probe in the suite is a **binary-mask
statistic**, and nothing in `probes.py` looks *inside* a blob. So I wrote
`/home/claude/juice/.r8jinterior.py`. **It is not a frozen probe and I make no
frozen-probe claim with it** — it is offered as evidence, and as ready-made code
for the r8 critic to promote into `probes.py` as `interior` if they want it.
It imports `probes.py` read-only and reuses `luma`, `largest_component`,
`components` and `second_moment_ellipse`; its mask is **the same geometric mask
`droplets` uses** (`L > 0.06` minus the largest component, no colour key) and it
reports `mask_px`.

Per blob it fits the blob's own second-moment ellipse, takes the normalised
elliptical radius `t`, and averages luma in three geometric annuli
(core `t<0.40`, mid `0.40–0.75`, rim `0.75–1.05`).

**The discriminating statistic is `peak_t_p50`, and it is a clean pass:**

| | `peak_t_p50` |
|---|---|
| plate-01 | **0.57** (peaks at MID radius) |
| r7 base, 2 runs | **0.20 / 0.20** (peaks at the CENTRE) |
| **r8, 2 runs** | **0.57 / 0.57** |

r7's droplets peaked at their own centres. plate-01's do not, and neither do
ours now. `radial_contrast_p50` — how much structure exists inside the outline
at all — goes 0.2898/0.3077 → 0.3311/0.3289 against the plate's 0.5000, so
there is still headroom and I am not claiming the interior is finished.

### It also shows up at 1:1, not only in statistics

Two crop sheets, base left / r8 right, same pixels, 9–10× nearest-neighbour:
`/tmp/zsj/ab4.png` (five hero blobs) and `/tmp/zsj/sbs-04.png` (04-cut+250ms
whole-fruit region). r7's beads are flat red pills with a white dot. r8's have a
bright asymmetric rim, a dark core, and a caustic — they read as wet glass.
The torn sheet fragments (ligaments) get it too: the `morph > 0.5` branch feeds
the same radial coordinate, and a thread *is* a cylinder, so a bright edge and a
dark axis is the correct answer there as well.

---

## 3. THE ONE PRESCRIBED FIX I DID NOT MAKE, AND THE NUMBERS THAT SAY WHY

The r7 fix note asks for `fluid.js:1668` `dblRim`/`dblSpray` **0.45/0.35 →
0.75**, solved from the hero's `pct_iou_ge_090` of **60.22%** against plate-01's
32.47%.

**60.22% is not reproducible in today's tree.** The same frozen probe, on the
same frame, from the *shipped r7 fluid.js* built into the current tree:

```
shots/r7/00-hero.png            pct_iou_ge_090 60.22   n 93   medA 52.5
r7 fluid.js, today, run 1        pct_iou_ge_090 37.10   n 62   medA 92.0
r7 fluid.js, today, run 2        pct_iou_ge_090 38.98   n 59   medA 92.5
plate-01                         pct_iou_ge_090 32.47   n 502  medA 25.0
```

Two runs, spread 1.9 points, so this is not noise — something outside this file
moved it, and the obvious candidate is the r8 stage (the lens/exposure/streak
work landed in `51c56e4` before I started; `n` fell 93→60 and median blob area
rose 52.5→92, which is the signature of dimmer skirts merging bright cores).
**Had I applied the prescribed 0.75 I would have driven the hero to roughly 20%
— half the plate — and made every resolvable drop a peanut.** The verdict's
arithmetic was correct on its own measurement; its input had moved.

Left at **0.45 / 0.35, untouched**. The interior work alone lands it:
**28.81 / 30.00 against the plate's 32.47**, with `median_iou_to_ellipse`
0.8399 / 0.8384 against the plate's **0.8228** and `pct_boxfill_ge_078`
11.86 / 11.67 against **15.34** — all three of the shape statistics closer to
plate-01 than r7 was, from a change that never touches the silhouette.
(Why an interior change moves a *silhouette* metric at all: the dark core and
the transmissive centre take interior pixels under the probe's 0.06 luma floor,
so what the labeller sees is an annulus or a crescent, which is what plate-01's
own blobs are — its median IoU is 0.8228, not 1.0.)

---

## 4. THE THREE NUMBERS THAT MOVED THE WRONG WAY

**(a) `tintlaw:00-hero.sat_small`, and I caught it with the probe and fixed it.**
The first version of the ring carried the *transmitted* colour (`mix(tint,
white, 0.28)`), so each drop's surviving rim arc rendered as a saturated red
fragment and the hero's `sat_small` went 0.6682/0.6954 → **0.7441**. The physics
says otherwise: `Fex → 1` at grazing, so what leaves the silhouette is dominated
by **external** reflection, which is achromatic — while a caustic is purely
transmitted. Splitting them (`rimCol = mix(tint, white, 0.52)`, `cauCol =
mix(tint, white, 0.18)`) is both more correct and what repaired it. Final:
`sat_small` **0.6712 / 0.6753**, i.e. back inside the baseline's own 0.668–0.695
band; `sat_size_slope` −0.197/−0.241 base → **−0.229 / −0.232** (plate-01's own
value on this probe is −0.0259). Not fixed, not worsened.

**(b) `droplets:16-slow-cleave.mask_px` 1597/1586 → 676/670, and it is a
region-identity artifact, not deleted juice.** I checked instead of guessing:

```
             total px L>0.06    largest_component     off-body (= droplets mask)
base           38434              36837                 1597
base2          38443              36857                 1586
r8             38636              37960                  676
r8 run 2       38634              37964                  670
```

**Total lit pixels went UP 0.5%.** Every probe here subtracts
`largest_component(L > 0.06)`, and the brighter rims lit a bridge that merged a
~1100 px droplet cluster into the subject component. That is exactly the failure
mode this file's own header note (t) records for `clip:08-citrus-caps` (9586 →
4646 between two runs of identical code) and that the `particles` docstring
warns about. `particles` on the same frame, which uses a lower floor and so a
different bridge, reads 5455/5449 → 4854/4861 — a 11% move against a statistic
the r7 verdict already declared unusable on this frame. **No droplets were
deleted; on the melon beats the mask went up on every single frame** (02: 478/486
→ 554; 03: 2079/2045 → 2236; 04: 2323/2438 → 2522; hero: 9147/9217 → 10010).

**(c) `pct_edge_lit` overshoots plate-01** (45.7/50.0 against 28.6) on the
auxiliary interior measurement — our cores are relatively darker than the
plate's. I chose not to chase it: `peak_t_p50` lands exactly, `radial_contrast`
is still *below* the plate, and the statistic is not frozen. If the r8 critic
wants it walked back, the single knob is `g0` (currently `0.14 + q2·0.18`) and
`gN` renormalises automatically for whatever range it is given.

---

## 5. PERF — I AM THE AGENT THE BRIEF NAMED, AND THE DELTA IS ZERO

> "PERF NOTE: you are one of the biggest contributors to the 88 → 123 draw-call
> regression. An optical interior is a fragment-shader change and should cost
> zero draw calls. Report your delta explicitly."

**Draw calls +0. Triangles +0. Shader programs +0. Vertex shader untouched, so
quad area — and therefore total droplet fill — is r7's exactly.**

Measured with a seeded `Math.random` load probe (`node .r8jrig.mjs draws`), the
r7 bundle and the r8 bundle built from the *same* tree via the resolver
substitution:

| | r7 base | **r8** |
|---|---|---|
| landscape 1280×720 t3 | 25 calls / 75 247 tris | **25 / 75 247** |
| **PORTRAIT 215×466 t2** | 25 calls / 67 243 tris | **25 / 67 243** |

What it *does* spend is **~60 scalar ALU** (hand-counted; two `exp`, one divide,
one `smoothstep` among them) inside fragments that were already being shaded,
against the ~40 the r5 morphology already spends there. No instance count, no
pool size, no geometry, no material, no render target, no texture unit changed.

**I deliberately did not do the one thing that would have cost real budget.**
Genuinely refracting the framebuffer needs `viewportSharedTexture`, which is a
full-frame copy every frame on both backends. Term 5 (radial transparency)
transmits the background honestly — undistorted, which is *exactly* right for
the axial ray and an approximation elsewhere — for zero bandwidth and zero
passes. I also considered retiring cost and found nothing to retire: this file
is already at 2 draw calls (drops + sheet pool) after r5 folded ligaments into
the droplet system, and the only remaining reduction would be merging the sheet
into the drop pool, which needs a different vertex layout and is not a
fragment-shader change.

One micro-saving taken: `qs` (the doublet-corrected radius) was computed at the
bottom of `shade()` next to `soft`, and the interior needs the same value, so it
is hoisted to just under the `Discard`. Same expression, same value, evaluated
once instead of building the expression twice — ~3 ALU back.

---

## 6. PORTRAIT — REASONED, THEN MEASURED

**There is no aspect-dependent term in this change, and I can name why for each
one rather than asserting it:**

* `qs`, `u2`, `ring`, `rw` are in **normalised quad space** — dimensionless,
  and the quad is built in the vertex shader from a view-space frame.
* `flatv` comes from `stage.lens.sprite()`, which is already in **device pixels
  of the drawing buffer** on both orientations (stage.js's own units note).
* `gdl` dots the shading position with `L1.xy` in **VIEW space**, not screen
  space — the projection matrix applies aspect *after*, so this cannot rotate or
  skew with orientation.
* `opt` gates on `big`, the CPU-side size **class**, which is a property of the
  emitted droplet and not of the raster.

Measured anyway, on the shipping configuration (215×466 tier 2, beat sheet
verbatim from `tools/shoot.mjs` iphone @ 0.5):

| `p04-cut+250ms` | base (2 runs) | **r8 (2 runs)** |
|---|---|---|
| `droplets mask_px` | 160 / 168 | **182 / 182** |
| `droplets n_blobs` | 3 / 3 | **5 / 5** |
| `droplets pct_iou_ge_090` | 33.33 / 33.33 | **20.00 / 20.00** |
| `tintlaw sat_small` | 0.3680 / 0.2935 | **0.3914 / 0.3879** |

More droplet mass, more resolvable blobs, no portrait-specific regression.
Side-by-side crop: `/tmp/zsj/sbs-p04.png`.

**One thing I considered and rejected:** `opt` gates on size *class*, not on
on-screen radius, so in portrait at tier 2 a 3 px drop with `big = 0.8` gets a
full optical interior it cannot resolve. Gating on apparent radius would need a
fifth varying (`vQuad` is full). I left it because the composite of a 3 px
hollow drop is within a few percent of a 3 px solid one at slightly lower alpha,
and the measurement above shows portrait mass went *up*, not down.

---

## 7. CROSS-FILE CONTRACTS: WHAT I VERIFIED, AND THE ONE I FOUND BROKEN

> "if your work depends on another file providing or consuming something, do not
> assume it does. GO READ THAT FILE AND VERIFY."

**FOUND BROKEN — and it is the same shape as the r7 geometry/species finding: a
contract that existed only in a comment.** `fluid.js` line 289 read:

```js
// Must match render/stage.js: key = (7.5, 8.2, 5.0), rim = (-2.6, 1.6, -9.0).
```

It does not match. `src/render/stage.js` actually builds:

```
key  DirectionalLight 0xfff1dd  i 3.40  position (8.2, 7.4, 6.2)
rim  DirectionalLight 0xffd9a8  i 5.00  position (4.6, 2.4, -8.4)
fill DirectionalLight 0x6c7a90  i 1.90  position (-7.0, -3.2, 4.0)
```

The key was **7.1° off** — harmless. The rim was **44° off and on the wrong side
in x**: normalised, this file carried (−0.274, 0.168, −0.947) against the lamp's
actual (0.466, 0.243, −0.851). Every droplet's second specular lobe (`H2`) and
the juice sheet's back-scatter term (`pow(dot(-V, wL2), 3)`) were aimed at a
light that is not in the scene. Both constants are now the lamp positions
verbatim, with the derivation in the comment so the next round can re-check it.

It measures, and net positive: hero `droplets mask_px` 9408/9415 → **10026/10010**
(+6.5% more droplet pixels survive), hero `tintlaw sat_small` 0.6868/0.7172 →
**0.6712/0.6753**, fast-flick `sat_blob_mean` 0.1126 → **0.1084**, interior
`radial_contrast_p50` 0.3195 → **0.3311**. It costs 3 points of
`pct_iou_ge_090` (31.58 → 28.81/30.00, still bracketing plate-01's 32.47 more
tightly than base did).

**VERIFIED AND HOLDING (read, not assumed):**

* `stage.lens.sprite` is `spriteDefocus` (stage.js:1324) and returns
  `vec4(grow, energy, plateau, flat)` with `flat = b/(r+b)` and
  `rEff = r + 1.30·b` (stage.js:1218–1238). **That is what licenses `rw = 0.14 +
  1.30·flat`**: a 2b-wide convolution band is `2b/(r+1.3b) ≈ 2·flat` in units of
  the grown quad. I compute **no CoC of my own**, add no uniform, add no clamp —
  §B4.5 in full.
* §B4.3(b) and (c) are still obeyed exactly as written: the impostor normal
  still flattens with `vFlat`, and the **angular** fresnel `fres` is still
  multiplied by `sharp` and untouched. The new ring is a *different, geometric*
  term standing in for what the convolution actually does; it is not a second
  blur and does not re-derive `flat`.
* `KEY = (1.00, 0.945, 0.870)` against stage's key colour `0xfff1dd` =
  (1.000, 0.945, 0.867). Correct; left alone.
* `stage.uniforms.spriteGrow` is still tier-driven in stage.js (:2371) and I do
  not read it — §B4.5 again.
* **`species.js` is being edited concurrently by the materials builder.** My
  change consumes nothing from it: droplet tint comes from `aTint`, which
  `api.burst` fills from the species juice colour it is handed, and I did not
  touch that path. `foam` / `collar` / `clip` on 05-cut+500ms and 04-cut+250ms
  are within run-to-run spread across the A/B (e.g. `clip:05` pct_R_ge_255
  3.56 → 3.33, `foam:05` whitish_cov_pct 32.65 → 33.05) — I have not moved
  another agent's metric.

**WHY I DID NOT ADD A PROBE, given the suite section says to add freely.** The
r7 critic added `filament` and that was the right call for a critic. But this
round four other builders are writing this tree simultaneously, the HARD RULES
say "edit ONLY your assigned file", and `probes.py` is the one file all five of
us would collide on — a lost write there is worse than a missing probe. The
interior measurement is therefore shipped as `.r8jinterior.py`, clearly labelled
non-frozen, with the mask identical to `droplets`'. **Recommendation to the r8
critic: promote its `interior()` body into `probes.py` as `probe_interior`,
bump PROBE_VERSION to 9, and re-verify the 9490 canary.**

---

## 8. FILES

| path | what |
|---|---|
| `/home/claude/juice/src/juice/fluid.js` | the only source file changed |
| `/home/claude/juice/rounds/reports/r8-juice.md` | this report |
| `/home/claude/juice/.r8jinterior.py` | the interior measurement (NOT frozen) |
| `/home/claude/juice/.r8jrig.mjs` | private rig; beats verbatim from `tools/shoot.mjs` |
| `/home/claude/juice/.r8jmeas.py` | roll-up; shells out to `tools/probes.py` only |
| `/home/claude/juice/.r8jbuild.mjs` | scratch build → `/tmp/zsj/index.html` (not `build.mjs`, not `dist/`) |
| `/home/claude/juice/.r8jbuildbase.mjs` | same, with r7 `fluid.js` substituted by resolver → `/tmp/zsjb/` |
| `/home/claude/juice/.r8jrigbase.mjs` | the rig pointed at the baseline bundle |
| `/tmp/fluid-r7-shipped.js`, `/tmp/r7juice/fluid.js` | the r7 baseline, kept |
| `/tmp/zsj/ab4.png`, `/tmp/zsj/sbs-04.png`, `/tmp/zsj/sbs-p04.png`, `/tmp/zsj/sbs-15.png` | base-vs-r8 crops |

I did **not** run `build.mjs`, `tools/shoot.mjs`, or write anything into
`dist/` or `shots/`.

## 9. WHAT I WOULD DO NEXT

1. `radial_contrast_p50` is 0.33 against plate-01's 0.50. The cheapest remaining
   structure is free: the outline harmonic field `H` is already computed for the
   silhouette in the compact-drop branch and thrown away. Hoisting it into a
   `.toVar()` and using it to perturb the gather gives a per-particle
   *irregular* interior for ~3 ALU. I did not do it this round because it is a
   change inside an `If`/`Else` block and I would rather ship a verified result.
2. `pct_boxfill_ge_078` is 11.7 against the plate's 15.3 — the blobs are still a
   little too "not-filling-their-box", i.e. still too smooth-elliptical at the
   *outline*. That is the doublet knob, and it should be re-derived from a fresh
   measurement of whatever tree round 9 starts from, **not** from this report's
   numbers. That is the mistake §3 documents.
3. Nobody has looked at the *sheet's* interior. It got the r7 Beer-Lambert
   treatment but it is still a smooth film; plate-01's sheet is glassy and
   carries reflections of the fruit.
