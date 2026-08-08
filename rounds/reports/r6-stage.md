# r6 — stage.js (exposure contract, the lens, the frame budget)

FILE TOUCHED: `src/render/stage.js` (mine) and `tools/probes.py` (added one probe,
bumped PROBE_VERSION — see the loud notice below). Nothing else.

---

## 0. LOUD NOTICE — PROBE_VERSION 1 -> 2

I added `lens` to `tools/probes.py` and bumped `PROBE_VERSION` to 2 as the rules
require. **No existing probe's code changed by one character.** I verified that
rather than asserting it: `python3 tools/probes.py suite shots/r5` under v2
reproduces every stored v1 number exactly —

    clip:05-cut+500ms   5.227%  mask 9490      (brief says 5.227%, mask 9490)  ✓
    particles:15-fast   n=67 medArea 4.0 meanSat 0.7982 (brief: 67 / 4.0 / .798) ✓
    particles:16-slow   n=48 medArea 15.5 meanSat 0.8103 (brief: 48 / 15.5 / .810) ✓

So the bump is bookkeeping, not an invalidation. Every v1 number in an earlier
verdict remains comparable.

**Why `lens` had to exist.** Round 5's headline stage defect — "the lens is
per-object, the ribbon and the sheet take CoC 0" — was not measurable by
anything in the suite, so the r3, r4 and r5 critics each hand-rolled their own
blob/edge detector for it. That is exactly the failure this file exists to end.
`lens` measures ONE quantity for EVERY class in one frame: the 10-90 edge width
of its boundary, slope-normalised, `0.8*(peak-base)/max|grad|`. Masks are
geometric — largest luma component for the subject, connected components split
by AREA for drops vs sheet/strand, a **Radon ridge** for the blade/streak ribbon
— and never keyed on the colour of the thing being judged.

It lands on the predecessor critic's scale. On `shots/r5/00-hero.png` it returns
ribbon FWHM `[4,4,6,7,20,4,6,4,4]` and peak `[241..255]` where the r5 critic
measured FWHM `4/5/55/5/4` and peak `224-255` at their own x positions, and
subject edge 1.526 against their 1.55. Independent reimplementation, same answer.

I also added a **caveat block (docstring only, no code, no number changed)** to
`probe_particles`. See §5 — it matters to the juice builder.

---

## 1. TASK A — the lens now applies to the frame, not to a list of opt-ins

### The diagnosis, stated as arithmetic rather than as policy

The post DOF gather reads the depth buffer. Therefore **the only way a pixel can
be exempt from the lens is to carry no depth.** `depthWrite:false` over the void
inherits the far plane, `cocOf` clamps that to zero, and the fragment comes out
razor sharp at any radius. Round 5 closed the hole for billboards by making each
sprite defocus itself (`api.lens.sprite`) — that worked, and in working it
proved the *structure* wrong: the very next thing that had not opted in (my own
streak) rendered as a hard 4-px bar in a frame where a droplet 20 px away was a
20-px ghost. There is no post-only fix, because post cannot recover a depth that
was never written.

So the fix is not another opt-in. It is: **the streak stops being a decal and
becomes a real object in the depth buffer.**

    streakMat.depthWrite = true;     // one boolean, this is the whole change

Cost: **zero.** No pass, no target, no draw call, no program, no uniform. The
frame's own gather now owns it at the same CoC as everything else at that depth,
computed by the same `cocOf`, and it cannot opt out again by construction.

Safe because of where it sits: the plane is the farthest thing in the scene
(z = -6 against a playfield of z ∈ [-2,+2] and a camera at +10.2), it draws first
among transparents (renderOrder -1), and depth TEST was already on. The only
objects a depth write at 16.2 m could reject are transparents drawn later and
*farther*, and there are none.

### Two bugs the depth write immediately exposed, both real, both fixed

**(a) The streak was 2.4x longer than the frame, so its taper was never on
screen.** The r5 critic read "FWHM 4/5/55/5/4, peak 224-255, dead constant from
x=60 to x=1220" as a missing taper. A taper was authored. The plane was 52 world
units long at z = -6 where the frustum is ~22 units wide, so 58% of it —
*including both tapered ends* — was permanently off-frame; and the taper was
applied to `fWarm` only, while the `fCore` filament you actually see was
modulated by the hot-spot gaussian alone, which has a `+0.28` floor. Across the
visible span the core went 0.92 -> 0.80. Hence: a bar.
Fixed: `ends` is applied to the core, and the length is now **measured off the
live frustum** in `api.resize` instead of hard-coded. A hard-coded length cannot
work — see (b).

