# r7 — stage.js (the lens, the exposure contract, the frame budget)

FILE TOUCHED: `src/render/stage.js`. **Nothing else.**

**`tools/probes.py` IS BYTE-FOR-BYTE UNCHANGED.** md5 `a4ce559b3d557565a151857f69d62822`,
mtime 10:14 (before this session opened). PROBE_VERSION stays 6. I did not need a
new probe: `lens` already measures exactly the thing round 7 was asked to fix,
and every number below comes out of it or out of `void` / `clip`.

⚠ ALL "before" NUMBERS ARE A TRUE A/B. I reconstructed the r6 `stage.js`
(`/tmp/stage-r6-orig.js`, kept) and shot it from the **current** tree, because
geo/materials/juice have moved since `shots/r6`. `base-*` = r6 stage.js in
today's tree; `r7-*` = mine. Same rig, same recipes, same session.
Frames: `/home/claude/juice/shots/r7-stage/`.

---

## 1. TASK A — the streak stops being a plane and becomes a segment

### The defect, restated as geometry

Through round 6 the streak was `PlaneGeometry(1,1)` at a **fixed z = -6**, scaled
to span the frustum and rolled about z. Every point on it was therefore at the
same distance down the lens. One distance means one circle of confusion and one
perspective divide, so its width and its blur were **constants of the object**.
The r6 critic measured that precisely — FWHM 27-37 px (1.37x), edge 3.87-5.10
(1.32x) across 1280 px.

Round 6 could not have fixed this by tuning, and neither could round 7: **a
uniform CoC is the physically correct answer to a screen-parallel plane.** The
plane was the bug.

### What it is now

A straight segment in world space between two ends at genuinely different
depths, drawn as a camera-facing ribbon of constant world thickness, positioned
by clipping the swipe's **screen** line to the NDC box at ±1.15 and
un-projecting the two exits at two chosen depths (`layoutStreak()`).

* far end `dFar = 2.30 * camZ` (23.4 m landscape)
* near end `dNear = camZ - 0.29 * (focalLength/nearScale)` (8.13 m landscape)
* it therefore **crosses the focal plane**, at 31% of the visible span

Three things then vary along its length, none of them authored:
**perspective** (r0 = fR0·pix/dist), **defocus** (`api.lens.line()` per vertex,
from the same `cocOf` the opaque gather uses), and **flux**.

### The cross-section had to change too, and that is the half geometry can't do

plate-01's streak gets **9.3x wider without getting softer** (FWHM 3→28 at edge
1.26-2.23). A gaussian cannot do that: a gaussian's 10-90 edge is 0.56 of its own
FWHM *by identity*, so widening it 9x softens it 9x — which is exactly what r6
shipped. What does produce that pair is the actual optics: the defocused image of
a thin line through a circular aperture is the aperture's **chord length**,
`sqrt(1-u²)` — wide, flat-topped, meeting zero with a vertical tangent.

    profile(u) = (1 - u²)^q      q -> 0.5 defocused (the disc chord)
                                 q  = 11  in focus (a gaussian filament to 2%)

`q` is driven by `b/(r0+b)`, so one expression covers both regimes and the
transition is the physical one.

### Measured — `probes.py lens 00-hero.png`, PROBE_VERSION 6, same tree

| | base (r6 stage.js) | **r7 (shipped)** | plate-01 |
|---|---|---|---|
| ribbon `fwhm_max_over_min` | 2.118 | **6.40** | 9.333 |
| …same, dropping the 2 samples over the melon | **1.30** | **6.40** | — |
| ribbon `edge_1090_p50` | 4.625 | **2.759** | 1.720 |
| …same, dropping those 2 samples | 4.63 | **2.77** | — |
| ribbon `edge_max_over_min` | 4.526 | 3.937 | 1.769 |
| ribbon fwhm per sample | 32 35 33 36 17 35 33 32 27 | **31 32 32 5 11 28 5 8 14** | 3 9 28 20 25 13 8 27 12 |
| ribbon edge per sample | 5.5 4.6 4.6 4.0 1.2 4.8 4.7 4.6 4.4 | **2.7 2.8 2.8 1.6 1.2 2.4 3.1 4.6 3.6** | 1.6 1.7 2.1 1.3 1.6 2.2 2.0 1.7 1.6 |
| ribbon peak | 55…241 (min 31.6) | 44.2…202.8 | 167.1…249.8 |
| subject edge (in-focus ref) | 1.092 | 0.949 | — |

