# r15 — physics particles: a feasibility round, and it is not a "yes" yet

**Two things shipped and one thing did not.** Frustum retirement is real and I recommend it.
Droplet-vs-fruit collision is **implemented, mechanically proven, cheap — and default OFF, because I
have not shown it looks good.** Saying otherwise would be the r13 mistake again.

Files: `src/juice/fluid.js` only. `PROBE_VERSION` 16, untouched. Canaries ✅ (`r10` 10340/4.333,
`r9` 10057/2.197).

---

## 1. THE UNLOCK WAS HIS: RETIRE BY VISIBILITY, NOT BY PREDICTED EXIT

My r14 answer was that collisions were blocked by the closed form: r11 derives every droplet's
lifetime by *solving* `p(t)` for the instant it crosses the frame, so the moment a collision bends a
path, the lifetime is a prediction about a trajectory the droplet is no longer on. **His suggestion
dissolves that.**

```js
const onScreen = clip.w > 0 && |clip.x| < w*1.22 && clip.y > -w*1.22 && clip.y < w*5.0;
return select(alive && onScreen, clip, offscreen);
```

Culling on the **actual clip-space position** needs no prediction, no state, no buffer and no CPU
work — the vertex stage had already computed `clip`. It is true whatever the path did on the way,
which is exactly the property physics requires. `lifeOf` stays as the backstop that bounds pool
occupancy; **it no longer has to be right about geometry.**

The top edge is deliberately generous (5x against the sides' 1.22x) for the same reason `exitTime`
never solved it: the crown opens off the cut plane, so a droplet above frame is usually on its way
back down and must not pop.

With retirement decoupled, lifetimes **doubled** — rim 2.30 → 4.60 s, spray 2.00 → 4.00, mist
1.90 → 3.80, and the kernel's `maxAge` integration gate 2.7 → 5.4 to match. Rendered against r14 at
five beats: identical early, **more droplets surviving at +800 ms and +1300 ms**, no popping at any
edge. This also quietly retires r11's one honest failure — portrait mist, of which only 5–19% could
reach an edge; it now simply lives longer and is culled when it is actually gone.

## 2. THE CONSTRAINT THAT DECIDED THE DESIGN, FOUND BEFORE I WROTE ANY CODE

`fluid.js` carries this warning, and it is the whole reason the implementation looks the way it does:

> ⚠ EXACTLY FOUR storage buffers may appear in this kernel. On the WebGL2 fallback three emulates
> compute with transform feedback, and EVERY storage buffer it touches — read-only ones included —
> is registered as a separate TF varying. WebGL2 only guarantees
> `MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS = 4`. **A fifth silently fails to link.**

The kernel already spends all four (`sTurb`, `sTvel`, `rOrigin`, `rVel`). So collision gets **no new
state**. Two consequences, both of which turned out to be improvements:

* The colliders travel as a **`uniformArray`**, not a storage buffer — 24 × `vec4` of (world centre,
  radius), refilled every frame. A uniform array is not a TF varying, so it costs nothing against
  the budget.
* The bounce is folded into the **two accumulators that already exist**. `D` is "how far this droplet
  is from its analytic path" — which is precisely what a bounce is — and `W` is the velocity carrying
  it there. The one free float in the budget, `sTurb.w`, holds a decaying `hit` flag that widens the
  displacement clamp 12x so r14's deliberately subtle wind ceiling does not yank a bounced droplet
  back onto its old path.

Response per overlapping sphere: push `D` out along the normal by the penetration depth; reflect the
approaching component of the true velocity (analytic `wv` **plus** accumulated `W`) with a
restitution of 0.30 and shave the tangential with a friction of 0.42. **Low restitution, high
friction — juice on a wet rind mostly stops and slides. A bouncy ball is the wrong reference.**

## 3. IT IS LIVE — AND MY FIRST TWO ATTEMPTS TO MEASURE IT WERE BOTH WRONG

I built a staging designed to make collision obvious: cut a melon high, park a whole melon directly
underneath to catch the falling juice. Then counted juice-red pixels inside a box on the catcher.

| collider radius | restitution | juice pixels on the catcher (off → on) |
|---|---|---|
| **0.62× bounding** (first pick) | 0.30 | 5159 → 5140 — **−0%** |
| **2.20× bounding** (diagnostic) | 0.90 | 4628 → 2572 on the last beat — **−44%** |
| **0.92× bounding** (honest) | 0.30 | 5159 → 5158 — **−0%** |

**The 2.20× control is what makes this a result rather than a shrug: the path is live, and droplets
really are deflected.** Two separate errors were hiding it.

**(a) 0.62 was a wrong number reasoned from the wrong case.** I picked it because a cut half's
bounding sphere circumscribes its corners, so the full radius would bounce droplets off empty space.
That is true for a half and badly wrong for a **whole fruit**, which is most of what is on screen —
a watermelon's bounding radius *is* its radius, and 0.62 of it is a sphere floating deep inside a
melon that droplets sail straight through. Now 0.92.

**(b) THE METRIC CANNOT SEE A COLLISION, AND THAT IS THE MORE USEFUL FINDING.** Counting juice
pixels that overlap the fruit **in screen space** counts droplets passing *in front of* it in depth
as though they had passed *through* it. Most of them are. That is why 2.20× moved the number — it is
big enough to catch droplets far in front of the melon — and why an honest radius does not. **The
metric was measuring occlusion, not intersection**, which is the same disease as every entry in the
graveyard: a real statistic answering a question nobody asked. A valid measurement has to be made in
**3D**, on droplet world positions, and those live only on the GPU.

## 4. COST — free on the CPU, and I have NOT isolated the GPU

Same page, same scene, flag toggled at runtime, 3 repeats each (r12's H4: one run of a cpu probe is
not a measurement), tier 2, `step()` ms:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| collision **off** | p50 0.3 / p95 0.6 | 0.2 / 0.4 | 0.1 / 0.3 |
| collision **on** | p50 0.2 / p95 0.5 | 0.2 / 0.4 | 0.1 / 0.3 |

**Indistinguishable**, as predicted — the CPU side is a loop over ≤24 bodies with no allocation, no
readback and no Rapier query.

⚠ **The GPU side is unmeasured and I will not guess at it.** The added work is ≤24 sphere tests per
droplet against a kernel already running two octaves of curl noise per droplet, so the arithmetic
says it is minor. But this harness renders under a software rasteriser, where GPU timings mean
nothing. **On-device measurement is required before this ships**, and that is a thing only he can do.

## 5. RECOMMENDATION

* **Ship the frustum retirement and the doubled lifetimes.** Validated, cheap, and strictly better
  than predicting exit — it is also what makes any future physics possible.
* **Keep `?dropphys=1` default OFF.** It is mechanically proven and it is not *shown to be good*.
  `?dropphys=1` on the shipped build turns it on with no rebuild, so he can feel it on the phone,
  which is the only instrument that has ever been right about this game.

**Three things stand between this and shipping, in order:**

1. **2–3 spheres per body instead of 1.** A cut half is a hemisphere; one sphere either floats inside
   it or bounces droplets off air near the flat face. This is the crudest thing in the feature.
2. **A 3D metric.** Sample droplet world positions (a small CPU mirror of N droplets, or a compute
   readback) and count actual sphere intersections. Until that exists, nobody can honestly say
   whether a given radius is right — including me, which is why the shipped default is a compromise
   and is labelled as one.
3. **On-device GPU cost**, per §4.

**And the thing I would not do:** put the droplets in Rapier. 9000 bodies at 120 Hz is not a
trade-off, it is a different game. The value here is that the collision rides the kernel that was
already running.
