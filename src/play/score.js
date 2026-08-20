/**
 * score.js — deliberately shallow progression. Combo, streak, zen level.
 *
 * No fail state, no bombs, no timer. The only pressure is the gentle pull of a
 * combo window that rewards slicing two or three things in one arc.
 *
 * ── ROUND 11: SLOW MOTION IS GONE, AND THIS IS THE FILE THAT KILLED IT ───────
 * The human played the build for the first time and wrote:
 *
 *     "performance is not great. it slows down every time i slice, is there an
 *      intentional slo-mo effect? if so get rid of it, it's distracting."
 *
 * There was. This file used to end its `slice` handler with:
 *
 *     const depth = clamp(0.34 - (api.combo - 1) * 0.05, 0.16, 0.34);
 *     const dur   = clamp(0.30 + (api.combo - 1) * 0.12, 0.30, 0.85);
 *     c.bus.emit('slowmo', { scale: depth, seconds: dur });
 *
 * i.e. EVERY cut ran the world at a sixth to a third speed for 0.30-0.85 s.
 * It was built as a combo reward. It reads as the game stuttering every time
 * you do the one thing the game is about, which is the correct reading: a
 * frame-time hitch and a deliberate 3x time dilation are indistinguishable to
 * a player, and this game gave them one on every single input.
 *
 * ⚠ IT WAS ALSO CORRUPTING THE MEASUREMENT LOOP, WHICH IS THE BIGGER STORY.
 * main.js feeds its fixed-step accumulator `dt * ctx.timeScale`, so with
 * slow-mo live the screenshot harness's beat labels were fiction. Measured
 * (tools/simbeats.mjs, added this round, desktop, dark run) on the shipped
 * beat sheet, sim time elapsed since the cut:
 *
 *      label            BEFORE (slow-mo)      AFTER (this change)
 *      02-cut+33ms          16.7 ms               33.3 ms
 *      03-cut+100ms         41.7 ms              100.0 ms
 *      04-cut+250ms         91.7 ms              250.0 ms
 *      05-cut+500ms        241.7 ms              500.0 ms
 *      06-cut+1000ms       716.7 ms             1000.0 ms
 *      09-combo+50ms        25.0 ms               50.0 ms
 *      10-combo+200ms       75.0 ms              200.0 ms
 *      11-combo+550ms      283.3 ms              550.0 ms
 *
 * fluid.js's note (h) derived the 3x by hand and authored every juice lifetime
 * and drag constant against it. Those constants are now being sampled 2-2.4x
 * LATER in sim time than they were tuned for, which is one mechanical reason
 * the human sees the juice "disappear way too quickly". The beat labels now
 * mean what they say; fluid.js's RULE 2 block is obsolete and its lifetimes
 * want a re-read against the honest clock, not against the 3x correction.
 *
 * The combo reward is now entirely visual/audible: a fatter score jump (the
 * HUD score pop), the 'combo' callout, and the pentatonic chime that audio.js
 * already climbs with `ctx.score.combo`. Nothing here touches time. Do not put
 * a screen shake in either — the founding spec asks for "relaxing, meditative".
 */
import { nowSec } from '../core/contract.js';
import { loadPrefs, savePref } from '../core/prefs.js';

