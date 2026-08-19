/**
 * hud.js — DOM overlay. Deliberately almost invisible: a thin score, a level
 * name that fades in and out, and combo callouts that rise from the cut point.
 * Nothing boxed, nothing chunky, nothing that competes with the fruit.
 */
import * as THREE from 'three';

// ── the callout's motion constants ──────────────────────────────────────────
// SHARED, because the placement clamp and the animation have to agree about how
// far the callout travels. They did not: the clamp reserved room for the
// RESTING box and `frame()` then translated it up by RISE_MAX, which left the
// glyph box 4 px from the top of the viewport at the end of the rise — glow
// clipped, and overlapping the score readout, which is the one thing that bound
// exists to prevent. Caught in review. Same class of mistake as fitting the
// width against the resting size while the pop overshoots it.
const RISE_MAX = 58;      // px the callout travels upward over its life
const POP_MAX = 1.20;     // peak overshoot of the punch-in

export function createHud() {
  const api = {};
  let ctx, root, scoreEl, levelEl, comboLayer, hintEl, flagEl;
  let shownScore = 0;
  const floats = [];

  api.init = (c) => {
    ctx = c;
    root = document.createElement('div');
    root.className = 'zs-hud';
    root.innerHTML = `
      <div class="zs-score"><span id="zs-num">0</span></div>
      <div class="zs-level" id="zs-level"></div>
      <div class="zs-combos" id="zs-combos"></div>
      <div class="zs-hint" id="zs-hint">swipe to slice</div>
      <div class="zs-flag" id="zs-flag"></div>`;
    document.body.appendChild(root);
    scoreEl = root.querySelector('#zs-num');
    levelEl = root.querySelector('#zs-level');
    comboLayer = root.querySelector('#zs-combos');
    hintEl = root.querySelector('#zs-hint');
    flagEl = root.querySelector('#zs-flag');

    c.bus.on('level', (e) => {
      levelEl.textContent = e.name;
      levelEl.classList.remove('show'); void levelEl.offsetWidth;
      levelEl.classList.add('show');
    });
    // ══ THE COMBO CALLOUT ════════════════════════════════════════════════
    // The player asked for this: "when you get a combo text should appear over
    // your slice. This makes the game feel more exciting."
    //
    // It is DOM, not scene geometry, and that is deliberate on three counts.
    // (1) It must be legible, and the scene it sits over has a bloom and a
    // depth-of-field pass that he has ALREADY complained about twice — putting
    // the callout in the scene would hand it to the lens that blurred the fruit
    // he was aiming at. (2) DOM text is resolution-independent, so it is crisp
    // at the 2x device pixel ratio the phone actually renders at, where the
    // r11 bake-off found the harness had been judging at 1x for eleven rounds.
    // (3) It costs zero draw calls against a budget of 120 and zero triangles
    // against 250k.
    //
    // NO WEBFONT. The whole game is ONE self-contained HTML file with no
    // network at runtime — that is the property that lets it be opened once and
    // added to the home screen — so a downloaded display face would either
    // break that or add its bytes to a bundle that is already 3.9MB. The look
    // is built out of a heavy system stack plus layered CSS instead; see the
    // `.zs-combo` block in style.css for how the bevel and the gold are made.
    c.bus.on('combo', (e) => {
      const el = document.createElement('div');
      el.className = 'zs-combo' + (e.peak ? ' peak' : '');
      // `data-t` is what draws the dark outline: a ::before pseudo-element
      // stroked and painted BEHIND the gradient fill, because -webkit-text-stroke
      // and background-clip:text cannot both live on one element.
      const l1 = `${e.count} FRUIT COMBO`;
      const l2 = `+${Math.max(1, Math.round(e.gain ?? e.count))}`;
      el.innerHTML =
        `<span class="zs-c1" data-t="${l1}">${l1}</span>`
        + `<span class="zs-c2" data-t="${l2}">${l2}</span>`;

      // Position over the cut, then KEEP IT ON SCREEN — and clamp in PIXELS
      // against the callout's own MEASURED width, not in percent. A percentage
      // clamp cannot know how wide "5 FRUIT COMBO" is, and portrait is only 430
      // CSS px across: the first version put the text 12 px from the left edge
      // and cut the glow off. This is the same class of mistake as r10's
      // GRAIN_PX note — state the bound in the unit the thing is measured in.
      // ONE CALLOUT AT A TIME. Combos land inside a 0.55 s window (COMBO_WINDOW
      // in score.js), so two of these can overlap by construction — and two
      // overlapping slabs of gold outlined type are not "exciting", they are
      // illegible. Caught by rendering the worst case rather than by reasoning
      // about it. Anything still on screen is retired into a fast fade so the
      // newest number is always the readable one.
      for (const f of floats) if (f.t < f.life - 0.18) { f.t = f.life - 0.18; f.life -= 0.10; }

      // Appended first so offsetWidth is real.
      comboLayer.appendChild(el);
      const p = e.at.clone().project(c.camera);
      const cw = comboLayer.clientWidth || 1, ch = comboLayer.clientHeight || 1;
      // 16, not 10: the text-shaped glow spills ~0.35em past the glyphs, so a
      // pad sized to the glyph box lets the bloom kiss the rim.
      const pad0 = 16;
      // ⚠ FIT BEFORE YOU CLAMP. At `peak` size "5 FRUIT COMBO" is wider than a
      // 430 px portrait viewport, so clamping alone centres a string that is
      // still clipped at BOTH edges — which is exactly what the first version
      // did, and it took rendering the widest case at the rim to see it.
      // `fit` is folded into the pop scale in api.frame below, so the callout
      // shrinks only as far as it has to and a desktop never sees it move.
      // ⚠ AND FIT AGAINST THE POP, NOT THE RESTING SIZE. The callout overshoots
      // to POP_MAX during its punch-in, so a `fit` computed against the resting
      // width leaves it 20% too wide for the two frames a viewer actually
      // notices — which is what the second render still showed, clipped on the
      // right. Measure the widest moment, not the average one.
      const avail = cw - 2 * pad0;
      const fit = Math.min(1, avail / Math.max(1, el.offsetWidth * POP_MAX));
      const halfW = el.offsetWidth * fit * POP_MAX * 0.5;
      const halfH = el.offsetHeight * fit * POP_MAX * 0.5;
      // `pad` also covers the text-shaped glow, which spills ~0.35em past the
      // glyphs, and keeps the callout clear of the score readout at the top.
      const pad = pad0;
      const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) * 0.5 : v < lo ? lo : v > hi ? hi : v);
      // start ABOVE the cut rather than on it — the blade streak is bright and
      // lies exactly along the slice, so a callout centred on the cut point
      // lands on top of the one element it must not fight with
      const lift = halfH + 14;

      // ⚠ THE TOP BOUND MUST RESERVE THE WHOLE RISE, AND THE SCORE'S REAL BOX.
      // Two things were wrong here and review caught both at once. (1) The
      // clamp reserved room for the resting box, then `frame()` translated the
      // callout up by RISE_MAX, so at the end of the rise the glyph box sat
      // 4 px from the viewport edge. (2) The clearance under the score was a
      // hard-coded 46, but `.zs-score` is `clamp(30px, 6vmin, 62px)` — 30 px in
      // portrait and 43 px in landscape — so one number could not be right on
      // both. Measure the element instead of guessing at it.
      //
      // ⚠ AND IT HAS TO BE MEASURED IN THE COMBO LAYER'S OWN COORDINATES.
      // `.zs-hud` is `position: fixed; inset: 0` WITH padding (the safe-area
      // insets), and `.zs-combos` is `inset: 0` inside that padding box — so
      // `el.style.top` is relative to the layer while `getBoundingClientRect()`
      // is relative to the viewport, and they differ by the notch inset. On a
      // phone that is not a rounding error.
      const layerTop = comboLayer.getBoundingClientRect().top;
      const scoreBottom = scoreEl
        ? scoreEl.getBoundingClientRect().bottom - layerTop
        : 60;
      // The gap to the score is `pad + 12`, not a token 8. `getBoundingClientRect`
      // does NOT include a `filter: drop-shadow` spill, so the measurement that
      // says "clear of the score" is measuring the glyph box while the thing a
      // viewer sees touching is the glow — which is ~0.42em, i.e. 22 px at
      // landscape's 52 px type. Measured at the end of the rise before this
      // widening: glyph box cleared the score by 20 px and the glow by −2.
      const topBound = scoreBottom + (pad + 12) + halfH + pad + RISE_MAX;
      el.style.left = `${clamp((p.x * 0.5 + 0.5) * cw, halfW + pad, cw - halfW - pad).toFixed(1)}px`;
      el.style.top = `${clamp((-p.y * 0.5 + 0.5) * ch - lift, topBound, ch - halfH - pad).toFixed(1)}px`;

      // A small deterministic tilt so it reads as hand-placed rather than
      // pasted on. Derived from the count, NOT from Math.random(), so that a
      // captured frame is reproducible — r12 seeded the harness precisely so
      // that frames could be compared byte for byte, and a random rotation here
      // would put that back.
      const tilt = ((e.count * 37) % 11) - 5;
      floats.push({ el, t: 0, tilt, fit, life: 1.15 });
    });
    c.bus.on('slice', () => { if (hintEl) { hintEl.classList.add('gone'); } });

    // first level name
    setTimeout(() => c.bus.emit('level', { level: 0, name: 'Still Water' }), 700);
  };

  api.frame = (dt, alpha, c) => {
    // ══ r17: SAY WHEN AN EXPERIMENT IS ON ═══════════════════════════════════
    // He added ?dropphys=1 to the live URL and could not tell whether anything
    // had happened — and he was right not to be able to, because at r15's
    // collider size it changed the frame by 0%. A prototype the player cannot
    // SEE THE STATE OF is untestable: every observation is confounded by "is
    // it even on". The badge reports the flag AND the live sphere count, so a
    // frame with 0 spheres is visibly different from the feature being off.
    // `ctx.dropPhys` is published by fluid.js, the owner; the HUD does not
    // re-parse the URL, because duplicating that parse is exactly the drift
    // r14b removed for cling.
    if (flagEl) {
      // r18: droplet physics is the DEFAULT now, so the badge is no longer a
      // "this is on" indicator — it is an "you have overridden the default"
      // indicator, and it reports which way. A diagnostic that shows during
      // ordinary play is game chrome, and this is not that.
      const show = !!c.dropPhysExplicit;
      const on = !!c.dropPhys;
      const txt = !show ? ''
        : (on ? `DROPLET PHYSICS ON · ${c.dropPhysSpheres | 0} colliders`
              : 'DROPLET PHYSICS OFF');
      if (flagEl.textContent !== txt) flagEl.textContent = txt;
      if (show !== flagEl.classList.contains('on')) flagEl.classList.toggle('on', show);
    }
    const s = c.score?.score ?? 0;
    shownScore += (s - shownScore) * Math.min(1, dt * 9);
    scoreEl.textContent = Math.round(shownScore);
    // The callout's motion is driven HERE rather than by a CSS animation, so it
    // runs on the game's own `dt`. A CSS keyframe would keep playing while the
    // game is paused and would ignore `ctx.timeScale` if slow-motion is ever
    // reintroduced — the r11 feel owner deleted slow-mo, and the lesson from
    // that round was that a timeline authored against the wrong clock is a bug
    // nobody sees until they compare two beats.
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      const u = f.t / f.life;
      // POP: overshoot to 1.14 in the first 90 ms, settle by 260 ms. A callout
      // that fades up reads as a notification; one that punches reads as a hit.
      const pop = f.t < 0.09
        ? 0.55 + (POP_MAX - 0.55) * (f.t / 0.09)
        : POP_MAX - (POP_MAX - 1) * Math.min(1, (f.t - 0.09) / 0.17);
      // RISE: fast out of the cut, then eased, so the eye is pulled up off the
      // fruit rather than the text drifting away at a constant speed.
      const rise = -RISE_MAX * (1 - Math.pow(1 - Math.min(1, f.t / 0.75), 2));
      // Hold full opacity for the first 55% of life; a callout that starts
      // fading immediately never reads at all on a 120 Hz display.
      const fade = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
      f.el.style.transform =
        `translate(-50%,-50%) translateY(${rise.toFixed(1)}px) `
        + `rotate(${f.tilt}deg) scale(${(pop * f.fit).toFixed(3)})`;
      f.el.style.opacity = fade.toFixed(3);
      if (f.t > f.life) { f.el.remove(); floats.splice(i, 1); }
    }
  };

  return api;
}
