# r7 — integration

**FILES I EDITED: NONE.** The build was clean on the first `node build.mjs`, all
three harness runs finished with `failedBeats: 0` and `errors: []`, and no frame
needed a fix. Everything below is measurement.

**`tools/probes.py` IS BYTE-FOR-BYTE AS THE GEOMETRY BUILDER LEFT IT** —
md5 `2a421795a52b75b26ec9cad2b4d9a910`, `PROBE_VERSION 7`. I added no probe and
changed no probe by one character. I did write three private diagnostics
(`.r7cpu.mjs`, `.r7perfab.mjs`, `.r7draws.mjs`) and one throwaway
(`.hudcheck.mjs`); **they are not probes and none of their numbers are quoted as
suite numbers.** They exist to A/B `perf` and to locate a bug, and each one runs
`tools/shoot.mjs`'s own probe body verbatim so the comparison is apples to apples.

---

## 0. ⚠⚠ THE LOUDEST THING IN THIS REPORT: ROUND 6's PERF WIN WAS LARGELY NOISE, AND I CAN PROVE IT

The brief says to report `peakDrawCalls` and `cpu max` explicitly and to say so
LOUDLY if either got worse. Taken at face value, **both got worse**:

| | shots/r6 (stored) | shots/r7 (stored, hero run) | bar |
|---|---|---|---|
| peakDrawCalls | 88 | **123** | 120 |
| peakTriangles | 163 957 | **217 515** | 250 000 |
| cpu max | 3.4 ms | **7.3 ms** (12.2 ms on the non-hero run) | 2.0 target / 8.3 budget |

`123 > 120`. The portrait run is worse still: **153 calls / 198 067 tris /
cpu max 12.6 ms**. If you stop reading here, the answer is "r7 blew the draw-call
bar".

**That reading is wrong, and the way to show it is to shoot round 6 again.**

I reconstructed the r6 tree from the five originals the builders left behind
(`/tmp/stage-r6-orig.js`, `/tmp/species-r6-baseline.js`, `/tmp/fluid-r6.js`,
`/tmp/geometry-r6-orig.js`, `/tmp/blade-r6-orig.js`), built it, and ran the
**unmodified `tools/shoot.mjs`** against it in this session. Tree kept at
`/tmp/r6tree`, frames at `/tmp/r6tree/tmp/r6shots/`.

| desktop, same harness, same session | peakDrawCalls | peakTriangles | cpu max | liveBodies |
|---|---|---|---|---|
| **r6 rebuilt, shot today** | **128** | **225 109** | **10.0 ms** | 57 |
| r7 run 1 | 107 | 191 751 | 12.2 ms | 47 |
| r7 run 2 (hero) | 123 | 217 515 | 7.3 ms | 55 |
| — stored `shots/r6/report.json` | 88 | 163 957 | 3.4 ms | 37 |

**The r6 build, measured today, is 128 draw calls — worse than either r7 run.**
The stored 88 was a favourable draw of a noisy distribution, and so was 164k, and
so was 3.4 ms. The round-6 headline "129 → 88, 216k → 164k, 7.7 → 3.4 ms" is
mostly the harness moving, not the renderer.

### Why the metric moves: the harness does not control its own load

`shoot.mjs:288` samples `renderer.info.render` during the complexity probe, which
runs immediately after the cpu probe **without a `ZS.clear()`**. The cpu probe
spawns 40 fruit over 3.33 s of virtual time; however many are still alive when
the complexity probe samples is the population the peak is measured on. Across
the four runs above that population was 37 / 47 / 55 / 57, and draw calls track
it at ~2.2 per body with an intercept near 13. The peak is a reading of
`liveBodies`, not of the renderer.

### The controlled measurement, which is the one worth keeping

`.r7draws.mjs` pins the population: clear, spawn exactly N, render, count; then
swipe, render, count. Same build pair, same session, tier 3, 640×360.

