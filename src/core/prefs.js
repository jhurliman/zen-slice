/**
 * prefs.js — the whole persistence layer, deliberately this small (r21).
 *
 * Modules never import each other, but core utilities are shared (contract.js
 * precedent). hud.js WRITES prefs (it owns the settings glyph) and announces
 * live changes on the bus as 'pref' { key, value }; audio.js, haptics.js and
 * score.js READ their own keys at init. localStorage keeps the game's one
 * hard property intact — everything stays on the device, no network ever.
 *
 * Every touch of localStorage is try/caught: Safari in private browsing
 * throws on setItem, and a player in private mode should lose persistence,
 * not the game.
 */

const KEY = 'zs-prefs';
// `debug` gates the diagnostic strip (hud.js); unlike sound/haptics it
// defaults OFF, and the toggle itself only exists when build.mjs allows it
const DEFAULTS = Object.freeze({ sound: true, haptics: true, bestScore: 0, debug: false });

export function loadPrefs() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* */ }
  return Object.assign({}, DEFAULTS, stored && typeof stored === 'object' ? stored : {});
}

export function savePref(key, value) {
  try {
    const p = loadPrefs();
    p[key] = value;
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (_) { /* private mode: the choice still applies this session */ }
}
