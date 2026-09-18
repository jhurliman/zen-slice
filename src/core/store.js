/**
 * store.js — who owns the first day (1.2).
 *
 * POSITIONING. The ~18-minute arc, Still Water to Dreaming of Bliss, is THE
 * FIRST ALBUM — product `org.jhurliman.chordcut.album1`, shown as "The First
 * Day". Later packs (new levels, fruit, instruments) are their own products,
 * album2…; when the second one exists this module grows from one boolean to
 * an owned-set keyed by pack and the gate asks for the pack a level belongs
 * to. Nothing player-facing says "full game", so that transition is a
 * rename of nothing.
 *
 * Chord Cut is a free download with the first three levels open; one
 * non-consumable purchase unlocks the rest. This module owns that single
 * fact, `entitled`, and everything else asks it:
 *   - director.js withholds the page-turn to level 3 while !entitled and
 *     emits 'demoend' (the veil);
 *   - hud.js renders the veil from `price`/`native`, and calls purchase() /
 *     restore() from it.
 *
 * WHERE THE ANSWER COMES FROM, in order:
 *   - the web DEMO build (__ZS_DEMO__): never entitled — the veil sends
 *     people to the App Store, exactly as before 1.2;
 *   - any build outside the Capacitor shell, or a shell without the StoreKit
 *     plugin: entitled — `node build.mjs` is the whole game (README §License);
 *   - the shell: the CACHED answer from prefs first (so the gate is right
 *     offline and before StoreKit replies), then StoreKitPlugin.status()
 *     at boot, then again after every purchase()/restore(). The plugin does
 *     the grandfathering (paid 1.0/1.1 installs) and never rejects; a
 *     missing answer leaves the cache in place.
 * Every answer is announced on the bus as 'entitlement'
 *   { entitled, price, reason, outcome?, busy? }
 * so the veil can react while it is up.
 *
 * NEVER DOWNGRADE ON A GUESS. An answer whose `receipt` is "unavailable"
 * (the app receipt could not be read: offline on the first launch after the
 * update, or signed out of the App Store) is INCONCLUSIVE — it can raise
 * the entitlement (a purchase that verified) but never lower a cached
 * "owned" to "not owned", and it is retried every 30 s for a few minutes and
 * on every return to the foreground. A paid customer must never meet the
 * veil because the network was slow; that is the support ticket this
 * module exists to prevent.
 */
import { loadPrefs, savePref } from './prefs.js';

export function createStore() {
  const api = { native: false, entitled: true, price: '', reason: 'open', busy: false, ready: false };
  let ctx, plugin = null;

  const publish = (extra) => {
    ctx.bus.emit('entitlement', {
      entitled: api.entitled, price: api.price, reason: api.reason, busy: api.busy, ...extra,
    });
  };
  let retries = 0, retryT = 0;
  const take = (s, outcome) => {
    if (!s || typeof s !== 'object') { publish({ outcome: outcome || 'error' }); return; }
    if (typeof s.price === 'string' && s.price) api.price = s.price;
    const conclusive = s.receipt !== 'unavailable';
    if (s.entitled === true) {
      api.entitled = true; api.reason = s.reason || 'purchase';
    } else if (conclusive) {
      api.entitled = false; api.reason = s.reason || 'none';
    } else if (!api.entitled) {
      // inconclusive and nothing cached: ask again soon, without a tap
      if (retries < 10) { retries++; retryT = setTimeout(() => api.refresh(), 30000); }
    }
    if (conclusive || api.entitled) { api.ready = true; savePref('entitled', api.entitled); }
    publish({ outcome: s.outcome || outcome, message: s.message, receipt: s.receipt });
  };
  const call = (method) => {
    try {
      const p = plugin[method]();
      return p && p.then ? p : Promise.resolve(p);
    } catch (e) { return Promise.reject(e); }
  };
  const run = (method) => {
    if (!plugin) return Promise.resolve(null);
    if (api.busy) return Promise.resolve(null);
    api.busy = true;
    publish({ busy: true, outcome: 'busy' });
    return call(method).then((s) => { api.busy = false; take(s, method); return s; })
      .catch(() => { api.busy = false; publish({ outcome: 'error' }); return null; });
  };

  api.init = (c) => {
    ctx = c;
    if (typeof __ZS_DEMO__ !== 'undefined' && __ZS_DEMO__) {
      api.entitled = false; api.reason = 'demo'; api.ready = true;
      return;
    }
    try {
      const C = window.Capacitor;
      const P = (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins) || null;
      plugin = (P && P.StoreKit && typeof P.StoreKit.status === 'function') ? P.StoreKit : null;
    } catch (_) { plugin = null; }
    if (!plugin) return;   // the open build: the whole day
    api.native = true;
    api.entitled = loadPrefs().entitled === true;
    api.reason = api.entitled ? 'cached' : 'none';
    call('status').then((s) => take(s, 'status')).catch(() => { /* cache stands */ });
    // Transactions that complete OUTSIDE purchase() — an Ask to Buy approval,
    // a purchase on another device, a refund — arrive as the plugin's
    // 'entitlement' event (PR #51 review): the veil's "the orchard will open
    // when approval arrives" is only true if this lands while the app is up.
    try {
      const h = plugin.addListener?.('entitlement', (s) => take(s, 'update'));
      if (h && h.catch) h.catch(() => {});
    } catch (_) { /* older bridge: the foreground refresh below still covers it */ }
    // …and belt and braces: returning to the app re-asks while not owned
    // (the approval may have happened while we were in the background).
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !api.entitled && !api.busy) api.refresh();
    });
  };
  api.refresh = () => {
    if (!plugin) return Promise.resolve(null);
    clearTimeout(retryT);
    return call('status').then((s) => { take(s, 'status'); return s; }).catch(() => null);
  };
  api.purchase = () => run('purchase');
  api.restore = () => run('restore');

  return api;
}