| scene | r6 calls | **r7 calls** | r6 tris | **r7 tris** |
|---|---|---|---|---|
| empty | 14 | **13** | 53 289 | 53 351 |
| 4 whole | 22 | **21** | 70 161 | 69 035 |
| 8 whole | 30 | **29** | 88 489 | 86 079 |
| 16 whole | 46 | **45** | 116 537 | 112 291 |
| 16 cut+250 ms | 50 | **49** | 95 725 | 92 235 |
| 24 whole | 62 | **61** | 118 813 | 113 391 |
| 24 cut+250 ms | 82 | **81** | 174 609 | 167 227 |

**r7 is exactly one draw call cheaper than r6 at every single population**, the
slope is identical, and triangles are 2–7 k lower throughout (the geometry
builder's −1560 tris across the species table, confirmed independently by
`probes.py species`: `tris_all_species` 23 212 → **21 652**). The −1 call is
blade.js's, as its report claims; stage.js's ribbon is +0 calls as its report
claims. **Nobody spent a draw call this round and one was paid back.**

So the honest statement is: **per unit of scene, r7 is cheaper than r6 on every
axis.** The bar is nonetheless being *read* as blown, by both builds, because the
harness samples an uncontrolled load. A round 8 that wants this number to mean
something should put one `ZS.clear()` plus a fixed spawn list in front of the
complexity probe. **I did not change `shoot.mjs`** — it is the shared instrument
and changing it mid-round would have invalidated the comparison I just made.

### cpu max is GC, and it does not distinguish the builds

`shoot.mjs`'s cpu probe never renders (`ZS.step(1/120, 1, false)`); it is pure JS.
`.r7cpu.mjs` re-ran it three times per page load and located the worst sample:
the spike indices are scattered (364, 153, 100, 15, 0…) and do not align with the
spawn cadence (`i%10==0`) or the swipe cadence (`i%8==3`). Repeated on the
identical shipped build, `max` came out **35.3, 12.2, 9.2, 8.8, 7.3, 5.0, 4.7,
4.4, 3.5, 3.5** — a 7.5× spread on code that did not change. Pooled `max` over
seven runs each, same session, `.r7perfab.mjs`:

    r6 build   3.0  4.1  5.4  6.0  6.8  7.4  9.3     median 6.0
    r7 build   3.5  3.5  4.4  5.0  6.3  7.2  9.9     median 5.0

`median` is 0.0–0.1 ms and `p95` is 0.2–0.8 ms on both. **The 2.0 ms target is met
at p95 by a factor of three on both builds; `max` is a garbage-collection
histogram and should not be quoted as a delta by anyone, including round 6, which
did.**

---

## 1. BUILD, SHOOT, FRAMES

```
node build.mjs                    ->  dist/index.html 1137 KB, exit 0, first try
node tools/shoot.mjs --out shots/r7 --device desktop            52 beats, 0 failed, 0 errors
node tools/shoot.mjs --out shots/r7 --device desktop --hero     56 beats, 0 failed, 0 errors
node tools/shoot.mjs --out shots/r7-iphone --device iphone      52 beats, 0 failed, 0 errors
```

backend **webgl2** (WebGL2 backend of WebGPURenderer, swiftshader) on all three.
Zero `pageerror`, zero `console.error`, zero module-disable messages, no watchdog.
No `ShaderMaterial not compatible` warning anywhere, so nothing silently
substituted an empty material. `shots/r7/report.json` is the **hero** run (it
overwrote run 1).

I read 01, 04, 05, 07, 08, 09, 12, 13, 14, 15, 16 and the hero. Every one contains
fruit, none is black, none is white. Specifically:

* **00-hero** — melon at ~55% of frame height, halves rotating rather than
  translating, a torn pink film with fingers over the cut, white mist beyond it,
  and the streak visibly narrow-and-sharp at the left end and wide-and-soft at
  the right. The streak is **amber** now, not cream.