**(b) `voidDist` was a constant and is a function of the camera.** `main.js`
dollies the camera to fit the stage box, so a portrait phone sits at camZ 22.0
where landscape desktop sits at 10.16. The shipped constant 26.0 is correct in
landscape (streak at 16.2) and **wrong in portrait, where the streak lands at
28.0 — past the clamp.** Measured before the fix at 390x844: the streak rendered
a razor line again. On the one configuration this game actually ships in, the
whole of task A would have bought nothing. `voidDist` is now
`(camZ - STREAK_Z) + 10`, which is 26.16 in landscape (the shipped value to
within 0.6%, so nothing measured in landscape moves) and 38.0 in portrait.

**(c) also fixed: the CoC was normalised on frame HEIGHT.** A 390x844 phone got
a 25.7-texel CoC across a 390-px-wide frame — the bokeh disc is 6.6% of the
frame's width where the identical scene in landscape is 3.4%. The lens got twice
as strong when you turned the phone, and the 24-tap Vogel disc was visibly
undersampled across it. Now normalised on the **short side**:
`min(w,h)*dpr/360`. Identical in landscape — `min(1280,720)` is 720 — so every
number ever measured on this project is unchanged.

### `api.lens.line(halfWidthPx, dist)` published, as the r5 verdict asked

`.xy` is the `vec2(grow, energy)` requested; z/w carry plateau and flat so a
caller can reuse a sprite-shaped code path. **Energy is `1/grow`, not
`1/grow²`** — a ribbon spreads across its width only, and using the sprite term
on a ribbon dims it by the square and it vanishes.

My streak does **not** use it (it writes depth instead; using both would
double-blur). It is published for **blade.js's trail**, which genuinely cannot
write depth — it is a long additive ribbon that overlaps itself, so depth-writing
it would make its own segments occlude each other. That is the one class for
which per-vertex defocus is the right structure rather than a patch.

The file's builder notes now state the rule in one place: *anything transparent
you draw is exempt from the lens until it writes depth; you have exactly two ways
in — write depth, or defocus yourself at emission; doing neither is the round-5
failure and doing both double-blurs.*

### Measured — `lens 00-hero.png`, PROBE_VERSION 2, same tree, my file toggled

This is a true A/B: I reconstructed the pre-change `stage.js` and shot both
builds from the *current* tree, because geo/materials/juice have all moved since
`shots/r5` and comparing against those PNGs would be comparing four changes.

| | before (r5 stage.js) | after (r6) |
|---|---|---|
| **subject** edge_1090_p50 (in-focus reference) | 1.351 | 1.155 |
| **ribbon** edge_1090_p50 | 1.961 | **4.305** |
| ribbon / subject edge ratio | 1.45x (ribbon SHARPER than the subject) | **3.73x softer** |
| ribbon edge per sample | 2.17 2.16 2.05 1.96 1.27 1.96 2.15 1.83 1.82 | 4.24 4.24 4.79 4.03 1.24 5.28 4.88 4.64 4.31 |
| ribbon FWHM per sample | 4 4 4 5 14 4 4 4 4 | 32 35 33 36 17 35 33 32 27 |
| ribbon peak per sample | 237 246 250 250 230 247 242 231 205 | 56 112 130 133 242 123 104 83 32 |
| **ribbon peak_min** | 205.2 | **31.5** |
| ribbon edge_max_over_min | 1.704 | **4.271** |
| drops spearman(diam, peak) | +0.425 | (hero) +0.622 / (idle) **-0.352** |
| sheet spearman(diam, peak) | -0.415 | -0.421 |

The r5 verdict set two explicit numeric gates on this ribbon. Both are met:

* *"the 10-90 edge of the ribbon cross-section must vary by more than 3x"* —
  `edge_max_over_min` **1.704 -> 4.271** (and 5.36 on 12-idle-blade).
* *"its peak luminance must fall below 200 somewhere in the frame (today
  224-255 everywhere)"* — `peak_min` **205.2 -> 31.5**, and 8 of the 9 sample
  positions are under 200. The one that is not (242) is the frame centre, where
  the profile crosses the melon's own lit cut face.

`void 12-idle-blade`: `pct_blown_gt250` **0.4735% -> 0.0734%** (6.4x less
clipping) with `corner_max` unchanged at 2.92 and `mask_px` unchanged at 230400.
On the harness's exact `stage-idle` recipe, corner_max 4.32.

