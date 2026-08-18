# r13 — RETRACTION: "the first slice of a session has no juice" is a harness artefact

**Retracting my own headline from `r12-juice-mix.md` §4, and the item I made #0 in HANDOFF.md.**

## What I claimed

> The first slice of a session shows no juice, in the exact system he filed a note about.

## What is actually true

The measurement was real and still reproduces: `node tools/.r12first.mjs` runs three identical cuts
on one page and cut 0 renders the two halves and not one droplet, with the pool reporting
1850 / 1829 / 1829 emitted instances in all three.

**But every cut in that bench advances with `ZS.advance()`, which simulates dark and renders only
the last frame. A player renders every frame.** I never ran that comparison. Two benches, one
build, one page each, and the only variable is which path advances time:

`tools/.r13path.mjs` — same cut, same seed:

| | `advance()` — dark, one rendered frame | 30 rendered frames |
|---|---|---|
| **first** cut of the page | **0 blobs** | **86 blobs** |
| second cut of the page | 101 blobs | 82 blobs |

`tools/.r13when.mjs` — the first cut of a page, every consecutive frame rendered from the instant
of the cut, `droplets mask_px / n_blobs`:

| frame | 0 | 1 | 2 | 3 | 4 | 6 | 8 | 10 | 13 |
|---|---|---|---|---|---|---|---|---|---|
| mask | 14 | 123 | 262 | 420 | 690 | 969 | 1440 | 2138 | 2797 |
| blobs | 0 | 2 | 6 | 8 | 15 | 14 | 20 | 28 | 40 |

**The juice is there from the frame after the cut and grows monotonically.** On the path a player
actually takes, the first slice of a session looks like every other slice.

## The fix I proposed in the handoff, tested and REFUTED

I left this as the untested hypothesis: the droplet mesh is skipped while `instanceCount` is 0, so
the backend never builds its pipeline; `ZS.clear()` -> `api.reset()` sets `drops.head = 0` and
therefore `instanceCount = 0` again, so a primer at `api.init` cannot survive to the first cut.
Re-emit it after every reset and the pipeline would exist before the first burst.

**Built it. `primeDrops()` called from both `api.init` and the end of `api.reset`, so
`instanceCount` is never 0. Cut 0 is still empty.** Instance counts went 1850/1829/1829 ->
1851/1830/1830, confirming the primer landed. The hypothesis is dead; reverted, not shipped.

## What is left, stated at the size it actually is

A dark-simulate artefact confined to the first cut of a page. It costs the harness, not the player.
I tried to size its effect on the earliest beats by re-running `shoot.mjs`'s exact opening with and
without a throwaway warm-up cut, holding the RNG stream fixed across the pair (the first attempt
was worthless — the warm-up consumed the stream, so the two columns were different bursts):

| beat | cold, as shipped | warm, identical stream |
|---|---|---|
| `02-cut+33ms` | 391 / 8 | **169 / 2** |
| `03-cut+100ms` | 2425 / 32 | **4059 / 57** |
| `04-cut+250ms` | 6423 / 82 | **8472 / 101** |

**Mixed, and I am not shipping a harness change on it.** Warming raises 03 and 04 by ~25-30% and
*lowers* 02, and a warm-up leaves the sim in a different state even after `ZS.clear()`, so the pair
is not as controlled as it looks. Filed as an open measurement question, not a fix.

## The lesson, which is this project's oldest one arriving again

r12 §8 wrote: *"a bit-exact capture of a probe that rewards deleting an appendage still rewards
deleting an appendage."* That applies to its author. I had a reproducible measurement, on a real
defect-shaped symptom, and I published what I assumed it meant without running the one experiment
that separated "the game does this" from "the harness does this" — the same shape as the round-3
critic who compared a motion property against a still photograph.

**The discriminating experiment cost four minutes.** Ask what the player's path is and measure that.