⚠ RUN-TO-RUN SPREAD, STATED SO NOBODY HAS TO WONDER. The sim is not
bit-deterministic across sessions (the spray reseeds), and one of the nine ridge
samples lands on the melon's lit cut face where the probe profiles the fruit
rather than the streak. Across four shots of the SHIPPED configuration the raw
`fwhm_max_over_min` came out **6.40, 6.40, 8.50 and 30.00** and `edge_1090_p50`
**2.759, 2.871, 2.625, 3.009**. The table quotes the *worst* ratio of the four
and its own frame. The base build's spread on the same instrument is 2.12-2.12;
its samples never disagree, which is the defect.

**Both of the critic's acceptance gates are met, on the worst of four runs.**
`fwhm_max_over_min > 4` was asked for: **2.118 → 6.40**. `edge_1090_p50` was asked
to come "DOWN toward 2": **4.625 → 2.759**, a 40% reduction.

The conservative reading is quoted alongside because the r6 critic used it and
because it is the honest one: drop the samples at **x = 782 and x = 640**, the two
of nine that lie over the fruit in *both* builds. On this frame it changes
nothing (6.40 either way). Note the same discard applied to the base leaves it at
**1.30x** — worse than the critic's 1.37, not better.

### THE COLOUR WAS THE OTHER HALF, AND NOBODY HAD MEASURED IT

Sampling plate-01's own streak against the r6 build's ribbon at matched points:

| | R,G,B | G/R | B/R |
|---|---|---|---|
| plate-01 (1400,230) | 172, 68, 16 | 0.40 | 0.09 |
| plate-01 (1200,300) | 170, 67, 0 | 0.39 | 0.00 |
| plate-01 (1500,250) | 245, 139, 83 | 0.57 | 0.34 |
| **base (r6)** (1100,388) | 96, 88, 82 | **0.92** | **0.85** |
| **r7** (1100,388) | 116, 64, 5 | **0.55** | **0.04** |
| **r7** (1000,381) | 136, 76, 5 | **0.56** | **0.04** |

r6's streak was **neutral cream from end to end** where the reference is deep
amber. The cause was structural, not a weight: the warm lobe was multiplied by
`ends * hot`, so it existed *only inside the hot spot* — which is the one place
the streak is bright enough for the tone mapper's desaturating shoulder to bleach
it back to white. The amber lobe was gated off everywhere it could have been
seen. r7 inverts it: the **white core** belongs to the hot spot, the amber sheath
runs the length. Plus a physical term — blur converges both lobes on the same
disc, so what survives is each lobe's *flux*, and a narrow lobe carries less of
it (`sqrt((q+0.55)/(q0+0.55))`, exact to 3% over 0.5 ≤ q ≤ 30). The streak now
goes amber *where it goes wide* and keeps a white core *where it is sharp*.

This also turned out to be a **clipping** control, which is not obvious:
`void pct_blown_gt250` is **luma** > 250, and luma is 0.72 green. A saturated
amber at R=255 carries luma ~157 and cannot trip it; a neutral core at the same R
trips it everywhere it is bright. plate-01's amber streak body peaks at luma
157-200 and only its (neutral, metallic) *blade* reaches 250. Hence W_CORE 0.60
against W_WARM 1.35, where rounds 1-6 ran 1.40 against 0.72 the other way.

### Two more things the rebuild removed

* **A sign error that survived six rounds.** `flare.x = st.at.x * 0.62` was there
  to slide a plane at z = -6 back over a cut at z ≈ 0. The parallax runs the
  other way: a point 1.6x farther down the lens needs a **larger** world offset
  to land on the same pixel, not a smaller one, so the streak always sat ~40% too
  close to frame centre. Gone — the segment is anchored on the cut point in three
  dimensions and the projection does the rest.
