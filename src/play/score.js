/**
 * score.js — deliberately shallow progression. Combo, streak, zen level.
 *
 * No fail state, no bombs, no timer. The only pressure is the gentle pull of a
 * combo window that rewards slicing two or three things in one arc.
 *
 * ⚠ NO TIME DILATION, EVER. r11 removed a per-cut slow-mo reward after the
 * player called it out ("it slows down every time i slice… get rid of it") —
 * a deliberate 3x dilation is indistinguishable from a frame hitch, and it
 * also made every sim-time measurement downstream a fiction. The combo reward
 * is visual/audible only. No screen shake either — the founding spec asks for
 * "relaxing, meditative".
 */
import { nowSec } from '../core/contract.js';
import { loadPrefs, savePref } from '../core/prefs.js';

// Real seconds, NOT sim seconds: a player's hand moves in real time.
// 0.63 is the r26 tuning (the player asked for "like 15% easier" over the
// original 0.55, from real sessions).
//
// r27 — BEAT-SYNCED, at the player's explicit request ("make the combo
// window beat synced, that makes a lot more sense"). The window is now ONE
// BEAT at the conductor's inferred tempo: audio.js publishes ctx.beatSec
// each frame (60/bpm over the 60–90 bpm range → 1.00–0.67 s), clamped to
// [0.60, 1.00] here so a missing/retired audio module, ?nosound, or any
// out-of-range publish degrades to r26's feel, never to nonsense. The
// elegance is that tempo FOLLOWS the player's slicing cadence, so a calm
// player gets a roomy 1 s window and a fast player a tight one — the chain
// self-balances, and keeping the phrase alive means literally staying on
// the music's beat.
const COMBO_WINDOW_FALLBACK = 0.63;

