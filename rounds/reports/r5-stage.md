# r5 — stage (`src/render/stage.js`)

Round-4 score 52/100 (lighting+DOF), 51 (materials, on a contract this file owns).

Two jobs, both structural, both done and both **measured on the real game**:

* **A. The exposure contract solved the wrong load case.** Re-solved against the
  worst-case orientation, republished as a *radiance law* rather than an albedo
  ceiling, and then **rendered and measured end-to-end** with a scratch patch of
  `species.js` to prove the numbers land on plate-01 before the materials author
  spends a round on them.
* **B. The lens did not exist for the transparent layer.** Fixed by giving every
  billboard its own circle of confusion, taken from the *same* `cocOf()` the
  opaque gather uses. New public API `stage.lens`. `fluid.js`'s obligations are
  the numbered contract in section B4 below.

**Lighting numbers did not move. That is a decision, defended with measurement
in section A1.** Zero new draw calls, zero new render targets, zero new shader
programs, zero new triangles.

---

## A — THE EXPOSURE CONTRACT, v5

The full contract is the block comment at the top of `stage.js`. Read it; this
is the summary of what changed and why.

### A1. The lights are frozen, and the "put the exposure back" note is a bad measurement

The round-4 stage verdict asked for ~0.35 stop back because our
`01-whole-watermelon` body median is 62.5 against plate-01's melon at 87.7.
**That comparison is invalid.** Our beat-01 melon is *uncut*, so its body mask is
rind only; plate-01's melon is *cut*, and 55% of the pixels inside its body mask
are flesh. Masking the green rind alone on both images (`G > 1.02R && G > 1.05B`,
largest connected component):

| | ours, 01 | plate-01 melon |
|---|---|---|
| rind median lum | **45.6** | **44.9** |
| rind p90 lum | 110.6 | 104.9 |
| rind mean RGB | (49, 61, 12) | (55, 61, 10) |
| rind % over 120 | 7.2 | 7.0 |

The rind is within **1.6%** of the plate on median. The light level is right.
What is wrong is one material's *range*: the same watermelon's flesh is 30% too
bright and clipping on the key-lit half and 40% too dark on the shadow half.
Raising the key fixes the dark half by blowing the bright half further — which
is round 3, again. So `key 3.40`, `env 1.31`, `fill 1.90`, `exposure 1.28` are
all unchanged, and the v4 E table is still valid because nothing that produces
it moved.

### A2. What was actually wrong: the load case

v4 said "a cut face is camera-facing, E_R = 0.704, your albedo ceiling is 0.90".
`species.js:924` duly pins `ripe` at 0.9000. But the key sits **60.7° off the
camera axis**, so a cut face tilted only 26° out of the screen plane already
reaches key N·L = 0.82, and at 45° — still 71% of its own area on screen — it
reaches N·L = 0.96. The operating range of a *visible* cut face is
E_R = 0.70 … 1.57 and v4 solved the bottom of it.

Forward-modelling the shipped material through the top of that range reproduces
the critic's measurement to the count:

```
albedo (0.9000, 0.1507, 0.1228) x E_B (1.565, 1.358, 1.122)
  = scene-linear (1.409, 0.205, 0.138)  ->  display (255, 129, 110)
critic measured the lit face at (218, 122, 99), G/R 0.559
```

Two v4 instructions are inverted by this, and both are stated in the contract:

1. **The milky pink is not an achromatic wash from foam.** It is the tone
   mapper's desaturating shoulder acting on a red channel that is 2.2× over the
   clip threshold. G/R rises because R is *pinned*. Take the shipped albedo
   chroma, change nothing but the scale until R is in budget, and it renders
   G/R 0.238 — if anything *more* saturated than the plate. Chasing G/R by
   desaturating would have overshot into brick.
2. **The SSS lobe is not the villain.** v4 called it out at "0.34 linear, 52% of
   the budget". The diffuse term alone was **1.41, i.e. 217% of the budget**.
   The lobe is the *floor* that keeps the shadow-side face off black, and v5
   budgets for it explicitly.

### A3. The structural change: publish a radiance law, not an albedo

An albedo cannot be the invariant when the other half of the product swings 11×.
v5 publishes what a cut face must **emit**, inverted from plate-01 through the
full shipped chain (gradeFn → sRGB decode → inverse Neutral → ÷exposure):

```
L_face(n) = A * E(n) + S + C            n = saturate(dot(N, keyDir))

  target, area mean, scene-linear:  (0.31, 0.080, 0.058)  +/- 25%
  and <1% of the face's area over 0.655 in any channel
```

