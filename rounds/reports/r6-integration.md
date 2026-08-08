# r6 — INTEGRATION

Build: `node build.mjs` — **clean, first try, no fixes needed.**
Backend: **webgl2** (WebGL2 backend of WebGPURenderer, as specified).
Harness: `tools/shoot.mjs --out shots/r6 --device desktop` run **twice** (second
with `--hero --deadline 850`). **0 failed beats, 0 page errors, 0 console errors,
no watchdog** on both runs. Every one of the 17 PNGs contains fruit; none is
black or white. I read 01, 04, 05, 08, 09, 12, 13, 14, 15, 16 and 00-hero.

All four builders' round-6 changes reached the pixels and are visible in the
frozen numbers. Nothing had to be reverted or minimally patched.

---

## 0. THE THREE-WAY PROBE MERGE IS CLEAN — VERIFIED, NOT ASSUMED

Three builders independently added a probe and bumped `PROBE_VERSION`
(stage `lens` 1→2, juice `tintlaw` 2→3, geometry `species` 3→4). Each verified
their own bump in isolation. Nobody could verify the **merged** file, because it
did not exist until I built the tree. I did:

    python3 tools/probes.py suite shots/r5      # under the MERGED v4
      clip:05-cut+500ms        5.227%  mask 9490
      particles:15-fast        n=67  medArea 4.0   meanSat 0.7982
      particles:16-slow        n=48  medArea 15.5  meanSat 0.8103

identical to the round-6 brief's v1 baseline to every digit. **The merge
invalidated no stored comparison.** `PROBES` and `SUITE` gained entries; no
existing probe's code changed. The only edit I made to `probes.py` is the stale
`PROBE_VERSION = 2` in its module docstring (the constant was already 4) plus a
note recording the merge verification above. No behaviour, no number.

---

## 1. PERFORMANCE — READ THIS SECTION FIRST. THE HEADLINE NUMBER WAS NEVER REAL.

### The report.json number, both runs

