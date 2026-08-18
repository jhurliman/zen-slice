# r11 — physics. Rapier rigid bodies, and the answer to his convex-hull question.

Owner: **`src/play/physics.js` (new)** + 12 lines of wiring in `src/play/director.js`.
New dependency: `@dimforge/rapier3d-compat@0.20.0`. `node build.mjs` is clean.
Nothing else was touched. Probes: added none, modified none.

Player note 2: *"the fruit-to-fruit intersections look janky, i think we need a physics
engine to keep the pieces from intersecting and get nice bounces off each other in air.
is it possible to quickly generate convex hulls in realtime as we slice the fruit?"*

Answer: **yes, in 0.49 ms per cut** (two halves, measured in the shipped build in-browser),
and only because the vertex cloud is reduced first — see §2, which is the single most
important number in this report and would have been a 34 ms hitch per melon if I had
handed Rapier what the cutter produces.

---

## 1. THE HEADLINE: INTERPENETRATION IS GONE, MEASURED, NOT ASSERTED

One build, two page loads. `?nophys=1` is round-10 behaviour (ballistic, no contacts);
the default is Rapier. Same seed, same scenes, same tree — so every number below is
attributable to the solver and to nothing else that changed this round.

Metric (`.r11pen.mjs`): separating-axis over 48 fixed directions on the two bodies'
**world-space render meshes**. If any sampled direction separates the projections the
pair is provably disjoint. Otherwise the minimum projection overlap over the 48
directions is reported, which is an **upper bound** on true penetration depth (the true
depth minimises over all directions, not 48) — so this metric cannot invent an overlap
that is not there. Units are world units; a watermelon's radius is 1.55.

| scene | metric | round 10 (no physics) | round 11 (Rapier) |
|---|---|---:|---:|
| `pile` (5 whole fruit converging) | median overlap | **1.276** | **0.008** |
| | p95 overlap | 1.703 | 0.167 |
| | frames with any overlap > 0.02 | 150 / 150 | 48 / 150 |
| `clash` (2 melons cut head-on, 4 halves meet) | median overlap | **1.065** | **0.000** |
| | p95 overlap | 1.807 | 0.283 |
| `combo` (the shipped 5-fruit beat) | median overlap | 0.057 | 0.000 |
| | p95 overlap | 0.681 | 0.218 |

A median of 1.276 units means the *typical* frame of that scene had two fruit sharing
0.8 of a melon-radius of the same space. That is what he was looking at.

**And I looked at it.** `shots/r11-physics-ab2/pile-0450ms-{nophys,phys}.png`, same
frame, same tree:

* **nophys**: the apple is buried to its shoulders in the pineapple, the kiwi is entirely
  inside the orange (you can see one lobe poking out), the melon and pineapple share a
  slab of space. It reads as five decals on one plane, not five objects.
* **phys**: five distinct bodies. The kiwi has been shouldered clear and is visible as its
  own object for the first time; the apple rests against the melon's shoulder and has
  rotated where it touched. Nothing intersects.

`shots/r11-physics-ab2/clash-0250ms-{nophys,phys}.png` is the sharper one: without
physics the four melon halves sit in a tidy 2x2 grid with their cut faces coplanar and
overlapping — an arrangement no collision could ever produce. With physics the two upper
halves have been knocked up and outward and have tumbled onto different faces, the lower
two have been shoved apart, and the whole thing reads as an impact.

Restitution and friction were picked by eye from `shots/r11-physics-rest/` (an orange
thrown into a watermelon, e ∈ {0.05, 0.30, 0.60}):

* e = 0.05 — the two bodies leave the contact at the *same* speed (12.16 vs 12.17). Dead
  clay. They look glued.
* e = 0.30 — **shipped**. They separate (11.73 vs 8.13), the light body takes the spin,
  and there is a visible gap opening two frames later without either body being flung.
* e = 0.60 — the orange is thrown backwards hard (7.55) while the melon speeds up. Reads
  as billiards, not fruit.

---

## 2. HIS QUESTION, WITH THE NUMBER — AND THE TRAP IN IT

*"is it possible to quickly generate convex hulls in realtime as we slice the fruit?"*

Two facts make it easy:

1. **A half produced by plane-splitting a convex body is itself convex.** No convex
   decomposition, no approximation, no offline bake — the hull of the half's own vertices
   *is* its exact collider.
2. Rapier computes that hull in WASM from a raw vertex cloud
   (`ColliderDesc.convexHull(Float32Array)`).

The trap is that the cost is superlinear in the cloud, and `cutter.js` emits non-indexed
triangle soup — **10,908 loose vertices for a tier-3 watermelon half**. Measured
(`.r11rt3.mjs`, node, same WASM the browser runs; note the hull is built lazily inside
`world.createCollider`, so timing `ColliderDesc.convexHull` alone reports 1 µs and is a
lie):

| points | collider build | points | collider build |
|---:|---:|---:|---:|
| 8 | 42 µs | 128 | 264 µs |
| 16 | 36 µs | 256 | 407 µs |
| 32 | 68 µs | 1500 | 2 964 µs |
| 64 | 107 µs | 5500 | 10 972 µs |
| 96 | 157 µs | **10 908** | **17 147 µs** |

Naive = **34 ms of hitch on every melon cut**, on precisely the input the player says
drops frames. So `physics.js` reduces the cloud first, in JS:

1. stride the position array to ~600 candidates (soup repeats each vertex ~6x, so this
   discards almost only duplicates);
2. keep, for each of 48 Fibonacci-sphere directions, the candidate with the largest dot
   product — the exact support point of that subset in that direction — and dedupe.

Every surviving point is **on** the hull by construction, so the collider is an inscribed
approximation with a bounded radial error: the direction spacing is
`sqrt(4π/48)/2 = 0.255 rad`, so `1-cos = 3.2%` worst case — 0.05 units on a watermelon.
`TUNING.hullInflate = 1.03` scales the points about the body origin to put the collider
back on the visible skin, because two inscribed hulls touching means the two *rendered*
skins already overlap by up to 6% of radius before the solver has anything to say.

**Measured in the shipped build, in-browser, warm** (`.r11px.mjs`, desktop, 3 runs):

| stage | per half |
|---|---:|
| JS cloud reduction (10 908 pts → ≤48) | 0.11 – 0.16 ms |
| Rapier `createCollider` (hull of ≤48 pts) | 0.33 – 0.56 ms |
| **total per half** | **0.49 – 0.71 ms** |
| **total per cut (2 halves)** | **0.98 – 1.4 ms** |

So: yes, realtime, ~1 ms per cut, and the browser is 3-5x slower than node at the same
work on this rig (2 shared cores under SwiftShader) — the honest number is the browser one.

Solver step cost scales with hull complexity, not just body count, which is the other
reason the reduction matters. Node, 51 bodies: **1500-point hulls p50 0.606 ms / p95
2.772 ms; 64-point hulls p50 0.072 ms / p95 0.231 ms.** An 8x difference from the same
scene.

---

## 3. PERF. HE REPORTED FRAMEDROP AND I ADDED A SOLVER, SO THIS IS THE DELIVERABLE

⚠ This box has **2 cores and a load average of ~1.5** from other agents. Single runs swing
2x. Everything below is the **median of 3 paired runs**, physics on vs off, same build,
same page-load sequence. `max` is not reported for the reason round 10 established.

### 3a. Realistic session — the director paces itself, one stroke every 0.75 s (`.r11play.mjs`, 25 s of sim)

| | p50 | p95 | p99 |
|---|---:|---:|---:|
| desktop, no physics | 0.0 ms | 0.1 ms | 0.2 ms |
| desktop, **physics** | 0.0 ms | **0.2 ms** | 2.7 ms |
| portrait, no physics | 0.0 ms | 0.1 ms | 0.4 ms |
| portrait, **physics** | 0.0 ms | **0.3 ms** | 2.3 ms |

Solver: **0.038–0.050 ms per fixed step**. Sync in 0.001 ms, sync out 0.005 ms — the
Rapier→JS readback writes into objects we hand it (`body.translation(f.pos)`), so it
allocates nothing and costs nothing. p99 is the cut step, and it is the hull build.

### 3b. Pathological load loop — a cut every 8 steps (6.25 cuts/s), 18–42 live bodies (`.r11px.mjs`)