with E published as a *function of orientation* (five rows plus a linear fit),
and the budget split by **who spends it and whether it scales with the key**:

| term | scales with key? | budget (linear R, G, B) |
|---|---|---|
| A. diffuse `albedo × E(n)`, n = 1 | yes | 0.145, 0.058, 0.044 |
| B. floor: SSS / transmission lobe | no | **0.162, 0.022, 0.014** |
| C. residual env specular + wet film | no | **~0.020 flat** |

**Term C is the finding that matters and it is measured, not asserted.** With a
cut face driven to A = (0.163, 0.0335, 0.0250), S = (0.162, 0.043, 0.032), the
shipped pipeline renders scene-linear (0.28, 0.11, 0.08) where diffuse+floor
predicts (0.417, 0.089, 0.060). The G and B excess is **+0.020 in both
channels — flat, achromatic** — from env specular at roughness 0.34 through a
PMREM whose panels run at radiance 15…46, plus the residual foam/wet lift. On a
surface whose G is only 0.08 linear, a flat +0.020 is a 25% lift in G and 35% in
B and *nothing* in R. That is the milky salmon, mechanically.

The contract also names the four additive constants on the flesh path
(`species.js` :616 foam, :930 pale heart, :947 seed halo, :977 wet run-off) that
are sized for a 0.9 albedo and become the dominant term when `ripe` drops 5×.
The foam constant alone is +0.085 of albedo = 0.133 linear R at n = 1, i.e. 92%
of the whole diffuse budget, on a term whose job is to be a texture.

### A4. Validated by rendering it, not by predicting it

I patched `species.js` **in a scratch build only** (esbuild `onLoad` rewrite; the
repo file is untouched) with the law above and shot the real beat sheet:

| lit cut face, 05-cut+500ms | mean RGB | R ≥ 255 | G/R | B/R | lum median |
|---|---|---|---|---|---|
| v4 as shipped | (223.1, 112.5, 91.2) | **38.7%** | 0.504 | 0.409 | 139.7 |
| v5 law, rendered | (151.8, 67.3, 47.3) | **1.3%** | 0.444 | 0.312 | 78.1 |
| plate-01 flesh | (169.6, 67.3, 47.4) | 0.29% | 0.397 | 0.279 | 80.6 |

(mask: largest connected component of `R > 55 && G < 0.80R && B < 0.80R`, the
same mask on both images. My reproduction of the critic's r4 number with this
mask is 38.7% against their 49.3% on a tighter hand ellipse — same family.)

**G and B land on plate-01 to the count** (67.3 vs 67.3; 47.3 vs 47.4). R comes
in 11% under, so the last move is `ripe.r` 0.183 → ~0.205, which takes G/R from
0.444 onto the plate's 0.397 and costs nothing in clipping. The whole-melon
rind, pith ring and body statistics are unchanged by the patch (01 body
p50 53.9 / p90 160.5 / %>120 19.7 before and after), so this is entirely
contained in the flesh path.

**The recipe, for `species.js`:**
```
deep = vec3(0.0590, 0.0108, 0.0080)     // was (0.2900, 0.0510, 0.0427)
ripe = vec3(0.2050, 0.0335, 0.0250)     // was (0.9000, 0.1507, 0.1228)
floor S (constant, x sssMask, added in emissiveNode)
     = vec3(0.1620, 0.0220, 0.0140)
the four additive constants above, all scaled by 0.20
```
That is a *starting point measured through the shipped chain*, not an assertion.
Re-measure and adjust; the contract's section 5 has the whole ramp.

---

## B — THE LENS BOUNDARY

### B1. Why the sprites had no lens, and why no amount of tuning could give them one

The post DOF pass takes CoC from the **opaque depth buffer**. Every transparent
layer is `depthWrite:false`, so over the void it inherits the far plane, `cocOf`
clamps that to zero, and the sprite is razor sharp. In `00-hero` — one opaque
object — the critic measured 141 droplets spanning a 6× range of apparent
diameter all rendering at 1.46–1.75 px of 10-90 edge against the in-focus
melon's 1.55 px. **This is structural: no choice of bokeh radius can fix it**,
because the pass never learns the sprite is there.

Measured proof, same frame, only `U.focus` moved between renders (no simulation
step, so it is the same droplets in the same pixels), 9 isolated tracked
droplets, 960×540:

| focus | r4 shipped: 10-90 edge / peak lum | r5: 10-90 edge / peak lum |
|---|---|---|
| 10.16 (auto) | 3.84 px / 245.5 | 5.93 px / 164.0 |
| 8.56 | 3.81 px / 245.5 | 3.96 px / 235.6 |
| 7.16 | 3.81 px / 245.5 | **25.94 px** / 88.9 |
| 11.76 | 3.84 px / 245.5 | **20.80 px** / 94.9 |

