# r3 — fruit-mat — `/home/claude/juice/src/fruit/species.js`

Round 2: 49/100. Two verdicts landed here: (A) materials — "R is pinned at 255
across 48.3% of the watermelon cut face and 31.2% of the citrus half"; (B) cut
faces — "the pith band's luminance varies only 204->237 (1.16x) around the full
ring versus 79.6->159.1 (2.00x) on the reference lemon peel". Only
`src/fruit/species.js` was edited.

## The thing round 2 got wrong, and how I found it

Round 2's header budgeted for a light multiplier of ~0.8 on a cut cap. It is
~1.25 — stage.js's key is a `DirectionalLight` of **intensity 6.2** at
(8.2, 7.4, 6.2), so a camera-facing cap takes `6.2 * 0.49 / PI = 0.97` from the
key alone, before the 5.0 rim, `environmentIntensity 1.08` and
`toneMappingExposure 1.28`.

But that alone does not explain a *hard* clip: `NeutralToneMapping` asymptotes
below 1.0 and cannot reach sRGB 255 from any finite input. The actual amplifier
is **`gradeFn` in stage.js, which runs in DISPLAY space after `renderOutput()`**
(`crush 0.010`, `contrast 1.10` about 0.34, `sat 1.06`, warm split-tone). Its
saturation term pushes R up and G/B *down* on a saturated pixel — which is
exactly the `(255, 137, 121)` signature I measured scanning `shots/r2b/05` at
y=257. A clipped white specular would have read `(255, 250, 235)`; it does not.

So I modelled the whole chain offline (albedo -> light -> exposure -> Neutral TM
-> gradeFn -> sRGB quantise) and **validated it against round 2's own measured
numbers before changing anything**:

| statistic (r2b/05 watermelon cap) | model, r2 constants | critic measured |
|---|---|---|
| mean RGB | 225.2, 101.3, 98.6 | 227.3, 84.5, 81.3 |
| R >= 255 | 38.7% | 39.0% |
| median lum | 109.7 | 109.9 |
| pith ring swing | 1.18x | 1.16x |

Every number below is a solution of that model, not a guess. Scripts left at
`/tmp/r3-fruit-mat/{.r3cal,.r3ring,.r3sim}.mjs`.

## Changes

**1. New `capKey(amb=0.30, gain=1.46)` helper** — `saturate(dot(normalWorldGeometry,
KEY_DIR)) * gain + amb`. Every cut-cap band colour (watermelon pith + rind,
orange pith + zest, kiwi pale + skin, apple skin, strawberry skin, pineapple
shell) is multiplied by it. cutter.js already builds the layered zone as a real
stepped shell (groove -0.25r, pith crest +0.34r, seam +0.20r, peel top +0.52r)
and hands us the interpolated normal; round 2 emitted a constant cream and threw
it away. `KEY_DIR` was also stale — it encoded (7.5, 8.2, 5.0); stage.js's key
is at (8.2, 7.4, 6.2).

**2. Every albedo down.** Pulps to linear R 0.35 mid-ramp (the verdict names
0.35-0.45); pale structures 0.86-0.94 -> 0.40-0.53. Value *separation* is
preserved: watermelon pith/flesh stays ~2.4x, orange membrane/pulp 2.4x in
luminance. Watermelon `deep`/`ripe` spread widened 2.9x -> 4.0x and B/R cut
0.123 -> 0.097 output-referred, because plate-01's flesh box is (188, 61, 45) and
ours was (227, 85, 81) — we were pink, the plate is red. The watermelon **rind**
band had to come down too (0.115 -> 0.048 G): with the flesh darker, leaving it
would have put rind and flesh at the same luminance (~85 both) and collapsed the
three-value composition into two.

**3. The SSS lobe is inverted.** It was `wrap^2 * 0.50`, peaking exactly where
the key peaks, so the lit half of every face got albedo AND a stack of near-pure
red from the same direction. Now `away^2 * 0.62 + fres * away * 0.55`. Also: the
geometry normal is taken in **world** space so it is actually comparable with the
world-space key (round 2 dotted a *view*-space normal against a world vector),
and the transmission tint is `0.55 * juiceColor` — `juiceColor` is authored for
the droplets (fluid.js reads it, unchanged) and is linear R 1.0.

