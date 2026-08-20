/**
 * native.js — the Capacitor shell bootstrap (r26). Everything here reads the
 * `window.Capacitor` global the native bridge injects; nothing is imported,
 * so the web build carries zero wrapper bytes and the PWA behaves exactly as
 * before. In the shell:
 *   - StatusBar.hide()  — the game owns the whole screen (Info.plist already
 *     hides it at launch; this covers returns from system UI);
 *   - KeepAwake.keepAwake() — a zen game is exactly the app someone stares
 *     at without touching for 20 seconds; the screen must not dim mid-level.
 * Haptics' native backend lives in input/haptics.js, same pattern.
 * Every call is fire-and-forget and try/caught: a missing plugin degrades to
 * a no-op, never to a retired module.
 */
export function initNative() {
  try {
    const C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return false;
    const P = C.Plugins || {};
    try { const p = P.StatusBar?.hide?.(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* */ }
    try { const p = P.KeepAwake?.keepAwake?.(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* */ }
    return true;
  } catch (_) { return false; }
}