export function createScore() {
  const api = { score: 0, combo: 0, best: 0, total: 0, level: 0, levelName: 'Still Water', bestScore: 0 };
  let ctx, lastSliceT = -1e9;
  // r36: THE SCORE IS THE STREAK. A rock resets it to zero (see the rockhit
  // handler), so `score` now measures how far a run has come since the last
  // stone — and `bestScore` (the peak ever reached, already tracked below)
  // becomes the best streak, not a monotonic function of time played.
  // Entering the coda FREEZES it: Deep Calm is rock-free and endless, so the
  // score you arrive with is the run's final word — the coda is the victory
  // lap, not a farm.
  let frozen = false;
  // r36: Game Center, through the injected global like haptics.js — a no-op
  // outside the shell. Rides the same rate-limited moments as savePref so
  // the network sees a submit per milestone, not per slice. The leaderboard
  // id lives in GameCenterPlugin.swift; failures are silent by design.
  const gcSubmit = (v) => {
    try { window.Capacitor?.Plugins?.GameCenter?.submitScore?.({ value: v | 0 }); } catch (_) { /* */ }
  };
  const persistBest = () => { savePref('bestScore', api.bestScore); gcSubmit(api.bestScore); };
  // r21: the all-time best persists (prefs.js/localStorage). Saved at most
  // every few seconds — a write per slice would be storage churn for nothing —
  // and announced ONCE per session the moment it is first exceeded, so the
  // HUD can whisper 'personal best' exactly when it happens.
  let lastBestSave = -1e9, announcedBest = false;
  // ══ r22: HARMONY vs PHRASE — two concepts this file used to conflate ══════
  // HARMONY is one stroke through several fruit: the sound engine already
  // gathers those cuts into one rolled chord, and the callout now names what
  // it plays — DYAD/TRIAD/CHORD/FLOURISH. Grouped here by e.strokeId (stamped
  // at hit time in slicer.js); a group closes 150 ms after its last cut,
  // which covers r19-perf's one-cut-per-fixed-step drain.
  // PHRASE is the beat-synced cross-stroke chain below — the score
  // multiplier (window = one beat since r27) — acknowledged with one whisper
  // only when a run of 6+ ends naturally (not on a rockhit: the stone owns
  // that moment).
  let hStrokeId = -1, hSize = 0, hGain = 0, hAt = null, hCloseT = -1e9;

  // the live window: one beat at the inferred tempo, clamped (see the
  // COMBO_WINDOW_FALLBACK note above). Exposed on the api for the probe.
  api.comboWindow = () =>
    Math.max(0.60, Math.min(1.00, (ctx && ctx.beatSec) || COMBO_WINDOW_FALLBACK));

  api.init = (c) => {
    ctx = c;
    api.bestScore = Math.max(0, loadPrefs().bestScore | 0);
    c.bus.on('slice', (e) => {
      const now = e.stroke.t;
      if (now - lastSliceT < api.comboWindow()) api.combo++; else api.combo = 1;
      lastSliceT = now;
      const peak = api.combo > api.best;
      api.best = Math.max(api.best, api.combo);
      api.total++;

      const base = Math.round(10 * (e.fruit.species.mass * 0.5 + 0.8));
      // 0.35 -> 0.50. This is the compensation for deleting slow-mo, and it is
      // the whole of it. The combo used to buy four things: a bigger number, a
      // higher chime, the HUD callout, and a time dilation. Three survive, so
      // the number moves further. A 3-chain of watermelons (mass 3.2, base 24)
      // paid 24 + 32 + 41 = 97 and now pays 24 + 36 + 48 = 108; the +11% lands
      // on the HUD score pop, which eases the displayed total at 9/s (hud.js)
      // and is the thing a player actually watches move. Anything stronger
      // than this starts to read as a slot machine.
      const mult = 1 + (api.combo - 1) * 0.50;
      // r36: frozen (the coda) awards nothing — gain 0 keeps every downstream
      // consumer honest for free: the score stands still, the best cannot
      // move, and the harmony callout drops its +N line (hud checks gain > 0).
      // The combo chain itself keeps running: the music's shimmer and the
      // beat-synced window are sustained-play cues, not score.
      const gain = frozen ? 0 : Math.round(base * mult);
      api.score += gain;

      if (api.score > api.bestScore) {
        if (api.bestScore > 0 && !announcedBest) {
          announcedBest = true;
          c.bus.emit('newbest', { score: api.score });
        }
        api.bestScore = api.score;
        const now = nowSec();
        if (now - lastBestSave > 5) { lastBestSave = now; persistBest(); }
      }

      // The chain signal on the bus — PHRASE semantics (r22): audio's shimmer
      // and chord-clock nudge are sustained-play cues, so they keep consuming
      // this unchanged. The event keeps its historical internal name; nothing
      // player-facing renders it any more (hud renders 'harmony'/'phrase').
      //   mult  the live score multiplier, 1.5 at 2x, 2.0 at 3x, ...
      //   gain  points this cut actually awarded (what the score pop is worth)
      //   peak  true only on a cut that sets a new best chain for the session
      if (api.combo >= 2) {
        c.bus.emit('combo', { count: api.combo, at: e.stroke.at.clone(), mult, gain, peak });
      }

      // harmony accumulator (r22): group this stroke's cuts
      if (e.strokeId !== hStrokeId) {
        flushHarmony();
        hStrokeId = e.strokeId ?? -1;
        hSize = 0; hGain = 0;
      }
      hSize++;
      hGain += gain;
      hAt = e.stroke.at;
      hCloseT = nowSec() + 0.15;
    });
    c.bus.on('level', (e) => {
      api.level = e.level; api.levelName = e.name;
      // r36: the coda flag rides the level event (director owns LEVELS).
      // Set, not latched — the ?debug level remote can jump back out.
      frozen = !!e.coda;
    });

    // the rate-limited save above can be up to 5 s stale — flush it when the
    // app backgrounds, which on a phone is how sessions actually end
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && api.bestScore > (loadPrefs().bestScore | 0)) {
        persistBest();
      }
    });

    // r21b: 'reset' (director.reset — the settings glyph's BEGIN AGAIN, and
    // the harness's ZS.clear) starts a fresh scoring session too. Everything
    // session-scoped goes back to zero; the persisted bestScore survives, and
    // a fresh run may whisper 'personal best' again when it passes it.
    c.bus.on('reset', () => {
      api.score = 0; api.combo = 0; api.best = 0; api.total = 0;
      api.level = 0; api.levelName = 'Still Water';
      lastSliceT = -1e9;
      announcedBest = false;
      frozen = false;
      // discard (not flush) any open harmony group — a reset mid-stroke
      // must not emit a callout into the fresh session
      hStrokeId = -1; hSize = 0; hGain = 0; hAt = null; hCloseT = -1e9;
    });

    // ══ r20→r36: THE ROCK RESETS THE STREAK ═════════════════════════════════
    // r20's −25 was a mosquito bite: at any depth into a run it cost one good
    // cut, so the rock read as flavor, not stakes. r36 makes the score BE the
    // streak — a struck stone takes all of it, the way a phrase ends when you
    // miss the beat. The stakes now scale with how far you've come, which is
    // exactly the tension a zen game can afford: nothing is lost but the
    // number, the music and the level keep going, and bestScore (the peak,
    // persisted) is the memory of your deepest run. The combo chain breaks
    // too (lastSliceT → −∞ so the next slice starts fresh), and the
    // 'penalty' event carries what was actually taken — the HUD already
    // refuses to show a number when nothing was (taken 0 = STONE alone).
    // In the coda there are no rocks by design; the frozen score is safe.
    c.bus.on('rockhit', (e) => {
      api.combo = 0;
      lastSliceT = -1e9;
      const pen = api.score;
      api.score = 0;
      c.bus.emit('penalty', { amount: pen, taken: pen, at: e.at.clone() });
    });
  };

  /** Close the open harmony group; strokes of 2+ become a callout. */
  function flushHarmony() {
    if (hSize >= 2 && hAt) {
      ctx.bus.emit('harmony', { size: hSize, gain: hGain, at: hAt.clone(), flourish: hSize >= 5 });
    }
    hStrokeId = -1; hSize = 0; hGain = 0; hAt = null; hCloseT = -1e9;
  }

  api.frame = () => {
    const now = nowSec();
    if (api.combo && now - lastSliceT > api.comboWindow()) {
      // a sustained run ending on its own terms earns the phrase whisper —
      // a chain broken by a rock does not (see the rockhit handler)
      if (api.combo >= 6) ctx.bus.emit('phrase', { length: api.combo });
      api.combo = 0;
    }
    if (hSize && now > hCloseT) flushHarmony();
  };

  return api;
}
