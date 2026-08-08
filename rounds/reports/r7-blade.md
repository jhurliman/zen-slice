# r7 — blade.js (the trail joins the lens; the portrait bug; −1 draw call)

**FILE TOUCHED: `src/input/blade.js` only.**
**`tools/probes.py` IS BYTE-FOR-BYTE UNCHANGED** — md5 `2a421795a52b75b26ec9cad2b4d9a910`,
identical at the first minute of this session and at the last. PROBE_VERSION stays
**7**. I added no probe and needed none: `lens` and `void` already measure exactly
the defect I was sent to fix, and every number below comes out of one of them.

⚠ **EVERY "before" NUMBER IS A TRUE A/B, SHOT TODAY, FROM THE SAME TREE.**
`src/fruit/geometry.js` changed under me mid-session (13:40), so the final
measurement pair `basef-*` / `r7f-*` was re-shot back to back afterwards with
**only `blade.js` toggled** (r6 original kept at `/tmp/blade-r6-orig.js`).
Frames: `/home/claude/juice/shots/r7-blade/`. Rig: `/home/claude/juice/.r7blade.mjs`
(private, uses `tools/shoot.mjs`'s recipes verbatim so the numbers line up with
`shots/r6`). Zero page errors and zero console errors on every run.

---

## 0. FIRST, TWO THINGS IN THE BRIEF THAT ARE NOT TRUE, WITH THE EVIDENCE

I was asked to verify the stage owner's reasoning rather than assume it. Two of
its premises do not survive.

**(a) `blade.js` has NOT been `depthWrite:false` since round 2. It was
`depthWrite:TRUE` with `depthTest:FALSE`, and that is worse.** Measured on the
r6 build, every beat: `{"depthWrite":true,"depthTest":false}`.

A depth write with depth *test* off does not occlude anything — a later fragment
always wins — so it never cost a pixel of colour. What it did instead is stamp
the trail's pinned focal-plane depth into the depth buffer **over every pixel it
crossed, fruit and spray included**, and the post DOF gather reads that buffer.
Rounds 2-6 were therefore laying a band of *somebody else's* circle of confusion
across the frame — a sharp stripe through whatever it passed over — and that,
not the shading, is what made the razor razor-sharp: `cocOf` at the focal plane
is zero by construction.

**(b) The stage owner's CONCLUSION is right; their REASON is not.** They wrote
that this trail "cannot write depth — a long additive ribbon that overlaps itself
would occlude its own segments". It would not, because `depthTest` is false and
there is no self-occlusion available to have. (It is also not additive; it has
been `NormalBlending` since round 2.) The real disqualifier for route (1) is (a):
you cannot write depth from something drawn with `depthTest:false` over the whole
playfield without vandalising the CoC of everything under it. So route (2),
`api.lens.line()` at emission, is the only one open — the right answer, arrived
at for the wrong reason, and it is worth having the right one on record because
the wrong one would have let a future round "fix" it by turning depthTest back on.

**(c) THE HERO FRAME CONTAINS NO BLADE AT ALL.** The r7 stage report says the
needle is "visible in the hero". It is not. `tools/shoot.mjs` shoots `00-hero` at
**cut + 250 ms** and `TRAIL_LIFE` is **200 ms**, so `pts` is empty and the
geometry's draw range is zero:

    00-hero        {"drawCount":0, "verts":0}      <- both builds
    12-idle-blade  {"drawCount":240,"verts":82}
    02-cut+33ms    {"drawCount":216,"verts":74}

Confirmed on the probe: `lens 00-hero` ribbon `edge_1090_p50` 2.759 (r6 blade) vs
2.625 (r7 blade), inside stage.js's own stated 2.625-3.009 run-to-run spread for
its streak. The hard elements in the hero are stage's streak and fluid's strands.
**So `lens 00-hero` cannot measure this file and I do not quote it as if it
could.** Everything below is `12-idle-blade` and the other beats that actually
contain a trail. *For the integrator:* `00-hero` is the only frame the critics see
at full resolution and it has no blade in it. If the hero is meant to show one,
it wants shooting at +100 ms — that is a `tools/shoot.mjs` change, not mine.

---

## 1. THE DEFECT, AS GEOMETRY

Round 2 pinned every vertex of the trail to ONE depth — the DOF focal plane — by
emitting two constants for clip z and w (`clipZ 0.5 / clipW 13.5`). One depth is
one circle of confusion and one perspective divide, so **its width and its blur
were constants of the object**. Measured on the r6 build, `lens` on the trail
rendered alone (see §2 for why that is legitimate), `15-fast-flick`, nine samples
along its length:

    fwhm        1   3   3   2   2   2   2   1   1
    peak       72 254 254 254 254 254 254 246  18
    edge_1090 0.82 1.29 1.26 1.14 1.04 1.04 1.13 1.07 0.88

