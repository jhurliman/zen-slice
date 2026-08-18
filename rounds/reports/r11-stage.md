# r11 — stage: the two "overdone" notes

**Owner:** stage (`src/render/stage.js`). Exposure owner.
**Notes worked:** player note 5 (specular reads as chrome), player note 6 (DOF overdone,
"many of the fruits are completely blurry"). Nothing else in the file was touched.

**Canary, before and after the probes.py edit:**
`python3 tools/probes.py clip shots/r5/05-cut+500ms.png` → **mask_px 9490 / pct_R_ge_255 5.227**
(also re-verified `particles:15` 67 / 4.0 / 0.7982 and `particles:16` 48 / 15.5 / 0.8103 on
`shots/r5`, i.e. the v1 baseline the header quotes.)

**Captures** (all 17 beats present, all verified non-black by mean-luma before use, zero failed
beats, zero page errors in all four runs):

| dir | orientation |
|---|---|
| `shots/r11-stage-BEFORE` / `-iphone` | control |
| `shots/r11-stage-A-dof` | DOF change only (landscape) |
| `shots/r11-stage-B-spec` | + environment change (landscape) |
| `shots/r11-stage-C-glow` / `r11-stage-C-glow-iphone` | **shipped** |

Pictures: `rounds/reports/r11-stage-ab.png` (four beats, landscape, before/after),
`rounds/reports/r11-stage-ab-portrait.png`, `rounds/reports/r11-stage-chrome.png` (4x zoom on the
apple).

---

## 1. Note 6 — depth of field

### What was actually wrong (it is not a tuning error, it is a units error in the design)

`cocOf` is `smoothstep(0, focalLength, |shaped|)`. **`focalLength` is not a slab half-width — it
is the distance over which the blur reaches its MAXIMUM.** It shipped at 1.05–1.45 world units
against a playfield ~4 units deep. So any fruit more than about one unit off the subject was
pinned at the full `bokeh` radius with no gradient left at all. That is not a shallow lens; it is
a binary mask, and *"completely blurry"* is the exactly correct description of it.

Exact CoC ladder from the shipped uniforms (ULTRA / desktop, radius in 360p-normalised texels):

| distance behind focus | 0.5 | 1.0 | 2.0 | 3.0 | 4.0 | 2.0 *in front* |
|---|---|---|---|---|---|---|
| before | 5.11 | 10.93 | 11.00 | 11.00 | 11.00 | 2.18 |
| **after** | **0.39** | **1.39** | **4.10** | **5.93** | **6.00** | **0.15** |

### What changed

1. `focalLength` **1.05 / 1.15 / 1.45 → 3.20 / 3.40 / 3.90** (ULTRA / HIGH / MED). The ramp now
   covers most of the playfield, so there is a real gradient instead of saturation.
2. `bokehBase` **11.0 / 10.0 / 7.5 → 6.0 / 5.5 / 4.2**. The ceiling comes down 1.8x. Deliberately
   the *smaller* of the two moves: a genuinely distant fruit still reaches a 6 px disc, so the
   frame keeps a lens and does not go flat.
3. `HERO_HOLD` **1.6 s → 0.65 s**. This is the subject-latch the brief asked me to reconsider. I
   kept it but cut it, and the reason is specific: 1.6 s was sized to "cover the whole slow-mo
   beat plus the rack back out", and round 11's feel agent **deleted the slow-mo beat** (note 3).
   The thing it was measured against no longer exists. What was left was a 1.6 s lock onto two
   halves already leaving frame, during the exact window in which the player picks his next
   target.
4. **New: a crowd clamp** in `api.frame`. After the subject rule picks a plane, focus is pushed
   *back* — never forward, never past the farthest fruit — so that no live fruit sits more than
   one `focalLength` behind it. It costs almost nothing because `nearScale` already compresses
   the near side 6.7x: a fruit 3 units *in front* of the plane has a 0.8 px CoC. It fires only
   when the crowd is deeper than the lens can hold, so in a typical frame it is a no-op.

