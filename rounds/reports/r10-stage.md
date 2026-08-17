# r10 — stage.js: the streak's core bleaches

FILE TOUCHED: `src/render/stage.js`. **Nothing else.** `git diff --stat` on my
work is `src/render/stage.js | 144 insertions(+), 26 deletions(-)` plus the
additive probe below.

## THE ONE CLAIM I PROVED

**The blade streak's core is now achromatic white with the orange in the halo,
on the shipped hero AND on the shipped portrait beat, and it reaches plate-01's
level while doing it.** `bleach` core saturation at the `_radon_ridge` peak, p50
over 13 stations, **0.434 → 0.017 hero** and **0.466 → 0.094 portrait**, against
plate-01's 0.054; core RGB `[215,168,127] → [235,234,234]` hero and
`[219,161,118] → [239,232,221]` portrait against the plate's `[243,235,239]`;
`lens` ribbon peak p50 **161.8 → 234.0 hero** and **176.1 → 234.6 portrait**
against the plate's 237.4. The r9 verdict asked for core_sat under 0.15 with at
least 8 of 13 stations under 0.10; the shipped hero is at 0.017 with **9** and
portrait at 0.094 with **9**.

**AND I MISSED TWO OF THE HOLD-CONDITIONS, BOTH ON THE SAME AXIS, AND I CAN SHOW
THEY ARE THE PRICE OF THE FIX RATHER THAN A TUNING FAILURE.** `filament
flattop_p50` is **0.345 hero / 0.400 portrait** against the 0.29–0.34 band, and
the hero's worst single-pixel wing drop at x=1208/1066 is **1.472/1.426** against
the 1.40 bar (x=924 is 1.390, inside). Section 4 is the measurement that says why,
including a mechanism I built, measured and am recording as a dead end.

---

## 0. INSTRUMENT FIRST

`tools/probes.py`: I **added** one probe, `bleach`, and appended one SUITE row.
No existing probe's executable code changed by one character; the loud notice is
in the file at the v12 → v13 block. Two other agents bumped the version during my
session (v13 → v14 `referent` landed on top of mine); I re-read the file, my
addition survived the merge intact, and I re-canaried after.

    CANARY BEFORE (v12):  clip shots/r5/05-cut+500ms.png -> mask_px 9490  pct_R_ge_255 5.227
    CANARY AFTER  (v13):  clip shots/r5/05-cut+500ms.png -> mask_px 9490  pct_R_ge_255 5.227
    CANARY AFTER  (v14, post-merge with `referent`):
                          clip shots/r5/05-cut+500ms.png -> mask_px 9490  pct_R_ge_255 5.227