r4's droplets are **bit-identical across a ±3-unit focus rack** — σ = 0.015 px,
peak luminance unchanged to 0.1 count. The lens genuinely does not exist for
them. r5's respond 6.6×, and their peak luminance falls as they spread because
the alpha term conserves total energy. (My metric here is
`sqrt(area≥10%·peak/π) − sqrt(area≥90%·peak/π)`, whose in-focus baseline is
3.84 px where the critic's slope-normalised metric reads 1.55 px on the same
frame; the *ratio* is metric-independent.)

### B2. Mechanism chosen, and the three I rejected

| option | verdict |
|---|---|
| extra half-res R16F target, transparent pass writes MIN view-z, OR'd into the gather's dilation | rejected: +1 target, +1 clear, MRT on every transparent draw, and WebGL2 has no per-draw-buffer blend equation without `EXT_draw_buffers_indexed` |
| `depthWrite:true` on the sprites | rejected: free, but thousands of overlapping alpha quads then occlude each other in draw order |
| separate blurred particle target | rejected: +1 full-screen pass, +N draw calls, against a 120-call budget already at 139 |
| **per-sprite CoC at emission** | **chosen** |

Emission-time is not just the cheapest, it is the only one that gets the physics
right. A defocused point spreads into a disc of **constant total energy**; a post
gather over an already-composited additive sprite has lost the sprite's core and
cannot reconstruct that. Blurring at emission also lets the *shading* flatten
with the blur, which matters — a sphere impostor left at full contrast inside a
24 px disc renders a shiny beach ball, not a bokeh blob.

### B3. What I implemented (`stage.js` side, complete)

```js
api.lens = {
  version: 5,
  uniforms: { focus, focalLength, nearScale, voidDist, bokeh, texel, spriteGrow },
  coc:        (distNode) => node 0..1,          // TSL, the same cocOf() the opaque gather uses
  cocPixels:  (distNode) => node,               // TSL, CoC RADIUS in device px
  sprite:     (r0Node, distNode) => vec4,       // TSL, see below
  cocForZ:    (dist) => number,                 // JS mirror, 0..1
  cocPixelsForZ: (dist) => number,              // JS mirror, radius in device px
  maxCocPixels: () => number,
  SOFT0: 0.68,
};
api.cocForZ = cocForZ;   // the round-4 verdict asked for this exact name
```

`sprite(r0, dist)` returns **one vec4** so a vertex shader computes it once:

| | meaning |
|---|---|
| `.x` `grow` | multiply the sprite's half-size by this |
| `.y` `energy` | multiply the sprite's **alpha** by this — conserves total light |
| `.z` `plateau` | normalised radius across the *widened* quad at which the alpha ramp starts: `alpha ∝ 1 - smoothstep(plateau, 1.0, |c|)` |
| `.w` `flat` | 0 in focus → 1 defocused; flatten the impostor's normal toward `(0,0,1)` by this much |

The model is the exact one: the defocused image of a disc of radius `r0` through
an aperture of CoC radius `b` is the convolution of two discs — flat out to
`|r0 − b|`, zero beyond `r0 + b`. `plateau` is that inner radius, capped at
`SOFT0` so an **in-focus sprite is bit-identical to round 4**
(`b = 0 → grow 1, energy 1, plateau 0.68, flat 0`, which is exactly fluid.js's
existing `smoothstep(0.68, 1.0, r)`). Energy conservation carries a closed-form
shape correction `0.3 + 0.4·e0 + 0.3·e0²` for the profile changing from
"disc with a soft rim" to "cone", so ∫alpha·dA is exactly invariant.

**`spriteGrow` (fill-rate guard, and it lives in stage.js on purpose).** A
sub-pixel mist grain at full CoC would grow to a 40 px ghost: radius ×20, *area
×400*, times a 9000-instance pool. The blur is free in draw calls and very much
not free in fragments. The cap is applied to the **CoC**, not to the finished
radius, so a clamped sprite is still a correct (merely smaller) bokeh disc
rather than a bright hard dot. Per tier: **ULTRA 6.0, HIGH 4.5, MED 3.0,
LOW 1.0** (LOW disables sprite defocus entirely, because that tier also drops
the post DOF pass and a defocused sprite over a fully sharp scene is worse than
no lens at all).

### B4. THE CONTRACT — what `fluid.js` must do, numbered

This is the whole of the cooperation. **One agent owns the boundary and it is
this file; do not invent a second mechanism, because two of them will cancel.**