A 10-90 edge of **1.072 px, flat to 1.58x end to end, in a frame whose in-focus
subject measures 1.548 and whose juice sheet measures 2.274.** The trail was 31%
*sharper than the thing that is supposed to be in focus*, and six of its nine
stations were clipped at 254.

This could not be fixed by tuning, for the same reason stage.js's plane could
not: **a uniform CoC is the physically correct answer to a screen-parallel
object.** The pin was the bug.

## 2. WHAT IT IS NOW

**(1) Per-vertex depth. The trail stops being a decal and becomes a curve in the
scene.** The stroke is modelled as an arc in world space: `u = 1` (the live
pointer) sits on the focal plane, and the tail recedes **quadratically**,
`dist = focus + RECEDE·focalLength·(1−u)²`.

The exponent is 2 and it is not a shaping choice — the depth of *any* smooth 3-D
path near its point of closest approach to the camera is quadratic in the
parameter; that is what a smooth extremum is. The closest approach is at the tip
because driving the blade at the target is what a slash is. I shipped a linear
ramp first and measured it: it puts a kink there and defocuses the leading third
of the stroke, which is the third that has to stay a blade (`/tmp/solo_r7a_idle.png`
vs the shipped `shots/r7-blade/r7f-solo-idle.png`).

It recedes rather than approaches because `cocOf`'s far slab is `focalLength`
= 1.15 world units and its near slab is `focalLength/nearScale` = 7.7 — six times
deeper. Only the far side can produce a lens over the length of a stroke, and
plate-02's defocus is emphatically *behind* the subject. It also makes CoC
monotone in age, so defocus and fade point the same way.

**Screen position is untouched.** Clip is still `(ndc.x·w, ndc.y·w, z(w), w)`;
only `w` is now per-vertex, read from `position.z`, which was a hard 0 for six
rounds. Any screen path can be realised by a 3-D curve at any depth profile, so
this costs the feel exactly nothing — no new attribute, no extra vertex
bandwidth, still a clip-space passthrough, still one draw call.

**(2) TWO defocus terms, because there are two features and they differ in size
by 7x. This is the crux, and one call gets it wrong.**

* The **solid band** (silhouette + the flat of the blade) does not dim when it
  defocuses — a solid's area is preserved and only its edges soften — so it takes
  `b` (the CoC radius in px) directly on both boundaries, plus a
  contrast-flattening term, and **no energy term**.
* The **specular filament** is a genuine thin ribbon, so it takes
  `api.lens.line(r0, dist, growMax)`: `grow` widens it, `energy = 1/grow`
  conserves its flux, and `flat` drives its cross-section from a gaussian to the
  aperture's chord, `(1−u²)^q` with q: 11 → 0.5, exactly stage.js's construction.

Running the band's `grow` on the filament would leave a ~5 px razor in a frame
where everything else was 20 px soft — the defect verbatim.

**(3) `depthWrite = false`,** for the reason in §0(a). Named residual: with no
depth of its own the trail inherits whatever is under it, which is the far plane
over the void (`cocOf` clamps to 0) and ~0 over the in-focus subject, but *not*
zero over a fully defocused far fruit, where it is blurred twice. Bounded, rare,
and the identical exposure stage.js's own streak accepted this round.

**(4) `forceSinglePass = true`.** See §5.

### ⚠ THE ONE-LINE BUG THAT COST HALF THE TRAIL, AND WHY IT IS WORTH A PARAGRAPH

`lineDefocus` builds `rEff = r + 1.30·b`. That 1.30 is a **rim** convention and
it is right for a sprite-shaped billboard. What actually happens to a LINE is
that it convolves with the aperture's chord, whose own flux-equivalent
half-width is `(π/4)·b` = 0.785·b. Handing `line()` the naive in-focus half-width
therefore **dims the filament by 1.5x more than it widens it** — measured on the
first build: 6.24x dimmer for 3.7x wider, i.e. it destroys 40% of the flux, and
the trail visibly evaporates. Scaling the argument by `4·1.30/π = 1.6552` makes
`grow` and `energy` exact, with **no change to `lineDefocus` and no private copy
of it here**: `EDGE_R0 · L.x  ==  EDGE_R0 + 0.7854·b` to five digits.