**Why a new probe at all.** The r9 verdict's headline is a COLOUR statistic on
the streak core and it was computed in a critic's scratch script, so neither
party could re-run it. Every streak probe in v12 — `lens`, `filament`, `glare` —
reads luma only, by design; `clip` and `foam` read colour but only inside the cut
face. Nothing in the frozen suite could see the hue of the ridge, which means the
headline number of the round could not be checked by the person being asked to
move it. `bleach` uses the **same** `_radon_ridge` call, the same perpendicular
window, and selects the core **geometrically** (the profile's luma peak), so it
cannot be steered by colour. It reports `core_sat` (1 px), `core_sat3` (3 px
mean — strictly harder, so a one-pixel white needle inside an amber core cannot
pass), `core_rgb_p50`, `peak`, and `wing_sat` at the 20 %-of-amplitude crossing.

It reproduces the critic's scratch numbers closely enough to inherit its
baselines: plate-01 native **0.054 / 237.4** (critic: 0.045 / 237.4), r9 hero
**0.434 / 177.4** (critic: 0.445 / 177.4), r9 portrait 04 **0.466 / 170.7**
(critic: 0.451 / 170.9).

### 0.1 MATCHED SCALE (rule 2), and the citation that works against me

`core_sat` has a 1-px kernel, so the plate must be cited at our raster.
Lanczos, `mask_px` on both sides:

| plate-01 | mask_px | core_sat_p50 | core_sat3_p50 | peak_p50 | wing_sat_p50 |
|---|---|---|---|---|---|
| native 1672×941 | 1 144 053 | **0.054** | 0.096 | 237.4 | 0.332 |
| @1280 (hero raster) | 669 632 | **0.050** | 0.137 | 237.1 | 0.552 |
| @640 | 168 401 | 0.052 | 0.145 | 240.5 | 0.490 |
| @405 | 68 815 | 0.069 | 0.207 | 225.4 | 0.681 |
| @215 (portrait raster) | 20 119 | **0.071** | 0.165 | 224.6 | 0.693 |

`core_sat_p50` moves 0.050 → 0.071 across a 7.8× resample — the flattest
scale behaviour of any statistic this project has cited. **The citation that
works AGAINST the finding is @215, 0.071**, because downsampling mixes the orange
wing into the white core and raises the plate's own number. Our r9 portrait was
0.466 against that hardest-possible 0.071, i.e. 6.6× too saturated at the
friendliest reading. The finding survives at every scale, which is the opposite
of the round-9 collar-width retraction and is why I trusted it.

`core_sat3` is genuinely scale-sensitive (0.096 → 0.207) and is quoted below
only against the matched raster.

⚠ One caveat I am putting in writing rather than leaving for a critic:
`bleach reference/plate-02-highspeed-citrus.jpeg` returns core_sat_p50 **0.402**
with n = 6. That is NOT a counter-example — plate-02 has no rim streak, so
`_radon_ridge` locks onto the brightest straight structure it can find, which is
not a flare. **Do not cite plate-02 on this probe.** plate-01 is the referent for
the streak, exactly as REFERENCE_BAR says ("staging, grade, background, key
light: follow R1").

---

## 1. THE DIAGNOSIS WAS RIGHT AND INCOMPLETE, AND THE MISSING HALF IS THE REASON IT WENT THE WRONG WAY IN R9

The verdict: `kn = fCeil*(1-exp(-pk/fCeil))/pk` from `pk = max(r,g,b)`, applied
to all three channels, makes the emitted **chromaticity exactly invariant to
radiance** — r : g : b is the same triple at L = 0.01 and at L = 100 — so no
exposure can bleach the core. That is correct, and the fix is one expression:

```js
// was
const pk = max(lit.r, max(lit.g, lit.b)).max(1e-5).toVar();
const kn = U.fCeil.mul(pk.div(U.fCeil).negate().exp().oneMinus()).div(pk).toVar();
return vec4(lit.mul(kn), 1.0);
// now
const kn = (x) => U.fCeil.mul(x.div(U.fCeil).negate().exp().oneMinus());
const pk = max(litO.r, max(litO.g, litO.b)).max(1e-5).toVar();
return vec4(mix(litO.mul(kn(pk).div(pk)), kn(litO), U.fBleach), 1.0);
```

Same curve, same `fCeil`, same asymptote; `fBleach` mixes the two forms so the
old behaviour stays bisectable at runtime without reverting the file. Shipped 1.

**But the knee alone does essentially nothing, and neither does `fApA` or
`fKappa`.** Measured, hero, per-channel knee ON, round-9 geometry otherwise:

| over-drive of the hot group | core_sat_p50 | peak_p50 |
|---|---|---|
| ×1 (r9 radiance) | 0.326 | 185.6 |
| ×2 | 0.193 | 210.5 |
| ×4 | 0.093 | 228.1 |
| ×8 | 0.041 | 235.2 |

and the verdict's own suggested lever, `fApA` (the glare-core amplitude), is a
**worse** road to the same place — at `fApA` 2 (4.4× r9) core_sat is 0.092 but
`filament flattop_p50` is already 0.556 and `glare u05_u50` 2.19, both outside
their bands, because that lobe is not narrow enough to over-drive on its own.

### 1.1 The structural half nobody had named: `wCore`'s longitudinal gate

`wCore = ends*(hot*0.94 + 0.06)`. `hot` is a gaussian of reciprocal width 2.40
about the hot spot, so **the white core lobe sits at 6 % of its height over most
of the span** and twelve of thirteen ridge stations were pure `fWarm` by
construction. That is why r9 read "only ONE station of thirteen reaches white".

It cannot be fixed by exposure: `fWarm` 0xff9c46 has linear B/R = 0.058, so
bleaching *that* to core_sat 0.15 needs the red channel ≈ 33× over the ceiling,
and a clip that deep is a plateau — measured, a global ×8 over-drive takes
`flattop_p50` to 0.529 hero / 0.478 portrait, which is round 8's slab rebuilt out
of clipping.

The file's own comment had conflated two meanings of "core". Round 6's disaster
was a streak that was neutral cream **along its length**; the sentence that
produced — "the WHITE core is what belongs to the hot spot" — pinned the white
lobe to a **longitudinal** gate. plate-01's white is **transverse** and runs the
whole span: `bleach reference/plate-01.png` gives 9 of 13 stations under 0.10 and
`peak_n_ge_230` 10 of 13, while `wing_sat_p50` is 0.332. White in the middle of
the cross-section at nearly every station, orange at the edges.

So `fCoreF` (that floor) is now a uniform, shipped at **1.0**.

**AND THE ROUND-6 FAILURE IS NOW INSTRUMENTED RATHER THAN ARGUED.** What made
"cream from end to end" undetectable in round 6 is that no probe separated the
middle of the cross-section from its wings. `bleach` does — `core_sat` and
`wing_sat` are the same statistic at two heights on one profile. **The shipped
build is defended by the wing, not by the core:** `wing_sat_p50` is **0.793**
hero and **0.918** portrait, against plate-01's 0.552 @1280 and 0.693 @215. The
wing is still *more* saturated than the plate's; it did not go cream. If a later
round drives `wing_sat` toward `core_sat`, it has rebuilt round 6, and that is
now one probe call away from being visible.

I did **not** touch `fWarm`. Its value is byte-identical to round 9.

---

## 2. THE HEADLINE, BOTH ORIENTATIONS, SHIPPED FRAMES

`node tools/shoot.mjs --out shots/r10-stage --scale 0.5 --deadline 600 --gl --hero`
and the same with `--device iphone`. Zero page errors, zero console errors,
`complete: true` in all four reports.

### LANDSCAPE — `shots/r10-stage/00-hero.png`, 1280×720 (r9: `shots/r9/00-hero.png`, 1280×720)

| statistic | r9 | **r10** | plate-01 @1280 | gate | |
|---|---|---|---|---|---|
| `bleach` mask_px | 132 751 | 162 376 | 669 632 | — | same raster |
| **`bleach core_sat_p50`** | 0.434 | **0.017** | 0.050 | < 0.15 | ✅ |
| **stations under 0.10** | 1 / 13 | **9 / 13** | 8 / 13 | ≥ 8 | ✅ |
| `bleach core_sat3_p50` | 0.461 | **0.015** | 0.137 | — | ✅ |
| `bleach core_rgb_p50` | [215,168,127] | **[235,234,234]** | [246,236,235] | — | ✅ |
| **`lens` ribbon peak p50** | 161.8 | **234.0** | 237.1 | > 215 | ✅ |
| `bleach peak_p50` | 177.4 | 234.2 | 237.1 | — | ✅ |
| `bleach wing_sat_p50` | 0.925 | 0.793 | 0.552 | stay amber | ✅ |
| `filament flattop_p50` | 0.333 | **0.345** | 0.300 (native) | 0.29–0.34 | ❌ by 0.005 |
| `glare u05_u50_p50` | 1.953 | 2.090 | 1.970 | 1.4–2.1 | ✅ |
| `glare u20_u50_p50` | 1.463 | 1.395 | 1.479 | 1.30–1.55 | ✅ |
| `lens` ribbon peak_max/min | 1.543 | 1.161 | 1.49 | ≤ 1.8 | ✅ |
| `void` 01 corner_max | 2.93 | **2.90** | — | ≤ 3.0 | ✅ |
| wing drop x=1208 / 1066 / 924 | 1.352 / 1.300 / 1.307 | **1.472 / 1.426 / 1.390** | — | < 1.40 | ❌ ×2 |

### PORTRAIT — `shots/r10-stage-iphone/04-cut+250ms.png`, 215×466 (r9: `shots/r9-iphone/04-cut+250ms.png`, 215×466)

| statistic | r9 | **r10** | plate-01 @215 | gate | |
|---|---|---|---|---|---|
| `bleach` mask_px | 8 263 | 8 841 | 20 119 | — | same raster |
| **`bleach core_sat_p50`** | 0.466 | **0.094** | 0.071 | < 0.15 | ✅ |
| **stations under 0.10** | 1 / 13 | **9 / 13** | 7 / 13 | ≥ 8 | ✅ |
| `bleach core_sat3_p50` | 0.522 | **0.132** | 0.165 | — | ✅ |
| `bleach core_rgb_p50` | [219,161,118] | **[239,232,221]** | [242,223,223] | — | ✅ |
| **`lens` ribbon peak p50** | 176.1 | **234.6** | 224.6 | > 215 | ✅ |
| `bleach peak_p50` | 170.7 | 232.7 | 224.6 | — | ✅ |
| `bleach wing_sat_p50` | 0.917 | 0.918 | 0.693 | stay amber | ✅ |
| `filament flattop_p50` | 0.293 | **0.400** | 0.300 (native) | 0.29–0.34 | ❌ by 0.060 |
| `glare u05_u50_p50` | 1.924 | 1.954 | 1.970 | 1.4–2.1 | ✅ |
| `glare u20_u50_p50` | 1.429 | 1.359 | 1.479 | 1.30–1.55 | ✅ |
| `lens` ribbon peak_max/min | 1.776 | 1.139 | — | ≤ 1.8 | ✅ |
| `void` 01 corner_max | 2.98 | 2.98 | — | ≤ 3.0 | ✅ |

The landscape 04-cut+250ms beat at 640×360 tells the same story with a
same-tree control rather than a cross-round one: core_sat **0.457 → 0.071**,
peak **176.9 → 233.7**, core RGB [226,167,125] → [240,233,222].

### Repeatability — I shot the shipped build twice

Two unseeded runs of the identical source: hero `flattop_p50` 0.344 / 0.345,
`u05_u50` 2.056 / 2.090, `u20_u50` 1.402 / 1.395, `core_sat_p50` 0.013 / 0.017,
stations under 0.10 11 / 9, `lens` peak p50 235.1 / 234.0, wing drops
1.472 / 1.426 / 1.390 in **both**. The headline and the two misses are both
reproducible; the station count is the only number that wobbles, by ±2.

---

## 3. WHAT PAID FOR IT, AND WHERE

The bleach costs cross-section shape (section 4). I paid it in the lobe geometry,
where it can be paid without touching colour, not in the grade or the exposure.

| uniform | r9 | **r10** | what it does |
|---|---|---|---|
| `fBleach` | — (new) | **1.0** | per-channel ceiling instead of ratio-on-max |
| `fOver` | — (new) | **4.0** | over-drive of the HOT GROUP + aperture lobe only |
| `fCoreF` | — (new, was hard 0.06) | **1.0** | white core lobe now runs the length |
| `fQCore` | 11.0 | **40.0** | white core narrower ⇒ the saturated span shrinks |
| `fQWarm` | 2.2 | **1.5** | amber sheath wider ⇒ `u20_u50` recovered |
| `fHalo` | 0.11 | **0.13** | slightly stronger veiling skirt |
| `fHaloW` | 0.5 | **0.36** | ~18 % wider veiling skirt |
| `fApW` | 0.095 | **0.045** | glare core halved — LANDSCAPE ONLY, see below |

Unchanged: `fWarm` 0xff9c46, `fCore` 0xfff4e2, `fCeil` 0.62, `fKappa` 0.25,
`fApA` 0.45, `fApT` 0.72, `fApG` 0.62, `fApM` 0.60, `fApP` 1.6, `fApS` 0.0,
`fRimK` 0.80, `fQKnee` 0.45, `fHotW` 2.40, `fEndK` 0.60, and **every** grade,
exposure, tone-map, black-floor and DOF term.

### 3.1 `fOver` is on the hot group, not on `lit`, and that was measured

Over-driving **everything** lifts the veiling skirt above the ceiling too, so the
skirt saturates and the whole cross-section becomes a plateau: at ×4 globally,
`flattop_p50` 0.346 → **0.433** hero and 0.293 → **0.400** portrait; at ×14,
0.629 / 0.609. Applied to the `fCore`-tinted group and the aperture lobe only,
the saturated span stays inside the narrow lobe and the amber sheath goes on
setting the FWHM. It is also the physically correct split — the SOURCE is
over-driven relative to the sensor, not the glare it scatters into the lens.

### 3.2 `fApW` 0.095 → 0.045 is a landscape-only change **on purpose** (rule 3)

`fApM` floors the glare half-width at 0.60 device px. `bokeh` is 22.0 on the
1280×720 hero, so this term is 0.99 px and the floor does not bind — the glare
core halves. `bokeh` is 5.97 on the 215×466 shipping capture, so 0.045 × 5.97 =
0.27 px is **below** the floor and portrait keeps exactly round 9's 0.60 px core.
That asymmetry is deliberate: the hero's core is 3.7× wider in bokeh units than
portrait's floored one, so the shape cost of the bleach is a landscape problem,
and a sub-pixel PSF is aliasing rather than a PSF. Measured: hero flattop
0.355 → 0.323 on the sweep raster with portrait unmoved at 0.333. I did **not**
lower `fApM`, which is the tempting move and would put a sub-pixel core on the
only configuration that ships.

---

## 4. THE TWO MISSES, AND THE DEAD END I BUILT TO TRY TO AVOID THEM

`filament flattop_p50` is 0.345 hero / 0.400 portrait against a 0.29–0.34 band,
and the hero's wing drop is 1.472 / 1.426 at two of the three named stations
against 1.40. I am not going to dress these up.

**They are the same object as the fix.** Write the profile as `L(u) = G·f(u)`
under a ceiling `C`. The output crosses 90 % of amplitude where `f = 2.303 C/G`
and 50 % where `f = 0.693 C/G` — the two thresholds are always a factor 3.32
apart, and as `G` rises they slide **outward together into the tail**, so
`w90/w50 → 1` for any fixed shape whose tail is lighter than `u^-1.08`. Our tail
is near-Gaussian **because `glare u05_u50` is gated to 1.4–2.1** (Gaussian 2.08,
Lorentzian 4.36). A Gaussian tail and a deep enough clip to bleach cannot both
give `w90/w50` ≤ 0.34. The same slide is what moves the 20 % and 50 % heights onto
one flank and pushes `u20_u50` down, and what makes the outer-wing gradient
steeper at fixed pixel spacing, which is the wing-drop number.

**⚠ THE OBVIOUS ESCAPE DOES NOT WORK, AND I MEASURED IT RATHER THAN ASSUMING.**
Keep the ceiling, harden the shoulder: `K_n(t) = t/(1+t^n)^(1/n)`, `t = L/fCeil`,
which is transparent right up to the ceiling as `n → ∞`. I implemented it in the
overflow-safe reciprocal form, verified it reproduces round 9 at n = 1.4 with the
bleach off (`flattop_p50` 0.343 hero / 0.293 portrait against the shipped
0.333/0.293), and swept it at **identical over-drive**:

| knee | core_sat_p50 | peak_p50 |
|---|---|---|
| exponential (shipped) | **0.059** | 232.7 |
| `K_n`, n = 1.4 | 0.298 | 196.2 |
| `K_n`, n = 2.4 | 0.295 | 203.3 |
| `K_n`, n = 3.4 | 0.297 | 203.3 |
| `K_n`, n = 8.0 | 0.294 | 204.3 |

**Hardening the knee destroys the bleach, and destroys it immediately.** The
reason is the whole mechanism in one line: a hard clip pins the channel that is
over the ceiling and leaves the ones under it alone, so `out_b/out_r` stays the
source's ratio and the core keeps its hue. What whitens a core is the **soft**
part of the shoulder lifting the lower channels toward the same asymptote.
Bleaching and a transparent shoulder are one knob pulled in opposite directions.
That whole paragraph is now a comment in the file so round 11 does not rebuild it.

**What I chose, and what I would choose differently.** Given a forced trade I
took the colour, because the verdict's own argument for why this blocks 80 is
that it survives motion: "a swept hard edge smears into spray in motion... a
saturated amber tube is still a saturated amber tube at 120 fps." A `w90/w50` of
0.345 against 0.34 is a 1.5 % shape error on a still. If the next critic disagrees
I have the dial: `fOver` 4.0 → 2.5 puts the hero at flattop **0.301** and
core_sat **0.047** with 11 of 13 stations under 0.10 — i.e. the flattop gate is
purchasable for a still-passing bleach — but on the same shipped hero it takes
`glare u05_u50` to **2.387**, outside its 1.4–2.1 band, and the x=924 wing drop
to 1.603. Every point I found trades one gate for another; **the acceptance band
as written is over-constrained once the core is required to clip**, and I would
rather say so with the sweep attached than pick the reading that flatters me.

⚠ I did **not** re-impose `lens` ribbon `edge_1090_p50 ≤ 2.6`. It reads 4.259
hero / 2.268 portrait. Its author withdrew it in the r9 verdict and I agree with
the withdrawal.

---

## 5. PERF — SAME-TREE A/B, BOTH ORIENTATIONS

`shots/r10-stage-CTRL*` is the identical checkout and build with the eight stage
uniforms at their round-9 values; the only difference from the shipped rows is
stage's own defaults.

| | CTRL draws / tris | **SHIP draws / tris** | programs | budget |
|---|---|---|---|---|
| landscape 640×360 t3 | 95 / 175 415 | **95 / 177 199** | 0 / 0 | ≤ 120 / ≤ 250 k ✅ |
| **portrait 215×466 t2** | 115 / 154 303 | **115 / 156 305** | 0 / 0 | ≤ 120 / ≤ 250 k ✅ |

**+0 draw calls and +0 material programs in both orientations**, which is the
part I control; the triangle difference is 1 % and is the unseeded spawn, not the
diff — `liveBodies` is 51 in all four reports. The shader cost is one extra
`exp` on a vec3 and one `mix`, on a ribbon quad, with no new texture fetch and no
new varying.

`cpu` p95 is 0.3 ms landscape and 0.3 ms portrait. I am deliberately **not**
quoting `cpu.max`: the round-10 perf owner has shown that statistic is the single
worst of 400 samples from an unseeded loop and swings 8.5× between back-to-back
runs of one build, and the r9 correction block in `rounds/r9.json` records it as
withdrawn. Portrait's draw calls are 115 against the 120 ceiling on this tree —
that is the perf owner's fix (187 → 115), not mine, and I confirm it reproduces
under my build.

---

## 6. CROSS-FILE — VERIFIED BY READING AND BY GREP, NOT ASSUMED

* `git diff -- src/render/stage.js | grep -E '^[+-].*(api\.|lineDefocus|spriteDefocus|cocOf|cocPixels|version:|focusDistance)'`
  returns **nothing**. `api.lens.version` stays 7 because the API did not change.
* `grep -rn "stage.uniforms" src/ --include=*.js` outside `stage.js` returns
  nothing, so `fBleach`, `fOver`, `fCoreF`, `fQCore`, `fQWarm`, `fHalo`,
  `fHaloW`, `fApW` are private to the streak and safe to sweep at runtime.
* I did not touch a light, the exposure, `gradeFn`, the tone mapping, the black
  floor, the DOF pass, `cocOf`, `spriteDefocus` or `lineDefocus`. The diff is the
  streak's ceiling and its lobe proportions.
* `node build.mjs` is clean; `dist/index.html` rebuilt from the shipped source
  (md5 `ee27fe287613ad9570a26f5b9ee7b559`). Zero page errors and zero console
  errors across every run in this report (WebGL2 backend of WebGPURenderer under
  SwiftShader, tiers 2 and 3).

### ⚠ REQUEST FOR THE INTEGRATOR — one thing I could not fix in my own file

`tools/shoot.mjs`'s `--hero` path is **racy and silently produces a corrupt
artefact**. It calls `page.setViewportSize()` and then grabs; with `ZS.pause()`
in effect the renderer's resize may not have applied, and across my six runs the
hero came out 1280×720 twice, 640×360 three times, and **once as a completely
black 1280×720 frame** (`luma.max() == 0.0`) that was written to disk without any
error. A critic scoring `shots/*/00-hero.png` has no way to know which it got.
`shots/r10-stage/00-hero.png` in this report is a verified 1280×720 frame with
mask_px 162 376. Two cheap fixes, neither in a file I own: await one resumed
frame after the resize, and refuse to write a grab whose max luma is zero.

### The fruit-mat hand-off

`rounds/reports/r10-stage-DELTA-FOR-FRUIT-MAT.md`, written as a standalone note.
Headline: on a same-tree A/B, LAND 05-cut+500ms `clip pct_R_ge_255` goes
**3.097 → 2.746** (−0.35 pp, mask 10 106 vs 10 088) — the per-channel knee gives
budget **back**, it does not spend theirs. The other three beats' deltas are
inside the harness's own run-to-run spread, and **08-citrus-caps `clip` is not
reproducible at all** between two runs of one build (mask 5 046 vs 10 182,
pct 1.13 vs 4.96), which is the round-5 re-fitted-mask failure re-appearing on a
beat nobody re-checked.

---

## 7. HOW TO REPRODUCE

    node build.mjs                                  # dist/index.html, clean
    node .build-stagecheck.mjs                      # -> /tmp/zsv/index.html (NOT dist/)
    node tools/shoot.mjs --out shots/r10-stage --scale 0.5 --deadline 600 --gl --hero
    node tools/shoot.mjs --out shots/r10-stage-iphone --device iphone --scale 0.5 --deadline 600 --gl --hero
    python3 tools/probes.py bleach   shots/r10-stage/00-hero.png
    python3 tools/probes.py bleach   shots/r10-stage-iphone/04-cut+250ms.png
    python3 tools/probes.py bleach   reference/plate-01.png          # 0.054 / 237.4
    python3 tools/probes.py filament shots/r10-stage/00-hero.png
    python3 tools/probes.py glare    shots/r10-stage/00-hero.png
    python3 tools/probes.py clip     shots/r5/05-cut+500ms.png       # canary: 9490 / 5.227
    python3 .r10meas.py shots/r10-stage shots/r10-stage-iphone       # the whole roll-up

    # the same-tree control (r9 streak on the r10 tree) — already shot:
    #   shots/r10-stage-CTRL, shots/r10-stage-CTRL-iphone
    # to rebuild it, set on ZS.ctx.stage.uniforms or in source:
    #   fBleach 0, fOver 1, fCoreF 0.06, fQCore 11, fQWarm 2.2,
    #   fApW 0.095, fHalo 0.11, fHaloW 0.5

    # live sweeps, no rebuild (scalar stage uniforms only):
    node .r8sweep.mjs '[{"tag":"SHIP"},{"tag":"R9","fBleach":0,"fOver":1,"fCoreF":0.06}]' both

Two named controls worth keeping: **`R9`** above is round 9's streak exactly and
shows the whole delta in one A/B; **`fBleach 0` alone** isolates the channel
policy from the over-drive and is the two-line proof that a ratio knee cannot
bleach at any radiance.

— stage, round 10
