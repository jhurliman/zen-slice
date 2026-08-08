# Zen Slice

A Fruit-Ninja-style slicing game in Three.js, built to a photographic bar and
scored blind against it every round.

Ships as **one self-contained HTML file** — no network at runtime, no downloaded
assets. Every fruit, material, fluid and light is procedural, so it stays sharp
at any resolution.

- **Renderer:** `WebGPURenderer` + TSL (`three/webgpu`, `three/tsl`), three
  v0.185.1. WebGPU on Safari 26+ / iOS 26+; the WebGL2 backend of the same
  renderer is what the automated critics see, since TSL compiles to both.
- **Target:** sustained 120 fps on ProMotion iPhone/iPad, never below 60 —
  an 8.3 ms frame for everything.

## How it is built

Each round, builder agents each own exactly one file and improve one piece.
Independent critic agents with fresh context then score that piece **blind**
against the reference plates — imagine the two images handed to you unlabelled;
if you can tell instantly which is the render, the score is low.

Scores are 0–100 where 100 means a careful viewer cannot reliably pick the
render. Progress across rounds:

| piece | r0 | r3 | r5 | r7 |
|---|---|---|---|---|
| Fruit silhouette | 35 | 51 | 58 | **70** |
| Lighting, grade & DOF | 32 | 50 | 58 | **67** |
| Cut faces & rind | 30 | 60 | 59 | **66** |
| Juice fluid | 18 | 46 | 56 | **65** |
| Fruit materials | 25 | 46 | 55 | **64** |

`dist/progress.html` is a self-contained page with every round's frames,
verdicts and named gaps.

## The three things that made it work

**1. A domain model that lets ten agents work without colliding.**
`src/core/contract.js` is frozen: Species / Fruit / Solid / Half / Blade /
**SliceStroke** / JuiceBurst / Director / Score. `SliceStroke` is load-bearing —
the cut, the juice, the sound, the slow-mo and the score are all pure functions
of one stroke × one fruit. Modules never import each other, only the bus.

**2. A frozen measurement suite.** `tools/probes.py` is the only sanctioned
instrument; builders and critics call the same code. It exists because round 5
plateaued on *measurement*, not rendering: one critic's headline number was
irreproducible because its mask was refit each round, and one builder's probe
keyed on `G < 0.80R` — so it could not see the white foam pips it was written to
measure, and reported 4.89% where the honest figure was 14.07%.

> **The rule:** masks are geometric, never keyed on the colour of the thing being
> measured. Add probes freely; never modify one. Bump `PROBE_VERSION` and verify
> stored baselines still reproduce.

Audited after six bumps by six different agents: the clip probe still returns
`mask_px 9490 / 5.227%` on round 5's frames. No drift.

**3. A stall detector that can tell idle from wedged.** `tools/stallcheck.mjs`
plus `tools/stallwatch.sh`. Written after a workflow hung for ~12 hours: six
agents finished their edits and then died *reporting* them, so the pipeline
waited forever on a result that would never arrive. See
[`tools/`](tools/) and the `stall-watch` skill.

## What kept going wrong

Every expensive failure in this project was at a **seam**, not inside a file:

- Two agents moved the same physical quantity in opposite directions — one
  lowered flesh albedo to stop clipping while the other raised the key light.
  They cancelled exactly. Fixed by making one agent own the *exposure contract*
  and publish it, measured, before anyone else authors against it.
- A depth-of-field pass blurred a band of the frame that happened to contain
  another module's razor-sharp trail — an invisible blur mask hiding someone
  else's defect, which appeared as a regression the moment it moved.
- `geometry.js` encoded appendages by pushing `uv.y` above 1.0 and documented
  that `species.js` reads that mask. It doesn't — it clamps `uv.y` to `[0,1]`,
  destroying the signal. Three rounds of crowns, calyxes and stem wells shaded as
  plain body skin. Both files were correct in isolation; the contract lived only
  in a comment.

## Layout

```
src/core/contract.js      frozen domain model + event bus
src/render/stage.js       lighting, EXPOSURE CONTRACT, lens, post stack
src/fruit/geometry.js     procedural silhouettes (welded geodesic + profile)
src/fruit/species.js      procedural rind + flesh materials (TSL)
src/slice/cutter.js       mesh split by plane, cap generation, rind collar
src/slice/slicer.js       swipe -> SliceStroke -> halves
src/juice/fluid.js        GPU-analytic fluid: sheet, ligaments, beads, mist
src/input/blade.js        pointer capture, swipe emission, blade ribbon
src/play/director.js      spawning, ballistics, pacing, levels
tools/probes.py           THE FROZEN MEASUREMENT SUITE
tools/shoot.mjs           deterministic screenshot harness (virtual clock)
tools/stallcheck.mjs      stall detection
rounds/                   per-round records, verdicts, builder reports
reference/                the bar
```

## Build

```sh
npm install
node build.mjs                                    # -> dist/index.html
node tools/shoot.mjs --out shots/rN --device desktop
python3 tools/probes.py suite shots/rN
```

The harness runs on a **virtual clock**: it simulates in the dark at a fixed
120 Hz and renders only the frames it will actually look at, so software
rasterisation cannot distort what a 120 Hz phone would draw at the same beat.
It bounds every wait and carries a hard watchdog, because a full-resolution
frame with a nontrivial fragment shader can take 15–35 s under SwiftShader and
sixteen of those looks exactly like a hang.