* **15-fast-flick / 16-slow-cleave** — the speed law reads at a glance in the
  images, not just in the probe: the flick is a fine white aerosol fan, the
  cleave is red sheet-and-ligament. This is the single clearest visual
  improvement of the round.
* **12-idle-blade / 09-combo** — the pineapple crown is now a spread rosette of
  broad leaves instead of r6's drooping filaments; the strawberry has an apex and
  a calyx.
* **13-load** — blade trail visible, and it now varies in width along its length.

⚠ **One composition regression worth a critic's attention, not a bug.** r6's hero
showed both halves separated with the cut faces presented to camera. r7's hero
shows them nearly touching with the cut plane edge-on and largely covered by the
juice film. The round's biggest material win (the cut face) is therefore not
visible in the frame the material critic will be handed. Nothing is broken; the
beat is `cut+250 ms` in both.

---

## 2. THE FROZEN SUITE — AND A NOISE FLOOR FOR IT

### 2a. PROBE_VERSION 7 REPRODUCES v6's STORED NUMBERS. VERIFIED, NOT ASSUMED.

The geometry builder bumped 6 → 7 and asserted no existing probe changed. I
checked that independently, against numbers **quoted in the r6 verdicts** (which
were produced under v5/v6, before this session existed), by re-running v7 on
`shots/r6`:

| quoted in an r6 verdict | v7 on `shots/r6` today |
|---|---|
| `foam` speck_median_area 2 px, 36.0% single-px, flesh G/R 0.4448 | 2.0, 36.0, 0.4448 ✅ |
| `foam` flesh_mean_rgb R 125.7 | 125.7 ✅ |
| `tintlaw` 16-slow sat_small 0.8007 / sat_large 0.6659 / slope −0.1348 | 0.8007 / 0.6659 / −0.1348 ✅ |
| `lens` ribbon FWHM 27–37 px, edge 3.87–5.10 px | fwhm 31 35 33 37 **11** 36 33 32 27, edge 5.10 4.24 4.85 3.87 **1.65** 4.51 4.86 4.76 4.42 ✅ |

Exact to every digit. **The bump is bookkeeping and every v1–v6 number in an
earlier verdict remains comparable.**

### 2b. A NOISE FLOOR, WHICH THIS SUITE HAS NEVER HAD

The juice builder's report showed the harness is not bit-deterministic. That
raises the obvious question nobody has answered: *how much of an r6→r7 suite
delta is the build?* Because I had a rebuilt r6 tree, I could shoot it and run the
suite on it — **the same code as `shots/r6`, a different session.** That column
(`r6rb`) is the noise floor, and it is tight:

| probe field | `shots/r6` | `r6 rebuilt` (noise floor) | `shots/r7` |
|---|---|---|---|
| clip:05 mask_px | 6858 | 6870 | 10 305 |
| clip:05 pct_R_ge_255 | 5.162 | 5.167 | **2.319** |
| foam:05 flesh_mean_rgb R | 125.7 | 128.2 | **131.0** |
| foam:05 pct_R_ge_255 | 6.78 | 6.804 | **4.109** |
| foam:05 speck_pct_single_px | 36.0 | 35.2 | 36.4 |
| collar:05 pct_R_ge_255 | 62.78 | 68.33 | **42.78** |
| collar:05 ridge_max_over_min | 1.53 | 1.447 | **3.815** |
| ring:05 max_over_min | 3.619 | 3.598 | **5.918** |
| particles:15 n_blobs | 174 | 175 | **105** |
| particles:15 pct_blobs_ge_16px | 7.47 | 7.43 | **15.24** |
| particles:16 median_blob_area | 4.0 | 4.0 | **8.0** |
| tintlaw:15 sat_size_slope | −0.093 | −0.1007 | **+0.0479** |
| tintlaw:16 sat_small | 0.8007 | 0.8264 | **0.6011** |
| droplets:04 n_blobs / median_area | 23 / 22.0 | 22 / 23.0 | **39 / 34.5** |
| void:12 corner_max | 4.05 | 3.98 | **19.74** |
| void:01 corner_max | 2.93 | 2.90 | 2.94 |
| silhouette:01 frame_height_pct | 40.56 | 40.56 | 40.28 |
| lens:12 ribbon.edge_1090_p50 | 4.317 | 4.186 | **2.293** |