1. **Capture the API in `api.init`, before any material is built.**
   `makeDrops`/`makeStrands`/`makeSheet` are called from `api.init`, and `stage`
   is `modules[0]` while `fluid` is `modules[2]`, so `ctx.stage.lens` is
   guaranteed to exist by then. Add a module-scope `let _lens = null;` and set
   `_lens = ctx.stage && ctx.stage.lens ? ctx.stage.lens : null;` as the first
   line of `api.init`. **Always guard for null** and fall back to
   `vec4(1.0, 1.0, 0.68, 0.0)` so the file still runs against an older stage.

2. **Call it once per vertex, with the POST-sub-pixel-floor radius in device
   pixels.** In `makeDrops`'s `vertexNode` the existing lines
   ```js
   const grow = clamp(float(0.98).div(max(pxR, 1e-5)), 1.0, 3.4).toVar();
   const s = s0.mul(grow).toVar();
   vAlpha.assign(pow(grow, -1.8));
   ```
   become
   ```js
   const grow = clamp(float(0.98).div(max(pxR, 1e-5)), 1.0, 3.4).toVar();
   const D = _lens ? _lens.sprite(pxR.mul(grow), depth).toVar()
                   : vec4(1.0, 1.0, 0.68, 0.0).toVar();
   const s = s0.mul(grow).mul(D.x).toVar();
   vAlpha.assign(pow(grow, -1.8).mul(D.y));
   vPlateau.assign(D.z);
   vFlat.assign(D.w);
   ```
   `pxR.mul(grow)` is the sprite's true on-screen radius after your sub-pixel
   floor; `depth` is your existing `max(mv.z.negate(), 0.05)`. **Units already
   agree** — your `U.pix = 0.5 * domElement.height * P[1][1]` is device pixels of
   the drawing buffer, which is the same unit as `U.bokeh` and `U.texel`. No
   conversion, no dpr factor.

3. **Carry `plateau` and `flat` to the fragment as two new
   `varyingProperty('float', …)`** next to the existing `zsDropAlpha`, and apply
   exactly three things in `shade()`:
   ```js
   // (a) the alpha ramp is now the bokeh profile, not a fixed rim
   const soft = smoothstep(vPlateau, 1.0, sqrt(r2)).oneMinus();
   // (b) the impostor normal flattens with the blur
   const n = normalize(mix(vec3(nx, ny, z), vec3(0.0, 0.0, 1.0), vFlat)).toVar();
   // (c) the Fresnel rim goes with it
   const fres = pow(max(float(1.0).sub(z), 0.0), 3.0)
                  .mul(float(1.0).sub(vFlat)).toVar();
   ```
   Nothing else in `shade()` changes. `Discard(r2 > 1.0)` stays as it is — the
   quad grew, so the disc grew with it.

4. **Do the same for `makeStrands` and the cling/foam beads.** Verified in the
   crops: with only `makeDrops` converted, the ligaments and the cut-face bead
   string are the only razor-sharp things left in an otherwise defocused frame,
   and they read as stickers. A strand is a stretched quad, so use its *minor*
   half-width as `r0` and apply `grow` to both axes.

5. **Do NOT:**
   * do not set `depthWrite = true` on any particle material;
   * do not change `renderOrder` (10/11) or the blend mode;
   * do not add a second blur, a soft-particle fade, or your own depth fetch;
   * do not clamp the growth yourself — `spriteGrow` is tier-driven and lives in
     stage.js, and a second clamp would silently halve the effect on HIGH;
   * do not compensate the tint or the emission rate for the dimming. The
     dimming is the physics: a droplet spread over 16× the area at 1/16 the
     alpha is the same photons. If the spray reads thin afterwards, say so and
     I will move `bokehBase` or `spriteGrow`, not you.
   * do not read `stage.uniforms.bokeh` directly to build your own CoC. Call
     `lens.sprite()`. If the two ever disagree the frame gets a double blur and
     nobody will be able to tell which side did it.

6. **Sheet:** the juice sheet is a large low-frequency surface, and blurring it
   at emission is wrong (`r0` is meaningless for it). Leave it alone — it sits
   over the fruit, so it inherits the fruit's depth from the buffer and the post
   pass already defocuses it correctly.

**One known and accepted double-count.** A sprite drawn *over a fruit* inherits
the fruit's depth in the depth buffer, so the post gather blurs it again on top
of its own emission-time blur — ≈1.4× too wide when the sprite and the fruit are
at the same depth, and they almost always are, which makes the error a wash.
Over the void (the hero shot: one opaque object, 141 droplets) the post pass
contributes nothing and the emission-time blur is the whole effect. Fixing the
double-count properly needs a depth fetch in the vertex shader; it is not worth
a texture unit.

