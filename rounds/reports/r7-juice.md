# r7 — juice (`src/juice/fluid.js`)

**FILE TOUCHED: `src/juice/fluid.js` only. I DID NOT TOUCH `tools/probes.py`.
I added no probe and I bumped no version.** Every number below comes from
`python3 tools/probes.py <probe> <png>`.

> **NOTICE, as the rules require.** Another r7 builder bumped
> `PROBE_VERSION 6 -> 7` mid-session (adding a `limb` source probe); `probes.py`
> went md5 `a4ce559b3d557565a151857f69d62822` -> `2a421795a52b75b26ec9cad2b4d9a910`
> while I was working. I re-ran `probes.py suite` on **both** of my A/B
> directories after the bump and diffed every field of all 16 suite entries
> against my pre-bump JSON: **0 differing entries in each.** Every headline
> number in this report was additionally re-read individually under v7 and is
> byte-identical. v7 is bookkeeping for my measurements, and everything here is
> comparable to the r6 verdict's v5 numbers for the same reason it gave.

**Provenance.** The shipped source minifies to a bundle byte-identical
(md5 `185549ea8c2c312ada097da760feb876`) to the one that produced
`shots/r7-juice-b/`. Those are the frames measured throughout. The A/B is a true
A/B: I froze the whole tree at session start in `/tmp/zsA`, shot r6's
`fluid.js` from it (`shots/r7-juice-base/`), then changed only this file.

| dir | what it is |
|---|---|
| `shots/r7-juice-base` | r6 `fluid.js`, today's tree — **the baseline** |
| `shots/r7-juice-base2` | the *same code again*, second run — **the noise floor** |
| `shots/r7-juice-b` | **SHIPPED** |
| `shots/r7-juice-a`, `-c`, `-d` | rejected intermediates, kept because two of them are evidence |

---

## ⚠ READ THIS FIRST: THE HARNESS IS NOT DETERMINISTIC, AND I CAN PROVE IT ON A FRAME WITH NO JUICE IN IT

`01-whole-watermelon.png` is shot **before any cut**. It contains no juice.
`fluid.js` cannot put a pixel in it. Across five runs:

| run | `silhouette` mask_px | aspect | `void` corners |
|---|---|---|---|
| r7-juice-base | 12685 | 0.7931 | 2.90 2.91 2.91 **2.94** |
| r7-juice-b | 12683 | 0.7877 | 2.90 2.91 2.91 **2.93** |
| r7-juice-c / -d / -base2 | 12697 | 0.7877 | 2.90 **2.86 2.86 2.81** |

Three *different builds* agree exactly; two others each differ. It is run-driven,
not build-driven. Three consequences that bear directly on how this round and
the last one were scored:

1. **`tintlaw:16-slow-cleave.sat_size_slope` moved −0.1954 → −0.0688 between two
   runs of the SAME CODE** (`r7-juice-base` vs `r7-juice-base2`). That single-run
   swing is **1.7× the entire r5→r6 movement** the r6 verdict reported as its
   headline finding (−0.0622 → −0.1348). `n_small` on that frame is **3 to 8
   blobs**. It is not a statistic; it is a coin.
2. **`clip:08-citrus-caps.mask_px` flipped 9586 → 4646 between the same two
   runs.** `clip` fits its ellipse to `largest_component`, and when a juice
   bridge between the two orange halves moves, the component splits and the
   probe measures a different object. I initially attributed this flip to my own
   change; it is not mine, and it is not anyone's.
3. **`report.json`'s `perf` block is unusable as an A/B.** The r6 code reported
   **82 draws / 154 351 tris / liveBodies 34** on one run and
   **126 draws / 219 303 tris / liveBodies 56** on the next. The probe drives
   itself with unseeded `Math.random()` for spawn positions and swipe angles, so
   a different number of fruit survives each time.

I therefore quote a **noise floor** next to every delta below, taken from the two
same-code runs, and I use a **seeded** perf probe for the perf claim.

---

## TASK A — THE SLOW/HEAVY CLEAVE NOW HAS A LIQUID PHASE

`droplets` (frozen). Baseline is stated as *two runs of the same code* so the
noise is visible.