**FOR THE STAGE OWNER:** this is a property of the published API, not of my
caller. `energy = 1/grow` is only strict flux conservation under `line()`'s own
rim convention; a caller who reads the docstring's "the strip's IN-FOCUS
half-width" literally, as I did, silently loses flux. Worth a sentence in the
docstring, or a `lineFlux()` alias.

The second half of that repair: the specular lives ON the blade, so in focus it
stops dead at the cutting edge — that one-sided cut is what makes it read as an
*edge* rather than a tube. Defocused it must not be clipped by the silhouette a
**second** time: the true image is (filament × silhouette) convolved *once*, and
multiplying two separately-blurred factors attenuates the crossover by a further
0.57. `mix(outer, 1, flat)` fades the second clip out exactly as the blur takes
over. Between them these two fixes are the difference between `peak_min` 45 and
`peak_min` 66 with the same width.

---

## 3. MEASURED — `void`, PROBE_VERSION 7, every beat that contains a trail

`mask_px` is 230400 on every row of both builds (the `void` mask is the whole
frame), and `corner_max` does not move anywhere.

| beat | r6 blade | **r7** | Δ | corner_max |
|---|---|---|---|---|
| `12-idle-blade` | 0.5378% | **0.4253%** | **−20.9%** | 20.43 → 20.33 |
| `15-fast-flick+50ms` | 0.2444% | **0.1480%** | **−39.4%** | 2.94 → 2.97 |
| `09-combo+50ms` | 0.3694% | **0.2075%** | **−43.8%** | 36.72 → 36.72 |
| `16-slow-cleave+50ms` | 0.1076% | **0.0399%** | **−62.9%** | 3.18 → 3.19 |
| `02-cut+33ms` | 0.3867% | **0.1970%** | **−49.1%** | 2.93 → 2.97 |

`pct_blown_gt250` is stable to <1.5% relative across page loads on this metric
(two independent r6 shoots: 0.5352 / 0.5317 on `12-idle-blade`), so every row is
far outside the noise. Reference: `void reference/plate-01.png` = **0.1149%**.

### THE ATTRIBUTION TEST — the trail alone, and this is the honest number

The composited beats mix my trail with stage's streak and everyone's specular. So
I re-shot two beats with every other drawable's `.visible` set to false — a real
render of a real frame through the real pipeline, with the rest of the scene
hidden — and ran the **same frozen probes** on it. `void`:

| solo trail | r6 blade | **r7** | Δ |
|---|---|---|---|
| idle stroke | 0.1324% | **0.0473%** | **−64.3%** |
| fast flick | 0.2969% | **0.1502%** | **−49.4%** |

`corner_max` 2.89 / 2.92 in both builds, `mask_px` 230400 in both.

### `lens` ON THE SOLO TRAIL — the ribbon probe with nothing else to lock onto

The `lens` ribbon is a Radon ridge, and on a composited beat it is shared between
my trail and stage's streak (they lie on the same line, since both follow the
swipe). On the solo frame it is unambiguously the trail, and all nine samples of
`15-fast-flick` land on it:

| `15-fast-flick`, solo | r6 blade | **r7** |
|---|---|---|
| `edge_1090_p50` | 1.072 | **2.027** |
| `edge_max_over_min` | 1.578 | **4.855** |
| `fwhm_max_over_min` | 3.0 | **9.0** |
| `peak_min` | 17.9 | **66.3** |
| samples at peak ≥ 250 | **6 of 9** | **3 of 9** |
| fwhm | 1 3 3 2 2 2 2 1 1 | **1 3 4 4 6 8 9 8 8** |
| peak | 72 254 254 254 254 254 254 246 18 | **77 254 254 250 180 114 100 87 66** |
| edge_1090 | .82 1.29 1.26 1.14 1.04 1.04 1.13 1.07 .88 | **.81 1.46 1.48 2.03 2.87 3.45 3.94 3.80 1.53** |

Idle stroke, solo (three of the nine samples fall off the trail into the void and
report peak 4.0; the six on it are quoted): `edge_1090_p50` **1.236 → 2.374**,
fwhm `3 2 2 2` → **`3 5 8 8`**, peak `254 254 254 254` → **`254 182 97 77`**.

**The gate, stated against the same frame's in-focus reference.** In
`15-fast-flick` the composited subject's `edge_1090_p50` is 1.548 (r6) / 1.683
(r7) and the sheet's is 2.274 / 2.534. So:

    r6:  trail 1.072  <  drops 1.507  <  subject 1.548  <  sheet 2.274
    r7:                  drops 1.552  <  subject 1.683  <  trail 2.027  <  sheet 2.534