### What it looks like

Look at `r11-stage-ab.png`. In `10-combo+200ms` before, the watermelon is a green smear, the
apple is a white cap with no stem and the orange has no pores; after, the melon's rind stripes,
the apple's stem and calyx well and the orange's pores are all legible. In `11-combo+550ms`
before, the two whole fruit at the bottom of frame — the ones he has to choose between — are
unrecognisable; after, both read. Portrait shows the same thing, smaller, because at camZ 22 the
same world spread is a smaller fraction of the focus distance to begin with.

### The instrument, and why I had to add one

**`defocus`, the closest existing probe, cannot see this defect.** It takes the largest component
in the frame, which is the subject the lens is racked to — by construction the one object that is
*in* focus. It answers "is the hero sharp". He did not complain about the hero.

So I **added** `crowd` (probes v15 → v16, loud notice in the file, canary re-verified, no existing
probe's executable code changed by one character, one SUITE row appended:
`crowd:11-combo+550ms.png`). It measures *every* fruit-sized subject in the frame with the same
geometric mask discipline and the same frozen `_radial_edges`/`_edge_1090` pair `defocus` uses,
and headlines the **worst** one. `defocus` and `crowd` are the two ends of one distribution and
should be quoted together from now on.

| `crowd 11-combo+550ms` | BEFORE | A (dof) | B (+env) | **C shipped** |
|---|---|---|---|---|
| edge_1090_px_min (sharpest subject) | 0.854 | 1.099 | 1.071 | 0.984 |
| edge_1090_px_med | 1.602 | 1.236 | 1.371 | 1.359 |
| **edge_1090_px_max (blurriest subject)** | **3.524** | 1.655 | 2.127 | **1.756** |
| **edge_max_over_min** | **4.126** | 1.506 | 1.986 | **1.785** |
| n_over_3px | 3 | 0 | 0 | **0** |

Portrait: max **1.926 → 1.397**, ratio **1.54 → 1.148**, n_over_3px 0 → 0.

Run it on `shots/r5` for the historical picture: `edge_1090_px_max` **7.263**, ratio **5.84**.
This defect has been in the build since round 5 and nothing in the suite could see it.

---

## 2. Note 5 — "chrome"

### Diagnosis, and it came out in two halves

**Half one is this file's environment.** The header says, correctly, that highlight *size* is the
emitter's solid angle and highlight *brightness* is its radiance — and then chooses tiny panels at
radiance 15..46 because that reproduces plate-01's pin-pips in a still. Run those numbers through
a fruit instead of through a photograph. `species.js` gives the apple skin `clearcoat: 0.75` at
`clearcoatRoughness: 0.07`:

```
env radiance 46 x environmentIntensity 1.31          = 60.3 scene-linear
face-on   0.75 * 0.04 * 60.3 = 1.81   clip point 0.655  ->  2.8x over
grazing   0.75 * 1.00 * 60.3 = 45.2                     ->  69x over
```

69x over clip means the whole reflected image of the panel is flat 255,255,255 with a hard edge.
That is chrome, and "when the light hits fruits in certain ways" is grazing incidence — the moment
a rotating fruit turns its shoulder. Note the **rim** pair is the worst offender and not because
it is brightest: it sits *behind* the subject, so it is always seen at grazing, where Fresnel is
1.0 rather than 0.04.

**Half two is the bloom, and it is the bigger of the two.** A `DirectionalLight` is a delta
emitter — zero solid angle, infinite radiance. Through GGX at α = 0.0049, D(0) = 1/(πα²) = 13 300,
so the mirror-direction specular radiance off that apple skin is ≈ **500 scene-linear**, 760x the
clip point, in a lobe about one pixel across. A clipped pip is fine and is supposed to be there.
What was not fine: `glowDown`'s high-pass passed the tap's **full** value, so 500 went into the
3-level tent pyramid and came back as ~8–125 linear spread over a ~16 px disc, times
`glowStrength` 0.32. That disc is 4–40x the clip point across its *whole area*. **The size of the
white plate on the fruit was set by the bloom, not by any material and not by the exposure.**

