# r8 — INTEGRATION

Role: integrator. I edited **no file in `src/`** — nothing needed fixing. `tools/probes.py`
is byte-for-byte unchanged, md5 `d6b2b531421be7b2745370c5c2ac4659`, `PROBE_VERSION` 8,
and I verified the canary rather than asserting it:

```
python3 tools/probes.py clip shots/r5/05-cut+500ms.png
  mask_px 9490   pct_R_ge_255 5.227   probe_version 8
```

Seventh version bump, seventh set of agents, still 9490 / 5.227%. Unbroken.

---

## 0. HEADLINE

| | r7 | **r8** | bar | |
|---|---|---|---|---|
| build | clean | **clean** | — | ✅ |
| backend | webgl2 | **webgl2** | — | ✅ |
| failed beats (desktop / hero / iphone) | 0 | **0 / 0 / 0** | 0 | ✅ |
| page + console errors | 0 | **0** | 0 | ✅ |
| peak draw calls, landscape | 123 | **121** | ≤120 | ❌ **1 over** |
| peak draw calls, **PORTRAIT (shipping)** | 153 | **151** | ≤120 | ❌ **31 OVER** |
| peak triangles, landscape | 217 515 | **214 619** | ≤250k | ✅ |
| peak triangles, portrait | 198 067 | **205 747** | ≤250k | ✅ |
| cpu max, landscape | 7.3 ms | **12.0 ms / 2.4 ms** (two runs) | 2.0 ms | ❌ (but see §3) |
| cpu p95, landscape | 0.3 ms | **0.3 / 0.6 ms** | — | ✅ |
| **appendage contract shades** | NO | **YES — proven at the pixel** | — | ✅ |

Three shoots, all `timeout`-clean, all `failedBeats: 0`, all `errors: []`:
`shots/r8` (desktop, 52 beats, 176 s), `shots/r8` `--hero` (52 beats, hero added),
`shots/r8-iphone` (portrait, 52 beats, 173 s). No run needed a retry; I used 3 of 3
allowed shoot invocations and 0 of them were failures.

Every one of the 17 landscape + 16 portrait PNGs was luminance-audited: none is
black, none is blown. Frame means run 5.9–37.6 (landscape) and 6.1–40.5 (portrait);
`pct>250` never exceeds 0.23% and that peak is `13-load`, which is meant to be bright.

---

## 1. ⚠ THE APPENDAGE CONTRACT LANDED. I LOOKED AT THE PIXELS.

The brief told me not to take either builder's word for it. I did not. Proof image:
`rounds/reports/r8-integration-appendages.png` — top row r7, bottom row r8, same
seed, same beats, pineapple crown from `12-idle-blade` and strawberry calyx from
`11-combo+550ms`.

**Plainly: yes. The crown and the calyx now shade differently from body skin, and
they did not in r7.**

The measurement that makes it airtight — same frame, same pixel boxes, r7 vs r8:

| `12-idle-blade` region | r7 mean RGB | G/R | B/R | **r8 mean RGB** | **G/R** | **B/R** |
|---|---|---|---|---|---|---|
| pineapple BODY `x165–265 y115–195` | 100.7 / 71.2 / 7.8 | 0.707 | 0.078 | **100.7 / 71.2 / 7.8** | **0.707** | **0.078** |
| pineapple CROWN `x300–378 y60–190` | 104.3 / 73.9 / 11.5 | 0.709 | 0.110 | **63.8 / 55.2 / 24.1** | **0.866** | **0.378** |

Read those two rows together, because together they are the whole finding:

1. **The body is bit-identical between rounds** (100.7 / 71.2 / 7.8 to one decimal,
   n≈7000 px). So nothing global moved — no exposure shift, no lighting change is
   confounding this.
2. **The crown moved and only the crown moved.** r7's crown was
   `G/R 0.709, B/R 0.110` — statistically indistinguishable from body skin
   (0.707 / 0.078). It *was* body skin: extruded diamond-eye pineapple rind shaped
   like a leaf. r8's crown is `G/R 0.866, B/R 0.378` — 40% darker, 22% greener,
   3.4× more blue. That is a leaf: a cooler, matter, less-saturated dielectric with
   a different specular roll-off.

The strawberry is the more legible half of the image. In r7 the calyx sepals are
**red spikes** — the same skin, the same achene speckles running up onto them. In r8
they are **dark green**, matte, and the achene pattern stops at the shoulder where
the body ends. Sampling straddles the boundary so the ratio is diluted, but it moves
the right way: calyx G/R **0.443 → 0.608** against a body that barely moves
(0.228 → 0.256). The picture is the evidence here, not the number.

Code-side, the contract is a real consumer, not a coincidence:
`src/fruit/geometry.js:550` documents the `uv.y > 1.0` encoding and names its consumer
by line; `src/fruit/species.js:1771 appendage()` implements
`leafy = smoothstep(1.020, 1.120, uv.y)`, `wood = smoothstep(1.680, 1.755, uv.y)`,
`green = smoothstep(1.260, 1.600, uv.y)`. The cut path is safe: `cutter.js:998/1062`
writes `uv.y` exactly 1.0 on cap and collar, which is the zero end of the `leafy`
ramp, so a sliced fruit's cut face cannot pick up foliage shading. **Three rounds of
both-files-look-correct-alone is over.**

