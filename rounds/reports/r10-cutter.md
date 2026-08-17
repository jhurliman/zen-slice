# Round 10 — cutter (cut faces & rind)

**Owner:** `src/fruit/species.js`, the cap/collar code (`capCoords`, `collarTilt`, `capShade`,
`wmLayers`, and the melon cut-face `albedo`/`relief` band terms). `fleshCells` is fruit-mat's and
I did not touch it.

---

## 0. PROBE HYGIENE — I ADDED NOTHING AND MODIFIED NOTHING

`tools/probes.py` md5 **9bf8a336f51f7032e4c1d7f264a0ab77**, PROBE_VERSION **15**, byte-identical
at the start and at the end of my round. I added no probe, deleted none, changed none, and did not
bump the version. (`git status` shows probes.py modified — that is the round-10 fruit-geo builder's
`defocus` addition, already present when I started.)

**CANARY, verified before and after, pasted as required:**

```
$ python3 tools/probes.py clip shots/r5/05-cut+500ms.png
mask_px 9490 / pct_R_ge_255 5.227 / mean_rgb (114.9, 75.8, 47.4) / GR_ratio 0.6599
probe_version 15
```

Every number below is the stdout of `python3 tools/probes.py <probe> <png> [win= scale= r0= r1=]`,
or stated arithmetic on two such outputs. Windows, `scale`, `r0`, `r1` and `mask_px` are printed on
both sides of every comparison. Scale-matched controls are `/tmp/plate640.png` (640x360 Lanczos)
and `/tmp/plate405.png` (405x228), rebuilt and re-verified against the r9 critic's published
values before use: `spokes /tmp/plate640.png win=122:216:208:308 scale=0.95 r0=0.80 r1=1.00` ->
mask 8292, ang_energy 54.65, ang_energy_hi **40.59**; plate405 win=77:137:132:195 -> mask 3327,
52.20, **36.90**. Both reproduce the verdict exactly.