**The trail was the sharpest class in the frame and is now the second softest.**
That is the round-7 brief, met, on the frozen probe.

### `lens` on the composited beats

Weaker instrument (the ridge is shared, and on `12-idle-blade` only 3 of 9
samples lie on the trail at all), quoted for completeness rather than as the
headline:

| | r6 | r7 |
|---|---|---|
| `12-idle` ribbon `edge_1090_p50` | 1.868 | 2.118 |
| `12-idle` fwhm | 17 17 7 29 31 18 **9** 7 7 | 17 17 7 30 32 22 **13** 7 7 |
| `12-idle` peak | 63 119 252 254 254 **255 254** 170 111 | 62 119 252 254 253 **248 215** 173 111 |
| `15-flick` ribbon `edge_1090_p50` | 2.513 | **3.537** |
| `15-flick` peak | 113 255 255 255 249 255 254 244 122 | 115 255 254 249 **219 209 197 189** 139 |

---

## 4. ⚠ A PORTRAIT BUG, LIVE SINCE ROUND 1, AND IT IS 2.16x

Rounds 1-6 sized the band as `BASE_W · (drawingBufferHeight/2)` — a constant
fraction of frame **HEIGHT**. Widest station of the `12-idle-blade` stroke,
measured out of the vertex attribute at both sizes:

| | landscape 640x360 | portrait 390x844 | ratio, **short side** |
|---|---|---|---|
| **r6** | 11.64 px = 3.232% | 27.28 px = 6.995% | **2.164x** |
| **r7** | 11.74 px = 3.260% | 12.58 px = 3.226% | **0.990x** |

**The blade got 2.16x fatter, relative to the screen, when you turned the phone.**
Exactly the class of bug r6 found in the CoC, in the file next door, and it
survived seven rounds because every frame anyone has ever measured on this
project is landscape. It is not subtle: `shots/r7-blade/base-port-12-idle-blade.png`
against `shots/r7-blade/r7c-port-12-idle-blade.png` is a fat white slab against a
blade.

The fix is not a normalisation constant, it is the same change as everything else
here: **the width is a WORLD quantity now**, `BLADE_W · pix / dist`. It is
invariant for a reason rather than by tuning — `pix` scales with the drawing
buffer height and `main.js` dollies the camera to fit the stage box, so `dist`
scales with the short side, and `pix/dist` holds. `BLADE_W = 0.3044` is derived,
not chosen: it is the value for which `BLADE_W·pix/dist` reproduces r6's
`0.078` ndc-y at the focal plane, so the landscape picture moves by 0.9% (the
residual is the new, correct perspective taper along the receding trail) and
nothing measured on this project changes except portrait, where it was wrong.

**The other portrait term is `RECEDE`, and it is deliberately ABSOLUTE** — a
multiple of `focalLength` — rather than proportional to camZ, because `cocOf`'s
slab is absolute. An absolute recession gives an *identical* circle of confusion
on both aspects; making it proportional would have handed portrait 2.16x the blur,
which is r6's bug re-derived from the other end. Measured: `bokeh` 11.0 landscape
/ 11.917 portrait (11·390/360 = 11.917 ✓), same `cocOf`, same b/short-side.

## 4b. A LOW-TIER BUG I CAUGHT ON THE WAY OUT

`bokeh` does **not** go to zero on LOW — it is 7.5 — so gating self-defocus on
`bokeh` would have shipped a trail that defocuses itself over a scene with **no
post DOF pass at all**, which is worse than no lens. stage.js already signals
that state by pinning `spriteGrow` to 1.0 ("no growth"), and the file now reads
that signal rather than re-deriving the tier. Verified across a
3→1→3→0→2→3→2→3 flip: no errors, `renderer.info.memory.textures` returns to 18
every time and to 6 at tier 0.

---

## 5. PERF — one draw call CHEAPER, and the JS cost is unmoved

`node .r7blade.mjs draws`, tier 3, 1280x720, same tree, blade toggled:

| | r6 blade | **r7** |
|---|---|---|
| loaded peak draw calls | 26 | **25** |
| loaded peak triangles | 75 327 | **75 247** |
| JS frame max, 5 runs of 400 steps (ms) | 7.0 / 6.0 / 4.1 / 4.3 / 3.2 | **4.2 / 4.2 / 2.9 / 4.2 / 2.7** |
| JS frame median / p95 (ms) | 0.0-0.1 / 0.2 | 0.0-0.1 / 0.2-0.4 |

**−1 draw call, −80 triangles, +0 programs, +0 targets, +0 attributes.**

