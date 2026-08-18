# r11 — `src/juice/fluid.js` (the juice): **a droplet now leaves the frame because it flew out of it**

**FILE TOUCHED: `/home/claude/juice/src/juice/fluid.js` — nothing else.**
`tools/probes.py` untouched (md5 `9bf8a336f51f7032e4c1d7f264a0ab77`, PROBE_VERSION 15). I added no
probe and modified none. Two private scratch tools were added under the gitignored `tools/.*`
pattern: `tools/.r11juice-ballistics.mjs` (the closed-form exit-time bench) and
`tools/.r11juice-cpu.mjs` (shoot.mjs's cpu probe, extracted so it can be repeated).

**CANARY, before I started and again after everything below:**
```
python3 tools/probes.py clip shots/r5/05-cut+500ms.png
  -> mask_px 9490 / pct_R_ge_255 5.227 / probe_version 15   ✅ both times
```

**`node build.mjs` clean.** No `ShaderMaterial` / `onBeforeCompile` / `EffectComposer`. The two
shader edits are constants inside existing TSL `Fn`s. +0 draw calls, +0 programs, +0 triangles,
+0 attributes, +0 uniforms.

---

## 0. THE PLAYER'S NOTE, AND THE TWO IMAGES THAT ARE THE WHOLE REPORT

> "the juice disappears way too quickly, ideally i don't see it fade at all but it instead sprays
> off the screen"

**The `feel` owner landed the slow-mo deletion while I was working, so I have the perfect control:
`shots/r11-feel/` is r10's juice, in today's tree, on today's clock — the exact build the player
would have got if only note 3 had been fixed. `shots/r11-juice/` is the same recipe with my file.
Same beat, same seed path, same fruit positions, same everything but this file.**

| beat (now real sim time, slow-mo gone) | `shots/r11-feel/` — r10 juice | `shots/r11-juice/` — r11 juice |
|---|---|---|
| `04-cut+250ms` droplets `mask_px` | **123** | **7351** |
| `04-cut+250ms` droplets `n_blobs` | **0** | **102** |
| `00-hero` droplets `mask_px` | **711** | **24562** |
| `00-hero` droplets `n_blobs` | **8** | **268** |
| `05-cut+500ms` by eye | **not one droplet in frame** | a field of drops across the frame, still travelling |

**LOOK AT `shots/r11-feel/00-hero.png` AND `shots/r11-juice/00-hero.png` SIDE BY SIDE.** I did. The
control hero has three specks in it. Half a second after a watermelon is cleaved in half, with
slow-motion removed, the shipped build has **no juice on screen at all**. The player was already
complaining about this WITH slow-mo stretching it 2.7x; note 3 was about to make note 1 three times
worse. That is the single most important fact in this report and it is why the two notes had to be
fixed in the same round.

For the record I also looked at `05-cut+500ms` in both: control = two melon halves on black;
r11 = ~120 droplets spread from the top edge to the bottom, mid-flight, with directional streaks.

---

## 1. IT WAS A VELOCITY BUG BEFORE IT WAS A LIFETIME BUG

I did not touch a lifetime constant until I had measured why raising one would not have worked.

`tools/.r11juice-ballistics.mjs` reproduces `api.burst`'s arithmetic **verbatim** (the wedge table,
`filmAt`, `aimWedge`, every `rr()` draw) and integrates the **same closed form the vertex shader
evaluates**, `p(t) = o + v(1-e^{-kt})/k + g(t-(1-e^{-kt})/k)/k`, against the measured frame
rectangle — landscape 6.933 × 3.900, portrait 3.900 × 8.453 world units (r10-perf.md, reproduced
from `main.js: resize()`).

**Two findings, both fatal to the "just raise `life`" fix:**

**(a) THE ASYMPTOTE DID NOT REACH THE FRAME EDGE.** Under linear drag the total travel is `v0/k`.
A melon cleave's rim bead had a **median asymptotic travel of 2.20 units against a landscape
half-width of 6.93**. No lifetime whatsoever gets that droplet off the side of the screen. Mist was
worse: 0.78 units, less than half a fruit radius, dying inside the fruit's own silhouette.

