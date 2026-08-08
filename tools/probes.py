#!/usr/bin/env python3
"""
probes.py — THE FROZEN MEASUREMENT SUITE.  PROBE_VERSION = 4
(this docstring said 2 through round 6; the constant below is authoritative.
 r6 merged three independent ADDITIONS — `lens` (stage), `tintlaw` (juice),
 `species` (geometry) — each of which bumped the version and each of which
 verified that `suite shots/r5` still reproduces every stored r5 number. The
 integrator re-verified the MERGED file: under v4, shots/r5 returns
 clip:05 5.227% / mask 9490, particles:15 n=67 medArea 4.0 meanSat 0.7982,
 particles:16 n=48 medArea 15.5 meanSat 0.8103 — identical to the v1 baseline.
 No stored comparison was invalidated by the three-way merge.)

Round 5 exposed the reason scores had plateaued, and it was not the renderer.
Two failures, both in the measurement layer:

  1. A critic's headline number (49.3% of the cut face clipped) could not be
     reproduced, because the ellipse mask was RE-FITTED each round — its pixel
     count went 1881 -> 935 between rounds. Under a fixed mask the same frame
     measured 33.6%. Half the movement we were steering by was the ruler
     changing shape.

  2. A builder's own probe keyed its mask on `G < 0.80R and B < 0.80R`, which by
     construction excludes every near-white pixel — i.e. it could not see the
     white foam pips that were the actual defect. It returned 4.89% and made the
     "<5%" target look met while the honest number was 14.07%.

So this file exists to make a target impossible to hit by choosing a friendlier
instrument. Builders and critics call the SAME code. If a probe is wrong, fix it
here, bump PROBE_VERSION, and every stored number is invalidated together —
rather than each party quietly carrying its own ruler.

THE RULE THAT MATTERS MOST
--------------------------
A mask must be defined GEOMETRICALLY (or by an explicit region), NEVER by the
colour of the thing being measured. The moment a mask keys on colour, it can
exclude the defect. Every mask below is geometric, and every probe reports the
pixel count of its mask so a changed mask is visible at a glance.

USAGE
    python3 tools/probes.py list
    python3 tools/probes.py <probe> <image> [--ref <image>] [k=v ...]
    python3 tools/probes.py suite <shots-dir>          # runs everything, prints JSON
Output is always JSON on stdout, including "probe_version" and "mask_px".
"""
import sys, json, math
import numpy as np
from PIL import Image

