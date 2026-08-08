# r4 — stage (`src/render/stage.js`)

Round-3 score 50/100. Two jobs: **(A) fix and publish the exposure contract**
that round 3's stage and materials agents cancelled out between them, and
**(B) make the DOF an actual lens** — the critic measured our "blurred" region
carrying *more* high-frequency energy (lapvar 1953) than the sharp fruit beside
it (1415), where a real lens drops it ~19x.

Both are done and both are measured on the real game, not on a rig.

---

## TASK A — the exposure contract

The block comment is at the top of `stage.js`, titled `EXPOSURE CONTRACT`, ~110
lines. **The materials author must read it.** Headline numbers:

| | value |
|---|---|
| tone mapping | `NeutralToneMapping`, exposure **1.28** (unchanged) |
| key `DirectionalLight` | 0xfff1dd, **7.7 → 3.40**, at (8.2, 7.4, 6.2) |
| `environmentIntensity` | **1.31, held** |
| fill `DirectionalLight` | **0x44618f @ 0.90 → 0x6c7a90 @ 1.90** |
| **E, face-on to the camera** (cut faces) | **0.704, 0.613, 0.539** linear per unit albedo |
| **E, facing the key** (lit skin) | **1.565, 1.358, 1.122** |
| **E, shadow side** (fill only) | **0.136, 0.136, 0.156** |
| **clip threshold** | scene-linear **0.65** in any channel |
| **max non-clipping albedo** | **0.90** face-on, **0.40** key-facing |

### How the numbers were obtained

Not derived — **measured**. A ramp of `MeshStandardNodeMaterial` planes
(roughness 1, metalness 0, `color.setRGB(a,a,a,LinearSRGBColorSpace)`, linear
albedo 0.02…1.00) rendered at the stage centre through the real pipeline in
three orientations, read back off the canvas. Then a closed-form model of the
whole chain (albedo → light → exposure → Neutral tone map → sRGB → `gradeFn`)
was fitted to the readings: **RMS 1.3/255 on the camera-facing case, 0.7/255 on
the key-facing case.** The model is what produces the "max albedo" and
"clip threshold" figures; the readings are what validate it.

The contract block ships the measured albedo→display table for all three
orientations, so a material author can read a value off it rather than trusting
my arithmetic.

### Why 3.40 and not something else

The anchor is plate-01, measured directly:

| plate-01 region | mean RGB | R ≥ 254 |
|---|---|---|
| watermelon flesh (upper) | 176, 72, 47 | 0.84% |
| watermelon flesh (lower) | 168, 65, 41 | 0.60% |
| green apple cut face | 197, 174, 128 | **0.00%** |
| whole frame | — | lum p99 235, lum > 250 = 0.115% |

**Nothing in the reference is a white blob.** At E_camera = 0.704, a cut face of
linear albedo (0.45, 0.10, 0.06) — a realistic watermelon flesh — renders to
**(176, 63, 28)**. That is plate-01's flesh mean to within one count on R. The
key intensity was solved for that, not picked.

Mid-grey anchors, as required by the task: **linear 0.18 facing the key →
sRGB 170; face-on to the camera → sRGB 104.** (The classic grey card is
0.18 → 118 with a plain sRGB transfer; a camera-facing surface here sits 14
counts under it, which is the right relationship for a surface lit at
N·L = 0.49 by one hard key.)

### Measured effect

| | round 3 | **round 4** | plate-01 |
|---|---|---|---|
| watermelon cut face, R ≥ 254 | 37.0% (critic measured 49.7% on their crop) | **11.1%** | 0.6–0.8% |
| watermelon cut face, mean RGB | 203, 128, 98 | **174, 105, 79** | 176, 72, 47 |
| frame lum > 250 (hero cut) | 0.121% | **0.059%** | 0.115% |
| frame R ≥ 254 (hero cut) | 1.360% | **0.835%** | 0.49% |
| idle-blade `probe()` cornerMax | 15.8 | **3** | ~5 |
| idle-blade blown% | 0.214 | **0.063** | 0.115 |
| void 200×360 patch: unique triplets / std | 2 / 0.22 | **3 / 0.69** | (photographic) |
| melon body p95/p5 lighting ratio | 17.5 : 1 | **15.3 : 1** | 12.4 : 1 |