**Session-to-session noise on the image probes is 0–8%.** Every bolded r7 delta is
far outside it and is real. The perf counters (§0) are the exception, not the rule
— the pixels are reproducible, the `renderer.info` counters are not.

⚠ One statistic is genuinely unstable and should not be quoted as a delta:
`lens:12-idle-blade ribbon.fwhm_max_over_min` reads **25.0** on `shots/r6` and
**5.0** on the same code re-shot. It is a max/min ratio and one sample of
`fwhm = 1` detonates it. `edge_1090_p50` on the same probe is stable (4.317 vs
4.186) and is the number to use.

### 2c. Full suite output

`python3 tools/probes.py suite shots/r7` and `suite shots/r6`, PROBE_VERSION 7,
saved at `/tmp/suite-r7.json`, `/tmp/suite-r6.json`, `/tmp/suite-r6rebuilt.json`,
`/tmp/suite-r7i.json`. Headline movements, r6 → r7:

**Better**
* `clip:05` pct_R_ge_255 **5.162 → 2.319**; `clip:08` **1.171 → 0.474**;
  `foam:05` **6.78 → 4.109**; `collar:05` **62.78 → 42.78**. The clipping fight is
  won on four independent regions at once. (⚠ `clip:05` mask_px moved 6858 →
  10 305 — the stage owner flagged this: the `clip` mask is the second-moment
  ellipse of the largest luma component and the redesigned streak merges into it.
  The `foam` and `collar` regions are **geometric windows** and did not move
  (5487 → 5452, 8029 → 7965), so read the fix off those two.)
* `lens:00-hero` ribbon `edge_1090_p50` **4.513 → 2.717**, `lens:12` **4.317 →
  2.293**. Both ribbons got sharper by ~40%, toward plate-01's 1.72. Per-sample
  FWHM went from a flat 31 35 33 37 · 36 33 32 27 to **31 32 34 20 12 14 11 9 13** —
  it is a foreshortened object now, not a screen-parallel band.
* `foam:05` flesh_mean_rgb R **125.7 → 131.0** (plate 189.2). Real but small; the
  gap is still the round's largest single number.
* `collar:05` ridge_max_over_min **1.53 → 3.815** and `ring:05` max_over_min
  **3.619 → 5.918** — the cut edge is no longer radially even, which
  REFERENCE_BAR R2.5 explicitly asks for.
* `tintlaw:15-fast-flick` sat_size_slope **−0.093 → +0.0479** — the size-to-tint
  law's sign is **correct for the first time** on the fast case, and the whole
  frame is achromatic (sat_small 0.121, sat_large 0.169) against the slow
  cleave's 0.601 / 0.464. The speed law and the colour law now agree.
* `droplets:04` area_p95_over_median **2.3 → 3.72**, `particles:16`
  median_blob_area **4 → 8** with pct_blobs_ge_16px **16.2 → 29.6** — the heavy
  tail R1b asks for is appearing.
* `species` separation worst **2.55 → 4.06**, median **5.31 → 6.65**, apple
  2.55 → **5.57**, strawberry 2.90 → **4.50**, pineapple 2.77 → **4.06**, on
  **1560 fewer triangles**. The three species the r6 verdict ranked last are the
  three that moved.

