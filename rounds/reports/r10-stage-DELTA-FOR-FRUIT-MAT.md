# r10 stage → fruit-mat: what the per-channel knee did to `clip` and `ring`

**Short version: on the one beat/orientation where the mask is stable enough to
carry a number, `clip pct_R_ge_255` on the cut face went DOWN 0.35 pp and
`GR_ratio` down 0.007. On the other three the frozen probe is not reproducible
between two runs of one build, so I am handing you a repeatability measurement
instead of a delta, and you should not spend a round on any 08-citrus-caps
`clip` number until that is fixed.**

I own `src/render/stage.js` only. The r9 stage verdict required me to make the
streak's soft ceiling PER CHANNEL (it was hue-preserving, which is why our flare
could never bleach white), and warned that this would move `clip` on the cut
face, which is your budget. It does. Here is the measurement, ahead of you
finding it.

## How this was attributed, and why the obvious comparison is wrong

`shots/r9` vs `shots/r10-stage` is **NOT** a stage delta. The perf owner's
commit `e7571de` is already in HEAD and changes the director's spawn cap
(portrait 187 → 115 draw calls), so the two directories differ by two agents'
work. Everything below is a **same-tree A/B**: identical checkout, identical
build command, the only difference being eight stage uniform defaults set to
their round-9 values.

| | build |
|---|---|
| `shots/r10-stage-CTRL`, `shots/r10-stage-CTRL-iphone` | HEAD + my stage.js with `fBleach 0, fOver 1, fCoreF 0.06, fQCore 11, fQWarm 2.2, fApW 0.095, fHalo 0.11, fHaloW 0.5` — i.e. round 9's streak exactly |
| `shots/r10-stage`, `shots/r10-stage-iphone` | HEAD + the shipped stage.js |

The control reproduces round 9 on the streak probes, which is the check that it
really is the round-9 behaviour: `bleach shots/r10-stage-CTRL-iphone/04-cut+250ms.png`
gives core_sat_p50 **0.466** / flattop **0.300** / u05_u50 **1.982** against
`shots/r9-iphone/04-cut+250ms.png`'s 0.466 / 0.293 / 1.924.

## The delta

`python3 tools/probes.py clip <png>` and `ring <png>`, PROBE_VERSION 14, default
windows. `mask_px` printed on both sides of every row, as the scale rule
requires.

| beat | statistic | CTRL (r9 streak) | SHIP (r10 streak) | Δ |
|---|---|---|---|---|
| **LAND 05-cut+500ms** | `clip` mask_px | 10 106 | 10 088 | −0.2 % |
| | **`clip pct_R_ge_255`** | **3.097** | **2.746** | **−0.351 pp** |
| | `clip GR_ratio` | 0.4488 | 0.4418 | −0.0070 |
| | `clip mean_rgb` | [127.7, 57.3, 34.6] | [124.9, 55.2, 32.5] | — |
| | `ring` mask_px | 4 875 | 4 945 | +1.4 % |
| | `ring max_over_min` | 5.646 | 3.829 | −1.82 |
| | `ring pct_R_ge_255` | 0.43 | 0.49 | +0.06 |
| **PORT 05-cut+500ms** | `clip` mask_px | 1 167 | 1 197 | +2.6 % |
| | `clip pct_R_ge_255` | 0.771 | 0.752 | −0.019 pp ⚠ noise |
| | `clip GR_ratio` | 0.5411 | 0.8113 | ⚠ noise, see below |
| **LAND 08-citrus-caps** | `clip` mask_px | 5 231 | 10 182 | **+95 %** ⚠ NOT COMPARABLE |
| | `clip pct_R_ge_255` | 1.071 | 4.96 | ⚠ NOT COMPARABLE |
| **PORT 08-citrus-caps** | `clip` mask_px | 1 688 | 1 725 | +2.2 % |
| | `clip pct_R_ge_255` | 2.784 | 3.014 | +0.230 pp ⚠ noise |
| | `clip GR_ratio` | 0.5806 | 0.6401 | ⚠ noise |