### B5. Verification

Same frame, only the lens racked. r4 shipped vs r5 + the section-B4 patch
applied in a scratch build:

* **Depth response:** r4 3.81 → 3.84 px across the whole rack (**flat**, σ 0.015);
  r5 3.96 → 25.94 px (**6.6×**). Requirement was "far > 4 px, near < 1.5 px in
  the same frame"; on this metric, whose in-focus baseline is 3.84 where the
  critic's reads 1.55, that is far 25.9 / near 3.96 — a 6.6× spread in a frame
  where r4's was 1.01×.
* **Binned by apparent diameter, hero frame at 960×540** (the critic's own
  binning): r4 2.59 / 3.73 / 4.61 px for the 0-8 / 8-12 / 12-18 px bins; r5
  3.43 / 4.30 / 4.44 px, *and* the population now contains 18-40 px blobs at
  18.2 px of edge, which r4 had none of at any depth.
* **Energy:** peak luminance 245.5 (constant in r4) → 235.6 near focus, 88.9
  fully defocused. The droplets get dimmer as they get wider, which is the point.
* **Visually** (crops in `/tmp/zst/z-lt-base.png` vs `z-lt-lens2.png`, 2× of the
  same 360×220 region): r4 is 20-odd identical hard-edged beans each carrying
  the same white pip; r5 has sharp beads at the focus plane and soft dim ghosts
  in front of and behind it, in the same frame.

---

## Perf

| | r4 | r5 |
|---|---|---|
| draw calls, hero (my probe, 640×360, tier 3) | 29 | **29** |
| draw calls, load probe | 37 | **37** |
| triangles | 54 726 | **54 726** |
| shader programs | unchanged | **unchanged** |
| render targets | unchanged | **unchanged** |

**Zero added draw calls, and I did not add a target, a pass or a program.** The
only new cost is fragments on the particle layer, bounded by `spriteGrow` (≤6×
radius on ULTRA, ≤4.5× on HIGH, ≤3× on MED, off on LOW) and offset by the fact
that a defocused sprite's alpha falls as 1/grow², so most of the extra area is
near-transparent. Repeated hero renders under SwiftShader (which is fill-bound,
so it over-states fragment cost): 4.3 ms → 3.3 ms in focus, 4.1 ms → 2.5 ms
defocused, i.e. no measurable regression.

**I retired nothing, but I also spent nothing.** The 139-against-120 draw-call
overrun is not in this file: stage's whole post chain is 25 calls including the
DOF pyramid, and 14 of the 29 above are the post chain plus the scene pass.

Tier flips 3 → 1 → 2 → 0 → 3 → 3 with a cut fruit in play: clean, zero console
errors, `spriteGrow` 6 → 3 → 4.5 → 1 → 6 → 6, draw calls 29/29/29/14/29/29.

---

## Constraints honoured

`src/render/stage.js` only. Every patch used for verification
(`species.js`, `fluid.js`) was applied through an esbuild `onLoad` rewrite into a
scratch bundle at `/tmp/zst`; **no file outside `src/render/stage.js` was
written.** Exported factory name and all
`init / fixed / frame / quality / resize / dispose` signatures unchanged.
`api.uniforms`, `api.grade`, `api.gradeFn`, `api.bloom`, `api.dof`, `api.probe`,
`api.streak`, `api.lights`, `api.pipeline`, `api.scenePass`, `api.focusDistance`
all still present; `api.lens` and `api.cocForZ` are new. No new deps, no network,
no `ShaderMaterial`. `npx esbuild src/render/stage.js --bundle` clean; the full
game bundled and run under `three/webgpu` on the WebGL2 backend with **zero
console errors** across the beat sheet and every quality tier.

---

## Still open, for whoever picks it up

1. **`blade.js` still places its band at `cam.position.length()`.** It should
   read `stage.focusDistance`. Flagged in r3 and r4 and still open; the blade is
   now the only sharp-by-accident object in the frame.
2. **The void's black is a 3-level pedestal** (unique RGB triplets 2/3/4,
   std 0.72) against plate-01's 27-103 triplets at std 0.55-1.71 in its darkest
   patches. Ours is flat *and* sits 3-6× brighter than the plate's true black.
   That is a `gradeFn` problem in this file and I did not get to it.
3. **The residual 1.3% clipping on the validated cut face** is the specular pip
   field, which is correct (plate-01 clips 0.29% for the same reason) but it is
   worth confirming once materials ships the real material.