| run | peakDrawCalls | liveBodies at peak | peakTriangles | cpu median / p95 / max |
|---|---|---|---|---|
| r5 (brief's baseline) | 129 | 53 | 215606 | 0.1 / 0.5 / **7.7 ms** |
| r6 run 1 (no hero) | **134** | 60 | 231693 | 0.1 / 0.7 / 4.7 ms |
| r6 run 2 (hero) | **88** | 37 | 163957 | 0.0 / 0.5 / 3.4 ms |

**134 and 88 are the same build, thirty minutes apart.** So I am saying the loud
part first, as the brief demands:

> **`peakDrawCalls` as reported by the harness is not a property of the build.
> It is a property of an unseeded `Math.random()`.** `shoot.mjs`'s complexity
> probe randomises both the spawn x and both swipe endpoints, so how many fruit
> the eight swipes actually cut — and therefore how many bodies are alive at the
> three sampled renders — is a fresh draw every run. It has produced 37 / 53 /
> 57 / 60 bodies across rounds while the number derived from it was quoted as a
> fixed budget.

This is the same class of failure `probes.py` was created to end (a critic
headline of "49.3% clipped" that was really a refit mask), and it survived into
the perf axis because the perf axis has no frozen instrument.

### So I built one, and the answer is an exact straight line

`tools/drawprobe.mjs` (new, additive, does not touch `probes.py` or
`PROBE_VERSION`, does not write to `shots/`). It pins `Math.random` to a seeded
LCG in an init script before any game code runs, then measures the renderer
directly. Deterministic; two runs agreed to the call.

    node tools/drawprobe.mjs

    fixed (empty scene)   tier0 8   tier1 14   tier2 14   tier3 14
    perBody (whole fruit) (0,14) (2,18) (4,22) (8,30) (16,46)
    load    (real cuts)   (5,24) (8,30) (15,44) (19,52) (24,62) (24,62) (27,68)
                          (33,80) (46,106) (53,120) (61,136) (64,142) (67,148)

Fourteen points, zero residual:

    drawCalls = 14 + 2 x liveBodies          (r6)
    drawCalls = 23 + 2 x liveBodies          (r5, recovered from 129 @ 53 bodies)

Both harness runs land on it exactly: 14 + 2(60) = **134**. 14 + 2(37) = **88**.
And r5's 23 + 2(53) = **129**.

### What that actually says — and it is good news badly reported

* **stage.js's post-stack saving is REAL and independently confirmed: the fixed
  cost went 23 → 14, exactly the −9 it claimed.** Measured from a different rig,
  a different loop, and a different seed than the one stage used.
* **At any identical scene this build draws 9 fewer calls than r5.** At r5's own
  peak load of 53 bodies, r6 draws **120 — exactly on the bar**, where r5 drew
  129. At r6 run 1's load of 60 bodies, r5's build would have drawn 143.
* The regression 129 → 134 is **entirely** the 53 → 60 body count. Nobody added
  a draw call this round; all four builder reports claiming +0 are correct.

### The bar is still crossed, and the remaining lever is now named and sized

14 + 2·bodies crosses 120 at **54 live bodies**. The fixed cost is 14 and cannot
pay for much more; **the entire budget is the 2 calls per body.** That 2 is a
two-material mesh — group 0 skin, group 1 cut face — and it is worth stating that
a *whole* fruit pays both even though its second group is empty
(`makeFruitGeometry` emits `{start:n, count:0, materialIndex:1}` for every
uncut species, and the measured cost of a whole fruit is still exactly 2 calls).

Merging skin+flesh into one node material with a group-selector would take the
law to `14 + 1·bodies`: **74 calls at 60 bodies**, and the 120 bar would move
from 53 bodies to 106. That is a >2x headroom change and it is the single
largest perf item left. It is materials/geometry work, not integration, so I did
not do it — I am handing it over sized.

### The 7.7 ms JS max: it is garbage collection, and the allocation is per-fruit

stage.js correctly established that `cpu` never renders (`ZS.step(dt,1,false)`),
so no post-stack change can touch it, and correctly declined to guess further.
`drawprobe.mjs` finishes the job. Across four runs of the identical build the max
came back **3.4 / 4.7 / 11.0 / 15.2 / 24.4 ms**, landing on a plain step with no
spawn, no swipe and no cut as often as on a spawn — i.e. it is a *sample of a
pause*, not a cost of an event. `steps_that_cut` was empty in the seeded runs and
the max appeared anyway. Median 0.1 and p95 0.5–0.7 are rock stable and both pass.

The heap trace shows why: 61.75 → 71 → 84.92 MB, then **84.92 → 53.28 in one
step** — a 32 MB collection. Direct measurement:

    idleAlloc:  empty scene            0 bytes/step        (clean)
                ONE fruit in the air   11646 bytes/step

**~11.6 KB per fruit per simulation step**, against REFERENCE_BAR R4's "zero
steady-state allocation in the hot loop". Six fruit at 120 Hz is ~8 MB/s, which
is a major GC every few seconds, which is the multi-millisecond max. The empty
scene allocates nothing, so the leak is on the per-fruit path (director's
integrate loop, the slicer's per-frame broadphase, or the juice sim's per-fruit
work — I measured the quantity, I did not bisect the owner).

**Round 7: `cpu.max` is not a tuning target, it is a GC symptom. Fixing the
11.6 KB/fruit/step is the fix, and it is worth ~5 ms of worst-case frame time.**

### Triangles, programs, textures

peakTriangles 231693 at 60 bodies against the 250k bar — passes, and per-body it
is *down*: r5 drew 215606 at 53 bodies (4068/body), r6 draws 231693 at 60
(3862/body, −5.1%), consistent with geometry.js's −11.7% claim. `textures` 23 →
18 (stage retired the UnrealBloom mip chain). `renderer.info.programs` reports 0
on this backend and has every round; the ≤40 program bar remains unmeasured by
this harness, which is a real hole for a Safari first-slice hitch.

---

## 2. THE FROZEN SUITE — VERBATIM

### `python3 tools/probes.py suite shots/r6`

```json
{
 "probe_version": 4,
 "dir": "shots/r6",
 "results": {
  "clip:05-cut+500ms.png": {
   "mask_px": 6858,
   "ellipse": {
    "cx": 343.3663003663004,
    "cy": 244.8305177409655,
    "a": 60.601322095440146,
    "b": 38.9440013710398
   },
   "scale": 0.55,
   "pct_R_ge_255": 5.162,
   "pct_any_ge_255": 5.162,
   "mean_rgb": [
    121.0,
    70.2,
    41.4
   ],
   "GR_ratio": 0.5802,
   "darkest5pct_luma": 21.98
  },
  "ring:05-cut+500ms.png": {
   "mask_px": 5031,
   "sector_luma": [
    100.5,
    52.9,
    48.8,
    74.6,
    72.0,
    89.3,
    74.9,
    65.1,
    27.8,
    32.7,
    87.1
   ],
   "max_over_min": 3.619,
   "pct_R_ge_255": 2.07
  },
  "clip:08-citrus-caps.png": {
   "mask_px": 4525,
   "ellipse": {
    "cx": 301.92561105207227,
    "cy": 189.21803046404534,
    "a": 142.71574479644426,
    "b": 10.654872001527162
   },
   "scale": 0.55,
   "pct_R_ge_255": 1.171,
   "pct_any_ge_255": 1.171,
   "mean_rgb": [
    66.1,
    37.5,
    7.6
   ],
   "GR_ratio": 0.5668,
   "darkest5pct_luma": 12.12
  },
  "void:12-idle-blade.png": {
   "mask_px": 230400,
   "corners": [
    2.92,
    2.89,
    4.05,
    2.92
   ],
   "corner_max": 4.05,
   "median_luma": 3.0,
   "pct_blown_gt250": 0.0256,
   "pct_exact_black": 0.0
  },
  "void:01-whole-watermelon.png": {
   "mask_px": 230400,
   "corners": [
    2.9,
    2.91,
    2.91,
    2.93
   ],
   "corner_max": 2.93,
   "median_luma": 3.0,
   "pct_blown_gt250": 0.01,
   "pct_exact_black": 0.0
  },
  "silhouette:01-whole-watermelon.png": {
   "mask_px": 12683,
   "bbox": [
    115,
    146
   ],
   "aspect": 0.7877,
   "frame_height_pct": 40.56,
   "boundary_cv": 0.0993,
   "max_protrusion_pct": 18.13
  },
  "droplets:04-cut+250ms.png": {
   "mask_px": 949,
   "n_blobs": 23,
   "median_iou_to_ellipse": 0.8438,
   "pct_iou_ge_090": 34.78,
   "pct_boxfill_ge_078": 8.7,
   "median_area_px": 22.0,
   "area_p95_over_median": 2.3
  },
  "particles:15-fast-flick+50ms.png": {
   "mask_px": 1905,
   "n_blobs": 174,
   "median_blob_area": 4.0,
   "pct_blobs_ge_16px": 7.47,
   "mean_saturation": 0.6812,
   "pct_pixels_sat_ge_045": 82.89
  },
  "particles:16-slow-cleave+50ms.png": {
   "mask_px": 3909,
   "n_blobs": 154,
   "median_blob_area": 4.0,
   "pct_blobs_ge_16px": 16.23,
   "mean_saturation": 0.8263,
   "pct_pixels_sat_ge_045": 99.49
  },
  "tintlaw:15-fast-flick+50ms.png": {
   "mask_px": 241,
   "n_blobs": 53,
   "n_small": 46,
   "n_large": 2,
   "sat_small": 0.1834,
   "sat_large": 0.0904,
   "sat_size_slope": -0.093,
   "sat_blob_mean": 0.1125,
   "median_blob_area": 3.0
  },
  "tintlaw:16-slow-cleave+50ms.png": {
   "mask_px": 447,
   "n_blobs": 12,
   "n_small": 6,
   "n_large": 4,
   "sat_small": 0.8007,
   "sat_large": 0.6659,
   "sat_size_slope": -0.1348,
   "sat_blob_mean": 0.6869,
   "median_blob_area": 6.5
  },
  "tintlaw:12-idle-blade.png": {
   "mask_px": 3266,
   "n_blobs": 20,
   "n_small": 14,
   "n_large": 2,
   "sat_small": 0.7499,
   "sat_large": 0.5457,
   "sat_size_slope": -0.2042,
   "sat_blob_mean": 0.55,
   "median_blob_area": 3.0
  },
  "lens:00-hero.png": {
   "mask_px": 110721,
   "shape": [
    1280,
    720
   ],
   "subject": {
    "area_px": 110721,
    "edge_1090_p50": 1.196,
    "rays": 16
   },
   "drops": {
    "n": 68,
    "median_area_px": 33.0,
    "edge_1090_p50": 1.277,
    "edge_1090_p90": 2.218,
    "peak_p50": 20.5,
    "spearman_diam_edge": 0.2611,
    "spearman_diam_peak": 0.4695
   },
   "sheet": {
    "n": 15,
    "median_area_px": 415.0,
    "edge_1090_p50": 2.476,
    "edge_1090_p90": 3.282,
    "peak_p50": 178.2,
    "spearman_diam_edge": 0.0964,
    "spearman_diam_peak": -0.0321
   },
   "ribbon": {
    "found": true,
    "angle_deg": 95.0,
    "offset_px": -3.3,
    "span_px": 1282,
    "samples": [
     [
      1208,
      406
     ],
     [
      1066,
      394
     ],
     [
      924,
      382
     ],
     [
      782,
      369
     ],
     [
      640,
      357
     ],
     [
      498,
      344
     ],
     [
      356,
      332
     ],
     [
      214,
      319
     ],
     [
      72,
      307
     ]
    ],
    "peak": [
     56.3,
     114.9,
     132.7,
     138.4,
     213.0,
     125.4,
     107.3,
     84.8,
     32.4
    ],
    "fwhm": [
     31,
     35,
     33,
     37,
     11,
     36,
     33,
     32,
     27
    ],
    "edge_1090": [
     5.097,
     4.241,
     4.847,
     3.871,
     1.645,
     4.513,
     4.861,
     4.758,
     4.421
    ],
    "peak_min": 32.4,
    "peak_max": 213.0,
    "fwhm_max_over_min": 3.364,
    "edge_max_over_min": 3.098,
    "edge_1090_p50": 4.513
   }
  },
  "lens:12-idle-blade.png": {
   "mask_px": 37053,
   "shape": [
    640,
    360
   ],
   "subject": {
    "area_px": 37053,
    "edge_1090_p50": 1.005,
    "rays": 16
   },
   "drops": {
    "n": 5,
    "median_area_px": 19.0,
    "edge_1090_p50": 0.817,
    "edge_1090_p90": 1.306,
    "peak_p50": 175.5
   },
   "sheet": {
    "n": 1,
    "median_area_px": 3426.0,
    "edge_1090_p50": 1.184,
    "edge_1090_p90": 1.184,
    "peak_p50": 255.0
   },
   "ribbon": {
    "found": true,
    "angle_deg": 59.0,
    "offset_px": -5.2,
    "span_px": 694,
    "samples": [
     [
      575,
      21
     ],
     [
      509,
      61
     ],
     [
      442,
      100
     ],
     [
      376,
      140
     ],
     [
      310,
      180
     ],
     [
      244,
      220
     ],
     [
      178,
      260
     ],
     [
      111,
      299
     ],
     [
      45,
      339
     ]
    ],
    "peak": [
     4.0,
     143.9,
     159.7,
     193.0,
     110.5,
     160.8,
     156.9,
     146.6,
     34.7
    ],
    "fwhm": [
     16,
     20,
     24,
     1,
     8,
     25,
     22,
     20,
     16
    ],
    "edge_1090": [
     null,
     5.094,
     4.087,
     1.219,
     1.112,
     3.315,
     4.842,
     4.548,
     4.731
    ],
    "peak_min": 4.0,
    "peak_max": 193.0,
    "fwhm_max_over_min": 25.0,
    "edge_max_over_min": 4.581,
    "edge_1090_p50": 4.317
   }
  }
 }
}
```

### `python3 tools/probes.py suite shots/r5`

```json
{
 "probe_version": 4,
 "dir": "shots/r5",
 "results": {
  "clip:05-cut+500ms.png": {
   "mask_px": 9490,
   "ellipse": {
    "cx": 341.18281036834924,
    "cy": 253.26116614271308,
    "a": 61.66159182970587,
    "b": 55.94877834387586
   },
   "scale": 0.55,
   "pct_R_ge_255": 5.227,
   "pct_any_ge_255": 5.227,
   "mean_rgb": [
    114.9,
    75.8,
    47.4
   ],
   "GR_ratio": 0.6599,
   "darkest5pct_luma": 12.76
  },
  "ring:05-cut+500ms.png": {
   "mask_px": 3763,
   "sector_luma": [
    45.5,
    48.2,
    55.4,
    37.9,
    80.0,
    68.5,
    23.9,
    24.5,
    52.1
   ],
   "max_over_min": 3.354,
   "pct_R_ge_255": 1.01
  },
  "clip:08-citrus-caps.png": {
   "mask_px": 2104,
   "ellipse": {
    "cx": 235.18411188004615,
    "cy": 290.51571510957325,
    "a": 29.449441713411925,
    "b": 22.78954135236275
   },
   "scale": 0.55,
   "pct_R_ge_255": 1.711,
   "pct_any_ge_255": 1.711,
   "mean_rgb": [
    156.4,
    89.4,
    16.0
   ],
   "GR_ratio": 0.5713,
   "darkest5pct_luma": 51.03
  },
  "void:12-idle-blade.png": {
   "mask_px": 230400,
   "corners": [
    2.91,
    8.24,
    15.13,
    2.83
   ],
   "corner_max": 15.13,
   "median_luma": 4.0,
   "pct_blown_gt250": 0.145,
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
   "pct_blown_gt250": 0.0156,
   "pct_exact_black": 0.0
  },
  "silhouette:01-whole-watermelon.png": {
   "mask_px": 12139,
   "bbox": [
    116,
    148
   ],
   "aspect": 0.7838,
   "frame_height_pct": 41.11,
   "boundary_cv": 0.1333,
   "max_protrusion_pct": 28.38
  },
  "droplets:04-cut+250ms.png": {
   "mask_px": 945,
   "n_blobs": 17,
   "median_iou_to_ellipse": 0.9157,
   "pct_iou_ge_090": 52.94,
   "pct_boxfill_ge_078": 11.76,
   "median_area_px": 30.0,
   "area_p95_over_median": 3.4
  },
  "particles:15-fast-flick+50ms.png": {
   "mask_px": 7450,
   "n_blobs": 67,
   "median_blob_area": 4.0,
   "pct_blobs_ge_16px": 13.43,
   "mean_saturation": 0.7982,
   "pct_pixels_sat_ge_045": 96.7
  },
  "particles:16-slow-cleave+50ms.png": {
   "mask_px": 8577,
   "n_blobs": 48,
   "median_blob_area": 15.5,
   "pct_blobs_ge_16px": 50.0,
   "mean_saturation": 0.8103,
   "pct_pixels_sat_ge_045": 99.0
  },
  "tintlaw:15-fast-flick+50ms.png": {
   "mask_px": 307,
   "n_blobs": 67,
   "n_small": 56,
   "n_large": 1,
   "sat_small": 0.2486,
   "sat_large": 0.1723,
   "sat_size_slope": -0.0763,
   "sat_blob_mean": 0.1879,
   "median_blob_area": 3.0
  },
  "tintlaw:16-slow-cleave+50ms.png": {
   "mask_px": 372,
   "n_blobs": 17,
   "n_small": 8,
   "n_large": 7,
   "sat_small": 0.6624,
   "sat_large": 0.6002,
   "sat_size_slope": -0.0622,
   "sat_blob_mean": 0.526,
   "median_blob_area": 9.0
  },
  "tintlaw:12-idle-blade.png": {
   "mask_px": 8857,
   "n_blobs": 12,
   "n_small": 8,
   "n_large": 2,
   "sat_small": 0.6801,
   "sat_large": 0.737,
   "sat_size_slope": 0.0569,
   "sat_blob_mean": 0.5974,
   "median_blob_area": 3.5
  },
  "lens:00-hero.png": {
   "mask_px": 120684,
   "shape": [
    1280,
    720
   ],
   "subject": {
    "area_px": 120684,
    "edge_1090_p50": 1.526,
    "rays": 16
   },
   "drops": {
    "n": 67,
    "median_area_px": 21.0,
    "edge_1090_p50": 1.441,
    "edge_1090_p90": 2.255,
    "peak_p50": 109.9,
    "spearman_diam_edge": 0.554,
    "spearman_diam_peak": 0.3437
   },
   "sheet": {
    "n": 25,
    "median_area_px": 296.0,
    "edge_1090_p50": 2.408,
    "edge_1090_p90": 3.782,
    "peak_p50": 173.9,
    "spearman_diam_edge": 0.28,
    "spearman_diam_peak": 0.1562
   },
   "ribbon": {
    "found": true,
    "angle_deg": 95.0,
    "offset_px": -3.3,
    "span_px": 1282,
    "samples": [
     [
      1208,
      406
     ],
     [
      1066,
      394
     ],
     [
      924,
      382
     ],
     [
      782,
      369
     ],
     [
      640,
      357
     ],
     [
      498,
      344
     ],
     [
      356,
      332
     ],
     [
      214,
      319
     ],
     [
      72,
      307
     ]
    ],
    "peak": [
     240.8,
     248.7,
     251.1,
     223.3,
     255.0,
     246.2,
     245.3,
     236.7,
     224.6
    ],
    "fwhm": [
     4,
     4,
     6,
     7,
     20,
     4,
     6,
     4,
     4
    ],
    "edge_1090": [
     2.488,
     2.421,
     2.91,
     1.634,
     4.002,
     2.058,
     1.709,
     2.134,
     2.007
    ],
    "peak_min": 223.3,
    "peak_max": 255.0,
    "fwhm_max_over_min": 5.0,
    "edge_max_over_min": 2.449,
    "edge_1090_p50": 2.134
   }
  },
  "lens:12-idle-blade.png": {
   "mask_px": 36434,
   "shape": [
    640,
    360
   ],
   "subject": {
    "area_px": 36434,
    "edge_1090_p50": 0.985,
    "rays": 16
   },
   "drops": {
    "n": 2,
    "median_area_px": 69.5,
    "edge_1090_p50": 0.958,
    "edge_1090_p90": 1.07,
    "peak_p50": 174.3
   },
   "sheet": {
    "n": 1,
    "median_area_px": 13554.0,
    "edge_1090_p50": 3.838,
    "edge_1090_p90": 3.838,
    "peak_p50": 255.0
   },
   "ribbon": {
    "found": true,
    "angle_deg": 59.0,
    "offset_px": -5.2,
    "span_px": 694,
    "samples": [
     [
      575,
      21
     ],
     [
      509,
      61
     ],
     [
      442,
      100
     ],
     [
      376,
      140
     ],
     [
      310,
      180
     ],
     [
      244,
      220
     ],
     [
      178,
      260
     ],
     [
      111,
      299
     ],
     [
      45,
      339
     ]
    ],
    "peak": [
     231.2,
     249.7,
     254.1,
     137.4,
     107.8,
     253.8,
     251.9,
     242.4,
     206.6
    ],
    "fwhm": [
     2,
     3,
     5,
     3,
     18,
     6,
     3,
     4,
     3
    ],
    "edge_1090": [
     1.46,
     1.943,
     2.771,
     1.0,
     0.817,
     2.049,
     2.412,
     1.659,
     1.312
    ],
    "peak_min": 107.8,
    "peak_max": 254.1,
    "fwhm_max_over_min": 9.0,
    "edge_max_over_min": 3.392,
    "edge_1090_p50": 1.659
   }
  }
 }
}
```

---

## 3. WHAT THE SUITE SAYS, r5 → r6

Every builder's headline landed. Two things went backwards; both are called out.

### Landed

| probe / field | r5 | r6 | owner |
|---|---|---|---|
| `void:12-idle` corner_max | 15.13 | **4.05** | stage |
| `void:12-idle` pct_blown_gt250 | 0.145 | **0.0256** | stage |
| `lens:00-hero` ribbon peak_min | 223.3 | **32.4** | stage |
| `lens:00-hero` ribbon edge_1090_p50 | 2.134 | **4.513** | stage |
| `lens:12-idle` ribbon edge_max_over_min | 3.392 | **4.581** | stage |
| `ring:05` max_over_min (the collar) | 3.354 | **3.619** | materials |
| `clip:05` pct_R_ge_255 | 5.227 | 5.162 | materials (held) |
| `silhouette:01` boundary_cv | 0.1333 | **0.0993** | geometry |
| `silhouette:01` max_protrusion | 28.38% | **18.13%** | geometry |
| `droplets:04` pct_iou_ge_090 | 52.94 | **34.78** (plate-01 = 19.09) | juice |
| `droplets:04` area_p95_over_median | 3.40 | 2.30 | juice |
| `tintlaw:15-fast` sat_blob_mean | 0.1879 | **0.1125** | juice |
| `tintlaw:16-slow` sat_blob_mean | 0.5260 | **0.6869** | juice |
| fast/slow colour separation | 2.80x | **6.11x** | juice |
| `particles` meanSat fast vs slow | 0.798 / 0.810 (1.02x) | **0.681 / 0.826 (1.21x)** | juice+stage |

The brief's "the COLOUR half of the juice speed-split does not work" is now
false on two independent instruments. The fast flick is achromatic (0.11) and the
slow cleave is juice-coloured (0.69); the 12-idle-blade no-juice control sits at
0.55, so the fast frame is 4.9x clear of the control.

### ⚠ WENT BACKWARDS — the SIZE half of the speed split collapsed

    particles:16-slow  median_blob_area  15.5 -> 4.0     (fast is 4.0 -> 4.0)
    particles:16-slow  pct_blobs_ge_16px 50.0 -> 16.23   (fast 13.43 -> 7.47)

The brief's one working axis — "3.9x size separation" — is now **1.00x on the
median** and 2.2x on the fat tail. Two causes, both real, neither anybody's
stated intent:

1. **juice.js added a fine white mist tail under the slow cleave's beads** (its
   own §3, and it is the right change for R1b's heavy tail). Adding ~110 tiny
   grains to a 48-blob population necessarily drags the *median* down. The fat
   end survives but is diluted: 50.0% → 16.2% of blobs ≥16 px.
2. **the `particles` mask changed under it.** stage.js flagged this in advance
   and it is confirmed: `mask_px` fell 7450 → 1905 (fast) and 8577 → 3909 (slow),
   because defocusing the streak grew the merged "fruit body" component the probe
   subtracts. r6 run 1 and run 2 agree (1908/1905, 3876/3909), so this is the
   stage change, not noise.

**For the round-7 juice critic: do not read this as "the spray got uniform".**
`median_blob_area` over an unweighted blob population is not a size-distribution
statistic once the population's *count* triples. The honest speed-split size
number is the fat tail (`pct_blobs_ge_16px`, 7.47 vs 16.23) or `droplets`'
`area_p95_over_median`. If the size split matters, it needs a probe that reports
a distribution, not a median — that is the fourth measurement-layer defect this
project has found, and it is the only one still open.

### ⚠ `clip:08-citrus-caps` has degenerated and should not be quoted

Its mask went 2104 → 4525 px with the ellipse at a=142.8, b=10.0 — an aspect of
14:1. The `clip` mask is the second-moment ellipse of the largest luma component;
on 08 that component is now the **defocused streak**, not the citrus cap. The
probe is measuring the blade glow. `clip:05` is unaffected (a=60.7, b=39.1, a
real cut face) and remains the sanctioned clipping number. Somebody should give
`clip` a component-eccentricity guard; I did not, because touching a frozen
probe's code mid-round is exactly what the rules forbid.

---

## 4. THE FRAMES

- **14-hud** is the best frame this project has produced. Wet cut face with
  specular across the whole area, black irregular seeds, white pith band, green
  rind, radial fibre, and a bright wet rim at the flesh/rind boundary. It reads
  as the plate's material.
- **00-hero** now shows two halves with genuine rotational separation, layered
  rind, and a droplet field that is red beads plus white specks — the tint law is
  visible by eye. r5's flat pink cardboard "sheet" ribbons are gone.
- **15-fast-flick** is white mist; **16-slow-cleave** is red beads. The speed
  split is legible without a probe.
- **Silhouettes are now sortable.** The orange is a sphere, the kiwi a capsule,
  the strawberry a cone with a serrated cap, the pineapple crowned. r5's "same
  lumpy ball five times" is fixed.
- ⚠ **13-load and 09-combo show the blade trail as a featureless white lens-shaped
  blob crossing the frame.** REFERENCE_BAR lists "blade trail blowing out into a
  featureless white blob" as an auto-fail. `blade.js` is the one module nobody
  edited this round and it is now the worst element in the set.
- ⚠ **The streak is a wide flat tan band with no hot core.** stage's own numbers
  are met (peak_min 32.4, edge ratio 3.1x) but plate-01's streak is amber *with a
  white filament*; ours is now a soft bar. stage names the one-line fix it
  deliberately did not ship (a third wide low-amplitude haze lobe so the core can
  come back up without the whole band brightening). I agree with its priority.
- ⚠ **The kiwi reads as a smooth tan rock.** New proportion is right; the surface
  has no fuzz and no colour break, so it is the one species that got worse to look
  at while getting better to measure.

---

## 5. WHAT I CHANGED

1. `tools/probes.py` — module docstring only: the stale `PROBE_VERSION = 2`
   header, plus the merge-verification note in §0. **No code, no probe, no
   number, no version bump.**
2. `tools/drawprobe.mjs` — new file, additive, not a probes.py probe (it measures
   the renderer, not a PNG). Seeded deterministic draw-call, per-body, CPU-spike
   and allocation accounting. This is what a perf number should be quoted from
   until `shoot.mjs`'s complexity probe is seeded.
3. Nothing in `src/`. The build was clean, there were no runtime errors, and any
   render change I made at integration time would have confounded four builders'
   measurements in the round they are about to be judged on.

## 6. FOR ROUND 7, RANKED

1. **`shoot.mjs`'s complexity and cpu probes must be seeded.** Both call
   `Math.random()` inside the loop. They have produced a 46-draw-call and a
   21-millisecond spread on identical builds. Every perf argument in rounds 4, 5
   and 6 was made against samples from that noise.
2. **One material per fruit.** `14 + 1·bodies` instead of `14 + 2·bodies` doubles
   the body headroom at the 120-call bar, from 53 to 106.
3. **11.6 KB/fruit/step.** That is the 7.7 ms max, and it is the only route to
   the 2.0 ms bar.
4. **blade.js.** It is the untouched module, it owns an auto-fail item, and it is
   the last hard-edged element in a frame that is now otherwise properly lensed.
5. **A size-DISTRIBUTION probe for the spray**, because `median_blob_area` is not
   one and it just gave a false regression signal on the one axis the brief said
   was working.