**Worse, stated plainly**
* ⚠ **`void:12-idle-blade` corner_max 4.05 → 19.74.** I measured the corners
  directly: three of the four are 2.87–2.93 in both builds (unchanged), and the
  **bottom-left** is mean luma **19.94**, max 107, mean RGB (33.3, 17.5, 4.6) —
  amber. It is the new streak running out of the frame through that corner.
  `#0a0a12` is luma ≈ 10.6, so this trips the bar's "background lighter than
  #0a0a12 **outside a highlight**" line unless the critic accepts that the flare
  itself is the highlight. Cause: r6's streak was a frustum-spanning plane whose
  brightness tapered to nothing before the edge; r7's is a segment clipped to the
  NDC box at ±1.15, so its wide bright end can now reach a corner. `void:01`
  (no flare) is unmoved at 2.93 → 2.94, and `pct_blown_gt250` **improved**
  (0.0256 → 0.0226), so the black floor itself is intact. **This is the one thing
  I would put in front of the stage critic first.**
* `tintlaw:16-slow-cleave` sat_small **0.8007 → 0.6011** and sat_large **0.6659 →
  0.4644**: the slow cleave got *less* juice-coloured, and slope is unchanged at
  −0.1367 (still the wrong sign — fine beads are still the reddest thing in a
  slow cleave). The r6 verdict's headline defect on the slow half is **not
  fixed**; the fast half is.
* `ring:05` sectors 8, 9 and 10 now return `null` (r6 populated all twelve) and
  pct_R_ge_255 rose 2.07 → 3.69.
* `particles:15/16` n_blobs fell 174 → 105 and 154 → 88; `particles:15`
  mean_saturation rose 0.681 → 0.742. Note `particles.mean_saturation` is the
  statistic `tintlaw` was written to replace because it is 96% stage wash — with
  the streak's colour changed from cream to amber this round, that number is
  measuring stage.js, not juice. Do not read it as a juice regression.

---

## 3. PORTRAIT — THREE STRUCTURAL DIFFERENCES BEYOND FRAMING

`shots/r7-iphone/`, 430×932 layout → 215×466 render, tier 2, 0 failed, 0 errors.
Composition, grade, void floor (`corner_max` 2.96–2.98, `median_luma` 3.0),
species, DOF and the speed law all read the same as landscape. Three things do
not.

**(1) `12-idle-blade` has no streak at all in portrait, and it is the recipe, not
the code.** The beat pins fruit at fixed **world** positions and swipes in
**normalised** coordinates. With `fov 42`, `halfExtent 3.9`:

| | aspect | camZ | half-width | swipe in world | pineapple standoff |
|---|---|---|---|---|---|
| landscape | 1.778 | 10.16 | **6.93** | (−4.16,−1.95)→(2.08,1.75) | **1.43** |
| portrait | 0.461 | 22.02 | **3.90** | (−2.34,−4.23)→(1.17,3.80) | **1.78** |

The portrait frustum is 1.8× narrower in x, the pineapple's cut radius falls
between 1.43 and 1.78, so the swipe **misses**, no `slice` fires, and `flare.i`
is never latched. The streak is correctly absent because nothing was cut. Every
other portrait beat that cuts something (09, 13, 15, 16, 05, 08) has its streak
and it is laid out correctly. **`layoutStreak` is aspect-invariant as its author
claims** — I found no portrait defect in it, and the r6 portrait `voidDist` bug
does not recur.

**(2) `14-hud` prints garbage: two huge ghost strings, "1920×" and "2234×",
across the middle of the frame.** Recovered by background subtraction; they are
`.zs-combo` callouts, `${count}×`. The combo counter has run to ~2000.

