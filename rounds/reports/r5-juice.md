# r5 — juice (`src/juice/fluid.js`)

Round-4: 55/100, `render`. The r4 verdict's own summary was that the *statistics*
now pass — the fast/slow morphology split and the size-vs-colour law both
separate correctly for the first time — and the frames still lose in under a
second on one thing:

> "a countable field of IDENTICAL SMOOTH RED LOZENGES, each the same ellipse
> with the same specular bead"

So this round is **one structural change**: the droplet impostor. Everything
below follows from it. `src/juice/fluid.js` is the only file written (verified by
mtime/md5 on `stage.js`, `species.js`, `geometry.js`, `director.js`).

**Draw calls: −1, attributable, deliberate. Zero added.** Details in §5.

---

## 1. What was actually wrong, and why it was not a physics problem

r4 resolved all 9000 particles with one analytic primitive:

```
z = sqrt(1 - r²)     // the same dome
r² = dot(c, c)       // the same circular outline, stretched into the same ellipse
spec = pow(dot(n, H1), 28…165) …   // the same pip, in a randomly rotated frame
```

Three consequences, all measurable:

1. **One kind of object.** A real spray at 13 px is not a population of
   congruent shapes — it is beads, ligaments, beads-on-a-string, torn sheet
   fragments and flattened splats, in one frame. r4 had exactly one kind and
   drew it 9000 times. That is congruence of *kind*, and it is what the critic
   read in under a second.
2. **The aspect ratio was squared.** The quad was built as
   `(s/stretch, s·stretch)`, so the on-screen aspect was `stretch²`. With the
   motion term clamped at 2.4 and `baseStretch` 0.26, a slow cleave's beads ran
   at **13:1** — measured `medAsp 4.79` on 16-slow — which is the radial red
   starburst the r4 blind test called "a Fruit Ninja splat effect".
3. **The highlights did not agree on a light.** The impostor normal was built in
   the billboard's own velocity-aligned frame and then tumbled through a full
   2π, so each pip sat somewhere arbitrary relative to the key. That is the
   opposite of both plates, where every droplet's highlight points at the lamp
   and the *variety* comes from geometry.

## 2. The structural change

### 2.1 A per-particle morphology, in the same draw call

One new instanced attribute, `aShape = (morph, lump, thick, gain)`, authored per
class by the emitter, plus four decorrelated hashes taken off the `seed` float
each particle already carried (one `sin` each, zero extra bandwidth). Together
they give, per particle:

| axis | mechanism | range |
|---|---|---|
| outline | polar boundary `R(θ) = 1 − lump·Σ³ harmonics`, per-particle amplitudes, phases and roll | lump 0…0.46 |
| kind | `morph > 0.5` → a thread with a travelling Rayleigh–Plateau neck field | 2…6 beads |
| thickness | dome exponent `z = (1−q²)^thick`; 0.5 is r4's sphere, 0.16 a flattened splat, 0.70 a tall bead | 0.16…0.70 |
| aspect | now `st`, not `st²`, and a per-particle range per class instead of one constant | 1.0…9.0 |
| specular | per-particle tightness ×0.40…2.15 and gain 0.20…1.45, so a real fraction of the population carries **no pip at all** | |
| refraction | a transmitted caustic: a fat drop is a ball lens and puts a bright spot on the far side from the key. One `exp`, gated on `big²` | |
| rim, opacity | per-particle, mean 1.0 | ±35% |

Harmonics 1, 2 and 3 reach pears, teardrops, peanuts and tri-lobed grains —
shapes an ellipse fit cannot reach. `cos2θ/sin2θ/cos3θ/sin3θ` come from the
angle-addition identities on the unit vector, so the whole outline costs **no
transcendentals** and there is no `atan`.

### 2.2 Shading moved into view space

The impostor normal is now rotated out of the quad's frame into VIEW space
through `vQuad.xy` (the same `dir` the vertex built the quad with), and
anisotropically corrected for the quad's own stretch (`d/dx` picks up `rt`,
`d/dy` picks up `1/rt`), so an elongated drop reads as an elongated *surface*.
The tumble is bounded to ±0.85 rad instead of 2π: the population agrees on where
the key is, the pip still wanders and flashes as the drop rotates.

