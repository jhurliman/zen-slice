/**
 * haptics.js — touch you can feel (r21, actuator rebuilt r23). A thin module
 * that maps game events to pulses; the EVENT MAPPING here is the durable
 * contract, the actuator is a backend chosen at init:
 *
 *  · `navigator.vibrate` where it exists (Android Chrome) — real patterns,
 *    intensity by duration.
 *  · THE iOS LABEL-CLICK TECHNIQUE (r23): WebKit has never shipped the
 *    Vibration API, but Safari 17.4+ gives `<input type="checkbox" switch>`
 *    a system haptic tick when toggled. r21 fired `input.click()` directly
 *    and the latest iOS stopped honoring that; the working form — the
 *    technique behind ios-vibrator-pro-max (MIT, Sam Denty,
 *    https://github.com/samdenty/ios-vibrator-pro-max) — is:
 *      1. wrap the switch in an UNSTYLED empty <label> (an empty label
 *         renders nothing — never hide the label itself with opacity /
 *         pointer-events / offscreen positioning, WebKit then skips the
 *         haptic) and hide only the INPUT with display:none — then call
 *         `label.click()`, never input.click();
 *      2. the click only ticks inside a ~850 ms GRANT opened by a trusted
 *         COMPLETED interaction — click / touchend / keyup / keypress, the
 *         reference's exact set — tracked here the same way;
 *      3. patterns = repeated label.click() ~27 ms apart, each re-checked
 *         against the grant (a timer tick outside the grant is a no-op, not
 *         an error).
 *    Still unofficial and version-fragile: every call is try/caught so a
 *    Safari change degrades to silence, never to a retired module (main.js
 *    safe() would otherwise bench us for the session).
 *  · neither → the module is inert.
 *
 * When the game wraps in Capacitor, only the backend swaps (for
 * UIImpactFeedbackGenerator impacts); the mapping below already encodes what
 * each moment should feel like: slices are light ticks scaled by blade
 * speed, a big harmony is a double tap, a rock is a dull heavy knock, a
 * level is a soft arrival.
 */

import { loadPrefs } from '../core/prefs.js';

const MIN_GAP = 0.05;    // seconds between pulses — a buzz is not a texture
const GRANT_MS = 850;    // iOS: how long after a trusted event a click ticks
const TAP_GAP_MS = 27;   // iOS: spacing between clicks when emulating duration

export function createHaptics() {
  const api = { backend: 'none' };
  let enabled = true;
  let lastPulse = -1e9;
  let labelEl = null;
  let lastTrusted = -1e9;   // performance.now() ms of the last trusted user event

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
        // r25 — MIRROR ios-vibrator-pro-max EXACTLY, because "almost" did not
        // tick (the player: "haptics are not working"). Its hidden trigger is
        // an UNSTYLED empty <label> wrapping a display:none input, sitting in
        // a bare container div in the normal flow: zero visual footprint
        // because an empty label renders nothing. The r24 version hid the
        // label itself (opacity:0, pointer-events:none, offscreen) and any of
        // those can make WebKit treat the control as non-interactive and skip
        // the system haptic. No styling on the label, ever.
        i.setAttribute('switch', '');
        i.setAttribute('style', 'display: none !important');
        i.tabIndex = -1;
        const l = document.createElement('label');
        l.tabIndex = -1;
        l.appendChild(i);
        const holder = document.createElement('div');
        holder.setAttribute('aria-hidden', 'true');
        holder.appendChild(l);
        document.body.appendChild(holder);
        labelEl = l;
        return 'switch';
      }
    } catch (_) { /* */ }
    return 'none';
  }

  /** One system tick, iff the grant is open. Safe to call from timers. */
  function tapSwitch() {
    try {
      if (labelEl && performance.now() - lastTrusted < GRANT_MS) labelEl.click();
    } catch (_) { /* degrade to silence, never retire the module */ }
  }

  /** One pulse. ms drives duration on the vibrate backend; on iOS, longer
   *  pulses become a couple of system ticks TAP_GAP_MS apart. */
  function pulse(ms) {
    if (!enabled || api.backend === 'none') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = performance.now() / 1000;
    if (now - lastPulse < MIN_GAP) return;
    lastPulse = now;
    try {
      if (api.backend === 'vibrate') { navigator.vibrate(ms); return; }
      tapSwitch();
      if (ms >= 30) setTimeout(tapSwitch, TAP_GAP_MS);
    } catch (_) { /* */ }
  }
  function pattern(arr) {
    if (!enabled || api.backend === 'none') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = performance.now() / 1000;
    if (now - lastPulse < MIN_GAP) return;
    lastPulse = now;
    try {
      if (api.backend === 'vibrate') { navigator.vibrate(arr); return; }
      // no true patterns on iOS: render [on, off, on, …] as one tick at each
      // ON boundary — every delayed tick re-checks the grant inside tapSwitch
      tapSwitch();
      let at = 0;
      for (let i = 0; i + 1 < arr.length; i += 2) {
        at += arr[i] + arr[i + 1];
        setTimeout(tapSwitch, Math.max(TAP_GAP_MS, at));
      }
    } catch (_) { /* */ }
  }

  api.init = (c) => {
    enabled = loadPrefs().haptics !== false;
    api.backend = detectBackend();
    if (api.backend === 'none') return;   // inert — listeners would be dead weight

    if (api.backend === 'switch') {
      // the grant tracker — ios-vibrator-pro-max's EXACT event set: click,
      // touchend, keyup, keypress. These are completed-interaction events;
      // r24 listened to pointerdown/move too and assumed they renewed the
      // OS-side window, but the reference implementation deliberately does
      // not, and it is the one known to work. Practical consequence for a
      // slicing game: the grant that covers a stroke's slices is the one
      // opened by the PREVIOUS touch's end (or the unlock tap) — strokes are
      // short and frequent, so in play the window is nearly always open.
      // Events from our own label/input are skipped (ivpm does the same) so
      // a click echo can never look like a fresh grant.
      const touch = (e) => {
        if (!e.isTrusted) return;
        if (labelEl && (e.target === labelEl || e.target === labelEl.firstChild)) return;
        lastTrusted = performance.now();
      };
      ['click', 'touchend', 'keyup', 'keypress']
        .forEach((ev) => window.addEventListener(ev, touch, { passive: true, capture: true }));
    }

    c.bus.on('slice', (e) => pulse(6 + Math.round(vel(e.stroke.speed) * 10)));
    // r22: the double-tap keys to the HARMONY (fruit in one stroke) — one
    // gesture, one feel — not the cross-stroke phrase chain
    c.bus.on('harmony', (e) => { if (e.size >= 3) pattern([12, 30, 12]); });
    c.bus.on('rockhit', () => pulse(40));
    c.bus.on('level', () => pulse(18));
    c.bus.on('pref', (e) => { if (e.key === 'haptics') enabled = !!e.value; });
  };

  api.dispose = () => { try { labelEl?.parentNode?.remove(); } catch (_) { /* */ } };

  return api;
}