---

## 2. ⚠ DRAW CALLS: WE ARE OVER. LOUDLY. AND WE NOW KNOW EXACTLY WHY.

**Landscape 121 against a bar of 120. Portrait — the shipping configuration —
151 against a bar of 120. That is 31 over, and it is the number that matters.**

But the shape of the failure is completely different from what round 7's brief
assumed, and this round produced the proof. The r8 stage owner derived
(`rounds/reports/r8-stage.md` §3.2):

    peakDrawCalls  =  13  +  2 × liveBodies

I can now confirm it holds on **three fresh integrated captures it was not fitted to**:

| capture | liveBodies | predicted | **measured** |
|---|---|---|---|
| `shots/r8/report.json` desktop | 54 | 121 | **121** ✅ |
| `shots/r8/report-hero.json` desktop+hero | 50 | 113 | **113** ✅ |
| `shots/r8-iphone/report.json` PORTRAIT | 69 | 151 | **151** ✅ |

Exact, to the call, at three body counts, two aspect ratios, two tiers. Slope 2.00,
intercept 13.

### Who spent what — reconciled against the measured total

Every builder claimed +0 draw calls. **Every one of them is telling the truth**, and
the integrated measurement is the audit:

| builder | file | claimed Δcalls | claimed Δtris | integrated verdict |
|---|---|---|---|---|
| stage | `render/stage.js` | +0 | +0 | ✅ fixed cost still **13** (9 post + 4 scene) |
| materials | `fruit/species.js` | +0 | +0 | ✅ 6 species × 2 materials unchanged; `clearcoatNode` folded into skins that already declared clearcoat, so no new program variant |
| juice | `juice/fluid.js` | +0 | +0 | ✅ still 2 pooled draws (drops + sheet) |
| blade | `input/blade.js` | +0 | **−32** | ✅ |
| geo | `fruit/geometry.js` | +0 | negative at every tier | ✅ |
| **director / spawn cap** | `play/director.js` | *not this round's assignment* | — | ❌ **this is the entire overage** |

Landscape went **123 → 121** and portrait **153 → 151** — both down by exactly 2,
i.e. exactly one fewer live body, which is spawn RNG, not anyone's edit. The fixed
13 did not move. The per-body 2 did not move. **Five builders added quality this
round and the draw-call cost of all five combined is zero.** The r7 brief's framing —
"five builders each added structure and only one owned the budget" — turns out to be
wrong: nobody was adding structure. The body count was.

### What to retire, concretely

The only lever that gets portrait under 120 is `liveBodies ≤ 53` (13 + 2×53 = 119).
Portrait carries **69–70 concurrent bodies against landscape's 54–55 for the same
beat sheet** — the director spawns ~27% more when the frame is portrait, which is
backwards: the narrow frame is the one that can show fewer. Nothing in either
reference plate needs 70 simultaneous bodies; plate-01 has one hero fruit and debris.
**This is a `src/play/director.js` spawn-cap change, ~one clamp, and it is worth 30+
draw calls for zero visual cost.** It is not a renderer change and it is not any of
this round's five files. It should be r9's first assignment.

Second lever, if the cap is not enough: find out why a body costs **2** draws and not
1. Nobody has identified the second submission. If it is the two-sided-transparent
doubling that `forceSinglePass = true` repaid in r7, portrait drops to 83.

### Triangles — not the binding constraint

Landscape **217 515 → 214 619 (−2 896)**, 14% under the 250k bar.
Portrait **198 067 → 205 747 (+7 680)**, 18% under. The portrait rise is a different
species mix at the peak frame (69 bodies vs 70 — fewer bodies, more triangles), not a
per-mesh regression; geo measured negative tris at every tier and blade measured −32.
No action.

`programs` reads 0 in the harness — it does not instrument the program cache, so the
≤40 shader-program bar is **unverified this round**. Worth a harness fix; materials
reports +0 material variants, which is the best evidence we have.

---

## 3. CPU: THE 12 ms IS AN OUTLIER, NOT A REGRESSION

| run | median | p95 | max |
|---|---|---|---|
| r7 desktop | 0.1 | 0.3 | 7.3 |
| **r8 desktop** | **0.1** | **0.3** | **12.0** |
| **r8 desktop (hero run, same build)** | **0.1** | **0.6** | **2.4** |
| r7 iphone | 0.1 | 0.3 | 12.6 |
| **r8 iphone** | **0.1** | **0.7** | **9.4** |

Two runs of the *identical build* on the *identical device* gave max **12.0** and
**2.4**. The `max` column of this instrument is a single-frame statistic over 400
frames and it is measuring GC/JIT, not our work: median is 0.1 ms and p95 is
0.3–0.7 ms, both far under the 2.0 ms bar, and they are stable. **Do not read
7.3 → 12.0 as a regression; read it as one sampled hitch.** Portrait improved
12.6 → 9.4 on the same statistic, which is the same noise pointing the other way.