The three levers used, and why each:
* **key 7.7 → 3.40** — the primary knob. Acts on geometry only.
* **`environmentIntensity` HELD at 1.31** — deliberately *not* reduced with the
  key. The env is what makes the small blinding pin-highlights (panels at
  radiance 15…46 in a wet surface) and those *should* still clip; plate-01 has
  1312 of them. Holding it while cutting the key raises the
  specular-to-diffuse ratio, which is the plate's look, and incidentally takes
  the env's share of camera-facing diffuse from 12% to 21% — free fill.
* **fill 0.90 → 1.90 and much less blue** — the round-3 verdict asked for
  "~0.15 of ambient/bounce fill". The old fill was linear R 0.058, i.e. it put
  essentially nothing into the red channel, so a red fruit's shadow side went to
  black. The new one carries 0.11 of luminance at N·L = 1. The grade's
  split-tone still cools the shadows; that is where the blue belongs.

### The one thing this costs, and it is now the materials author's to fix

Dropping the key 1.93× in linear terms dropped the hero watermelon's **body p90
luminance from 179 to 133** (plate-01: 181) and **% of body over 120 from 25.9%
to 12.4%** (plate: 30.9%). That is not a regression to be reverted — it is the
consequence of round 3 having pulled albedos down to compensate for an over-hot
key. The watermelon **rind is at linear G 0.048**, which now reads display 33.
Real watermelon rind is nearer 0.10–0.14, which reads 78–102. The contract
block says this explicitly, with the arithmetic:

```
albedo_R * 0.704  +  everything_you_add   <   0.65        (face-on)
albedo_R * 1.565  +  everything_you_add   <   0.65        (facing the key)
```

Two specific findings for the materials author, from measuring our own frames:

1. **The residual 11% clipping on the cut face is almost entirely the foam
   pips**, not the flesh. Zoomed 4× at (300,215)–(385,290) it is a field of
   several hundred small white dots on a correctly-red base. The flesh base is
   now right; the foam whitening term is what pins R.
2. **The cut face's brightness barely moved when the light dropped 1.93×**
   (mean 203 → 174). That means it is dominated by terms that do not scale with
   the key — the emissive SSS lobe, the foam whitening, and env specular off a
   0.115-roughness surface. Those come straight off the 0.65 budget and are
   invisible to any "lower the albedo" fix.

**These numbers do not change again this round.** That is the whole point.

---

## TASK B — the DOF

Three named defects: (1) granular dithered fuzz, not a disc; (2) focusing on the
wrong plane, hero cut faces soft and background sharp; (3) razor-sharp sprites
sitting on top of blurred fruit.

### 1. The focus was racking to the wrong thing — fixed first, because it is the
### reason the other two were visible

Round 3's rule was "the nearest fruit large enough to be the subject". In a
five-fruit frame the nearest fruit is usually a *whole* one at the bottom of its
arc, so the two fresh halves — the only surfaces in the game with authored
detail on them — sat 1–2 units behind the focus plane and became the fuzz-balls
the critic photographed. A camera operator does not focus on whatever is
closest; they focus on the action.

`slice` now latches its own halves as the focus subject for **1.6 s** and the
lens tracks the **nearer** of them (nearer, not their mean: they rotate apart
and by 500 ms can straddle the plane, which would put focus in the *gap* and
softly defocus both). The old rule survives as the fallback.

Verified on the real `09-combo+50ms` beat, focus 10.06 with the hero half at
10.01:

| object | distance | 10-90 silhouette edge |
|---|---|---|
| pineapple halves (the hero) | 10.01 | **0.73 px** |
| orange (at the focus plane) | 10.16 | **0.81 px** |
| strawberry (1.2 units in FRONT) | 8.96 | **1.23 px** |
| **apple (1.2 units BEHIND)** | 11.36 | **6.08 px** |