PROBE_VERSION = 9
# ── v8 -> v9 (round 8 critic, stage) ─────────────────────────────────────────
# LOUD NOTICE, AS THE RULES REQUIRE. I bumped PROBE_VERSION 8 -> 9.
#
# ADDED one probe, `glare`, and appended one SUITE row (glare:00-hero.png).
# NO EXISTING PROBE'S EXECUTABLE CODE CHANGED BY ONE CHARACTER — clip, void,
# ring, silhouette, droplets, particles, tintlaw, lens, foam, collar, filament,
# species and limb are byte-identical to v8, and the shared helpers
# `_radon_ridge`, `_edge_1090`, `_radial_edges`, `_spearman` are untouched, so
# `glare`, `filament` and `lens` all profile the SAME ridge found by the SAME
# code. PROBES gains one key; the pre-existing SUITE rows are unchanged and in
# the same order.
# VERIFIED RATHER THAN ASSERTED, the way v6/v7/v8 did it: the full suite was
# captured on shots/r5, r6, r7, r8, r7-iphone and r8-iphone under v8, the edit
# was made, the suite re-run and diffed key-by-key on all six directories. Every
# pre-existing row is identical on all six; only the new `glare:00-hero.png` key
# appears (and only in the landscape dirs, which are the ones that have a hero).
#
# WHY IT EXISTS. `filament` measures w90/w50 — the shape of the ribbon's CORE.
# It is blind by construction to what the core is sitting on. A needle-thin cusp
# painted down the middle of the same flat-topped slab v8 was built to detect
# scores an EXCELLENT `flattop`, because w90 and w50 both collapse onto the
# needle. That is not hypothetical: r8's hero drove flattop_p50 0.409 -> 0.222,
# straight through the plates' 0.300/0.286 and out the other side, while the
# slab underneath survived. `glare` measures the complementary half — the SKIRT:
#
#   u20/u50, u05/u50   the transverse offsets at 20% and 5% of the profile's
#                      amplitude, each divided by the offset at 50%. Pure shape
#                      ratios, invariant to width, brightness and blur, and
#                      measured OUTSIDE the core where `filament` stops looking.
#                        hard-edged slab      1.00 / 1.00
#                        defocus-disc chord   ~1.06 / ~1.10
#                        Gaussian             1.52 / 2.08
#                        Lorentzian           2.00 / 4.36
#                        two-population
#                        (cusp on a slab)     -> u05/u50 inflates without limit
#                      Both plates land in the same narrow place: plate-01
#                      1.479/1.970, plate-02-highspeed-citrus 1.336/1.462. Two
#                      cameras, two subjects, two lenses, one answer — the same
#                      independent-control test `filament` passed.
# First crossing outward from the peak is used, per side, per station, so a
# single bright speck sitting in the wing cannot lengthen a tail; the median over
# up to 2*nline crossings is reported and `n` says how many were formed. Stations
# whose amplitude is under `min_amp` are dropped. Geometric and colour-blind: the
# ridge is the one `_radon_ridge` already finds, and only luma is read. mask_px
# is reported.
#
# ── v7 -> v8 (round 7 critic, stage) ─────────────────────────────────────────
# LOUD NOTICE, AS THE RULES REQUIRE. I bumped PROBE_VERSION 7 -> 8.
#
# ADDED one probe, `filament`, and appended one SUITE row (filament:00-hero.png).
# NO EXISTING PROBE'S EXECUTABLE CODE CHANGED BY ONE CHARACTER — clip, void,
# ring, silhouette, droplets, particles, tintlaw, lens, foam, collar, species and
# limb are byte-identical to v7, and the shared helpers `_radon_ridge`,
# `_edge_1090`, `_radial_edges`, `_spearman` are untouched, so `filament` and
# `lens` profile the SAME ridge found by the SAME code. PROBES gains one key; the
# pre-existing SUITE rows are unchanged and in the same order.
# VERIFIED RATHER THAN ASSERTED, as v6 and v7 did it: the full suite was captured
# on shots/r5, shots/r6 and shots/r7 under v7, the edit was made, and the suite
# was re-run and diffed key-by-key. Every pre-existing row is byte-identical on
# all three dirs; the only difference is the one new `filament:00-hero.png` key.
#
# WHY IT HAD TO EXIST. `lens` reports the ribbon's peak, FWHM and 10-90 edge.
# All three are magnitudes: they say how BRIGHT and how WIDE the cross-section is,
# and nothing about its FORM. A Gaussian of FWHM 30 and a flat-topped bar 30 px
# across with soft shoulders post the same FWHM and a similar 10-90 edge, and
# "flat-topped bar" is exactly what a textured quad looks like and exactly what an
# out-of-focus line does not. Round 7 rebuilt stage.js's streak from a
# frustum-spanning billboard into a 3-D segment; `lens` can confirm its width now
# varies (fwhm_max_over_min 1.37 -> 3.78 on the hero) but cannot say whether what
# varies is light or geometry.
#
# WHAT IT REPORTS: flattop = w90/w50 per station, a pure SHAPE ratio, invariant to
# scaling, dimming, blurring and widening. Gaussian 0.392, Lorentzian 0.333,
# defocus-disc chord ~0.5, hard slab -> 1.0.
#
# THE MASK IS GEOMETRIC AND CANNOT SEE THE STREAK'S COLOUR. The only selector is
# `_radon_ridge`'s luma>6 energy-vs-angle sum — the identical call `lens` already
# makes — and the profile is luma along a fixed-length straight perpendicular.
# Nothing keys on amber, on warmth, or on "brighter than background by X".
# mask_px reports the luma>6 population the ridge fit saw, so a changed mask is
# visible at a glance, as the rules require.
#
# THE CONTROL, AND IT PASSES ON BOTH PLATES INDEPENDENTLY. A statistic that
# separates light from geometry has to agree on two unrelated real photographs:
#   reference/plate-01.png                  n=21  flattop_p50 0.300  p90 0.500
#   reference/plate-02-highspeed-citrus.jpeg n=13 flattop_p50 0.286  p90 0.419
# Two different cameras, different subjects, different grades, both land on the
# Gaussian/Lorentzian value. That is the bar a rendered ribbon has to reach.
#
# AND WHAT I TRIED, FAILED TO VALIDATE, AND THEREFORE DID NOT SHIP — SO ROUND 8
# DOES NOT REPEAT IT. I first built a KINK detector into this probe: track the
# crest's perpendicular offset at each station and report the max residual about a
# straight-line fit, intending to measure the mitre joint that is plainly visible
# at 6x in shots/r7/00-hero.png near (350,323). It does not work and I killed it
# rather than quote it. Any bright object within the +/-26 px window steals the
# profile's argmax, and plate-01 is full of them, so the REFERENCE posted
# crest_resid_max 20.011 px against r7's 16.722 — the control scored worse than
# the render, which means the number measures debris density, not straightness.
# A per-third re-fit of the ridge angle fails for the same reason (plate-01's
# thirds return 23/45/71 deg because a third of that frame is dominated by fruit,
# not by the streak). A working kink detector needs the crest tracked by
# continuity from a seeded station rather than by per-station argmax. Not shipped.
#
# ── v6 -> v7 (round 7, fruit-geo) ────────────────────────────────────────────
# ⚠ LOUD NOTICE, AS THE RULES REQUIRE. I bumped PROBE_VERSION 6 -> 7.
#
# ADDED one command, `limb`. NO EXISTING PROBE'S EXECUTABLE CODE CHANGED BY ONE
# CHARACTER — clip, void, ring, silhouette, droplets, particles, tintlaw, lens,
# foam, collar and species are byte-identical to v6, PROBES and SUITE are
# untouched, and `_SPECIES_JS` (the node harness `species` runs) is untouched, so
# `limb` and `species` rasterise the SAME silhouettes from the SAME code.
# Verified rather than asserted: under v7, `suite shots/r5` reproduces every
# stored number (clip:05 5.227% mask 9490, ring:05 3.354 mask 3763,
# particles:15 n=67 medArea 4.0 meanSat 0.7982, particles:16 n=48 medArea 15.5
# meanSat 0.8103, foam:05 speck_cov 23.99, collar:05 mask 8314,
# silhouette:01 cv 0.1333 maxProt 28.38 mask 12139), and `species pose=ship n=24`
# reproduces the r6 verdict's column to the digit (7.73/10.92/10.18/2.55/2.90/
# 2.77, worst 2.55, median 5.31, tris 23212, star_multivalued_total 0).
# Bookkeeping, not an invalidation.
#
# ⚠ WHY IT HAD TO EXIST — THE r6 VERDICT SAYS SO, IN ITS OWN WORDS.
#
# The round-6 fruit-geo verdict ends: "elongation, boundary cv and the signature
# distance are all blind to CONCAVITY-vs-convexity and to appendage WIDTH, so
# 'no stem well' and 'crown leaves too thin' are not directly measurable today.
# I deliberately did NOT bump PROBE_VERSION for it ... Next round should add it
# on purpose." Its `fix` field then specifies the instrument exactly: "report per
# species the angular fraction of the boundary that is CONCAVE beyond 2% of mean
# radius, and the median angular WIDTH of every convex protrusion above a k<=3
# fit". This is that, verbatim, at the START of the round.
#
# It matters because the three species the verdict ranks last are the three whose
# identity is an APPENDAGE OR A CONCAVITY, and `species` cannot see the
# difference between an indentation and a bulge of the same magnitude:
# `boundary_cv` is |r - mean| and `_sig_dist` is an RMS, both sign-blind, and
# `elongation` is the k=2 harmonic alone. A crown of eight hairs and a crown of
# sixteen sword leaves can carry the same cv. Width and sign are what separate
# them, and neither was measurable.
#
# THE MASK IS THE SAME GEOMETRIC ONE `species` USES and cannot see colour at all:
# the rasterised triangle footprint, traced by `rays` radii from its own
# centroid. mask_px_median is reported per species exactly as `species` reports
# it, so a changed mask is visible at a glance and the two commands can be
# cross-checked against each other on the same build.
#
# THE BASELINE IS THE k<=3 FIT, NOT THE MEAN. A mean-relative residual calls the
# narrow end of any elongated fruit "concave" — the kiwi barrel would post 30%
# concavity while being convex everywhere. The DC + first three harmonics are
# exactly the gross-proportion terms round 6 authored (roundness, elongation,
# egg-shaped k=3 asymmetry); subtracting them leaves precisely the limb events
# round 7 is being asked for, and nothing else. Both statistics are therefore
# measured AGAINST what is already good, which is the only way this number can
# fall when a species regresses.
#
# WHAT IS REPORTED, per species, over the same pose set as `species`:
#   concave_frac_pct    median over poses of the % of the 360 boundary angles
#                       whose radius is more than `thr` (default 2%) of the mean
#                       radius BELOW the k<=3 fit. This is "is there a notch".
#   concave_depth_pct   median over poses of the deepest such shortfall.
#   protr_n             median over poses of the number of distinct convex runs
#                       more than `thr` ABOVE the fit. This is "how many points".
#   protr_width_deg     median angular width of every one of those runs, pooled
#                       over all poses. This is "are the leaves broad or hairs".
#   protr_height_pct    median peak height of those runs, in % of mean radius.
#   protr_width_p90_deg the broad tail, so a crown of 2 fat lobes and a crown of
#                       16 sword leaves are told apart by protr_n as well.
# A run that wraps the 0/360 seam is joined; a run shorter than one ray (1 deg)
# is still counted, because a hair IS the defect being measured and excluding it
# would be exactly the round-5 mistake this file exists to prevent.
#
# ⚠ AND A CONTROL, BECAUSE THE SPECIFIED STATISTIC IS GAMEABLE AND I CAUGHT IT
# BEING GAMED BY THE r6 BUILD ITSELF. `concave_frac_pct` is measured against a
# k<=3 FIT, and a fit is pulled upward by a narrow spike, which drops the fit
# ABOVE most of a perfectly convex body. Run on r6 as delivered it reports the
# kiwi — a convex barrel with no concavity anywhere — at 25.6%, and the apple,
# which the r6 verdict calls "a smooth 1.13 spheroid", at 43.5%, higher than the
# pineapple's crown. Shipped alone it would have let round 7 claim a win for
# doing nothing.
#
#   hull_concave_frac_pct / hull_concave_depth_pct  THE NUMBER TO TRUST.
#       Distance from the outline to its own CONVEX HULL, per ray, in % of mean
#       radius. That is what concavity IS: it has no baseline to be fooled by, it
#       is exactly zero on any convex outline at any elongation, and no spike
#       anywhere can make a convex region read as a notch. Same geometric mask,
#       same rays, same centroid.
# Quote both. They answer different questions and only one of them can be talked
# into a number it did not earn.
#
# COST ~6 s, same as `species`, and for the same reason it is NOT in SUITE:
# SUITE takes a shots dir and this takes none. Call it explicitly.
#
# ── v5 -> v6 (round 6 critic, cutter) ────────────────────────────────────────
# LOUD NOTICE, AS THE RULES REQUIRE. I bumped PROBE_VERSION 5 -> 6.
#
# ADDED one probe, `collar`, and appended one SUITE row. NO EXISTING PROBE'S
# EXECUTABLE CODE CHANGED BY ONE CHARACTER. The ONLY other edit in this commit is
# `probe_ring`'s DOCSTRING, which now says what its band actually is; its body is
# byte-identical and every stored `ring` number remains comparable. `suite
# shots/r5` under v6 reproduces every stored v5 number exactly (clip:05 5.227%
# mask 9490, ring:05 3.354 mask 3763, particles:15 n=67 medArea 4.0 meanSat
# 0.7982, particles:16 n=48 medArea 15.5 meanSat 0.8103, foam:05 speck_cov 23.99).
#
# WHY IT HAD TO EXIST — `ring` IS NOT MEASURING THE RING.
#
# Three rounds of cutter verdicts have turned on ONE property: is the pale pith
# collar a LIT SHELL or a DRAWN RING. `ring` is named for it and does not touch
# it. Its band is the annulus between the 0.55 and 0.7425 scaled second-moment
# ellipses of the largest luma component OF THE WHOLE FRAME — on 05-cut+500ms
# that component is BOTH melon halves plus the rind plus the juice bridging
# them. I rendered the mask (tools note: overlay band in cyan). On shots/r5 it is
# two horizontal stripes lying across the far half's flesh and the near half's
# lower rind; on shots/r6 it is a broad C over rind and background. Neither
# overlaps the collar at any angle. Its max/min is a whole-body shading number.
#
# Worse for comparison: because the band is keyed to a whole-frame ellipse, a
# change of POSE resizes it. r5 -> r6 the fitted ellipse went a=61.7/b=55.9 to
# a=60.6/b=38.9 and mask_px 3763 -> 5031, a 34% different region. The r5 3.354
# and the r6 3.619 are not measurements of the same set of surfaces.
#
# That is exactly why the r3, r4 and r5 critics each hand-rolled their own collar
# band (a min(RGB)>110 classifier, a G>R+8-gated geometric band, and a one-half
# ungated band) and reported 1.164, 3.95 and 1.35 for the same property. `collar`
# is that band, in the suite, callable by both sides, and colour-blind.
#
# ── v4 -> v5 (round 6 critic, fruit-mat) ─────────────────────────────────────
# ⚠ LOUD NOTICE, AS THE RULES REQUIRE. I bumped PROBE_VERSION 4 -> 5.
#
# ADDED one probe, `foam`. NO EXISTING PROBE'S CODE CHANGED BY ONE CHARACTER —
# clip, void, ring, silhouette, droplets, particles, tintlaw, lens and species
# are byte-identical to v4, PROBES and SUITE are untouched except for the two
# `foam` rows appended to SUITE, and `suite shots/r5` under v5 reproduces every
# stored v4/v3/v2/v1 number exactly (verified by diffing the full JSON of the
# 14 pre-existing rows: clip:05 5.227% mask 9490, ring:05 3.354 mask 3763,
# particles:15 n=67 medArea 4.0 meanSat 0.7982, particles:16 n=48 medArea 15.5
# meanSat 0.8103, lens/void/droplets/tintlaw all identical). Bookkeeping, not
# an invalidation.
#
# ⚠ WHY IT HAD TO EXIST — THE NAMED fruit-mat DEFECT IS INVISIBLE TO `clip`.
#
# The round-5 fruit-mat verdict names ONE defect and hands it forward: "the cut
# face is buried under a uniform field of clipped white foam pips — 13.6% of the
# core face against plate-01's 4.2%, 42% of them single-pixel, at (255,213,174)".
# The round-6 brief asks the round-6 critic three questions about it: are the
# pips FEWER, MORE VARIED, and UNCLIPPED.
#
# `clip` answers only the third, and only partly. It reports pct_R_ge_255 over a
# region, so a change that halves the pip COUNT while leaving the survivors just
# as clipped, and a change that leaves the count alone while pulling every pip to
# 254, both read as "clip moved" or "clip did not move" with no way to tell them
# apart. Worse, `clip`'s region is the second-moment ellipse of the LARGEST LUMA
# COMPONENT OF THE WHOLE FRAME, which on 05-cut+500ms is both melon halves plus
# the rind plus the juice bridging them — 30-34% of that region is green rind, so
# it is not the cut face and cannot be a cut-face pip statistic. That is why the
# r5 critic, the r5 builder and the r6 builder each hand-rolled a third ruler for
# this exact property (a windowed flesh CC, a `G<0.80R` mask, and an offline
# bench respectively) and reported 13.6%, 4.89% and 1.50% for the same thing.
#
# `foam` is that ruler, in the suite, callable by both sides.
#
# THE REGION IS GEOMETRIC AND CANNOT SEE COLOUR. Inside an EXPLICIT window (the
# docstring above permits "geometrically (or by an explicit region)"; the window
# is printed in the output so it can never drift silently), the subject is
# `largest_component(luma > floor)` — the same subject rule every other probe
# here uses — a second-moment ellipse is fitted to it, and the region is that
# ellipse SCALED BY `scale`, taken WHOLE. It is deliberately NOT intersected
# with the luma mask, so black seeds stay inside the denominator; a change that
# darkens the face cannot shrink its own region.
#
# TWO INDEPENDENT POPULATIONS ARE REPORTED, ON PURPOSE:
#
#   whitish_*  pixels with G > `wr`*R (default 0.75). This IS a colour test, and
#              it is legal here for the same reason `clip.pct_R_ge_255` is: it is
#              the reported STATISTIC, not the region. It reproduces the r5
#              verdict's definition so the handed-forward number is comparable.
#              But it is gameable — pull a pip to G = 0.74R and it vanishes from
#              the count with the confetti still on screen.
#
#   speck_*    THE COLOUR-BLIND CONTROL, and the number to trust. A pixel is a
#              speck if its luma exceeds the median luma of its own 7x7
#              neighbourhood by `sp` (default 18/255 in luma units). That is pure
#              local morphology: it asks "is this a bright dot smaller than the
#              filter", which is exactly what confetti IS, and it has no opinion
#              whatsoever about hue. A pip cannot escape it by changing colour,
#              only by becoming larger than the filter footprint or by ceasing to
#              be a local spike — i.e. only by actually being fixed.
#
# For each population: coverage %, connected-component count, median and max
# component area, fraction single-pixel, and p95/median area. Those are precisely
# the four questions ("fewer, more varied, unclipped") in measurable form.
#
# `flesh_mean_rgb` is the same region with the whitish pixels REMOVED, so the
# albedo can be read without the veil on top of it — the statistic that carried
# the whole of round 5's +4 ("the red channel matches the plate to 1.2%") and
# which nothing in the suite could otherwise confirm had held.
#
# WINDOWS ARE NOT PORTABLE AND MUST BE QUOTED. The default window is the lower
# melon half of a 640x360 05-cut+500ms frame and is valid for r5 and r6 (verified
# by rendering the mask). plate-01 needs `win=320:565:545:805`, the r5 critic's
# own plate window. ALWAYS quote the window and mask_px alongside the number.
#
# ── v3 -> v4 (round 6, fruit-geo) ────────────────────────────────────────────
# ⚠ LOUD NOTICE, AS THE RULES REQUIRE. I bumped PROBE_VERSION 3 -> 4.
#
# ADDED one command, `species`. NO EXISTING PROBE'S CODE CHANGED BY ONE
# CHARACTER — clip, void, ring, silhouette, droplets, particles, tintlaw and
# lens are byte-identical to v3, PROBES and SUITE are untouched, and
# `suite shots/r5` under v4 reproduces every stored v3/v2/v1 number exactly
# (verified, see rounds/reports/r6-fruit-geo.md: clip:05 5.227% mask 9490,
# particles:15 n=67 medArea 4.0 meanSat 0.7982, particles:16 n=48 medArea 15.5
# meanSat 0.8103). Bookkeeping, not an invalidation.
#
# ⚠ WHY IT HAD TO EXIST — THE METRIC THAT DECIDES THE GEOMETRY PIECE WAS NOT IN
# THE SUITE, SO EVERY PARTY BUILT ITS OWN.
#
# The r5 geometry verdict turns on ONE number: "the between-species silhouette
# distance is 0.91-1.18x the WITHIN-species distance", i.e. two views of one
# fruit differ as much as two different fruits. Nothing in this file could
# measure it. `silhouette` reads ONE fruit out of ONE delivered PNG, which is
# the right instrument for "is the shape reaching the frame" and structurally
# cannot answer "are the six species different from each other" — that question
# needs many poses of many species, and no delivered frame contains them.
# So the r3, r4 and r5 critics each hand-rolled a rasteriser, and the builder
# hand-rolled a fourth. Four rulers, and the one that mattered lived in
# tools/critic5/ where the next round could not run it.
#
# `species` is that ruler, in the suite, callable by both sides:
#
#     python3 tools/probes.py species                 # director's pose, n=24
#     python3 tools/probes.py species pose=so3 n=32   # the r5 critic's test
#
# It does NOT read a PNG. It builds the SHIPPING geometry (src/fruit/geometry.js
# via node — the same module main.js imports, no reimplementation), rasterises
# an orthographic silhouette per pose, and reports, per species: median
# elongation, boundary cv, triangle count, and
#     separation = median distance to the NEAREST OTHER species
#                  / median distance within the species itself
# Distance is flip-invariant RMS between mean-normalised 360-ray radial
# signatures, minimised over circular shift — the r5 critic's own definition,
# reimplemented independently and landing on their numbers (their SO(3) median
# elongations 1.363/1.208/1.222/1.225/1.094/1.867, this probe's on the same
# geometry 1.418/1.221/1.225/1.165/1.111/2.082).
#
# THE MASK IS GEOMETRIC AND CANNOT SEE COLOUR AT ALL: it is the rasterised
# footprint of the triangles, traced from its own centroid. mask_px is reported
# per species per pose as `mask_px_median`.
#
# TWO POSE DISTRIBUTIONS, AND THE DEFAULT IS `ship`, DELIBERATELY. The r5 critic
# sampled uniform SO(3). director.js:93 does not: it keeps local +Y within 0.49
# rad of the screen plane and rolls freely about it. Uniform SO(3) therefore
# measures a fruit the player never sees, and it under-reports every meridian
# feature. Both are provided because `so3` is the harsher bound and the only
# way to reproduce the stored r5 verdict; `ship` is what ships.
#
# COST: ~5 s for the default run (six meshes, 144 silhouettes, 3072 ray casts).
# It needs node and node_modules/three. It is NOT part of `suite` because
# `suite` takes a shots dir and this takes none — call it explicitly.
#
# ── v2 -> v3 (round 6, juice) ────────────────────────────────────────────────
# ADDED probe `tintlaw`. NO EXISTING PROBE'S CODE CHANGED — clip, void, ring,
# silhouette, droplets, particles and lens are byte-identical to v2, and
# `suite shots/r5` under v3 reproduces every stored v2/v1 number exactly
# (verified; see rounds/reports/r6-juice.md). Bookkeeping, not an invalidation.
#
# ⚠ WHY IT HAD TO EXIST — `particles.mean_saturation` IS BLIND, AND THIS IS THE
# SECOND TIME THIS SUITE HAS CAUGHT A MASK MEASURING SOMETHING OTHER THAN THE
# THING IT NAMES.
#
# The round-5/6 brief reports "size separation WORKS (fast medArea 4.0 px vs
# slow 15.5 px) and the COLOUR half does not (0.798 vs 0.810, indistinguishable)"
# and asks the juice builder to make the fast case achromatic. Run the SAME
# frozen probe on a frame that contains no juice at all:
#
#     particles shots/r5/12-idle-blade.png       -> mean_saturation 0.794
#     particles shots/r5/01-whole-watermelon.png -> mean_saturation 0.818
#     particles shots/r5/15-fast-flick+50ms.png  -> mean_saturation 0.798
#     particles shots/r5/16-slow-cleave+50ms.png -> mean_saturation 0.810
#
# The no-juice control sits BETWEEN the two measurements it is supposed to
# separate. `particles` masks on luma > 0.030, and on every one of those frames
# 96% of the mask is a dim warm wash at luma 0.03-0.06 — the blade streak's
# outer glow and the bloom skirt, mean RGB ~(19, 10, 3), saturation 0.82 — that
# belongs to stage.js and is present whether or not a single droplet exists.
# It outnumbers the resolved droplet pixels 24:1 and owns the unweighted mean
# outright. Stratifying that SAME mask by luma shows the droplets underneath it
# were never the problem:
#
#     15-fast  luma 0.12-0.25 meanSat 0.188 | 0.25-0.50 meanSat 0.056   (white)
#     16-slow  luma 0.12-0.25 meanSat 0.609 | 0.25-0.50 meanSat 0.375   (juice)
#
# So `tintlaw` measures the droplets and not the room they are in. Two changes
# from `particles`, both principled and neither keyed on colour:
#   (1) it measures per BLOB, not per pixel, so a 7000 px wash cannot outvote
#       60 droplets, and it weights each blob's saturation by that blob's own
#       luma so the blob's core decides rather than its antialiased skirt;
#   (2) it reports saturation SPLIT BY BLOB AREA, because REFERENCE_BAR R1b's
#       actual law is "tint must scale with droplet SIZE" — a within-frame
#       statement that no cross-frame scalar can test.
# Area is geometry and luma is brightness; neither is the saturation being
# measured, so the mask cannot exclude the defect.
#
# 12-idle-blade is in the SUITE as a permanent no-juice control. If a future
# colour number ever drifts toward the control's, the instrument is drifting.
#
# ── v1 -> v2 (round 6, stage) ────────────────────────────────────────────────
# ADDED probe `lens`. NO EXISTING PROBE'S CODE CHANGED — clip, void, ring,
# silhouette, droplets and particles are byte-identical to v1, and re-running
# `suite shots/r5` under v2 reproduces every stored v1 number exactly (verified;
# see rounds/reports/r6-stage.md). The bump is therefore bookkeeping, not an
# invalidation: every v1 number in an earlier verdict remains comparable.
#
# WHY IT WAS NEEDED. Round 5's headline stage defect — "the lens is per-object,
# so the ribbon and the sheet take CoC 0" — was not measurable by anything in
# the suite, so three consecutive critics each hand-rolled their own blob/edge
# detector for it. That is precisely the failure mode this file exists to end.
# `lens` measures ONE quantity for EVERY class in a frame: the 10-90 edge width
# of its boundary. Its masks are geometric — largest luma component for the
# subject, connected components split by AREA for drops vs sheet/strand, a Radon
# ridge for the blade/streak ribbon — and never keyed on the colour of the thing
# being judged.

