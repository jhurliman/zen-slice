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

// ══ r43b: THE SESSION MIRROR ════════════════════════════════════════════════
// "private mode: the choice still applies this session" is what the catch below
// used to claim, and it was not true. Every reader called loadPrefs(), which
// re-read localStorage; when setItem throws there is nothing there to read, so
// the next read handed back DEFAULTS and the choice evaporated between one tap
// and the next.
//
// Raised in review of PR #31 against the graphics button, where the failure is
// most visible — it cycles auto -> low -> med -> ... by looking up the CURRENT
// value, so with no persistence every tap computed `low` from `auto` and the
// player could never reach med, high, ultra, or get back to auto. But the
// review named a symptom, not the bug: `sound` and `haptics` flip by reading
// their own stored value too, so in private mode they could be turned off and
// never back on. Fixing it in the HUD would have fixed one button; fixing it
// here fixes the class, and makes savePref's own promise honest.
//
// Writes land in this mirror FIRST, and reads overlay it on top of storage, so
// persistence is now the thing that can fail rather than the thing everything
// depends on.
let session = null;

export function loadPrefs() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* */ }
  return Object.assign({}, DEFAULTS, stored && typeof stored === 'object' ? stored : {}, session || {});
}

export function savePref(key, value) {
  (session || (session = {}))[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(loadPrefs()));
  } catch (_) { /* private mode: the choice still applies this session — above */ }
}
