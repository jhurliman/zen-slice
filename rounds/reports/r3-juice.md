# r3 — juice (`src/juice/fluid.js`)

Score to beat: 28/100, delta 0. The critic's diagnosis was exact: the intent was
coded, none of it reached the pixels. Five separate blocks were each individually
sufficient to erase the fast-vs-slow distinction. All five are fixed.

## 1. The inverted budget (the headline bug)

`nSpr = q.spray * amtK * (0.50 + 0.60 * mistness) * bk` made the FAT,
JUICE-TINTED spray class grow with stroke speed. Now:

```js
const nSpr  = q.spray * amtK * (0.95 - 0.80*fast) * (0.35 + 0.65*heavy) * bk;
const nRim  = q.rim   * amtK * (0.05 + 1.05*filmness) * bk;   // was 0.30+0.80*f
const nStr  = q.strands * amtK * filmness * bk;
const nMist = q.mist  * amtK * mistness * bk;                 // the ONLY class
                                                              // that grows with speed
```

`mistness` is now bounded (`cl(0.06 + 1.05*fast + 0.30*(1-heavy), 0, 1.35)`) —
r2 let it reach 2.0, which is a fused haze rather than countable grains at
640x360. `filmness` steepened to `heavy * (1-fast)^1.6`. A ⚠ comment block above
these lines states the invariant so it cannot be reintroduced.

## 2. Mist never reached the screen

`grow = clamp(1.15/pxR, 1.0, 4.0)` + `vAlpha = pow(grow, -1.2)`. The clamp of 4
meant any droplet under 0.29 px still rendered sub-pixel and aliased away — so
the achromatic class was emitted and then thrown away, leaving only the fat
tinted spray visible. And -1.2 under-dims a disc (needs -2).

Now `clamp(0.98/pxR, 1.0, 3.4)` with `pow(grow, -1.8)`, **and the mist is sized
so pxR lands in 0.3..0.8 px** — inside the window that ramp can rescue.
`sz = 0.0112 * exp(0.80*w²) * szScale`, up from 0.0062*exp(1.62*w²). The rendered
grain is ~1 px across / ~4 px of area, matching the plate's measured 5.2 px.

## 3. Elongation was structurally impossible

Ligaments had `life 0.05..0.16 s` born at `+6..48 ms`, so at the critic's +50 ms
sample every strand was either dead or inside its fade-in — hence 0% elongated.
Now `life 0.10..0.26 s` born at `+8..60 ms`, radius `0.022..0.050` (was
0.012..0.034, i.e. often under 1 px wide and aliasing), and `q.strands` 44 -> 150.

Added a **baked anisotropy** on droplets: `aP2.y` (previously written as `turbK`
and never read by any shader) is now `baseStretch`, added to the live motion
stretch. Motion stretch alone is useless at the sample instant because the mist
has already stopped; plate-02 measures medAspect 1.50 on a resting aerosol
because that is exposure smear. mist 0.55, spray 0.30, rim 0.10, cling 0.

## 4. Spherical burst -> directed wedge

`crown` was 0.70..1.15 rad = 40-66 deg off the cut normal, i.e. ejection nearly
*in* the cut plane — which is exactly why all 12 angular sectors were populated.
Now `crown = 0.40 + 0.50*filmness` (a flick fires a tight wedge, a cleave opens a
skirt), plus a new `aimWedge(dir, n)` that rotates each droplet toward a
per-burst wedge axis `normalize(N + D*lean)` — keeping the blade-travel bias in
the axis is what stops it collapsing into two axial jets. n = 0.15+0.25*fast
(mist), 0.12+0.28*fast (spray), 0.08+0.20*fast (rim).

## 5. Envelope ran backwards; the sheet was invisible

- Sheet alpha was fresnel-dominated (`0.22 + fres*0.86`); a film seen face-on has
  almost no fresnel, so it measured 101 px at +33 ms. Now `0.40 + fres*0.78`,
  and `aC.x` 0.24+0.62f -> 0.34+0.72f. Specular peak pulled 11 -> 8.5 and
  `fres*1.55` -> `1.35` to hedge against re-flooding now that alpha doubled.
- Sheet drag `B.k` 40 -> 52: 82% of reach by 33 ms, 99% by 90 ms.
- Sheet life -> `(0.078 + 0.050*filmness) * (0.85 + 0.20*amt)` = 128-131 ms.
- Droplet ballistics respecified by ASYMPTOTE (`v0 = reach*k`) rather than launch
  speed, so "how far" and "how fast it gets there" are separate knobs:
  `beadReach`, `mistReach`. Mist drag 20..36 -> 34..62 (63% of extent by
  16-29 ms). Lifetimes cut hard: mist 0.26..0.70 -> 0.09..0.26, spray
  0.38..1.10 -> 0.20..0.55, rim 0.55..1.45 -> 0.30..0.85.

Simulated envelope, melon hero cut (alpha-weighted particle px):
`+8ms 6.6k, +33ms 17.6k, +60ms 23.3k, +100ms 24.4k, +150ms 21.4k, +250ms 12.3k,
+500ms 2.4k, +1000ms 0`. r2 was 101 px at +33 ms rising to 4471 px at +500 ms.

## Predicted numbers on the critic's own two tests

Simulated from the emitter maths + the shader's grow/floor (640x360, 46.15 px per
world unit, camera 10.16 back). Harness stroke speeds recomputed for the *current*
framing: flick 78.2 on an orange (capR 0.90), slowcut 6.7 on a watermelon (1.47).

| | 15-fast-flick | 16-slow-cleave | r2 actual |
|---|---|---|---|
| median blob area | **2.2 px** | **27.3 px** | 26.5 / 25.0 |
| blobs aspect>2 | 0% | **25%** | 0% / 1% |
| achromatic particle px (sat<0.25) | **97%** | 2% | 10.7% / — |
| droplets emitted (both faces) | 2178 | 718 | — |

Critic's stated targets: fast >=80% achromatic with median <=6 px; slow <=30%
achromatic with median >=25 px and >=25% aspect>2. All four met with margin, and
the two frames are now 12x apart in median blob area instead of 6%.

Intermediate speeds interpolate sensibly: melon cut (S 27.9) median 11.8 px /
17% elongated / 4% achromatic; citrus (S 33.5, small fruit) median 2.2 px /
46% achromatic.

## Budget

No new draw calls, meshes, materials or shader programs — still 3 draws
(drops / strands / sheet), same triangle count, same single compute kernel with
its 4-storage-buffer WebGL2 limit respected. Peak drops per burst went 1800 ->
2178 on a fast flick (pool is 9000); the combo backoff denominator went
2400 -> 3000 so the two faces of one fruit stay comparable. JS work is the same
order as r2 (0.6 ms p95). `aP2.y` was repurposed, not added — no new attribute.

## Uncertainty

The one thing I could not measure without rendering is whether 1300 mist grains
in a wedge fuse into large blobs under the critic's connected-component pass. I
sized for ~15-20% areal fill in the cloud region to keep grains countable, which
is what the reference measures, but if the next verdict reports the fast flick's
median blob area *rising* rather than falling, the fix is `q.mist` 900 -> ~600
and a wider `mistReach`, not a change to any of the five fixes above.
