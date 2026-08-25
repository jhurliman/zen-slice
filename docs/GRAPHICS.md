# The graphics architecture

Chord Cut renders with three.js's `WebGPURenderer` and TSL (`three/webgpu`,
`three/tsl`) — **only**. There is no WebGL2 fallback build; the same TSL
compiles to WGSL and GLSL, and the WebGL2 backend of the same renderer is what
the automated probes exercise (`?capture=1`). Everything on screen is
procedural: no textures are loaded, no models, no fonts beyond the system's.

The visual bar was set by two photographs in `reference/` — a studio
watermelon plate (`plate-01.png`: pure black void, one hard warm key, wet cut
faces) and a high-speed citrus shot (`plate-02-highspeed-citrus.jpeg`: the
fluid and the blade). Early development scored frames blind against them;
those plates still govern the look.

## Hard constraints (read these first)

- **NodeMaterials only.** `ShaderMaterial` / `RawShaderMaterial` /
  `onBeforeCompile` / `EffectComposer` are unsupported on this renderer and
  **fail silently** — three logs "not compatible" and substitutes an empty
  material. Everything is TSL: `colorNode`, `positionNode`, `roughnessNode`…
- **Budgets:** ≤120 draw calls, ≤250k triangles, ≤2 ms JS p95, at 120 fps.
  Draw calls are `13 + 2·bodies` (each fruit/half is skin + cap). The scene
  budget governor in `director.js` retires far/deep pieces first.
- **The frame must idle at #000000.** The void is pure black — no gradient,
  no dust. `stage.api.probe()` measures corner luminance and blown-pixel
  percentage so this is assertable without a screenshot.
- `build.mjs` resolves `three/tsl` with an **exact-match** esbuild `onResolve`
  (a prefix alias would rewrite the specifier).

## The stage (`src/render/stage.js`)

Studio lighting, the environment, the blade flare, and the post pipeline.

- **Lighting**: one hard warm key (upper-right), rim, fill — plus a tiny,
  very hot panel environment (rendered once through PMREM). Highlight *size*
  is emitter solid angle, highlight *brightness* is radiance, so speculars
  stay small and blinding, never soft washes.
- **The streak**: a hot filament of light raking horizontally behind the
  blade plane (`exp(-y²·2600)` core + tight sheath) — a light source, not
  fog.
- **Pass order** (`RenderPipeline`, one node graph):

  ```
  pass(scene, camera)
    → softDof(colour, depth)        [tier ≥ MED] one hand-written pass
    → + glow pyramid                [tier ≥ MED] three blur passes
    → renderOutput(…)               NeutralToneMapping + sRGB encode
    → grade(…)                      crush / contrast / sat / split-tone
                                    / vignette / grain — in DISPLAY space
  ```

  The grade runs *after* the encode (`outputColorTransform = false`) so grain
  and black-crush behave like film, not like linear-light math.
- **The exposure contract**: stage.js's long header derives, in scene-linear
  units, what every surface should measure under this light — key/env/fill
  irradiance, the watermelon cut-face target, bloom threshold (fires above
  scene-linear luminance ~1.35). Any module adding lit surfaces must author
  against those numbers, not against what "looks right" on one monitor. This
  is the single most load-bearing comment block in the repo.
- **The lens is shared.** `stage.lens` owns the circle-of-confusion model;
  the fluid defocuses its own sprites through it (`_lens.sprite()`), so there
  is exactly one depth-of-field in the world. DOF is deliberately about half
  of what plate-02 suggests — a player tracking five fruit is not looking at
  a macro still.

## Fruit geometry (`src/fruit/geometry.js`)

A fruit is a **meridian profile swept into rings**, not a displaced sphere
(a sphere has no meridian you can author — stems and wells can only ever be
wobble on a ball):

1. **Profile**: a 2D curve (y, ρ) per species — superellipse body, a genuine
   concave stem well, and the profile continues *up the stem* itself.
2. **Graded rings**: rings placed by walking the profile by arc length; each
   ring picks its column count from its radius (6-gon on a stem, ~54 columns
   at the equator), stitched with a zipper where counts change. Detail lands
   where the shape is.
3. **Appendage lobes**: the pineapple crown (30 blades, 3 whorls) and
   strawberry calyx (12 sepals) are a positive radial displacement field
   h(direction) — real geometry, zero at the footprint edge, so no seams and
   no second shell.
4. **Winding by construction** (nothing is flipped afterwards), welded
   vertices, area-weighted normals, then expansion to the non-indexed layout.

Everything is a **radial graph about the origin** (r = f(direction), then
linear maps) — exactly the star-shaped condition the cutter needs so cap fans
stay valid on every re-cut.

Output format (load-bearing, cutter depends on it exactly): non-indexed
`BufferGeometry`, attributes position/normal/uv, two groups —
materialIndex 0 = skin, materialIndex 1 = cap.

Geometry is cached per (species, detail tier) in `director.js`'s `geoCache`;
halves dispose their geometry when retired.

## Species materials (`src/fruit/species.js`)