The honest reading: **p95 is the number to gate on and it passes with 3× headroom.**
If we want `max` to mean something, the harness needs to report the frame index and
run the probe twice. Note also that the cpu probe calls `ZS.step(1/120, 1, false)`,
which never renders — so it is measuring simulation JS only, and none of `stage.js`
is even in its path.

---

## 4. WHAT ELSE MOVED — FROZEN SUITE, r7 → r8

Full verbatim outputs of `python3 tools/probes.py suite shots/r8` and
`... shots/r7` are in the returned JSON and were run at PROBE_VERSION 8 with an
unmodified `probes.py`. Deltas worth naming:

**The ribbon stopped being a flat-topped blob (stage + blade, jointly).**

| `filament:00-hero` | r7 | **r8** | plate-01 |
|---|---|---|---|
| `flattop_p50` | 0.409 | **0.222** | 0.300 |
| `flattop_p90` | 0.548 | **0.429** | 0.500 |
| `mask_px` | 162 569 | 201 335 | — |

r7's ribbon had seven consecutive stations at flattop 0.48–0.58 with fwhm 29–33 px —
a clipped slab. r8 has none above 0.5 and fwhm 3–28. It overshot slightly *past* the
plate (0.222 vs 0.300) in the integrated tree; the stage owner's isolated rig measured
0.300–0.309, so the extra sharpening is blade's edge geometry landing on top of
stage's aperture lobe. **This is the one place where two builders' fixes compounded.**
It is the right direction and a small overshoot; r9 could back off ~1/3 of one of them.

**Ribbon intensity is no longer a bar of soap.** `lens:00-hero` ribbon
`peak_max/peak_min` **5.19 → 1.65** (plate 1.49); `edge_max_over_min` 4.36 → 3.43.
The 46 vs 238 peak spread in r7 is gone.

**Blown-highlight count fell everywhere.** `void:12-idle-blade pct_blown_gt250`
0.0226 → **0.0161**; `clip:05 pct_R_ge_255` 2.319 → **1.781**;
`ring:05 pct_R_ge_255` 3.69 → **1.28**; `collar:05 pct_R_ge_255` 42.78 → **36.11**;
`foam:05 pct_R_ge_255` 4.109 → **3.453**. The flesh got *brighter* while clipping
*less*: `foam flesh_mean_rgb` R 131.0 → **150.6**, `flesh_GR` 0.4409 → **0.4184**
(plate 0.3530). That is the headroom contract doing exactly what §8 of the r7 stage
report said it would.

**Cut-face illumination evened out.** `collar ridge_max_over_min` **3.815 → 1.422**
(plate 1.322) with 12/12 sectors populated — r7 had two sectors at luma 59/63 against
226, a dead quadrant. This is the single biggest single-number improvement in the suite.

**Droplets got less like perfect ellipses.** `droplets:04 median_iou_to_ellipse`
0.8462 → **0.7994**, `pct_iou_ge_090` 28.21 → **25.0**, `area_p95_over_median`
3.72 → 2.66. Plate-01 sits at 0.8228 IoU — we crossed it and are now marginally
*less* elliptical than the reference. Fine.

**The tint law holds and strengthened.** `tintlaw:12-idle-blade sat_size_slope`
−0.104 → **−0.238**; `16-slow-cleave` −0.137 → **−0.014** (weakened);
`15-fast-flick` +0.048 → **+0.017** (the wrong sign, but now near zero). Fast-flick
`sat_blob_mean` 0.103 → 0.098 — mist reads achromatic. **Morphology-vs-speed is
visibly correct in the frames**: `15-fast-flick` is a fine achromatic aerosol cone,
`16-slow-cleave` is fat pink sheets and fingers. That is R1b's core requirement and
it is met.

**Void floor held.** `void:01-whole-watermelon corner_max` 2.94 → **2.90**,
`median_luma` 3.0, `pct_exact_black` 0.0. One caution: `void:12-idle-blade
corner_max` **19.74 → 32.94**. That corner is where the blade ribbon exits frame —
it is a highlight, not background — but it is now 3× over the `#0a0a12` guidance and
somebody should confirm it stays a ribbon and not a bloom skirt.

**Silhouette unchanged**: `frame_height_pct` 40.28 → 40.56, `boundary_cv` 0.0996 →
0.0989, `max_protrusion_pct` 17.68 → 18.49. Watermelon still dominates 40% of frame
height, well over the 25% floor. No visible facets in any frame I read.

---

## 5. RUNTIME

Zero fixes were required. `node build.mjs` produced `dist/index.html 1141 KB` on the
first attempt with no diagnostics. No raw `ShaderMaterial` slipped in — I checked
every frame for the flat-shaded signature that three's silent substitution produces,
and every fruit shades with full specular and clearcoat response. No console errors,
no page errors, `failedBeats: 0` on all three shoots, `timedOut: false` on all three.