| frame | r6 run 1 | r6 run 2 | **r7** |
|---|---|---|---|
| **02-cut+33ms** (the FILM beat) | 191 px / 3 blobs | 186 px / 3 | **854 px / 16** |
| 03-cut+100ms (FINGERS) | 1509 / 32 | — | **2493 / 31**, median area 27 → **46** |
| 04-cut+250ms (BEADS) | 1152 / 32 | 1107 / 30 | **1990 / 40** |
| 07-citrus-cut | 4898 / 15 | 4909 / 15 | **5259 / 16** |
| 09-combo+50ms | 11244 / **4** | 11249 / **2** | **11699 / 13**, median area 16 → **24** |
| 10-combo+200ms | 11822 / 23 | 11844 / 25 | **12390 / 26**, median area 24.5 → **46** |

02-cut+33ms is the beat REFERENCE_BAR R2 says must be a coherent film, and the
r6 verdict's exact words were "at the two beats that are supposed to contain it
there is nothing to measure". **4.5× the mass and 5.3× the blob count, against a
run-to-run noise on that frame of 2.6% and 0 blobs.** This is the largest,
cleanest movement in this report and it is far outside the noise floor.

### Why it was missing — three causes, all arithmetic

**A3. The film had covered 43% of its reach when it was photographed.** RULE 2
(this file's own note) says the beat labelled "+33 ms" is ~11 ms of *sim* time.
The sheet's drag was `B.k = 52`, so `1 − exp(−52·0.011) = 0.43`. The claim at the
top of this file — "reaches ~75% of its extent by 33 ms" — was authored against
the wall clock and has been **false since slow-motion was added**. `B.k = 96`
puts it at 65% at the +33 ms beat and 80% at the +50 ms beat. `reach` also went
`0.85 + 1.15·filmness` → `0.85 + 1.55·filmness`, i.e. 2.0R → 2.4R, because at
2.0R the sheet stopped *inside the fruit's own silhouette* — where a viewer reads
it as a decal painted on the fruit and where no off-body probe can see it at all.

**A1. The tear field was isotropic, so there were no fingers.** R2's timeline is
film → **fingers** → strings → beads → mist. A finger is a lacuna that is much
longer radially than it is wide. r6's tear noise ran angular 3.1 against radial
2.2 — an aspect of **1.4**, i.e. round holes. The membrane died as a blotchy rag.
Angular frequencies up ~1.35×, radial frequencies down 4×: aspect **7.8**, and
the surviving membrane is a comb of radial ligaments. Same three `vnoise` calls,
different arguments, **zero cost**.

**A4. The strings stage was a single pulse.** Ligaments were born inside a 13 ms
window with a median life of 0.082 s, so the population had peaked and half-died
by the +100 ms beat (42 ms of sim). Birth 0.002–0.030, life 0.055–0.150, count
36 → 48 at tier 3. Still gated on `filmness`, so a fast flick emits none (RULE 1).

---

## TASK B — THE SIZE-TO-TINT LAW

### B2. The sheet was conflating COVERAGE with OPTICAL DEPTH, and that is the "red decal"

Through r6 a single scalar `tau` was fed to **both** the alpha ramp **and** the
Beer–Lambert exponent. The Plateau rim — the brightest, most legible filament the
sheet draws, a surface-tension bead a few hundred microns thick — pushes `tau` to
~1.85, so it was rendered as **1.85 optical depths of neat watermelon juice**:
`trans.g = exp(−4.63 × 1.85) ≈ 0`. Every filament the eye actually resolves came
out at saturation ≈ 1.0. That is the r6 verdict's "a red line ruled along the cut
plane", and it was a units error, not a taste error.

Look at plate-01: the watermelon's splash sheet is **glassy**. Nearly colourless
over most of its area, visible through specular and fresnel, pink only where
juice has pooled. So `tau` stays the coverage term (**alpha is unchanged**) and a
separate `od` is the path length:

```
od = memb² · 0.55 + memb · 0.20 + plat · 0.06     (× the same shrink term)
     memb 0.38 (outer, torn) -> od 0.155 -> trans.g 0.49 -> sat 0.51
     memb 1.00 (at the ring)  -> od 0.750 -> trans.g 0.07 -> sat 0.93
```

Clear at the extremities, deep red where it meets the flesh. My first pass used
`memb²·0.55` alone and measured the outer sheet at sat 0.31 — that pulled
`sat_large` down to 0.467, because **torn film fragments are LARGE blobs**, so an
over-clear film reads to the probe as "the big things are the pale ones", which is
the same inversion by another route. The linear term is the correction.

### B1. The droplets' achromatic class was SUB-RESOLUTION BY CONSTRUCTION

This is the root cause, and it is measurable in device pixels.

The droplet system renders at **115 px per world unit** at the fruit plane
(`pix/dist`; see PORTRAIT below — that number is the same on both orientations).
r6's `small = 0.022·szScale` is therefore a sprite of radius **1.2 px**. *The only
droplets that could be white were the ones too small to see.* No reweighting
inside that scheme can produce a visible white droplet, which is exactly why r6's
attempt (shrinking the bottom third of the spray draw) bought `sat_small 0.8007`.

Two changes:

- **Crossover `0.022 / 0.078` → `0.030 / 0.115`.** The achromatic ceiling is now
  radius 1.6 px (~8 px of blob) and the `sat < 0.45` band runs out to radius
  3.6 px (~40 px of blob). The pale population is now the *resolvable* one.
  **This line cannot shrink a droplet** — `sz` is untouched by it, which was r6's
  actual bug.
- **Tint is Beer–Lambert, not a linear mix.** `mix(white, juiceColor, big^1.2)`
  is a ramp toward a colour whose green channel is 0.028, so it is already 77%
  saturated at `big = 0.5`: there was no pale band, only white-or-blood-red with a
  two-pixel transition. `aTint` now carries **absorbance** `A = −ln(juiceColor)`
  (three `Math.log` per burst on the CPU, no new attribute, no extra bandwidth)
  and the shader does `white · exp(−A · dpt)` with `dpt = big²·1.20`.
  At `dpt = 0` this is **exactly** `white`, i.e. bit-identical to r6 for every
  mist grain — the fast flick's aerosol cannot move by construction.

Also **B2b**: the dark-core floor went `0.11` → `0.26`. A fat drop being 10× darker
than a fine one meant a red droplet's only pixels above the probes' 0.06 luma
floor were its 2–3 px core — and a core is the most saturated part of a drop, so
the frame's fattest reddest beads were being *counted as tiny saturated blobs*.
plate-01's red droplets are bright objects with dark centres, not dark objects.

**B4**: `mistness` constant 0.06 → 0.16 with the `fast` slope 1.05 → 0.95. At the
harness flick this is arithmetically identical — `0.06 + 1.05(0.972) + 0.30(0.611)
= 1.2617` and `0.16 + 0.95(0.972) + 0.30(0.611) = 1.2617` — so `nMist` is the same
integer and the fast case is untouched. A heavy cleave goes ~90 → ~240 fine
grains, all below `small`, all achromatic.

**B5, and it is the one nobody had noticed**: `mistReach` was the only reach
constant with **no `filmness` term**. For a heavy cleave it read `R·0.55·1.1 =
0.91` units of asymptote — 18–27 device px at the sim time the beats sample,
against a fruit radius of 57 px. **Every achromatic grain a cleave emitted died
inside the fruit's own silhouette**, fused into `largest_component`, invisible to
the eye and to every off-body probe. The class the whole colour law rests on was
being emitted into a place where it could not exist. `+ 0.95 · filmness` now.

### What the frozen probe says

`tintlaw.sat_size_slope`. Positive = correct (big blobs juice-coloured, small
blobs white). Two baseline runs are shown so the noise is visible.

| frame | r6 run 1 | r6 run 2 | **r7** |
|---|---|---|---|
| 02-cut+33ms | +0.2984 | +0.3061 | +0.2694 |
| 03-cut+100ms | +0.2486 | +0.3522 | +0.1082 |
| **04-cut+250ms** | **−0.0481** | **−0.0342** | **+0.2251** |
| 07-citrus-cut | +0.1009 | +0.1229 | **+0.3322** |
| 09-combo+50ms | +0.4141 | +0.4204 | +0.2025 |
| **15-fast-flick+50ms** | **−0.0620** | **−0.0642** | **+0.0294** |
| 16-slow-cleave+50ms | −0.1954 | −0.0688 | −0.0741 |
| **12-idle-blade** | **−0.1779** | **−0.1949** | **+0.0018** |

**Beats where the law runs BACKWARDS: 4 of 8 → 1 of 8.** The three sign flips
(04, 15, 12) are each 10–20× the two-run noise on their own frame
(±0.014, ±0.002, ±0.017). `sat_small` falls on 7 of 8 frames.

### The one survivor, and what is actually in its `small` bin

16-slow-cleave's slope is −0.0741, which sits **inside the baseline's own two-run
spread** (−0.1954 … −0.0688). Here is why it cannot be moved from this file.
Dumping `tintlaw`'s own mask and its own per-blob luma-weighted saturation
(the probe's code, not a private ruler):

```
r7-juice-b/16-slow-cleave+50ms.png   n=20 blobs, mask 399 px
  area=92 sat=0.845 rgb=[96,  9,  8]   juice, fat bead
  area=70 sat=0.414 rgb=[137,59, 57]   juice, mid
  area=69 sat=0.573 rgb=[142,40, 38]   juice
  area=50 sat=0.428 rgb=[147,68, 66]   juice
  area=21 sat=0.165 rgb=[139,117,115]  juice, PALE  <- new this round
  area=18 sat=0.589 rgb=[158,60, 57]   juice
  area=13 sat=0.085 rgb=[128,120,117]  juice, PALE  <- new this round
  area=10 sat=0.797 rgb=[  7, 25, 31]  RIND CHIP  (green, luma 19)
  area= 8 sat=0.050 rgb=[ 63, 61, 61]  juice, WHITE <- new this round
  area= 8 sat=0.783 rgb=[ 11, 19,  4]  RIND CHIP  (green, luma 16)
  area= 8 sat=0.810 rgb=[ 18, 20,  3]  RIND CHIP
  area= 7 sat=0.072 rgb=[190,183,176]  juice, WHITE <- new this round
  area= 4 sat=0.166 rgb=[ 41, 36, 34]  juice, white
  area= 4 sat=0.834 rgb=[  6, 20, 11]  RIND CHIP
  area= 4 sat=0.781 rgb=[ 14, 18,  4]  RIND CHIP
  area= 3 sat=0.774 rgb=[ 16, 17,  4]  RIND CHIP
  area= 2 sat=0.008 rgb=[119,118,118]  juice, WHITE <- new this round
  ...
```

The `small` bin (area ≤ 6 px) on this frame is **5 dark-green watermelon rind
chips at sat 0.77–0.84** plus 2–3 juice grains. Rind debris is not emitted by
`fluid.js`. `tintlaw` is colour-blind by design — correctly — so it cannot tell a
2 px rind chip from a 2 px droplet, and on this one frame the chips outnumber the
droplets. **That is the whole residual.** The r6 verdict's "the finest droplets
are the reddest thing in frame" was, on this frame, largely a measurement of
watermelon peel.

For contrast, the same dump on the r6 baseline contained **no achromatic juice
blob at all** — the juice population ran sat 0.36 → 0.92 with nothing below 0.36.
Four of them are below 0.17 now. The population changed; the bin is contaminated.

### The obvious bigger hammer is worse, and I shot it

`shots/r7-juice-c` raises the cleave's mist budget to ~600 grains/face (0.40).
It does buy the small bin — `sat_small` 0.576 → 0.356 — but it buys it by
flooding the *whole* frame with achromatic grains:

| | shipped (b) | c (mist ×2.5) | d (mist ×1.4) |
|---|---|---|---|
| 16-slow `sat_small` | 0.5763 | 0.3556 | 0.5327 |
| 16-slow `sat_large` | 0.5022 | **0.3286** | **0.3808** |
| 16-slow `sat_blob_mean` | 0.4333 | **0.2558** | **0.3336** |
| slow/fast colour separation | **4.14×** | 2.72× | 3.43× |
| `droplets:02` mask / blobs | **854 / 16** | 348 / 5 | 346 / 5 |
| slope moved by | — | +0.047 | −0.078 |

Grains land in **both** of `tintlaw`'s area bins, so mist volume is a poor lever
on a within-frame slope and an excellent way to destroy the cross-frame colour
split that r6 **passed**. I am not trading a working axis for 0.047 of a statistic
whose same-code noise is 0.127.

---

## THE SIZE SPLIT HELD, AND SO DID THE FAST FLICK

`particles`, the brief's explicit check:

| | r6 run 1 | r6 run 2 | r7 |
|---|---|---|---|
| 15-fast `median_blob_area` | 4.0 | 4.0 | **4.0** |
| 16-slow `median_blob_area` | 10.0 | **7.0** | **9.0** |
| `pct_blobs_ge_16px` fast / slow | 17.89 / 31.71 | 16.67 / 31.76 | **15.15 / 34.88** |
| ratio | 1.77× | 1.91× | **2.30×** |

Note the brief's "4.0 vs 15.5 last round" is not reproducible on today's tree:
the r6 code on today's stage measures 10.0 and 7.0 on two runs of itself. I did
not lose it; it was already 10.0/7.0 before I touched anything, and the `particles`
docstring's own v2 caveat says exactly why (the stage streak merges with the body
component). The **ratio** — the thing the bar actually asks for — went up.

`tintlaw` 15-fast-flick, the frame the r6 verdict called the best this project has
produced: `sat_blob_mean` 0.1177 / 0.1202 → **0.1047**, `median_blob_area` 3.0 →
4.0, `mask_px` 446 → 469. It got *whiter and slightly denser*, and its slope flipped
positive. Nothing leaked.

---

## PORTRAIT — MEASURED, AND THE LAW IS ROTATION-INVARIANT TO 0.1%

Every threshold I moved (`small`, `fat`, `reach`, `mistReach`, `beadReach`) is in
world units, so the question is whether a world-unit droplet subtends the same
number of device pixels when the phone rotates. It does, and here is the chain:

- `U.pix = 0.5 · h_px · P11`, and the vertical fov is **fixed at 42° on every
  aspect** (stage.js pins it; my formula is the same one, taken off
  `camera.projectionMatrix.elements[5]`).
- `main.js:206-210` dollies to fit the stage box:
  `camZ = halfExtent / tan(vfov/2) · max(1, 1/aspect)`.
- So `pxR = sz · pix / camZ ∝ sz · h_px / camZ`, and in portrait the `1/aspect`
  inflation of `camZ` exactly cancels `h_px` being the **long** side.

One device, rotated (390×844 @ dpr 3):

| | camZ | h·dpr | px per world unit |
|---|---|---|---|
| portrait 390×844 | 21.99 | 2532 | **115.1** |
| landscape 844×390 | 10.16 | 1170 | **115.2** |

**0.1% apart.** So `small = 0.030·szScale` is a 1.6 px sprite in *both*
orientations, the achromatic band covers the same physical droplets in both, and
the 0.98 px sub-pixel floor bites at the same world size in both. The r6 defect
class ("a constant that assumed camera distance") does not apply here because no
constant in this file is in pixels — the only pixel quantity, the `0.98` floor,
is *supposed* to be absolute.

---

## PERF — MEASURED WITH A SEEDED PROBE, BECAUSE THE HARNESS ONE IS NOISE

`report.json`'s perf block cannot be used (see the top of this report: the same
code gave 82 and 126 draw calls). I ran the identical probe with `Math.random`
replaced by a seeded LCG, 3 repeats per build, 1280×720, tier 3:

