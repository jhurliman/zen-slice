/**
 * storeprobe.mjs — the one purchase (1.2), end to end, against a MOCKED
 * Capacitor StoreKit bridge injected before boot. The real plugin
 * (ios/App/App/StoreKitPlugin.swift) is exercised on a device; this proves
 * everything on the JS side of the bridge:
 *   - the level-3 gate fires only while store.entitled is false, and the veil
 *     shows StoreKit's price and the restore line;
 *   - buying from the veil entitles, thanks, lifts, persists, and the next
 *     qualifying cut turns the page;
 *   - restore works the same way; a cancel leaves the veil (button restored);
 *   - the cached answer in prefs stands in while StoreKit is silent;
 *   - the settings row leads back to the veil after "keep slicing";
 *   - outside the shell the open build is the whole game: no gate, no veil.
 * Run after `node build.mjs`.
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import { resolveChrome, renderArgs } from './chromepath.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
let checks = 0;
const check = (name, cond, detail) => {
  checks++;
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`);
};

const indexPath = join(root, 'dist/index.html');
if (!existsSync(indexPath)) { console.error('dist/index.html missing — run `node build.mjs`'); process.exit(1); }
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(indexPath));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const exe = resolveChrome();
if (!exe) { console.error('storeprobe.mjs: no full Chromium found. Run: npx playwright install chromium'); process.exit(1); }
const browser = await chromium.launch({
  executablePath: exe,
  args: [...renderArgs(), '--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--disable-dev-shm-usage'],
});

/** The fake bridge. `cfg`: { entitled, price, hang, receipt: 'verified'|'unavailable', purchase: 'ok'|'cancel'|'pending'|'error', restore: 'ok'|'none' } */
const bridge = (cfg) => {
  window.__sk = { entitled: !!cfg.entitled, calls: [] };
  const snap = (extra) => ({
    entitled: window.__sk.entitled, price: cfg.price, receipt: cfg.receipt || 'verified',
    reason: window.__sk.entitled ? 'purchase' : 'none', ...extra,
  });
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      StoreKit: {
        addListener: (name, cb) => { window.__sk.listeners = window.__sk.listeners || {}; window.__sk.listeners[name] = cb; return Promise.resolve({ remove() {} }); },
        status: (o) => { window.__sk.calls.push(['status', o]); return cfg.hang ? new Promise(() => {}) : Promise.resolve(snap()); },
        purchase: (o) => {
          window.__sk.calls.push(['purchase', o]);
          if (cfg.purchase === 'cancel') return Promise.resolve(snap({ outcome: 'cancelled' }));
          if (cfg.purchase === 'pending') return Promise.resolve(snap({ outcome: 'pending' }));
          if (cfg.purchase === 'error') return Promise.reject(new Error('boom'));
          window.__sk.entitled = true;
          return Promise.resolve(snap({ outcome: 'purchased' }));
        },
        restore: (o) => {
          window.__sk.calls.push(['restore', o]);
          if (cfg.restore === 'ok') window.__sk.entitled = true;
          return Promise.resolve(snap({ outcome: 'restored' }));
        },
      },
    },
  };
};

const open = async (context, cfg, flags = 'capture=1&nosound=1&nophys=1') => {
  const page = await context.newPage();
  if (cfg) await page.addInitScript(bridge, cfg);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?${flags}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });
  await page.waitForTimeout(150);   // let status() land
  await page.evaluate(HELPERS);
  page.__errs = errs;
  return page;
};

// runs in the page: reach the level-2 gate with both gates satisfied, cut once
const reachGate = () => {
  const ZS = window.ZS, ctx = ZS.ctx, DT = 1 / 120;
  const step = (s, r = false) => ZS.step(DT, Math.round(s / DT), r);
  ZS.clear(); step(0.2);
  ZS.director.jumpLevel(2); step(3 * DT);
  ZS.director.sliced = 24; ZS.advance(111);
  window.__demoend = 0;
  ZS.bus.on('demoend', () => { window.__demoend++; });
  window.__cut = () => {
    const f = ZS.spawn('watermelon');
    f.pos.set(0, 1.2, 0); f.vel.set(0, 0.6, 0);
    step(2 * DT, true);
    const n = f.pos.clone().project(ctx.camera);
    ZS.newStroke?.(); ZS.swipe(n.x - 0.8, n.y, n.x + 0.8, n.y, 12, 7);
    step(0.3, true);
  };
  window.__cut();
  return { level: ZS.director.level, demoend: window.__demoend, entitled: ZS.ctx.store.entitled };
};
const HELPERS = `
window.__veil = () => {
  const el = document.querySelector('.zs-demo');
  return el ? {
    up: !el.classList.contains('out'), word: el.querySelector('.zs-title-word')?.textContent,
    sub: el.querySelector('.zs-title-sub')?.textContent, buy: el.querySelector('.zs-demo-buy')?.textContent ?? null,
    restore: !!el.querySelector('.zs-demo-restore'), link: el.querySelector('a.zs-demo-cta')?.textContent ?? null,
  } : null;
};
window.__tap = (sel) => { const el = document.querySelector(sel); if (!el) return false; el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; };
`;
const veil = () => window.__veil();
const tap = (sel) => window.__tap(sel);
const _unusedVeil = () => {
  const el = document.querySelector('.zs-demo');
  return el ? {
    up: !el.classList.contains('out'), word: el.querySelector('.zs-title-word')?.textContent,
    sub: el.querySelector('.zs-title-sub')?.textContent, buy: el.querySelector('.zs-demo-buy')?.textContent ?? null,
    restore: !!el.querySelector('.zs-demo-restore'), link: el.querySelector('a.zs-demo-cta')?.textContent ?? null,
  } : null;
};