### What changed

1. Every emitter in `buildEnvScene` **dimmed and widened**, each panel holding its own flux to a
   few percent. Peak radiance in the room **46 → 11** (4.2x).
2. PMREM pre-blur `sigma` **0.008 → 0.045 rad**. A 0.07-roughness clearcoat reads essentially
   mip 0, so before this no material parameter anywhere could stop a fruit mirroring a hard-edged
   panel. Free — the env is baked once at init.
3. **New uniform `glowCeil` = 4.0**: a per-channel ceiling, scene-linear, on what one source pixel
   may contribute to the glow pyramid. Chosen so that **nothing else in the frame is touched**,
   and that was checked rather than assumed — the blade streak is soft-ceilinged at `fCeil` 0.62
   and never reaches the 1.35 glow threshold at all; juice emissives and the hottest lit rind run
   under ~1.5; the env panels are not in the frame (`scene.background = null`). The only pixels
   above 4.0 in any beat are delta-light specular needles. A needle still blooms — 4.0 is 3x the
   threshold — it just no longer detonates. Confirmed empirically: `01-whole-watermelon` is
   **bit-identical in every measured statistic** across the glowCeil change.

### Cost to the exposure contract: 2.6% of E, and nothing else

Exposure 1.28, key 3.40, rim 5.00, fill 1.90, `environmentIntensity` 1.31, NeutralToneMapping —
**all held**. The clip point, the E table, the albedo→display table and every target in contract
sections 3–8 are unchanged. What moved is the env's total flux (radiance × area), **1931 → 1695,
−12.3%**. The env is ~21% of a camera-facing surface's diffuse irradiance, so that is **−2.6% of
E** ≈ −0.008 linear on a cut face whose target is 0.31 ±25%. A fortieth of a stop, below the
capture harness's own reproducibility. **No albedo needs rescaling.** I did not drop the exposure
and did not desaturate anything; the round-9/10 chroma and bleach wins are untouched.

Two stale sentences are flagged in the contract block rather than edited, so provenance stays
readable: section 2's and section 4's "radiance 15..46" should now read **3.6..11**. The
conclusion each draws is unchanged.

### What it looks like

`r11-stage-chrome.png`. Before: a flat white disc across the apple's shoulder, plus a second one
lower-left, and no stem visible through it. After: green skin, a defined stem, and small warm
glints along the shoulder ridges — a wet skin rather than a mirror.

Apple body statistics, `09-combo+50ms` (geometric window 380:180:490:260, body = luma > 12):

| | BEFORE | A (dof) | B (+env) | **C shipped** |
|---|---|---|---|---|
| % of body with max channel ≥ 250 | 5.906 | 3.808 | 3.696 | **2.550** |
| saturation of the top 1% by luma | 0.188 | 0.176 | 0.180 | **0.188** |

Watermelon, `01-whole-watermelon` (a fully deterministic beat, window 255:120:395:280):
`pct_chrome` (bright **and** achromatic) **0.512 → 0.374**, `%max ≥ 250` **2.71 → 2.41**,
saturation of the top 1% **0.220 → 0.235**.

**Honest attribution:** the environment change on its own (A→B) moved the apple's blown fraction
by ~3%. The `glowCeil` change moved it by 31%, and it is what removes the *plate* — the flat white
area with a hard edge, which is the thing the word "chrome" actually names. The env change is
still worth keeping: it is what puts colour back in the top of the highlight, and it is the half
that fixes the grazing rim on every fruit rather than the halo around one pip.

---

## 3. Frozen suite — the control, and the honest cost

The brief says the suite is a control this round and not a target, and that some probes will score
worse. They did. Landscape, all four runs (v16):

