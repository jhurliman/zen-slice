# ⚠ PLAYER NOTE, MID-ROUND — THE SPRAY/BLOB MIX IS A FUNCTION OF BLADE SPEED

**Source: the player, live, 2026-08-18. This outranks every verdict and every probe.**

His words, in order:

> "both the high speed fluid spray and lower speed fluid blobs are both great, we should always
> show some combination of both with each hit but weighted more toward fluid blobs and slower
> speeds and more like 80% spray 20% blobs at a higher speed"

and, when asked which way round the 80/20 went:

> "the weighting should change based on the velocity of the blade. more spray at higher velocities"

## WHAT THIS MEANS

Not a fixed ratio. A **law**. The two populations already in `fluid.js` are both wanted, always
both present on every hit, and their relative weight is driven by `SliceStroke` speed:

| blade speed | mix | reads as |
|---|---|---|
| slow cleave | blob-dominant, slow | fat coherent gobs, readable arcs |
| fast flick | spray-dominant (~80/20), faster | fine atomised mist |

**ALWAYS SOME OF BOTH.** He was explicit: "we should always show some combination of both with
each hit". Neither population may go to zero at either end of the speed range. Treat 80/20 as the
extreme of the spray end, not as a global setting.

## THIS IS THE WEBER NUMBER AND YOU SHOULD IMPLEMENT IT AS ONE

`We = rho * v^2 * d / sigma` — the ratio of disruptive inertial shear to the surface tension
holding a ligament together. Above a critical We (~12 for aerodynamic breakup, higher for
shear-driven sheet breakup) a sheet atomises; below it, it stays coherent and pinches into large
blobs by Rayleigh–Plateau instability instead.

So the mapping the player is asking for is the one real fluid does:

* spray fraction rises with **v squared**, not linearly — a 2x faster flick should look
  dramatically more atomised, not 2x more
* the atomised population's characteristic droplet diameter FALLS as speed rises (that is the
  same instability, seen from the other side), so the fast end should be finer as well as more
  numerous
* the blob population's size should be roughly speed-independent — it is set by the ligament
  thickness and surface tension, not by how hard you hit it

Implementing it this way means it holds across the whole speed range without per-case tuning,
including speeds the harness never captures. A hand-tuned lerp between two presets will not.

## CONSTRAINTS THAT STILL HOLD

* **The r11 lifetime work is unchanged and comes first.** He also asked that juice "sprays off
  the screen" rather than fading. A blob that is now slow AND long-lived must still exit frame
  or be retired off-screen — do not let the blob-dominant end of this law re-introduce juice
  that hangs in the middle of the frame and dies there.
* **Tune against `ctx.timeScale = 1`.** Slow-mo is being deleted in this same round; a mix tuned
  against the current build's scaled clock will be wrong afterwards.
* The frozen suite is a CONTROL this round, not a target. `tintlaw`'s `sat_size_slope` and the
  `droplets` size statistics will move. That is expected. Report it; do not optimise it.
* `15-fast-flick+50ms` and `16-slow-cleave+50ms` are the two harness beats that bracket this
  law — they exist precisely to show the two ends. Shoot both, in both orientations, and LOOK
  at them. This is the first time those two beats have had a reason to differ by design.
