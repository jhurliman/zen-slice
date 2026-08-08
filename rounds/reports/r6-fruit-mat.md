# r6 — fruit-mat (`src/fruit/species.js`)

FILES TOUCHED: `src/fruit/species.js` (mine). `tools/r6bench-fruit-mat/` (new
directory, mine, additive — an isolated A/B bench, **not** a probe). Nothing
else. `tools/probes.py` is byte-for-byte as I found it at PROBE_VERSION 3 —
see §1, where I explain why I wrote a probe for it, measured it, and then
deleted it rather than ship it.

**No albedo, hue, exposure constant, `capBudget` ceiling or `capKey` gain moved
this round.** The round-5 win is untouched by construction.

---

## 0. THE ONE STRUCTURAL CHANGE

> **Nothing below the pixel goes into the normal.**

The brief hands me two defects and calls them separate:

* **(A)** "the cut face is buried under a uniform field of clipped white foam
  pips — 13.6% of the core-0.80 face against plate-01's 4.2%, **42% of them
  single-pixel**, and 78% of every remaining R=255 pixel on the face is one of
  them at (255,213,174)."
* **(B)** "the pith collar is a drawn ring, not a lit shell — the same width and
  the same brightness at EVERY angle, 12-sector max/min **1.35** against the
  reference's 3.9."

They are the same bug at opposite ends of the scale. This file expresses every
surface feature as a height field and hands it to `zsBump`, which recovers a
normal from `dFdx`/`dFdy` — **a derivative that is constant across a 2×2 quad.**
A feature narrower than that footprint does not become a normal. It becomes
noise.

**(A), mechanically.** The second foam octave runs at `q * freq * 2.15`. At the
640×360 review size a watermelon cap is ~104 px across, so `dq/dpx = 1/52` and
that field's `fwidth` is 0.359 per pixel. Its blobs are 0.30–0.72 of a cell, so
the **beads were 0.9–1.9 PIXELS across**. The existing guard, `cellFade`, keys
on the **cell** period and returned **0.95** there — full strength. A field of
1-px domes at 95% strength is the definition of aliasing, and "42% of them
single-pixel, at one brightness" is its signature, exactly.

**(B), mechanically.** `cutter.js`'s RINGS table builds a real stepped shell —
groove −0.25 rd, pith crest +0.34, seam +0.20, peel top +0.52 — whose slopes
are +0.53 / −0.36 / +0.30 outward. Every one of those sub-bands is 2–3 px wide
and **the signs alternate**, so (i) the vertex normals, smoothed across shared
group-A ring boundaries, average +0.53 against −0.36 into approximately the flat
cap normal, and (ii) any height field describing them is differentiated over a
quad that spans the whole feature. Both paths deliver a collar with no
directional response.

That last point retires three rounds of work: **rounds 3, 4 and 5 each retuned
`capKey`, which reads `normalWorldGeometry`, and `normalWorldGeometry` on the
collar IS the flat cap normal. There was never a swing there to tune.** That is
why the metric went 1.36 → 1.16 → 1.35 while three authors pushed it three
different ways and each reported an arithmetic prediction that did not survive.

The rule, applied in both directions:

| scale | treatment |
|---|---|
| above the derivative footprint | keep it in the normal (`zsBump`) |
| at the footprint, but authored | put the normal in **analytically**, from a field that *is* resolved (`capShade`) |
| below the footprint | it is variance, so it becomes **roughness** (`blobFade` + `wetField().micro`) |

The last row is standard normal-map filtering (Toksvig / LEAN): unresolved
normal variance is mathematically a wider NDF, not a dimmer surface. This is why
the change is *not* "turn the foam down" — the specular integral is conserved
and moves from a 1-px spike into the broad sheen plate-02 actually shows.

---

## 1. ⚠ LOUD: `ring` HAS NEVER MEASURED A COLLAR, ON ANY FRAME, IN ANY ROUND

