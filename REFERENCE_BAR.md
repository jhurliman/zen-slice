# THE BAR — what "wins the blind comparison" means

Every critic scores our real output against this document. No critic may pass a
piece because it "looks good for WebGL". The comparison is blind: judge the
frame as if it were handed to you with no label, and say which one is the
render.

Three reference sources define the bar.

---

## R1 — The user's reference plate (`reference/plate-01.png`)

This is the single most authoritative anchor because the user chose it. Read the
file. What it actually contains, measured:

| Property | Value in the plate |
|---|---|
| Background | Pure black, no gradient noise, no visible "space dust" |
| Key light | Hard, warm, upper-right; specular highlights are small and *bright*, not big soft blooms |
| Rim | A hot horizontal streak of warm light behind the blade plane — the brightest thing in frame |
| Watermelon size | ~55% of frame height. It **dominates**. Nothing is small. |
| Cut faces | Face-on to camera, deep red, visibly *wet* — specular sheen across the whole face, not just at the rim |
| Flesh detail | Visible seeds (black, irregular, embedded not painted), white pith band, green rind band, radial fibre texture, and a bright wet rim where flesh meets rind |
| Rind thickness | Clearly readable — you can see the peel is ~4% of the fruit radius thick, with a pale layer between rind and flesh |
| Juice | A **continuous translucent sheet** trailing the blade, not a cloud of separate dots. The sheet has torn edges and turns into strings, and only *then* into droplets |
| Droplets | Wildly varied in size (from sub-pixel mist to 1/20 of the watermelon), specular, with visible refraction/darkening at the core and a bright rim |
| Debris | Chunks, not just liquid: cubes of pineapple, wedges, pieces of skin, all tumbling |
| Colour | Highly saturated but not clipped. Reds hold detail in the highlight. |
| Depth | Objects at multiple depths with real scale falloff; slight focus falloff on the far ones |

**The single hardest thing in this plate to match** is the *juice sheet*: a
connected, thin, specular film with torn fingers. Particle systems do not look
like this. Any version of ours where juice reads as "a spray of dots" loses
immediately.

## R1b — Real high-speed capture, blade through citrus (`reference/plate-02-highspeed-citrus.jpeg`)

**This plate outranks R1 on fluid behaviour.** R1 is a stylised composite; this is
an actual high-speed frame. Where they disagree, R1 wins on *staging and grade*,
R1b wins on *what the juice physically does*. Read the file.

### It corrects three things I previously got wrong

1. **A fast blade ATOMISES. It does not sheet.**
   The dominant fluid signature here is a dense cloud of very fine, near-uniform
   aerosol — not a film, not fat beads. My earlier claim that "a coherent sheet
   is the defining feature" is only true for a *slow, heavy* cleave (a cleaver
   through a watermelon). A thin fast blade through citrus produces mist.
   → Therefore: **fluid morphology must be a function of stroke speed.**
     Slow stroke  -> film, fingers, ligaments, fat beads (R1 / heavy fruit)
     Fast stroke  -> atomised mist, fine sparkle, little or no film
     This is a gift, not a complication: it couples the look directly to player
     input, which is exactly what makes a slice feel earned.

2. **Fine mist is WHITE, not juice-coloured.**
   Every droplet in that cloud reads silver/white. Sub-millimetre droplets
   scatter light rather than transmit it, so they take the light's colour, not
   the liquid's. Only the *pooled film* on the cut face and the peel reads
   yellow. Our current implementation tints every particle with `juiceColor`,
   which is why our juice looks like red streaks instead of spray.
   → Tint must scale with droplet size: big beads transmit and take juice
     colour; small ones go achromatic and take the key light's colour.

3. **The size distribution is far more extreme than I specified.**
   Overwhelmingly sub-pixel-to-tiny, with only a handful of large drops. Not the
   even spread we currently emit. Think a heavy-tailed distribution, biased hard
   toward small.

### What else this plate establishes

| Property | Observation |
|---|---|
| Spray shape | A directed wedge/cone fanning off the cut plane, densest immediately behind the blade, thinning outward — not a spherical burst |
| Spray direction | Predominantly along the cut-plane normal, biased along blade travel; the blade drags a wake of mist behind its trailing edge |
| Cut face | Covered in a fine **foam of bubbles and beads** across the whole area, with a wet film sheeting down it — bright specular across the entire face, not just at the rim |
| Separation | Confirms R2: **rotation dominates translation.** The near half is tilted showing its face at an angle, the far half is nearly face-on. They are turning, not flying apart |
| Rind | Peel, pale pith and flesh are three clearly distinct layers with real thickness at the edge |
| Depth of field | **Shallow.** The background is heavily defocused and the fruit is sharp. We have no DOF at all — this is a large, cheap realism win |
| Blade | A real solid object with a thin specular edge highlight. It does NOT glow. Our blade is a bloom-blown light-sabre and is wrong on this axis |
| Background | Light, desaturated, defocused — the opposite of R1's black void |

### Resolving the conflict between R1 and R1b