**One measurement drove a late correction here.** The honest gradient of the dome
is `slope = 2·thick`, and shipping that drove `n.z` down across the whole disc on
thick particles, which turned the fresnel rim into a broad achromatic wash: the
slow cleave's juice-tinted blob fraction fell from 73% to **29.5%**. `slope` is
now `0.55 + 0.90·thick` (= 1.0 at thick 0.5, i.e. r4's sphere exactly), the
caustic is gated on `big²` and roughly a third of what I first shipped, and the
per-particle rim multiplier's mean is 0.99. That recovered the colour axis (§4).

### 2.3 Ligaments retired into the droplet system

`makeStrands` is gone. A ligament is `morph = 1`: half-length `L`, half-width
`r`, emitted as `size = sqrt(L·r)`, `baseStretch = L/r − 1`, and the vertex
shader grows `st` over the particle's life, which lengthens and thins it exactly
as a real ligament does before it necks off. The Rayleigh–Plateau bead field it
used to draw is now one branch of the drop fragment shader.

This is the part that pays twice. It retired a draw call, a shader program, a
geometry and 420 permanently-resident instances — and the *point* is that a blob
population containing threads, beads-on-a-string, lumpy grains, tadpoles and
splats **cannot be read as a sprite emitter**. Ligament count could go up (32 →
36 at tier 3) because the pool it shares is 9000, not 420, and ~16% of a slow
cleave's spray is now emitted as a short thick already-necking scrap of sheet
(gated on `filmness`, so RULE 1 holds: a fast flick emits none).

### 2.4 Mist

Second priority from the r4 verdict: 900 → **1500** at tier 3 with the grain
sized down 0.0112 → 0.0100, so the aerosol moves toward plate-02's continuum
without the pixel budget running away. Measured off-body particle mass on
15-fast is 1929 px against r4's 2351 — *lower*, because the aspect fix stopped
each grain smearing into a streak — with 165 blobs against 257, i.e. the grains
merge into a haze instead of resolving as specks. That is the direction the
verdict asked for; it did not go as far as I would like (see §6).

---

## 3. The cross-module contract (`rounds/reports/r5-stage.md` §B4)

Implemented exactly as specified, no second mechanism, marked in the code with
`(§B4.n)`.

| item | done |
|---|---|
| B4.1 `_lens = ctx.stage.lens` as the first line of `api.init`, null-guarded, fallback `vec4(1,1,0.68,0)` | yes, `fluid.js:1104-1106` |
| B4.2 one `_lens.sprite(pxR·grow, depth)` per vertex, post-sub-pixel-floor radius, no unit conversion | yes, `fluid.js:509-516` |
| B4.3 `plateau`/`flat` carried as varyings; alpha ramp = bokeh profile; normal flattened by `flat`; fresnel × `(1−flat)` | yes |
| B4.4 same treatment for strands and the cling/foam beads | yes — and strands no longer exist as a separate system, so there is exactly one implementation to keep honest |
| B4.5 no `depthWrite`, no `renderOrder` change, no blend change, no second blur, no own clamp, no `uniforms.bokeh` read, **no compensation for the dimming** | honoured; `renderOrder` is still 11 / 10, `depthWrite` still false |
| B4.6 leave the sheet alone | untouched |

Two deviations, both inside the spirit and both stated here so nobody has to
find them:

* `Discard(r² > 1)` became `Discard(qn > 1)` and `smoothstep(vPlateau, 1, √r²)`
  became `smoothstep(vPlateau, 1, qn)`, where `qn` is the normalised **shape**
  radius. For a round drop `qn ≡ √r²` and it is bit-identical; for a lumpy one
  the bokeh ramp follows the outline, which is what the ramp is for.
* `lump` and the ligament's neck amplitude are faded out by `flat`. A bokeh disc
  is the droplet's image convolved with the aperture, so its high-frequency
  outline detail must smear out with everything else — the same argument
  stage.js makes for the impostor normal. Aspect is *not* faded: a long ligament
  stays long under a small CoC.

**One thing for the lens owner.** With energy conservation on, the +250 ms beat
reads thin: off-body particle mass 5722 → 4603 px on 04-cut+250ms, and visually
the near-focus beads are noticeably darker than r4's. Per B4.5 I did not
compensate the tint or the emission rate. If it wants a stop back it is
`bokehBase` or `spriteGrow`, not me.

---

## 4. Verification, measured on the real game

Method: a scratch esbuild of the current tree to `/tmp/zj` (nothing outside
`src/juice/fluid.js` was written; `build.mjs` and the harness were not run), the
harness's own beat sheet at 640×360, tier 3, WebGL2 backend, against
`dist/index.html` as the r4 baseline.

**Probe A — the r4 verdict's all-particle probe**, rebuilt from its description:
high-pass `lum − gaussian(σ=5) > 0.030`, minus the fruit body (blurred
`lum>0.15` mask), 8-connected, blobs ≥ 2 px.

| frame | | n | px | log-area sd | medAsp | sat≥0.45 | meanSat |
|---|---|---|---|---|---|---|---|
| 15-fast-flick | r4 | 257 | 2351 | 0.827 | 4.39 | 3.1% | 0.133 |
| | **r5** | 165 | 1929 | **0.895** | **2.41** | 10.3% | 0.211 |
| 16-slow-cleave | r4 | 115 | 3359 | 1.284 | 4.79 | 73.0% | 0.557 |
| | **r5** | 85 | 3702 | **1.384** | **2.92** | 55.3% | 0.525 |
| 02-cut+33ms | r4 | 104 | 2629 | 1.255 | 3.91 | 57.7% | 0.549 |
| | **r5** | 89 | 2790 | 1.242 | **2.29** | 52.8% | 0.533 |
| 03-cut+100ms | r4 | 191 | 5026 | 1.211 | 3.13 | 51.8% | 0.505 |
| | **r5** | 155 | 5173 | 1.210 | **2.15** | **64.5%** | **0.562** |
| 04-cut+250ms | r4 | 176 | 5722 | 1.192 | 2.41 | 68.8% | 0.625 |
| | **r5** | 102 | 4603 | **1.401** | 2.53 | **75.5%** | **0.702** |

* **Size heterogeneity is up** on the frames that matter (log-area sd 1.192 →
  1.401 on 04, 1.284 → 1.384 on 16, 0.827 → 0.895 on 15).
* **The 13:1 starburst is gone.** medAsp 4.79 → 2.92 on the slow cleave and
  3.91 → 2.29 at +33 ms, with the pixel mass *preserved or up*.
* **The r4 fast/slow colour separation survives**: 10.3% vs 55.3%, a 45-point
  separation. It is narrower than r4's 70 points and I would rather it were not;
  it is the price of the ligament class (pale by construction) being larger, and
  it is still decisive and in the correct direction. 03 and 04 both went *up*.

**Probe B — congruence, anchored on the plate.** This is the metric that
actually matches the critic's sentence, and it produced the round's most useful
surprise. Extract isolated droplet patches (25–500 px, bbox ≤ 44 px), rotate
each to its own principal axis, scale to a common 16×16 box, normalise
brightness, report the mean pairwise normalised cross-correlation. 1.0 = every
droplet is the same picture.

| | NCC |
|---|---|
| **`reference/plate-01.png`, 295 droplets** | **0.4928** |
| 04-cut+250ms r4 → r5 | 0.2029 → **0.3927** |
| 03-cut+100ms r4 → r5 | 0.2925 → **0.4073** |
| 16-slow-cleave r4 → r5 | 0.3057 → **0.5313** |

Read that carefully, because it inverts the obvious reading. **The reference
plate's droplets are highly self-similar** (0.49) — real droplets in one frame
are lit by one lamp and mostly look alike at pixel level. r4's were *less*
correlated than the plate, because its full-2π tumble scattered the pip and its
13:1 random-angle smears decorrelated the patches. So r4's failure was never
pixel-level congruence; it was congruence of **kind** — one primitive, drawn
9000 times — dressed up with noise that does not read as variety. r5 lands at
0.39–0.53 against the plate's 0.49, i.e. on the anchor from below and above.

**Probe C — per-droplet contrast** (peak ÷ mean luminance inside a blob), which
is what "the same specular bead" means quantitatively:

| | contrast | sd |
|---|---|---|
| `plate-01` | **1.750** | 0.385 |
| 16-slow r4 → r5 | 2.818 → **1.900** | 1.375 → 0.862 |
| 04 r4 → r5 | 2.952 → **2.548** | 1.706 → 1.702 |

r4's pip was roughly 70% too hot against the plate. r5's slow cleave is within
9% of it.

**Zero console errors** across the beat sheet and across six tier changes with a
cut fruit in play.

---

## 5. Perf

Controlled A/B: identical scene, identical script, one melon cleaved, one real
render per tier, r4 `dist/index.html` vs the r5 scratch build.

| tier sequence | 3 | 1 | 2 | 0 | 3 | 3 |
|---|---|---|---|---|---|---|
| r4 draw calls | 29 | 29 | 29 | 14 | 29 | 29 |
| **r5 draw calls** | **27** | **27** | **27** | **12** | **27** | **27** |

−2 measured at every tier, of which **−1 is mine and attributable**: the strands
mesh is gone. (I am not claiming the second; other files moved this round.)
Geometries 24 → 22. Shader programs: one fewer — the strand material's vertex +
fragment program no longer exists, which also removes it from Safari's
first-slice compile set. Triangles: −840 from this file (the 420-instance strand
pool); the load-probe totals moved with concurrent fruit changes, not with me.

**Zero draw calls added.** The new cost is one extra vertex attribute (`aShape`,
144 KB, one upload path shared with the others) and roughly 40 fragment ALU on a
layer whose fill is bounded by `spriteGrow` in stage.js.

JS: no measurable regression. Four runs of the 400-step CPU probe on each build,
median frame 0.0–0.1 ms both; p95 r4 0.4/0.5/0.8/1.6 ms, r5 0.3/0.7/1.3/1.6 ms —
the same noise band on this machine (one r4 run recorded a 86.7 ms max, which is
the machine, not the build). The +67% mist emission is the only added JS work
and it is inside the existing `bk` stacking throttle.

---

## 6. Still open, honestly

1. **The film, not the droplets, now dominates the slow cleave.** On
   16-slow-cleave the pale-pink sheet fans are the largest thing in frame and
   they are unchanged r4 code. With the droplets fixed, the sheet is the next
   sub-second tell on that beat, and it is the biggest remaining item in this
   file.
2. **The fast flick's aerosol is still resolvable.** 165 blobs where plate-02 is
   a continuum. 900 → 1500 helped; going to the 2500–3000 the r4 verdict asked
   for needs the per-grain alpha to come down with it, and I did not want to
   move two things at once on the one beat this file currently wins.
3. **The slow branch's juice-tinted fraction is 55% against r4's 73%.** Caused
   by the ligament class being larger and pale by construction. If a critic
   scores that as a regression, the lever is the ligament tint class
   (`cls(rad * 1.80)`) and the `pow(big, 1.20)` exponent in the drop tint — both
   one-line, both in this file.
4. **The blade** is still a full-width glowing ribbon where R1b's is a solid
   object with a thin edge highlight, and `blade.js` still places its band at
   `cam.position.length()` instead of `stage.focusDistance`. Flagged in r3, r4
   and by the r5 stage owner; not my file.

---

## Constraints honoured

`src/juice/fluid.js` only. `createFluid` and every
`init / burst / fixed / frame / quality / resize / dispose` signature unchanged
(`maxStrands` is still accepted and now allocates nothing). No new deps, no
network, no `ShaderMaterial` — node materials + TSL throughout, blending still
`NormalBlending`, `depthWrite` still false, `renderOrder` still 11/10.
`npx esbuild src/juice/fluid.js --bundle` clean. The full game bundled and run
under `three/webgpu` on the WebGL2 backend with zero console errors across the
beat sheet and every quality tier. Every verification build was written to
`/tmp/zj`; nothing outside my file and this report was written.