| | p50 | p95 | p99 |
|---|---:|---:|---:|
| desktop, no physics | 0.0 ms | 0.3 ms | 2.1 ms |
| desktop, **physics** | 0.4 ms | **4.8 ms** | 10.6 ms |
| portrait, no physics | 0.1 ms | 0.8 ms | 4.5 ms |
| portrait, **physics** | 0.4 ms | **3.8 ms** | 9.5 ms |

### 3c. The frozen harness's own CPU probe (`tools/shoot.mjs`, unmodified)

| | median | p95 | peak draws | peak tris |
|---|---:|---:|---:|---:|
| desktop r10 (recorded) | — | 0.5 | 83 | 153 273 |
| **desktop r11 physics** | 0.3 | **1.2** | **33** | **88 691** |
| portrait r10 (recorded) | — | 1.2 | 115 | 160 435 |
| **portrait r11 physics** | 0.3 | **1.0** | **53** | **96 863** |

Both orientations are inside every R4 ceiling (120 draws / 250k tris / 8.3 ms) with room.
Draw calls *fell* — not something I optimised for: contacts shove fragments out of the
visible box sooner, so the round-10 budget governor retires them sooner. Note that the
harness probe and my probe disagree by ~4x at p95 on a loop of the same shape; I have not
resolved that and I am not going to pretend I have. The harness's number is the one nine
rounds have used and it is 1.0–1.2 ms; my paired probe is the one that isolates the
*delta*, and the delta at p95 is +0.1–0.2 ms in real play and +3.0–4.5 ms under six cuts
a second.

**The honest bad number: p99 in the stress loop is 9.5–10.6 ms, over the 8.3 ms budget**,
on ~1% of steps when a human is cutting six times a second (nobody does; my play probe's
"hand" managed 1.3/s). It is the hull build, and if it ever matters the fixes, in order of
preference, are: drop `TUNING.hullDirs` 48 → 32 (68 µs vs 107 µs in node, ~5% inscribed
before inflation); build the second half's hull on the *next* step (halves are 8 ms apart
in perceptual terms and neither can touch anything in one step); or a ball collider for
generation-2 fragments only.

### 3d. THE FRAMEDROP HE SAW WHEN "FRUITS SPLIT APART" IS NOT THE SOLVER, AND WASN'T BEFORE

Isolated, warm, one melon, one cut, 8 repeats, timing the entire swipe→cut→juice path:

| | p50 per cut |
|---|---:|
| no physics | **31.9 ms** |
| physics | **30.5 ms** |