**4. The foam whitening is gated on underlying luminance.** Round 2's comment
claimed it was "weighted by the underlying value"; it was not — a flat
`vec3(0.26)` went into black seeds at full strength, worth ~0.117 linear, which
is the single biggest reason the darkest 5% sat at lum 53.4. Now gated by
`ss(0.012, 0.075, lumOf(alb))`: full over pulp, zero over seeds/pips.

**5. Seeds excluded from `sssMask`** (watermelon and kiwi). A lignified seed
coat transmits nothing; round 2 let every seed pick up the SSS wash.

**6. Baked contact shadow at the groove.** Round 2 put a *bright* stroke at
v=0.815 — the deepest point of cutter.js's profile, walled in by the flesh dome
inboard and the pith crest outboard. It is now a 0.58 AO dip with a thin wet
specular line on the inner wall only, key-modulated. Same treatment on orange,
kiwi, apple, strawberry, pineapple.

**7. The radius warp is tapered off at the rim** (`ss(0.90, 0.70, r0)`). The
critic measured the pith band's width swinging 0.0 -> 11.2 px, CV 0.476 — it
vanished on some spokes. That is arithmetic: the band is 0.052 wide in `rad` and
the untapered warp displaced `rad` by up to +-0.055. cutter.js builds the shell
at constant world thickness at every angle, so warping it there never read as
organic.

**8. Wet roughness floor 0.085 -> 0.115**, bubble sharpening 0.045 -> 0.030,
clamp min 0.035 -> 0.055. With albedos down ~0.6x the specular lobe is a much
larger fraction of each pixel, and a near-mirror under a 6.2-intensity key is a
field of clipped white dots. Foam *geometry* is untouched — the r2 wetness
statistic was in-band and I did not want to move it.

**9. Skins.** Orange peel 0.50 -> 0.36 R (r2b/08 shows its lit shoulder blown to
white), apple skin, strawberry skin, pineapple plate all ~0.72x. A skin facing
the key sees roughly 2x what a cap does.

## Predicted verification (same probe the critic specified)

| | round 2 measured | **round 3 predicted** | target / reference |
|---|---|---|---|
| wm cut face, R >= 255 | 39.0% | **0.1%** (1.1% even at M=1.45) | < 5% |
| wm cut face, darkest 5% lum | 33.7 | **~12** (model 4.2 + the model's known +8 specular bias) | <= 25 |
| wm flesh mean RGB | 227.3, 84.5, 81.3 | **182.9, 52.9, 40.5** | plate-01 188.1, 60.9, 45.1 |
| wm flesh median lum | 109.9 | **83.9** | plate-01 78.4 |
| pith ring swing | 1.16x | **2.62x** (lit 251 / face-on 211 / shadow 96) | reference lemon 2.00x |
| rind ring swing | — | **4.07x** | — |

## Constraints

- Exports, factory names and `init/fixed/frame/quality/resize` signatures
  unchanged. `GLSL_NOISE`, `SPECIES`, `SPECIES_LIST`, `setSpeciesQuality` all
  intact; `juiceHex`/`juiceColor` untouched (fluid.js consumes it).
- **No new draw calls, no new passes, no new objects, no new materials, no new
  shader programs.** Net shader cost: one `dot` + `mul` + `add` in `colorNode`
  per flesh material (`normalWorldGeometry` is `.once()`-cached and already a
  varying), one extra `smoothstep` in `capCoords`, one `dot` for the luminance
  gate, one `cellPt` added to the emissive slot on watermelon and kiwi. Round
  2's redundant `normalize()` on an already-normalised node was removed from two
  slots.
- Everything animated is still a `uniform()`; no graph is rebuilt, so no
  first-slice recompile hitch.
- Verified: `npx esbuild src/fruit/species.js --bundle` clean, and all six
  species construct both materials with all four flesh node slots populated and
  zero console errors under `three/webgpu`, at quality tiers 0 and 3.

## Risk / what a critic should look at first

The pith's *lit* spoke still lands near 251 lum. That is intentional — our
staging is a hard key on a black void, unlike plate-02's flat defocused room —
but if the next verdict says the ring still clips, the single knob is the
`vec3(0.400, 0.405, 0.325)` pith base in `wmLayers`' consumer, or `capKey`'s
`gain`. Second: I did not touch foam geometry or bump amplitude, so if the
wetness/highpass statistic moves it will be from the roughness floor change
(0.085 -> 0.115) alone.