Root cause, and **it is pre-existing and in a file nobody edited this round**:
`score.js:19` gates the combo window on `e.stroke.t`, and `api.frame` expires it
with `nowSec()`. `blade.js` supplies `nowSec()` (virtual under capture), but
`main.js`'s `ZS.swipe()` — the harness's only input path — stamps
`performance.now()/1e3`, which is **wall clock**. Under `ZS.step` the two clocks
diverge, every harness swipe looks 0 ms after the last one, `api.combo++` runs
forever and never expires. Consequences: `perf.score` in every report is
meaningless (322 / 636 / 834 / 2496), `slowmo` is pinned at its deepest setting
(`scale` clamped to 0.16, `seconds` to 0.85) for the whole of every capture, and
at high enough scores the callouts paint over the frame. It shows up in portrait
only because that run happened to score 2496; landscape scored 322 and drew none.
The one-character fix is `performance.now()/1e3` → `nowSec()` in `ZS.swipe`.
**I did not make it.** It would change `timeScale` on every captured beat and
invalidate every r6↔r7 comparison in this report and in four others. It belongs
at the *start* of round 8, with a re-baseline.

**(3) Peak draw calls read 153 in portrait** at 70 live bodies — the same
population artefact as §0, amplified because the portrait play volume is taller
so fewer probe fruit have left it by sampling time. Per-body cost is unchanged.

---

## 4. THE NUMBERS THE BRIEF ASKED FOR, IN ONE PLACE

```
peakDrawCalls   r6 stored  88   |  r6 RE-SHOT TODAY 128  |  r7 107 / 123  |  bar 120
peakTriangles   r6 stored 164k  |  r6 RE-SHOT TODAY 225k |  r7 192k/218k  |  bar 250k
cpu max         r6 stored 3.4ms |  r6 RE-SHOT TODAY 10.0 |  r7 12.2 / 7.3 |  budget 8.3
cpu p95         r6 0.4-0.6 ms   |                        |  r7 0.2-0.8 ms |  target 2.0
controlled, 24 fruit cut:  r6 82 calls / 174 609 tris  ->  r7 81 calls / 167 227 tris
programs 0 (both) | textures 18 (both, and after tier flips) | geometries 43 (both, controlled)
```

**Said loudly, both ways:** as stored, `peakDrawCalls` got worse (88 → 123) and
crossed the bar, and `cpu max` got worse (3.4 → 7.3/12.2). As *measured against
round 6 re-run on the same instrument in the same session*, r7 is better on draw
calls (128 → 123), better on triangles (225k → 218k), comparable on cpu max, and
exactly one draw call and 2–7k triangles cheaper than r6 at every controlled
scene population. **No module spent a draw call or a millisecond this round.**

## 5. Reproducing everything here

```
node build.mjs
node tools/shoot.mjs --out shots/r7 --device desktop --hero --deadline 800
node tools/shoot.mjs --out shots/r7-iphone --device iphone
python3 tools/probes.py suite shots/r7
python3 tools/probes.py suite shots/r6
python3 tools/probes.py species ; python3 tools/probes.py limb

# the r6 baseline (kept, and worth keeping for round 8)
ls /tmp/r6tree            # r6 sources + build; frames in /tmp/r6tree/tmp/r6shots
cd /tmp/r6tree && node build.mjs && node tools/shoot.mjs --out /tmp/r6shots --device desktop
python3 tools/probes.py suite /tmp/r6tree/tmp/r6shots      # the NOISE FLOOR column

# private diagnostics (NOT probes)
node .r7draws.mjs  <index.html> <label>          # controlled draw-call sweep
node .r7perfab.mjs <index.html> <label> [reps]   # shoot.mjs's cpu+perf bodies, verbatim, N times
node .r7cpu.mjs                                  # locates the cpu max sample
```

## 6. What I did NOT do

* **I did not edit `tools/shoot.mjs`,** although §0 shows its `peakDrawCalls` is a
  reading of `liveBodies`. It is the shared instrument; changing it mid-round
  would have destroyed the only comparison that settles the question.
* **I did not fix the `ZS.swipe` clock bug** (§3.2), for the reason given there.
* **I did not touch stage.js's streak** to pull it out of the corner (§2c). It is
  a quality call for the stage critic, not a runtime error, and re-tuning it here
  would invalidate the stage owner's A/B.
* **I did not re-shoot to chase a better `peakDrawCalls`.** Three harness runs,
  as briefed, and the number is what it is.