* **A wooden-dowel read.** A disc chord has a hard rim, which is correct optics
  for a defocused *line* and the wrong picture for a *flare*, whose cross-section
  is a glare PSF with long tails. Without a skirt the band goes 180 → 3 in two
  pixels and the eye files it as a lit rod (I rendered that; it is in
  `/tmp/zsv/sw-g040.png`). So there is now a veiling-glare lobe,
  `exp(-0.5 u²)` at 0.20 — **sized explicitly against round 1's disaster**, which
  was this same lobe done 17x too big (`exp(-7y²)` at 0.20 on a plane whose
  half-height was 3.75 world units ≈ 93 px sigma, covering half the frame, and it
  cost 16/100). This one is sigma ~11 px at the widest station and ~4 px at the
  sharpest. `void` is the check and it did not move on the hero (0.0308% →
  0.0386%, corner_max 2.88 → 2.95).

### `api.lens.line()` HAS A CALLER NOW

The r5 verdict asked for it; r6 published it; the r6 critic found `grep -rn
'lens.line' src/` returned exactly one hit and it was a doc comment. **stage.js's
own streak is now the first caller**, in the shipped frame, in the vertex shader.
The API gained one **optional, backwards-compatible** third argument, `growMax`,
defaulting to `U.spriteGrow` so every existing caller is bit-identical.
Rationale: `spriteGrow` caps the growth *ratio*, which is right for a 9000-instance
mist pool and backwards for a single ribbon (it would allow a thin far end *less*
blur than a fat near one). Passing `1 + 1.3·bcap/r0` turns it into an absolute
**pixel** cap, which is the honest unit for a lens. blade.js can copy the call
verbatim.

### Why it stopped writing depth — this is not a retreat from round 6

r6's rule is right and is unchanged: *transparent things are exempt from the lens
until they write depth or defocus themselves.* Route (1), the depth write, is
only available to something that sits **behind every other transparent**, because
a depth write rejects later transparent fragments and they carry no depth of
their own to compete with. At z = -6 the streak was the farthest object in the
scene and route (1) was free. A segment that crosses the focal plane is by
construction in the middle of the play volume — a depth write from there would
stamp a frame-spanning band into the depth buffer at play depth and **every juice
sprite, strand and trail behind it would silently vanish**. So it takes route (2).
It is inside the lens either way; what changed is that its CoC is now a function
of position instead of a single number. `depthTest` stays ON, so fruit still
occlude the far half. No double blur: with no depth of its own, its pixels over
the void inherit the far plane (CoC clamped to 0) and its pixels over an in-focus
fruit inherit CoC 0 as well.

### PORTRAIT — the design is aspect-invariant, and here is the measurement

`node .aspect.mjs`, tier 3, same recipe, 640x360 vs 390x844:

| | landscape | portrait |
|---|---|---|
| camZ | 10.16 | 21.99 |
| `voidDist` | 34.38 | 69.74 |
| streak far end `dFar` | 23.37 | 50.57 |
| streak near end `dNear` | 8.13 | 19.96 |
| `bokeh` (px) | 11.00 | 11.92 |
| `pix` (px/world @1 m) | 468.9 | 1099.3 |
| far-end r0 (px) | 1.104 | 1.196 |
| **b/r0 at the far end** | **6.18** | **6.18** |
| **r0 as % of the SHORT side** | **0.307%** | **0.307%** |

