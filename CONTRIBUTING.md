# Contributing to Chord Cut

Thanks for your interest! Bug reports, probe results from unusual devices, and
focused pull requests are all welcome.

## The one legal thing (please read)

Chord Cut's code is GPLv3, but the same author also ships the game as a paid
iOS app — and the App Store's terms are famously incompatible with the GPL, so
that only works while the copyright in this repository can be licensed on
other terms by its owner.

**By submitting a contribution you agree that:**

1. Your contribution is licensed to the project under GPLv3, **and**
2. You additionally grant John Hurliman a perpetual, worldwide, non-exclusive,
   royalty-free license to relicense and distribute your contribution as part
   of Chord Cut under any terms, including in App Store builds.

If you're not comfortable with (2), that's completely fine — open an issue
describing the change instead, and it can be implemented independently.

## Practical notes

- The engineering log lives in [HANDOFF.md](HANDOFF.md); read the section for
  any module you touch. The conventions in it are enforced by review.
- Audio-touching changes must show `node tools/audioprobe.mjs` green three
  consecutive runs. Rendering changes should include `drawprobe` numbers.
- The probes need a full Chromium: `npx playwright install chromium`.
- One change per PR. The commit-message style you see in `git log` is not
  mandatory, but a sentence about *why* is.

## Name and artwork

"Chord Cut", the app icon, and the App Store artwork identify the author's
distribution of the game and are **not** covered by the GPLv3 grant. If you
ship a modified build, ship it under your own name and icon.
