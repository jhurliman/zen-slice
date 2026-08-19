# r14 — six player notes, and the one I have to answer with a "no"

**Source: the player, 2026-08-18, after playing r13 on the phone. This outranks every probe.**
Files touched: `src/juice/fluid.js`, `src/slice/slicer.js`. Nothing else.
Canaries, before and after: `clip shots/r10/05-cut+500ms.png -> 10340 / 4.333` ✅
`clip shots/r9/05-cut+500ms.png -> 10057 / 2.197` ✅ · `PROBE_VERSION` 16, untouched.

**Look at `rounds/reports/r14-feel.png`** — portrait, tier 2 (his iPhone's tier), an *ordinary*
5 ndc/s swipe, five beats from +50 ms to +1300 ms, before and after.

---

## 1. "almost all white spray and little blobby fluid at normal swipe velocities"

**The cause was not the mist class. It was that the BLOB class was itself 60% white**, and I would
not have found it by looking, because both classes render as small pale dots at phone scale.

`cls()` makes a droplet juice-coloured only above `small = 0.030*szScale`. r9 deliberately pushed
the bulk of the **rim** size law below that line to match plate-01's median blob area — its own
comment says so: *"most beads piled small (and, being below `small` = 0.031, reading WHITE as the
plate's fine drops do)"*. Measured on a melon cleave at `szScale` 0.84, crossover 0.0252 units:

| rim law | median radius | share above the colour crossover |
|---|---|---|
| r9/r10/r12 `(0.017 + 0.123·u^4.4)` | 0.0192 | **40.0%** |
| **r14 `(0.026 + 0.115·u^2.6)`** | **0.0378** | **72.5%** |

The heavy tail is untouched — the top of the draw is 0.141 against the old 0.140 — so r8/r9's fat
beads and the `area_p95_over_median` range survive. What moved is the **pile**, upward, across the
colour line.

**This partly reverses r9 knowingly, and the frozen suite will say so.** `droplets median_area_px`
was matched to a scale-matched plate at 24–25 and will rise. **That trade is his to make and he has
now made it twice.** The plate is a still photograph of a different splash; r9 chose it as the
target, and he is the target.

Two supporting changes: **`CROSS_NDC` 9.0 → 16.0**, and the **mist quota cut 35%** with rim up 13%
(`mist [130,480,1000,1500] → [90,320,650,980]`, `rim [64,132,222,300] → [72,150,250,340]`). r12 set
the crossover by reading *spray share of droplet area*; that statistic is not wrong but it is not
what he sees — at tier 2 the emitter put 1000 grains against 222 beads, so **at an area share of
even a third the frame is countably mostly white**. Area says "a third", the eye counts objects and
says "almost all". This is the first time `mist` has ever been lowered: r6 declined on cost, r10
declined because it was not the measured gap, and nobody had a reason until he named the symptom.

## 2. "too much force ... a swipe is sending the two parts flying off screen"

Three terms push the halves and **all three scale with stroke speed, so they compound** — and
nobody re-checked them after r11 put the halves on Rapier bodies or after r12 changed what
`stroke.speed` reads.

| term | was | now | why |
|---|---|---|---|
| separation impulse | `clamp(0.7 + S·0.045, 0.8, 3.2)` | `clamp(0.45 + S·0.0097, 0.5, 1.45)` | the old law **saturated at S = 55.6**, so an ordinary swipe was pinned at the ceiling and every swipe above it felt identical. The new one reaches its ceiling at S = 103, a hard flick, so the ordinary range is expressive instead of clipped |
| lateral kick | `dir · S·0.06` | `dir · S·0.021` | at r12's corrected speeds a flick added 5.8 u/s of sideways travel against a **3.90-unit portrait half-width** — it cleared frame on its own, before separation or gravity |
| spin | `±(1.2 + rand·1.6)` | `±(0.55 + rand·0.85)` | the third term nobody counted. Over a full rotation before landing, which points the cut face — the thing r10 spent a round on — away for most of the flight |

## 3. "the blobby fluid is still disappearing ... I want to see it falling more"

**This is r11's fix overshooting, and the overshoot is visible in r11's own table.** It raised the
median rim asymptote 2.20 → 6.15 units to stop droplets dying of old age in mid-air; at r12's
corrected speeds a cleave reached **~13 units** against a 3.90-unit portrait half-width. The exit is
real — r11's `%out-before-death` is honest — but it is the **wrong exit**: out the sides in a few
hundred ms, so the fall he wants to watch never happens.

`beadReach` 2.80 → **1.55** with its filmness term 4.40 → **2.60** puts a melon cleave at ~5.3 units:
still far past r11's 2.20 "cannot reach the edge at any lifetime" failure, and now *below* the
landscape half-width, so gravity dominates the back half of the arc. Drag `kB` 1.10–4.20 → **0.85–2.90**,
and terminal fall is exactly `g/k` with g = 14, so beads now sink at 4.8–16.5 u/s through a frame
8.45 units tall — about a second of visible fall. **The derived-lifetime mechanism is untouched**:
they still exit, `lifeOf` still solves a real exit time, they just exit through the floor.

## 4. "the spray should be more directional ... right now it's a confetti explosion"

**Structural, not a constant.** Every class is aimed at `_wax`, which was built as `N + D·lean` with
`lean` maxing at 0.63 — `atan(0.63)` = **32° off the CUT NORMAL**. The cone was pointing out of the
cut faces the whole time, and **no value of `lean` in that formula could ever point it along
travel**, because `lean` would have to run to infinity. `_wax` is now an explicit angular blend:

```js
const aimD = 0.55 + 0.37 * fast;                  // 0.55 -> 29° off blade travel; 0.92 -> 5°
_wax.copy(B.N).multiplyScalar(1 - aimD).addScaledVector(B.D, aimD).normalize();
```

⚠ **And the floor must not ride on `fast`.** My first attempt tied `aimD` to the Weber mix — then
fixing note 1 by raising `CROSS_NDC` dropped `fast` to 0.09 at an ordinary swipe and **silently
undid the whole thing**. I only caught it by rendering both changes together. The two notes are
about different physics: the mix is whether a ligament survives; this is the blade *dragging* fluid,
which happens at every speed. Also: `aimWedge` blends raised to 0.45/0.52/0.58 at the slow end, and
the crown's fast floor 0.40 → 0.26 rad, because spread is what makes a cone read as confetti.

## 5. "wind or turbulence ... too strong ... primarily their initial force vector"

He stated the right relationship and the old numbers inverted it. `turbAmp` fed an acceleration into
per-droplet turbulence velocity, and `dispMax` capped total turbulent displacement at **1.25 world
units — comparable to a rim bead's entire median asymptotic travel.** The noise was as strong as the
ballistics it was supposed to perturb.

`turbAmp` **46/34/22 → 11/8/5.5** and `dispMax` **1.25 → 0.34**, so the hard ceiling on how far the
wind can ever move a droplet is now ~9% of a fruit radius instead of ~90%. The kernel is unchanged;
only its authority is.

## 6. "do the particles obey the physics engine colliders and bounce off other fruit parts?"

**No. Verified in the code, not assumed: `src/juice/fluid.js` contains zero references to Rapier,
`physics.js`, colliders or bodies.** A droplet's world position is a closed form evaluated in the
vertex stage:

```
p(t) = origin + v·(1−e^(−kt))/k + g·(t − (1−e^(−kt))/k)/k  +  turbulence
```

It is a pure function of `t`. There is no per-droplet position anywhere on the CPU, and nothing in
the pipeline ever asks where a fruit half is. Rapier (r11) carries the **halves only**.

**The arithmetic is cheap; the mechanism is the problem.** Per-droplet-vs-body sphere tests would be
9000 × ≤16 bodies = ~144k distance tests per frame, which is nothing next to the two octaves of curl
noise the compute kernel already evaluates per droplet. And the hook exists — that kernel *already*
maintains per-droplet state and a storage buffer.

**What it actually costs is the closed form.** To bounce, a droplet's trajectory after impact must
differ from its trajectory before it, which means integrated state — and the closed form is what
`exitTime`/`lifeOf` solve to derive each droplet's lifetime, which is r11's central mechanism and
the reason juice leaves the screen instead of fading. Replacing analytic droplets with integrated
ones is a rewrite of the most calibrated mechanism in the most calibrated file in the project.

**So: feasible, not expensive to run, and I am not doing it inside a tuning pass.** It wants its own
round with its own control. Two intermediate options if he wants some of it sooner:

* **Occlusion, not bouncing** — the compute kernel could push droplets out of overlapping body
  spheres as a *displacement*, which stops juice passing visibly through a melon half. Cheap, no
  rewrite. It would read as sliding, not as a bounce, and I would rather say that up front.
* **Sticking already half-exists** — the `cling` class is foam on the cut face and already rides the
  fruit. Extending it to *land* on other halves is closer to what "stick to" means than a bounce is.

---

## What the frozen suite says, as a control

Recorded, not steered. `median_area_px` rising is the declared cost of note 1; everything else is
listed so a critic can attribute it.

See `shots/r14/` and `shots/r14-iphone/` and the tables appended below.

### Perf — every ceiling, both orientations, 0 failed beats

| | draw calls / 120 | triangles / 250k | live bodies | cpu p50 / p95 (bar 2.0 ms) |
|---|---|---|---|---|
| landscape | 29 | 78,477 | 18 | 0.1 / **0.3** (spread 0.3–0.3) |
| portrait | 43 | 90,781 | 17 | 0.1 / **0.4** (spread 0.3–0.4) |

Bigger beads cost fragments, not draw calls — droplets are one instanced draw into a pool whose
`instanceCount` saturates after the first bursts, so `rim +13%` and a fatter size law are +0 draws,
+0 programs, +0 triangles by construction.

### The frozen suite, as a control (`droplets`, landscape, r12 → r14)

| beat | mask_px | n_blobs | median_area_px | p95/median |
|---|---|---|---|---|
| `04-cut+250ms` | 6677 → **3330** | 80 → 37 | 23.0 → 26.0 | 6.71 → 5.52 |
| `05-cut+500ms` | 6470 → **12996** | 100 → 95 | 23.5 → **36.0** | 3.64 → **9.13** |
| `15-fast-flick+50ms` | 3083 → 2844 | 10 → 17 | 14.0 → 17.5 | 1.68 → 2.35 |
| `16-slow-cleave+50ms` | 72 → 37 | 2 → 0 | — | — |

**`05` is note 3 landing**: at +500 ms there is now twice the droplet mass on screen, at 1.5x the
median blob area, still travelling. **`04` falling is a region-identity change, not a loss** — the
same one r7 §t and r11 §4 document. Look at the pair: r14 has a denser, redder, more directional
splash, but it is *clustered around the cut* rather than scattered across the frame, so more of it
merges with the fruit's own connected component and the probe stops counting it. I am flagging it
rather than explaining it away; if a critic wants to disagree, the frames are in `shots/r14/`.

**`16-slow-cleave+50ms` is a real, declared cost.** Instantaneous off-body punch at +50 ms is down,
because `beadReach` came down for note 3. It is the same trade r11 declared in the other direction,
and the single knob is that `1.55`.