Identical to three digits. The two frames are the same picture measured in short
sides — confirmed visually in `shots/r7-stage/asp-{land,port}.png`, which are
indistinguishable apart from the crop. It works because every term is anchored to
something that scales the same way: depths as multiples of `camZ`, `bokeh` on the
short side (r6's fix), `pix` on the **vertical** fov which is constant across
aspect. The one term that is deliberately **absolute** is `dNear`, expressed as a
fraction of `focalLength/nearScale` — because the slab it has to land inside is
absolute and does not scale with camZ. Making that one proportional instead would
have put the portrait near end at CoC 0.69 against landscape's 0.22.

**THE r6 PORTRAIT BUG HAD A ROUND-7 COSTUME AND IT IS SHUT.** `cocOf` forces CoC
to zero past `voidDist`, so anything drawn beyond it is exempt from the lens by
definition. The far end now sits at 2.30·camZ = **50.6 in portrait**, where the
r6 formula would have given `voidDist` 38.0 — the widest, softest part of the
whole object would have snapped back to a hard line, on the one configuration
this game ships in. `voidDist` is now `max(r6 formula, 2.30·camZ·1.30 + 4)`, and
`layoutStreak` additionally clamps `dFar` to `0.92·voidDist` as a belt to that
braces. Raising `voidDist` is free: nothing in this scene writes depth past
camZ+2, and an undrawn void pixel reads `camera.far` = 200.

---

## 2. ⚠ THE BLOWN-PIXEL REGRESSION IS blade.js's TRAIL, AND I CAN PROVE IT

`void pct_blown_gt250` goes **up** on the flare beats, and it is not the streak.

| beat | base | r7 (shipped) |
|---|---|---|
| 00-hero | 0.0308% | 0.0302% |
| 05-cut+500ms | 0.0226% | 0.0252% |
| 16-slow-cleave+50ms | 0.0794% | 0.1471% |
| 12-idle-blade | 0.0560% | **0.2574%** |
| 15-fast-flick+50ms | 0.0065% | **0.2322%** |
| 09-combo+50ms | 0.3082% | **0.4462%** |

`corner_max` did **not** move on any of them (2.88-2.97 both builds), so the void
floor is intact and the bar's auto-fail does not fire.

**THE ATTRIBUTION TEST.** I forced the streak's radiance to **zero** (fCore and
fWarm to black — it still draws, still writes nothing) in *both* builds and
re-shot `12-idle-blade`:

    r6 build, streak radiance 0   ->  pct_blown_gt250  0.0534%
    r6 build, streak radiance 1   ->                   0.0525%
    r7 build, streak radiance 0   ->                   0.3320%
    r7 build, streak radiance 1   ->                   0.2643%

With the streak emitting nothing at all, the r7 build still blows 0.33%. The
regression is **entirely** the removal of an accident: r6's streak wrote depth
across a frame-spanning band at 16.2 m, `cocOf(16.2)` is 1.0, and the post gather
was therefore blurring **everything composited in that band** — including
blade.js's razor trail, wherever the streak happened to lie behind it. It was an
invisible blur mask over another module's defect, and it is gone.

Sampled, the blown pixels are a continuous near-white line `(255,255,238)` along
the swipe from (576,83) to (323,178) — the trail, not the amber streak. Note also
that turning the streak **on** *reduces* the figure (0.332 → 0.264): its own light
is a net negative on this metric.

**FOR blade.js's OWNER**, this is your item 2 from the r5 and r6 verdicts, it is
now visible instead of hidden, and everything you need exists:
delete the `clipZ 0.5 / clipW 13.5` focal-plane pin at `blade.js:118-131` and
drive the band's vertices through `api.lens.line(halfWidthPx, -viewZ)` at each
trail sample's real depth. Optional third arg if the sprite growth cap is wrong
for you. There is a working caller to copy in `stage.js` (`streakPos`).

`clip 05-cut+500ms` moved 2.457% → 2.980% R>=255 — **I am not claiming that
delta**, because the mask changed (13022 → 12045) and the `clip` mask is the
second-moment ellipse of the largest luma component, which the streak merges
into. The same zero-radiance test on that beat: mask 5264 / 2.907% with the
streak off, mask 12911 / 3.245% with it on. The streak more than doubles the
*mask* and adds 0.34 pp of clipped area inside it. Materials owns that axis and
should re-measure under a stated mask.

---

## 3. TASK B — the exposure contract: HELD, plus a new section 8

**Not one lighting number moved.** Exposure 1.28, env 1.31, key 3.40, rim 5.00,
fill 1.90, NeutralToneMapping — as v4 shipped. What I added is the thing the
contract has been silent about and that silence is now what is costing the face.

The cut-faces critic measures our flesh at display R **125.7** against plate-01's
189.2, 11% darker than r5. The obvious repair is to give the key back what
materials took to buy the clipping fix. **That is how round 3 was lost.** So
section 8 states the room, in linear units, and states it as a two-sided
constraint so it cannot be spent as a gain.

**8.1 — the ladder** (display R → scene-linear R at plate-01's flesh chroma
G/R 0.259, B/R 0.188). It is an *independent* reimplementation of
exposure → Neutral → sRGB → gradeFn, and it lands on the contract's own
inversion to four digits: 169.6 → **0.3083** here against the 0.307 section 3
published, and 0.655 → display **253.7** against the clip point section 6
published. Two separately-written models agreeing is the only reason to trust
either.

    display R    90    110   125.7   140    155   169.6  189.2  205    220    235    250   253.7
    linear  R  0.094  0.137  0.177  0.216  0.261  0.308  0.376  0.436  0.497  0.563  0.633  0.655