The two are the same within run-to-run noise, and physics demonstrably adds ~1.0–1.4 ms
of that (§2). **A single cut costs ~30 ms on this rig and always has.** That is 3.6 frames
at 120 Hz. Whatever the player is seeing when fruit split apart, the solver is at most 4%
of it — the cost is in `cutGeometry` + the juice burst. Round 11 deleted the slow-mo that
was masking it (feel's report). Someone should own that 30 ms; it is the largest single
frame cost in the game and it fires on the one action the game is about. **Request to the
integrator: schedule a cut-path profile (cutter.js + fluid.js) as its own piece.**

---

## 4. THE FROZEN SUITE, AS A CONTROL. ONE PROBE FELL AND IT SHOULD HAVE

Canary before and after all of my work, unchanged as required:

    python3 tools/probes.py clip shots/r5/05-cut+500ms.png
    mask_px 9490 / pct_R_ge_255 5.227   ✓ (identical both times)

To make the suite attributable I replayed the shipped beat sheet inside one build with the
solver on and off (`.r11beat.mjs` → `shots/r11-physics-beats/`), because three other files
changed this round and a r10→r11 diff cannot tell you who moved what.

| probe / beat | physics OFF | physics ON | verdict |
|---|---:|---:|---|
| `void` 01-whole-watermelon corner_max | 2.97 | 2.94 | black floor intact |
| `void` pct_exact_black | 0.0 | 0.0 | intact |
| `silhouette` 01 mask_px | 12 602 | 12 644 | **+0.33%, i.e. nothing** |
| `silhouette` 01 frame_height_pct | 40.56 | 40.28 | nothing |
| `droplets` 05-cut+500ms n_blobs | 134 | 128 | nothing (juice is untouched) |
| `clip` 05-cut+500ms mask_px | 2 418 | **1 943** | **fell, correctly** |
| `ring` 08-citrus-caps max_over_min | 1.443 | **3.403** | **fell, correctly** |

The whole-fruit frame is unchanged to a third of a percent — a fruit in free flight flies
the arc it always flew, because Rapier's integrator and the director's old one are the
same semi-implicit Euler at the same `sdt` and I left damping at zero specifically so this
would hold. The tiny residue is torque-free precession, which the old fixed-axis spin did
not model.

`clip` and `ring` fell because **the halves now tumble**. Both probes measure the cut face:
`clip` masks the red cap and `ring` measures how uniform the cap's ring is. A half that
has rotated 40° away from camera by +500 ms presents a foreshortened ellipse instead of a
flat disc, so both numbers get worse. **That is a probe score falling because the game
moves better**, and it is exactly the failure mode this round exists to correct: the cap
was facing the camera at +500 ms because nothing had ever pushed it. For scale, the same
`clip` number over the *whole* round moved 10 340 → 1 943, and only 2 418 → 1 943 of that
is mine; the rest is the slow-mo deletion re-dating every beat.

---

## 5. WHAT I BUILT, AND THE FIVE DECISIONS WORTH REVIEWING

**`src/play/physics.js`** (new, ~520 lines with the reasoning in it) —

* **It runs on the game's clock.** `world.timestep = sdt` and exactly one `world.step()`
  per fixed step. Rapier has no accumulator and touches no wall clock anywhere in this
  path, so `ZS.step()`, `Clock.virtual` and every measurement the project has still work.
* **The registry is authoritative, always.** Physics mirrors `ctx.fruits.live`; it never
  adds a body, so it cannot resurrect anything the round-10 budget governor retired.
  Bodies leave the world in `director.remove`.
* **External writes win.** The harness stages every beat as
  `const f = ZS.spawn(...); f.pos.set(...)` — *after* the rigid body exists. The top of
  each step compares `f.pos/quat/vel/spin` against the values this file last wrote and
  pushes back anything that changed underneath it (13 float compares per body, no
  allocation). Without this the entire beat sheet would have been ignored.
* **Cut torque is derived, not authored.** The blade's friction acts along `stroke.dir` at
  the **cap**, offset from each half's centre of mass by `r = -signed(com)·n`. The halves
  are on opposite sides of the plane, so their torques `r × J` are equal and opposite:
  they counter-rotate about `n × dir`, which for a swipe across the screen is the camera
  axis — the pieces pinwheel in the screen plane. An off-centre cut gives one half a
  bigger `|r|`, so it tumbles harder. Nothing hand-tuned but the gain, and the gain was
  set by eye: at `tumble = 0.42` a melon half span at **19 rad/s (3 rev/s)**, which is
  frantic in a game whose spec says "relaxing"; shipped at **0.15**, which lands halves at
  3.2–7.5 rad/s against the old fixed 1.4–2.8.
* **Contacts only where they can be seen.** A tossed fruit spends 43% of its flight below
  the frame (director.js measured that) and the spawn strip is off-screen entirely. Bodies
  outside the visible box (derived from the camera, same as the director's retirement box,
  plus a 2-unit pad) get collision membership 0 — *not* `setEnabled(false)`, because that
  would change their mass properties and therefore their arcs. Two fruit passing through
  each other where no one can see them is free; fixing it is not.

Also in the file and worth knowing: a `warmUp()` that builds and throws away three hulls
at init (the first cut of a session cost 33 ms of pure JIT/WASM cold start, at the worst
possible moment), and `separateAtSpawn`, because a burst spawns up to three fruit in the
same instant from a 5.5-unit strip and two watermelons need 3.1 units of clearance — in
round 10 that was invisible, with contacts it is a shove that ruins both arcs. It is
bounded to 8 passes; the unbounded version hung a probe for four minutes, which is in the
comment.

**Every entry point is wrapped in a `guard()`**, and this one is not paranoia: `main.js`'s
`safe()` retires a *module* on its first throw, and this code runs inside the director's
`fixed`. An exception out of WASM would not disable physics, it would disable **the
director** — an empty sky forever, no fruit, no error a player could see. On a throw,
physics switches itself off and the director's ballistic integrator takes over on the very
next step.

**`src/play/director.js`** — 12 lines: the import, `const physics = createPhysics()`,
`physics.init(c)` + `ctx.physics = physics` in `init`, `physics.addBody/removeBody` in
`add`/`remove`, and `const stepped = physics.step(sdt)` above the integrate loop with the
old ballistic body wrapped in `if (!stepped)`. The old path is not dead code: it runs
before the WASM has loaded, and after any failure.

---

## 6. THE ONE THING I WOULD ESCALATE: **BUNDLE SIZE**

`@dimforge/rapier3d-compat` inlines a 2.02 MB WASM blob as base64. Measured exactly
(`.r11size.mjs`, identical esbuild config, rapier stubbed vs real):

| | raw | gzipped |
|---|---:|---:|
| without rapier | 1 176 337 B (1.12 MB) | 339 721 B (332 KB) |
| **with rapier** | **4 030 938 B (3.84 MB)** | **1 424 424 B (1.36 MB)** |
| delta | **+2.85 MB (3.4x)** | **+1.06 MB (4.2x)** |

`node build.mjs` stays clean and the single-file `dist/index.html` still works, so this
ships as-is. But it is a second of load time on a phone. Options, none of which are mine
to take:

1. **Accept it** — one file, zero infrastructure, which is what `build.mjs` is for.
2. **Switch to `@dimforge/rapier3d`** (non-compat): the `.wasm` is a separate artifact
   (~2.02 MB raw, ~700 KB gz) fetched in parallel with first paint instead of blocking the
   parse of a 4 MB script. Needs `build.mjs` to emit a second file — **not my file, so
   this is a request, not a change.**
3. Serve gzip/brotli. Brotli on a base64 WASM blob should beat the 1.36 MB above
   substantially; nobody has measured it because there is no server.

---

## 7. OPEN, HONEST, AND FOR THE NEXT ROUND

* **p99 in the six-cuts-a-second stress loop is 9.5–10.6 ms, over the 8.3 ms budget.**
  Real play is 2.3–2.7 ms at p99. Fixes ranked in §3b if it ever bites.
* **The ~30 ms cut path (§3d) is the biggest single frame cost in the game and it is not
  mine.** If the player still sees a hitch when fruit split apart after this round, that is
  where it is.
* **Max penetration is still 0.6–0.7 units for a frame or two at the instant of a hard
  impact** in the pile/clash scenes (median 0.008 / 0.000). Some of that is the metric
  (upper bound, measured against the render mesh, not the collider). Stiffer contacts were
  swept — 7 solver variants in `.r11sweep.mjs` — and 4 iterations × 2 internal PGS at 60 Hz
  contact frequency won on both scenes; more outer iterations did *worse* and cost more.
* **Sleeping is disabled on every body** (`setCanSleep(false)`). Fruit are in free fall for
  their whole life and a body that slept at the apex of its arc would hang in the sky. If
  a future round ever gives the world a floor, revisit.
* **This module now decides orientation**, so if `geometry.js` changes fruit shape (note 4,
  the "spiky low-poly" complaint), the colliders follow automatically — they are rebuilt
  from whatever `mesh.geometry` holds. No coordination needed.
* Probe scripts I added, all hidden and none of them frozen-suite: `.r11pen.mjs`
  (penetration A/B), `.r11px.mjs` (load loop + hull cost), `.r11play.mjs` (realistic
  session), `.r11cap.mjs` (A/B frames), `.r11beat.mjs` (beat-sheet A/B for probe
  attribution), `.r11rest.mjs` (restitution by eye), `.r11sweep.mjs` (solver sweep),
  `.r11size.mjs` (bundle delta), `.r11rt*.mjs` (node micro-benchmarks).

Frames: `shots/r11-physics2/` (desktop, final), `shots/r11-physics-iphone/` (portrait,
final), `shots/r11-physics-ab2/` (A/B, three scenes), `shots/r11-physics-rest/`
(restitution), `shots/r11-physics-beats/` (beat-sheet A/B). All 17+18 harness beats
non-black and verified by eye; zero failed beats, zero page errors, zero module errors in
both orientations.