Slowest beat is `shot:13-load` at 48–89 s, which is the harness's synthetic
complexity probe, not the game.

---

## 6. WHAT R9 SHOULD DO FIRST

1. **`src/play/director.js`: cap concurrent bodies at 53, and stop spawning *more* in
   portrait than in landscape.** Worth 31 draw calls. It is the only bar we fail.
2. Find the second per-body draw call. Worth another 34.
3. Fix the harness to report `programs` — the ≤40 shader bar is currently unverified.
4. Back off ~1/3 of the ribbon sharpening; stage and blade compounded past the plate.

---

## APPENDIX A — `python3 tools/probes.py suite shots/r8` (VERBATIM)

```json
{
 "probe_version": 8,
 "dir": "shots/r8",
 "results": {
  "clip:05-cut+500ms.png": {
   "mask_px": 10723,
   "ellipse": {
    "cx": 339.5964308950646,
    "cy": 234.28120643182453,
    "a": 96.81475432553874,
    "b": 61.41456935413093
   },
   "scale": 0.55,
   "pct_R_ge_255": 1.781,
   "pct_any_ge_255": 1.781,
   "mean_rgb": [
    115.0,
    57.4,
    30.5
   ],
   "GR_ratio": 0.4995,
   "darkest5pct_luma": 14.33
  },
  "ring:05-cut+500ms.png": {
   "mask_px": 5001,
   "sector_luma": [
    24.0,
    56.0,
    89.7,
    38.5,
    13.9,
    82.5,
    63.1,
    28.0,
    30.2
   ],
   "max_over_min": 6.448,
   "pct_R_ge_255": 1.28
  },
  "clip:08-citrus-caps.png": {
   "mask_px": 4791,
   "ellipse": {
    "cx": 303.43531957090056,
    "cy": 186.6561795727035,
    "a": 182.06729732551878,
    "b": 10.079116745832696
   },
   "scale": 0.55,
   "pct_R_ge_255": 0.459,
   "pct_any_ge_255": 0.459,
   "mean_rgb": [
    79.7,
    43.1,
    9.0
   ],
   "GR_ratio": 0.5413,
   "darkest5pct_luma": 19.1
  },
  "void:12-idle-blade.png": {
   "mask_px": 230400,
   "corners": [
    2.91,
    2.88,
    32.94,
    2.83
   ],
   "corner_max": 32.94,
   "median_luma": 3.0,
   "pct_blown_gt250": 0.0161,
   "pct_exact_black": 0.0
  },
  "void:01-whole-watermelon.png": {
   "mask_px": 230400,
   "corners": [
    2.9,
    2.86,
    2.86,
    2.81
   ],
   "corner_max": 2.9,
   "median_luma": 3.0,
   "pct_blown_gt250": 0.0091,
   "pct_exact_black": 0.0
  },
  "silhouette:01-whole-watermelon.png": {
   "mask_px": 12622,
   "bbox": [
    115,
    146
   ],
   "aspect": 0.7877,
   "frame_height_pct": 40.56,
   "boundary_cv": 0.0989,
   "max_protrusion_pct": 18.49
  },
  "droplets:04-cut+250ms.png": {
   "mask_px": 2397,
   "n_blobs": 40,
   "median_iou_to_ellipse": 0.7994,
   "pct_iou_ge_090": 25.0,
   "pct_boxfill_ge_078": 12.5,
   "median_area_px": 35.0,
   "area_p95_over_median": 2.66
  },
  "particles:15-fast-flick+50ms.png": {
   "mask_px": 3240,
   "n_blobs": 94,
   "median_blob_area": 5.0,
   "pct_blobs_ge_16px": 18.09,
   "mean_saturation": 0.7485,
   "pct_pixels_sat_ge_045": 85.34
  },
  "particles:16-slow-cleave+50ms.png": {
   "mask_px": 4137,
   "n_blobs": 74,
   "median_blob_area": 8.0,
   "pct_blobs_ge_16px": 36.49,
   "mean_saturation": 0.8191,
   "pct_pixels_sat_ge_045": 97.51
  },
  "tintlaw:15-fast-flick+50ms.png": {
   "mask_px": 471,
   "n_blobs": 79,
   "n_small": 60,
   "n_large": 4,
   "sat_small": 0.1214,
   "sat_large": 0.1385,
   "sat_size_slope": 0.0171,
   "sat_blob_mean": 0.0983,
   "median_blob_area": 4.0
  },
  "tintlaw:16-slow-cleave+50ms.png": {
   "mask_px": 443,
   "n_blobs": 17,
   "n_small": 5,
   "n_large": 7,
   "sat_small": 0.5384,
   "sat_large": 0.5246,
   "sat_size_slope": -0.0138,
   "sat_blob_mean": 0.4463,
   "median_blob_area": 11.0
  },
  "tintlaw:12-idle-blade.png": {
   "mask_px": 2798,
   "n_blobs": 14,
   "n_small": 4,
   "n_large": 6,
   "sat_small": 0.7964,
   "sat_large": 0.5589,
   "sat_size_slope": -0.2375,
   "sat_blob_mean": 0.5783,
   "median_blob_area": 10.5
  },
  "lens:00-hero.png": {
   "mask_px": 148144,
   "shape": [
    1280,
    720
   ],
   "subject": {
    "area_px": 148144,
    "edge_1090_p50": 1.304,
    "rays": 16
   },
   "drops": {
    "n": 151,
    "median_area_px": 23.0,
    "edge_1090_p50": 1.306,
    "edge_1090_p90": 2.09,
    "peak_p50": 84.3,
    "spearman_diam_edge": 0.152,
    "spearman_diam_peak": 0.3301
   },
   "sheet": {
    "n": 46,
    "median_area_px": 386.0,
    "edge_1090_p50": 1.726,
    "edge_1090_p90": 3.384,
    "peak_p50": 170.1,
    "spearman_diam_edge": -0.0642,
    "spearman_diam_peak": 0.2448
   },
   "ribbon": {
    "found": true,
    "angle_deg": 95.0,
    "offset_px": -12.3,
    "span_px": 1282,
    "samples": [
     [
      1208,
      397
     ],
     [
      1066,
      385
     ],
     [
      924,
      372
     ],
     [
      782,
      360
     ],
     [
      640,
      348
     ],
     [
      498,
      335
     ],
     [
      356,
      323
     ],
     [
      214,
      310
     ],
     [
      72,
      298
     ]
    ],
    "peak": [
     139.6,
     175.0,
     175.3,
     230.2,
     179.4,
     192.3,
     190.2,
     186.4,
     162.5
    ],
    "fwhm": [
     7,
     15,
     16,
     12,
     3,
     23,
     8,
     10,
     12
    ],
    "edge_1090": [
     2.697,
     2.521,
     2.509,
     1.275,
     1.39,
     2.439,
     3.839,
     4.368,
     3.74
    ],
    "peak_min": 139.6,
    "peak_max": 230.2,
    "fwhm_max_over_min": 7.667,
    "edge_max_over_min": 3.426,
    "edge_1090_p50": 2.521
   }
  },
  "lens:12-idle-blade.png": {
   "mask_px": 34493,
   "shape": [
    640,
    360
   ],
   "subject": {
    "area_px": 34493,
    "edge_1090_p50": 1.127,
    "rays": 16
   },
   "drops": {
    "n": 4,
    "median_area_px": 27.0,
    "edge_1090_p50": 0.964,
    "edge_1090_p90": 1.066,
    "peak_p50": 72.2
   },
   "sheet": {
    "n": 1,
    "median_area_px": 2841.0,
    "edge_1090_p50": 1.149,
    "edge_1090_p90": 1.149,
    "peak_p50": 255.0
   },
   "ribbon": {
    "found": true,
    "angle_deg": 59.0,
    "offset_px": -22.2,
    "span_px": 669,
    "samples": [
     [
      543,
      20
     ],
     [
      479,
      58
     ],
     [
      416,
      97
     ],
     [
      352,
      135
     ],
     [
      288,
      173
     ],
     [
      224,
      212
     ],
     [
      160,
      250
     ],
     [
      97,
      288
     ],
     [
      33,
      327
     ]
    ],
    "peak": [
     161.4,
     188.9,
     193.2,
     92.3,
     194.1,
     194.4,
     190.5,
     182.5,
     165.8
    ],
    "fwhm": [
     9,
     14,
     15,
     11,
     6,
     15,
     9,
     9,
     7
    ],
    "edge_1090": [
     2.211,
     2.999,
     3.488,
     1.413,
     1.848,
     1.847,
     4.075,
     4.302,
     2.937
    ],
    "peak_min": 92.3,
    "peak_max": 194.4,
    "fwhm_max_over_min": 2.5,
    "edge_max_over_min": 3.045,
    "edge_1090_p50": 2.937
   }
  },
  "foam:05-cut+500ms.png": {
   "mask_px": 5386,
   "win": "208:300:288:392",
   "scale": 0.8,
   "ellipse": {
    "cx": 50.5937343984024,
    "cy": 48.468422366450326,
    "a": 45.92022537527874,
    "b": 37.372395488161985
   },
   "whitish_cov_pct": 29.76,
   "speck_cov_pct": 17.62,
   "pct_R_ge_255": 3.453,
   "clipped_px": 186,
   "pct_clipped_that_are_whitish": 37.1,
   "whitish_n": 35,
   "whitish_median_area": 2.0,
   "whitish_max_area": 1280,
   "whitish_pct_single_px": 31.4,
   "whitish_area_p95_over_median": 49.35,
   "speck_n": 121,
   "speck_median_area": 2.0,
   "speck_max_area": 186,
   "speck_pct_single_px": 33.1,
   "speck_area_p95_over_median": 11.0,
   "flesh_mean_rgb": [
    150.6,
    63.0,
    45.0
   ],
   "flesh_GR": 0.4184,
   "flesh_n": 3783,
   "whitish_mean_rgb": [
    107.0,
    101.8,
    50.8
   ],
   "pct_lum_le_25": 4.96,
   "med_over_p2": 6.46
  },
  "collar:05-cut+500ms.png": {
   "mask_px": 8012,
   "win": "208:300:288:392",
   "rays": 180,
   "centroid": [
    50.6,
    48.5
   ],
   "sector_ridge_luma": [
    179.5,
    161.3,
    201.9,
    197.9,
    205.7,
    217.7,
    153.1,
    165.5,
    190.0,
    190.2,
    189.3,
    201.3
   ],
   "ridge_max_over_min": 1.422,
   "sectors_populated": "12/12",
   "ridge_width_px_med": 3.51,
   "ridge_width_cv": 0.578,
   "ridge_t_med": 0.477,
   "ridge_t_cv": 0.341,
   "pct_R_ge_255": 36.11
  },
  "filament:00-hero.png": {
   "mask_px": 201335,
   "shape": [
    1280,
    720
   ],
   "found": true,
   "angle_deg": 95.0,
   "span_px": 1282,
   "samples": [
    [
     1253,
     401
    ],
    [
     1202,
     397
    ],
    [
     1151,
     392
    ],
    [
     1100,
     388
    ],
    [
     1049,
     383
    ],
    [
     998,
     379
    ],
    [
     947,
     374
    ],
    [
     896,
     370
    ],
    [
     844,
     366
    ],
    [
     793,
     361
    ],
    [
     742,
     357
    ],
    [
     691,
     352
    ],
    [
     640,
     348
    ],
    [
     589,
     343
    ],
    [
     538,
     339
    ],
    [
     487,
     334
    ],
    [
     436,
     330
    ],
    [
     384,
     325
    ],
    [
     333,
     321
    ],
    [
     282,
     316
    ],
    [
     231,
     312
    ],
    [
     180,
     307
    ],
    [
     129,
     303
    ],
    [
     78,
     298
    ],
    [
     27,
     294
    ]
   ],
   "fwhm": [
    4,
    7,
    10,
    14,
    15,
    16,
    16,
    19,
    5,
    9,
    16,
    4,
    3,
    4,
    27,
    28,
    22,
    17,
    8,
    9,
    9,
    10,
    10,
    11,
    10
   ],
   "flattop": [
    null,
    0.429,
    0.3,
    0.214,
    0.267,
    0.188,
    0.188,
    0.158,
    0.2,
    0.222,
    0.188,
    null,
    null,
    null,
    0.148,
    0.143,
    0.136,
    0.176,
    0.5,
    0.333,
    0.444,
    0.4,
    0.4,
    0.273,
    0.3
   ],
   "n": 21,
   "flattop_p50": 0.222,
   "flattop_p90": 0.429
  }
 }
}
```