I wrote three scratch diagnostics (`/home/claude/cutwork/{prof,vis,gate2}.py`). `vis.py` *draws*
`spokes`'s own sampling annulus by importing `probes.load / luma / largest_component /
second_moment_ellipse` — it re-implements nothing; `prof.py` prints a per-ring luma/RMS profile.
No number from either is quoted as a delta. Every delta in this report is a frozen probe.

---

## 1. CAPTURE HYGIENE — I BUILT AN ISOLATED TREE, AND I NEEDED IT

`src/fruit/species.js` changed md5 under me **twice** during capture (fruit-mat is editing the same
file this round; the r10 fruit-geo report flagged the identical problem). My first baseline pair is
therefore unattributable and is discarded.

Everything scored below was shot from `/home/claude/cutwork`, a private copy of `src/`, `tools/`
and `build.mjs` with `node_modules` symlinked, so that **the control and the test differ by my
edit and nothing else**. The final A/B control (`CTRL2`) is the *shipped* tree with a **two-line**
revert — `capCoords` withholds `fray` from the returned object and `normalNode` calls
`collarTilt(cc.rad)` — which makes every consumer fall through its `cc.fray === undefined` guard to
the round-9 expression exactly. Same tree, same everyone-else's-code, one mechanism toggled.

⚠ **Earlier variants (CTRL, A, B, C, D) predate a fruit-mat edit that arrived mid-round; E onward
include it.** That is why the variant table below is split, and why the shipped claim is quoted
only against `CTRL2`.

---

## 2. WHAT I SHIPPED

One file, `src/fruit/species.js`. No new draw call, triangle, material or program.

| site | change |
|---|---|
| `capCoords` (~1500) | the round-3 fbm is hoisted into `wraw`; `warp` and therefore `rad` are **bit-identical**. The *untapered* field, plus **one** new `noise2` tap at frequency 9.7, is published on `cc` as `fray`, through a two-sided gain `min(f*0.065, f*0.030)` and a safety clamp `[-0.100, +0.030]`. |
| `COLLAR_FRAY / COLLAR_FRAY_IN` | 0.065 / 0.030 — the two directions are *not* symmetric, by arithmetic, see below. |
| `collarTilt(rad, fray)` | the **pith-wall** step `ss(0.800, 0.858, .)` is evaluated at `rad - fray`. The dome step and the outer step are untouched. |
| `wmLayers` | `pith: ss(0.828, 0.880, rad - fray)`. `rind` untouched, so the band's **outer** edge against the peel is bit-identical. |
| melon `albedo` | the groove AO `ss(0.792,0.822)x(1-ss(0.822,0.856))` and the run-off line `ss(0.700,0.770)x(1-ss(0.770,0.812))` take the same frayed coordinate, so the crease stays welded to the join it is the crease *of*. |
| melon `relief` | the crease notch takes the same coordinate, so relief and albedo describe one wandering join instead of two rings up to 3 px apart. |

**Round 3's constraint is respected, not undone.** Nothing displaces the band. The r9 verdict's
"do not bodily displace a 0.052-wide band by +-0.055" is discharged by *arithmetic*: the pith ramp
ends at 0.880, the rind ramp starts at 0.930, so an outward excursion `e` still leaves solid cream
over `0.880+e .. 0.930`; at the positive gain's clamp (+0.030) that is 0.020 of `rad` — ~0.8 px —
of cream on the **worst ray in the frame**. The band can narrow by half and can never close. The
negative direction (pale reaching into the red) cannot destroy anything and is given 2.2x the gain.

**Cost.** +1 value-noise tap per `capCoords` call = 4 per cut-face fragment, ~8 ALU each, on cut
faces only. +0 draw calls, +0 triangles, +0 programs, +0 JS, verified in both `report.json`s
(§6). `node build.mjs` clean. No `ShaderMaterial` / `onBeforeCompile` / composer anywhere.

---

## 3. THE ONE CLAIM I PROVED

> **The shipped edge field raises the r9 acceptance statistic in BOTH orientations — by
> +2.4 and +1.7 counts against a same-build repeat spread of 1.2 and 0.3 — while spending
> nothing on chroma, level, the radial ramp or radial coherence. It is a real, attributable,
> two-orientation gain, and it is FIVE TIMES too small to reach the acceptance band, for a
> reason that is measured in §4 and is not a shading reason.**

Frozen `spokes`, identical `win`/`scale`/`r0`/`r1` on every side, `mask_px` printed:

| | CTRL2 | **F (shipped)** | F2 (repeat of F) | scale-matched plate |
|---|---|---|---|---|
| **LANDSCAPE** `win=216:284:298:382 scale=0.95 r0=0.80 r1=1.00` | | | | |
| ang_energy_hi | 20.74 | **23.69** | 22.52 | 40.59 (plate-640) |
| mask_px | 4805 | 4766 | 4750 | 8292 |
| **PORTRAIT** `win=262:308:96:154 scale=0.95 r0=0.80 r1=1.00` | | | | |
| ang_energy_hi | 19.21 | **21.05** | 20.74 | 36.90 (plate-405) |
| mask_px | 1846 | 1798 | 1881 | 3327 |

Shipped mean of the two F runs: landscape 23.11 (+2.37 over CTRL2), portrait 20.90 (+1.69).

**Nothing was spent to get it** (same frames, frozen probes, both orientations):

| guard-rail | CTRL2 | F / F2 | status |
|---|---|---|---|
| `spokes` face window scale=0.70 `radial_coh_hi` L (plate-640 0.4994) | 0.6131 | 0.6177 / 0.5899 | flat — **the starburst axis did not move** |
| same, P | 0.7595 | 0.7159 / 0.7089 | **down** (better) |
| `collar` `ridge_t_med` L (r9 gate 0.60..0.70) | 0.555 | 0.613 / 0.639 | CTRL2 had fallen **below** the gate; F is back inside it |
| `collar` `sectors_populated` L / P | 12/12 | 12/12 | held — no ray lost its band |
| `collar` `ridge_max_over_min` L (plate-640 `win=122:216:208:308` 1.320, re-verified) | 1.472 | 1.573 / 1.599 | flat |
| `foam` face win scale=0.70 `flesh_mean_rgb` L | (176.7, 62.6, 47.5) | (175.5, 62.2, 47.4) | flat |
| `foam` face win scale=0.70 `flesh_GR` L | 0.3542 | 0.3541 / 0.3564 | flat — **no chroma spent** |
| `foam` default window `flesh_GR` L (r9 gate <= 0.3675) | 0.3767 (fails) | 0.3653 / 0.3614 (passes) | improved |
| `silhouette` 01-whole `boundary_cv` L / P | 0.0922 / 0.0995 | 0.0926 / 0.0995 | held |
| `clip` 05 `pct_R_ge_255` L | 2.803 | 3.811 / 4.025 | **+1.1 pp, mine, declared** |

**The other five species' caps were re-measured, as instructed, because `capCoords` and
`collarTilt` are shared** (only `wmLayers` is melon-only, so every species' collar now frays its
pith-wall *tilt*). `08-citrus-caps`, frozen `collar win=232:330:168:292` and `clip`:
ridge_max_over_min 2.428 (CTRL2) -> 2.166 / 2.469 (F / F2), ridge_t_med 0.579 -> 0.605 / 0.534,
sectors_populated 12/12 throughout, `clip` GR_ratio 0.6989 -> 0.7027 / 0.7090, mask 5201 -> 5243 /
4893. Flat inside the repeat spread on every field: nothing else broke.

The visible result is `rounds/reports/r10-cutter-AB-landscape.png` and `-portrait.png` (CTRL2 left,
F right, 6x/8x NEAREST, identical crop): the band's inner boundary is broken in several places and
its width now varies visibly along the arc, where CTRL2's is a stroke of one width. It is a real
change and it is a **small** one — at this raster it cannot be anything else, which is §4.

⚠ **One number moved against me and I am declaring it rather than letting the critic find it:**
`clip pct_R_ge_255` on 05 landscape 2.803 -> 3.811/4.025. The frayed pith reaches ~1 px further
into the flesh on the rays where it reaches in, and the pith is the brightest albedo on the face.
It is inside plate-01's own face clipping and I did not chase it, but it is mine.

⚠ **The one place a reader will suspect a regression, measured to the bottom rather than waved
away.** On portrait's `foam` DEFAULT window (`win=252:340:90:180`) flesh R reads 119.2 on CTRL2 and
97.5 / 85.9 on F / F2, i.e. it *looks* like the fray costs 23% of the near face's red on the
shipping raster. I built a variant specifically to test that (G, §5(e)) and then measured the
statistic on **every** capture I have. It does not survive:

| P `foam win=252:340:90:180` | CTRL | A | B | C | D | E | E2 | CTRL2 | F | F2 | G |
|---|---|---|---|---|---|---|---|---|---|---|---|
| flesh R | 98.5 | 98.1 | 110.1 | 94.1 | 82.5 | 114.6 | **119.1** | **119.2** | 97.5 | 85.9 | 80.1 |
| flesh_GR | 0.505 | 0.505 | 0.468 | 0.525 | 0.593 | 0.460 | 0.450 | 0.445 | 0.511 | 0.572 | 0.618 |
| mask_px | 2509 | 2509 | 2500 | 2524 | 2529 | 2494 | 2487 | 2489 | 2505 | 2533 | 2489 |

Eleven captures, mask stable to 1.8%, values scattered over 80..119 with **11.6 between two runs of
ONE build** (F/F2) and with the *most* frayed build in the set (E, fray + the rejected pale apron)
sitting at the **top** of the range. The window cannot resolve this change in either direction.
It is quoted here in full rather than omitted, and it is not claimed as a win or conceded as a
loss. Portrait's face is 27 px across (§4.4); that is the actual problem with it.

---

## 4. THE NEGATIVE RESULT, WHICH IS THE ROUND'S REAL OUTPUT

The r9 acceptance band was ang_energy_hi 19.27 -> **>= 30** landscape and 17.40 -> **>= 28**
portrait. I built and shot **six** variants at three amplitudes and two frequencies. None of them
comes close, and three independent measurements say why. **The mechanism is not underpowered; the
citation is not measuring the collar.**

### 4.1 The four builds, on the exact frozen citation

Pre-fruit-mat-edit tree (CTRL/A/B/C/D all mutually attributable):

| build | what | ang_energy_hi L | P |
|---|---|---|---|
| CTRL | round-9 collar | 25.60 | 21.26 |
| A | fray at exactly the prescribed 0.4x band width (+-0.021) | 24.02 | 20.83 |
| B | 2x amplitude, hard asymmetric clamp | 23.44 | 19.85 |
| C | + a fine octave (k~52) applied to the **wide** dome term too | 23.69 | 22.37 |
| D | C with the dome term reverted | 24.98 | 20.05 |

Post-edit tree: CTRL2 20.74 / 19.21 -> **F 23.69 / 21.05**, F2 22.52 / 20.74.

The prescribed amplitude (A) moves the statistic **-1.58**. Doubling it moves it **-2.16**. The
shipped build's honest +2.4 / +1.7 is the best of six and is 20% of the requested move.

### 4.2 The reference side of the citation contains the blade, the void and other fruit

`rounds/reports/r10-cutter-annulus-plate640.png` and `-plate405.png` draw `spokes`'s own annulus
(green r0=0.80, magenta r1=1.00) on the plate, using the probe's own `second_moment_ellipse` on the
probe's own mask. In plate-01's window **the melon touches other objects**, so
`largest_component(luma > 8)` merges them: the fitted ellipse is a=54.7, b=51.2 — near-circular,
where the melon face is not — and the annulus it defines crosses **the blade/juice streak**
(the brightest thing in the frame), **dark background**, and neighbouring debris. The r9 critic's
mask_px 8292 vs our 4837 was read as a scale match; it is 8292 px of *several fruit*.

On our side (`-ours-L.png`, `-ours-P.png`) the same annulus crosses the pith band, the rind and
**pure black void**, because our staging is REFERENCE_BAR's black void by instruction.

The frozen probe says the same thing without the pictures, using its own documented `r0`/`r1`
kwargs at matched scale on both sides:

| band (scale=0.95) | ours L | plate-640 | ratio | ours P | plate-405 | ratio |
|---|---|---|---|---|---|---|
| r0=0.12 r1=0.60 — **deep flesh, no collar anywhere in it** | 20.05 | 25.08 | 0.80 | 17.26 | 20.55 | 0.84 |
| r0=0.55 r1=0.80 | 26.80 | 32.67 | 0.82 | 27.49 | 28.80 | 0.95 |
| r0=0.80 r1=1.00 — **the citation** | 25.60 | 40.59 | 0.63 | 21.26 | 36.90 | 0.58 |

The plate carries 25.08 counts of k>=6 angular energy **in a band that contains no pith, no rind
and no collar**. The statistic is a whole-face fine-texture measure (which is fruit-mat's
`fleshCells`, and its own r9 verdict measures the same deficit from the other side) plus, in the
outer band, whatever else the plate's composition puts there. There is a genuine collar-specific
excess (0.63 against 0.80) and the shipped fix addresses it; it is roughly a third of the gap the
acceptance band ascribes to me.

### 4.3 The harness's run-to-run spread is the same size as the effect being steered

**Two runs of one build, zero source changes, both orientations:**

| statistic | E | E2 | F | F2 | spread |
|---|---|---|---|---|---|
| ang_energy_hi L | 22.40 | 21.37 | 23.69 | 22.52 | 1.03 / 1.17 |
| ang_energy_hi P | 18.35 | 17.87 | 21.05 | 20.74 | 0.48 / 0.31 |
| `spokes` face `radial_coh_hi` L | 0.6245 | 0.5509 | 0.6177 | 0.5899 | **0.074** / 0.028 |
| `collar ridge_max_over_min` P | 5.248 | 4.598 | 4.767 | 4.761 | 0.65 / 0.01 |
| `foam` face `flesh_mean_rgb`.R P | 188.2 | 188.1 | 180.2 | 163.1 | 0.1 / **17.1** |
| `spokes` mask_px L | 4742 | 4678 | 4766 | 4750 | 64 / 16 |
| `report.json` peakDrawCalls (desktop) | — | — | 79 | **51** | liveBodies 51 vs **27** |

The harness is **not deterministic**: two runs of one build reached the same beat with 51 and 27
live bodies. On the melon frames the melon itself is scripted, so the cut-face masks only move
~1%, but every statistic on them carries a 0.3-1.2 count (and, in portrait's small windows, a
12%) repeat spread. **The r9 deltas this piece was scored on — 21.01 -> 19.27 landscape and
22.06 -> 17.40 portrait, quoted as "falling this round" — are 1.7 and 4.7 repeat spreads; the
landscape half of that is inside the noise.** This is the same disease as the round-10 perf
correction (`cpu.max` swinging 8.5x on one build), found independently on the image statistics.
`cpu.max` did it again here: 2.6 ms (CTRL2) vs **20.3 ms** (F2) desktop, on builds that differ by
two lines; `cpu.p95` is 0.2-1.1 ms everywhere, under the 2.0 bar.

**Recommendation for round 11, not for me to impose:** no image statistic should be quoted from a
single capture again. Two runs minimum, spread printed, or a seeded director.

### 4.4 The arithmetic that makes a torn edge impossible at this raster

`spokes` prints its own ellipse: landscape a=44.7 b=35.6, portrait a=29.9 b=20.3 (scale 0.95). The
cut face's outer edge sits at t~0.90 of it (measured off the rendered overlay), so `cc.rad = 1` is
**~40 px** landscape and **~27 px** portrait on the major axis, and ~32 / ~18 px on the minor.

* the whole pale zone, `rad` 0.828 -> 0.968, is **0.14 of the radius = 5.6 px L / 3.8 px P**;
* the verdict's prescribed tear, 0.4 x the 0.052 ramp, is **0.84 px L / 0.57 px P** — sub-pixel,
  which is exactly what variant A measured;
* an amplitude that *is* visible (variant B/D, +-3 px) either dilutes the band's colour
  composition in portrait (`foam` face R 176.8 -> 158.3, flesh_GR 0.4003 -> 0.4514 on the D pair)
  or, if it is allowed onto any term wider than the band, becomes a **starburst** (variant C:
  `radial_coh_hi` 0.4952 -> 0.5888 against plate-640's 0.4994 — see the code comment I left at
  `collarTilt`, this is the one line to read before widening the fray's scope).

The cause is upstream of the shader. `silhouette` on the shipped 01-whole-watermelon:
**frame_height_pct 40.56 landscape and 18.45 portrait** (mask 12643 / 4369). REFERENCE_BAR R1:
"Watermelon size ~55% of frame height. It **dominates**." plate-01 at 640 puts ~100 px across the
melon's cut face; we put 62 px landscape and **40 px portrait**. A pith zone that is 6-8 ragged px
on the reference is 5.6 px for us landscape and 3.8 px portrait, and no shader can make 3.8 px of
band read as torn tissue. **Round 11's biggest available win on my axis is not on my axis: it is
+35% of subject size, especially in portrait.** Requested in §7.

---

## 5. WHAT I REFUSE, WITH THE CODE

**(a) Fix item (2), "let the wet film onto the band", is based on a misreading of `ss` and I did
not apply it.** The instruction: "`wetField`'s `lig` is gated by `ss(0.25,0.92,cc.rad)`, i.e. it is
faded OUT across exactly the annulus that needs it ... move the gate's upper edge out past 1.0 so
the band keeps its film."

`ss` is defined at `species.js:580`:

```js
function ss(a, b, x) {
  if (typeof a === 'number' && typeof b === 'number' && a > b) {
    return smoothstep(b, a, x).oneMinus();          // only a DESCENDING pair flips
  }
  return smoothstep(a, b, x);
}
```

`0.25 < 0.92`, so `ss(0.25, 0.92, cc.rad)` is `smoothstep(0.25, 0.92, rad)`: **zero at the centre
and one from rad 0.92 outward**. The ligament film is at *full* strength across the collar
already — it is faded out of the face's *middle*, not its rim. Moving the upper edge "past 1.0"
would take the gate to ~0.85 at the band and **remove** ~15% of the film there, i.e. do the
opposite of the intent. The same file uses the descending form four lines earlier
(`ss(0.90, 0.70, r0)` in `capCoords`), which is what makes the two easy to confuse.
No change made; `wetField` is byte-identical.

**(b) I did not chase collar width in either direction** (as instructed), and I note that the
shipped fray's two-sided gain has a slightly negative mean by construction, so `ridge_width_px_med`
moves 3.76 -> 4.0/3.53 landscape and 3.04 -> 3.00/3.00 portrait. Both are inside the repeat spread
and neither is claimed.

**(c) I did not spend the round on level, chroma or the radial ramp** (as instructed). `foam` face
`flesh_mean_rgb` and `flesh_GR` are flat to three decimals across the A/B (§3).

**(e) The mean-corrected fray was built, shot and NOT kept** (`.add(0.0044)`, shots/r10-cutter-G,
both orientations, comment left at `COLLAR_FRAY`). The two-sided gain has expectation -0.0044 of the
cap radius, i.e. the band's inner edge sits **0.18 px landscape / 0.12 px portrait** further in on
average; the verdict asks that the band's centre not move and a fifth of a pixel does not move it,
but I built the correction rather than assert that. Result: it removed the measured gain
(ang_energy_hi 23.69/22.52 -> 21.69 L, 21.05/20.74 -> 19.60 P, against repeat spreads of 1.17/0.31)
and did not recover the portrait window it was built to test (80.1, the lowest of eleven captures).
Not shipped.

**(f) One capture is quarantined and I am saying so rather than letting it into the mean.**
`shots/r10-cutter-F3[-iphone]` is the shipped code shot after a *further* concurrent fruit-mat edit
landed in the shared tree (`fleshCells`'s crest/`grv` constants moved again). Its collar-annulus
numbers are the best of the set (24.34 L / 22.13 P) and I am **not** counting them: its
`foam` face flesh_GR is 0.3857 against 0.3541 on the F/F2/G/CTRL2 family, which is the signature of
the other builder's edit, not of mine. The claim in §3 stands on CTRL2 vs F/F2 only.

**(d) The pith-invasion apron was built, shot and REJECTED, and the code is left commented in
place with the number that killed it** (`species.js`, melon albedo, after `pithC`). Mixing `pithC`
into the flesh through the already-computed ridged field at weight 0.42 gives the plate's actual
morphology — pale filaments standing in the red — and raises the face's fine angular energy
20.83 -> 22.75 landscape. It also takes `radial_coh_hi` 0.4952 -> 0.6245 against plate-640's
0.4994, i.e. it buys texture on the auto-fail axis. **The mechanism is general and it is a
cross-piece conflict, not my bug:** the probe's rings are ~1 px apart, so *any* texture whose
features exceed 1 px correlates between adjacent rings whatever its orientation — and the r9
fruit-mat verdict asks the same face for `speck_median_area` 2.0 -> >= 3.5, i.e. for bigger
features. **`radial_coh_hi` and `speck_median_area` cannot both be gated on the same face by two
owners.** Someone has to own that trade; I refused to make it unilaterally.

---

## 6. PERF (both orientations, from the sanctioned `report.json`)

| | CTRL2 desktop | F desktop | CTRL2 iphone | F iphone | bar |
|---|---|---|---|---|---|
| peakDrawCalls | 73 | 79 | 115 | **115** | 120 |
| peakTriangles | 146,603 | 155,889 | 155,891 | **157,293** | 250,000 |
| cpu p95 (ms) | 0.2 | 0.5 | 0.2 | 1.1 | 2.0 |
| cpu max (ms) | 2.6 | 3.2 | 7.4 | 14.1 | — (noise, §4.3) |

My change is shader-only: **+0 draw calls, +0 triangles, +0 programs**. The draw-call/triangle
differences above are the director's run-to-run body count (§4.3), not mine — the same build (F vs
F2) swings 79 -> 51 calls by itself. Portrait is inside both hard ceilings for the first time,
which is the round-10 perf owner's win, not mine.

---

## 7. REQUESTS — FILES I DO NOT OWN, SO I DID NOT TOUCH THEM

1. **SUBJECT SIZE, and it is the largest single lever on this piece.** `silhouette`
   01-whole-watermelon `frame_height_pct` **40.56 landscape / 18.45 portrait** against
   REFERENCE_BAR's "~55% of frame height, it dominates". At 18.45% the portrait melon's cut face is
   40 px across and its entire pith zone is 3.8 px; every pixel-kernel statistic on my axis is
   starved there before a shader runs. Whoever owns the camera/staging: +35% subject size in
   **portrait** is worth more to the cut face than anything left in `species.js`.
2. **fruit-mat.** §4.2: the collar-annulus deficit is 0.63 of plate but the deep-flesh deficit is
   0.80 in a band containing no collar at all — the majority of the "collar" citation is
   `fleshCells`'s whole-face texture. And §5(d): `radial_coh_hi` (mine to hold) and
   `speck_median_area` (yours to raise) are the same physical quantity with opposite signs. Please
   quote `radial_coh_hi` beside every `speck_median_area` you move.
3. **Harness / integration.** (i) `src/fruit/species.js` changed md5 twice during my captures;
   two builders sharing one working tree makes delivered-pixel A/Bs unattributable — worktrees or
   serialised captures, please. (ii) The director is unseeded: two runs of one build reached
   05-cut+500ms with 51 and 27 live bodies (§4.3).
4. **Whoever writes the r10 scoring note.** The r9 acceptance band for this piece
   (`spokes ... r0=0.80 r1=1.00` >= 30 / >= 28) should not be carried into round 11 unmodified:
   §4.2 shows its reference side is a merged multi-object mask that includes the blade streak, and
   §4.3 shows its repeat spread is ~1.2 counts.

---

## 8. STILL OPEN ON MY AXIS (not attempted this round, and why)

* **The citrus pith band, fifth round.** `collar shots/r10-cutter-CTRL/08-citrus-caps.png
  win=232:330:168:292` mask 8801, `ridge_max_over_min` **2.548** against plate-796's 1.318,
  `pct_R_ge_255` **46.67** against 6.11 — at matched scale, and both worse than r9's 2.276/48.33.
  The band *is* authored (`orLayers`, `pith: ss(0.855,0.905,rad)`; the pith albedo is at
  `species.js` ~3243) and it is not reading, for a reason the rendered overlay
  (`rounds/reports/r10-cutter-citrus-annulus.png`) makes obvious: on 08-citrus-caps the orange's cap is nearly
  edge-on, so its whole 0.14-of-radius pale zone is compressed into ~1 px on the minor axis while
  the face's membranes are clipped white. This is a *pose/exposure* problem before it is a band
  problem and it needs its own round; I would rather hand it over honestly than bolt a wider band
  onto a 1 px projection.
* **The far face** (fix item c). `foam win=180:206:298:378` on the pre-edit control: mask 1420,
  speck_cov_pct 5.56, whitish_cov_pct 0.56 (r9: 4.21 / 0.21, so it recovered slightly on its own
  this round). The prescribed fix — move the pale mesh's lift from the diffuse onto the
  transmission floor — lands in `fleshCells`'s `pale` population and in `sssMask`, i.e. across the
  fruit-mat boundary, in the same round that fruit-mat is re-solving both. Left for serialisation.

---

## 9. ARTEFACTS

| path | what |
|---|---|
| `/home/claude/juice/src/fruit/species.js` | the only source file I changed |
| `/home/claude/juice/shots/r10-cutter-F`, `-F-iphone` | **the shipped build**, both orientations |
| `/home/claude/juice/shots/r10-cutter-F2`, `-F2-iphone` | second run of the shipped build (repeat spread) |
| `/home/claude/juice/shots/r10-cutter-CTRL2`, `-CTRL2-iphone` | the matched two-line control |
| `/home/claude/juice/shots/r10-cutter-{A,B,C,D,E,E2}[-iphone]` | the rejected amplitudes/frequencies, kept because §4.1 and §5(d) cite them |
| `/home/claude/juice/shots/r10-cutter-G[-iphone]` | the mean-corrected variant, rejected — §5(e) |
| `/home/claude/juice/shots/r10-cutter-F3[-iphone]` | shipped code, **quarantined** capture — §5(f) |
| `/home/claude/juice/shots/r10-cutter-CTRL`, `-CTRL-iphone` | the pre-fruit-mat-edit control for A-D |
| `rounds/reports/r10-cutter-AB-landscape.png`, `-portrait.png` | CTRL2 vs F, identical crop, 6x / 8x NEAREST |
| `rounds/reports/r10-cutter-annulus-plate640.png`, `-plate405.png` | the acceptance citation's annulus drawn on the reference — §4.2 |
| `rounds/reports/r10-cutter-annulus-ours-L.png`, `-P.png` | the same annulus on our shipped frames |
| `/home/claude/cutwork/` | the isolated build tree, `gate2.py` (the A/B gate), `prof.py`, `vis.py` |

Re-derive the headline in two commands:

```
python3 tools/probes.py spokes shots/r10-cutter-F/05-cut+500ms.png \
        win=216:284:298:382 scale=0.95 r0=0.80 r1=1.00
python3 tools/probes.py spokes shots/r10-cutter-CTRL2/05-cut+500ms.png \
        win=216:284:298:382 scale=0.95 r0=0.80 r1=1.00
```