// ── 1. a fresh shell install: not entitled, veil with price + restore, buy from it ──
console.log('\n── the shell, fresh ──');
const ctxA = await browser.newContext();
let page = await open(ctxA, { entitled: false, price: '$2.99', purchase: 'ok' });
let R = await page.evaluate(`(${(() => {
  const S = window.ZS.ctx.store;
  return { native: S.native, entitled: S.entitled, price: S.price, ready: S.ready, calls: window.__sk.calls.map((c) => c[0] + ':' + JSON.stringify(c[1])), prefsEntitled: (JSON.parse(localStorage.getItem('zs-prefs') || '{}')).entitled };
}).toString()})()`);
check('store sees the shell, not entitled, price from StoreKit', R.native === true && R.entitled === false && R.price === '$2.99' && R.ready === true, JSON.stringify(R));
check('status() was asked once at boot', R.calls.length === 1 && R.calls[0] === 'status:undefined', JSON.stringify(R.calls));
check('the cached answer was written to prefs', R.prefsEntitled === false, `prefs.entitled=${R.prefsEntitled}`);
let G = await page.evaluate(reachGate);
check('the page to level 3 is withheld and demoend fired once', G.level === 2 && G.demoend === 1, JSON.stringify(G));
let V = await page.evaluate(veil);
check('the veil shows the price and the restore line, no App Store link', V && V.up && V.buy === 'unlock the first day · $2.99' && V.restore === true && V.link === null, JSON.stringify(V));
R = await page.evaluate(() => { const e = document.elementFromPoint(215, 300); return { hit: e ? e.className.toString().slice(0, 40) : null, canvas: e && e.tagName === 'CANVAS' }; });
check('while the veil is up a swipe lands on the veil, not the canvas', R.canvas === false && /zs-veil-hold|zs-title/.test(R.hit || ''), JSON.stringify(R));
await page.evaluate(() => window.__tap('.zs-demo-buy'));
await page.waitForTimeout(100);
R = await page.evaluate(`(${(() => {
  const S = window.ZS.ctx.store;
  return { entitled: S.entitled, busy: S.busy, reason: S.reason, prefsEntitled: (JSON.parse(localStorage.getItem('zs-prefs') || '{}')).entitled, row: !!document.querySelector('button[data-k="unlock"]'), calls: window.__sk.calls.map((c) => c[0]) };
}).toString()})()`);
V = await page.evaluate(veil);
check('buying entitles and persists', R.entitled === true && R.busy === false && R.prefsEntitled === true, JSON.stringify(R));
check('the veil says thank you', V && V.up && V.word === 'The whole day is yours' && V.buy === null && V.restore === false, JSON.stringify(V));
await page.waitForTimeout(3000);
V = await page.evaluate(veil);
check('…and lifts itself', V === null, JSON.stringify(V));
G = await page.evaluate(() => { window.__cut(); return { level: window.ZS.director.level, demoend: window.__demoend }; });
check('the next qualifying cut turns the page to level 3', G.level === 3 && G.demoend === 1, JSON.stringify(G));
check('no page errors', page.__errs.length === 0, page.__errs.join(' | '));
await page.close();