## APPENDIX B — `python3 tools/probes.py suite shots/r7` (VERBATIM)

```json
{
 "probe_version": 8,
 "dir": "shots/r7",
 "results": {
  "clip:05-cut+500ms.png": {
   "mask_px": 10305,
   "ellipse": {
    "cx": 333.26553053743993,
    "cy": 235.27014804588947,
    "a": 83.72390165934176,
    "b": 59.54955976144509
   },
   "scale": 0.55,
   "pct_R_ge_255": 2.319,
   "pct_any_ge_255": 2.319,
   "mean_rgb": [
    105.7,
    61.5,
    32.1
   ],
   "GR_ratio": 0.5815,
   "darkest5pct_luma": 13.21
  },
  "ring:05-cut+500ms.png": {
   "mask_px": 5118,
   "sector_luma": [
    18.3,
    53.5,
    95.5,
    108.2,
    70.3,
    60.2,
    28.7,
    33.6
   ],
   "max_over_min": 5.918,
   "pct_R_ge_255": 3.69
  },
  "clip:08-citrus-caps.png": {
   "mask_px": 5063,
   "ellipse": {
    "cx": 295.6061385317296,
    "cy": 187.163417669017,
    "a": 173.81136342210644,
    "b": 10.356966464468865
   },
   "scale": 0.55,
   "pct_R_ge_255": 0.474,
   "pct_any_ge_255": 0.474,
   "mean_rgb": [
    72.8,
    36.7,
    5.7
   ],
   "GR_ratio": 0.5047,
   "darkest5pct_luma": 17.96
  },
  "void:12-idle-blade.png": {
   "mask_px": 230400,
   "corners": [
    2.92,
    2.93,
    19.74,
    2.95
   ],
   "corner_max": 19.74,
   "median_luma": 3.0,
   "pct_blown_gt250": 0.0226,
   "pct_exact_black": 0.0
  },
  "void:01-whole-watermelon.png": {
   "mask_px": 230400,
   "corners": [
    2.9,
    2.91,
    2.91,
    2.94
   ],
   "corner_max": 2.94,
   "median_luma": 3.0,
   "pct_blown_gt250": 0.0087,
   "pct_exact_black": 0.0
  },
  "silhouette:01-whole-watermelon.png": {
   "mask_px": 12685,
   "bbox": [
    115,
    145
   ],
   "aspect": 0.7931,
   "frame_height_pct": 40.28,
   "boundary_cv": 0.0996,
   "max_protrusion_pct": 17.68
  },
  "droplets:04-cut+250ms.png": {
   "mask_px": 2227,
   "n_blobs": 39,
   "median_iou_to_ellipse": 0.8462,
   "pct_iou_ge_090": 28.21,
   "pct_boxfill_ge_078": 10.26,
   "median_area_px": 34.5,
   "area_p95_over_median": 3.72
  },
  "particles:15-fast-flick+50ms.png": {
   "mask_px": 2767,
   "n_blobs": 105,
   "median_blob_area": 4.0,
   "pct_blobs_ge_16px": 15.24,
   "mean_saturation": 0.742,
   "pct_pixels_sat_ge_045": 83.56
  },
  "particles:16-slow-cleave+50ms.png": {
   "mask_px": 3427,
   "n_blobs": 88,
   "median_blob_area": 8.0,
   "pct_blobs_ge_16px": 29.55,
   "mean_saturation": 0.8181,
   "pct_pixels_sat_ge_045": 96.15
  },
  "tintlaw:15-fast-flick+50ms.png": {
   "mask_px": 454,
   "n_blobs": 82,
   "n_small": 63,
   "n_large": 2,
   "sat_small": 0.1213,
   "sat_large": 0.1692,
   "sat_size_slope": 0.0479,
   "sat_blob_mean": 0.1031,
   "median_blob_area": 4.0
  },
  "tintlaw:16-slow-cleave+50ms.png": {
   "mask_px": 401,
   "n_blobs": 18,
   "n_small": 7,
   "n_large": 6,
   "sat_small": 0.6011,
   "sat_large": 0.4644,
   "sat_size_slope": -0.1367,
   "sat_blob_mean": 0.4179,
   "median_blob_area": 7.5
  },
  "tintlaw:12-idle-blade.png": {
   "mask_px": 3050,
   "n_blobs": 8,
   "n_small": 4,
   "n_large": 2,
   "sat_small": 0.8576,
   "sat_large": 0.7538,
   "sat_size_slope": -0.1038,
   "sat_blob_mean": 0.5748,
   "median_blob_area": 5.0
  },
  "lens:00-hero.png": {
   "mask_px": 139005,
   "shape": [
    1280,
    720
   ],
   "subject": {
    "area_px": 139005,
    "edge_1090_p50": 1.732,
    "rays": 16
   },
   "drops": {
    "n": 90,
    "median_area_px": 26.0,
    "edge_1090_p50": 1.38,
    "edge_1090_p90": 2.355,
    "peak_p50": 102.0,
    "spearman_diam_edge": 0.4576,
    "spearman_diam_peak": 0.1249
   },
   "sheet": {
    "n": 22,
    "median_area_px": 336.0,
    "edge_1090_p50": 2.287,
    "edge_1090_p90": 3.459,
    "peak_p50": 143.1,
    "spearman_diam_edge": 0.3958,
    "spearman_diam_peak": 0.083
   },
   "ribbon": {
    "found": true,
    "angle_deg": 95.0,
    "offset_px": -9.3,
    "span_px": 1282,
    "samples": [
     [
      1208,
      400
     ],
     [
      1066,
      388
     ],
     [
      924,
      375
     ],
     [
      782,
      363
     ],
     [
      640,
      351
     ],
     [
      498,
      338
     ],
     [
      356,
      326
     ],
     [
      214,
      313
     ],
     [
      72,
      301
     ]
    ],
    "peak": [
     46.0,
     85.7,
     98.4,
     228.9,
     204.7,
     238.5,
     174.1,
     164.1,
     95.0
    ],
    "fwhm": [
     31,
     32,
     34,
     20,
     12,
     14,
     11,
     9,
     13
    ],
    "edge_1090": [
     2.717,
     2.814,
     3.219,
     1.491,
     1.995,
     1.646,
     1.044,
     4.548,
     4.127
    ],
    "peak_min": 46.0,
    "peak_max": 238.5,
    "fwhm_max_over_min": 3.778,
    "edge_max_over_min": 4.356,
    "edge_1090_p50": 2.717
   }
  },
  "lens:12-idle-blade.png": {
   "mask_px": 34656,
   "shape": [
    640,
    360
   ],
   "subject": {
    "area_px": 34656,
    "edge_1090_p50": 1.319,
    "rays": 16
   },
   "drops": {
    "n": 2,
    "median_area_px": 21.5,
    "edge_1090_p50": 1.066,
    "edge_1090_p90": 1.211,
    "peak_p50": 78.3
   },
   "sheet": {
    "n": 1,
    "median_area_px": 3288.0,
    "edge_1090_p50": 1.229,
    "edge_1090_p90": 1.229,
    "peak_p50": 255.0
   },
   "ribbon": {
    "found": true,
    "angle_deg": 59.0,
    "offset_px": -22.2,
    "span_px": 669,
    "samples": [
     [
      543,
      20
     ],
     [
      479,
      58
     ],
     [
      416,
      97
     ],
     [
      352,
      135
     ],
     [
      288,
      173
     ],
     [
      224,
      212
     ],
     [
      160,
      250
     ],
     [
      97,
      288
     ],
     [
      33,
      327
     ]
    ],
    "peak": [
     62.2,
     117.9,
     134.5,
     167.9,
     192.2,
     163.4,
     177.1,
     170.1,
     110.4
    ],
    "fwhm": [
     17,
     17,
     17,
     1,
     7,
     16,
     4,
     6,
     7
    ],
    "edge_1090": [
     2.166,
     2.906,
     2.838,
     0.897,
     2.378,
     1.38,
     2.41,
     2.293,
     2.259
    ],
    "peak_min": 62.2,
    "peak_max": 192.2,
    "fwhm_max_over_min": 17.0,
    "edge_max_over_min": 3.24,
    "edge_1090_p50": 2.293
   }
  },
  "foam:05-cut+500ms.png": {
   "mask_px": 5452,
   "win": "208:300:288:392",
   "scale": 0.8,
   "ellipse": {
    "cx": 49.943502824858754,
    "cy": 49.95065913370998,
    "a": 45.582518764920025,
    "b": 38.139076557309885
   },
   "whitish_cov_pct": 32.54,
   "speck_cov_pct": 18.97,
   "pct_R_ge_255": 4.109,
   "clipped_px": 224,
   "pct_clipped_that_are_whitish": 55.4,
   "whitish_n": 47,
   "whitish_median_area": 2.0,
   "whitish_max_area": 1406,
   "whitish_pct_single_px": 29.8,
   "whitish_area_p95_over_median": 40.25,
   "speck_n": 107,
   "speck_median_area": 2.0,
   "speck_max_area": 214,
   "speck_pct_single_px": 36.4,
   "speck_area_p95_over_median": 16.4,
   "flesh_mean_rgb": [
    131.0,
    57.8,
    39.5
   ],
   "flesh_GR": 0.4409,
   "flesh_n": 3678,
   "whitish_mean_rgb": [
    112.0,
    107.3,
    54.2
   ],
   "pct_lum_le_25": 6.35,
   "med_over_p2": 7.75
  },
  "collar:05-cut+500ms.png": {
   "mask_px": 7965,
   "win": "208:300:288:392",
   "rays": 180,
   "centroid": [
    49.9,
    50.0
   ],
   "sector_ridge_luma": [
    213.5,
    172.1,
    206.9,
    220.7,
    195.4,
    226.1,
    161.3,
    147.7,
    122.3,
    63.4,
    59.3,
    217.9
   ],
   "ridge_max_over_min": 3.815,
   "sectors_populated": "12/12",
   "ridge_width_px_med": 4.0,
   "ridge_width_cv": 0.648,
   "ridge_t_med": 0.482,
   "ridge_t_cv": 0.335,
   "pct_R_ge_255": 42.78
  },
  "filament:00-hero.png": {
   "mask_px": 162569,
   "shape": [
    1280,
    720
   ],
   "found": true,
   "angle_deg": 95.0,
   "span_px": 1282,
   "samples": [
    [
     1253,
     404
    ],
    [
     1202,
     400
    ],
    [
     1151,
     395
    ],
    [
     1100,
     391
    ],
    [
     1049,
     386
    ],
    [
     998,
     382
    ],
    [
     947,
     377
    ],
    [
     895,
     373
    ],
    [
     844,
     369
    ],
    [
     793,
     364
    ],
    [
     742,
     360
    ],
    [
     691,
     355
    ],
    [
     640,
     351
    ],
    [
     589,
     346
    ],
    [
     538,
     342
    ],
    [
     487,
     337
    ],
    [
     436,
     333
    ],
    [
     384,
     328
    ],
    [
     333,
     324
    ],
    [
     282,
     319
    ],
    [
     231,
     315
    ],
    [
     180,
     310
    ],
    [
     129,
     306
    ],
    [
     78,
     301
    ],
    [
     27,
     297
    ]
   ],
   "fwhm": [
    29,
    31,
    31,
    32,
    32,
    33,
    33,
    1,
    3,
    18,
    8,
    9,
    12,
    2,
    25,
    35,
    22,
    16,
    8,
    8,
    8,
    11,
    11,
    14,
    15
   ],
   "flattop": [
    0.517,
    0.484,
    0.548,
    0.562,
    0.531,
    0.545,
    0.576,
    null,
    null,
    0.444,
    0.375,
    0.111,
    0.167,
    null,
    0.08,
    0.114,
    0.045,
    0.062,
    0.375,
    0.5,
    0.5,
    0.273,
    0.273,
    0.357,
    0.467
   ],
   "n": 22,
   "flattop_p50": 0.409,
   "flattop_p90": 0.548
  }
 }
}
```
