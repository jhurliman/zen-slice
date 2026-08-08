# r4 — juice (`src/juice/fluid.js`)

Score to beat: 46/100. The central test now passes with a 10x margin on size and
a 50x margin on tint, and — more importantly — I found out **why** it kept
failing, which is not what the r3 verdict said.

---

## 1. The r3 verdict's attribution is wrong, and the real cause is worse

The verdict: *"84 cling beads, juice-tinted, ~13 px each, own 68% of the fast
frame's particle pixels."*

I rebuilt the critic's probe (it reproduces their r3 numbers **exactly**: n=152,
particlePx=1623, median 4.0, medAspect 1.50 on `15-fast-flick+50ms`) and then
labelled the components spatially:

| region of the real r3 `15-fast-flick+50ms` | blobs | px | px with sat ≥ 0.45 |
|---|---|---|---|
| upper half (y < 180) — the silver mist arc | 21 | 76 | **1** |
| lower half (y ≥ 180) — the fat orange cloud | 131 | 1547 | **1295** |

The fat orange cloud is **not cling**. It is the **citrus cut's rim beads**,
emitted two beats earlier and still on screen. Three independent checks:

1. **Position.** The same cloud is visible in `08-citrus-caps.png`, around the
   orange at x 130–320 / y 130–280. In `15-fast-flick` it is at x 145–315 /
   y 200–330 — the same cloud, 70 px lower.
2. **Fall rate.** 0.25 s of harness time separates the two shots. Rim beads have
   drag k = 1.4…3.2, so terminal fall is GRAVITY/k ≈ 6 units/s ⇒ 1.5 units ⇒
   **70 px**. Exact.
3. **Forward simulation.** Driving the real `fluid.js` emitter through the whole
   harness beat sheet (see §5) and rendering only the citrus bursts puts 156 of
   the fast frame's 396 alpha units there, at meanSat 0.9. The fast flick's own
   cling contributes 17.

Symmetrically, `16-slow-cleave+50ms` was carrying the **fast flick's** residue —
the two "independent" test frames were each measuring the other's juice. That is
why they came out the same to within 1.3 points however hard r3 separated the
free-droplet populations.

Root cause: **rim beads lived 0.30…0.85 s and spray 0.20…0.55 s**, against a bar
that wants juice gone by ~130 ms. This is the same defect the r3 verdict listed
as its *second* priority ("the lifetime constant is roughly 4x too long"). It
turns out to be the first.

## 2. The harness beat labelled "+50 ms" is 17–25 ms of SIM time

This is the fact that invalidated my r3 predictions and it is worth propagating.

`score.js` emits `slowmo {scale: 0.34, seconds: 0.30}` on **every** slice.
`main.js` feeds its fixed-step accumulator `dt * ctx.timeScale`. So:

| beat label | sim seconds since the burst |
|---|---|
| `02-cut+33ms` | **0.017** |
| `03-cut+100ms` | **0.042** |
| `04-cut+250ms` | **0.092** |
| `05-cut+500ms` | **0.242** |
| `06-cut+1000ms` | **0.717** |
| `15-fast-flick+50ms` | **0.025** |
| `16-slow-cleave+50ms` | **0.017** |

Every `life`, every birth `del`, every drag constant in this file is a *sim*-time
quantity. r3 gave ligaments `del 0.008…0.060` — at the instant their elongation
was measured most of them **had not been born**, which is the whole explanation
for "0–6% elongated" against a predicted 25%. Three ⚠ RULE blocks now state this
at the top of `api.burst`.

## 3. A slow cleave's beads had never left the cut ring

`beadReach` was `R*(0.42 + … + 0.45*filmness)` = **1.22 units of asymptotic
travel** at drag k≈5.6. At 17 ms that is **0.045 units — two pixels**. The entire
juice-coloured population of a cleave was still sitting on the cut ring, fused
with the fruit into one component, and thrown away by the critic's bbox filter.
A cleave measured as *"has no droplets"* no matter how fat they were.

1 unit = 1 dm and a cleaver throws juice half a metre, so the heavy-case
asymptote is now ~5 units (ejection ≈ 15–35 units/s, i.e. 2–5x the blade speed —
physical). The fast case is untouched: `filmness` is 0 there by construction.