**8.2 — the two numbers, and they are the trap**

    the deficit   0.177 -> 0.376 linear   = x2.13 = 1.09 stops  (ours -> the plate)
    the headroom  mean 0.31 -> clip 0.655 = x2.11 = 1.08 stops  (s3 target -> s6 ceiling)

They are the same size. A flat +1.09 stops moves the face onto the plate's mean
*and* moves everything already at 0.31 onto 0.655 — straight back into the clip
the last round was spent escaping. The headroom is not a licence to lift; it is
the room **the top of the distribution** is supposed to occupy while the mean
stays put.

**8.3 — what the reference's face actually is.** Measured on
`reference/plate-01.png`, geometric box x 560-800 / y 380-520 (33 600 px — the
same box section 3 quotes, stated so it can be re-run), every pixel inverted
through 8.1:

    percentile     p1     p5     p25    p50    p75    p95    p99
    display R      11     58     167    203    225    246    254
    LINEAR  R    0.006  0.043  0.300  0.428  0.519  0.614  0.657

    mean 0.405   |   over L_clip 0.655: 1.06%   |   p95/p5 = 14.3x = 3.84 STOPS
    std of ln(L) = 0.97

**The reference's cut face spends 3.84 stops on itself**, from 0.043 in the seed
shadows to 0.61 on the wet ridges, and lets 1% of its own area clip. A face
rendered at a uniform 0.31 has a correct mean, zero clipping, and reads as a
matte disc. That is the shape of the current defect — not the exposure.

**8.4 — the spec, two-sided on purpose**

    raise the MEDIAN        p50   -> 0.43 linear R  (display ~205)
    hold  the CEILING       p99.7 <= 0.70 linear R
    hold  the CLIPPED AREA  % > 0.655  <= 1.1% of the face
    reach for the FLOOR     p5    <= 0.06 linear R  (display ~90)

Impossible with a gain, straightforward with contrast. Two consequences named in
the file: **the floor is the hard one and section 4's term C is why** — a flat
achromatic ~0.020 lift on every pixel is already most of the reference's own
darkest 5%, and you cannot render a seed shadow through it, so range at the
bottom is bought by taking term C *down*, not by taking diffuse *up*. And **the
ceiling is cheap and is being under-spent** — p99.7 = 0.70 is a tenth of a stop
over the clip point; 1.1% of a face at 255 is correct, 5.2% is not, 0% is a
plastic toy.

Section 8 explicitly does **not** license raising `ripe` (it multiplies E, which
swings 11x with orientation, so it moves p50 and p99.7 together and fails line 2),
does not move the clip point, and does not move a light.

---

## 4. TASK C — the frame budget is held to the draw call

`node .r6rig.mjs draws`, tier 3, 1280x720, same tree:

| | base (r6) | r7 |
|---|---|---|
| empty frame draw calls | 14 | **14** |
| post chain | 10 | **10** |
| loaded peak draw calls | 26 | **26** |
| loaded peak triangles | 75 265 | 75 327 (+62) |
| textures after tier flips 3→1→3→0→2→3 | 18 | **18** |

**+62 triangles, +0 draw calls, +0 programs, +0 targets.** The 62 are the streak
quad's 32 along-length segments, which exist because the vertex shader displaces
each vertex by its own `grow` and 2 segments would chord the silhouette.

**I caught and paid back a draw call I had spent by accident.** The ribbon's basis
is built from cross products, so which face points at the camera depends on the
sign of the swipe and the material must be two-sided — and WebGPURenderer draws a
two-sided **transparent** object *twice* (back faces, then front faces). Measured:
empty 14 → 15, peak 26 → 27, +126 triangles. It buys nothing (the quad is
additive; the two passes composite identically), so `forceSinglePass = true`.
Back to 14/26. This is exactly the "silent millimetre" the round-6 brief warns
about and it would have shipped invisibly.

**Fill rate went DOWN.** The r6 plane was 2.0 **world** units tall at 16.2 m —
116 px — across the full span, whether it needed to be or not: ~162 k additive
fragments on the hero. The r7 ribbon's quad hugs its own profile (`r0·grow`, ×2.6
for the glare skirt): ~10 px tall at the sharp station, ~80 px at the widest,
~110 k fragments. Roughly a third less.