# ── helpers ─────────────────────────────────────────────────────────────────

def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64)

def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

def largest_component(mask):
    """4-connected largest blob, iterative flood fill (no scipy dependency)."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best, best_n = None, 0
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            stack, comp = [(y0, x0)], []
            seen[y0, x0] = True
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(comp) > best_n:
                best_n, best = len(comp), comp
    out = np.zeros_like(mask, dtype=bool)
    if best:
        ys, xs = zip(*best)
        out[np.array(ys), np.array(xs)] = True
    return out

def components(mask, min_area=1):
    """All 8-connected components as lists of (y,x). Iterative."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    nbr = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            stack, comp = [(y0, x0)], []
            seen[y0, x0] = True
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for dy, dx in nbr:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(comp) >= min_area:
                out.append(comp)
    return out

def second_moment_ellipse(mask, scale=1.0):
    """
    Fit an ellipse to a binary mask by its second moments and return a boolean
    mask of that ellipse scaled by `scale`.

    This is GEOMETRIC and reproducible: given the same subject mask it yields
    the same region every time. The round-4/5 divergence came from re-deriving
    the subject mask per round with different colour thresholds; here the
    subject mask is always "everything above the void floor", which is a
    property of the frame, not of the thing being judged.
    """
    ys, xs = np.nonzero(mask)
    if len(ys) < 16:
        return np.zeros_like(mask, dtype=bool), None
    cy, cx = ys.mean(), xs.mean()
    y0, x0 = ys - cy, xs - cx
    cov = np.cov(np.stack([x0, y0]))
    evals, evecs = np.linalg.eigh(cov)
    order = np.argsort(evals)[::-1]
    evals, evecs = evals[order], evecs[:, order]
    a = 2.0 * math.sqrt(max(evals[0], 1e-9)) * scale
    b = 2.0 * math.sqrt(max(evals[1], 1e-9)) * scale
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w]
    dx, dy = xx - cx, yy - cy
    u = dx * evecs[0, 0] + dy * evecs[1, 0]
    v = dx * evecs[0, 1] + dy * evecs[1, 1]
    ell = (u / a) ** 2 + (v / b) ** 2 <= 1.0
    return ell, {"cx": float(cx), "cy": float(cy), "a": float(a), "b": float(b)}

def subject_mask(img, floor=8.0):
    """Everything above the void floor — a property of the frame, not of the subject."""
    return luma(img) > floor

# ── probes ──────────────────────────────────────────────────────────────────

def probe_clip(img, ref=None, scale=0.55, **kw):
    """
    Clipping on the cut face.

    MASK IS GEOMETRIC AND COLOUR-BLIND BY DESIGN. The failure this exists to
    catch — clipped white foam pips on red flesh — is invisible to any mask that
    selects "reddish" pixels, which is exactly how a previous probe reported
    4.89% when the honest figure was 14.07%.
    """
    subj = largest_component(subject_mask(img))
    ell, geom = second_moment_ellipse(subj, float(scale))
    region = ell & subj
    n = int(region.sum())
    if n == 0:
        return {"error": "empty region"}
    R, G, B = img[..., 0][region], img[..., 1][region], img[..., 2][region]
    return {
        "mask_px": n, "ellipse": geom, "scale": float(scale),
        "pct_R_ge_255": round(float((R >= 255).mean() * 100), 3),
        "pct_any_ge_255": round(float(((R >= 255) | (G >= 255) | (B >= 255)).mean() * 100), 3),
        "mean_rgb": [round(float(R.mean()), 1), round(float(G.mean()), 1), round(float(B.mean()), 1)],
        "GR_ratio": round(float(G.mean() / max(R.mean(), 1e-6)), 4),
        "darkest5pct_luma": round(float(np.percentile(luma(img)[region], 5)), 2),
    }

def probe_void(img, ref=None, corner=40, **kw):
    """Black-void discipline: corner luminance, blown fraction, median."""
    L = luma(img)
    c = int(corner)
    corners = [L[:c, :c].mean(), L[:c, -c:].mean(), L[-c:, :c].mean(), L[-c:, -c:].mean()]
    return {
        "mask_px": int(L.size),
        "corners": [round(float(x), 2) for x in corners],
        "corner_max": round(float(max(corners)), 2),
        "median_luma": round(float(np.median(L)), 2),
        "pct_blown_gt250": round(float((L > 250).mean() * 100), 4),
        "pct_exact_black": round(float((L == 0).mean() * 100), 2),
    }

def probe_silhouette(img, ref=None, floor=8.0, **kw):
    """Outline identity: bbox aspect, boundary variation, max protrusion."""
    subj = largest_component(subject_mask(img, float(floor)))
    ys, xs = np.nonzero(subj)
    if len(ys) < 16:
        return {"error": "no subject"}
    cy, cx = ys.mean(), xs.mean()
    rad = np.hypot(ys - cy, xs - cx)
    ang = np.arctan2(ys - cy, xs - cx)
    nb = 72
    bins = np.linspace(-math.pi, math.pi, nb + 1)
    idx = np.digitize(ang, bins) - 1
    prof = np.array([rad[idx == i].max() if (idx == i).any() else np.nan for i in range(nb)])
    prof = prof[~np.isnan(prof)]
    h = img.shape[0]
    return {
        "mask_px": int(subj.sum()),
        "bbox": [int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)],
        "aspect": round(float((xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1)), 4),
        "frame_height_pct": round(float(100 * (ys.max() - ys.min() + 1) / h), 2),
        "boundary_cv": round(float(prof.std() / prof.mean()), 4),
        "max_protrusion_pct": round(float(100 * (prof.max() - prof.mean()) / prof.mean()), 2),
    }