Per species, two TSL materials: **skin** (rind) and **flesh** (cut face),
both `MeshPhysicalNodeMaterial` driven by procedural fields — fbm noise,
polar patterns (watermelon stripes, orange peel cells, kiwi fibre), and the
achene/dimple field that also modulates roughness (strawberry seeds glint
from an otherwise matte skin; the wet shine belongs to the cut face). The cap
material reads the cutter's polar uv to band peel / pith / flesh in **world
units** and carves real relief at the seams. Rocks are a `noCut` species with
a per-instance crack uniform (`_zsDamage`) — their per-instance materials are
disposed on retirement.

## Cutting (`src/slice/cutter.js`, `src/slice/slicer.js`)

`cutGeometry(geom, plane, rindThickness)` splits a closed solid into two
closed solids by plane — real geometry, not a shader trick:

- skin triangles are clipped against the plane; the clip ring welds;
- the cap is a fan about the ring centroid (valid because every solid is
  star-shaped about its origin);
- cap uv is polar; the outer bands are an **inward normal offset in world
  units** so peel and pith read as constant-thickness shells on any cap size
  or eccentricity, with real 3D relief at the seams (peel lip, wet groove).

`slicer.js` owns the gameplay side: swipe → `SliceStroke` → per-fruit cut,
half impulses, juice burst, bus events. Pieces are re-cuttable to
`MAX_GENERATION = 3` (eighths).

## The juice (`src/juice/fluid.js`)

One system, several populations — sheet, ligaments, beads, mist — each a
single draw call:

- **Ballistics are closed-form in the vertex shader** (linear drag, evaluated
  from one sim-time uniform): 9000 droplets cost one draw, zero CPU, and stay
  exact under slow motion.
- **A TSL compute kernel** adds per-particle turbulent displacement:
  divergence-free curl noise plus a decaying vortex ring in the blade's wake,
  responsiveness ~ 1/size. No atomics, no shared memory, so it also runs on
  the WebGL2 fallback (transform feedback); the buffer reaches the render as
  a plain vertex attribute (`.toAttribute()`), the only compute-to-render
  path identical on both backends.
- If compute is unavailable (or disabled via `ZS.setFluidCompute(false)` —
  fast-forwarding probes must, see `tools/soak.mjs`), droplets fall back to
  the pure analytic path: the picture degrades in swirl, never in existence.
- Droplet sprites defocus through `stage.lens` — no second CoC model exists.

## The blade (`src/input/blade.js`)

A swept **steel band**, not a glowing trail: asymmetric cross-section with
the cutting edge on the pointer path, normal blending over a near-black base
(it *darkens* what it crosses), and exactly one bloomable feature — a thin
specular filament on the edge. It participates in the DOF like every other
object.

## Quality tiers & the governor

`ctx.quality` carries the tier (LOW → ULTRA): geometry detail, droplet
counts, sheet count, DOF/glow on/off, `maxFruit`. The fluid's turbulence
kernel is the first thing to go on a weak device (tier 0 disables compute).

The decision logic is `src/core/governor.js` — pure arithmetic, importing
nothing, so `tools/govprobe.mjs` can drive whole sessions through it in node.
`main.js` keeps only the apply half (what a tier means, who needs telling).
Two nested loops: **render scale** is the fine one and moves first (pixels
are the cheapest thing to shed — the fluid sim is per-pixel), **tiers** are
the coarse one and only move when scale is saturated.

Three things are easy to get wrong here and all three shipped in r39:

- **Judge DOWN against a fixed 60 fps period, never a learned panel rate.**
  A ProMotion phone drops to its 60 Hz divisor the moment the scene costs
  more than 8.3 ms, and r39 read that honest 60 as "every frame missed" —
  spending all four tiers in 12 s with no path back.
- **Debit clean-run counters, never zero them.** A 30 s clean run that any
  single GC pause restarts is a run that never completes on real hardware.
- **Effective dpr is `min(devicePixelRatio, tier.dpr) * renderScale`** — two
  governed factors that COMPOUND. Bounding them separately let r39 reach 0.5
  effective dpr on a dpr-3 phone: 1/36 of native pixels. `scaleFloorFor()`
  bounds the product instead.

The player can override the whole thing: the settings panel cycles
`graphics auto|low|med|high|ultra` (pref `gfx`). Anything but `auto` pins the
tier AND the render scale and switches the governor off — deliberately, for
players who would rather spend frame rate on pixels. `?debug` shows
`T<tier>≤<ceiling> ×<scale> <eff>dpr <ms> <fps>/<panel>fps`, plus `gfx:<mode>`
when a level is pinned. **Read the `dpr` figure when the game looks soft** —
it is the product, and reading tier and scale separately is exactly how
"tier 0 ×0.5" failed to look like a problem to anyone.

## Verification

```sh
node tools/drawprobe.mjs     # draw calls / triangles vs budget on deterministic frames
node tools/fruitviews.mjs    # every species top/side/three-quarter → shots/fruit/
node tools/shoot.mjs         # the screenshot corpus (virtual clock, bounded waits)
node tools/soak.mjs          # long-session resource census (no GPU work — see header)
node tools/perfprofile.mjs   # per-module frame-cost attribution (ZS.profile)
node tools/govprobe.mjs      # the quality governor, whole sessions, pure node
```

All probes run the real bundle in headless Chromium on a virtual clock
(`ZS.step()`), with `?capture=1` forcing the WebGL2 backend under SwiftShader.
`stage.api.probe()` asserts the black-void contract numerically.