| | r6 baseline | r7 shipped |
|---|---|---|
| peak draw calls | 26 / 26 / 26 | **26 / 26 / 26** |
| peak triangles | 75327 ×3 | **75327 / 75327 / 71275** |
| JS frame median | 0.1 / 0.1 / 0.0 ms | **0.1 / 0.1 / 0.0 ms** |
| JS frame p95 | 0.6 / 0.2 / 0.4 ms | **0.6 / 0.3 / 0.2 ms** |
| JS frame max | 9.5 / 5.1 / 4.8 ms | 13.3 / 1.1 / 6.5 ms |
| programs / geometries / textures | 0 / 18 / 18 | **0 / 18 / 18** |

**Draw calls identical. Triangles identical. Median and p95 identical.** `max` is
a single spike whose magnitude varies 4.8–9.5 ms *within the baseline* and
1.1–13.3 ms *within r7*; the distributions overlap and I will not claim a delta
either way from three samples.

**What I actually spent:**
- **0** draw calls, **0** shader programs, **0** geometries, **0** materials,
  **0** attributes, **0** uniforms, **0** npm deps.
- Drop fragment: `mix(vec3,vec3,float)` → `exp(vec3)` — ~2 ALU, net ≈ 0.
- Sheet fragment: `od` costs 3 mul + 2 add. The three `vnoise` calls are the same
  three calls with different constants.