// the ?debug level remote respects the gate while the day is not owned
page = await open(ctxA, { entitled: false, price: '$2.99', purchase: 'ok' });
await page.evaluate(() => { localStorage.removeItem('zs-prefs'); });
await page.close();
page = await open(ctxA, { entitled: false, price: '$2.99', purchase: 'ok' });
R = await page.evaluate(() => {
  const ZS = window.ZS; let de = 0; ZS.bus.on('demoend', () => de++);
  ZS.director.jumpLevel(5); ZS.step(1 / 120, 3, false);
  const a = { level: ZS.director.level, demoend: de, veil: !!document.querySelector('.zs-demo') };
  ZS.director.jumpLevel(7);
  const b = { level: ZS.director.level, demoend: de };
  window.__tap('.zs-demo-buy');
  return new Promise((res) => setTimeout(() => { ZS.director.jumpLevel(5); res({ a, b, c: { level: ZS.director.level, entitled: ZS.ctx.store.entitled } }); }, 60));
});
check('the level remote stops at level 2 and raises the veil while not owned (once)', R.a.level === 2 && R.a.demoend === 1 && R.a.veil && R.b.level === 2 && R.b.demoend === 1, JSON.stringify(R));
check('…and jumps freely once the day is owned', R.c.entitled === true && R.c.level === 5, JSON.stringify(R.c));
await page.close();

// ── 2. same install, relaunched with StoreKit silent: the cache stands ──
console.log('\n── the cache ──');
page = await open(ctxA, { entitled: false, price: '$2.99', hang: true });
R = await page.evaluate(() => { const S = window.ZS.ctx.store; return { entitled: S.entitled, reason: S.reason, ready: S.ready }; });
check('prefs answer first: entitled from the cache while status() never returns', R.entitled === true && R.reason === 'cached' && R.ready === false, JSON.stringify(R));
G = await page.evaluate(reachGate);
check('no veil, the page turns', G.level === 3 && G.demoend === 0, JSON.stringify(G));
await page.close();
// the receipt could not be read: an inconclusive "not entitled" must not take the day away
page = await open(ctxA, { entitled: false, price: '$2.99', receipt: 'unavailable' });
R = await page.evaluate(() => { const S = window.ZS.ctx.store; return { entitled: S.entitled, reason: S.reason, prefs: (JSON.parse(localStorage.getItem('zs-prefs') || '{}')).entitled }; });
check('receipt unavailable + cached owned: still owned, cache untouched', R.entitled === true && R.prefs === true, JSON.stringify(R));
await page.close();
page = await open(ctxA, { entitled: false, price: '$2.99', receipt: 'verified' });
R = await page.evaluate(() => { const S = window.ZS.ctx.store; return { entitled: S.entitled, prefs: (JSON.parse(localStorage.getItem('zs-prefs') || '{}')).entitled }; });
check('a VERIFIED not-entitled (refund) does take it away', R.entitled === false && R.prefs === false, JSON.stringify(R));
await page.close();

await ctxA.close();

// ── 3. restore, cancel, pending, the settings row ──
console.log('\n── restore / cancel / pending ──');
const ctxB = await browser.newContext();
page = await open(ctxB, { entitled: false, price: '2,99 €', purchase: 'cancel', restore: 'ok' });
G = await page.evaluate(reachGate);
V = await page.evaluate(veil);
check('localized price string is shown verbatim', V && V.buy === 'unlock the first day · 2,99 €', JSON.stringify(V));
await page.evaluate(() => window.__tap('.zs-demo-buy'));
await page.waitForTimeout(100);
V = await page.evaluate(veil);
R = await page.evaluate(() => { const S = window.ZS.ctx.store; return { entitled: S.entitled, busy: S.busy }; });
check('a cancelled purchase leaves the veil up with the button restored', V && V.up && V.buy === 'unlock the first day · 2,99 €' && R.entitled === false && R.busy === false, JSON.stringify({ V, R }));
await page.evaluate(() => window.__tap('.zs-demo-stay'));
await page.waitForTimeout(1200);
V = await page.evaluate(veil);
check('"keep slicing" lifts the veil', V === null, JSON.stringify(V));
R = await page.evaluate(() => { const e = document.elementFromPoint(215, 300); return e ? e.tagName : null; });
check('…and the canvas takes the pointer again', R === 'CANVAS', String(R));
G = await page.evaluate(() => { window.__cut(); return { level: window.ZS.director.level, demoend: window.__demoend }; });
check('still gated afterwards, and demoend does not fire again this session', G.level === 2 && G.demoend === 1, JSON.stringify(G));
await page.evaluate(() => { window.ZS.bus.emit('demoend', {}); return window.__tap('.zs-demo-restore'); });   // the veil again (as the settings row would), then restore
await page.waitForTimeout(100);
R = await page.evaluate(() => { const S = window.ZS.ctx.store; return { entitled: S.entitled, reason: S.reason, calls: window.__sk.calls.map((c) => c[0]) }; });
V = await page.evaluate(veil);
check('restore entitles through the same path', R.entitled === true && R.calls.includes('restore') && V && V.word === 'The whole day is yours', JSON.stringify({ R, V }));
await page.close();