def probe_droplets(img, ref=None, floor=0.06, lo=12, hi=60, **kw):
    """
    Droplet shape population — the anti-self-similarity probe.

    Congruent shapes are the tell, so this measures the DISTRIBUTION: how well
    each blob fits a perfect ellipse (IoU) and how convex it is (solidity).
    A field of identical smooth lozenges scores high on both; real spray does not.
    """
    L = luma(img) / 255.0
    subj = largest_component(L > 0.06)
    mask = (L > float(floor)) & (~subj)
    comps = components(mask, min_area=int(lo))
    ious, sols, areas = [], [], []
    for comp in comps:
        ys = np.array([p[0] for p in comp]); xs = np.array([p[1] for p in comp])
        area = len(comp)
        if area > int(hi) * 40:
            continue
        areas.append(area)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        sub = np.zeros((y1 - y0 + 1, x1 - x0 + 1), dtype=bool)
        sub[ys - y0, xs - x0] = True
        ell, _ = second_moment_ellipse(sub, 1.0)
        if ell is None or ell.sum() == 0:
            continue
        inter = float((ell & sub).sum()); union = float((ell | sub).sum())
        ious.append(inter / max(union, 1))
        # solidity via bbox-fill proxy for the convex hull (hull-free, stable)
        sols.append(float(sub.sum()) / max(float(sub.shape[0] * sub.shape[1]), 1))
    if not ious:
        return {"mask_px": int(mask.sum()), "n_blobs": 0}
    ious = np.array(ious); sols = np.array(sols); areas = np.array(areas, dtype=float)
    return {
        "mask_px": int(mask.sum()), "n_blobs": int(len(ious)),
        "median_iou_to_ellipse": round(float(np.median(ious)), 4),
        "pct_iou_ge_090": round(float((ious >= 0.90).mean() * 100), 2),
        "pct_boxfill_ge_078": round(float((sols >= 0.78).mean() * 100), 2),
        "median_area_px": round(float(np.median(areas)), 2),
        "area_p95_over_median": round(float(np.percentile(areas, 95) / max(np.median(areas), 1)), 2),
    }

def probe_particles(img, ref=None, floor=0.030, **kw):
    """
    All-particle statistics for the fast-vs-slow test.

    Deliberately measures EVERY off-body particle pixel. A previous round's
    failure hid entirely inside a class the headline stat excluded, so this
    probe refuses to exclude anything except the fruit body itself.

    ⚠ CAVEAT ADDED IN v2, NO CODE CHANGED, NO STORED NUMBER AFFECTED.
    "The fruit body" here is `largest_component(L > 0.06)`, and on a frame with
    a live blade flare that component is NOT only the fruit: the stage streak
    touches the fruit and merges with it, so the streak's own pixels — and any
    mist sitting on top of the streak — are excluded as "body". That makes
    `particles` on 15-fast-flick sensitive to a change in stage.js that has
    nothing to do with fluid.js. Round 6 defocused the streak, which grew the
    merged component and took mask_px 9637 -> 1792 and mean_saturation
    0.7806 -> 0.6554 on an otherwise identical fluid.js. DO NOT read that as a
    juice regression. 16-slow-cleave is far less exposed to this (mask_px
    12360 -> 10429, mean_saturation 0.8185 -> 0.8386) because its flare is
    weaker, so the fast-vs-slow SPLIT is still meaningful; the absolute
    saturation on a flare frame is not comparable across a stage change.
    """
    L = luma(img) / 255.0
    subj = largest_component(L > 0.06)
    mask = (L > float(floor)) & (~subj)
    n = int(mask.sum())
    if n == 0:
        return {"mask_px": 0, "n_blobs": 0}
    px = img[mask]
    mx = px.max(axis=1); mn = px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    comps = components(mask, min_area=2)
    areas = np.array([len(c) for c in comps], dtype=float)
    return {
        "mask_px": n, "n_blobs": int(len(comps)),
        "median_blob_area": round(float(np.median(areas)), 2) if len(areas) else 0,
        "pct_blobs_ge_16px": round(float((areas >= 16).mean() * 100), 2) if len(areas) else 0,
        "mean_saturation": round(float(sat.mean()), 4),
        "pct_pixels_sat_ge_045": round(float((sat >= 0.45).mean() * 100), 2),
    }

def probe_tintlaw(img, ref=None, floor=0.06, small=6, large=16, **kw):
    """
    THE COLOUR LAW, measured on droplets instead of on the room they are in.

    REFERENCE_BAR R1b: "Tint must scale with droplet size: big beads transmit
    and take juice colour; small ones go achromatic and take the key light's
    colour." That is a WITHIN-FRAME statement about size, so this reports
    saturation split by blob AREA, and separately a blob-level frame mean that
    `particles.mean_saturation` cannot deliver (see the v2 -> v3 note at the top
    of this file: on these frames that statistic is 96% stage wash and reads
    0.794 on a frame containing no juice whatsoever).

    MASK, and why each cut is legal:
      - subject removed by `largest_component(L > 0.06)`, identical to every
        other probe here. Geometric.
      - luma floor `floor` (default 0.06, the same floor `droplets` uses).
        Brightness, not hue: it cannot exclude a droplet for being the wrong
        COLOUR, only for being invisible.
      - 8-connected components, min_area 2. Blobs, not pixels, so a large dim
        region cannot outvote a population of small bright ones.
      - each blob's saturation is its own luma-weighted mean, so the blob's
        core decides and its antialiased skirt (which sits on the background
        and takes the background's hue) does not.

    Small = area <= `small` px, large = area >= `large` px. Both are pure
    geometry.
    """
    L = luma(img) / 255.0
    subj = largest_component(L > 0.06)
    mask = (L > float(floor)) & (~subj)
    comps = components(mask, min_area=2)
    mx = img.max(axis=2); mn = img.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    lo_n, hi_n = int(small), int(large)
    s_small, s_large, wsum, wsat, areas = [], [], 0.0, 0.0, []
    for comp in comps:
        ys = np.array([p[0] for p in comp]); xs = np.array([p[1] for p in comp])
        w = L[ys, xs]; s = sat[ys, xs]
        tw = float(w.sum())
        v = float((s * w).sum() / max(tw, 1e-9))
        wsum += tw; wsat += v * tw
        areas.append(len(comp))
        if len(comp) <= lo_n:
            s_small.append(v)
        elif len(comp) >= hi_n:
            s_large.append(v)
    if not comps:
        return {"mask_px": int(mask.sum()), "n_blobs": 0}
    f = lambda a: round(float(np.mean(a)), 4) if a else None
    ss, sl = f(s_small), f(s_large)
    return {
        "mask_px": int(mask.sum()), "n_blobs": int(len(comps)),
        "n_small": len(s_small), "n_large": len(s_large),
        "sat_small": ss, "sat_large": sl,
        "sat_size_slope": (round(sl - ss, 4) if (ss is not None and sl is not None) else None),
        "sat_blob_mean": round(float(wsat / max(wsum, 1e-9)), 4),
        "median_blob_area": round(float(np.median(areas)), 2),
    }

def _local_median_luma(L, k=7):
    """Median of each pixel's k x k neighbourhood, by shifted stacking (no scipy)."""
    r = k // 2
    Lp = np.pad(L, r, mode="edge")
    h, w = L.shape
    stack = np.empty((k * k, h, w), dtype=L.dtype)
    i = 0
    for dy in range(k):
        for dx in range(k):
            stack[i] = Lp[dy:dy + h, dx:dx + w]
            i += 1
    return np.median(stack, axis=0)


def _blob_stats(mask, prefix):
    n = int(mask.sum())
    comps = components(mask, min_area=1)
    if not comps:
        return {prefix + "_cov_pct": 0.0, prefix + "_n": 0}
    ar = np.array([len(c) for c in comps], dtype=float)
    return {
        prefix + "_n": int(len(comps)),
        prefix + "_median_area": round(float(np.median(ar)), 2),
        prefix + "_max_area": int(ar.max()),
        prefix + "_pct_single_px": round(float((ar == 1).mean() * 100), 1),
        prefix + "_area_p95_over_median": round(float(np.percentile(ar, 95) / max(np.median(ar), 1)), 2),
    }


def probe_foam(img, ref=None, win="208:300:288:392", scale=0.80, floor=8.0,
               wr=0.75, sp=18.0, **kw):
    """
    FOAM PIPS ON THE CUT FACE: are they fewer, more varied, and unclipped?

    See the v4 -> v5 notice at the top of this file for why `clip` structurally
    cannot answer this and why three parties therefore hand-rolled three rulers.

    REGION — geometric, colour-blind, and printed:
      1. an EXPLICIT window (`win=y0:y1:x0:x1`), quoted in the output;
      2. inside it, subject = largest_component(luma > `floor`), the same subject
         rule every probe in this file uses;
      3. the second-moment ellipse of that subject, scaled by `scale`, taken
         WHOLE — NOT intersected with the luma mask, so dark seeds remain in the
         denominator and darkening the face cannot shrink its own region.

    POPULATIONS — two, deliberately:
      whitish_*  G > `wr`*R. A colour STATISTIC over a geometric region, exactly
                 as `clip.pct_R_ge_255` is. Reproduces the r5 verdict's
                 definition. Gameable by a hue nudge — see below.
      speck_*    COLOUR-BLIND CONTROL AND THE NUMBER TO TRUST. luma exceeds the
                 local 7x7 median luma by `sp`. Pure morphology: "a bright dot
                 smaller than the filter". Immune to hue, escapable only by the
                 pip genuinely getting larger or genuinely ceasing to be a spike.

    ⚠ KNOWN CONTAMINATION OF `whitish_cov_pct`, FOUND BY ITS FIRST USER AND LEFT
    IN DELIBERATELY. G > 0.75R is a RATIO, so it fires on any near-NEUTRAL pixel,
    including a dark shadow, not only on a bright pip. Darkening a face therefore
    RAISES whitish coverage while the confetti visibly disappears: on
    05-cut+500ms's upper melon half, r5 -> r6 reads whitish_cov_pct 7.13 -> 18.32
    with whitish_mean_rgb falling (149,131,98) -> (130,120,72) and speck_n
    108 -> 59, i.e. the coverage rose because the pixels got darker, not whiter.
    The definition is kept because it is the r5 verdict's, so its component
    statistics (whitish_n, _pct_single_px, _area_p95_over_median) stay
    comparable — but NEVER quote whitish_cov_pct as a foam number. Quote
    speck_cov_pct, which is what `speck` was put here for.

    `flesh_mean_rgb` is the region with whitish pixels removed — albedo without
    the veil sitting on it.
    """
    y0, y1, x0, x1 = [int(v) for v in str(win).split(":")]
    sub = img[y0:y1, x0:x1]
    L = luma(sub)
    m = largest_component(L > float(floor))
    ell, geom = second_moment_ellipse(m, float(scale))
    if geom is None:
        return {"error": "no subject in window"}
    region = ell                                  # WHOLE ellipse. Geometric.
    n = int(region.sum())
    if n < 64:
        return {"error": "region too small", "mask_px": n}
    R, G, B = sub[..., 0], sub[..., 1], sub[..., 2]
    whitish = (G > float(wr) * R) & (R > 40) & region
    speck = (L > _local_median_luma(L, 7) + float(sp)) & region
    clipped = (R >= 255) & region
    out = {
        "mask_px": n, "win": str(win), "scale": float(scale), "ellipse": geom,
        "whitish_cov_pct": round(float(whitish.sum() / n * 100), 2),
        "speck_cov_pct": round(float(speck.sum() / n * 100), 2),
        "pct_R_ge_255": round(float(clipped.sum() / n * 100), 3),
        "clipped_px": int(clipped.sum()),
        "pct_clipped_that_are_whitish": (round(float((clipped & whitish).sum() / max(int(clipped.sum()), 1) * 100), 1)
                                         if clipped.sum() else None),
    }
    out.update(_blob_stats(whitish, "whitish"))
    out.update(_blob_stats(speck, "speck"))
    fl = region & (~whitish)
    if fl.sum() > 16:
        out["flesh_mean_rgb"] = [round(float(R[fl].mean()), 1), round(float(G[fl].mean()), 1),
                                 round(float(B[fl].mean()), 1)]
        out["flesh_GR"] = round(float(G[fl].mean() / max(R[fl].mean(), 1e-6)), 4)
        out["flesh_n"] = int(fl.sum())
    if whitish.sum() > 0:
        out["whitish_mean_rgb"] = [round(float(R[whitish].mean()), 1), round(float(G[whitish].mean()), 1),
                                   round(float(B[whitish].mean()), 1)]
    Lr = L[region]
    out["pct_lum_le_25"] = round(float((Lr <= 25).mean() * 100), 2)
    out["med_over_p2"] = round(float(np.median(Lr) / max(np.percentile(Lr, 2), 1e-6)), 2)
    return out


