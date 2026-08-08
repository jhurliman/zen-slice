# r3 — stage (`src/render/stage.js`)

Round-2 score 42/100. Headline: *"the newly added DOF produces zero measurable
defocus on any fruit at any depth."* Target given: **far fruit silhouette 10-90
edge width > 4 px at 640x360 while near fruit stays under 1.5 px.**

**Result: 0.39 px in focus / 1.01 px one z-unit in front / 7.40 px one z-unit
behind, at 640x360 on the ULTRA tier the harness uses. Target met on both ends.
Draw calls for the post chain went DOWN by 7.**

---

## 1. The critic's diagnosis was right but incomplete — and that mattered

The named cause (`focalLength` 5.0 vs a ±2-unit playfield, `focus` pinned to
`camera.position.length()`) was real. A previous r3 agent had already fixed
those numbers (focalLength 2.10, subject-tracking focus) and then died before
reporting. **Fixing them is not sufficient.** I verified this rather than
assuming it, on an isolated three-sphere rig driven through the real
`createStage()`:

> With `three/addons` `DepthOfFieldNode`, spheres on black at z = +1.2 / 0 / -1.2
> and focus racked to the near one, the FAR sphere's silhouette stayed at
> **1.8 px** even at `focalLength 0.6` and `bokehScale 20` — i.e. with CoC pinned
> at 1.0 and a 20-texel disc. Its interior smears; its outline stays razor sharp.

Two structural reasons in that node, both fatal for a subject on black:

1. Its composite is `mix(beauty, blurred, CoC_at_this_pixel)`. A void pixel next
   to a defocused fruit has CoC 0, so it keeps the beauty buffer's black no
   matter what its neighbours do. **Defocus can never spread outward past a
   silhouette** — which is exactly what "silhouette edge width" measures.
2. Its second blur pass is a **MAX filter** (bright-bokeh fill) that dilates the
   interior back to full brightness right up to the edge, actively re-hardening
   the transition.

Slackening the void clamp does make it bleed, but it bleeds *everything* — the
sharp in-focus subject grows a halo too, because the destination pixel's CoC
drives the blur. (Screenshot-verified both ways.)

## 2. What I did instead: `softDof()`, a hand-written scatter-as-gather pass

Replaced `dof()` with one full-resolution TSL gather, wrapped in
`convertToTexture` so bloom and the additive composite sample it instead of
re-compiling the tap loop into both.

Per tap, **the tap's own CoC** decides whether its energy reaches the centre
pixel, and that energy is divided by the area it scatters over. That is the
physical model and it gets all four cases right:

| case | behaviour |
|---|---|
| sharp pixel, sharp neighbours | only the centre tap has cover → output is the input. In-focus subjects are not softened at all (0.39 px) |
| void pixel, defocused fruit nearby | the fruit's taps cover it → **silhouette bleeds outward** (7.40 px). This is the measured failure, fixed |
| void pixel, sharp mist sprite nearby | sprite CoC is 0 → cover 0 → **no halo**. Juice stays crisp, as R1b requires |
| sharp foreground over defocused background | a `guard` term kills taps that sit *behind* a pixel sharper than they are → no wash-over |

Kernel is a compile-time Vogel disc (unrolled, no dynamic indexing), rotated per
pixel by **interleaved gradient noise** — IGN, not a `sin`/`fract` hash. That
was a visible win: white-noise rotation gave salt-and-pepper in the bokeh, IGN
gives a fine even stipple. Taps: 40 / 32 / 20 by tier, in the graph key.

### Also fixed while in there: a silent, expensive TSL trap

`perspectiveDepthToViewZ(depth, cameraNear, cameraFar)` using TSL's **global**
`cameraNear`/`cameraFar` is wrong inside a post pass. A post pass is drawn with
a full-screen quad under an *orthographic* camera, so those globals resolve to
the quad camera's planes. `PassNode` has the same problem and solves it with
private `_cameraNear`/`_cameraFar` uniforms. Symptom is silent and misleading:
viewZ comes out in the wrong units, every CoC saturates, `focus` stops doing
anything at all, and the void blurs. I now carry my own `U.camNear`/`U.camFar`,
set from the scene camera in `init` and `resize`. **Other agents: do not reach
for the TSL camera globals in a post graph.**

## 3. Measured (isolated rig, 640x360, drawing buffer 1:1)

Sphere at screen centre, focus driven to fixed distances. Metric: vertical
profile down the centre column across the bottom silhouette, 10%→90% of the
local step above the void pedestal.