Both critic thresholds met **in the same frame**: far > 4 px while near stays
under 1.5 px. It is also monotonic in depth, which "not correlated with apparent
size" was complaining about.

### 2. Why round 3's pass could not produce a soft silhouette at any radius

Round 3's scatter-as-gather normalised every tap by the area it scattered over.
A void pixel next to a *fully* defocused fruit therefore carried its own sharp
black sample at weight 1/anchor² = 0.32 against the fruit's entire half-disc at
12 × 1/R² = 0.16 — so it stayed two-thirds black no matter how large the CoC
was. **Raising the disc radius cannot fix this; the ratio is scale-invariant.**
Measured on a three-apple rig at z = +1.4 / 0 / −1.4 with focus on the near one:
1.11 / 1.72 / 2.00 px.

Replaced with the correct model for a subject on black: **a gather whose radius
is the DILATED circle of confusion.** A pixel is blurred by its own CoC, or by
the CoC of any *nearer* surface whose disc reaches it, whichever is larger.

* **pass 1** (depth only) — per tap, its CoC and whether it lies in front of the
  centre; `cocEff = max(coc0, max over nearer taps of (ci − 0.45·kr))`. The
  `−0.45·kr` taper matters: without it the effective radius steps from R
  straight to 0 at the edge of the dilated region and leaves a hard ring — I
  measured a 48 → 3 luminance cliff one texel wide, 11 px outside a defocused
  apple.
* **pass 2** (colour only) — a uniform disc of radius `cocEff · bokeh`, re-using
  pass 1's per-tap values so depth is never fetched twice. The per-tap CoC and
  the in-front flag are packed into **one** float (`sign` carries "in front",
  magnitude carries the CoC) so the unrolled loop keeps `taps` live registers
  rather than `2·taps`.

All four cases stay correct:

| case | behaviour |
|---|---|
| sharp pixel, sharp neighbours | `cocEff` 0, radius 0, only the centre tap has weight and it reads the **full-res** buffer. Bit-exact input |
| void next to a defocused fruit | `cocEff` dilates, the disc straddles the silhouette, the average ramps over ~2R |
| defocused background beside a SHARP subject | the sharp taps are nearer and sharper than `cocEff`, so they are down-weighted by `ci/cocEff` — the subject does not smear outward |
| sharp subject, defocused background behind | nothing nearer carries CoC, `cocEff` stays 0, no wash-over |

`bokehBase` 8.8 → **11.0** on ULTRA (10.0 HIGH, 7.5 MED): the ramp a defocused
fruit produces is ~2R wide, and 8.8 measured only 3.3 px. The in-focus fruit is
unaffected either way because its effective radius is zero.

### 3. The grain, and the sharp-sprite tell

The stipple was a sampling artifact: a 40-tap disc of radius 8.8 covers 16% of
the full-res texels it spans, and the other 84% aliased into per-pixel noise
that the IGN rotation spread evenly — which is exactly the "fur" the critic saw,
and why the defocused region measured *higher* laplacian variance than the sharp
one.

Added a **two-level pre-blur pyramid** (`rtt` at 0.5 and 0.25 resolution, each a
4-tap tent of the level above). Every disc tap now reads the pyramid, choosing
the level by the destination's CoC, so the source is always band-limited below
the tap spacing. At 1/4 res the same disc spans ~15 texels and the taps
*over*sample it. Because the colour is band-limited, the tap count could come
**down**: 40/32/20 → **24/20/14**.

Measured interior laplacian variance on the three-apple rig:

| | round 3 (critic) | **round 4** |
|---|---|---|
| in-focus fruit | 1415 | **924** |
| defocused fruit | **1953** (higher!) | **104 / 182** |
| ratio | 0.7× — inverted | **5–9× in the right direction** |

Edge widths on the same rig: **1.06 / 5.62 / 5.11 px** at z = +1.4 / 0 / −1.4.