def probe_collar(img, ref=None, win="208:300:288:392", floor=8.0, nray=180,
                 sectors=12, tmin=0.35, tmax=1.10, **kw):
    """
    PITH-COLLAR DIRECTIONAL RESPONSE, ON THE COLLAR. See the v5 -> v6 notice at
    the top of this file for why `ring` does not answer this and why every party
    has been hand-rolling a band for three rounds.

    REGION — explicit window, then pure radial morphology. NO COLOUR ANYWHERE.
      1. EXPLICIT window (`win=y0:y1:x0:x1`), quoted in the output, holding ONE
         half so two halves' orientations cannot masquerade as a gradient.
      2. subject = largest_component(luma > `floor`) — the same subject rule
         every probe here uses.
      3. `nray` rays from the subject CENTROID. Per ray the subject's own radius
         r_edge in that direction sets the scale, so the measurement is
         pose-adaptive without any per-round refitting by hand.
      4. Along each ray, in the FIXED radial window t in [`tmin`, 1.0] of r_edge
         (the inner 35% is excluded geometrically, to skip the face-centre
         specular; it is a constant, not a fit), take the RIDGE = the maximum of
         the luma profile.

    A ridge is "a bright band somewhere out near the edge of this half". That is
    what the collar IS, expressed as morphology. A collar cannot escape this by
    changing hue, only by genuinely ceasing to be a bright band at that angle.

    STATISTICS — the three claims in the round-5 verdict, each as a number:
      sector_ridge_luma / ridge_max_over_min   "the same BRIGHTNESS at every
          angle".  A lit shell swings; a drawn ring does not.
      ridge_width_px_* / ridge_width_cv        "the same WIDTH at every angle".
          Width is the run around the peak above (peak+base)/2, in pixels.
      ridge_t_cv                               does the band sit at a constant
          radial fraction (a stroked outline) or wander (a real edge seen at a
          varying obliquity).
      pct_R_ge_255 over the ridge pixels, so brightness cannot be bought back
          by clipping.

    ⚠ WINDOWS ARE NOT PORTABLE. The default is the LOWER (near) melon half of a
    640x360 05-cut+500ms frame and is valid for r5 and r6 (verified by rendering
    the mask). ALWAYS quote win and mask_px next to the number.
    """
    y0, y1, x0, x1 = [int(v) for v in str(win).split(":")]
    sub = img[y0:y1, x0:x1]
    L = luma(sub)
    m = largest_component(L > float(floor))
    ys, xs = np.nonzero(m)
    if len(ys) < 64:
        return {"error": "no subject in window", "win": str(win)}
    cy, cx = ys.mean(), xs.mean()
    r = np.hypot(ys - cy, xs - cx)
    ang = np.arctan2(ys - cy, xs - cx)
    h, w = L.shape
    nray, ns = int(nray), int(sectors)
    tmin, tmax = float(tmin), float(tmax)
    per_sector = [[] for _ in range(ns)]
    widths, tpeaks, ridge_px = [], [], []
    for k in range(nray):
        a = -math.pi + (k + 0.5) * 2 * math.pi / nray
        sel = np.abs(((ang - a + math.pi) % (2 * math.pi)) - math.pi) < (math.pi / nray)
        if not sel.any():
            continue
        r_edge = float(r[sel].max())
        if r_edge < 6:
            continue
        n = int(max(24, r_edge * tmax * 2))
        t = np.linspace(0.0, tmax, n)
        py = np.clip((cy + t * r_edge * math.sin(a)).astype(int), 0, h - 1)
        px = np.clip((cx + t * r_edge * math.cos(a)).astype(int), 0, w - 1)
        prof = L[py, px]
        zone = (t >= tmin) & (t <= 1.0)
        if zone.sum() < 4:
            continue
        zi = np.nonzero(zone)[0]
        j = zi[int(np.argmax(prof[zi]))]
        peak = float(prof[j])
        base = float(prof[zi].min())
        half = 0.5 * (peak + base)
        lo = j
        while lo > zi[0] and prof[lo - 1] >= half:
            lo -= 1
        hi = j
        while hi < zi[-1] and prof[hi + 1] >= half:
            hi += 1
        widths.append(float(hi - lo + 1) * (r_edge * tmax / n))
        tpeaks.append(float(t[j]))
        ridge_px.append((int(py[j]), int(px[j])))
        s = int((a + math.pi) / (2 * math.pi) * ns) % ns
        per_sector[s].append(peak)
    vals = [float(np.median(v)) for v in per_sector if len(v) > 1]
    if len(vals) < 4 or not widths:
        return {"error": "too few sectors", "win": str(win)}
    ryx = np.array(ridge_px)
    Rc = sub[..., 0][ryx[:, 0], ryx[:, 1]]
    wa = np.array(widths)
    ta = np.array(tpeaks)
    return {
        "mask_px": int(m.sum()), "win": str(win), "rays": len(widths),
        "centroid": [round(float(cx), 1), round(float(cy), 1)],
        "sector_ridge_luma": [round(v, 1) for v in vals],
        "ridge_max_over_min": round(float(max(vals) / max(min(vals), 1e-6)), 3),
        "sectors_populated": f"{len(vals)}/{ns}",
        "ridge_width_px_med": round(float(np.median(wa)), 2),
        "ridge_width_cv": round(float(wa.std() / max(wa.mean(), 1e-6)), 3),
        "ridge_t_med": round(float(np.median(ta)), 3),
        "ridge_t_cv": round(float(ta.std() / max(ta.mean(), 1e-6)), 3),
        "pct_R_ge_255": round(float((Rc >= 255).mean() * 100), 2),
    }


def probe_ring(img, ref=None, scale=0.55, sectors=12, **kw):
    """
    ⚠ NOT THE PITH COLLAR. See the v5 -> v6 notice at the top. This band is the
    annulus between two scaled second-moment ellipses of the LARGEST LUMA
    COMPONENT OF THE WHOLE FRAME, which on 05-cut+500ms is both melon halves,
    the rind and the juice bridging them. Rendering the mask shows it lands on
    rind and background and never touches the pale collar. It is a whole-body
    shading statistic. Use `collar` for the collar. Kept byte-identical below so
    every stored `ring` number remains comparable.

    A real collar catches the key on one arc and falls away on the other. The
    metric is max/min luminance across angular sectors of the ring band.
    """
    subj = largest_component(subject_mask(img))
    inner, geom = second_moment_ellipse(subj, float(scale))
    outer, _ = second_moment_ellipse(subj, float(scale) * 1.35)
    band = outer & (~inner) & subj
    if band.sum() < 32 or geom is None:
        return {"error": "no ring band"}
    L = luma(img)
    ys, xs = np.nonzero(band)
    ang = np.arctan2(ys - geom["cy"], xs - geom["cx"])
    ns = int(sectors)
    bins = np.linspace(-math.pi, math.pi, ns + 1)
    idx = np.digitize(ang, bins) - 1
    vals = [float(L[ys[idx == i], xs[idx == i]].mean()) for i in range(ns) if (idx == i).sum() > 3]
    if len(vals) < 4:
        return {"error": "too few sectors"}
    return {
        "mask_px": int(band.sum()),
        "sector_luma": [round(v, 1) for v in vals],
        "max_over_min": round(float(max(vals) / max(min(vals), 1e-6)), 3),
        "pct_R_ge_255": round(float((img[..., 0][band] >= 255).mean() * 100), 2),
    }

# ── lens ────────────────────────────────────────────────────────────────────
# One quantity, measured the same way for every class in the frame: the 10-90
# edge width of a boundary, in pixels, slope-normalised:
#
#       w10_90  =  0.8 * (peak - base) / max|d(profile)/dt|
#
# That form is scale-free in brightness, so a dim defocused thing and a bright
# sharp thing are directly comparable, and it is the same estimator the round-4
# and round-5 critics converged on independently.

def _edge_1090(prof):
    """10-90 edge width of a 1-D profile that rises from a base to a peak."""
    p = np.asarray(prof, dtype=np.float64)
    if p.size < 5:
        return None
    peak = p.max()
    base = p.min()
    amp = peak - base
    if amp < 4.0:                       # nothing to measure
        return None
    g = np.abs(np.diff(p))
    gm = g.max()
    if gm <= 1e-9:
        return None
    return float(0.8 * amp / gm)

def _radial_edges(img_l, ys, xs, nray=16, out=6.0):
    """
    Edge width of a blob's silhouette: sample `nray` rays from the centroid,
    each running from the centre out to `out` px beyond the blob's radius in
    that direction, and take the median 10-90 width. Geometric; the mask only
    supplies the centroid and the radius.
    """
    cy, cx = ys.mean(), xs.mean()
    r = np.hypot(ys - cy, xs - cx)
    ang = np.arctan2(ys - cy, xs - cx)
    h, w = img_l.shape
    widths = []
    for k in range(nray):
        a = -math.pi + (k + 0.5) * 2 * math.pi / nray
        sel = np.abs(((ang - a + math.pi) % (2 * math.pi)) - math.pi) < (math.pi / nray)
        rmax = r[sel].max() if sel.any() else r.max()
        n = int(max(8, (rmax + out) * 2))
        t = np.linspace(0.0, rmax + out, n)
        py = np.clip((cy + t * math.sin(a)).astype(int), 0, h - 1)
        px = np.clip((cx + t * math.cos(a)).astype(int), 0, w - 1)
        e = _edge_1090(img_l[py, px])
        if e is not None:
            widths.append(e)
    return widths

def _spearman(a, b):
    a = np.asarray(a, dtype=np.float64); b = np.asarray(b, dtype=np.float64)
    if a.size < 6:
        return None
    ra = np.argsort(np.argsort(a)).astype(np.float64)
    rb = np.argsort(np.argsort(b)).astype(np.float64)
    ra -= ra.mean(); rb -= rb.mean()
    d = math.sqrt(float((ra * ra).sum()) * float((rb * rb).sum()))
    return round(float((ra * rb).sum() / d), 4) if d > 0 else None

def _radon_ridge(L, step=1.0):
    """
    Find the dominant STRAIGHT BRIGHT LINE in the frame — the blade/streak
    ribbon — without knowing its colour, position or angle.

    For each angle theta, bin every pixel by its perpendicular coordinate
    u = x cos t + y sin t and sum luma into that bin. A long thin ribbon puts
    all of its energy into one u-bin at the angle perpendicular to it, and the
    sum over a frame-spanning line beats any compact object, which can only
    contribute over a chord. Returns (theta, u0) or None.
    """
    h, w = L.shape
    yy, xx = np.mgrid[0:h, 0:w]
    xf = xx.ravel().astype(np.float64) - w / 2.0
    yf = yy.ravel().astype(np.float64) - h / 2.0
    lf = L.ravel()
    keep = lf > 6.0
    xf, yf, lf = xf[keep], yf[keep], lf[keep]
    if lf.size < 64:
        return None
    R = math.hypot(w, h) / 2.0 + 2
    nb = int(2 * R) + 1
    best = (-1.0, 0.0, 0.0)
    for deg in np.arange(0.0, 180.0, step):
        t = math.radians(deg)
        u = xf * math.cos(t) + yf * math.sin(t)
        idx = np.clip((u + R).astype(np.int64), 0, nb - 1)
        s = np.bincount(idx, weights=lf, minlength=nb)
        # a 3-bin box: the ribbon is a few px wide, so its energy straddles bins
        s3 = s.copy()
        s3[1:-1] = s[:-2] + s[1:-1] + s[2:]
        j = int(np.argmax(s3))
        if s3[j] > best[0]:
            best = (float(s3[j]), t, float(j) - R)
    return best[1], best[2]