The brief says: *"Verify: `python3 tools/probes.py ring shots/rN/05-cut+500ms.png`.
Target: max_over_min from ~1.35 toward the reference ~3.9."*

Run it on the frame it names, before I changed anything:

```
ring shots/r5/05-cut+500ms.png   ->  max_over_min 3.354   mask_px 3763
ring reference/plate-01.png      ->  max_over_min 5.514   mask_px 272361
```

**Round 5 already reads 3.354 against a stated target of 3.9, on a frame whose
collar a human measured at 1.35.** A builder steering by this number would have
shipped nothing and reported a pass — the precise failure mode `probes.py`
exists to end.

The reason is the mask. `ring` fits its ellipse to the largest luma component of
the **whole frame**; on 05-cut+500ms that component is both melon halves plus
the juice bridging them, so its 0.55 → 0.7425 annulus is two horizontal stripes
across the middle of the flesh and the rind. Render the mask and look at it —
the collar is outside the band on every spoke:

```python
import sys, numpy as np; sys.path.insert(0,'tools'); import probes as P
from PIL import Image
img  = P.load('shots/r5/05-cut+500ms.png')
subj = P.largest_component(P.subject_mask(img))
inner,_ = P.second_moment_ellipse(subj, 0.55)
outer,_ = P.second_moment_ellipse(subj, 0.55*1.35)
band = outer & (~inner) & subj                      # 3763 px
out = (img*0.35).astype(np.uint8); out[band] = [255,0,255]
Image.fromarray(out).save('/tmp/band05.png')
```

`ring` is a perfectly good probe for what it does measure — a subject's radial
luminance profile. It is simply not named after that.

