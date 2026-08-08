# r8 — blade.js (the trail gets a timeline; the band gets to be solid; the edge gets a geometry)

**FILE TOUCHED: `src/input/blade.js` only.**

**`tools/probes.py` IS BYTE-FOR-BYTE UNCHANGED** — md5 `d6b2b531421be7b2745370c5c2ac4659`
(identical to the one the r8 stage owner quotes), PROBE_VERSION stays **8**, and I
verified the frozen baseline rather than asserting it: `python3 tools/probes.py suite
shots/r5` still returns `clip:05-cut+500ms.png mask_px 9490`. I added no probe and
needed none — `void` and `lens` measure exactly the defect I was sent to fix.

⚠ **EVERY "before" NUMBER IS A TRUE A/B SHOT TODAY, FROM TODAY'S TREE.** `base2` =
the r7 `blade.js` (`/tmp/blade-r7-shipped.js`, kept), rebuilt and re-shot from the
current tree in this session, because stage/geo/materials/juice have all moved since
`shots/r7`. Rig `.r8blade.mjs` (recipes copied verbatim from `tools/shoot.mjs`;
hero 1280x720 t3, five 640x360 beats, portrait **215x466 t2 — the shipping
capture** — plus 390x844 and 640x360). Roll-up `.r8bmeas.py` shells out to
`tools/probes.py` and nothing else. Frames in `shots/r8-blade/`. Zero page errors and
zero console errors on every run in this report.

---

## 0. HEADLINE

`void pct_blown_gt250`, and the third column is the **ablation** — the same beat with
`bladeTrail.visible = false`, which is how much of it is *this file*:

| beat | base2 (r7) | **r8** | trail hidden | trail's own share: r7 → **r8** | ribbon stations ≥250 |
|---|---|---|---|---|---|
| `15-fast-flick+50ms` | 0.1610 | **0.0039** | 0.0009 | 0.1601 → **0.0030 pp (−98%)** | 3 → **0** |
| `09-combo+50ms` | 0.2027 | **0.0582** | 0.1263 | 0.0764 → **−0.0681 pp** | 2 → **0** |
| `12-idle-blade` | 0.1793 | **0.1250** | 0.1155 | 0.0638 → **0.0095 pp (−85%)** | 2 → **1** (the streak's) |
| `16-slow-cleave+50ms` | 0.0365 | **0.0122** | — | — | 1 → **0** |
| `00b-hero+100ms` | 0.0592 | 0.0641 | 0.0403 | 0.0189 → 0.0238 pp | 0 → 0 |
| `00-hero` (control: **contains no blade**) | 0.0308 | 0.0305 | — | — | 0 → 0 |
| **draw calls / triangles** | 25 / 75 247 | **25 / 75 215** | | **+0 / −32** | |

`reference/plate-01.png` measures `void` **0.1149%**. Four of the five blade-bearing
beats are now at or below the plate.

**Read the 09-combo row twice.** The trail's contribution is **negative**: the frame
with the blade in it has *fewer* blown pixels than the frame without it. A solid
object that crosses a clipped background removes clipped pixels. That is the
plate-02 property, measured on the frozen probe, and it is the single number I would
point at if I could only keep one.

The one row that goes the wrong way is `00b-hero+100ms`, +0.005 pp. Two independent
`noblade` shoots of the same beat differ by 0.003 pp (0.0400 / 0.0403), so this is
one noise-width, and I am not going to dress it up as a win or hide it.

---

## 1. WHAT I WAS SENT TO DO, AND WHAT I FOUND WHEN I CHECKED IT

The brief asks me to delete the `clipZ/clipW` focal-plane pin and drive the band
through `api.lens.line()`. **That work is already in the file — it is what I did in
round 7**, and the r8 stage owner independently confirmed it by reading my caller
(`r8-stage.md` §6: "blade.js took r7's recommendation verbatim … the r7 report's item
for blade.js is done"). `lens.line(EDGE_R0_LD, dist, gMax)` is live at `blade.js:314`
in the r7 file and still live now; `depthWrite` has been `false` since r7. So the
brief's named fix is shipped and this round had to find the *next* defect.

I verified the reasoning the brief told me to verify, and record the result because
it is still being repeated: **the claim that this trail "cannot write depth because a
long additive ribbon overlapping itself would occlude its own segments" is false.**
`depthTest` is `false`, so a later fragment always wins and there is no
self-occlusion available to have; it is also not additive. The real disqualifier —
r7's — is that a depth write with `depthTest:false` stamps the trail's depth over
every pixel it crosses and the post gather then defocuses *other people's* pixels by
*this* object's CoC. Conclusion right, reason wrong, and the wrong reason would let a
future round "fix" it by switching `depthTest` back on.

I also confirmed the stage owner's ablation from the other end. Their claim — the
trail was always razor-sharp and r6's streak was accidentally hiding it — is
consistent with what I measure: on `15-fast-flick` the trail supplies **99.2%** of the
frame's blown pixels (0.1601 pp of 0.1610), i.e. with the trail hidden that beat has
essentially none (0.0009%).

---

## 2. DEFECT 1 — EVERY CAPTURED FRAME SINCE ROUND 2 SHOWED A TRAIL WITH NO AGE IN IT

This is the third instance on this project of "correct on the bench, wrong on the
device", and the first one in the time axis rather than the aspect axis.

`ZS.swipe()` (`main.js:337`) emits **every segment of a stroke inside one call**, and
under the capture harness `nowSec()` reads a VIRTUAL clock (`contract.js:215`) that
only advances inside `ZS.step`. So rounds 2–7 stamped every sample of a synthetic
stroke with the **same** `t`. Measured directly out of the vertex attribute, r7 build,
`12-idle-blade`:

    r7  age along the stroke:  0 0 0 0 0 0 … 0 0 0
    r8  age along the stroke:  0.90 0.86 0.82 0.78 0.74 0.70 … 0.33 0.29 0.25

`fadeF`, `fadeE`, the age-keyed `rip` reflection and the `TRAIL_LIFE` prune were
**all constants** in every frame any critic has ever scored — the file's entire
temporal model was inert in exactly the images it is judged on, and none of it is
inert under real pointer input.

The payload already carries the fix: `speedNdc` is part of the 'swipe' contract, so a
segment of length L took L/speed seconds. The listener now stamps the newest sample
at `now` and slides the retained history back by that duration. **Nothing in the real
input path is touched** — `push()`, `handleMove` and the listener registrations are
byte-identical to r6 — because real events already carry real timestamps; this runs
only in the synthetic branch, which `selfEmit` guards real input out of.

Consequences, all of them the device's own behaviour rather than a new look:

* the tail fades and the head does not: R3's "tapered … gone within ~180 ms";
* **trail LENGTH becomes speed x TRAIL_LIFE.** The 14.0-ndc/s flick keeps a
  full-frame smear (98 verts, unchanged); the 4.0-ndc/s idle stroke took 0.33 s so
  only its last 0.15 s survives (82 → 34 verts); the 1.2-ndc/s cleave keeps 18. That
  is morphology as a function of stroke speed, which the bar asks for everywhere
  else, and it is what a 200 ms persistence trail *is*.

⚠ **This makes the captured trail visibly shorter on slow strokes, and I want that
called out rather than discovered.** It is not a dimming: `16-slow-cleave` is the one
beat whose edge amplitude I deliberately held at r7's value. It is the harness's own
`speedNdc` finally being used as the seconds-per-ndc it is declared to be. If a
future round decides the game wants a longer visible trail, the honest lever is
`TRAIL_LIFE` (0.20 s, already 20 ms over R3's "gone within ~180 ms"), not putting the
clock back.

### 2b. A CLOCK BUG I FOUND ON THE WAY, WORTH ONE COMPARISON

`nowSec()` is the WALL clock until the first `ZS.step` and the virtual clock after it
(`main.js:311-318`) — a jump of however long the page has been open. Forwards is
harmless (ageing retires the stale samples). **Backwards leaves every sample stamped
in the future, where `now - t` is negative, the age clamps to 0 and the prune can
never fire: the trail freezes, un-ageing, until the next stroke.** It is reachable in
the real game (`ZS.pause()` mid-stroke, then a deterministic step). One comparison in
`api.frame` closes it.

**For the integrator:** `tools/shoot.mjs` is immune *by accident* — its first beat is
`reset` → `advance(0.05)`, which makes the clock virtual before any swipe. A beat
sheet that swiped first would have shot an un-ageing trail (and, before the guard,
would have shot it for every round). My own rig hit this and now warms up the page the
same way `shoot.mjs` does.

---

## 3. DEFECT 2 — THE BAND DID NOT OCCLUDE, SO IT READ AS A HOT WIRE

`.r8blade.mjs ablate` gives the honest instrument: the same frame with the trail
hidden. r7's blade crossing stage.js's streak, `00b-hero+100ms`, column x=1100:

    trail hidden   171.8  185.9  187.9  182.4     <- the streak
    r7 blade       169.1  198.6  220.5  200.8     <- +32 at the core, −3% beside it
    r8 blade        77    85     92     94        <- a solid, crossing a lamp

The blade *added* light to the brightest object in the frame and darkened it by 3%.
That is the plate-02 anti-pattern verbatim — "a real blade is a SOLID OBJECT with a
thin specular edge, not a glowing ribbon" — and no amount of shading fixes it,
because the defect is the alpha.

The fix is two constants that must move together, and that is the whole idea:

    BODY_A  0.58 -> 0.90        coverage of a solid
    FLAT_K  = 0.58 / BODY_A     divides the body's own radiance by the same factor

With NORMAL blending the composite is `colour x alpha + dst x (1-alpha)`, so holding
`colour x alpha` fixed means **the EMITTED term does not move by one code value** —
over the void, which is most of the frame, this change is invisible by construction —
and the entire change lands on the TRANSMITTED term: 0.42 → 0.10 of whatever is
behind it. A polished blade in a black room reflects the black room; **it is dark
because it is opaque**, and both halves of that sentence have to be in the shader or
raising the alpha just produces a grey ribbon, which is the r2 defect in a new
costume. The filament is unaffected: alpha there already saturated at 1.

Evidence, beyond the profile above: `rounds/reports/r8-blade-solid.png` (r7 top, r8
bottom, same crop) — the blade now cuts a dark wedge with a defined leading edge out
of the streak instead of laying a wire on top of it. And the `09-combo` row in §0: a
**negative** blown-pixel contribution is a thing only an occluder can do.

---

## 4. DEFECT 3 — THE EDGE HIGHLIGHT HAD NO GEOMETRY AND THE SPEED LAW WAS BACKWARDS

r2's amplitude was `hot = 1.45 + 1.35*speed01`: brighter the faster you swipe,
constant along the stroke, and independent of where the lights are. The probe says
what that cost: the **fastest** stroke supplied 99.2% of its frame's blown pixels.
Two physical terms replace it, both computed per station in `api.frame`.

**(1) Smear flux.** A persistence trail is one edge's reflected flux spread along the
path it swept. Sweep twice as far in the same time and the same flux covers twice the
length, so radiance goes as `1/(1 + SMEAR_K*speed)` — **down** with speed, where r2
had it going up. This is the same conservation law the filament's own defocus already
obeys (`energy = 1/grow`, r7); r2 was violating it along the other axis. The
saturating form is right too: at rest the coverage cannot exceed 1, so the amplitude
tends to a finite `EDGE_A`, which is just "the radiance of a stationary edge".

**(2) The glint.** The cutting edge is a thin cylinder, so its highlight is the
anisotropic (Kajiya-Kay) one — bright where the edge runs *across* a light, dark where
it runs *along* it. r7 gave every station a real 3-D position, so there is now a real
3-D tangent to take, and the recession term makes the highlight vary along the length
even when the screen path is dead straight. That is R2's "highlights sparkle and move;
static specular on a droplet is a dead giveaway", applied to the blade. Measured on
the shipped build, the amplitude along the idle stroke runs **1.305 → 1.509**, and on
the horizontal hero stroke it is ~1.4x higher than on the diagonal idle one, because
the idle stroke runs nearly *along* the key.

`GL_FLOOR` is 0.52 and that is a measured retreat from 0.30, stated because it is the
one number here I got wrong first: at 0.30 the diagonal stroke lost 2.0x and the blade
read as a wisp. A ground edge is a rough cylinder, not a mirror, so most of what it
returns is the broad lobe — the floor is large for the same reason the lobe exponent
came down from 1.5 to 1.0.

`EDGE_A = 2.25` is calibrated so the **slow cleave** — the one stroke whose blown
share was already small and whose look r2 tuned — reproduces r7's amplitude to 2%
(1.58 against 1.61). Everything faster comes down from there, which is where the
clipping actually was: hero 0.57x, idle 0.68x, fast flick 0.38x.

**Solo trail, through the real pipeline with the rest of the scene hidden** — this is
the file on its own:

| | base2 (r7) | **r8** |
|---|---|---|
| flick `void blown%` | 0.1406 | **0.0000** |
| flick ribbon `peak` | 73 **254 254 249** 178 113 99 88 66 | 41 **224** 165 96 26 – – – – |
| flick ribbon `edge_1090`, stations on the trail | 0.81 1.40 1.55 2.10 2.84 | 0.82 1.56 1.60 1.76 1.54 |
| idle `void blown%` | 0.0495 | **0.0022** |
| slow cleave `void blown%` | 0.0239 | **0.0022** |
| `void corner_max` | 2.89–2.92 | 2.89–2.92 (black floor held) |

**On sharpness, precisely and without overclaiming.** The trail's near half measures
`edge_1090` 1.54–1.76 in both builds — the tip sits on the focal plane in both, and
that is correct, because plate-02's blade is sharp exactly where it is cutting. What
changed is the far half: r7 softened it by receding it into the far slab, r8 fades it
out instead. Against the same composited frame's in-focus subject (1.512) the trail is
still the *softer* of the two, so the gate the brief sets — "the trail must stop being
the sharpest thing in a defocused frame" — holds, and no station of it reaches 250 any
more on any beat.

---

## 5. THE OTHER THING THE TIMELINE BROKE, AND FIXING IT CLOSES r7's OPEN ITEM

r7's `dist = focus + RECEDE*fL*(1-u)^2` used `u` = the index down whatever stations
happened to be retained. Once the trail can be a 3-world-unit stub, that formula
recedes the stub by the same 1.61 world units as a 12-unit full-frame slash: it falls
off a cliff into the far slab over a sixth of the length and its tail comes back a
defocused blob. Same curve, wrong domain.

`RECEDE` is now scaled by the stroke's own **world** arc length,
`recede = RECEDE * min(1, (arcW/ARC_W)^2)`, with `ARC_W = 11.83` — the measured world
length of the full-width landscape hero swipe, so a full-frame slash is bit-identical
to r7 and only short strokes (which were wrong) move. This is r7 §6's named next move
("couple the depth excursion to the stroke's ARC LENGTH … the single best next move"),
and the reason r7 could not land it was an aspect worry that dissolves in the world
metric:

| | landscape 640x360 | portrait 390x844 | **iphone 215x466 t2 (shipping)** |
|---|---|---|---|
| widest station, % of SHORT side | 3.48% | 3.44% | **3.44%** |
| recession over the stroke, world units | 0.086 | 0.129 | **0.141** |
| `bokeh` | 11.00 | 11.917 | 5.972 |

The width invariance r7 bought is intact (1.2% across a 2x aspect flip and a 3x
buffer). The recession is 1.6x larger in portrait **and it should be**: `main.js` fits
the stage box to the SHORT side (`camera.position.z = max(distV, distH)`), so at
camZ 22.02 the portrait frame is 16.9 world units tall against landscape's 7.8 — the
same finger genuinely sweeps 1.2x more world, and `cocOf`'s slab is absolute world
units, so the ratio is aspect-free by construction rather than by tuning. The
resulting blur is ~12% of saturation on both. r7 measured the arc in NDC, where
`worldArc ∝ focus` *looks* like r6's portrait bug; in the world metric it is not a
bug, it is the statement that a phone held upright shows you more world.

The tail width exponent also came down, 0.42 → 0.22, for a reason that is the mirror
of §2: it was 0.42 when the tail had no fade, so the width taper was the only thing
saying "this end is older". It now says it twice, and twice was measurably too much.
R3's "tapered, fattest just behind the tip" is the `tipT` and `sin` terms, which are
untouched.

---

## 6. PERF — +0 DRAW CALLS, −32 TRIANGLES, AND THE FRAGMENT GOT CHEAPER

`node .r8blade.mjs draws`, seeded RNG so the synthetic load is identical between
builds, 1280x720 t3, same tree, `blade.js` toggled:

| | base2 (r7) | **r8** |
|---|---|---|
| peak draw calls | 25 | **25** |
| peak triangles | 75 247 | **75 215** |
| JS frame max, 5 runs of 400 steps (ms) | 3.8 / 11.1 / 2.9 / 3.4 / 3.4 | 7.2 / 4.8 / 2.6 / 2.1 / 3.2 |
| JS frame med / p95 (ms) | 0.0–0.1 / 0.2 | 0.0–0.1 / 0.2–0.4 |

**+0 draw calls, +0 programs, +0 render targets, −32 triangles.** The triangle
saving is real but small and it is not a cleverness: shorter retained trails are
fewer quads. `forceSinglePass` and the single-mesh structure are unchanged, so this
file is still 1 of the 13 fixed draw calls in the stage owner's
`peakDrawCalls = 13 + 2 x liveBodies` law — none of the 33 portrait calls over budget
are mine, and I did not add one.

⚠ **I am not claiming a JS win.** The five-run spread on `max` is 2.9–11.1 ms for the
*unchanged* r7 build; the two builds are indistinguishable and anyone quoting a single
`max` from this probe is quoting noise. What I can say is what I added: ~20 flops per
station over ≤88 stations (one Kajiya-Kay evaluation, two `Math.pow`, one arc-length
pass), plus a 4-byte-per-vertex attribute upload (≤704 B). **The fragment shader got
one multiply-add cheaper** — `hot = 1.35*spd + 1.45` is now a plain attribute read —
and fill rate goes *down*, because the trail is shorter on every stroke slower than
~9 ndc/s.

Tier flip 3→1→3→0→2→3→2→3: zero errors, `renderer.info.memory.textures` returns to 18
every time and to 6 at tier 0, `spriteGrow` LOW-tier signal still honoured.

---

## 7. CROSS-FILE CONTRACTS — WHAT I VERIFIED, BY READING **AND** AT RUNTIME

Everything below was checked in the running page (`.r8bchk.mjs`), not inferred:

* **`ctx.stage.lights` — a contract I newly depend on.** `stage.js:1827` publishes
  `{key, rim, fill}`. Read live at runtime: key `(8.2, 7.4, 6.2)`, rim
  `(4.6, 2.4, -8.4)` — identical to the source, and to what stage.js's own header
  documents. Read lazily every frame with documented fallbacks, so a stage that stops
  publishing them degrades to a constant glint instead of throwing.
* **The camera carries no rotation.** My view-space tangent maths needs it.
  `main.js:124-126` sets position `(0, 0.6, 22)` and `lookAt(0, 0.6, 0)`, and
  `resize` only ever moves `.z`. Verified at runtime: `camera.rotation` is
  `(0, 0, 0)`. **If a future round rotates the camera, the glint block is the line
  that breaks**, and it is commented as such.
* **`api.lens`** — `version` still **7**, `line`, `cocPixels`, `cocPixelsForZ` all
  present, uniforms `{bokeh, focalLength, focus, nearScale, pix, spriteGrow, texel,
  voidDist}` all present. The r8 stage owner states they changed neither
  `lineDefocus`'s signature nor its return packing; I confirmed my caller still gets
  a 4-vector and behaves, and I changed nothing about how I call it.
* **`stageRef.focusDistance`** still written every frame; still read here.
* **The 'swipe' payload contract is UNCHANGED.** I did not touch the emit. I now
  *consume* `speedNdc` in the listener as the seconds-per-ndc it is declared to be;
  `slicer.js:onSwipe` reads `sw.a`, `sw.b`, `sw.speedNdc` synchronously and is
  unaffected (I read it to be sure).
* **`main.js`'s `ZS.swipe` and `contract.js`'s `Clock`** — §2 and §2b are both
  statements about those two files, and both were read before being relied on.
* **I did not touch `probes.py`, and I added no probe.**

---

## 8. WHAT I DID NOT DO, AND WHY

* **I did not raise `TRAIL_LIFE`.** The visible trail is shorter now on slow strokes
  (§2) and lengthening it is a one-line temptation. R3's bar is "gone within ~180 ms"
  and we are at 200. Changing it would be re-tuning the look to hide a truthful
  change; it is named here so a future round can make that decision deliberately.
* **I did not pool the two `new THREE.Vector2` per pointer sample** in the emit. Still
  480 objects/sec at 240 Hz raw input, still a violation of the zero-steady-state-
  allocation rule, and still not mine: the payload is a contract with `slicer.js`,
  which I may not edit. `slicer.js` reads it synchronously and would be safe today.
  Two-file change, integrator's call. (r7 said this; nothing has changed.)
* **I did not touch the specular's hue, `depthTest`, `renderOrder`, the blending mode,
  the resample, the taper shape, the width-vs-speed law, `BLADE_W`, `EDGE_R0`,
  `EDGE_R0_LD`, or anything in `api.lens`'s calling convention.**
* **I did not give the filament a second, warmer lobe for the rim light.** The rim is
  the brighter of the two lights and it is behind, so a rim-lit edge should shift
  *hue* along its length, not just amplitude. That is one more attribute channel or a
  packed encoding, it is a real look win, and I would not ship it at the end of a
  round without a sweep. Named and sized.
* **`00-hero` still contains no blade.** `tools/shoot.mjs` shoots it at cut+250 ms and
  `TRAIL_LIFE` is 200 ms, so `pts` is empty and the draw range is zero — in *both*
  builds, which is why it is quoted above as the control. This is the third round it
  has been true. The hero is the one frame critics see at full resolution; if it is
  meant to show a blade it wants shooting at +100 ms, and that is a `shoot.mjs`
  change, not mine. My `00b-hero+100ms` beat exists so the hero framing can be
  measured at all.

## 9. REPRODUCING ALL OF IT

    node .build-stagecheck.mjs                  # -> /tmp/zsv/index.html  (NOT dist/)
    node .r8blade.mjs shots  r8x                # hero + hero+100ms + five 640x360 beats
    node .r8blade.mjs solo   r8x                # the trail alone, 640x360 and 1280x720
    node .r8blade.mjs ablate r8x                # the same beats with the trail HIDDEN
    node .r8blade.mjs port   r8x                # 215x466 t2, 390x844, 640x360
    node .r8blade.mjs draws                     # seeded draw calls + triangles + cpu x5
    node .r8blade.mjs tiers                     # 3-1-3-0-2-3-2-3, leak + error check
    node .r8bchk.mjs                            # cross-file contracts, live
    python3 .r8bmeas.py shots/r8-blade/r8x-*.png    # calls tools/probes.py ONLY
    python3 tools/probes.py suite shots/r5      # the frozen canary: clip mask_px 9490

    # the A/B baseline (⚠ overwrites src/input/blade.js; restore afterwards)
    cp /tmp/blade-r7-shipped.js src/input/blade.js && node .build-stagecheck.mjs
    cp /tmp/blade-r8.js         src/input/blade.js

All measured on the WebGL2 backend of WebGPURenderer through SwiftShader, tiers 0–3.