def probe_lens(img, ref=None, floor=8.0, drop_max_area=200, nline=9, halfw=26, **kw):
    """
    IS THERE A LENS ON THE FRAME, OR ONLY ON THE OBJECTS THAT OPTED IN?

    Reports the 10-90 edge width of every class in one frame:

      subject  the largest luma component — the in-focus reference
      drops    off-subject components under `drop_max_area` px
      sheet    off-subject components at or over `drop_max_area` px (the juice
               sheet, strands, ligaments — anything that is not a bead)
      ribbon   the dominant straight bright line (blade trail / streak),
               profiled perpendicular at `nline` positions along its length

    A frame with a real lens shows: ribbon and sheet edge widths in the same
    range as the drops of comparable depth, ribbon FWHM/peak VARYING along its
    length, and spearman(diameter, edge) > 0 with spearman(diameter, peak) <= 0
    (a defocused point spreads at constant total energy, so bigger => dimmer).

    A frame whose lens is per-object shows a ribbon of constant width, constant
    edge and constant peak from one frame edge to the other.
    """
    L = luma(img)
    h, w = L.shape
    subj = largest_component(L > float(floor))
    out = {"mask_px": int(subj.sum()), "shape": [int(w), int(h)]}

    ys, xs = np.nonzero(subj)
    if len(ys) >= 64:
        we = _radial_edges(L, ys, xs)
        out["subject"] = {
            "area_px": int(subj.sum()),
            "edge_1090_p50": round(float(np.median(we)), 3) if we else None,
            "rays": len(we),
        }

    # ── drops and sheet ──────────────────────────────────────────────────────
    off = (L > float(floor)) & (~subj)
    comps = components(off, min_area=8)
    drops, sheet = [], []
    for comp in comps:
        cy = np.array([p[0] for p in comp]); cx = np.array([p[1] for p in comp])
        area = len(comp)
        we = _radial_edges(L, cy, cx)
        if not we:
            continue
        rec = {
            "area": area,
            "diam": 2.0 * math.sqrt(area / math.pi),
            "edge": float(np.median(we)),
            "peak": float(L[cy, cx].max()),
        }
        (drops if area < int(drop_max_area) else sheet).append(rec)

    def summarise(rows, name):
        if not rows:
            return {"n": 0}
        d = np.array([r["diam"] for r in rows]); e = np.array([r["edge"] for r in rows])
        pk = np.array([r["peak"] for r in rows]); ar = np.array([r["area"] for r in rows])
        o = {
            "n": len(rows),
            "median_area_px": round(float(np.median(ar)), 1),
            "edge_1090_p50": round(float(np.median(e)), 3),
            "edge_1090_p90": round(float(np.percentile(e, 90)), 3),
            "peak_p50": round(float(np.median(pk)), 1),
        }
        if len(rows) >= 6:
            o["spearman_diam_edge"] = _spearman(d, e)
            o["spearman_diam_peak"] = _spearman(d, pk)
        return o

    out["drops"] = summarise(drops, "drops")
    out["sheet"] = summarise(sheet, "sheet")

    # ── the ribbon ───────────────────────────────────────────────────────────
    found = _radon_ridge(L)
    if found is None:
        out["ribbon"] = {"found": False}
        return out
    t, u0 = found
    ct, st = math.cos(t), math.sin(t)
    # along-line unit vector is perpendicular to (ct, st)
    ax, ay = -st, ct
    # the segment of the line inside the frame
    ts = np.linspace(-math.hypot(w, h) / 2.0, math.hypot(w, h) / 2.0, 4096)
    px = w / 2.0 + u0 * ct + ts * ax
    py = h / 2.0 + u0 * st + ts * ay
    inside = (px >= 1) & (px < w - 1) & (py >= 1) & (py < h - 1)
    if inside.sum() < 32:
        out["ribbon"] = {"found": False}
        return out
    tin = ts[inside]
    hw = int(halfw)
    uu = np.arange(-hw, hw + 1, dtype=np.float64)
    peaks, fwhms, edges, pos = [], [], [], []
    for k in range(int(nline)):
        tk = tin[0] + (tin[-1] - tin[0]) * (k + 0.5) / int(nline)
        cxk = w / 2.0 + u0 * ct + tk * ax
        cyk = h / 2.0 + u0 * st + tk * ay
        sx = np.clip((cxk + uu * ct).astype(int), 0, w - 1)
        sy = np.clip((cyk + uu * st).astype(int), 0, h - 1)
        prof = L[sy, sx]
        pk = float(prof.max()); base = float(np.median(prof[:5].tolist() + prof[-5:].tolist()))
        peaks.append(round(pk, 1))
        pos.append([int(round(cxk)), int(round(cyk))])
        half = base + 0.5 * (pk - base)
        fw = int((prof >= half).sum())
        fwhms.append(fw)
        # 10-90 on the rising flank only: split the profile at the peak
        j = int(np.argmax(prof))
        e1 = _edge_1090(prof[:j + 1]) if j >= 4 else None
        e2 = _edge_1090(prof[j:][::-1]) if (len(prof) - j) >= 5 else None
        cand = [x for x in (e1, e2) if x is not None]
        edges.append(round(float(np.median(cand)), 3) if cand else None)
    ev = [e for e in edges if e is not None]
    out["ribbon"] = {
        "found": True,
        "angle_deg": round(math.degrees(t), 2),
        "offset_px": round(float(u0), 1),
        "span_px": int(inside.sum() * (math.hypot(w, h) / 4096.0)),
        "samples": pos,
        "peak": peaks,
        "fwhm": fwhms,
        "edge_1090": edges,
        "peak_min": round(float(min(peaks)), 1),
        "peak_max": round(float(max(peaks)), 1),
        "fwhm_max_over_min": round(float(max(fwhms) / max(min(fwhms), 1)), 3),
        "edge_max_over_min": (round(float(max(ev) / max(min(ev), 1e-6)), 3) if len(ev) >= 2 else None),
        "edge_1090_p50": (round(float(np.median(ev)), 3) if ev else None),
    }
    return out


def probe_filament(img, ref=None, floor=8.0, nline=25, halfw=26,
                   min_fwhm=5, min_amp=8.0, **kw):
    """
    IS THAT RIBBON LIGHT, OR IS IT A SLAB? — see the v7 -> v8 notice.

    Same ridge as `lens` (`_radon_ridge`: geometric, colour-blind, the identical
    call), the same perpendicular window, but `nline` = 25 stations instead of 9.
    Reports ONE statistic `lens` cannot form, the perpendicular profile's SHAPE:

      flattop  per station, w90 / w50 — the width at 90% of the profile's
               amplitude over the width at 50% (the FWHM). This is a pure shape
               ratio: it does not move when the ribbon is scaled, dimmed, blurred
               or widened, only when its cross-section changes FORM.
                 Gaussian            0.392
                 Lorentzian          0.333
                 defocus-disc chord  ~0.5
                 hard-edged slab     -> 1.0
    Stations with FWHM < `min_fwhm` px or amplitude < `min_amp` are DROPPED, and
    `n` says how many survived: at FWHM 1-2 px, w90 and w50 are the same one or
    two pixels and the ratio is 1.0 by discretisation alone, which would be a
    fake slab reading. `fwhm` and `samples` are reported per station so a dropped
    or contaminated station is visible.
    """
    L = luma(img)
    h, w = L.shape
    out = {"mask_px": int((L > 6.0).sum()), "shape": [int(w), int(h)]}
    found = _radon_ridge(L)
    if found is None:
        out["found"] = False
        return out
    t, u0 = found
    ct, st = math.cos(t), math.sin(t)
    ax, ay = -st, ct
    ts = np.linspace(-math.hypot(w, h) / 2.0, math.hypot(w, h) / 2.0, 4096)
    px = w / 2.0 + u0 * ct + ts * ax
    py = h / 2.0 + u0 * st + ts * ay
    inside = (px >= 1) & (px < w - 1) & (py >= 1) & (py < h - 1)
    if inside.sum() < 32:
        out["found"] = False
        return out
    tin = ts[inside]
    hw = int(halfw)
    uu = np.arange(-hw, hw + 1, dtype=np.float64)
    flat, pos, fwhms = [], [], []
    for k in range(int(nline)):
        tk = tin[0] + (tin[-1] - tin[0]) * (k + 0.5) / int(nline)
        cxk = w / 2.0 + u0 * ct + tk * ax
        cyk = h / 2.0 + u0 * st + tk * ay
        sx = np.clip((cxk + uu * ct).astype(int), 0, w - 1)
        sy = np.clip((cyk + uu * st).astype(int), 0, h - 1)
        prof = L[sy, sx]
        pk = float(prof.max())
        base = float(np.median(prof[:5].tolist() + prof[-5:].tolist()))
        amp = pk - base
        pos.append([int(round(cxk)), int(round(cyk))])
        w50 = int((prof >= base + 0.5 * amp).sum()) if amp > 0 else 0
        fwhms.append(w50)
        if amp < float(min_amp) or w50 < int(min_fwhm):
            flat.append(None)
            continue
        w90 = int((prof >= base + 0.9 * amp).sum())
        flat.append(round(float(w90) / float(w50), 3))
    out.update({
        "found": True,
        "angle_deg": round(math.degrees(t), 2),
        "span_px": int(inside.sum() * (math.hypot(w, h) / 4096.0)),
        "samples": pos,
        "fwhm": fwhms,
        "flattop": flat,
    })
    fv = [x for x in flat if x is not None]
    out["n"] = len(fv)
    if fv:
        out["flattop_p50"] = round(float(np.median(fv)), 3)
        out["flattop_p90"] = round(float(np.percentile(fv, 90)), 3)
    return out


def probe_glare(img, ref=None, nline=25, halfw=40, min_amp=12.0, **kw):
    """
    WHAT IS THE CUSP SITTING ON? — the skirt half of `filament`. See the v8 -> v9
    notice at the top of this file.

    Same ridge as `lens` and `filament` (`_radon_ridge`: geometric, colour-blind,
    the identical call), the same perpendicular window, `nline` stations. Reports
    the cross-section's TAIL shape, which `filament`'s w90/w50 cannot see:

      u20_u50   offset at 20% of amplitude / offset at 50%
      u05_u50   offset at  5% of amplitude / offset at 50%

    Pure shape ratios — invariant to the ribbon's width, brightness and blur.
      hard slab 1.00/1.00 · disc chord ~1.06/1.10 · Gaussian 1.52/2.08 ·
      Lorentzian 2.00/4.36 · a narrow cusp on a wide plateau inflates u05_u50
      without limit, because u50 collapses onto the cusp while u05 stays out on
      the plateau's edge.
    CONTROL, both plates, independently: plate-01 1.479/1.970,
    plate-02-highspeed-citrus 1.336/1.462.

    Crossings are taken FIRST-outward from the peak on each side, so a bright
    speck parked in the wing cannot manufacture a tail. `n` reports how many of
    the up-to-2*nline crossings were formed.
    """
    L = luma(img)
    h, w = L.shape
    out = {"mask_px": int((L > 6.0).sum()), "shape": [int(w), int(h)]}
    found = _radon_ridge(L)
    if found is None:
        out["found"] = False
        return out
    t, u0 = found
    ct, st = math.cos(t), math.sin(t)
    ax, ay = -st, ct
    ts = np.linspace(-math.hypot(w, h) / 2.0, math.hypot(w, h) / 2.0, 4096)
    px = w / 2.0 + u0 * ct + ts * ax
    py = h / 2.0 + u0 * st + ts * ay
    inside = (px >= 1) & (px < w - 1) & (py >= 1) & (py < h - 1)
    if inside.sum() < 32:
        out["found"] = False
        return out
    tin = ts[inside]
    hw = int(halfw)
    uu = np.arange(-hw, hw + 1, dtype=np.float64)

    def crossing(side, thr):
        for i in range(len(side)):
            if side[i] < thr:
                if i == 0:
                    return None
                a0, a1 = float(side[i - 1]), float(side[i])
                return (i - 1) + (a0 - thr) / max(a0 - a1, 1e-6)
        return None

    r20, r05, pos, stations = [], [], [], []
    for k in range(int(nline)):
        tk = tin[0] + (tin[-1] - tin[0]) * (k + 0.5) / int(nline)
        cxk = w / 2.0 + u0 * ct + tk * ax
        cyk = h / 2.0 + u0 * st + tk * ay
        sx = np.clip((cxk + uu * ct).astype(int), 0, w - 1)
        sy = np.clip((cyk + uu * st).astype(int), 0, h - 1)
        prof = L[sy, sx]
        pos.append([int(round(cxk)), int(round(cyk))])
        base = float(np.median(np.concatenate([prof[:6], prof[-6:]])))
        amp = float(prof.max()) - base
        if amp < float(min_amp):
            stations.append(None)
            continue
        j = int(np.argmax(prof))
        got = []
        for side in (prof[j:], prof[:j + 1][::-1]):
            u50 = crossing(side, base + 0.50 * amp)
            if u50 is None or u50 < 1.0:
                continue
            u20 = crossing(side, base + 0.20 * amp)
            u05 = crossing(side, base + 0.05 * amp)
            if u20 is not None:
                r20.append(u20 / u50)
            if u05 is not None:
                r05.append(u05 / u50)
                got.append(u05 / u50)
        stations.append(round(float(np.median(got)), 3) if got else None)
    out.update({
        "found": True,
        "angle_deg": round(math.degrees(t), 2),
        "span_px": int(inside.sum() * (math.hypot(w, h) / 4096.0)),
        "samples": pos,
        "u05_u50_per_station": stations,
        "n20": len(r20),
        "n05": len(r05),
    })
    if r20:
        out["u20_u50_p50"] = round(float(np.median(r20)), 3)
    if r05:
        out["u05_u50_p50"] = round(float(np.median(r05)), 3)
        out["u05_u50_p90"] = round(float(np.percentile(r05, 90)), 3)
    return out