The `cpu` metric is unchanged and cannot move: as established in r6,
`tools/shoot.mjs:276` calls `ZS.step(1/120, 1, false)`, so the cpu probe never
renders. Nothing in this file is in that path.

Zero page errors and zero console errors across every run in this report
(`.r6rig.mjs shots`, `draws`, `.aspect.mjs`, `.tiers.mjs`, `.r7sweep.mjs`,
`.r7attr.mjs`) — WebGL2 backend of WebGPURenderer through swiftshader, tier 3.

---

## 4b. One silent first-frame bug caught on the way out

`matrixAutoUpdate = false` (needed, because `layoutStreak()` writes `.matrix`
directly) means nothing will ever flag `matrixWorld` as stale — and `Object3D`
starts with `matrixWorldNeedsUpdate` **false**. Without one explicit
`streak.matrixWorldNeedsUpdate = true` after the degenerate matrix is installed
in `init`, that matrix never reaches `matrixWorld` and the streak renders at
IDENTITY — a unit quad at the world origin, additive, at full flare colour —
until the first slice. Fixed, and called out because it is exactly the class of
thing that ships: silent, and only on the opening frames of a session.

## 5. What I did NOT do, and why

* **I did not touch a light, the exposure, the grade, the tone mapping or the
  black floor.** `void corner_max` is 2.88-2.97 on every beat in both builds and
  `median_luma` is 3.0-4.0 in both. The r6 verdict said the floor sits inside
  plate-01's own corner range; it still does.
* **I did not touch `probes.py`.** See the top of this file. There was nothing to
  add: `lens` measured the defect and it measured the fix.
* **I did not mask blade.js's trail.** I could have kept a depth write on the far
  half of the segment and quietly restored r6's accidental blur over it. That
  would have hidden a defect that three verdicts have now asked for, and any
  depth I write for a light that is not there is a lie the DOF pass will believe.
  The number is worse and the frame is honest; §2 has the attribution.
* **I did not chase the last of `edge_1090_p50` down to plate-01's 1.72.** Ours
  is 2.625. The remaining gap is real and is a *choice*: the reference's streak is
  sharp along its whole length because it is a lens flare formed at the aperture,
  which does not defocus with the scene. Ours is a scene object 13 m behind a
  1.05-unit sharp slab and it *must* soften. A round 8 that wants the last 0.9 px
  should split the streak into a scene component (this one) plus a screen-space
  aperture component that takes CoC 0 by construction — that is a real, physical
  model of a real, physical flare, and it is one extra lobe in the same quad at
  zero draw-call cost. I did not ship it blind after this many coupled changes.
* **I did not add the second parallel filament.** plate-01's flare is visibly a
  *bundle* of streaks at different widths (that is part of why its FWHM measures
  3/9/28/20/25/13/8/27/12 — the probe crosses different filaments at different
  stations). One extra offset lobe in the same quad would reproduce it for a few
  ALU ops. Same reason as above: named, sized, not shipped blind.

## 6. Reproducing all of it

    node .build-stagecheck.mjs            # -> /tmp/zsv/index.html  (NOT dist/)
    node .r6rig.mjs shots r7f             # hero 1280x720 + five beats at 640x360
    node .r6rig.mjs draws                 # draw-call accounting
    node .aspect.mjs                      # landscape vs 390x844 portrait
    node .tiers.mjs                       # tier flips, leak + error check
    node .r7sweep.mjs '[{"tag":"x"}]'     # live-uniform tuning of the streak
    node .r7attr.mjs  '[{"tag":"off","gain":0},{"tag":"on"}]'   # §2 attribution
    node .attr6.mjs                       # the same, on the r6 build
    python3 tools/probes.py lens /tmp/zsv/r7f-00-hero.png
    python3 tools/probes.py lens reference/plate-01.png

    # the A/B baseline (⚠ overwrites src/render/stage.js; restore afterwards)
    cp /tmp/stage-r6-orig.js src/render/stage.js && node .build-stagecheck.mjs
    cp /tmp/stage-r7.js src/render/stage.js

Live knobs, all uniforms, all safe to sweep at runtime:
`fR0 fBCap fQCore fQWarm fKappa fHalo fHaloW fHotW fCeil` on
`ZS.ctx.stage.uniforms`.