- **Staging, grade, background, key light:** follow R1 (black void, hard warm key).
- **Fluid morphology, droplet colour and size, spray geometry, cut-face wetness,
  half rotation, depth of field:** follow R1b.
- **Blade:** split. R1b proves a real blade reads as a solid with an edge
  highlight. R1's hot streak is the stylised version. Ours should be closer to a
  physical object with a bright edge than to a glowing ribbon.

## R2 — Slow Mo Guys 4K fruit slicing (their "Satisfying Slow Mo Fruit Ninja" and
similar Phantom-camera plates)

What that footage teaches that a still cannot:

1. **The sheet comes first, droplets come later.** For the first ~40 ms of real
   time the juice is a coherent film pulled along by the blade. It thins,
   develops holes, tears into ligaments, and only then beads up. Our timeline
   must follow: film → fingers → strings → beads → mist. Never all at once.
2. **Separation is slow and rotational.** The two halves barely move apart for
   the first few frames; the visible drama is *rotation* about the cut, not
   translation. Halves that fly apart instantly read as arcade, not as physics.
3. **The blade leaves a wake in the air**, and the fruit deforms slightly at the
   contact point before it yields.
4. **Highlights sparkle and move.** Individual droplets flash as they rotate.
   Static specular on a droplet is a dead giveaway.
5. **Nothing is symmetric.** The cut face is never a perfect ellipse; the tear
   pattern is never radially even.
6. **Grading is neutral-to-warm with deep, clean blacks** and no visible noise.

## R3 — Fruit Ninja 2 gameplay capture (feel & mechanics)

What we must match or beat, all measurable:

| Property | Bar |
|---|---|
| Input→visual latency | ≤1 frame. The trail must be drawn *through* the current pointer position, never lagging behind it |
| Trail shape | Tapered, fattest just behind the tip, gone within ~180 ms; width tracks speed |
| Hit generosity | A swipe that visually crosses the fruit **always** cuts it, at any depth |
| Multi-cut | One continuous swipe cuts everything it crosses, once each |
| Cut angle | The cut follows the *actual* swipe angle, not a canned animation |
| Feedback stack | On cut: sound + particle + slow-mo + score float, all within 2 frames |
| Toss arcs | Apex inside the comfortable thumb zone; ~2s hang time; no fruit enters and leaves without a fair chance |
| Combo | Rewards one arc through several fruit; window ≈0.5 s |
| Frame pacing | Locked. A hitch on the *first* slice of a session is the most common failure and is disqualifying |

## R4 — Performance (non-negotiable)

| Metric | Requirement |
|---|---|
| Sustained | 120 fps on ProMotion iPhone/iPad → **8.3 ms budget** |
| Floor | Never below 60 fps → 16.6 ms hard ceiling |
| JS main-thread per frame | ≤2.0 ms at peak load (measured by the harness `cpu` probe) |
| Draw calls | ≤120 at peak |
| Triangles | ≤250k at peak |
| Shader programs | ≤40 (Safari compiles slowly; every extra program is a first-slice hitch) |
| Allocation | Zero steady-state allocation in the hot loop |
| First frame | Playable ≤1.5 s from load, single self-contained file |
| Safari | WebGL2 only; no WebGPU assumptions; no `OES_texture_float` reliance; audio unlocked on first gesture; `viewport-fit=cover` respected |

---

## Scoring

Each critic returns, for its piece only:

- `verdict`: `reference` | `render` | `coin-flip` — which one they'd pick as real
  when shown blind
- `score`: 0–100 where **100 = a viewer cannot tell ours from the reference**
- `biggestGap`: ONE sentence naming the single largest remaining difference
- `evidence`: what specifically in the image/report proves it
- `fix`: the most specific actionable change, aimed at one file

A piece is **done** when two consecutive critics, with fresh context, return
`coin-flip` or better and score ≥90, and the perf budget above still holds.

## Anti-patterns that auto-fail a piece

- Juice whose morphology does not change with stroke speed (a slow cleave that
  atomises, or a fast flick that sheets — both are wrong; see R1b)
- Fine mist tinted with the juice colour instead of reading white
- An even droplet size distribution rather than a heavy tail toward tiny
- A spherical juice burst instead of a directed wedge off the cut plane
- A cut face that is flat, matte, radially symmetric, or dry-looking
- A razor-thin silhouette at the cut edge (no rind / pith / flesh layering)
- Halves that separate by translation without dominant rotation
- Blade trail blowing out into a featureless white blob
- Fruit smaller than ~25% of frame height in the hero shot
- Visible polygon facets on a fruit silhouette
- Any frame where the background is lighter than #0a0a12 outside a highlight
- Everything in focus at every depth (R1b is emphatically shallow-DOF)
- Any hitch on the first slice

---

Sources for R2 framing: [Satisfying Slow Mo Fruit Ninja — The Slow Mo Guys 4K](https://www.youtube.com/watch?v=HUmLN6AGldM),
[High-Speed with "The Slow Mo Guys" & Phantom Cameras — AbelCine](https://www.abelcine.com/articles/blog-and-knowledge/client-profiles/high-speed-with-the-slow-mo-guys-and-phantom-cameras)
