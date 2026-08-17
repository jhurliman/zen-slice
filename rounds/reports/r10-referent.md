# r10 — referent. An EXTERNAL ground truth for "does this read as a real fruit".

**I touched no `src/` file.** One file changed: `tools/probes.py`, additively.
One artefact added: `rounds/reports/r10-referent-traces.png` (all four traces
drawn over `reference/plate-01.png`, uncertain arcs in red — look at it first).

## CANARY, BEFORE AND AFTER

```
$ python3 tools/probes.py clip shots/r5/05-cut+500ms.png
  before edit  probe_version 13  mask_px 9490  pct_R_ge_255 5.227
  after  edit  probe_version 14  mask_px 9490  pct_R_ge_255 5.227
```

`PROBE_VERSION` 13 -> 14 with the loud notice at the top of the file. **ADDED**
one probe (`referent`), one frozen data table (`REFERENT_POLYS`), five private
helpers used only by it (`_poly_area`, `_poly_fill`, `_poly_mask`, `_mask_sig`,
`_limb_vec`, `_referent_score`) and one appended SUITE row
(`referent:01-whole-watermelon.png`). **No existing probe's executable code
changed by one character**, and `referent` *calls* the frozen `_limb_stats`,
`_limb_runs`, `_hull_radii` and `_sig_dist` rather than reimplementing them.

Verified rather than asserted, the way v6–v13 did it: full `suite` captured on
`shots/r5`, `shots/r9`, `shots/r9-iphone` under v13 (from `git show
HEAD:tools/probes.py`), the edit made, the suite re-run and diffed key-by-key:

```
r5         v13 rows 21  v14 rows 22  NEW ['referent:01-whole-watermelon.png']  REMOVED []  CHANGED []
r9         v13 rows 21  v14 rows 22  NEW ['referent:01-whole-watermelon.png']  REMOVED []  CHANGED []
r9-iphone  v13 rows 21  v14 rows 22  NEW ['referent:01-whole-watermelon.png']  REMOVED []  CHANGED []
```

Guard-rails moved: **none.** I set no acceptance threshold on anyone; this round
delivers the ruler and its calibration, not a bar.

---

## THE ONE CLAIM I PROVED

> `referent` returns a number that a mathematical sphere cannot score well on:
> a rasterised circle scores **0.004–0.014** and a rasterised *real traced
> fruit* scores **0.708–0.972** through the identical code path at identical
> `mask_px`; our shipped fruit silhouettes sit at **0.30 landscape / 0.30
> portrait** on the sanctioned SUITE frame — about a third of the way from a
> featureless disc to a real fruit, with the same value in both orientations.

Both orientations, shipped frames, frozen suite, with `mask_px` on **both**
sides of every comparison:

| frame | win | mask_px (frame / referent) | `referent_gain` | `nearest` | circle control | ellipse-1.35 control |
|---|---|---|---|---|---|---|
| `shots/r10-referent/01-whole-watermelon.png` (SUITE row) | — | 12600 / 12654 | **0.300** | strawberry | 0.005 | 0.026 |
| `shots/r10-referent-iphone/01-whole-watermelon.png` (SUITE row) | — | 4366 / 4392 | **0.301** | strawberry | 0.008 | 0.131 |
| `shots/r10-referent/11-combo+550ms.png` apple | `378:175:490:275` | 6263 / 6308 | 0.330 | apple_half | 0.009 | 0.090 |
| `shots/r10-referent-iphone/11-combo+550ms.png` apple | `148:228:212:292` | 2204 / 2229 | 0.398 | **strawberry** | 0.014 | 0.295 |
| `shots/r10-referent/11-combo+550ms.png` kiwi | `510:255:632:360` | 7954 / 7999 | 0.285 | strawberry | 0.004 | 0.089 |
| `shots/r10-referent-iphone/11-combo+550ms.png` strawberry | `88:288:126:330` | 1000 / 1010 | **-0.322** | strawberry | 0.027 | 0.291 |