### What is still sharp, and it is not mine

The one hard-edged element left in every frame is a thin white needle that
passes *through* the fruit and extends past the streak — **blade.js's trail**,
drawn at `api.focusDistance`, still `depthWrite:false` and still not calling
`api.lens.line()`. It is visible in the hero, in 09-combo, in 15-fast-flick and
in portrait. It has been flagged in r3, r4 and r5. The API it needs now exists,
takes two lines at the call site, and costs nothing.

---

## 2. TASK B — the frame budget: -9 draw calls, and where the JS max really is

### Draw calls: 129 -> 120

**Retired `bloom()` from three/addons.** BloomNode is an UnrealBloom port: a
full-res high-pass into a bright target, then FIVE mip levels each blurred
separably (h + v), then an upsample composite. Measured on my own empty-scene
probe (tier 3, 1280x720, `renderer.info.render.drawCalls`):

| | before | after |
|---|---|---|
| empty tier-3 frame, total | 23 | **14** |
| of which POST CHAIN (total − scene drawables) | **19** | **10** |
| tier-0 frame (no DOF, no bloom) | 8 | 8 |
| my loaded complexity probe, peak | 35 | **26** |

Turning the tier down to LOW drops DOF *and* bloom and takes 23 -> 8; DOF's
pyramid + gather is 3 of that 15. **So bloom was ~11-12 draw calls** — roughly a
tenth of the entire 129-call peak budget — spent on an effect this project
deliberately keeps tiny (strength 0.32, radius 0.16, threshold 1.35: "only
pixels that would already clip to white glow at all").

Replaced by a **three-pass tent pyramid**: `g0` at 1/2 (4 bilinear taps, each
high-passed *before* the average, so 1-px specular pips survive and are
antialiased at the same time), `g1` at 1/4, `g2` at 1/8, all four-tap tents of
the level above, composited by three bilinear fetches in the existing output
node. Same dual-filter construction modern engines use; smoother per unit cost
than UnrealBloom, not rougher.

**The saving is a fixed post-stack cost, independent of scene load**, so it
carries straight through: **peakDrawCalls 129 -> 120, exactly on the bar.** That
is on the bar and not under it, so: the next -1 is available by dropping `g2`
(the 1/8 glow level) and the next -1 after that by dropping it only on
non-ULTRA. I did not spend either, because the harness reports at tier 3 and I
would rather hand the integrator the margin knob than a slightly worse halo.

Calibration back onto the shipped look (off-streak highlight statistics on the
hero, so the streak change cannot pollute them): `%lum>60` 1.415 -> 1.390,
`%lum>150` 0.1661 -> 0.1464, `lum p99.9` 165.2 -> 162.7, mean 5.72 -> 5.53.
`strength/radius/threshold` are unchanged at 0.32 / 0.16 / 1.35, and
`api.bloom.threshold.value` still reads 1.35 for every other module — I kept
the object shape deliberately.

Tier flipping 3→1→3→0→2→3→2→3 with a live flare each time: no console errors,
`renderer.info.memory.textures` returns to 18 every time (no leak), tier 0
drops to 6.

### The 7.7 ms JS max is not in the post stack, and cannot be

`tools/shoot.mjs` line 276 measures the `cpu` metric with

    ZS.step(1 / 120, 1, false);          // doRender = false

`false` skips `stage.render` entirely. **The cpu probe never renders.** So
median 0.1 / p95 0.5 / max 7.7 ms is pure simulation cost, and no change to the
post stack — mine or anyone's — can move it by a microsecond. Whoever owns that
7.7 ms spike should look in the fixed-step sim path (my money is on the first
slice's allocation, since it is a max and not a p95, and the bar calls a
first-slice hitch disqualifying). I am saying this loudly because the round-6
brief lists it under my task and it is not in my file.

---

## 3. TASK C — the exposure contract is HELD

Not one lighting number moved. Exposure 1.28, env 1.31, key 3.40 @ (8.2,7.4,6.2),
rim 5.00, fill 1.90, tone mapping Neutral — all as v5 shipped. The contract block
now carries a "ROUND 6: HELD" section stating that and naming the two things
that *did* move and are routinely mistaken for exposure:

* **the streak's own flux**, `U.fI` 3.9 -> 9.75. That is an additive effect's
  brightness, not a light and not the exposure: it is not in the E table and no
  material solves against it. It moved because a defocused source needs more
  flux to reach the same peak — a 22-texel gather spreads this filament over ~7x
  its old cross-section. Strict flux conservation asks for ~7x; 2.5x is the
  deliberate compromise that keeps it a streak instead of a wash. Its frozen-probe
  check went the safe way: `void 12-idle-blade` blown 0.4735% -> 0.0734%.
* **bloom -> the tent pyramid**, calibrated as above.

The streak's colour balance also moved (core weight 1.75 -> 1.40, warm sheath
0.18 -> 0.72) for a reason that is specific to defocus: blur *mixes the lobes*,
the white core carried 8x the weight of the warm sheath, and the defocused result
came out grey. plate-01's streak is amber with a white core. 4x the warm weight
and 0.8x the white gets that; 8x goes too far and it reads as a flat tan bar
(I rendered all three).