PROBES = {
    "clip": probe_clip, "void": probe_void, "silhouette": probe_silhouette,
    "droplets": probe_droplets, "particles": probe_particles, "ring": probe_ring,
    "lens": probe_lens, "tintlaw": probe_tintlaw, "foam": probe_foam,
    "collar": probe_collar, "filament": probe_filament,
    "glare": probe_glare,
}

# ─────────────────────────────────────────────────────────────────────────────
# `species` — BETWEEN-SPECIES vs WITHIN-SPECIES SILHOUETTE SEPARATION.
#
# The only probe here that does not read a PNG. See the v3 -> v4 notice at the
# top for why it exists and why it is not in SUITE.
#
# The JS below runs under node against the REAL src/fruit/geometry.js, so it can
# never drift from what ships. It does three things and nothing else:
#   1. builds each species at `detail`,
#   2. rasterises an orthographic silhouette per pose (geometric mask: the
#      triangle footprint, filled by scanline; nothing here has a colour),
#   3. traces `rays` radii from the mask CENTROID and returns them in world
#      units, plus the mask pixel count and the triangle count.
# All statistics are done in python below, so the definition of "distance" is
# reviewable in one place.
#
# It also ray-casts the shell from the origin in `star` Fibonacci directions and
# reports how many are hit more than once. That is the cutter.js precondition
# ("every cross-section star-shaped about the origin or cutter.js breaks") and
# it has never been checked by anything. A non-zero `star_bad` is a BUG, not a
# score: it means a cut through that fruit can produce an unsealed or inverted
# cap. Hits within 1e-4 relative t of each other are one hit (a ray through a
# shared edge legitimately reports two).
# ─────────────────────────────────────────────────────────────────────────────
_SPECIES_JS = r'''
const A = Object.fromEntries(process.argv.slice(1).filter(s=>s.includes('=')).map(s=>s.split('=')));
// `src=` exists ONLY so a baseline can be re-derived rather than quoted. Default
// is the shipping module. tools/geometry-r5-snapshot.js is a verified
// reconstruction of the round-5 table (see its header) so that r5 -> r6 deltas
// are reproducible by anyone, on this code, in one command.
const { makeFruitGeometry } = await import('./' + (A.src || 'src/fruit/geometry.js'));
const POSE=A.pose||'ship', NO=+(A.n||24), RES=+(A.res||256), RAYS=+(A.rays||360);
const DET=+(A.detail||11), STAR=+(A.star||512);
// species.radius is data owned by species.js; mirrored here as a literal so the
// probe does not have to import the whole material file (which needs three/tsl).
const RAD={watermelon:1.55,orange:0.95,kiwi:0.78,apple:0.92,strawberry:0.62,pineapple:1.35};
const IDS=Object.keys(RAD);
const halton=(i,b)=>{let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;};
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
                   a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const qmat=q=>{const[x,y,z,w]=q;return[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),
  2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)];};
// director.js:93 — local +Y within 0.49 rad of the screen plane, free roll.
function shipQuat(i){
  const az=halton(i+1,2)*Math.PI*2, ti=(halton(i+1,3)*2-1)*0.49, ro=halton(i+1,5)*Math.PI*2;
  const ax=Math.cos(az)*Math.cos(ti), ay=Math.sin(az)*Math.cos(ti), azz=Math.sin(ti);
  let q=[azz,0,-ax,1+ay]; const n=Math.hypot(q[0],q[1],q[2],q[3]); q=q.map(v=>v/n);
  return qmul(q,[0,Math.sin(ro/2),0,Math.cos(ro/2)]);
}
function so3Quat(i){
  const u1=halton(i+1,2),u2=halton(i+1,3),u3=halton(i+1,5);
  const s1=Math.sqrt(1-u1), s2=Math.sqrt(u1);
  return [s1*Math.sin(2*Math.PI*u2),s1*Math.cos(2*Math.PI*u2),s2*Math.sin(2*Math.PI*u3),s2*Math.cos(2*Math.PI*u3)];
}
function silhouette(pos,m){
  const n=pos.length/3, X=new Float64Array(n), Y=new Float64Array(n);
  let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
  for(let i=0;i<n;i++){const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];
    const px=m[0]*x+m[1]*y+m[2]*z, py=m[3]*x+m[4]*y+m[5]*z; X[i]=px;Y[i]=py;
    if(px<mnx)mnx=px; if(px>mxx)mxx=px; if(py<mny)mny=py; if(py>mxy)mxy=py;}
  const cx=(mnx+mxx)/2, cy=(mny+mxy)/2, half=Math.max(mxx-mnx,mxy-mny)/2*1.04, sc=(RES/2)/half;
  const mask=new Uint8Array(RES*RES);
  for(let t=0;t<n;t+=3){
    const P=[0,1,2].map(k=>[(X[t+k]-cx)*sc+RES/2,(Y[t+k]-cy)*sc+RES/2]);
    const ylo=Math.max(0,Math.floor(Math.min(P[0][1],P[1][1],P[2][1])));
    const yhi=Math.min(RES-1,Math.ceil(Math.max(P[0][1],P[1][1],P[2][1])));
    for(let yy=ylo;yy<=yhi;yy++){
      const py=yy+0.5, xs=[];
      for(let e=0;e<3;e++){const a=P[e],b=P[(e+1)%3];
        if((a[1]<=py&&b[1]>py)||(b[1]<=py&&a[1]>py)) xs.push(a[0]+(py-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
      if(xs.length<2) continue; xs.sort((p,q)=>p-q);
      const xa=Math.max(0,Math.ceil(xs[0]-0.5)), xb=Math.min(RES-1,Math.floor(xs[xs.length-1]-0.5));
      for(let xx=xa;xx<=xb;xx++) mask[yy*RES+xx]=1;
    }
  }
  let sx=0,sy=0,cnt=0;
  for(let yy=0;yy<RES;yy++) for(let xx=0;xx<RES;xx++) if(mask[yy*RES+xx]){sx+=xx;sy+=yy;cnt++;}
  if(!cnt) return null;
  sx/=cnt; sy/=cnt;
  const sig=new Array(RAYS);
  for(let k=0;k<RAYS;k++){
    const a=k/RAYS*Math.PI*2, ca=Math.cos(a), sa=Math.sin(a); let last=0;
    for(let r=0;r<RES;r+=0.5){
      const xx=Math.round(sx+ca*r), yy=Math.round(sy+sa*r);
      if(xx<0||yy<0||xx>=RES||yy>=RES) break;
      if(mask[yy*RES+xx]) last=r;
    }
    sig[k]=last/sc;
  }
  return {sig, mask_px:cnt};
}
function starBad(pos,nDir){
  let bad=0;
  for(let d=0;d<nDir;d++){
    const z=1-2*(d+0.5)/nDir, rr=Math.sqrt(Math.max(0,1-z*z)), th=Math.PI*(1+Math.sqrt(5))*d;
    const dx=rr*Math.cos(th), dy=rr*Math.sin(th), dz=z; const ts=[];
    for(let t=0;t<pos.length;t+=9){
      const ax=pos[t],ay=pos[t+1],az=pos[t+2];
      const e1x=pos[t+3]-ax,e1y=pos[t+4]-ay,e1z=pos[t+5]-az;
      const e2x=pos[t+6]-ax,e2y=pos[t+7]-ay,e2z=pos[t+8]-az;
      const px=dy*e2z-dz*e2y, py=dz*e2x-dx*e2z, pz=dx*e2y-dy*e2x;
      const det=e1x*px+e1y*py+e1z*pz; if(Math.abs(det)<1e-15) continue;
      const inv=1/det, tx=-ax,ty=-ay,tz=-az;
      const u=(tx*px+ty*py+tz*pz)*inv; if(u<0||u>1) continue;
      const qx=ty*e1z-tz*e1y, qy=tz*e1x-tx*e1z, qz=tx*e1y-ty*e1x;
      const v=(dx*qx+dy*qy+dz*qz)*inv; if(v<0||u+v>1) continue;
      const tt=(e2x*qx+e2y*qy+e2z*qz)*inv; if(tt<=1e-9) continue;
      ts.push(tt);
    }
    if(ts.length!==1){ ts.sort((a,b)=>a-b);
      if((ts[ts.length-1]-ts[0])/ts[ts.length-1] > 1e-4) bad++; }
  }
  return bad;
}
const out={pose:POSE, n:NO, res:RES, rays:RAYS, detail:DET, star_dirs:STAR, species:{}};
for(const id of IDS){
  const g=makeFruitGeometry({id, radius:RAD[id]}, DET);
  const pos=g.getAttribute('position').array;
  const poses=[];
  for(let i=0;i<NO;i++) poses.push(silhouette(pos, qmat(POSE==='so3'?so3Quat(i):shipQuat(i))));
  out.species[id]={tris:pos.length/9, star_bad:STAR>0?starBad(pos,STAR):null, poses};
}
process.stdout.write(JSON.stringify(out));
'''


def _sig_stats(sig, rays):
    a = np.asarray(sig, float)
    th = np.arange(rays) / rays * 2 * np.pi
    c2 = float((a * np.cos(2 * th)).mean()) * 2
    s2 = float((a * np.sin(2 * th)).mean()) * 2
    m = float(a.mean()); amp = math.hypot(c2, s2)
    elong = (m + amp) / (m - amp) if m > amp else float("inf")
    return elong, float(a.std() / m)


def _sig_dist(a, B, rays):
    """flip-invariant RMS between two mean-normalised signatures, minimised over
    circular shift. Correlation via FFT so the shift search is exact and cheap."""
    A = np.fft.rfft(a); aa = float((a * a).sum())
    best = float("inf")
    for b in B:
        for bb in (b, np.roll(b[::-1], 1)):
            cc = np.fft.irfft(A * np.conj(np.fft.rfft(bb)), rays)
            r2 = aa + float((bb * bb).sum()) - 2 * cc
            v = math.sqrt(max(0.0, float(r2.min())) / rays)
            if v < best: best = v
    return best