| condition | ULTRA (fl 1.05, bokeh 8.8, 40 taps) | MED (fl 1.45, bokeh 6.4, 20 taps) |
|---|---|---|
| at the focus plane | **0.39 px** | 0.38 px |
| 1.2 units IN FRONT | **1.01 px** | — |
| 1.2 units BEHIND | **7.40 px** | 4.66 px |
| 2.4 units BEHIND | 7.40 px | — |

Both critic thresholds are met with margin (>4 far, <1.5 near) and the response
is monotonic in depth, which is what "uncorrelated with apparent size" was
complaining about. In the harness's `09-combo` staging (fruit at z = -1.2, 0,
+1.2) focus racks to the pineapple at z = 0, so the melon and apple at z = -1.2
land in the 7.4 px column and the strawberry at z = +1.2 lands in the 1.0 px one.

## 4. Draw calls: **-7**

`DepthOfFieldNode` costs seven full-screen passes (CoC, CoC blur, blur64 near,
blur16 near, blur64 far, blur16 far, composite). `softDof` costs one RTT.
Measured on the isolated rig: **26 → 19 draw calls** for an identical frame.
That is a straight subtraction from the 149-against-120 problem. LOW tier is
5 calls (no DOF, no bloom); tier flips 3→1→2→0→3 rebuild cleanly with zero
console errors and the render target is now explicitly disposed on rebuild
(`RTTNode.dispose()` does not free it).

Fetch count is comparable to what we already paid — the addon spent 64+16 taps
per pixel at half resolution; this spends 32 colour + 32 depth at full. Tap
count is a one-line tier knob if the GPU budget bites.

## 5. Secondary (under-lit subject) — improved, not finished

Measured on the real game snapshot, `01-whole-watermelon`, 640x360:

| metric | round 2 | now | plate-01 |
|---|---|---|---|
| body p90 luminance | 131.6 | **165.7** | 177.7 |
| % of body over 120 | 13.3% | **21.5%** | 28.8% |
| highlight centroid dx | -0.29 (upper-LEFT) | **+0.34 (upper-RIGHT)** | hard upper-right |
| highlight centroid dy | -0.44 | -0.20 | up |
| idle frame at exactly RGB(0,0,0) | 96.4% | **0.0%** | 7.4% |
| frame corners | 0.0 / 0.0 / 28.9 / 0.3 | **2 / 2 / 2 / 2** | 5 / 1 |
| blown % | 0.273 | 0.271 | 0.115 |

Levers used, deliberately *not* exposure: `environmentIntensity` 1.08 → 1.31 and
the analytic key 6.2 → 7.7. Both act on geometry only, so the void does not
follow them up and neither does the blade streak — which is the one thing in
frame already clipping. Exposure stays at 1.28.

`U.blackFloor` had been declared in round 2 and **never wired into `gradeFn`**;
it is now, applied before the vignette so the pedestal itself falls off toward
the corners rather than being one flat value.

I tried raising the analytic key's elevation to move the highlight centroid
further up (dy -0.20 → -0.22) and it cost 1.4% of body p90 for essentially
nothing — the pin highlights are made by the env cores, not the analytic light.
Reverted, and said so in the comment so the next agent does not retry it.

## 6. Still open / for other files

- **Highlight blob count is 8 vs plate-01's 1334.** Stage cannot fix this. 1334
  blobs above luminance 200 is a property of a wet, micro-detailed *surface* —
  specular breakup from roughness and normal detail — not of emitter count. One
  panel makes one pip per surface no matter how bright. This belongs to
  materials.
- **`blade.js` places its band at `cam.position.length()`** and its comment says
  that matches the DOF focus. It no longer does: focus now racks to the subject
  and can sit 1.2 units off the camera axis distance, which will throw the blade
  trail out of focus. I published **`stage.focusDistance`** (metres down the
  lens, refreshed every frame) for exactly this; blade should read that instead.
  Flagged in the file header too.
- Blown % (0.271 vs plate's 0.115) is essentially all blade streak. I left the
  flare alone this round on purpose — the round-2 flood fix is what earned the
  +26 and I was not going to perturb it while changing the DOF.

## Files touched

`/home/claude/juice/src/render/stage.js` only. Exported factory name and all
init/fixed/frame/quality/resize/dispose signatures unchanged. No new deps.
`api.uniforms`, `api.grade`, `api.bloom`, `api.dof`, `api.probe`, `api.streak`,
`api.lights` all still present; `api.focusDistance` added.