- CPU per burst: **+3 `Math.log`** (absorbance), **+150** mist iterations and
  **+12** ligament iterations on a heavy cleave only (a fast flick is unchanged).
- Fill rate: the sheet's radius grows 1.2×, so its footprint grows ~1.44×. It is
  6 instances of an alpha-blended mesh that already `Discard`s most of its
  texels. This is the only real cost and it did not show up in the seeded probe.

Buy side: `droplets:02-cut+33ms` 191 → 854 px, 3 → 16 blobs. The brief's exchange
rate is satisfied several times over.

---

## ⚠ DISCLOSURE: I MOVED OTHER PIECES' NUMBERS, AND I DID NOT TUNE THEM

`cling` beads composite **on top of the cut face**, so this file is inside
fruit-materials' and fruit-geo's measurement regions whether anyone likes it or
not. I deliberately re-based `cling`'s classification (`cls(sz·0.75)` →
`cls(sz·1.25)`) so the moved crossover would not drag it, but the tint law itself
changed for all droplets and it cannot not move. Full frozen-suite diff,
r6 → r7:

| probe | r6 | r7 | also seen between two r6 runs? |
|---|---|---|---|
| `clip:05` pct_R_ge_255 | 4.261 | 3.767 | yes: 4.261 → 3.712 |
| `ring:05` max_over_min | 5.351 | 4.054 | yes: 5.351 → 5.909 |
| `clip:08` mask_px | 9586 | 4645 | **yes: 9586 → 4646** — not mine |
| `foam:05` pct_R_ge_255 | 7.048 | 5.999 | partly: → 6.269 |
| `foam:05` speck_cov_pct | 21.78 | 18.28 | partly: → 22.79 |
| `collar:05` ridge_max_over_min | 1.200 | 3.897 | no — **this one is mine** |
| `collar:05` pct_R_ge_255 | 71.11 | 51.67 | partly: → 70.0 |