def probe_species(**kw):
    import subprocess, os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    args = [f"{k}={v}" for k, v in kw.items()]
    p = subprocess.run(["node", "--input-type=module", "-e", _SPECIES_JS, "--", *args],
                       cwd=root, capture_output=True, text=True)
    if p.returncode != 0 or not p.stdout.strip():
        return {"error": "node failed", "stderr": p.stderr[-600:]}
    d = json.loads(p.stdout)
    rays = d["rays"]; ids = list(d["species"])
    S = {k: np.array([np.asarray(p_["sig"], float) / np.mean(p_["sig"]) for p_ in d["species"][k]["poses"]])
         for k in ids}
    out = {"probe_version": PROBE_VERSION, "pose": d["pose"], "poses_per_species": d["n"],
           "res": d["res"], "rays": rays, "detail": d["detail"], "species": {}}
    ratios = []; tris = 0; starbad = 0
    for k in ids:
        raw = [p_["sig"] for p_ in d["species"][k]["poses"]]
        el = [_sig_stats(s, rays)[0] for s in raw]
        cvv = [_sig_stats(s, rays)[1] for s in raw]
        n = len(S[k])
        win = float(np.median([_sig_dist(S[k][i], np.delete(S[k], i, 0), rays) for i in range(n)]))
        bet = {j: float(np.median([_sig_dist(S[k][i], S[j], rays) for i in range(n)]))
               for j in ids if j != k}
        who = min(bet, key=bet.get)
        ratio = bet[who] / win if win > 0 else float("inf")
        ratios.append(ratio); tris += d["species"][k]["tris"]
        sb = d["species"][k]["star_bad"]
        if sb: starbad += sb
        out["species"][k] = {
            "tris": d["species"][k]["tris"],
            "mask_px_median": int(np.median([p_["mask_px"] for p_ in d["species"][k]["poses"]])),
            "elongation_median": round(float(np.median(el)), 3),
            "boundary_cv_median": round(float(np.median(cvv)), 3),
            "within_species_dist": round(win, 4),
            "nearest_other": who,
            "nearest_other_dist": round(bet[who], 4),
            "separation": round(float(ratio), 2),
            "star_multivalued_dirs": sb,
        }
    out["separation_worst"] = round(float(min(ratios)), 2)
    out["separation_median"] = round(float(np.median(ratios)), 2)
    out["tris_all_species"] = tris
    out["star_multivalued_total"] = starbad   # MUST be 0; non-zero breaks cutter.js
    return out


# ─────────────────────────────────────────────────────────────────────────────
# `limb` — SIGN AND WIDTH OF EVERY BOUNDARY EVENT ABOVE THE k<=3 FIT.
#
# Added in v7 at the round-6 verdict's explicit request; see the notice at the
# top of this file for why, and for the verification that nothing else moved.
# It calls the SAME `_SPECIES_JS` harness `species` calls, unmodified, so the two
# commands measure the same silhouettes of the same shipping geometry.
# ─────────────────────────────────────────────────────────────────────────────

def _limb_runs(d, thr):
    """Maximal circular runs of d > thr. Returns [(width_bins, peak)]."""
    n = len(d)
    hot = d > thr
    if not hot.any():
        return []
    if hot.all():
        return [(n, float(d.max()))]
    start = int(np.argmax(~hot))          # a bin that is NOT hot, to break the ring
    runs, i = [], 0
    cur_w, cur_pk = 0, 0.0
    while i < n:
        j = (start + i) % n
        if hot[j]:
            cur_w += 1
            cur_pk = max(cur_pk, float(d[j]))
        elif cur_w:
            runs.append((cur_w, cur_pk)); cur_w, cur_pk = 0, 0.0
        i += 1
    if cur_w:
        runs.append((cur_w, cur_pk))
    return runs


def _hull_radii(a, rays):
    """Radius of the CONVEX HULL of the traced outline, along each of the same
    `rays` directions. Pure geometry: no fit, no harmonic truncation, no colour.
    The centroid the signature was traced from is inside the mask and therefore
    inside its hull, so the hull is the intersection of half-spaces
    n_e . p <= c_e with every c_e > 0, and the radius along `dir` is
    min over the edges facing `dir` of c_e / (n_e . dir)."""
    th = np.arange(rays) / rays * 2 * np.pi
    P = np.stack([a * np.cos(th), a * np.sin(th)], 1)
    # Andrew monotone chain
    pts = P[np.lexsort((P[:, 1], P[:, 0]))]
    def half(ps):
        out = []
        for p in ps:
            while len(out) >= 2:
                (ax_, ay_), (bx_, by_) = out[-2], out[-1]
                if (bx_ - ax_) * (p[1] - ay_) - (by_ - ay_) * (p[0] - ax_) <= 0:
                    out.pop()
                else:
                    break
            out.append(tuple(p))
        return out
    hull = half(pts)[:-1] + half(pts[::-1])[:-1]
    if len(hull) < 3:
        return a.copy()
    H = np.asarray(hull, float)
    E = np.roll(H, -1, 0) - H
    N = np.stack([E[:, 1], -E[:, 0]], 1)          # outward for CCW hull
    L = np.hypot(N[:, 0], N[:, 1])
    keep = L > 1e-12
    N = N[keep] / L[keep, None]
    C = (N * H[keep]).sum(1)
    if (C <= 1e-9).any():                          # origin not strictly inside
        return a.copy()
    D = np.stack([np.cos(th), np.sin(th)], 1)
    dot = D @ N.T                                  # rays x edges
    with np.errstate(divide='ignore', invalid='ignore'):
        t = np.where(dot > 1e-12, C[None, :] / dot, np.inf)
    return np.minimum(t.min(1), a.max() * 4)


def _limb_stats(sig, rays, thr):
    a = np.asarray(sig, float)
    m = float(a.mean())
    if m <= 0:
        return None
    F = np.fft.rfft(a)
    F[4:] = 0                              # keep DC + k=1,2,3 — the gross form
    fit = np.fft.irfft(F, rays)
    d = (a - fit) / m
    runs = _limb_runs(d, thr)
    deg = 360.0 / rays
    dh = (_hull_radii(a, rays) - a) / m     # >= 0 by construction
    return {
        "concave_frac_pct": float((d < -thr).mean() * 100),
        "concave_depth_pct": float(max(0.0, -d.min()) * 100),
        "hull_concave_frac_pct": float((dh > thr).mean() * 100),
        "hull_concave_depth_pct": float(dh.max() * 100),
        "protr_n": len(runs),
        "widths_deg": [w * deg for w, _ in runs],
        "heights_pct": [p * 100 for _, p in runs],
    }


def probe_limb(**kw):
    import subprocess, os
    thr = float(kw.pop("thr", 0.02))
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    args = [f"{k}={v}" for k, v in kw.items()]
    p = subprocess.run(["node", "--input-type=module", "-e", _SPECIES_JS, "--", *args],
                       cwd=root, capture_output=True, text=True)
    if p.returncode != 0 or not p.stdout.strip():
        return {"error": "node failed", "stderr": p.stderr[-600:]}
    d = json.loads(p.stdout)
    rays = d["rays"]
    out = {"probe_version": PROBE_VERSION, "pose": d["pose"], "poses_per_species": d["n"],
           "res": d["res"], "rays": rays, "detail": d["detail"],
           "thr_pct_of_mean_radius": thr * 100, "baseline": "k<=3 Fourier fit",
           "species": {}}
    for k in d["species"]:
        st = [_limb_stats(p_["sig"], rays, thr) for p_ in d["species"][k]["poses"]]
        st = [s for s in st if s]
        W = [w for s in st for w in s["widths_deg"]]
        H = [h for s in st for h in s["heights_pct"]]
        out["species"][k] = {
            "mask_px_median": int(np.median([p_["mask_px"] for p_ in d["species"][k]["poses"]])),
            "concave_frac_pct": round(float(np.median([s["concave_frac_pct"] for s in st])), 2),
            "concave_depth_pct": round(float(np.median([s["concave_depth_pct"] for s in st])), 2),
            "hull_concave_frac_pct": round(float(np.median([s["hull_concave_frac_pct"] for s in st])), 2),
            "hull_concave_depth_pct": round(float(np.median([s["hull_concave_depth_pct"] for s in st])), 2),
            "protr_n": round(float(np.median([s["protr_n"] for s in st])), 1),
            "protr_width_deg": (round(float(np.median(W)), 2) if W else None),
            "protr_width_p90_deg": (round(float(np.percentile(W, 90)), 2) if W else None),
            "protr_height_pct": (round(float(np.median(H)), 2) if H else None),
        }
    return out


SUITE = [
    ("clip", "05-cut+500ms.png"), ("ring", "05-cut+500ms.png"),
    ("clip", "08-citrus-caps.png"),
    ("void", "12-idle-blade.png"), ("void", "01-whole-watermelon.png"),
    ("silhouette", "01-whole-watermelon.png"),
    ("droplets", "04-cut+250ms.png"),
    ("particles", "15-fast-flick+50ms.png"), ("particles", "16-slow-cleave+50ms.png"),
    ("tintlaw", "15-fast-flick+50ms.png"), ("tintlaw", "16-slow-cleave+50ms.png"),
    # the NO-JUICE CONTROL. `particles` reads mean_saturation 0.794 here, i.e.
    # between the two frames it is meant to separate. Any colour statistic that
    # drifts toward this row is measuring the frame, not the fluid.
    ("tintlaw", "12-idle-blade.png"),
    ("lens", "00-hero.png"), ("lens", "12-idle-blade.png"),
    # v5: the cut-face foam population. Default window is the LOWER melon half of
    # a 640x360 05-cut+500ms frame; plate-01 needs win=320:565:545:805.
    ("foam", "05-cut+500ms.png"),
    # v6: the pith collar itself. Default window is the LOWER (near) melon half
    # of a 640x360 05-cut+500ms frame. `ring` above is a whole-body statistic and
    # does NOT touch this band.
    ("collar", "05-cut+500ms.png"),
    # v8: is that ribbon light or geometry. Same ridge `lens` above already found.
    ("filament", "00-hero.png"),
    # v9: what is that cusp sitting on. Same ridge again; the SKIRT half of
    # `filament`, which is blind to everything outside the core.
    ("glare", "00-hero.png"),
]

def main():
    if len(sys.argv) < 2 or sys.argv[1] == "list":
        print(json.dumps({"probe_version": PROBE_VERSION, "probes": sorted(PROBES),
                          "source_probes": {"species": "takes no image; builds "
                                            "src/fruit/geometry.js under node. "
                                            "args: pose=ship|so3 n= res= rays= "
                                            "detail= star=",
                                            "limb": "takes no image; same node "
                                            "harness as `species`. concavity and "
                                            "protrusion width against a k<=3 fit. "
                                            "args: pose=ship|so3 n= res= rays= "
                                            "detail= thr= (default 0.02)"},
                          "suite": [{"probe": p, "frame": f} for p, f in SUITE]}, indent=1))
        return
    cmd = sys.argv[1]
    if cmd == "species":
        kw = dict(a.split("=", 1) for a in sys.argv[2:] if "=" in a)
        print(json.dumps(probe_species(**kw), indent=1))
        return
    if cmd == "limb":
        kw = dict(a.split("=", 1) for a in sys.argv[2:] if "=" in a)
        print(json.dumps(probe_limb(**kw), indent=1))
        return
    if cmd == "suite":
        import os
        d = sys.argv[2]
        out = {"probe_version": PROBE_VERSION, "dir": d, "results": {}}
        for p, f in SUITE:
            path = os.path.join(d, f)
            key = f"{p}:{f}"
            if not os.path.exists(path):
                out["results"][key] = {"error": "missing frame"}
                continue
            try:
                out["results"][key] = PROBES[p](load(path))
            except Exception as e:
                out["results"][key] = {"error": str(e)[:200]}
        print(json.dumps(out, indent=1))
        return
    if cmd not in PROBES:
        print(json.dumps({"error": f"unknown probe {cmd}", "known": sorted(PROBES)})); sys.exit(1)
    img = load(sys.argv[2])
    kw = {}
    for a in sys.argv[3:]:
        if "=" in a:
            k, v = a.split("=", 1); kw[k] = v
    res = PROBES[cmd](img, **kw)
    res["probe_version"] = PROBE_VERSION
    print(json.dumps(res, indent=1))

if __name__ == "__main__":
    main()