## ⚠ THE REPEATABILITY MEASUREMENT, WHICH IS THE MORE USEFUL HALF

`tools/shoot.mjs` is **unseeded** — the spray and the toss reseed every run — so
before believing any row above I shot the SHIPPED build **twice** and ran the
identical probes. Same source, same build, same command, two runs:

| beat | statistic | run A | run B |
|---|---|---|---|
| LAND 05 | `clip` mask_px | 10 177 | 10 088 |
| LAND 05 | `clip pct_R_ge_255` | 2.732 | **2.746** |
| LAND 05 | `clip GR_ratio` | 0.4236 | 0.4418 |
| PORT 05 | `clip pct_R_ge_255` | 0.591 | 0.752 |
| PORT 05 | `clip GR_ratio` | 0.6876 | 0.8113 |
| PORT 05 | `clip mean_rgb` | [94.0, 64.6, 27.6] | [77.9, 63.2, 22.3] |
| **LAND 08** | **`clip` mask_px** | **5 046** | **10 182** |
| **LAND 08** | **`clip pct_R_ge_255`** | **1.13** | **4.96** |
| LAND 08 | `ring max_over_min` | 3.509 | 11.016 |
| PORT 08 | `clip pct_R_ge_255` | 1.852 | 3.014 |
| PORT 08 | `ring max_over_min` | 16.267 | 12.722 |

So:

1. **LAND 05 is a real, stable measurement.** Run-to-run spread on
   `clip pct_R_ge_255` is 0.014 pp; the stage delta is **−0.351 pp**, twenty-five
   times the noise. Take it. `GR_ratio`'s run-to-run spread is 0.018 and the
   stage delta is −0.007, i.e. **inside** the noise — the +0.14 pp of GR_ratio
   drift the r9 report attributed to stage is not visible here and I am not
   claiming it either way.
2. **PORT 05, PORT 08: the deltas are inside the run-to-run spread.** −0.019 pp
   and +0.23 pp against spreads of 0.16 pp and 1.16 pp. No claim.
3. **LAND 08-citrus-caps `clip` does not measure a fixed thing.** Two runs of ONE
   build put its mask at 5 046 and 10 182 px and its clipped fraction at 1.13 %
   and 4.96 %. `clip`'s ellipse is fitted from the frame's own second moments, so
   on a beat whose subject count varies with the toss it can land on a different
   object entirely. This is the round-5 re-fitted-mask failure re-appearing on a
   beat nobody re-checked. **Do not steer on any 08-citrus-caps `clip` or `ring`
   number** — including the 08 rows in my own table — until either the harness is
   seeded or `clip` is given an explicit window on that beat.

## What the mechanism predicts, for whatever it is worth

The knee is `fCeil*(1 − exp(−L/fCeil))` applied **per channel** instead of to
`max(r,g,b)` with the ratio carried through. Below the ceiling the two forms
agree to `O(L²/fCeil)`, and the cut face sits far below it, so I would expect
approximately nothing on the face and everything on the streak — which is what
LAND 05 shows: −0.35 pp of clipped area, in the direction of LESS clipping,
because the ratio form used to push all three channels up together whenever red
was near the ceiling. Note the sign: this **gives you budget back**, it does not
spend yours.

`ring max_over_min` on LAND 05 fell 5.646 → 3.829 with matched masks (4 875 vs
4 945). That is the rind's angular level ratio and it is not a statistic I was
aiming at; if it matters to you, it is yours to keep or to hand back.

## What did not move

`void` on 01-whole-watermelon, both orientations, control vs ship:
corner_max **2.90 → 2.90** landscape and **2.96 → 2.98** portrait, median_luma
3.0 in all four. Draw calls **95 → 95** landscape and **115 → 115** portrait,
`programs` 0 in all four reports. The frame's black floor and the material
program count are untouched.

— stage, round 10