Shot with `node tools/shoot.mjs --out shots/r10-referent --scale 0.5 --deadline
420` and the same with `--device iphone`. (⚠ `--portrait` is **not** a flag
`tools/shoot.mjs` understands — it silently falls through to `desktop`. My first
portrait run produced a 640x360 desktop frame under the iphone directory name
and I threw it away. The flag is `--device iphone`. Anyone quoting a portrait
number should check `report.json`'s `viewport` says `430 x 932`.)
Both runs are inside budget: landscape 87 draws / 167 317 tris,
portrait 115 draws / 163 077 tris, `cpu` p95 0.2 / 0.4 ms. `node build.mjs`
clean. **The probe adds zero draw calls, zero triangles and zero programs — it
is offline python.**

### What the numbers say, beyond "it works"

1. **`identity` was saturated; this is not.** The r8 orange scored
   `identity_recall` 1.000 while being a convex sphere in all 32 poses. Our best
   shipped silhouette scores `referent_gain` 0.330 against a real apple's 0.869.
   There is 0.5 of headroom and it is measured against a photograph, not against
   our own other five bodies.
2. **Our kiwi is further from a real kiwi half than a disc is.**
   `kiwiL` per-referent `gain` for `kiwi_half` is **-0.595** (and `-0.548` for
   `citrus_half`), i.e. the silhouette we ship is *worse than a featureless
   circle* at matching the real thing. Its best match is the strawberry at 0.285.
3. **Portrait is a different instrument reading, and it is the unflattering
   one.** The portrait apple's headline (0.398) is only 0.10 above its own
   ellipse control (0.295), and its `nearest` is the **strawberry**, not the
   apple — its `limb` vector at 61x52 px is `protr_n` 14 at a median width of
   2.81 deg, i.e. per-pixel raggedness, not shape. The portrait strawberry at
   1000 px is **negative**. Rule 3 in one line: the same body scores 0.330 as an
   apple at 6263 px and -0.24 against the apple polygon at 2204 px.
4. **This is the equatorial story the r9 geometry critic asked for, in a
   number.** The apple polygon's own stem spur only reaches `+10.5%` of mean
   radius from the traced centroid; nearly all of a real apple's `sig_dist`
   budget is in the *body*, not the pole.

---

## THE GROUND TRUTH: four hand-traced polygons, frozen in `probes.py`

Frozen as literal native-pixel coordinates of `reference/plate-01.png`
(1672 x 941) in `REFERENT_POLYS`. Each entry carries `source`, `crop`, `poly`,
`note` (why the vertices are where they are) and `uncertain` (index ranges I
could not read off the pixels). Draw them yourself:
`rounds/reports/r10-referent-traces.png`.

**Method, identically for all four.** Crop at 3x–13x with a labelled
native-pixel grid overlay; place vertices by eye on the unaided RGB view; where
a boundary was steep or ambiguous, confirm the position against a printed
scanline of the actual channel values; then render the polygon back over the
plate and correct until it hugged. Every polygon went through at least one
correction pass and two of them moved materially — the strawberry's whole
upper-left arc came inward 7–10 px on pass two, the kiwi's lower-left arc went
outward. Channel scanlines were a measuring aid **for my eye**; the probe's mask
on a delivered frame is `subject_mask` + `largest_component`, purely geometric,
unchanged.

**I did not repeat the r9 negative result.** The v12 block already records that
auto-segmentation of this plate fails (a k=3 opening that breaks the juice
bridges eats the apple stem; the strawberry masks as a fruit-shaped *hole*). I
confirmed it in passing — a 72-ray cast from the apple's centroid at luma floor
20 escapes to the crop border on 34 of 72 rays — and then traced by hand.

### 1. `apple_half` — 115 vertices, crop (835,105)–(1140,370)

The nameable events, and where each vertex came from:

* **The stalk** — a 30 px spur only 4–13 px wide. From column dumps at
  x = 976…991: the knob's apex is (984,116); its right lobe reaches x = 991 at
  y = 124 and is *gone* by x = 992; the stalk's left edge descends
  (976,122) → (970,138) → (966,149).
* **The calyx well, and it is two-sided.** The shoulder floor is y = 151 *left*
  of the stalk (columns x = 962…966 first exceed luma 35 at y = 151) and
  y = 136–138 *right* of it (x = 986…994 first exceed at 138,137,136). Between
  the stalk's right edge and the right shoulder there is a genuinely dark 9 px
  gap at x 984–992, y 128–137 — vertex `(986,136)` is the floor of that notch
  and it is the single most load-bearing vertex in the table.
* **The shoulder** from a 5-consecutive-rows luma>35 column scan
  (x = 880 → y 159, 900 → 145, 915 → 141, 1010 → 134, 1050 → 144, 1080 → 170),
  with three hand overrides I am declaring: **x = 920 and 925** (the scan
  returns 125; a droplet sits above the boundary — I used 141), **x = 1060**
  (scan 125, a bright fleck — I used 151), and **x = 1085…1095** (scan 168/166/164;
  a flying beige chunk overlaps the limb at (1086–1097, 163–178) — I took the
  right edge from an x(y) read instead).
* **The left flank** from a green-chroma `G - (R+B)/2` row scan: y = 190 → 858,
  200 → 856, 210 → 849, 220 → 847, 240 → 845, 250 → 849, 260 → 848, 275 → 852.

### 2. `strawberry` — 79 vertices, crop (1285,420)–(1500,630)

Four sepal spikes plus one slender stalk, all separated by real dark gaps:
sepal A tip **(1411,433)**; the narrow pale-tipped stalk **(1418,428)**; sepal B
tip **(1456,433)** with the deepest inter-sepal notch between them at
**(1429,463)**; sepal C pointing right to **(1470,487)**; sepal D pointing
right-down to **(1487,521)**. The body's left and lower-left arcs came from an
R-minus-G plateau scan (first x where R−G > 80 for four consecutive px:
y = 458 → 1371, 494 → 1333, 530 → 1319, 566 → 1309, 578 → 1302, 602 → 1310),
then moved 2 px outward for the desaturated rim. That scan is why the first
draft of this polygon was 7–10 px too far left and this one is not.

### 3. `citrus_half` — 57 vertices, crop (140,705)–(345,915)

**The referent that proves a citrus half is not a disc.** A rounded triangle
with a sharp stylar apex at **(256,722)** and two near-straight flanks:
left x = 250 → y 724, 225 → 734, 200 → 746, 175 → 768; right x = 275 → 734,
300 → 751. Bottom vertices from column dumps, and this is worth recording — the
peel there is in deep shadow at luma 28–40 against a background of 1–3, so a
naive floor of 45 puts the bottom at y = 880 when it is at **y = 904**.

### 4. `kiwi_half` — 49 vertices, crop (1170,600)–(1410,835)

**Included deliberately as the near-convex real control**, and it is the honest
half of this table: a kiwi half face-on really is nearly a circle (bbox 201x202,
boundary RMS 0.055 against a rasterised circle's 0.004). It is evidence the
probe is not simply rewarding spikiness. It cannot be used to *earn* a high gain
(its denominator is small) and it cannot be *gamed* either, because a circle
still scores exactly 0 against it by construction.

### VERTICES AND ARCS I WAS NOT SURE OF — read this before citing me

I am authoring ground truth that will be used to score work. Every one of these
is written into `probes.py` as well, next to the polygon, so it cannot be lost.

| referent | arc | why | how I handled it |
|---|---|---|---|
| `apple_half` | verts 67–76, lower-left, x 853…960 / y 277…352 | a juice sheet is continuous with the fruit; no threshold separates them (the exact r9 failure) | smooth arc between the confident (856,277) and (963,354) |
| `apple_half` | left flank y 196…234 | a green flap or leaf lies on the cut face at (845–875, 205–235) and **its left boundary coincides with the body's** | included in the trace. If it is a separate leaf the true limb is ~2 px further right, which would *lower* this referent |
| `strawberry` | verts 50–57, bottom, x 1300…1390 / y 606…616 | berry in shadow sitting in red splash of the same chroma; R−max(G,B) runs 30…50 straight through the boundary at x = 1350 and 1370 with no break | placed by eye on the dark-red/splash contrast, **±4 px** |
| `strawberry` | sepal D tip | a bright droplet overlaps its end | tip set at the last unambiguous green (1487,521), which **shortens** the spike |
| `strawberry` | a fifth green structure at (1470–1483, 465–475) | may be another sepal, unresolvable | **excluded** |
| `citrus_half` | verts 9–13, right flank y 768…804 | red juice crosses the peel and merges with it | straight run at x 312–314 between confident ends |
| `kiwi_half` | verts 19–33, lower-left, x 1184…1345 / y 742…820 | brown peel reads luma 15–35, shadowed juice reads 20–30; a column scan finds an edge at x 1305…1335 and **nothing** at x 1230…1275 | by eye, **±8 px**. This is the least certain of the four and **the one I would attack first** |

Every uncertain arc is a **smooth interpolation between the confident ends —
no relief was invented there.** That is the direction that *lowers* the target
and therefore *flatters* a render. If the auditor finds real relief hiding in
one of those arcs, the referent gets harder, not easier, and every number above
moves against us.

### Two references I EXCLUDED, with the measurement

* **`plate-02-highspeed-citrus.jpeg`.** It is a video still. Across the lower
  half's left silhouette the 10–90 background-to-fruit transition is **8–12 px**
  (y = 640: 220→228; y = 680: 225→237) against `plate-01`'s **1–3 px** on the
  same statistic (lemon left edge at y = 800 is a 1–2 px step). On a ~300 px
  subject that is ±4 px of boundary uncertainty — *the same size as the entire
  relief this probe measures*. The right and upper arcs of both halves are
  inside the aerosol cloud. And what is left is near-elliptical, so it would
  supply a referent a smooth ellipsoid matches, which is the exact failure this
  instrument exists to prevent. Excluded on those grounds, not on convenience.
* **The pineapple**, for a harder reason: its crown leaves are **clipped by the
  plate's top border** at y = 0 over x ≈ 180–330 and reach x < 40 on the left.
  No closed outline of it exists in the image. This is a pity — the crown is the
  best appendage in either plate.
* The **watermelon** is entangled with the blade streak and its own far half at
  every angle; the **top-right orange** is cut by the streak; the **bottom
  orange** runs off the frame.

---

## THE PROBE

```
python3 tools/probes.py referent <png> [win=x0:y0:x1:y1] [floor=8] [rays=128] [thr=0.02] [only=a,b]
```

* **Frame side.** `subject_mask` (luma > floor, a property of the frame) inside
  an explicit window, then `largest_component`, then the outermost-pixel radial
  profile from that mask's own centroid — the identical construction `outline`
  uses. Geometric and colour-blind. `mask_px`, `bbox` and `bins_empty` reported.
* **Referent side.** Each frozen polygon is rasterised (even-odd scanline fill)
  at a scale solved so its **filled area equals the frame's `mask_px` to within
  1%**, then traced by the *same* `_mask_sig`. **This is Rule 2 satisfied by
  construction rather than by assertion**: both sides print `mask_px` and they
  agree to <1%. A consequence, and it is the correct one — when the render's
  fruit is small the real fruit's stem and sepals fall below one pixel on the
  referent too, so the bar drops to what is actually resolvable at that raster.
* **The score.** Two gains, both from frozen statistics, both ≤ 1, **both
  exactly 0 for a circle**:
  * `limb_gain_j = 1 − ‖f_frame − f_j‖₁ / ‖f_j‖₁`, where `f` is the seven-vector
    of `_limb_stats` outputs (hull_concave_frac/depth, concave_frac/depth,
    protr_n, median protr width_deg, median protr height_pct), each over a fixed
    stated scale. A circle has `f = 0` in every component, so numerator equals
    denominator and `limb_gain` is 0 **for every referent and for every choice of
    those scales** — the anti-sphere property is weight-independent.
  * `sig_gain_j = 1 − _sig_dist(frame, ref) / _sig_dist(ones, ref)`. `_sig_dist`
    is the frozen flip-invariant, circular-shift-minimised RMS on mean-normalised
    signatures, so this is scale- *and* rotation-normalised by the same code
    `species` uses. The denominator is that call with a **featureless disc**,
    which is algebraically the referent's own boundary RMS.
  * `referent_gain = max_j min(limb_gain_j, sig_gain_j)`, `nearest` = argmax.
    **Max-of-min, and both halves of that matter** — see the calibration below.
* **The null hypothesis is printed with every run.** `controls` re-runs the
  whole pipeline at the frame's own `mask_px` on a rasterised circle and a
  rasterised 1.35 ellipse. Nobody has to take "a circle scores 0" on trust, and
  the *rasterisation floor at that pixel size* is visible: an ideal circle has
  `f = 0` exactly, a rasterised one carries quantisation of 4.5% of mean radius
  at 2000 px, 1.16% at 8000 px and 0.38% at 30000 px.

## CALIBRATION — validated on synthetic controls before I trusted it

Every row below is a filled shape written to a PNG and run through
`python3 tools/probes.py referent`, i.e. the identical code path as a game
frame, at three matched `mask_px`.

| shape | mask 2000 | mask 8000 | mask 30000 |
|---|---|---|---|
| circle | **0.011** citrus | **0.010** apple | **0.004** kiwi |
| ellipse 1.10 | 0.216 citrus | 0.096 citrus | 0.034 citrus |
| ellipse 1.35 | 0.305 straw | 0.108 straw | 0.021 straw |
| ellipse 1.80 | −0.089 straw | −0.054 straw | −0.032 straw |
| lumpy blob (k=7,9,13 @ 4–6%) | −0.037 straw | −0.021 straw | −0.019 straw |
| **REAL `apple_half`** | **0.793** apple | **0.869** apple | **0.938** apple |
| **REAL `strawberry`** | **0.884** straw | **0.932** straw | **0.972** straw |
| **REAL `citrus_half`** | **0.742** citrus | **0.836** citrus | **0.881** citrus |
| **REAL `kiwi_half`** | **0.755** kiwi | **0.838** kiwi | **0.708** kiwi |

A circle, an ellipse and the real traced apple are separated by 0.01 / 0.11 /
0.87 at 8000 px, `nearest` identifies the right fruit every time, and everything
synthetic stays ≤ 0.31 while everything real stays ≥ 0.71.

**Rotation and mirror invariance** (mask 8000, polygon transformed before
rasterising, so this includes resampling loss):

| | as traced | rot 37° | rot 137° | mirrored |
|---|---|---|---|---|
| apple | 0.869 | 0.874 | 0.852 | 0.890 |
| strawberry | 0.932 | 0.909 | 0.826 | 0.943 |

**⚠ THE GAMING CONTROL, AND IT IS THE REASON THE HEADLINE IS A `min`.** I tried
to break my own probe by decorating a circle:

| shape (mask 8000) | `limb_gain` | `sig_gain` | `referent_gain` |
|---|---|---|---|
| circle + k=40 ripple, a=0.03 | 0.235 | 0.002 | **0.002** |
| circle + k=40 ripple, a=0.08 | 0.200 | −0.036 | **−0.036** |
| circle + 3% white radial noise | 0.279 | 0.008 | **0.008** |
| circle + 8% white radial noise | 0.287 | 0.071 | **0.071** |
| circle + one 25% spike | 0.266 | 0.089 | **0.089** |
| circle + five 25% spikes | 0.235 | −0.027 | **−0.027** |

`limb_gain` **alone is gameable**: it is a bag of rotation-invariant summary
statistics, so pixel-scale raggedness buys 0.20–0.40 of it for free. `sig_gain`
is not, because it compares the signature itself at the flip- and
shift-optimal alignment. **Never quote `limb_gain` as the score.** The probe
prints all three and the headline is the `min`.

## ⚠ WHAT THIS PROBE CANNOT DO — said here so nobody overclaims it

1. It scores an **outline**. Nothing about shading, colour or the cut face. A
   silhouette that reproduces the apple's stem spur and shoulder notch scores
   well even if the fruit is grey.
2. It is **blind to species**: a strawberry render that earns its gain against
   the `apple_half` polygon has reproduced *apple* relief. `nearest` says so out
   loud — **quote `nearest` with every number.**
3. It needs a `win` that isolates **one body**. On `08-citrus-caps` the largest
   component is juice-bridged across the whole frame — `bbox` comes back
   `[640, 91]` landscape and `[215, 110]` portrait and the gain is −11.2 / −6.2,
   which is nonsense and *visibly* nonsense from the reported bbox. That bbox is
   in the output for exactly this reason. Do not cite a `referent` number
   without its `bbox` and `mask_px`.
4. Its discriminating power **falls with `mask_px`**: the ellipse control is
   0.026 at 12600 px, 0.090 at 6263 px and 0.295 at 2204 px. A small-fruit
   portrait number close to 0.3 may be indistinguishable from an ellipsoid. The
   controls are printed on every run so this is checkable per frame, never
   assumed.
5. Four referents is a small set and three of them come from one photograph.
   The cross-source referent I wanted does not exist in the material we have
   (see the plate-02 exclusion). If someone supplies a second sharp,
   black-background plate, adding polygons is the cheapest possible improvement
   to this instrument.

## REQUESTS FOR OTHER OWNERS (I made none of these changes)

* **`tools/shoot.mjs` (whoever owns the harness):** `--portrait` is accepted by
  the arg parser and silently ignored — it is not in `DEVICES`, so the run falls
  back to `desktop` and writes 640x360 frames into a directory named `-iphone`.
  Either alias `--portrait` to `--device iphone` or make an unknown device a
  hard error. The round brief itself tells agents to pass `--portrait`.
* **`src/fruit/geometry.js` (fruit-geo):** the two actionable readings above —
  the shipped **kiwi** silhouette scores `gain` **−0.595** against the real
  traced kiwi half, i.e. worse than a disc; and the shipped **apple** at
  portrait scale matches the real *strawberry* better than the real apple
  (`nearest` = strawberry, apple_half −0.239) because its `protr_n` 14 at a
  2.81° median width is per-pixel raggedness, not shape. Both are one command:
  `python3 tools/probes.py referent shots/<dir>/11-combo+550ms.png win=…`.
* **Nobody needs to change anything for this probe to run.** It is offline,
  costs no draw call, no triangle and no program.

## FILES

* `tools/probes.py` — v13 → v14, additive (**not committed**; the integrator
  should serialise it with the other probe edits this round).
* `rounds/reports/r10-referent-traces.png` — the four traces over plate-01.
* `shots/r10-referent/`, `shots/r10-referent-iphone/` — the frames the numbers
  above come from.
