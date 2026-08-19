/**
 * hud.js — DOM overlay. Deliberately almost invisible: a thin score, a level
 * name that fades in and out, and combo callouts that rise from the cut point.
 * Nothing boxed, nothing chunky, nothing that competes with the fruit.
 */
import * as THREE from 'three';
import { loadPrefs, savePref } from '../core/prefs.js';

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
  let debugOn = false, debugEl = null, debugTxt = null, debugAcc = 0;
  let shownScore = 0;
  const floats = [];
  // r21: the settings glyph and its three-row panel; idle is TOUCH idle —
  // the director tosses fruit whether or not anyone plays, so "no fruit in
  // the air" never holds and the sky's quiet is measured at the fingertip
  let settingsEl = null, panelEl = null, gearEl = null;
  let idleT = 0, panelOpen = false, captureMode = false, reducedMotion = false;
  let swipeCount = 0;
  const IDLE_SHOW_S = 6;

  /**
   * Place a callout over a world point and keep it on screen. ONE function
   * for both the combo and the penalty (r20) — a copy of this block drifted
   * once in review, dropping the glow gap, which is exactly why it is shared.
   * Everything here is hard-won; the short version of each lesson:
   *
   *  · ONE CALLOUT AT A TIME: anything still on screen retires into a fast
   *    fade so the newest number is always the readable one.
   *  · FIT BEFORE YOU CLAMP, AGAINST THE POP: the callout overshoots to
   *    POP_MAX during its punch-in; fitting the resting width leaves it 20%
   *    too wide for the frames a viewer actually notices.
   *  · pad 16 covers the text-shaped glow (~0.35em past the glyphs).
   *  · THE BOUND MUST RESERVE THE WHOLE TRAVEL: frame() translates by
   *    RISE_MAX·riseK, so the clamp reserves it above (risers) or below
   *    (sinkers), or the glyph box ends its ride at the viewport edge.
   *  · The score clearance is `pad + 12` because getBoundingClientRect does
   *    not include the drop-shadow spill (~0.42em at landscape type size).
   *  · Everything is measured in the COMBO LAYER'S coordinates — .zs-hud
   *    carries the safe-area padding, so viewport rects differ by the notch.
   *
   * Returns `fit` for the caller's float record.
   */
  function placeFloat(el, at, c, riseK) {
    for (const f of floats) if (f.t < f.life - 0.18) { f.t = f.life - 0.18; f.life -= 0.10; }
    comboLayer.appendChild(el);               // appended first so offsetWidth is real
    const p = at.clone().project(c.camera);
    const cw = comboLayer.clientWidth || 1, ch = comboLayer.clientHeight || 1;
    const pad = 16;
    const fit = Math.min(1, (cw - 2 * pad) / Math.max(1, el.offsetWidth * POP_MAX));
    const halfW = el.offsetWidth * fit * POP_MAX * 0.5;
    const halfH = el.offsetHeight * fit * POP_MAX * 0.5;
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) * 0.5 : v < lo ? lo : v > hi ? hi : v);
    // start ABOVE the cut — the blade streak is bright and lies along the slice
    const lift = halfH + 14;
    const layerTop = comboLayer.getBoundingClientRect().top;
    const scoreBottom = scoreEl ? scoreEl.getBoundingClientRect().bottom - layerTop : 60;
    const travelUp = RISE_MAX * Math.max(0, riseK);
    const travelDown = RISE_MAX * Math.max(0, -riseK);
    const topBound = scoreBottom + (pad + 12) + halfH + pad + travelUp;
    el.style.left = `${clamp((p.x * 0.5 + 0.5) * cw, halfW + pad, cw - halfW - pad).toFixed(1)}px`;
    el.style.top = `${clamp((-p.y * 0.5 + 0.5) * ch - lift, topBound, ch - halfH - pad - travelDown).toFixed(1)}px`;
    return fit;
  }

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
    // ══ r22: THE HARMONY CALLOUT ═════════════════════════════════════════════
    // Named for what the sound engine actually plays: one stroke through
    // several fruit is gathered and voiced as one rolled chord, so the
    // callout is its music-theory name — DYAD, TRIAD, CHORD, FLOURISH · n —
    // with the stroke's points below. No "FRUIT COMBO" anywhere. The
    // cross-stroke chain (the PHRASE) still drives the score multiplier
    // silently and gets its own whisper below when a long run ends.
    c.bus.on('harmony', (e) => {
      const el = document.createElement('div');
      el.className = 'zs-combo' + (e.flourish ? ' peak' : '');
      // `data-t` is what draws the dark outline: a ::before pseudo-element
      // stroked and painted BEHIND the gradient fill, because -webkit-text-stroke
      // and background-clip:text cannot both live on one element.
      const l1 = e.size === 2 ? 'DYAD'
        : e.size === 3 ? 'TRIAD'
          : e.size === 4 ? 'CHORD'
            : `FLOURISH · ${e.size}`;
      const l2 = `+${Math.max(1, Math.round(e.gain ?? e.size))}`;
      el.innerHTML =
        `<span class="zs-c1" data-t="${l1}">${l1}</span>`
        + `<span class="zs-c2" data-t="${l2}">${l2}</span>`;

      // Position over the cut, then KEEP IT ON SCREEN — placeFloat carries the
      // measured-pixel clamp lessons (fit against the pop, reserve the travel).
      const fit = placeFloat(el, e.at, c, 1);

      // A small deterministic tilt so it reads as hand-placed rather than
      // pasted on. Derived from the size, NOT from Math.random(), so that a
      // captured frame is reproducible — r12 seeded the harness precisely so
      // that frames could be compared byte for byte, and a random rotation here
      // would put that back.
      const tilt = ((e.size * 37) % 11) - 5;
      floats.push({ el, t: 0, tilt, fit, riseK: 1, life: 1.15 });
    });

    // the phrase whisper (r22): a sustained run of 6+ chained cuts, ended on
    // its own terms — one thin lowercase line above the hint, then gone
    let phraseEl = null;
    c.bus.on('phrase', (e) => {
      if (phraseEl) phraseEl.remove();
      phraseEl = document.createElement('div');
      phraseEl.className = 'zs-phrase';
      phraseEl.textContent = `phrase · ${e.length}`;
      root.appendChild(phraseEl);
      requestAnimationFrame(() => phraseEl && phraseEl.classList.add('show'));
      const el2 = phraseEl;
      setTimeout(() => { el2.remove(); if (phraseEl === el2) phraseEl = null; }, 3400);
    });

    // ══ r20: THE PENALTY CALLOUT ═════════════════════════════════════════════
    // A struck stone answers in the same voice as the combo — same element,
    // same floats array, same dt-driven animation — but cool slate instead of
    // gold, and it SINKS a little instead of rising: the eye reads "down" as
    // loss without a single word of scolding. Placement goes through the
    // SAME placeFloat() the combo uses (including its glow gap under the
    // score, `pad + 12` — a copy of that block had already drifted once, in
    // review, which is why it is a helper now); the only difference is the
    // travel reservation: RISE_MAX above for a riser, the short sink below
    // for this.
    c.bus.on('penalty', (e) => {
      const el = document.createElement('div');
      el.className = 'zs-combo penalty';
      const taken = Math.round(e.taken ?? e.amount ?? 0);
      const l1 = 'STONE';
      // never fabricate a deduction: at score 0 nothing was taken, so no number
      el.innerHTML = `<span class="zs-c1" data-t="${l1}">${l1}</span>`
        + (taken > 0 ? `<span class="zs-c2" data-t="−${taken}">−${taken}</span>` : '');
      const fit = placeFloat(el, e.at, c, -0.35);
      floats.push({ el, t: 0, tilt: -3, fit, riseK: -0.35, life: 1.0 });
    });

    c.bus.on('slice', () => { if (hintEl) { hintEl.classList.add('gone'); } });

    // ══ r21: THE HINT LETS GO AFTER THREE SWIPES ═════════════════════════════
    // The first-slice hide (above) never fires for a player who swipes and
    // misses — they kept a pulsing tutorial forever. Three pointerdowns is
    // three attempts: whoever is doing that has understood the game. Taps on
    // the settings UI are not swipes and don't count; this listener also
    // feeds the idle clock for the glyph below.
    try {
      const q = new URLSearchParams(location.search || '');
      captureMode = q.has('capture') && q.get('capture') !== '0';
      debugOn = q.has('debug') && q.get('debug') !== '0';
    } catch (_) { /* */ }
    try { reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { /* */ }
    window.addEventListener('pointerdown', (ev) => {
      if (settingsEl && ev.target && settingsEl.contains(ev.target)) return;
      idleT = 0;
      if (panelOpen) togglePanel(false);
      else if (gearEl) gearEl.classList.remove('show');
      if (++swipeCount >= 3 && hintEl) hintEl.classList.add('gone');
    }, { passive: true });

    // ══ r21: THE SETTINGS GLYPH ══════════════════════════════════════════════
    // Three choices, no screen. The glyph exists only when the fingertip has
    // been still for a while, in the hint's own typographic voice, and any
    // return to play dismisses everything. Suppressed under ?capture so the
    // screenshot corpus never sees it.
    if (!captureMode) {
      settingsEl = document.createElement('div');
      settingsEl.className = 'zs-settings';
      const p = loadPrefs();
      settingsEl.innerHTML =
        `<button class="zs-gear" id="zs-gear" aria-label="settings">···</button>`
        + `<div class="zs-panel" id="zs-panel">`
        + `<button data-k="sound">sound ${p.sound !== false ? 'on' : 'off'}</button>`
        + `<button data-k="haptics">haptics ${p.haptics !== false ? 'on' : 'off'}</button>`
        + `<button data-k="again">begin again</button>`
        + `</div>`;
      root.appendChild(settingsEl);
      gearEl = settingsEl.querySelector('#zs-gear');
      panelEl = settingsEl.querySelector('#zs-panel');
      // NO stopPropagation anywhere here — the window pointerdown listener in
      // audio.js is the guaranteed iOS resume path and must see every tap.
      gearEl.addEventListener('pointerdown', () => togglePanel(!panelOpen));
      panelEl.addEventListener('pointerdown', (ev) => {
        const b = ev.target && ev.target.closest ? ev.target.closest('button[data-k]') : null;
        if (!b) return;
        const k = b.dataset.k;
        if (k === 'again') {
          ctx.fruits?.reset?.();
          // re-announce the first level so the name plays its fade and the
          // score module's level fields sync — emitted HERE, not from
          // director.reset, so the harness's frequent ZS.clear() calls never
          // flash level text into captured frames
          ctx.bus.emit('level', { level: 0, name: 'Still Water' });
          togglePanel(false);
          gearEl.classList.remove('show');
          idleT = 0;
          return;
        }
        const now = !(loadPrefs()[k] !== false);   // flip
        savePref(k, now);
        b.textContent = `${k} ${now ? 'on' : 'off'}`;
        ctx.bus.emit('pref', { key: k, value: now });
      });
    }

    // ══ r21: THE PERSONAL-BEST WHISPER ═══════════════════════════════════════
    // Once per session, the moment the stored best is passed: thin text under
    // the score, in and out like the level name. A trophy case would be noise.
    c.bus.on('newbest', () => {
      const el = document.createElement('div');
      el.className = 'zs-best';
      el.textContent = 'personal best';
      root.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => el.remove(), 4200);
    });

    // ══ r20: ?debug — THE LEVEL REMOTE ═══════════════════════════════════════
    // Music iteration needs to HEAR each level without playing 27 minutes to
    // reach it. With ?debug: a small monospace strip at the bottom shows
    // level · chord · bpm · bloom (polled ~2 Hz from ZS.audio.state()) and
    // ◀ ▶ jump levels via director.jumpLevel — which emits the same 'level'
    // event a natural advance does, so palettes/motifs/spawn pools all follow.
    // Diagnostic chrome, so it exists only behind the flag, like ?dropphys.
    // debugOn was parsed above alongside captureMode
    if (debugOn) {
      debugEl = document.createElement('div');
      debugEl.className = 'zs-debug';
      debugEl.innerHTML = `<button id="zs-dbg-prev">◀</button>`
        + `<span id="zs-dbg-txt"></span>`
        + `<button id="zs-dbg-next">▶</button>`;
      root.appendChild(debugEl);
      debugTxt = debugEl.querySelector('#zs-dbg-txt');
      // NO stopPropagation here: the window-level pointerdown listener in
      // audio.js is the documented only guaranteed iOS resume path, and a tap
      // on these buttons must still reach it. The buttons sit above the
      // canvas, so the blade never sees these taps anyway (its listeners are
      // on the canvas element, and the event target is the button).
      const jump = (d) => { const dir = ctx.fruits; if (dir?.jumpLevel) dir.jumpLevel((dir.level | 0) + d); };
      debugEl.querySelector('#zs-dbg-prev').addEventListener('pointerdown', () => jump(-1));
      debugEl.querySelector('#zs-dbg-next').addEventListener('pointerdown', () => jump(1));
    }

    // first level name
    setTimeout(() => c.bus.emit('level', { level: 0, name: 'Still Water' }), 700);
  };

  function togglePanel(open) {
    panelOpen = open;
    if (panelEl) panelEl.classList.toggle('open', open);
    if (gearEl && open) gearEl.classList.add('show');
  }

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
    // r21: the settings glyph earns its existence by absence — visible only
    // after the fingertip has been still for IDLE_SHOW_S
    if (gearEl) {
      idleT += dt;
      const show = idleT >= IDLE_SHOW_S;
      if (show !== gearEl.classList.contains('show')) gearEl.classList.toggle('show', show);
      if (!show && panelOpen) togglePanel(false);
    }
    // ?debug strip: ~2 Hz poll, and never let a debug read throw the module
    if (debugOn && debugTxt) {
      debugAcc += dt;
      if (debugAcc > 0.5) {
        debugAcc = 0;
        try {
          const st = window.ZS?.audio?.state?.();
          const dir = c.fruits;
          const lat = st && st.outputLatency != null ? ` · lat ${(st.outputLatency * 1000) | 0}ms` : '';
          const txt = st
            ? `L${dir?.level ?? '?'} ${c.score?.levelName ?? ''} · ${st.chord} · ${st.bpm} bpm · bloom ${st.bloom}${lat}`
            : `L${dir?.level ?? '?'} ${c.score?.levelName ?? ''}`;
          if (debugTxt.textContent !== txt) debugTxt.textContent = txt;
        } catch (_) { /* diagnostic only */ }
      }
    }
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
      // prefers-reduced-motion (r21): the callout appears and fades in place —
      // no punch, no travel, no tilt. Same information, still air.
      const pop = reducedMotion ? 1
        : f.t < 0.09
          ? 0.55 + (POP_MAX - 0.55) * (f.t / 0.09)
          : POP_MAX - (POP_MAX - 1) * Math.min(1, (f.t - 0.09) / 0.17);
      // RISE: fast out of the cut, then eased, so the eye is pulled up off the
      // fruit rather than the text drifting away at a constant speed.
      // riseK 1 = the combo's upward pull; a negative riseK (the penalty)
      // sinks the callout the same eased way, just shorter and downward
      const rise = reducedMotion ? 0
        : -RISE_MAX * (f.riseK ?? 1) * (1 - Math.pow(1 - Math.min(1, f.t / 0.75), 2));
      // Hold full opacity for the first 55% of life; a callout that starts
      // fading immediately never reads at all on a 120 Hz display.
      const fade = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
      f.el.style.transform =
        `translate(-50%,-50%) translateY(${rise.toFixed(1)}px) `
        + `rotate(${reducedMotion ? 0 : f.tilt}deg) scale(${(pop * f.fit).toFixed(3)})`;
      f.el.style.opacity = fade.toFixed(3);
      if (f.t > f.life) { f.el.remove(); floats.splice(i, 1); }
    }
  };

  return api;
}