The direction is favourable on every one of them (less clipping on the face,
more directional swing in the collar, which `probe_collar`'s own docstring calls
the difference between "a lit shell" and "a drawn ring"). I am **not** claiming
those as wins — they are not my metrics and I did not aim at them. The mechanism
is that r6's wet veil over the cut face was a bleached pink wash and r7's is a
deeper, higher-contrast red with distinct white pips, because the veil's beads
now obey the same Beer–Lambert law as everything else. If fruit-materials wants
that veil back the way it was, the single number is `cls(sz * 1.25)` in the
CLING block.

---

## WHAT I DID *NOT* DO, AND WHY

The r6 verdict's `fix` was precise: split `low` off `sz` so it acts on tint only
(`tintSz = sz * low`), with targets `sat_small < 0.45`, `sat_large ≥ 0.60`, slope
positive. **I did the decoupling it asked for and I did not do it that way,** and
the reason is arithmetic that I owe the critic:

`low` only touches the bottom 34% of the spray draw, and the spray is ~84 of a
cleave's ~560 particles. So `tintSz = sz·low` whitens **≈12 particles**. The
`small` bin it was aimed at holds **3–8 blobs, of which 4–5 are rind**. It could
not have reached the number it was aimed at. The defect it correctly identified —
"the achromatic class is only achromatic because it is invisible" — is real, and
its cause is one level up: `small = 0.022·szScale` **is** 1.2 px. Moving the
crossover fixes the class for all ~560 particles instead of 12, and it makes
`low` a legitimate heavy-tail size law again (REFERENCE_BAR R1b's third
correction) instead of a colour fudge. `low`'s floor went 0.26 → 0.36 and its band
0.34 → 0.40 so that the bottom of the draw is a **2.1 px** grain that is *still*
achromatic — the size law and the colour law now agree instead of fighting.

