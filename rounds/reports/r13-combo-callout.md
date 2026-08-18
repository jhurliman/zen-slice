# r13 — the combo callout

> "when you get a combo text should appear over your slice. This makes the game feel more exciting.
> We don't have to use exactly this font, but something that looks good and styled and like it's
> part of a game" — the player, 2026-08-18, with a Fruit Ninja frame attached.

**Files touched: `src/ui/hud.js`, `src/ui/style.css`. Nothing else.**
`tools/probes.py` untouched. Canaries re-run after the change:
`clip shots/r10/05-cut+500ms.png -> mask_px 10340 / pct_R_ge_255 4.333` ✅
`clip shots/r9/05-cut+500ms.png  -> mask_px 10057 / pct_R_ge_255 2.197` ✅

**Look at `rounds/reports/r13-combo-callout.png`.**

## What it is

`score.js` has emitted a `combo` event since round 3 carrying `{count, at, mult, gain, peak}`, and
the HUD was rendering it as a thin grey `2×`. It now renders the two-line callout the reference
shows — `N FRUIT COMBO` over `+points` — in chunky gold with a dark outline, popped in over the cut
and risen out of it.

## Three decisions worth stating

**1. DOM, not scene geometry.** The scene it sits over has a bloom and a depth-of-field pass the
player has already complained about twice ("the depth of field is overdone, many of the fruits are
completely blurry"). Putting the callout in the scene would hand it to the lens that blurred the
fruit he was aiming at. DOM text is also resolution-independent — crisp at the 2x device pixel
ratio the phone actually renders at, where the r11 bake-off found the harness had been judging at
1x for eleven rounds — and it costs **0 draw calls** against a budget of 120 and **0 triangles**
against 250k.

**2. No webfont.** The game ships as ONE self-contained HTML file with no network at runtime; that
is the property that lets it be opened once in Safari and added to the home screen, and the bundle
is already 3.9 MB. So the weight comes from a heavy system stack and everything else is CSS. The
stack is ordered by what each platform actually HAS: **iOS ships neither Arial Black nor Impact**,
so it falls through to `-apple-system`, where `font-weight: 900` is SF Pro Black. Desktop picks up
Arial Black or Impact first. Three layers, because `-webkit-text-stroke` and `background-clip: text`
cannot coexist on one element: a stroked `::before` carrying the outline and a three-step brown
extrusion, the span itself carrying the gold gradient clipped to the glyphs, and a text-shaped glow.

**The glow is `drop-shadow`, not a radial gradient, and that was a fix.** The obvious ellipse behind
the text is alpha-blind — it does not know where the letters are, and against black it reads as a
smear rather than as light coming off the type. `drop-shadow` is alpha-shaped, so it follows the
glyphs and the stroke both.

**3. The motion runs on the game's `dt`, not on a CSS keyframe.** A keyframe keeps playing while the
game is paused and ignores `ctx.timeScale`. The r11 feel owner deleted slow-motion, and that round's
lesson was that a timeline authored against the wrong clock is a bug nobody sees until two beats are
compared. Pop overshoots to 1.20 in 90 ms and settles by 260 ms; the rise is eased so the eye is
pulled up off the fruit; opacity holds flat for the first 55% of life, because a callout that starts
fading immediately never reads at all on a 120 Hz display.

## Two bugs the WORST CASE found, which reasoning did not

Both were caught by rendering the widest string the game can produce — `5 FRUIT COMBO / +188` at the
new-best-combo type size — at the worst position, hard against the right rim. Neither was visible in
the ordinary `2 FRUIT COMBO` render that looked fine.

**(a) It did not fit on the phone.** The first version clamped position as a *percentage*, which
cannot know how wide the string is. Portrait is 430 CSS px across and the callout was wider than
that, so clamping merely centred a string that was still clipped at **both** edges. Fixed by
measuring `offsetWidth` after append and clamping in **pixels** — the r10 `GRAIN_PX` lesson again:
state the bound in the unit the thing is measured in.

**And the first fix was still wrong**, which is the more useful half. `fit` was computed against the
*resting* width, but the callout overshoots to 1.20x during its punch-in, so it was still 20% too
wide for exactly the two frames a viewer notices. It now fits against `POP_MAX`, and the
`transform-origin` moved from the bottom edge to the centre so the on-screen box is not a function
of the animation.

**(b) Two callouts overlapped and were illegible.** `COMBO_WINDOW` in `score.js` is 0.55 s and the
callout lives 1.15 s, so overlap is guaranteed by construction, not rare. Two slabs of outlined gold
type on top of each other are not exciting, they are unreadable. A new callout now retires any
survivor into a fast fade so the newest number is always the readable one.

## A THIRD BUG, CAUGHT IN REVIEW, AND IT IS THE SAME MISTAKE AS (a)

The automated review flagged the top bound: the clamp reserved room for the callout's **resting**
box, and `frame()` then translates it upward by `RISE_MAX`. At the end of the rise the glyph box sat
`16 + 46 − 58 = 4 px` from the top of the viewport — glow clipped, overlapping the score readout,
which is the one thing that bound exists to prevent. **It is the width bug again on the other axis:
clamp against the resting size, animate past it.** I had already written that lesson down for the
width and did not apply it to the height.

Verified it twice over, and the second half was mine to find: the clearance under the score was a
hard-coded `46`, but `.zs-score` is `clamp(30px, 6vmin, 62px)` — **30 px in portrait and 43 px in
landscape** — so no single constant could be right on both. It now measures the score's real box.

Three things changed:

* `RISE_MAX` and `POP_MAX` are module constants shared by the clamp and the animation, so they
  cannot drift apart again.
* The score clearance is measured, **in the combo layer's own coordinates** — `.zs-hud` is
  `position: fixed; inset: 0` with the safe-area insets as padding and `.zs-combos` is `inset: 0`
  inside that, so `el.style.top` and `getBoundingClientRect()` differ by the notch inset. On a phone
  that is not a rounding error.
* The gap is `pad + 12`, not a token 8, because **`getBoundingClientRect` does not include a
  `filter: drop-shadow` spill**. The measurement that says "clear of the score" measures the glyph
  box while the thing a viewer sees touching is the glow, ~0.42em = 22 px at landscape's 52 px type.

Measured at the end of the rise (`tools/.r13top.mjs`, combo fired at the top of the playfield, worst
string, peak type size), glyph-box gap to the score readout:

| | before review | glyph box after | glow after |
|---|---|---|---|
| landscape 1280x720 | **4 px from the viewport edge, over the score** | 40.1 px clear | ~18 px clear |
| portrait 430x932 | — | 96.8 px clear | ~75 px clear |

## What I did not do

* **No font is bundled.** If he wants the reference face exactly, that is a licensing and a
  bundle-size decision for him, not a build one — a subset woff2 of the ~40 glyphs this needs would
  be 8-15 KB and would have to be base64'd into the single file.
* **The frozen suite has nothing to say about this** and I did not invent a probe for it. It is DOM
  over the canvas; `shoot.mjs` captures it only in `14-hud.png`, and none of the probes look there.
  Judge it from the render.