The draw call is the same one stage.js paid back this round and it is worth
repeating because it is invisible: **WebGPURenderer draws a two-sided
TRANSPARENT object twice** (back faces, then front faces). This ribbon's winding
follows the sign of the swipe so it must be `DoubleSide`, but every triangle is
either front- or back-facing, so the two passes merely partition it and composite
identically. `forceSinglePass = true` — and the 80 triangles are the trail's own
80, previously counted twice.

⚠ **I am not claiming a JS win.** The five-run spread on `max` is 3.2-7.0 ms for
the *unchanged* r6 build; the two builds are indistinguishable on this metric and
anyone quoting a single `max` from this probe is quoting noise. What I can say is
that the per-station work I added (one `Math.pow(x,2)`, one
`lens.cocPixelsForZ`, four multiplies, over ≤88 stations) does not show up above
that spread. **Nothing in the input path changed at all** — `pointerrawupdate`,
coalesced-event drain, the Catmull-Rom resample and the verbatim newest sample are
byte-identical to r6, so feel rule 1 cannot have regressed.

Fill rate rises: the quad is now sized to contain its own blurred profile
(~12 px cross-section in focus, ~31 px at the CoC ceiling) instead of a flat
~12 px. On the idle stroke that is roughly +6 k transparent fragments against
stage's streak at ~110 k. That is what the change cost.

---

## 6. WHAT I DID NOT DO, AND WHY

* **I did not couple the depth excursion to the stroke's ARC LENGTH,** and it is
  the single best next move. The physics is clean — a swing of radius R through a
  lateral distance L recedes by L²/2R, so a short slow drag should recede far less
  than a full-frame flick, which is exactly the "morphology is a function of
  stroke speed" the bar asks for. I stopped because **I could not make it
  aspect-invariant in the time available**: the natural formulation puts the world
  arc length ∝ `focus`, while `cocOf`'s slab is absolute, so the same finger
  gesture would defocus ~2.2x harder in portrait. The version that works is
  arc length measured in **short-side** units (`arc_ndcY · halfH/halfShort`) with
  an absolute reference, and every harness stroke is full-width so it clamps to 1
  and **changes nothing I can measure**. Adding an unmeasurable behaviour change
  at the end of a round is how rounds are lost. Named, sized, and handed on.
* **I did not touch the specular's hue** (`1.00, 0.965, 0.90`). Stage's
  luma-vs-clipping insight (a saturated amber at R=255 carries luma ~157 and
  cannot trip `pct_blown_gt250`) would buy a further drop on that metric for
  free — and it would be cheating, because a steel specular reflecting a warm key
  is very nearly neutral and plate-01's own blade is the one thing in that plate
  that legitimately reaches luma 250. The clipping here had to come off the lens,
  and it did.
* **I did not reduce the hot-loop allocation** (`new THREE.Vector2` x2 per pointer
  sample in the `'swipe'` emit). It is real — 480 objects/sec at 240 Hz raw
  input — but the payload is a contract consumed by `slicer.js`, which I may not
  edit, and pooling it would break any consumer that retains the reference.
  `slicer.js`'s `onSwipe` reads `sw.a`/`sw.b` synchronously and would be safe
  today; that is a two-file change and belongs to an integrator.
* **I did not change `TRAIL_LIFE`, the taper, the resample, the speed→width law,
  the blending, `depthTest`, or `renderOrder`.** All four feel rules are intact,
  and the taper now also gates the defocus margin (`tp`) so the quad still
  collapses to a point at the tip instead of ending in a blurred stub.

## 7. Reproducing all of it

    node .build-stagecheck.mjs             # -> /tmp/zsv/index.html  (NOT dist/)
    node .r7blade.mjs diag                 # per-beat drawCount / depth flags / wpx
    node .r7blade.mjs solo r7f             # beats + the trail rendered alone
    node .r7blade.mjs draws                # draw calls, triangles, cpu x5
    node .r7blade.mjs port r7f             # 390x844 vs 640x360
    node .r7blade.mjs tiers                # 3-1-3-0-2-3-2-3, leak + error check
    python3 tools/probes.py void shots/r7-blade/r7f-12-idle-blade.png
    python3 tools/probes.py lens shots/r7-blade/r7f-solo-flick.png

    # the A/B baseline (⚠ overwrites src/input/blade.js; restore afterwards)
    cp /tmp/blade-r6-orig.js src/input/blade.js && node .build-stagecheck.mjs
    node .r7blade.mjs solo basef
    cp /tmp/blade-r7f.js src/input/blade.js

All measured on the WebGL2 backend of WebGPURenderer through swiftshader, tier 3.