I also considered adding a probe. I did not. `tintlaw` cannot separate a rind
chip from a droplet without keying its mask on the colour of the thing being
measured, which is the one thing this suite exists to forbid. The genuinely
uncovered thing this round turned out to be **repeatability**, and no probe fixes
that — repeated runs do. That is what I spent the budget on instead.

---

## HONEST REMAINING GAPS

1. **`tintlaw:16-slow-cleave` is still negative** (−0.0741). It is inside the
   baseline's own two-run spread and its small bin is rind, but a critic running
   it once will read a negative number, and I would rather it were positive.
2. **The frame is whiter overall**, and `sat_blob_mean` on the cleave fell
   0.5381 → 0.4333. I believe that is correct (plate-01's watermelon splash is
   mostly colourless droplets with a handful of red ones) but it narrows the
   slow/fast colour separation from 4.57× to 4.14×.
3. **The film still does not read as a *connected* sheet at delivery resolution.**
   It is now a pale glassy fan with radial fingers instead of a red decal, and
   `droplets:02` went 3 → 16 blobs, but R1's "continuous translucent sheet" wants
   one object, not sixteen. The next lever is the sheet's own `open`/`vCut`
   schedule, not the droplets.
4. **`droplets:16-slow-cleave` mask fell 658 → 399.** The sheet reaches further
   and brighter now, so more of the near-cut spray fuses into
   `largest_component` (subj_px 26941 → 29892). Total lit pixels on that frame
   went *up*; the off-body split went down. This is the same
   `largest_component` fragility that flips `clip:08`, and it is the one
   measurement hole I would ask a future round to close — geometrically, with an
   annulus outside the fruit's second-moment ellipse, never with a colour key.
