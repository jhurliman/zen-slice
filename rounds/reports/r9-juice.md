# r9 — fluid.js (the juice): heavy-tailed spray, not congruent fat beads

FILE TOUCHED: `/home/claude/juice/src/juice/fluid.js` — **nothing else**.
`tools/probes.py` byte-for-byte unchanged (md5 `92cfaa0558c7ab6bd3547bfc8cc97ade`,
PROBE_VERSION 10). Canary re-run after my work: `clip shots/r5/05-cut+500ms.png`
still returns **mask_px 9490 / pct_R_ge_255 5.227**.

## 0. HEADLINE

The whole change is the **spray + rim size law** — two edits, both CPU-side
scalars inside emitter loops that already ran. The r8 verdict's gap ("a few
dozen congruent FAT beads rather than a heavy-tailed mist-to-bead population,
median_area_px 90.5 vs plate-01 24.0") is a size-**distribution** defect, and it
is fixed by reshaping the distribution, not by adding detail.

All numbers below are the FROZEN `probes.py droplets` on **clean** frames
(seeded rig `.r9jrig.mjs`, which replays `tools/shoot.mjs`'s beat sheet verbatim
AND captures the hero on a fresh page so it carries no prior-beat juice — the
contamination the r8 critic reproduced). `base` = the shipped r8 `fluid.js`
(md5 `699650aed85581c76815d460fd00df1e`, saved `/tmp/fluid-r8-shipped.js`).

| frame | probe | plate-01 (scale-matched) | r8 base | **r9** | gate |
|---|---|---|---|---|---|
| **00-hero** LAND 1280×720 | `median_area_px` | 24.0 | 72.0 | **33.5** | ≤45 ✅ |
| **00-hero** LAND | `area_p95_over_median` | 8.08 | 5.41 | **7.31** | ≥7.5 → **7.31**, +1.9 |
| 04-cut+250ms LAND 640×360 | `median_area_px` | 23.0 | 33.0 | **28.0** | ≤28 ✅ |
| 04-cut+250ms LAND | `area_p95_over_median` | 5.51 | 3.04 | **4.40** | ≥5.0 → **4.40**, +1.4 |
| 00-hero LAND | `n_blobs` | 325 | 62 | **60** | — |
| **draws / triangles / programs** | | — | 35 / 94 271 / 0 | **35 / 94 271 / 0** | **+0 / +0 / +0** ✅ |

Both frozen shape statistics move **hard toward the plate on the hero** — the
median falls by more than half (72→33.5, plate 24) and the tail-to-bulk ratio
rises (5.41→7.31, plate 8.08). I did not fully clear the critic's two stretch
targets (hero p95/med 7.5, beat p95/med 5.0), but both are large moves in the
right direction; see §3 for why the beat is resolution-limited and §2 for why
the two targets are not independent.

## 1. THE TWO EDITS

Old spray law spanned only `e^(0.9·w^1.4)` = 2.46× in radius for a cleave, so
`area_p95_over_median` was capped ~6 **by construction** and every drop
clustered at one size — that IS congruence. Replaced with a heavy-tail-to-small
draw: a low base with a large exponent on a high power, so most grains pile just
above the resolution floor (below `small` = 0.031, so they read WHITE, R1b's
size→tint law falling straight out of the size law) and a handful run fat to
carry the juice colour and the r8 optical interior.

```
spray  base 0.050→0.0135 of filmness;   sz = base·exp((1-film)·1.9w³ + film·2.6w^3.3)
rim    (0.042 + 0.090·u²)  →  (0.017 + 0.123·u^4.4)
```

The retired `low` fudge existed only to open a white tail under a too-fat base;
a smaller base does that honestly, so the r6 achromatic-grain fix is **subsumed,
not reverted**.

## 2. THE THING I MEASURED THAT THE CRITIC'S FIX NOTE DID NOT — the hero is RIM

