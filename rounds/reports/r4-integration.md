# r4 — integration

`node build.mjs` succeeded first try. `tools/shoot.mjs --device desktop` ran
**once**, clean. Hero pass ran once, clean. **No source files were edited by me.**

## Build / run

| | |
|---|---|
| build | OK, `dist/index.html` 1132 KB |
| backend | **webgl2** |
| beats | 52 (56 with hero), **0 failed** |
| console errors | **none** |
| timedOut | false |
| shoot runs used | 1 of 3 (+1 hero) |

Slowest beats: `shot:13-load` 51 s, `goto` 12 s, `shot:07-citrus-cut` 11 s.
`13-load` is the complexity probe and has been the slowest beat every round; it
is harness stress, not frame time.

## Perf

| | r3 | **r4** | budget |
|---|---|---|---|
| peak draw calls | 112 | **125** | 120 ⚠ |
| peak draw calls (hero 1280×720) | — | **139** | 120 ⚠ |
| peak triangles | 179 337 | **211 376** | 250 000 OK |
| peak triangles (hero) | — | 231 150 | 250 000 OK |
| JS p95 | 0.6 ms | **0.4 ms** (0.6 ms on the hero run) | 8.3 ms OK |
| JS max | 2.7 ms | 5.6 ms (3.8 ms hero) | — |
| geometries | 34 | 43 | — |
| textures | 19 | 23 | — |
| liveBodies at peak | 44 | **50** | — |

**The draw-call overrun is mostly not a per-object regression.** The complexity
probe held 6 more bodies at peak this round (44 → 50). Per body: 2.55 → **2.50**
draws, 4076 → 4228 tris (+3.7 %, matching fruit-geo's stated +404…+498 tris per
species). Fixed overhead grew by the +1 draw the stage author reports for the DOF
pyramid, plus 4 textures. Still, the absolute number is **5 over the 120 bar at
render scale and 19 over on the hero**, and it is the first time this project has
crossed it. Someone needs to own it next round; nothing else in the budget is
tight.

## Frames

All 17 PNGs contain fruit; none is black, none is white. Frame-level blown
fraction is now genuinely reference-like:

| frame | meanLum | p99 | lum>250 |
|---|---|---|---|
| 00-hero | 15.84 | 211.9 | **0.117 %** |
| 05-cut+500ms | 8.05 | 136.0 | 0.007 % |
| 08-citrus-caps | 8.73 | 144.0 | 0.004 % |
| 16-slow-cleave | 19.28 | 237.6 | 0.451 % |
| plate-01 (reference) | — | — | 0.115 % |

Void corner luminance **2.98**, an order of magnitude under the bar's `#0a0a12`
ceiling. The void dither landed.

---

# THE EXPOSURE CHECK — this is the part that matters

## Headline numbers

| | r3 (critic) | r3 (my probe, same code) | **r4** | target |
|---|---|---|---|---|
| **watermelon cut face, R ≥ 255** | 49.7 % | 17.2 % | **15.0 %** | < 5 % |
| **orange near half, R ≥ 255** | 54.0 % | 48.3 % | **19.1 %** | < 5 % |

**Both are still above the 5 % target, and the orange is above the ~15 % "say so
loudly" line. The watermelon is exactly on it.** The exposure contract improved
things — the orange fell 2.5×, the frame-level blowout fell 4× and now matches
plate-01 — but **it did not hold to target.** species.js predicted 4.1 % and
2.8 %; reality is 3.7× and 6.8× those.

Probe: the r3 critic's stated recipe verbatim. Watermelon — red-dominant mask
(`r>50, r>1.3g, r>1.25b`), open 3×3, close 7×7, fill holes, largest component,
inner-0.55 ellipse of the second-moment fit. Orange — largest `lum>45` component
in box (170–300, 225–340) of `08-citrus-caps.png`. Applied identically to
`shots/r3/` and `shots/r4/`.

**Caveat on the r3 baseline.** I cannot reproduce the critic's absolute 49.7 %;
the same recipe on `shots/r3/05-cut+500ms.png` gives me 17.2 %. The stage author
hit the same wall (they measured 37.0 % where the critic reported 49.7 %), so the
critic's crop was tighter than their prose describes. The orange reproduces well
(48.3 % vs their 54.0 %), so **54.0 % → 19.1 % is a real, trustworthy delta**.
The watermelon delta is not trustworthy in the absolute; use the same-probe pair
17.2 % → 15.0 %, or the droplet-suppressed variant below.

## Mask sensitivity (watermelon)