For completeness, `clip 05-cut+500ms` on my own A/B moved 4.574% -> 2.346%
R>=255 — **but the mask changed, 10276 -> 12319 px, so I am not claiming that.**
The `clip` mask is the second-moment ellipse of the largest luma component, and
the streak merges with the melon, so changing the streak changes the mask. The
direction is right and the cause is real (less bloom on the face, no blown bar
laid across it), but materials owns that axis and should re-measure it.

---

## 4. What I did NOT do, and why

* **I did not add a haze lobe to the streak's cross-section.** The defocused
  streak is a flat-topped soft band; plate-01's has a bright core plus a wide
  halo. A third wide low-amplitude lobe (`exp(-30y²)` at ~0.03) would give that,
  and it is ~50x less energy than round 1's catastrophic `exp(-7y²)` at 0.20 on
  a 7.5-unit plane. I still did not ship it: round 1 scored 16/100 on exactly
  that failure mode, I have already made several coupled changes this round, and
  I would rather hand round 7 a named, sized, one-line candidate than risk it
  blind. This is the single best remaining move on the streak.
* **I did not touch the juice sheet.** It is fluid.js. The r5 verdict asked me
  to "retract SS B4.6" and give the sheet a per-vertex lens term — the retraction
  is done (the builder note now says the exemption does not exist), but the code
  is not mine to write. `api.lens.line()` is the right call for a strip; the
  sheet's own local half-width is the `r0`.
* **I did not chase the corner-to-corner swipe case.** A swipe aimed into a
  corner puts the streak's dim end there: `void` corner_max 16.98 on that
  contrived frame, against the bar's ~10.6 for #0a0a12. The bar exempts
  highlights and this is a light source; plate-01's own streak runs off the frame
  edge. The harness's actual `stage-idle` frame measures 4.32.

## 5. ⚠ FOR THE JUICE BUILDER AND THE JUICE CRITIC — a measurement contamination

`probe_particles` masks out "the fruit body" as `largest_component(L > 0.06)`.
On a frame with a live blade flare that component is **not** only the fruit: the
stage streak touches the fruit and merges with it, so the streak's pixels — and
any mist sitting on the streak — are excluded as "body". Defocusing the streak
grew that merged component. On an **otherwise identical fluid.js**:

    particles 15-fast-flick   mask_px 9637 -> 1792   mean_saturation 0.7806 -> 0.6554
    particles 16-slow-cleave  mask_px 12360 -> 10429 mean_saturation 0.8185 -> 0.8386

**Do not read the fast-flick saturation drop as a juice regression. It is mine.**
16-slow-cleave is far less exposed (its flare is weaker), so the fast-vs-slow
SPLIT is still meaningful; the absolute saturation on a flare frame is not
comparable across a stage change. I have written this caveat into
`probe_particles`'s docstring — docstring only, no code, no stored number
affected.

---

## 6. Reproducing all of it

    node .build-stagecheck.mjs          # -> /tmp/zsv/index.html  (NOT dist/)
    node .r6rig.mjs draws               # draw-call accounting, empty + loaded
    node .r6rig.mjs shots r6            # hero 1280x720 + five beats at 640x360
    node .aspect.mjs                    # landscape vs 390x844 portrait
    node .tiers.mjs                     # tier flips, leak + error check
    python3 tools/probes.py lens /tmp/zsv/r6-00-hero.png
    python3 tools/probes.py suite /tmp/sr

    # the A/B baseline (⚠ overwrites src/render/stage.js; restore afterwards)
    python3 .mkbase.py && node .build-stagecheck.mjs && node .r6rig.mjs shots base
    cp /tmp/stage-r6.js src/render/stage.js

Everything above was measured on the WebGL2 backend of WebGPURenderer through
swiftshader, tier 3, with zero page errors and zero console errors.