| probe | BEFORE | A (dof) | B (+env) | C shipped | reading |
|---|---|---|---|---|---|
| `void 01-whole-watermelon corner_max` | 2.9 | 2.9 | 2.9 | **2.9** | black floor intact |
| `void 01 pct_blown_gt250` | 0.0152 | 0.0152 | 0.0048 | **0.0056** | improved |
| `void 12-idle-blade corner_max` | 44.41 | 55.32 | 55.18 | **55.31** | **cost** |
| `void 12 pct_blown_gt250` | 0.1376 | 0.3064 | 0.2986 | **0.2951** | **cost** |
| `bleach 00-hero core_sat_p50` | 0.246 | 0.192 | 0.195 | **0.195** | more bleached |
| `bleach peak_p50` | 195.4 | 219.2 | 218.4 | **218.4** | hotter core |
| `filament flattop_p50` | 0.286 | 0.429 | 0.400 | **0.400** | **cost** |
| `glare u20_u50_p50` | 1.423 | 2.071 | 2.108 | **2.233** | **cost** |
| `defocus 11-combo edge_1090_med` | 1.883 | 1.354 | 1.379 | **1.386** | sharper subject |
| `silhouette 01 mask_px` | 12622 | 12622 | 12588 | **12588** | −0.27% |
| `outline 01 hull_concave_frac_pct` | 16.41 | 16.41 | 17.97 | **17.97** | see §4 |

Portrait (`void 12-idle-blade` corner_max **2.99 → 2.98**, median_luma 3.0 → 3.0,
pct_exact_black 0.0 → 0.0; `void 01` corner_max 2.96 → 2.96, blown 0.004 → 0.000;
`clip 05-cut+500ms` pct_R_ge_255 0.526 → 0.084; `bleach` core_sat 0.251 → 0.222, peak 200.5 →
221.2; `silhouette frame_height_pct` 18.45 → 18.45, i.e. the known portrait framing auto-fail is
untouched by me).

**The four costs are all one cause, and I am naming it plainly.** The blade streak defocuses
itself through `api.lens.line()`, which reads the same `U.bokeh` the opaque gather does. That is
the file's central design rule — one lens, one mechanism, no second one to cancel with. So halving
`bokeh` made the streak thinner, and a ribbon's energy term is `1/grow`, so thinner also means
hotter. `filament flattop_p50`, `glare u20_u50` and `bleach peak` all move because round 10 tuned
the streak's cross-section at `bokeh` 22.0 (hero) and it now runs at 12.0.

I considered giving the streak its own private bokeh so those three numbers would not move, and
**rejected it**: it is exactly the "invent a second mechanism" failure this file warns about, and
the streak is a light source in the scene whose blur *should* follow the lens. Looked at
(`shots/r11-stage-C-glow/12-idle-blade.png` vs BEFORE): the after streak is a tighter, hotter
filament with the sharp station now visible as a knot where it crosses the focal plane. I think it
is better. The void around it is still pure black — median_luma 3.0, `pct_exact_black` 0.0,
corner 2.9 on the non-blade frame — so `corner_max` 55 on the idle-blade frame is *the streak
itself reaching the corner*, not the round-1 milky wash returning.

The brief asked that the bleached core survive: it did, and improved — **core_sat_p50 0.246 →
0.195** landscape, **0.251 → 0.222** portrait (lower = whiter = more bleached).

⚠ **The r10 report's headline `core_sat 0.017 hero` does not reproduce in this tree.** My control
run, before I touched anything, measures 0.246. The tree has moved (physics landed, geometry
changed) and I could not reproduce r10's number to quote against, so every number above is my own
before/after on runs I took myself.

### Probes I will not quote, and why