**I wrote a `collar` probe, bumped PROBE_VERSION to 4, verified all 14 existing
suite numbers reproduced exactly — and then deleted it and reverted the file.**
I tried two masks (an ellipse annulus at 0.80–1.02 of an explicit window, and a
per-spoke band at 0.82–1.00 of the subject's own boundary radius). Both give:

```
ours  shots/r5/05-cut+500ms.png  win=286,206,394,302   max/min 11.9 – 12.8
plate reference/plate-01.png     win=545,320,805,565   max/min  1.45 – 1.45
```

i.e. **inverted from the human judgement**, because an outer annulus on our
frame is a small object against a black void (its shadow-side rind falls to
luma 16) while on plate-01 it is surrounded by juice and other fruit. There is
no image-only mask that isolates a pith collar on both, so the honest outcome is
a documented negative result, not a fourth misnamed ruler. `probes.py` is back
at v3 and `suite shots/r5` is byte-identical to before I touched it (verified by
diffing the full JSON).

**For the round-7 critic:** do not ask this file to move `ring`. If you want to
judge the collar, judge it by eye against `reference/plate-01.png` and say so,
or use the bench in §3, and either way state your mask.

---

## 2. WHAT I ACTUALLY CHANGED

All in `src/fruit/species.js`. Four edits, one idea.

### 2.1 `blobFade(p, r)` — the sub-pixel guard moves from the CELL to the BLOB

`cellFade` guards the cell period; the thing that has to be resolved is the
blob, which is 0.30–0.82 of a cell. So the old guard protected a feature roughly
**three times larger than the one that was aliasing**. `blobFade` restates it in
the only units that mean anything — pixels across the feature — and takes the
blob's own per-cell radius:

```js
function blobFade(p, r) {
  const fw = max(fwidth(p.x), fwidth(p.y)).max(1e-5);
  return ss(2.0, 4.0, float(r).mul(2.0).div(fw));   // 0 under 2 px, 1 over 4 px
}
```

Because `r` is per-cell this is a **heavy-tail filter for free**: inside one
field the small beads fade out continuously and the fat ones survive, so the
surviving population becomes plate-01's "1 px to 250 px, 17% single-pixel"
distribution instead of our "42% single-pixel at one size". It is also a true
LOD — every threshold doubles in blob-pixels in a 2× hero frame, so a scale that
is roughness at review distance is geometry in close-up, with no popping and no
second graph.

### 2.2 The foam population is authored, not implied

* `BEAD_PER_UNIT` 5.6 → **3.2**. The old value made scale-1 cells 5.8 px and
  scale-2 cells 2.7 px, i.e. the entire foam field lived at or under the
  derivative footprint. At 3.2 the scale-1 cell is 10.5 px and its beads are
  2.2–7.0 px: resolvable, so they can shade as domes.
* A **presence gate** (`g1`/`g2`, a second hash stream off `id`, 3 ALU). Round 5
  put a bead in *every* cell, so density and size were the same knob and could
  not be separated — 83 components at 13.6% coverage against plate-01's ~12
  per-our-face-area at 4.2%. They are independent knobs now. The gate multiplies
  a blob that is already zero at the cell wall, so it introduces no edge.
* **`margin` now covers the authored radius.** Round 5's own note on `cellPt`
  says a blob whose outer radius exceeds `margin` is "truncated flat against the
  cell wall — exactly the 'regular grid of hard-edged square dots' the r4 critic
  named". Scale 1 shipped an outer radius up to **0.41 against the default
  margin of 0.22**: the fattest beads on every cut face in the game were being
  clipped to squares. Radii re-authored to fit inside a margin that still leaves
  a third of a cell of jitter.

### 2.3 `wetField().micro` — the removed variance becomes roughness

```js
const micro = blobFade(p1, float(0.22)).oneMinus().mul(0.30)
  .add(blobFade(p2, float(0.215)).oneMinus().mul(0.70))
  .mul(mask.mul(0.70).add(0.30)).toVar();
```
…added in `roughnessNode` at ×0.10. Evaluated at each scale's **mean** radius,
not per blob, so it depends only on `fwidth` and is a smooth screen-space field
that cannot itself re-alias.

This is deliberately **not** the same move the r5 verdict objected to. That one
added lobe width to energy that was still in the normal ("it did not remove the
env-specular energy, it smeared it"). This moves width and normal *together*,
which is the only way the total specular integral stays put. At review size it
is +0.021…+0.070 of roughness on a 0.170 pulp film; in a hero frame scale 2
resolves, `micro` falls toward zero on its own, and the beads come back as real
domes. One expression, both distances.

### 2.4 `capShade` + `collarTilt` — the collar becomes a lit shell

`capShade` is `zsBump` plus one term. It takes the **direction** from `rad`
(= `uv.y`, a field that runs 0→1 across 52 px, so its gradient is exact),
normalises it to the unit outward radial vector *on the surface*, and applies an
**authored** tilt magnitude sampled pointwise:

```js
const gr   = R1.mul(dFdx(rad)).add(R2.mul(dFdy(rad))).mul(sg).toVar();
const rhat = gr.div(length(gr).max(1e-6)).toVar();
return normalize(ad.mul(N).sub(gh).sub(rhat.mul(tilt).mul(ad)));
```

Direction from a resolved field, magnitude from a table: **neither half is ever
asked to survive a derivative it cannot.** `collarTilt` is three smoothsteps
read straight off cutter.js's RINGS table (−0.34 flesh dome into the groove,
+0.50 pith wall to the crest, +0.24 outer collar), with the crest rollover
(−0.36) and peel wall (+0.30) merged because they are 2.5 px each and cancel to
−0.035 area-weighted — authoring them as two opposed sub-pixel bands would be
the exact mistake this round exists to stop making.

Two safety properties:

* **It cannot be squared.** The renderer applies N·L once, to a normal that is
  genuinely tilted. `capKey` still reads `normalWorldGeometry` and is therefore
  still flat on the collar — the round-3 albedo×N·L squaring is impossible here
  by construction.
* **It cannot blow the clip budget.** The tilt only changes N·L, and the r5
  pith/rind constants were already solved at the worst case N·L = 1.0 (0.455
  scene-linear against the 0.655 ceiling, 31% margin). Confirmed below: collar
  clipping goes *down*.

Relief is tapered to 30% across the collar (one line, all species) so the
differentiated copy of the shell does not fight the authored one.

`shell` is a `uniform`, default 1.0 = cutter.js's own slopes unrounded, so the
next round can move it without rebuilding a graph.

---

## 3. MEASUREMENT — AND EXACTLY WHAT IT IS AND IS NOT

I did not run `build.mjs` or the harness; the brief forbids it and the reason is
sound (a full-app render this round measures five agents' half-finished work).
So I have **no r6 frames and therefore no frozen-suite number.** Everything
below is from an isolated bench, and it is **not comparable with a suite
number**. It is in `tools/r6bench-fruit-mat/` with a README saying so.

The bench renders a synthetic cut cap — built to cutter.js's published RINGS
table, with `computeVertexNormals()` so the same normal smoothing happens —
through WebGPURenderer's WebGL2 backend under the EXPOSURE CONTRACT's exact
lights, exposure 1.28, NeutralToneMapping and PMREM environment scene, with no
grade, no bloom, no DOF and **no other agent's module in the bundle**. Only
`species.js` varies. `species-r5-reconstructed.js` is the round-5 file rebuilt
by reverting my four edits, so this is a genuine A/B on one variable.

`camz 19.6` puts the cap at review apparent size (face 110 px; the game's
05-cut+500ms face is 104 px). `camz 10.2` is hero size.

| statistic (core-0.80 face / outer band) | r5 | **r6** | plate-01 |
|---|---|---|---|
| **collar 12-sector p95 max/min** | 1.821 | **4.326** | brief says ~3.9 |
| whitish (G>0.75R) coverage | 2.50% | **1.50%** | −40% |
| R≥255 on the face | 0.053% | **0.000%** | |
| pip components | 48 | **20** | ~12 rescaled |
| pip max component, px | 9 | **17** | 250 px on 14.6× area ≈ **17** |
| fraction single-pixel | 27.1% | **20.0%** | 17% |

Hero size (face 211 px): collar 1.669 → **4.800**; pips 128 → 53; max 25 → 39;
whitish 2.75% → 1.63%.

The collar sector profile tells the story better than the ratio does:

```
r5  122 116 119 107 100  86 106 117 115 154 138 156     flat, max/min 1.82
r6  117  88  68  44  43  52  53  80 116 145 184 142     lit,  max/min 4.33
```

Side-by-side renders: `ab-r5-review.png` vs `ab-r6-review.png` in the bench
directory. The r5 frame is a ring of even brightness all the way round under a
uniform dust of white dots; the r6 frame has a bright arc on the side whose
inward-leaning wall faces the key, a dark arc opposite (min sector 43, still
well clear of the void floor of 8 — the round-3 failure of *losing* spokes does
not recur), and a sparse population of larger beads with the removed fine scale
showing as broad sheen.

**Honest caveats.** The bench's absolute numbers are much lower than the game's
(2.50% whitish vs the critic's 13.6%) because it has no grade, no bloom, no
rim-lit skin and one material. Only the **ratios** are the claim. And my
`collar_maxmin` is a bench statistic, not `ring` — the game's r5 collar measured
1.35 by hand where my bench's r5-equivalent measures 1.82, so the bench reads
~1.35× high; extrapolating, 4.33 in-bench is ≈3.2 in-game, just under the
stated 3.9 target. I deliberately did **not** tune `shell` upward to close that,
because the in-game cap is rotated and the grade adds contrast, and over-fitting
to an extrapolation is how rounds 3–5 were lost.

**Compile safety, verified rather than assumed:** the bench builds and renders
**all six species' flesh AND skin materials** in one scene. All six come back
`MeshStandardNodeMaterial` / `MeshPhysicalNodeMaterial` with `colorNode` and
`normalNode` intact — no `Material "..." is not compatible` log, no page error,
no shader compile error. A silently-substituted empty material would have cost
the whole round.

---

## 4. PERFORMANCE — WHAT IT COST

The brief is explicit that perf is now a blocker (peak 129 draw calls against
120, JS max 7.7 ms against 2.0). **This change spends none of that budget.**

| resource | delta |
|---|---|
| draw calls | **0** |
| triangles | **0** |
| shader programs | **0** (same materials, same light count, same slots) |
| per-frame JS | **0** (no new hot-loop code, no allocation, `setSpeciesQuality` untouched) |
| uniforms | **+1 static float per flesh material**, 6 total, written once at construction |
| ALU | **~30 per cut-face pixel**, in `normalNode` and `roughnessNode` only |

The ~30 ALU breaks down as: `capShade` adds 2 scalar `dFdx`/`dFdy`, one vec3
mad, a `length`, a divide and a multiply over `zsBump` (~15); `collarTilt` is
three smoothsteps (~6); `blobFade` adds a divide over `cellFade` (~2 each);
`micro` is two more `fwidth`-driven smoothsteps (~8) and TSL only emits it in
`roughnessNode`, the one slot that reads it. Cut faces are a small fraction of
frame coverage and the fruit are the cheapest fragments in the scene. Nothing
here can cause a first-slice recompile: every new value is either a build-time
constant or an existing-style `uniform()`, and no graph is ever rebuilt.

---

## 5. WHAT I DELIBERATELY DID NOT DO

* **`specularIntensityNode` ≈ 0.30** (the r5 verdict's headline fix). Two
  reasons. `specularIntensityNode` is a `MeshPhysicalNodeMaterial` feature and
  the flesh is `MeshStandardNodeMaterial`, so it would most likely have been
  silently ignored — the worst possible outcome, a change that reports as
  shipped and does nothing. And a global 3.3× cut to all specular removes the
  "bright specular across the entire face" that REFERENCE_BAR R1b demands. The
  clipped pips are gone in the bench without touching F0.
* **Chasing G/R down.** The verdict wants 0.577 → 0.31. Through the **frozen**
  probe the same face reads `clip 05-cut+500ms` G/R **0.6599** against
  plate-01's **0.6406** — 3% apart, i.e. already on the plate. The two numbers
  disagree because the frozen `clip` mask on plate-01 is a 362 926 px ellipse
  over the *whole splash*, not the melon face, so its G/R is not the melon
  face's either. **Flagging that as a third measurement-layer caveat rather than
  moving a hue against an instrument I cannot trust.** Contract v5 §5 also
  warns in the opposite direction: "Do NOT desaturate the flesh to chase G/R."
* **Any albedo, any exposure constant, `capBudget`, `capKey`.** The r5 win
  (14.208% → 5.227% clip, red channel on the plate to 1.2%) is the only thing
  that has worked in four rounds and I did not go near it.

---

## 6. FOR THE ROUND-7 CRITIC — THE THREE THINGS TO CHECK

1. `clip 05-cut+500ms` must not regress from **5.227% / mask 9490**. If it does,
   the culprit is `micro`'s ×0.10 in `roughnessNode` or the presence gates in
   `wetField`; both are one constant.
2. The collar. **Do not use `ring`** (§1). Look at the frame, or run the bench.
   If the shell reads too hard, `m.userData.zsu.shell.value` is the single knob
   and it is linear: 0 is round-5 behaviour, 1 is cutter.js's real slopes.
3. Pip morphology by the critic's own connected-component method on the
   core-0.80 face: r5 was 83 components / 13.6% coverage / 42% single-pixel /
   max 73 px. The bench predicts roughly −58% count, −40% coverage, ~20%
   single-pixel and a doubled max. If the shipped frame does not move that far,
   the next lever is `BEAD_PER_UNIT` (3.2, lower = bigger beads) and the
   `step(0.55, g1)` / `step(0.74, g2)` gates (higher = fewer), which are now
   genuinely independent of each other for the first time.