page = await open(ctxB, { entitled: false, price: '$2.99', purchase: 'pending', restore: 'none' });
await page.evaluate(() => { localStorage.removeItem('zs-prefs'); });
await page.close();
page = await open(ctxB, { entitled: false, price: '$2.99', purchase: 'pending', restore: 'none' });
G = await page.evaluate(reachGate);
await page.evaluate(() => window.__tap('.zs-demo-restore'));
await page.waitForTimeout(100);
V = await page.evaluate(veil);
check('a restore that finds nothing says so and keeps the veil', V && V.up && /nothing to restore/.test(V.sub) && V.buy !== null, JSON.stringify(V));
await page.evaluate(() => window.__tap('.zs-demo-buy'));
await page.waitForTimeout(100);
V = await page.evaluate(veil);
R = await page.evaluate(() => window.ZS.ctx.store.entitled);
check('Ask to Buy (pending) is explained, not entitled yet', V && V.up && /waiting for approval/.test(V.sub) && R === false, JSON.stringify(V));
// the approval arrives later as the plugin's 'entitlement' event (PR #51 review)
await page.evaluate(() => { window.__sk.entitled = true; window.__sk.listeners.entitlement({ entitled: true, reason: 'purchase', price: '$2.99', outcome: 'update' }); });
await page.waitForTimeout(50);
V = await page.evaluate(veil);
R = await page.evaluate(() => ({ entitled: window.ZS.ctx.store.entitled, prefs: (JSON.parse(localStorage.getItem('zs-prefs') || '{}')).entitled }));
check('…and when the approval arrives as a transaction update, the veil thanks and the day is owned', R.entitled === true && R.prefs === true && V && V.word === 'The whole day is yours', JSON.stringify({ R, V }));
await page.close();
// coming back to the foreground re-asks while not owned
page = await open(ctxB, { entitled: false, price: '$2.99', purchase: 'cancel', restore: 'none' });
await page.evaluate(() => { localStorage.removeItem('zs-prefs'); });
await page.close();
page = await open(ctxB, { entitled: false, price: '$2.99', purchase: 'cancel', restore: 'none' });
R = await page.evaluate(async () => {
  const before = window.__sk.calls.filter((c) => c[0] === 'status').length;
  window.__sk.entitled = true;                       // approved while we were away
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 50));
  return { before, after: window.__sk.calls.filter((c) => c[0] === 'status').length, entitled: window.ZS.ctx.store.entitled };
});
check('returning to the foreground re-reads status() and picks up the entitlement', R.before === 1 && R.after === 2 && R.entitled === true, JSON.stringify(R));
check('no page errors', page.__errs.length === 0, page.__errs.join(' | '));
await page.close();
await ctxB.close();

// ── 3b. the settings row (the panel is suppressed under ?capture, so a plain page) ──
console.log('\n── the settings row ──');
const ctxS = await browser.newContext();
page = await open(ctxS, { entitled: false, price: '$2.99', purchase: 'ok' }, 'nosound=1&nophys=1');
R = await page.evaluate(() => ({ row: !!document.querySelector('button[data-k="unlock"]'), panel: !!document.querySelector('#zs-panel') }));
check('the panel carries "unlock the first day" while the day is not owned', R.panel && R.row, JSON.stringify(R));
check('tapping it brings the veil', await page.evaluate(() => window.__tap('button[data-k="unlock"]') && !!document.querySelector('.zs-demo:not(.out)')));
await page.evaluate(() => window.__tap('.zs-demo-buy'));
await page.waitForTimeout(100);
R = await page.evaluate(() => ({ entitled: window.ZS.ctx.store.entitled, row: !!document.querySelector('button[data-k="unlock"]') }));
check('buying removes the row', R.entitled === true && R.row === false, JSON.stringify(R));
check('no page errors', page.__errs.length === 0, page.__errs.join(' | '));
await page.close();
await ctxS.close();

// ── 4. outside the shell: the open build is the whole game ──
console.log('\n── the open build ──');
const ctxC = await browser.newContext();
page = await open(ctxC, null);
R = await page.evaluate(() => { const S = window.ZS.ctx.store; return { native: S.native, entitled: S.entitled, reason: S.reason, row: !!document.querySelector('button[data-k="unlock"]') }; });
check('no bridge: entitled by construction, no settings row', R.native === false && R.entitled === true && R.reason === 'open' && R.row === false, JSON.stringify(R));
G = await page.evaluate(reachGate);
check('the page turns straight to level 3, no veil', G.level === 3 && G.demoend === 0, JSON.stringify(G));
check('no page errors', page.__errs.length === 0, page.__errs.join(' | '));
await page.close();
await ctxC.close();

await browser.close();
server.close();
console.log(failures.length ? `\nFAIL — ${failures.length}/${checks} checks:\n  ${failures.join('\n  ')}` : `\nPASS — ${checks}/${checks} checks`);
process.exit(failures.length ? 1 : 0);