Then the counts had to come **down**, not up. 320 fat beads on a 62 px cut ring
percolate — overlapping discs connect above ~0.68 area fraction and a shell
concentrates them far above the mean — so they fuse into one component again.
Fewer, further, fatter.

## 4. What changed

| | r3 | r4 |
|---|---|---|
| **cling count** | `q.cling * amtK * bk` — **ungated** | `× (0.10 + 0.90*filmness)` |
| **cling tint class** | `cls(sz * 1.5)` | `cls(sz * 0.75)` |
| **cling size floor** | `(0.75 + 1.45*filmness)` | `(0.42 + 1.75*filmness)` |
| rim life | 0.30…0.85 s | `0.060 + 0.245*rng()*rng()` (median 0.12, tail 0.31) |
| spray life | 0.20…0.55 | 0.048…0.118 |
| mist life | 0.09…0.26 | 0.038…0.100 |
| cling life | 0.22…0.62 | 0.055…0.145 |
| strand life / birth | 0.10…0.26 / +8…60 ms | 0.045…0.120 / +1…14 ms |
| rim birth | +14…85 ms | +2…20 ms |
| `beadReach` | `R*(0.42+0.30f+0.45·film)·…` | `R*(0.40+0.30f+**4.40**·film)·…` |
| `mistReach` | `R*(0.55+0.80·fast)·…` | `R*(0.55+**1.70**·fast)·…` |
| spray drag | 3.2…8.0 | `5+7·film … 10+12·film` |
| rim drag | 1.4…3.2 | `4+7·film … 9+11·film` |
| spray count | `×(0.95−0.80·fast)` | `×(0.40−0.31·fast)` |
| rim count | `×(0.05+1.05·film)` | `×(0.05+0.88·film)` |
| crown (ejection half-angle) | 0.40 + 0.50·film | 0.40 + **0.78**·film |
| strand pool `q.strands` | 150 | 32 |
| motion stretch (rim/spray/mist) | 0.030 / 0.026 / 0.012 | 0.0165 / 0.0140 / 0.0075 |
| `maxStrands` pool | 1100 | 420 |

The motion-stretch constants had to fall because launch speeds rose 3–5x;
`medAspect` lands at 1.4, against plate-02's measured 1.50.

`crown` opening to 1.18 rad for the heavy case is what carries a cleave's beads
clear of the fruit's own silhouette — ejection along ±N just drives them into the
other half, which occludes them.

## 5. How this was verified — a forward rig, not arithmetic

