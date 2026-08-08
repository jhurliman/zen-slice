# r3 — integration

**Zero fixes required.** Four concurrent edits (`fluid.js`, `stage.js`,
`species.js`, `geometry.js`) merged without a single conflict, build error or
runtime error. Both shoot passes were clean on the first attempt (2 of the 3
allowed runs used).

## 1. Build

```
node build.mjs
dist/index.html  1129 KB  (three -> three/build/three.webgpu.js)
```

Clean, first try. No file was touched by the integrator.

## 2. Shoot — beat sheet

```
timeout 600 node tools/shoot.mjs --out shots/r3 --device desktop
done in 164.0s — 52 beats, 0 failed
```

| | r2b | **r3** | bar |
|---|---|---|---|
| backend | webgl2 | **webgl2** | — |
| errors | 0 | **0** | 0 |
| failedBeats | 0 | **0** | 0 |
| peakDrawCalls | 151 | **138** | ≤120 ✗ |
| peakTriangles | 208 816 | **219 245** | ≤250k ✓ |
| cpu median / p95 | 0.0 / 0.3 ms | **0.1 / 0.3 ms** | p95 ≤2.0 ✓ |
| cpu max | 5.0 ms | **14.3 ms** | see §5 |
| geometries | 43 | 34–40 | — |
| textures | 28 | **19** | — |

`programs: 0` is what the harness has always reported on the WebGL2 backend
(same in r2 and r2b) — it is not a regression and not a real program count.

Draw calls moved **151 → 138**, consistent with stage's claimed −7 from
replacing `DepthOfFieldNode` with the single-RTT `softDof`. Still 18 over the
bar; nobody owned draw calls this round.

Triangles +10.4k, consistent with fruit-geo's predicted +12–18k worst case.
12% headroom left against 250k.

## 3. Shoot — hero

```
timeout 900 node tools/shoot.mjs --out shots/r3 --device desktop --hero
done in 192.5s — 56 beats, 0 failed
```

0 errors, 0 failed. `/home/claude/juice/shots/r3/00-hero.png` written at
1280x720. Note this second pass **overwrote `report.json`** with its own,
lighter staging (112 draws / 179k tris / cpu max 2.7 ms / 44 live bodies) —
the 138/219k/14.3 ms figures above are the beat-sheet pass and are the ones
that count.

## 4. Frame verification

All 17 PNGs inspected — visually (7 read as images) and by luminance stats.
None black, none white, every one contains fruit.

```
file                    mean  black%  blown%  subject%
00-hero                 19.3   0.0     0.20    15.8
01-whole-watermelon      7.4   0.0     0.06     4.3
02-cut+33ms             19.8   0.0     0.55    13.3
04-cut+250ms            20.3   0.0     0.12    15.3
09-combo+50ms           33.1   0.0     0.60    27.4
13-load                 48.8   0.0     0.92    36.5
15-fast-flick+50ms      13.6   0.0     0.54     9.3
16-slow-cleave+50ms     15.4   0.0     0.25    10.8
```

`black% = 0.0` everywhere — stage's `blackFloor` wiring is live, no frame is
at literal RGB(0,0,0). `blown%` on the melon shot went **0.273 → 0.06**, which
is species.js's clip fix landing.

## 5. What a critic should look at first

Not defects I fixed — I stayed in scope — but things the merged build shows
that the individual reports could not.

1. **The fast/slow fluid split is real and visible.** This is the round's
   biggest win. `15-fast-flick+50ms.png` is a fine achromatic aerosol;
   `16-slow-cleave+50ms.png` is a pink translucent sheet with torn edges. Two
   frames from the same code that no longer look like each other. The 28/100
   juice diagnosis ("intent coded, none of it reached the pixels") is answered.

2. **Ligaments now read as solid objects, not liquid.** In `00-hero.png`,
   `03-cut+100ms.png`, `04-cut+250ms.png` and `09-combo+50ms.png` the strands
   render as several dozen fat, opaque, hard-edged pale-pink spindles with a
   specular pin — plastic rice grains / porcupine quills, not ligaments. Three
   knobs were raised together in `src/juice/fluid.js` (`q.strands` 44→150,
   radius 0.012–0.034 → 0.022–0.050, life 0.05–0.16 → 0.10–0.26 s), and the
   product is far past the visibility floor they were aiming for. Radius and
   count are the ones to walk back; the life extension is what made elongation
   measurable at all and should probably stay.

3. **Droplets read as opaque beads.** Dark-red spheres with one hard white pin
   highlight, and at hero resolution the size spread looks much flatter than
   the authored heavy tail. Adjacent to the auto-fail "an even droplet size
   distribution rather than a heavy tail toward tiny".

4. **fruit-geo's director.js request is confirmed and NOT applied.** Both
   `01-whole-watermelon.png` and `00-hero.png` show the melon's green stripes
   converging to a radial star near frame centre — the +Y pole is pointed down
   the lens, exactly the failure fruit-geo diagnosed at `src/play/director.js:79`
   (uniform random SO(3) spawn). The new prolate axis, the fatter stem and the
   ribs are largely spent on a view that cannot show them. It is a ~4-line
   change in a file none of the four builders owned, and it will perturb beat
   determinism, so I left it for the orchestrator. Highest-leverage single edit
   available for r4.

5. **DOF is confirmed working in the real build**, not just on stage's isolated
   rig. `07-citrus-cut.png`: the far kiwi is visibly soft while the near orange
   is sharp. `13-load.png`: the two background cut faces are heavily defocused
   discs. Watch that it is not now too strong on hero elements.

6. **Cut faces are near edge-on in `00-hero.png`.** The halves separate mostly
   by translation along the blade axis with little roll toward camera, so the
   cut face is a thin sliver and species.js's pith/rind/foam work is nearly
   unreadable in the one frame that matters most. R1b calls for rotation to
   dominate; this frame reads the other way. Owner is the half-separation code,
   not any of the four files edited this round.

7. **`cpu.max` 5.0 → 14.3 ms on the beat-sheet pass.** Median and p95 are
   unchanged and well inside budget, and the hero pass logged max 2.7 ms, so
   this is one isolated frame — most likely shader compile or GC. But "any
   hitch on the first slice" is an auto-fail on the bar, so it is worth one
   targeted look rather than dismissing it.

8. **Blade is no longer a blown-out ribbon.** It reads as a thin bright line
   with an edge highlight in every frame. R1b's blade note is satisfied.

## 6. Harness notes

`shot:13-load` (the complexity probe) took 51 s / 64 s. It passes and is the
deliberate stress beat, but it is a third of total wall time in both passes.
