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
// defaults OFF, and the toggle itself only exists when build.mjs allows it.
// `gfx` (r40) is the one pref that is not a boolean: 'auto' | 'low' | 'med' |
// 'high' | 'ultra'. 'auto' means the perf governor owns quality, which is the
// right default for everyone who never opens the panel; the named levels pin
// it and turn the governor off. main.js validates the string against
// GFX_MODES, so a hand-edited localStorage cannot wedge the renderer.
const DEFAULTS = Object.freeze({
  sound: true, haptics: true, bestScore: 0, debug: false, gfx: 'auto',
});

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
