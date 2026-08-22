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

// The debug strip is reachable two ways: ?debug (dev URLs) and a settings
// toggle (pref 'debug') — hearing each level's music still needs the remote
// ON DEVICE, where editing a URL is friction. build.mjs compiles
// __ZS_DEBUG_UI__ to false for App Store builds (APPSTORE=1): the toggle
// never renders and neither path can enable the strip there. The typeof
// guard keeps unbundled imports (node tools) working, where the identifier
// was never defined.
const DEBUG_UI_ALLOWED = typeof __ZS_DEBUG_UI__ === 'undefined' || !!__ZS_DEBUG_UI__;

export function createHud() {
  const api = {};
  let ctx, root, scoreEl, multEl, levelEl, comboLayer, hintEl, flagEl, scoreWrap;
  let debugOn = false, debugEl = null, debugTxt = null, debugAcc = 0;
  let shownScore = 0;
  const floats = [];
  // r21: the settings glyph and its three-row panel; idle is TOUCH idle —
  // the director tosses fruit whether or not anyone plays, so "no fruit in
  // the air" never holds and the sky's quiet is measured at the fingertip
  let settingsEl = null, panelEl = null, gearEl = null, titleEl = null;
  let idleT = 0, panelOpen = false, captureMode = false, reducedMotion = false;
  let swipeCount = 0;
  const IDLE_SHOW_S = 3;

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
      <div class="zs-score"><span id="zs-num">0</span><span class="zs-mult" id="zs-mult"></span></div>
      <div class="zs-level" id="zs-level"></div>
      <div class="zs-combos" id="zs-combos"></div>
      <div class="zs-hint" id="zs-hint">swipe to slice</div>
      <div class="zs-flag" id="zs-flag"></div>`;
    document.body.appendChild(root);
    scoreEl = root.querySelector('#zs-num');
    scoreWrap = root.querySelector('.zs-score');
    multEl = root.querySelector('#zs-mult');
    levelEl = root.querySelector('#zs-level');
    comboLayer = root.querySelector('#zs-combos');
    hintEl = root.querySelector('#zs-hint');
    flagEl = root.querySelector('#zs-flag');

    c.bus.on('level', (e) => {
      levelEl.textContent = e.name;
      levelEl.classList.remove('show'); void levelEl.offsetWidth;
      levelEl.classList.add('show');
      // the coda retires the score readout: Deep Calm is endless and
      // rock-free, the number is frozen (r36) — a dead readout is chrome,
      // not information. The 'level' event already carries `coda` for
      // exactly this kind of consumer; any non-coda level (begin again's
      // level-0 re-announce, the ?debug remote) brings it back.
      scoreWrap.classList.toggle('coda', !!e.coda);
    });
    // a bus-level reset (harness ZS.clear, director.reset) restores the
    // readout even when no 'level' event follows
    c.bus.on('reset', () => scoreWrap.classList.remove('coda'));
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
      // DYAD/TRIAD carry their count in the word; CHORD and FLOURISH show it
      // ("when I get a chord it just says CHORD, I don't know if I got 4 or 5")
      const l1 = e.size === 2 ? 'DYAD'
        : e.size === 3 ? 'TRIAD'
          : e.size === 4 ? 'CHORD · 4'
            : `FLOURISH · ${e.size}`;
      // r36: in the coda the score is frozen and strokes award 0 — show the
      // harmony's name alone rather than a fabricated +N (the penalty
      // callout's "never fabricate" rule, applied to the other direction)
      const g = Math.round(e.gain ?? e.size);
      const l2 = g > 0 ? `+${g}` : '';
      el.innerHTML =
        `<span class="zs-c1" data-t="${l1}">${l1}</span>`
        + (l2 ? `<span class="zs-c2" data-t="${l2}">${l2}</span>` : '');

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
    let forceTitle = false;
    try {
      const q = new URLSearchParams(location.search || '');
      captureMode = q.has('capture') && q.get('capture') !== '0';
      debugOn = DEBUG_UI_ALLOWED
        && ((q.has('debug') && q.get('debug') !== '0') || loadPrefs().debug === true);
      forceTitle = q.has('title');
    } catch (_) { /* */ }
    try { reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { /* */ }
    window.addEventListener('pointerdown', (ev) => {
      // ══ r36: the title screen lets go on the first touch — checked BEFORE
      // the settings early-return so "tap anywhere" means anywhere (codex:
      // a tap landing on the idle gear used to open settings under the veil).
      // The same tap is audio.js's unlock gesture, so the music begins as the
      // name fades. The swipe hint was held silent underneath; it takes over.
      // The level name announces itself only now — play is what starts the day.
      if (titleEl) {
        const t = titleEl; titleEl = null;
        t.classList.add('out');
        root.classList.remove('zs-title-up');
        ctx.titleHold = false;
        setTimeout(() => t.remove(), 1000);
        if (hintEl) hintEl.classList.remove('hold');
        ctx.bus.emit('level', { level: 0, name: 'Still Water' });
        return;
      }
      if (settingsEl && ev.target && settingsEl.contains(ev.target)) return;
      idleT = 0;
      if (panelOpen) togglePanel(false);
      else if (gearEl) gearEl.classList.remove('show');
      if (++swipeCount >= 3 && hintEl) hintEl.classList.add('gone');
    }, { passive: true });

    // ══ r36: THE TITLE SCREEN ════════════════════════════════════════════════
    // The name, once, in the HUD's own voice, over the world already playing
    // behind a soft vignette. One functional line under it: this game is a
    // music instrument first, and phone speakers flatten it — say so at the
    // door, with a headphone outline in the hint's stroke weight. Suppressed
    // under ?capture (probes never tap, so it would sit in every DOM count);
    // ?title forces it back for design screenshots.
    if (!captureMode || forceTitle) {
      titleEl = document.createElement('div');
      titleEl.className = 'zs-title';
      titleEl.innerHTML =
        `<div class="zs-title-word">Chord Cut</div>`
        + `<div class="zs-title-sub">`
        + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"`
        + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
        + `<path d="M4 17.5v-5.2a8 8 0 0 1 16 0v5.2"/>`
        + `<rect x="3.2" y="14.2" width="4.2" height="6.2" rx="2.1"/>`
        + `<rect x="16.6" y="14.2" width="4.2" height="6.2" rx="2.1"/>`
        + `</svg>`
        + `<span>best experienced with headphones or surround audio</span>`
        + `</div>`
        + `<div class="zs-title-go">tap anywhere to begin</div>`;
      root.appendChild(titleEl);
      root.classList.add('zs-title-up');
      c.titleHold = true;
      if (hintEl) hintEl.classList.add('hold');
    }

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
        // the debug toggle exists only in non-App-Store builds (see
        // DEBUG_UI_ALLOWED above); note `=== true` — debug defaults OFF
        + (DEBUG_UI_ALLOWED ? `<button data-k="debug">debug ${p.debug === true ? 'on' : 'off'}</button>` : '')
        + `<button data-k="again">begin again</button>`
        // r36: the best streak, readable where the player already looks —
        // a non-interactive line in the panel's own voice, no new screen.
        // Refreshed at open (togglePanel), hidden entirely until a best exists.
        + `<div class="zs-pbest" id="zs-pbest"></div>`
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
        // debug is the HUD's own pref: build or tear down the strip live
        if (k === 'debug') { debugOn = now; setDebugStrip(now); }
        ctx.bus.emit('pref', { key: k, value: now });
      });
    }

    // ══ THE DEMO VEIL (web demo build only) ═════════════════════════════
    // director.js emits 'demoend' once, at the page-turn the demo withholds.
    // Same voice as the title: a veil, not a wall — the world keeps playing
    // and "keep slicing" lifts it. The CTA link needs pointer-events while
    // the veil itself takes none, so the blade keeps working underneath.
    c.bus.on('demoend', () => {
      const url = (typeof __ZS_APPSTORE_URL__ !== 'undefined' && __ZS_APPSTORE_URL__) || '';
      const el = document.createElement('div');
      el.className = 'zs-title zs-demo';
      el.innerHTML =
        `<div class="zs-title-word">The orchard continues</div>`
        + `<div class="zs-title-sub"><span>you have played three levels of ten — the rest of the day,`
        + ` game center streaks and haptics live in the iOS app</span></div>`
        + (url
          ? `<a class="zs-demo-cta" href="${url}" rel="noopener">get chord cut on the app store</a>`
          : `<div class="zs-demo-cta zs-demo-soon">coming soon to the app store</div>`)
        + `<div class="zs-title-go zs-demo-stay">keep slicing</div>`;
      document.body.appendChild(el);
      el.querySelector('.zs-demo-stay').addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        el.classList.add('out');
        setTimeout(() => el.remove(), 1000);
      });
    });

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
    // Diagnostic chrome, so it exists only behind the flag (or, since the
    // settings toggle, the 'debug' pref), like ?dropphys.
    // debugOn was parsed above alongside captureMode
    if (debugOn) setDebugStrip(true);

    // first level name — deferred to title dismissal when the title is up
    // (codex: the 700 ms timer used to fade "STILL WATER" through the veil)
    setTimeout(() => { if (!titleEl) c.bus.emit('level', { level: 0, name: 'Still Water' }); }, 700);
  };

  /** Build or tear down the debug strip — shared by init (?debug / stored
   *  pref) and the live settings toggle. */
  function setDebugStrip(on) {
    if (on && !debugEl) {
      debugEl = document.createElement('div');
      debugEl.className = 'zs-debug';
      debugEl.innerHTML = `<button id="zs-dbg-prev">◀</button>`
        + `<span id="zs-dbg-txt"></span>`
        + `<button id="zs-dbg-next">▶</button>`
        // r38g: COMBO TRIGGERS (HANDOFF item 3) — one tap stages an n-fruit
        // constellation and sweeps it, reproducing DYAD/TRIAD/CHORD/FLOURISH
        // on demand. Iterating on the reward moment's mix/timing by earning a
        // 5-fruit stroke by hand each attempt was the blocker.
        + `<button class="zs-dbg-combo" data-n="2">2</button>`
        + `<button class="zs-dbg-combo" data-n="3">3</button>`
        + `<button class="zs-dbg-combo" data-n="4">4</button>`
        + `<button class="zs-dbg-combo" data-n="5">5</button>`;
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
      // stage n fruit in a centered row, hanging near-still, then sweep them
      // with a bus stroke one frame later — the same ZS surface the probe
      // harness drives, so the whole gather/voice/reward path is the real one.
      // Mixed species so the voiced chord spans registers like a played one.
      const combo = (nn) => {
        const ZS = window.ZS;
        if (!ZS?.spawn || !ZS?.swipe) return;
        const kinds = ['orange', 'apple', 'kiwi', 'strawberry', 'pineapple'];
        const span = 0.75 * (nn - 1);
        const staged = [];
        for (let i = 0; i < nn; i++) {
          const f = ZS.spawn(kinds[i % kinds.length]);
          if (!f) continue;
          f.pos.set(-span / 2 + i * 0.75, 0.3, 0);
          f.vel.set(0, 1.0, 0);
          staged.push(f);
        }
        setTimeout(() => {
          // aim the sweep at where the fruit ACTUALLY are — they rise during
          // the settle, and a hardcoded row clipped the small species ("5
          // often gets me a triad"): project the survivors and sweep their
          // mean NDC row at swipe time, not the staging row
          const alive = staged.filter((f) => f && !f.dead);
          let y = 0.0;
          if (alive.length && ctx.camera) {
            for (const f of alive) y += f.pos.clone().project(ctx.camera).y;
            y /= alive.length;
          }
          ZS.newStroke(); ZS.swipe(-0.85, y, 0.85, y, 12, 6.0);
        }, 90);
      };
      for (const b of debugEl.querySelectorAll('.zs-dbg-combo')) {
        b.addEventListener('pointerdown', () => combo(b.dataset.n | 0));
      }
      debugAcc = 1;   // populate the text on the next frame, not in 500 ms
    } else if (!on && debugEl) {
      debugEl.remove();
      debugEl = null; debugTxt = null;
    }
  }

  function togglePanel(open) {
    panelOpen = open;
    if (panelEl) panelEl.classList.toggle('open', open);
    if (gearEl && open) gearEl.classList.add('show');
    // r36: refresh the best-streak line at open — score.js owns the live
    // value (ctx.score), prefs are the fallback before init. Empty until a
    // first best exists: "BEST 0" on a first launch is noise, not memory.
    if (open && panelEl) {
      const el = panelEl.querySelector('#zs-pbest');
      if (el) {
        const b = (ctx.score?.bestScore ?? loadPrefs().bestScore) | 0;
        el.textContent = b > 0 ? `best ${b}` : '';
      }
    }
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
      // ══ r38f: SAY WHEN A MODULE IS DEAD ════════════════════════════════
      // The r17 doctrine ("a prototype the player cannot SEE THE STATE OF is
      // untestable") applied to failure: safe() records a dead module and
      // logs it, but the phone has no console — a blade with dead input and
      // a healthy one looked IDENTICAL on device, twice. In dev builds
      // (DEBUG_UI_ALLOWED; App Store builds keep degrading silently — retail
      // players should never see scary red text) the first fault takes over
      // the flag badge unconditionally — no ?debug needed, because the whole
      // failure mode is "nobody thought to look".
      const faults = DEBUG_UI_ALLOWED ? (c.moduleErrors?.length | 0) : 0;
      if (faults) {
        const f0 = c.moduleErrors[0];
        const txt = `⚠ ${f0.module}.${f0.phase} DEAD${faults > 1 ? ` +${faults - 1} more` : ''} · ${f0.error.split('\n')[0].slice(0, 80)}`;
        if (flagEl.textContent !== txt) flagEl.textContent = txt;
        if (!flagEl.classList.contains('on')) flagEl.classList.add('on');
        if (!flagEl.classList.contains('fault')) flagEl.classList.add('fault');
      } else {
        if (flagEl.classList.contains('fault')) flagEl.classList.remove('fault');
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
    }
    const s = c.score?.score ?? 0;
    shownScore += (s - shownScore) * Math.min(1, dt * 9);
    scoreEl.textContent = Math.round(shownScore);
    // r25: the LIVE MULTIPLIER, next to the score. The phrase chain has been
    // driving mult silently since r22 and the player judged that too subtle
    // ("show your current multiplier next to your score at top when you have
    // one active"). Read straight off the score module each frame — combo is
    // zeroed there when the window expires, so this fades the moment the
    // chain dies. Text is left in place while fading so it never blanks
    // mid-transition.
    if (multEl) {
      const combo = c.score?.combo ?? 0;
      const on = combo >= 2;
      if (on) {
        const mult = 1 + (combo - 1) * 0.5;
        const txt = `×${mult % 1 ? mult.toFixed(1) : mult}`;
        if (multEl.textContent !== txt) multEl.textContent = txt;
      }
      if (on !== multEl.classList.contains('on')) multEl.classList.toggle('on', on);
    }
    // r21: the settings glyph earns its existence by absence — visible only
    // after the fingertip has been still for IDLE_SHOW_S
    if (gearEl) {
      if (!titleEl) idleT += dt;
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
          // r36 zombie triage: `rec N` = times the audio watchdog caught a
          // frozen-clock 'running' context after background/resume and
          // cycled it back to life. Absent = it never fired.
          const rec = st && st.recoveries ? ` · rec ${st.recoveries}` : '';
          // r26 haptics triage: `hap switch·12c` = backend + label.clicks
          // issued. Clicks rising but no buzz = WebKit swallows it in this
          // context (·SA marks a home-screen standalone app, the suspect);
          // clicks stuck at 0 = the grant never opens, the bug is ours.
          const hp = window.ZS?.haptics?.state?.();
          const hap = hp
            ? ` · hap ${hp.backend}${hp.enabled ? '' : '(off)'}·${hp.clicks}c${hp.standalone ? '·SA' : ''}`
            : '';
          // r27 mix meter: rms/peak dBFS + lo/mid/hi band magnitudes, straight
          // off the engine's post-voicing analyser — the numbers under a
          // device tuning session. Space names the current reverb room.
          const mt = window.ZS?.audio?.meter?.();
          const mix = mt ? ` · mix ${mt.rms}/${mt.peak} [${mt.lo} ${mt.mid} ${mt.hi}]` : '';
          // thermal-ratchet triage: live tier ≤ session ceiling + frame EMA.
          // On device, `T1≤1` after 15 min = the ratchet held; `T2≤3` cycling
          // = the chip recovered honestly.
          const g = window.ZS?.gov?.();
          // r39: ×S is the governor's render scale (with its own ratchet
          // ceiling when one is set). Silent at native — a strip that always
          // says ×1 teaches the eye to skip the slot that matters.
          const sc = g && (g.scale < 1 || g.sceil < 1)
            ? ` ×${g.scale}${g.sceil < 1 ? `≤${g.sceil}` : ''}` : '';
          const gv = g ? ` · T${g.tier}≤${g.ceil}${sc} ${g.ms}ms` : '';
          const txt = st
            ? `L${dir?.level ?? '?'} ${c.score?.levelName ?? ''} · ${st.chord} · ${st.bpm} bpm · ${st.space} · bloom ${st.bloom}${lat}${rec}${hap}${mix}${gv}`
            : `L${dir?.level ?? '?'} ${c.score?.levelName ?? ''}${hap}${gv}`;
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