// Real seconds. NOT sim seconds: a player's hand moves in real time, and this
// is the only clock in the game that should stay wall-clock even if a future
// round reintroduces any kind of time scaling (it should not).
//
// ⚠ THIS NUMBER WAS TUNED WITH SLOW-MO LIVE AND IS DELIBERATELY UNCHANGED,
// WHICH IS A JUDGEMENT CALL — HERE IS THE EVIDENCE SO A LATER ROUND CAN
// OVERTURN IT. Slow-mo never touched the window itself (the window was always
// real seconds); what it changed is how far the world DRIFTS inside the
// window. Measured, simbeats.mjs, sim time elapsed in the 0.55 real seconds
// following a cut:  BEFORE 0.29 s   AFTER 0.55 s. So a two-stroke chain is
// genuinely ~1.9x harder now — the second fruit travels nearly twice as far
// before your second swipe lands.
//
// I did not widen the window to compensate, for two reasons:
//  1. The chain that matters in this game is ONE arc through two fruits, and
//     that resolves inside a few milliseconds; the window only governs
//     stroke-to-stroke chaining, which is the rarer case.
//  2. Widening it is the kind of quiet retune the brief explicitly asks not to
//     do on a hunch, and the direct evidence is ambiguous. simbeats.mjs
//     cadence probe, mean combo at the moment of each swipe, 24 real seconds:
//        level 5, swipe every 1.2 s:  BEFORE 1.60 (8 cuts) -> AFTER 2.25 (18)
//        level 5, swipe every 0.5 s:  BEFORE 1.73 (19)     -> AFTER 1.43 (20)
//     Those two disagree in sign, and the cut counts are not paired (the live
//     population differs once the clock changes), so neither is evidence of
//     anything. A real answer needs a human with a thumb, not this probe.
//
// r26 — THE HUMAN WITH A THUMB ANSWERED. The player, after real sessions:
// "It's quite difficult to keep a combo multiplier going given the slow
// nature of fruits tossing up in the air… maybe we could make it like 15%
// easier." 0.55 → 0.63 is exactly that 15%, and nothing else about the
// chain changes. (A beat-synced window — one beat at the inferred tempo is
// 0.67–1.0 s — was considered for the music tie-in and declined: it couples
// scoring to audio state in the last polish stage, and the player is
// explicitly risk-averse to structural changes now.)
const COMBO_WINDOW = 0.63;

export function createScore() {
  const api = { score: 0, combo: 0, best: 0, total: 0, level: 0, levelName: 'Still Water', bestScore: 0 };
  let ctx, lastSliceT = -1e9;
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
  // PHRASE is the COMBO_WINDOW cross-stroke chain below — the score
  // multiplier (window 0.63 s since r26, +15% by player request) — acknowledged with one whisper only when a
  // run of 6+ ends naturally (not on a rockhit: the stone owns that moment).
  let hStrokeId = -1, hSize = 0, hGain = 0, hAt = null, hCloseT = -1e9;

  api.init = (c) => {
    ctx = c;
    api.bestScore = Math.max(0, loadPrefs().bestScore | 0);
    c.bus.on('slice', (e) => {
      const now = e.stroke.t;
      if (now - lastSliceT < COMBO_WINDOW) api.combo++; else api.combo = 1;
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
      const gain = Math.round(base * mult);
      api.score += gain;

      if (api.score > api.bestScore) {
        if (api.bestScore > 0 && !announcedBest) {
          announcedBest = true;
          c.bus.emit('newbest', { score: api.score });
        }
        api.bestScore = api.score;
        const now = nowSec();
        if (now - lastBestSave > 5) { lastBestSave = now; savePref('bestScore', api.bestScore); }
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
    c.bus.on('level', (e) => { api.level = e.level; api.levelName = e.name; });

    // the rate-limited save above can be up to 5 s stale — flush it when the
    // app backgrounds, which on a phone is how sessions actually end
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && api.bestScore > (loadPrefs().bestScore | 0)) {
        savePref('bestScore', api.bestScore);
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
      // discard (not flush) any open harmony group — a reset mid-stroke
      // must not emit a callout into the fresh session
      hStrokeId = -1; hSize = 0; hGain = 0; hAt = null; hCloseT = -1e9;
    });

    // ══ r20: THE ROCK PENALTY ═══════════════════════════════════════════════
    // A fixed sting, not a scaling one: −25 is about one good combo cut, so a
    // careless swipe costs a moment's progress and never a session's. The
    // combo chain breaks (lastSliceT is pushed to −∞ so the NEXT slice starts
    // a fresh chain rather than inheriting the window), the score floors at
    // zero, and the 'penalty' event is the HUD's cue — same payload shape the
    // combo event set the precedent for.
    c.bus.on('rockhit', (e) => {
      api.combo = 0;
      lastSliceT = -1e9;
      const pen = Math.min(25, api.score);
      api.score -= pen;
      c.bus.emit('penalty', { amount: 25, taken: pen, at: e.at.clone() });
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
    if (api.combo && now - lastSliceT > COMBO_WINDOW) {
      // a sustained run ending on its own terms earns the phrase whisper —
      // a chain broken by a rock does not (see the rockhit handler)
      if (api.combo >= 6) ctx.bus.emit('phrase', { length: api.combo });
      api.combo = 0;
    }
    if (hSize && now > hCloseT) flushHarmony();
  };

  return api;
}
