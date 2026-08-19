/**
 * haptics.js — touch you can feel (r21). A thin module that maps game events
 * to pulses; the EVENT MAPPING here is the durable contract, the actuator is
 * a backend chosen at init:
 *
 *  · `navigator.vibrate` where it exists (Android Chrome) — real patterns,
 *    intensity by duration.
 *  · THE iOS SWITCH HACK, guarded: WebKit has never shipped the Vibration
 *    API, but Safari 17.4+ gives `<input type="checkbox" switch>` a system
 *    haptic tick when toggled — and a programmatic .click() fired
 *    SYNCHRONOUSLY inside a user-gesture handler triggers it. Slice/rockhit
 *    events dispatch synchronously from the pointer handler, so the gesture
 *    context holds. One fixed intensity, unofficial, version-fragile — every
 *    call is try/caught so a Safari change degrades to silence, never to a
 *    retired module (main.js safe() would otherwise bench us for the
 *    session).
 *  · neither → the module is inert.
 *
 * When the game wraps in Capacitor, only the backend swaps (for
 * UIImpactFeedbackGenerator impacts); the mapping below already encodes what
 * each moment should feel like: slices are light ticks scaled by blade
 * speed, a big combo is a double tap, a rock is a dull heavy knock, a level
 * is a soft arrival.
 */

import { loadPrefs } from '../core/prefs.js';

const MIN_GAP = 0.05;   // seconds between pulses — a buzz is not a texture

export function createHaptics() {
  const api = { backend: 'none' };
  let enabled = true;
  let lastPulse = -1e9;
  let switchEl = null;

  // the same log velocity law audio.js uses, over the measured 5–170 range
  const vel = (speed) => Math.min(1, Math.max(0, Math.log(Math.max(1e-3, speed / 5)) / Math.log(34)));

  function detectBackend() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') return 'vibrate';
    } catch (_) { /* */ }
    try {
      const i = document.createElement('input');
      i.type = 'checkbox';
      if ('switch' in i) {
        switchEl = i;
        i.setAttribute('switch', '');
        // present but invisible and inert to layout/readers
        i.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px;top:-99px;';
        i.setAttribute('aria-hidden', 'true');
        i.tabIndex = -1;
        document.body.appendChild(i);
        return 'switch';
      }
    } catch (_) { /* */ }
    return 'none';
  }

  /** One pulse. ms drives duration on the vibrate backend; the switch hack
   *  has a single fixed intensity. `reps` taps the switch again on the next
   *  events for a double-tap feel where duration can't express it. */
  function pulse(ms) {
    if (!enabled || api.backend === 'none') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = performance.now() / 1000;
    if (now - lastPulse < MIN_GAP) return;
    lastPulse = now;
    try {
      if (api.backend === 'vibrate') navigator.vibrate(ms);
      else if (switchEl) switchEl.click();
    } catch (_) { /* degrade to silence, never retire the module */ }
  }
  function pattern(arr) {
    if (!enabled || api.backend === 'none') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = performance.now() / 1000;
    if (now - lastPulse < MIN_GAP) return;
    lastPulse = now;
    try {
      if (api.backend === 'vibrate') navigator.vibrate(arr);
      else if (switchEl) {
        // the switch has no patterns: tap now, tap once more shortly after —
        // the second is a timer, outside the gesture, and may be dropped by
        // Safari; the first always lands, which is the one that matters
        switchEl.click();
        setTimeout(() => { try { switchEl.click(); } catch (_) { /* */ } }, 60);
      }
    } catch (_) { /* */ }
  }

  api.init = (c) => {
    enabled = loadPrefs().haptics !== false;
    api.backend = detectBackend();
    if (api.backend === 'none') return;   // inert — listeners would be dead weight

    c.bus.on('slice', (e) => pulse(6 + Math.round(vel(e.stroke.speed) * 10)));
    c.bus.on('combo', (e) => { if (e.count >= 3) pattern([12, 30, 12]); });
    c.bus.on('rockhit', () => pulse(40));
    c.bus.on('level', () => pulse(18));
    c.bus.on('pref', (e) => { if (e.key === 'haptics') enabled = !!e.value; });
  };

  api.dispose = () => { try { switchEl?.remove(); } catch (_) { /* */ } };

  return api;
}