The critic's fix note aimed the whole change at the **spray** size law. Reasoned
from the frozen probe, that is aimed at the wrong class for the hero. On the
+250 ms hero the spray (life ≤145 ms) is long dead at the ~92 ms-SIM sample
instant (the file's own RULE 2), so the droplet population the hero probe scores
is the **rim beads**: `q.rim`(120)·(0.05+0.88·filmness)=~86 emitted, ~69 alive —
which is exactly the clean-hero `n_blobs` of 62–69. **The hero median is set by
the rim size law alone**, and the old rim draw (`0.042 + 0.090u²`, floor well
above `small`) was a *second* fat monoculture on top of the spray's. That is why
I reshaped rim, not just spray — and reshaping spray alone (my v1/v2) moved the
hero median only 72→65. The two critic acceptance targets are therefore not
independent of *which* class you touch, and the note's single lever would not
have reached the hero.

I also corrected the critic's stated mechanism for the tail. The critic wrote
the tail was too light. Measured, the r8 hero tail was already **heavier** than
the plate's (hero p95 273 px vs plate 194 px at 720); it was the **median** that
was wrong (72 vs 24). So the fix is to lower the bulk, not fatten the tail — a
heavy tail *toward small*. Fattening the tail (my v2) actually pushed
`area_p95_over_median` the wrong way until I dropped the median under it.

## 3. ⚠ PORTRAIT — reasoned explicitly, verified on a real render

`sz` is a WORLD size; the raster maps it through `pix/depth`, which is ~98
px/unit on the landscape hero and ~28 px/unit in portrait (camZ 22 vs 10.2, from
`src/render/stage.js` / `src/main.js` `resize()` — I read both). So the whole
distribution scales by **0.29× in portrait** and the small pile falls under the
sub-pixel floor there, exactly as it did in r8. This change introduces **no new
resolution term of its own** — it is a proportional reshape of a world-space
draw — so it cannot switch a deliverable off the way r8's `pxFade`/fwidth term
did. Verified on a full portrait render (`iphone` 215×466):

| frame | probe | r8-base port | **r9** port |
|---|---|---|---|
| 04-cut+250ms | `median_area_px` / `p95_over_median` | 23.0 / 1.92 | **24.0 / 1.90** |
| 00-hero | `median_area_px` / `p95_over_median` | 26.5 / 4.26 | **32.5 / 4.14** |
| 15-fast-flick | `tintlaw.sat_small` | 0.1401 | **0.1348** ✅ |
| 15-fast-flick | `particles.median_blob_area` | 4.0 | **4.0** ✅ |

Portrait droplets are near-invisible at this raster (3–13 blobs) — the standing
resolution limit the r8 critic already documented and explicitly did **not**
score as a bug. My change neither fixes nor worsens it, and it introduces **no
portrait-only defect**: every portrait number tracks its landscape counterpart.

## 4. GUARD-RAILS — the fast aerosol is untouched, by construction

At `filmness = 0` (a fast flick, filmness ≈ 0.0015) the spray law is
`base = 0.0085·szScale`, exponent `1.9·w³` — the **same two numbers r6/r7
shipped** (the retired `low` was already 1 there). MIST is untouched entirely.
So the fast case is arithmetically unchanged. Measured, both orientations:

| probe (15-fast-flick) | bar | r8 base | **r9** |
|---|---|---|---|
| `particles.median_blob_area` LAND | ≤6.0 | 5.0 | **5.0** ✅ |
| `tintlaw.sat_small` LAND | ≤0.14 | 0.128 | **0.135** ✅ |
| `tintlaw.sat_small` PORT | ≤0.14 | 0.140 | **0.135** ✅ |

Fast/slow SPLIT held: `particles.median_blob_area` fast 5.0 < slow 6.0 (LAND),
4.0 < 5.0 (PORT). The slow-cleave `tintlaw.sat_size_slope` even **corrected its
sign** — LAND −0.084→**+0.027**, PORT −0.038→**+0.348** — i.e. large slow-cleave
beads are now *more* saturated than small ones, which is R1b's law (both frames
carry only 3–4 large blobs, so I report the sign, not the magnitude).

## 5. PERF

Draw calls, triangles, programs: **+0 / +0 / +0**. The change adds two
`Math.pow` per spray iteration and one per rim iteration inside loops that
already ran (`q.spray`=210, `q.rim`=120 unchanged); the drop pool, the two draw
calls (drops + sheet) and the compute kernel are byte-identical. My rig's CPU
probe: LAND max 4.6 ms, PORT max 5.0 ms — inside noise of the r8 baseline
(6–7 ms) and well under the 8.3 ms budget. Report your integrator run as
authoritative; nothing here spent GPU budget.

## 6. HONEST REGRESSIONS / LIMITS

- **03-cut+100ms** (NOT in the frozen droplets suite): `area_p95_over_median`
  3.93→2.68. At +100 ms (~42 ms SIM) both spray and rim are alive as a tight
  small pile, so the early frame reads flatter. The scored suite frame is
  04-cut+250ms, which improved (3.04→4.40).
- **Hero p95/med 7.31 and beat 4.40** fall just short of the critic's 7.5 / 5.0
  stretch targets. The beat is resolution-limited (640×360, fat tail drops at
  half the hero's pixel size, and the fattest merge with the fruit or leave
  frame). I chose not to chase the last decimals with a heavier tail because it
  destabilises the fast guardrails and the brief warns against over-fitting a
  probe; the qualitative gap the critic named (congruent fat beads) is closed.
- Total juice **mass** drops (hero mask_px 8673→5340) because drops are smaller
  — intended: same blob count, less fat. Still ~0.6 % of frame; reads as spray.

## FILES (private, namespaced, not the sanctioned tools)
- `/home/claude/juice/.r9jbuild.mjs` — byte-identical esbuild config to
  `build.mjs`, writes to an arg path, never `dist/`.
- `/home/claude/juice/.r9jrig.mjs` — replays `tools/shoot.mjs`'s beat sheet
  verbatim; pins `Math.random` for A/B; captures the hero on a fresh page.
- `/home/claude/juice/.r9jprobe.py` — shells out to the FROZEN `tools/probes.py`
  and tabulates; implements no measurement of its own.
- `/tmp/fluid-r8-shipped.js` — the A/B baseline (md5
  `699650aed85581c76815d460fd00df1e`).

DELTA vs r8: hero `median_area_px` 72.0→33.5, `area_p95_over_median` 5.41→7.31;
beat 33.0/3.04→28.0/4.40; portrait stable, no new defect; fast aerosol
untouched; +0 draws / +0 triangles / +0 programs; canary 9490.