The literal recipe's 3×3 opening does not remove r3's red droplet cloud, which
fuses into the mask (r3 n = 6861 against the critic's stated n = 2613). With a
7×7 opening the r3 count lands at n = 2725, matching the critic:

| watermelon mask | r3 | r4 |
|---|---|---|
| critic recipe, inner-0.55 | 17.2 % | **15.0 %** |
| critic recipe, full face | 12.5 % | 15.5 % |
| 7×7 opening (droplet-free), inner-0.55 | 19.1 % | **8.2 %** |
| 7×7 opening, full face | 16.9 % | 10.0 % |

Orange, for comparison: `lum>45` component 19.1 %, `lum>80` component 24.3 %.
Stable across thresholds, so 19 % is not a masking artefact.

## Diagnosis — and both builders' explanation of the residual is WRONG

stage.js says "the residual 11 % is almost entirely the foam pips". species.js
says "the residual 4.1 % is entirely wet-film specular pips". **Neither is true.**
Connected-component analysis of the clipped pixels:

| | clipped px | components | median comp | largest comp | share of clipped area in comps > 50 px | fully white (G,B ≥ 250) |
|---|---|---|---|---|---|---|
| watermelon face | 1024 | 64 | 2 px | **810 px** | **79.1 %** | 0.3 % |
| orange half | 1173 | 78 | 2 px | **673 px** | **72.9 %** | 0.0 % |

Three-quarters of the clipped area is in **one large contiguous chromatic blob**
per fruit, mean (255, 148, 124) and (255, 188, 118). A specular pip field would
be hundreds of 1–3 px components pushing toward white. This is a broad surface
region, not sparkle. Clipping also rises monotonically with radius on both fruits
(watermelon 11.9 % at r<0.3R → 26.0 % at the rim; orange 15.9 % → 30.2 %), i.e.
it lives on the **key-facing shoulder**, which is exposure case B.

The two fruits fail for **different** reasons:

### Watermelon — mostly a transient overlay, not albedo

Same probe across the cut timeline:

| beat | R ≥ 255 |
|---|---|
| 02-cut+33ms | 30.2 % |
| 03-cut+100ms | 23.0 % |
| 04-cut+250ms | 24.8 % |
| 05-cut+500ms | 15.5 % |
| **06-cut+1000ms** (juice gone, blade past) | **6.4 %** |

The flesh albedo is close to spec — 6.4 % once nothing is laid over it, against
species.js's 4.1 % prediction. The other ~9 points in the graded beat are an
**additive overlay**: juice sheet/spray plus a large glow. Measured halo
luminance outside the melon silhouette in `05`: **109 at 1–3 px, 79 at 3–6 px,
51 at 6–12 px, 27 at 12–25 px.** That is a big soft bloom/SSS lobe sitting on and
around the cut face and it comes straight off the 0.65 budget without appearing
in anyone's Monte-Carlo. **This is the new cross-file cancellation** — the
stage↔materials one is fixed, and fluid.js + bloom stepped into the gap.

### Orange — a straight contract violation, and it is in species.js

The orange's halo is **3.4 lum at 6–12 px outside the silhouette**, i.e. there is
essentially no bloom on it. Its 19 % is genuine surface brightness on the lit
shoulder. `species.js:1097` sets `peel = vec3(0.4600, …)`. The contract's
key-facing ceiling is **0.40**. The comment at :1088–1090 argues 0.46 is safe
because "the multiplier chain's mean is ~0.72, so it is the same effective 0.33
while the peak stays inside" — but the ceiling applies to the **peak**, and
`alb = peel * (blot*0.34 + 0.86)` reaches `0.46 * 1.20 = 0.55` before any
specular, which is `0.55 * 1.565 = 0.86` scene-linear against a 0.65 threshold,
**32 % over**. The author's own note says pushing the base to 0.50 takes the clip
to 6.4 %; the cliff is steeper than they modelled because the MC was
projected-area weighted over the whole hemisphere while the near half the critic
crops is dominated by key-facing normals.

## What the next round must be told, in priority order

1. **The exposure contract did NOT hold.** 15.0 % and 19.1 % against a 5 %
   target. Do not let anyone report this as fixed.
2. **Stop blaming specular pips.** 79 %/73 % of the clipped area is one
   contiguous blob per fruit. The diffuse-albedo-only Monte-Carlos in
   `r4-fruit-mat.md` are structurally unable to see it, and both builders drew
   the same wrong conclusion from them.
3. **Orange:** one-line fix, `species.js:1097` peel base 0.46 → ~0.34–0.36, and
   re-solve against the multiplier chain's **peak** (1.20), not its mean.
4. **Watermelon:** the albedo is basically right (6.4 % clean). The knob is the
   bloom/SSS lobe and the juice film's contribution over the cut face — that
   crosses `stage.js` and `fluid.js`, so it needs an owner *before* the round
   starts, or it will cancel again exactly the way r3's did.
5. **Draw calls 125 (139 hero) against a 120 bar.** First overrun in the project.

## Observations a critic will raise (not measured, eyeball only)

- `16-slow-cleave+50ms` and `00-hero` show the juice as fat, **red, dart-shaped**
  streaks. fluid.js predicted this risk in its §9 and named the lever
  (`stretchK`, not launch speed). The bar's anti-pattern list has "fine mist
  tinted with the juice colour" and "an even droplet size distribution" — the
  hero's beads read closer to sparks than to plate-02's aerosol.
- The blade in `16` blooms into a warm blob where it crosses the fruit. The bar
  lists "blade trail blowing out into a featureless white blob" as an auto-fail.
  It is warm rather than white, so it may survive, but it is close.
- Geometry work landed and is visible: the watermelon is a real ovoid in `01`,
  the pineapple crown and strawberry calyx are real silhouette in `09`.
- `01-whole-watermelon` is dark (meanLum 7.0, 4.6 % of pixels over lum 20). This
  is the cost the stage author flagged. It reads moody rather than underexposed,
  but it is the frame most likely to draw "too dark" from a critic.

## Method

`python3` + PIL + numpy + scipy.ndimage. Scripts at `/tmp/expo*.py`,
`/tmp/mask.py`. All numbers above are measured on `/home/claude/juice/shots/r4/`
and `/home/claude/juice/shots/r3/` at native 640×360 (hero 1280×720).