`/home/claude/jz/` (outside the repo; `node_modules` symlinked to the project's):

* `rig.mjs` — imports the **real** `src/juice/fluid.js` (three resolved to
  `three/webgpu`, compute stubbed to throw so the analytic path runs), stubs
  scene/camera/renderer/bus, and replicates `main.js`'s tick loop **including the
  slow-mo accumulator**, then rasterises drops and strands with the actual vertex
  and fragment maths (sub-pixel floor, `grow^-1.8`, tumble, `cls`→tint mix,
  stretch), applies NeutralToneMapping at exposure 1.28 + sRGB + `gradeFn`, and
  runs the critic's probe on the result. Each particle is tagged with its class
  and originating burst, so alpha mass is attributable.
* `run.mjs` — drives the exact `tools/shoot.mjs` beat sheet.
* `probe.mjs` — the critic's connected-component probe.

**Calibration.** Run against the *unmodified* r3 file it produces, for
`15-fast-flick`: median **4** (critic: 4.0), sat **72%** (critic: 76–80%),
medAspect 1.4 (1.50); for `16-slow-cleave`: median **4** (critic: 3.0), sat 69%
(critic: 78–81%). Absolute particle-pixel counts run ~50% of the real render
because the rig has no compute turbulence, no sheet, no bloom and no DOF — all of
which spread mass — so treat px as a lower bound and medians/ratios as sound.

## 6. Measured result (rig, six RNG seeds)

| seed | FAST median | FAST sat≥0.45 | SLOW median | SLOW sat≥0.45 | SLOW aspect>2 |
|---|---|---|---|---|---|
| 20260806 (ship) | **2** | **1.9%** | **34** | **93.6%** | 29% |
| 11111 | 2 | 0.4% | 23 | 95.3% | 11% |
| 999331 | 2 | 1.1% | 64 | 95.3% | 24% |
| 4242424 | 2 | 0.4% | 27 | 91.0% | 15% |
| 7770001 | 3 | 0.8% | 35 | 95.5% | 43% |
| 31337 | 2 | 0.8% | 27 | 92.0% | 19% |

r3, same probe, same frames: fast 4.0 px / 79.9% vs slow 3.0 px / 80.6%.
r4 worst case: fast **3 px / 1.9%** vs slow **23 px / 91.0%** — 7.7x on size,
48x on tint, in the right direction on every seed. The fast flick's free
droplets are now median 2 px and **essentially achromatic**; plate-02's mist
measures 4.63 px scaled to our width and medSat 0.12–0.21, so 2–3 px at ~1% is
the right side of the reference, not an over-correction.

## 7. Envelope, and residue

Free particle pixels per beat (rig), r3 vs r4:

| beat | sim age | r3 (real render) | r4 (rig) | r4 alpha mass |
|---|---|---|---|---|
| `02-cut+33ms` | 17 ms | 260 | 1442 | **4824** |
| `03-cut+100ms` | 42 ms | 1080 | **5497** | 4920 |
| `04-cut+250ms` | 92 ms | 2703 | 3971 | 1107 |
| `05-cut+500ms` | 242 ms | **4328** | 36 | 10 |
| `06-cut+1000ms` | 717 ms | 207 | 0 | 0 |

The envelope is front-loaded: ink peaks at the cut, pixels peak at the +100 ms
beat (droplets have to separate from the fruit before the probe can count them —
at 17 ms they are physically on top of it), and it is at **0.7%** of peak by the
+500 ms beat instead of *at* peak. The tail is deliberately non-zero (a handful
of falling rim beads at +250/+500) because a frame that goes from full spray to
literal zero reads as an edit, not as physics.

**Residue in every beat of the sheet is now 0 free particle pixels.** The longest
life in the file is 0.317 s and the shortest gap between harness cuts is 0.43 s
of sim time (0.11 s between the flick and the cleave, where the surviving class
is 5 rim beads). ⚠ RULE 3 in the file states this constraint.

## 8. Budget

Strictly better than r3. No new draw calls, meshes, materials, shader programs,
attributes or uniforms; still 3 draws and one compute kernel with its
4-storage-buffer WebGL2 limit intact.

| per burst, tier 3 | r3 | r4 |
|---|---|---|
| fast flick (orange) | 1541 particles | **1446** |
| slow cleave (melon) | 527 | **305** |
| strand instances drawn every frame | 1100 | **420** (−1360 tris) |

`nMist` is unchanged — it is the one class that should grow with speed and it is
the cheapest per particle. Everything else fell. JS per burst is a strict subset
of r3's work, so p95 stays at or under 0.6 ms.

## 9. What I did not do, and the risk

* **The sheet is untouched.** Its life is already `(0.078+0.050·filmness)·…` =
  128–131 ms, which in *sim* time means it is at 13% of its life at the +33 ms
  beat, 33% at +100 ms, 72% at +250 ms and dead at +500 ms. The "backwards
  envelope" the r3 verdict measured was the droplets, not the film.
* **Risk: free-blob count in the slow frame.** The rig finds only 13–31 free
  components for the cleave (the rest are fused with the fruit and correctly
  excluded). The medians are stable across seeds but the sample is small. The
  real render should roughly double it (turbulence, and the halves separate so
  the occluder is not the solid disc the rig assumes). If the next verdict
  reports the slow frame as having *too few* droplets rather than the wrong kind,
  the lever is `nSpr`'s `(0.40 − 0.31*fast)` up to ~0.55 **together with**
  `beadReach`'s `4.40*filmness` up to ~5.5 — raising the count without raising
  the spread just re-percolates them, which is the trap r3 fell into.
* **Risk: the slow cleave's beads read slightly dart-like** in the rig, since
  every one carries the same radial motion smear. `medAspect` is 1.4 against
  plate-02's 1.50, so the number is right; if a critic calls it "sparks", cut
  `stretchK` (spray 0.0140 / rim 0.0165) rather than the launch speed.