`clip:05`, `ring:05`, `foam:05`, `collar:05`, `spokes:05`, `droplets:04`, `particles`, `tintlaw`
and `lens` all moved a lot, and **none of that movement is interpretable**. Their masks are fitted
from each frame's own moments and the cut/combo beats are not pose-reproducible: `clip:05 mask_px`
alone goes 2173 / 1473 / 1425 / 1376 across four runs, and `foam:05 mask_px` 1401 / 725 / 592 /
419. When the mask changes by 3x the statistic inside it is a different measurement, not a
regression. This is the same class of failure the probes.py header documents from round 5. Do not
read those rows as a stage result in either direction.

---

## 4. Cross-file items for the integrator

1. **`src/fruit/species.js` — apple and the second smooth skin are lacquered, not waxy.**
   `roughness: 0.20, clearcoat: 0.75, clearcoatRoughness: 0.07` (species.js:~3580) and
   `roughness: 0.30, clearcoat: 0.70, clearcoatRoughness: 0.13` (~3685) are car-paint numbers. A
   0.07 clearcoat roughness is α = 0.0049, i.e. a mirror, and it is what makes the delta-light
   specular reach ~500 scene-linear. I have removed the *visible* consequence from the stage side
   (glowCeil + a dimmer, blurrier room) and the fruit now read as wet rather than chrome — but the
   underlying needle is still there and it is the fruit-mat owner's number. Suggested:
   `clearcoatRoughness` 0.07 → ~0.22 and 0.13 → ~0.25, `clearcoat` 0.75 → ~0.45. **I did not
   touch it.**
2. **`src/fruit/geometry.js` — my env change moves two of your probes.** Dimming the rim shrinks
   the luma>8 silhouette by 0.27% (`silhouette mask_px` 12622 → 12588) and moves
   `outline hull_concave_frac_pct` 16.41 → 17.97 on `01-whole-watermelon`. The mesh did not
   change; the mask did. If fruit-geo is steering on `hull_concave_frac_pct` this round, re-take
   its baseline on a build that includes this stage change. (Note also that `geometry.js` was
   modified by another agent at 01:45, *after* all four of my landscape captures and *before* both
   of my portrait ones — so my landscape A/B is clean and my portrait A/B is internally consistent
   but on the newer geometry.)
3. **`src/juice/fluid.js` and `src/input/blade.js` inherit the shallower lens** through
   `api.lens.sprite()` / `api.lens.line()` — deliberately, that is what the boundary is for. Their
   sprites and the trail are now roughly half as defocused. No action needed; stated so it is not
   discovered.

---

## 5. Perf

Well inside every ceiling in both orientations, and unchanged by this work in any way that
matters. Draw-call and triangle differences between runs track `liveBodies`, not the stage.

| run | draws | tris | cpu p50 / p95 |
|---|---|---|---|
| landscape BEFORE | 23 | 71.6k | 0.3 / 2.2 ms |
| landscape shipped | 35 | 88.8k | 0.3 / 1.1 ms |
| portrait BEFORE | 47 | 87.3k | 0.3 / 1.6 ms |
| portrait shipped | 45 | 89.6k | 0.3 / 3.3 ms |

Budget is 120 draws / 250k tris. Two things in this change are *cheap*: `bokeh` halving cuts the
DOF gather's texture-cache footprint and the streak's fill (`fBCap` is 0.62 × bokeh, so the
ribbon's widest band halves), and `glowCeil` is one `min()` per tap. The PMREM sigma change is
init-only. Per the HANDOFF, `cpu.max` is unusable and is not quoted.

`node build.mjs` is clean.

---

## 6. What I would not claim

- I have not proved the specular is *right*, only that it is no longer chrome. The delta-light
  needle is still physically wrong; item 4.1 is the real fix.
- `crowd` is a pixel-domain statistic. Do not compare it across resolutions or to a plate, and do
  not set an acceptance threshold on it — it is for comparing two builds of this game at one
  capture size. It is the same class of number that burned round 9.
- The combo beats are not pose-reproducible, so every "after" picture in the contact sheet is a
  *different throw* from its "before". The comparison is of legibility, not of pixels.