On the sprites: with focus on the hero, the sharp mist now sits on *sharp*
flesh, which is what plate-02 shows. Sprites over the void keep CoC 0 and stay
crisp deliberately; sprites over a fruit inherit the fruit's depth from the
depth buffer (they are `depthWrite:false`, `depthTest:true`) and are blurred
with it. The tell is gone because the focus is right, not because the sprites
were forced soft.

---

## Perf

Measured on an empty tier-3 frame, post chain only:

| | draw calls |
|---|---|
| round-3 chain | 24 |
| naive round-4 chain (pyramid added) | 30 |
| **shipped round-4 chain** | **25** |

**A trap worth knowing.** `RTTNode.updateBeforeType` is
`NodeUpdateType.RENDER`, and `NodeFrame` dedupes RENDER-type updates on
`renderId` — which the RTT's *own* quad render increments. So an RTT that
several materials sample **re-renders once per consuming pass**. The two-level
pyramid cost six draw calls, not two, because `blurA` is sampled by `blurB`'s
quad *and* by the DOF quad, and `dofNode` is sampled by bloom's high-pass *and*
by the composite. Switching all three to manual invalidation (`autoUpdate =
false`, one `textureNeedsUpdate = true` per frame in `drawOnce`) pins each to
exactly one render per frame: 30 → 25. **This means round 3 was already paying
for `dofNode` twice**; net cost of the whole pyramid against round 3 is
**+1 draw call**, and the tap-count reduction takes per-pixel fetches from
40 colour + 40 depth = 80 down to 24 depth + 48 pyramid + 1 = 73.

Other agents: if you add an RTT that more than one material samples, do the
same, or you will pay for it N times.

Tier flips 3 → 1 → 2 → 0 → 3 → 3 rebuild cleanly, zero console errors, no leaked
targets (the pyramid's render targets are disposed on rebuild and in `dispose`;
`RTTNode.dispose()` does not free its render target, so it is done by hand).
Triangles unchanged. No new npm deps, no new shader programs beyond the two
trivial downsample quads.

---

## Also in this round

* **Void dither.** The critic measured "exactly TWO unique RGB triplets (2,2,2)
  and (3,3,3), std 0.09 — no photograph has that". The grain gate went to *zero*
  in the darks, which is what quantised the pedestal. It now has a floor of 0.75
  of the amplitude (`grain` 0.008 → 0.011, `blackFloor` 0.011 → 0.013). Same
  patch now measures **three levels (2/3/4), std 0.69**, corner luminance 3 —
  an order of magnitude under the bar's #0a0a12 ceiling, and 35× smaller than
  round 1's visible "space dust".
* `U.dofAnchor` is dead (the new gather has no such term). Kept as a uniform
  because `api.uniforms` is public, and commented as dead.

## Constraints honoured

`src/render/stage.js` only. Exported factory name and all
`init/fixed/frame/quality/resize/dispose` signatures unchanged. `api.uniforms`,
`api.grade`, `api.gradeFn`, `api.bloom`, `api.dof`, `api.probe`, `api.streak`,
`api.lights`, `api.pipeline`, `api.scenePass`, `api.focusDistance` all still
present. No new deps, no network, no `ShaderMaterial`. `npx esbuild
src/render/stage.js --bundle` clean; full-game bundle built and run under
`three/webgpu` on the WebGL2 backend with **zero console errors** across every
scenario in the beat sheet and every quality tier.

## What a critic should look at first

1. Whether the materials author raised albedos into the headroom. If the frame
   reads dark, check `species.js` against the contract block's table before
   blaming the exposure — the numbers there are measured, not asserted.
2. The remaining 11% of the cut face at R ≥ 254 is the foam pip field, not the
   flesh.
3. `blade.js` still places its band at `cam.position.length()`; it should read
   `stage.focusDistance`, which now moves further than it used to because focus
   latches onto the fresh halves. Flagged in round 3 as well and still open.