**(b) THE TERMINAL FALL SPEED WAS A CRAWL.** Also under linear drag, terminal velocity is exactly
`g/k`, and `g` here is 14 dm/s². At r10's `kB = 9.25..17.25` a rim bead sank at **0.8–1.5 units/s
and needed 4.6 SECONDS** to clear the bottom of a landscape frame. At `kM = 34..62` a mist grain
sank at 0.23–0.41 units/s: **fourteen seconds** in landscape, thirty-four in portrait. The droplets
were not falling. They were parked.

**The physical check, because it is the thing that makes this an error and not a taste:** 1 unit =
1 dm, so this file's droplets are **1.7–14 mm across**. A 2 mm water drop's terminal velocity is
~6.5 m/s under real gravity, i.e. a drag time constant τ = 0.66 s. This world's g is 1/7 of real,
so holding τ gives `k ≈ 1.5`. The physically faithful drag for the drop sizes actually on screen is
**1–4, and the file had 9–17. `kM = 34..62` is drag for a 30 µm fog droplet and there is nothing
30 µm in this file.** Every drag constant was 3–20x too high, and that single fact is the whole of
the player's note 1.

### The two numbers per layer the brief asked for

`beadReach` ×2.80 and `mistReach` ×2.40 put the launch speed back (`v0 = reach·k`, so lowering `k`
alone would have made the juice ooze rather than spray: median |v0| goes 26.7 → 15.4 units/s at the
instant of the cut, and is **9x higher than r10 by +250 ms**, because r10's bead had lost 96% of its
launch velocity by then and r11's still has 54% of it).

`med life` is the **median of the derived lifetime**; `med time-to-leave` is the median of the
closed-form exit time; `%out-before-death` is the share of the class that gets off screen while
still alive — **the property the player actually asked for.** 2000+ droplets per row.

| burst | class | frame | asym r10 | asym r11 | med life r10 | med life r11 | med TIME-TO-LEAVE r11 | %out r10 | %out r11 |
|---|---|---|---|---|---|---|---|---|---|
| melon cleave | rim | landscape | 2.20 | **6.15** | 0.123 | **1.91** | **1.289 s** | 4.8 | **96.4** |
| melon cleave | rim | portrait | 2.20 | **6.15** | 0.123 | **2.30** | **1.540 s** | 24.2 | **72.6** |
| melon cleave | spray | landscape | 2.34 | **6.54** | 0.106 | **2.00** | **1.066 s** | 7.0 | **74.4** |
| melon cleave | spray | portrait | 2.34 | **6.54** | 0.106 | **2.00** | **2.487 s** | 15.1 | **43.0** |
| melon cleave | mist | landscape | 0.78 | **1.88** | 0.070 | **1.90** | **1.759 s** | 0.0 | **59.9** |
| melon cleave | mist | portrait | 0.78 | **1.88** | 0.070 | **1.90** | **2.927 s** | 2.6 | **18.9** |
| slow cleave | rim | landscape | 2.30 | **6.45** | 0.124 | **2.03** | **1.285 s** | 2.4 | **95.6** |
| slow cleave | rim | portrait | 2.30 | **6.45** | 0.124 | **2.30** | **1.363 s** | 21.8 | **69.8** |
| slow cleave | spray | landscape | 2.42 | **6.79** | 0.105 | **2.00** | **1.161 s** | 9.3 | **80.0** |
| slow cleave | spray | portrait | 2.42 | **6.79** | 0.105 | **2.00** | **0.274 s** | 14.7 | **64.0** |
| slow cleave | mist | landscape | 0.69 | **1.66** | 0.071 | **1.90** | **1.735 s** | 0.0 | **64.3** |
| slow cleave | mist | portrait | 0.69 | **1.66** | 0.071 | **1.90** | **2.940 s** | 0.9 | **16.4** |
| fast flick | rim | landscape | 0.29 | **0.80** | 0.126 | **1.49** | **1.108 s** | 0.0 | **100** |
| fast flick | rim | portrait | 0.29 | **0.80** | 0.126 | **2.30** | **1.799 s** | 0.0 | **100** |
| fast flick | spray | landscape | 0.33 | **0.92** | 0.099 | **1.75** | **1.329 s** | 0.0 | **100** |
| fast flick | spray | portrait | 0.33 | **0.92** | 0.099 | **2.00** | **2.150 s** | 0.0 | **43.8** |
| fast flick | mist | landscape | 0.69 | **1.65** | 0.069 | **1.90** | **1.828 s** | 0.0 | **55.6** |
| fast flick | mist | portrait | 0.69 | **1.65** | 0.069 | **1.90** | **3.249 s** | 0.0 | **5.3** |

Reproduce with `node tools/.r11juice-ballistics.mjs base` and `... r11`.

---

## 2. THE MECHANISM: LIFETIME IS DERIVED, NOT AUTHORED

**No `life` constant can be correct here, because within ONE burst the right answer varies by a
factor of ~40 between one droplet and its neighbour.** So `life` is solved per droplet at emit time
(`exitTime` / `lifeOf`, `fluid.js:1653-1725`):

```js
const te = exitTime(o.x, o.y, v.x, v.y, k) * LIFE_SLACK;   // LIFE_SLACK = 1.16
if (te <= hi) { LF.life = max(te, lo); LF.out = true;  LF.fade = 0.86; }
else          { LF.life = hi;          LF.out = false; LF.fade = hangFade; }
```

* **The sides are exact**: `x(t) = o.x + v.x(1-e^{-kt})/k` is monotone with supremum `v.x/k`, so one
  test and one `log`. If the asymptote does not reach the edge, no transcendental is evaluated at
  all.
* **The floor is two Newton steps** seeded from the linear asymptote
  `y ≈ o.y + (v.y - g/k)/k + (g/k)t`, which for `kt ≳ 1` is a very good seed.
* **The top edge is deliberately NOT solved.** The crown opens off the cut plane, not straight up;
  missing a top-exiter only makes its life longer, which is the direction the player asked for.
* `fadePow` = **0.86 for an exiter**: `LIFE_SLACK` 1.16 × ramp-start 0.86 = 1.00, so the fade begins
  **exactly at the instant the droplet crosses the box**, and every frame of it is off-screen.
  **The player does not see the fade because the fade happens where he is not looking.**
* The retirement box is `EXIT_MARGIN = 1.30` × the true frustum at the cut's own depth, so no
  droplet is ever retired with a corner still on screen. At the shortest edge (landscape's 3.90-unit
  half-height) that is 1.17 world units = 108 device px on the hero, larger than any bokeh disc the
  lens produces.
* Off-screen retirement was the brief's request and it is what makes this free: an exiting droplet
  is dead the moment it is invisible, so nothing is spent drawing juice nobody can see.

**What changed, per class:**

| class | drag `k` r10 → r11 | terminal fall r11 | life r10 → r11 | fade start |
|---|---|---|---|---|
| rim beads | 9.25–17.25 → **1.80–4.20** | 3.3–7.8 u/s | 0.070+0.30·u·u → **derived, [0.40, 2.30]** | 0.52 → **0.86 / 0.30** |
| spray | 12.0–22.0 → **2.80–6.20** | 2.3–5.0 u/s | 0.055–0.145 → **derived, [0.34, 2.00]** | 0.48 → **0.86 / 0.28** |
| mist | 34.0–62.0 → **2.60–6.40** | 2.2–5.4 u/s | 0.038–0.100 → **derived, [0.30, 1.90]** | 0.30 → **0.86 / 0.16** |
| ligaments | 4.0–9.0 → **1.80–4.20** | — | 0.055–0.150 → **0.145–0.390** | 0.50 (unchanged) |
| cling | 7–14 (unchanged) | — | 0.055–0.145 → **0.135–0.345** | 0.42 → 0.34 |
| sheet | expansion k 96 → **30** | — | 0.078+0.050·f → **0.205+0.130·f** | tear field; global fade 0.70 → **0.88** |

Ligament reach is divided by exactly 2.80 so it **cancels** the new `beadReach` — a ligament is the
stage *between* the film and the beads and belongs near the cut, so its trajectory is
arithmetically identical to r10's; only its drag moved.

**Two secondary edits that are the difference between this working and silently not working:**

1. **`maxAge` 1.9 → 2.7.** That uniform is the compute kernel's "long dead, stop integrating" gate.
   Left at 1.9 it would have hard-reset the turbulence of every droplet still alive past 1.9 s,
   snapping it back onto the analytic path mid-flight.
2. **The kernel's air-responsiveness window, `smoothstep(2.5, 20.0, drag)` → `smoothstep(0.9, 6.5,
   drag)`.** Drag is the kernel's proxy for droplet size; with every drag constant falling 3–20x,
   the old window mapped the entire population onto `resp ≈ 0` and **would have switched the
   turbulence off entirely** while every other number in this report still looked good. The new
   window is derived from the spread that now exists (rim 1.1–4.2 | ligament 1.8–4.2 | spray
   1.6–6.2 | mist 2.6–6.4) and preserves the ordering. The wake vortex's decay went `-7.0` → `-3.6`
   for the same reason: a 143 ms wake authored when the longest-lived grain was 100 ms.

**RULE 3 ("nothing may outlive its own beat") is RETIRED as a lifetime constraint**, deliberately.
It was never a statement about the game — it was a statement about the harness, where two
consecutive cuts had to stay independent measurements. r10 closed that seam properly with
`bus.on('reset')` (`:1658`) and `shoot.mjs` calls `ZS.clear()` before every staging, so
15-fast-flick and 16-slow-cleave cannot contaminate each other however long juice lives. In a game,
a combo's second cut *should* land in the first cut's spray.

---

## 3. THE ONE CLASS THAT STILL FADES, SAID PLAINLY

**Mist.** A decelerating grain with a 1.7-unit asymptote inside a frame 8.45 units tall has nowhere
to go but down, slowly. In landscape 56–64% of it now leaves the frame alive; **in portrait only
5–19% does**, and the rest dissolves. I am not going to dress that up.

What I did instead of pretending: its fade is **12–20x longer** than r10's, starts at **16% of life
instead of 30%** (a long dissolve, not a cliff), and runs on a grain that is **still visibly
moving** — the curl-noise kernel now has 1.9 s to billow it instead of 70 ms. That reads as
dispersal. The honest alternative — raising `mistReach` ~10x so the aerosol crosses the frame —
would turn plate-02's tight cone into a full-frame wash, and I would rather report the limit than
buy a note with a picture.

**Cling also keeps a real fade, and correctly so**: foam on a cut face drains, it does not fly away.
It got the smallest extension in the file (×2.4) **on purpose**, because it is integrated by the
same ballistic path with the fruit's velocity baked in at emit time and therefore does not track the
half once the half's own motion diverges — which after this round it will, since the `physics` owner
is putting the halves on Rapier bodies. At 0.34 s the worst-case drift is ~0.2 units on a 1.5-unit
face. At the 1.0 s the other classes now get, it would visibly slide off the fruit.

---

## 4. THE FROZEN SUITE AS A CONTROL — WHAT MOVED AND WHAT I GAVE BACK

⚠ **Read the confound first.** r10's frames were shot with slow-mo live, so `04-cut+250ms` was
**92 ms of sim** there and is **250 ms of sim** now (the `feel` owner's `tools/simbeats.mjs`
measures exactly this). **Only `shots/r11-feel/` is a same-clock control**, and it exists for
landscape only. Portrait's r10 column below is therefore a different beat and I quote it as context,
not as a delta.

### Landscape, same clock, same tree, only this file differs

| probe / beat | bar | `r11-feel` (r10 juice) | **`r11-juice`** | scale-matched plate-01 |
|---|---|---|---|---|
| `droplets 04-cut+250ms` mask_px | — | 123 | **7351** | 8696 @640 |
| `droplets 04` n_blobs | — | 0 | **102** | 110 |
| `droplets 04` median_area_px | — | n/a | **25.0** | 23.0 |
| `droplets 04` area_p95_over_median | — | n/a | **5.71** | 5.51 |
| `droplets 00-hero` mask/blobs/med/p95med | — | 711 / 8 / 21.0 / 5.62 | **24562 / 268 / 32.0 / 8.29** | 34239 / 333 / 24.0 / 8.36 |
| `particles 15-fast-flick` median_blob_area | ≤ 6.0 | 3.0 | **4.0 ✅** | — |
| `tintlaw 15` sat_small | ≤ 0.145 | 0.1963 ⚠ | **0.1385 ✅** | — |
| `tintlaw 15` sat_blob_mean | ≤ 0.11 | 0.1760 ⚠ | **0.1244 ⚠** (over, but 29% better) | — |
| `tintlaw 16` sat_size_slope | positive | **−0.0305 ⚠** | **+0.0067 ✅** | — |
| `16-slow-cleave` connected torn film | by eye | partial | **yes, emphatically ✅** | — |

**I am not claiming the population numbers as a win I aimed for.** I did not touch a single count,
size law or size distribution this round — `q.rim`, `q.spray`, `q.mist`, `GRAIN_PX`, the rim law,
the spray law and the mist law are byte-for-byte r10's, exactly as the brief instructed. The
population went up because **droplets that used to be deleted before anyone could see them are now
in the frame**. That the result lands within 8% of a scale-matched plate on median blob area and
within 1% on `area_p95_over_median` is a consequence, not a target, and the r10 owner's §8 note —
"the shortfall is entirely in the under-6-px band" — is what actually got paid, by keeping the fine
grain alive.

### Portrait (`shots/r11-juice-iphone/`, `--device iphone`, different beat clock in the r10 column)

| probe | r10-iphone (92 ms sim) | **r11-juice-iphone (250 ms sim)** |
|---|---|---|
| `droplets 04` mask / blobs / p95med | 226 / 5 / 2.33 | **5985 / 23 / 5.74** |
| `droplets 00-hero` mask / blobs | 1261 / 10 | **19021 / 69** |
| `particles 15` median_blob_area (bar ≤6) | 3.0 | **3.0 ✅** |
| `tintlaw 15` sat_small / sat_blob_mean | 0.1523 / 0.1231 | **0.1829 ⚠ / 0.1619 ⚠** |
| `tintlaw 16` sat_size_slope (bar: positive) | +0.1984 | **−0.0909 ⚠** |

**The two portrait ⚠ rows, without spin.** `tintlaw 16` portrait went negative. Its r10 value of
+0.1984 was computed on **15 blobs, 4 of them large**; mine is on 46 blobs, 15 large, at a beat that
is 2.7x further into the burst. The r7 post-mortem (§t) already records this statistic moving
0.1954 → 0.0688 **between two runs of identical code**, and the only same-clock control I have —
landscape — moved this number the *right* way (−0.0305 → +0.0067). **I looked at the frame before
believing either number**: `shots/r11-juice-iphone/16-slow-cleave+50ms.png` at 4× is a connected
pale-pink torn film with fingers, red beads shedding off the torn rim, and a halo of silver grains
near the blade. That is REFERENCE_BAR R1b's picture. I am flagging the number rather than chasing
it, because chasing a 46-blob saturation slope is precisely the loop this round exists to break.

### What I gave back, declared

1. **`16-slow-cleave+50ms` off-body mass fell 4502 → 1485 px in landscape.** Real, and mine. At
   +50 ms the film opens more slowly (`B.k` 96 → 30) and the droplets start slower (`v0` 26.7 →
   15.4), so there is less juice off the body *at the instant of the cut* in exchange for 60x more
   of it at +250 ms and ∞x more at +500 ms. **By eye this frame is better, not worse**: the control
   at +50 ms has already skipped to a scatter of fat beads, mine still shows a coherent torn sheet
   with fingers, which is the stage R2's timeline says belongs at +50 ms. If a critic wants more
   instantaneous punch, the single knob is the `2.80` on `beadReach`.
2. **`pct_iou_ge_090` on the hero: 25.0 (control, 8 blobs) → 53.36 (268 blobs), against a
   scale-matched plate's 23.12.** The population that came back is disproportionately small round
   beads, which are more ellipse-congruent. This is the same cost r10 declared and it is now larger.
   **The lever is `dblRim`/`dblSpray` (0.45 / 0.35), which I deliberately did not touch** so that
   this round's change could be attributed cleanly. It is the cheapest thing for r12 to spend.
3. **`clip 05-cut+500ms`: mask_px 1600 → 2523, GR_ratio 0.1747 → 0.2244, darkest5pct_luma 13.48 →
   15.89.** That probe belongs to fruit-materials and measures the largest connected component; with
   live juice in front of the cut face at +500 ms the component grows. r7 §t already records this
   probe flipping 9586 → 4646 for exactly this reason ("a region-identity change, not a clipping
   change"). **Flagged to the integrator; not mine to move.**

---

## 5. PERF — NOTE 3 IS SOMEONE ELSE'S FIX BUT IT IS MY CONSTRAINT

**+0 draw calls, +0 shader programs, +0 triangles, by construction.** Drops are ONE instanced draw
into a 9000-slot pool whose `geometry.instanceCount` is saturated after the first few bursts, so a
droplet that lives longer costs nothing extra on the GPU front-end.

| run | peakDrawCalls (bar 120) | peakTriangles (bar 250k) | liveBodies |
|---|---|---|---|
| `r11-feel` landscape (control) | 49 | 110021 | 25 |
| **`r11-juice` landscape** | **57** | **125063** | 29 |
| **`r11-juice` PORTRAIT** | **87** | **144329** | 40 |
| r10-iphone (reference) | 115 | 162751 | 51 |

Both orientations inside every ceiling with room. `liveBodies` differs between runs because the
harness spawner is unseeded (third round this has been filed), so these rows are not a controlled
A/B — but they are all far enough under the bars that it does not matter.

**The fragment cost is the real question and here is the honest bound.** The added cost is
composited droplet pixels. On the hero the whole droplet field is **24562 px = 2.7% of a 1280×720
raster**; at 3–5x overdraw that is ~100 k blended fragments against a full-screen post chain. It is
not a measurable share of a frame.

**JS cost, measured properly** — `tools/.r11juice-cpu.mjs`, which is shoot.mjs's own cpu probe
extracted so it can be run repeatedly. This matters: the canonical harness reported `max 18.3 ms` on
my build and `max 2.5 ms` on the control, which reads like a disaster and **is noise**:

| build | landscape, 4 runs (median / p95 / max) |
|---|---|
| control (r10 juice) | 0–0.1 / **0.2, 0.2, 0.3, 1.4** / 2.4, 3.8, 7.9, 12.6 |
| **r11 juice** | 0–0.1 / **0.4, 0.4, 0.7, 2.0** / 3.7, 7.0, 8.4, 8.9 |

| build | portrait, 3 runs (p95) |
|---|---|
| control | **0.9, 2.7, 3.0** |
| **r11 juice** | **0.6, 0.8, 1.4** |

The distributions overlap; the single-run `max` swings 2.4 → 12.6 ms **on the control's own code**.
Landscape p95 is up ~0.3 ms against a 2.0 ms bar; portrait is flat-to-better.

**The emitter in isolation — 2000 `bus.emit('juice')` with no cut and no render:**

| | control | r11 |
|---|---|---|
| burst, median | **0.2 ms** | **0.2 ms** |
| burst, p95 | 1.5 ms | 1.2 ms |

**The per-droplet exit-time solve is free at this resolution.** It is ≤1 `log` + 2 `exp` per
droplet, and the `log` is skipped entirely when the asymptote cannot reach the side edge — which is
most droplets. No allocation: `lifeOf` returns a single reused object.

⚠ **One confound on the cpu table:** the `feel` owner stashed and restored `score.js` while I was
benching, so the control binary may have carried slow-mo (which makes it *cheaper*, fewer fixed
substeps per frame). The burst microbenchmark above is timeScale-independent and is the number that
isolates my change; it is identical.

---

## 6. WHAT I LOOKED AT, AND WHAT I SAW

Rule G. Every claim above that says "by eye" was made from these files, viewed:

* `shots/r11-juice/00-hero.png` vs `shots/r11-feel/00-hero.png` — **the round in two frames.**
  Control: two melon halves and three specks. Mine: a splash reaching every edge of the frame with
  visible directional streaks on the fast beads.
* `shots/r11-juice/05-cut+500ms.png` vs `shots/r11-feel/05-cut+500ms.png` — control has literally
  zero droplets; mine has ~120 mid-flight, top edge to bottom.
* `shots/r11-juice/04-cut+250ms.png` vs `shots/r10/04-cut+250ms.png` — mine reaches the corners;
  r10's is a tight crust around the cut.
* `shots/r11-juice/02-cut+33ms.png` vs control — comparable; mine slightly tighter with a more
  coherent glassy sheet. No regression I would report as a defect.
* `shots/r11-juice/16-slow-cleave+50ms.png` vs control — **mine is the better frame**: connected
  torn film + fingers + rim beads, against the control's premature bead scatter.
* `shots/r11-juice/15-fast-flick+50ms.png` — denser, brighter, more legible aerosol cone with
  countable grains, reaching further along the blade axis than the control's.
* `shots/r11-juice-iphone/{00-hero,04,05,16}.png` — portrait spray field is real for the first time.
* `shots/r11-juice/06-cut+1000ms.png` and `11-combo+550ms.png` — a second after the cut the field is
  in the lower frame still travelling, not a fog. No accumulation problem across a combo.

**Nothing in this report comes from a frame I did not open.** All 17 beats in both directories are
non-black.

---

## 7. REQUESTS TO THE INTEGRATOR — NOT MY FILES

1. **`fruit-materials` / `clip` probe on `05-cut+500ms` and `08-citrus-caps` will move**, because
   live juice now sits in front of the cut face at beats where it used to be gone. Measured:
   `mask_px` 1600 → 2523, `GR_ratio` 0.1747 → 0.2244, `darkest5pct_luma` 13.48 → 15.89. This is a
   region-identity change of the kind r7 §t documents, not a materials regression. It needs to be
   attributed to me and not to that owner.
2. **`tools/shoot.mjs --seed`.** Fourth independent request. `liveBodies` swung 25 / 29 / 40 / 51
   across four runs in this round alone, and half of what every builder steers by is spawn noise.
3. **`tools/shoot.mjs`: accept `--portrait` or reject it loudly** (r10 request, still open).
4. **Serialise the builds.** The `feel` owner and I were both running `node build.mjs` and
   `git stash` against one working tree tonight; I twice had to reconstruct which `dist/index.html`
   a capture had used from mtimes. Nothing was lost, but that was luck.
5. **Nothing else. No change outside `src/juice/fluid.js` is required for this round's work.**

## 8. FOR MY NEXT CRITIC — where the remaining gap is

* **Portrait mist.** 5–19% exits; the rest dissolves. The frame is 8.45 units tall on the axis
  gravity works along and a decelerating grain cannot cross it. If this must be fixed it is a
  `mistReach` change with a composition cost, and it should be *shot* before it is believed.
* **`pct_iou_ge_090` 53% against a plate's 23%.** The lever is `dblRim`/`dblSpray`, untouched this
  round on purpose. Cheapest available win.
* **The instantaneous punch at +33/+50 ms** is the one thing that got quieter. `beadReach`'s 2.80 is
  the single knob and it trades directly against how spread out the frame is at +500 ms.
* **Do not re-derive lifetimes from a still photograph.** The bench that decides them is
  `tools/.r11juice-ballistics.mjs`; it takes seconds to run and it answers the only question that
  matters — does this droplet get off the screen before it dies.
