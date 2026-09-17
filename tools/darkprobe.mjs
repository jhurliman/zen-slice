/**
 * darkprobe.mjs — the dark start (r51). Boots WITHOUT ?capture (the curtain
 * exists only there) and checks: the curtain is up on the first frame and
 * holds the arc; it lifts once the warmup has settled and frames are quiet,
 * or at the 5 s ceiling; the arc then starts; under ?capture there is no
 * curtain at all. Run after `node build.mjs`.
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
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(indexPath)); });
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const exe = resolveChrome();
if (!exe) { console.error('darkprobe.mjs: no full Chromium found'); process.exit(1); }
const browser = await chromium.launch({ executablePath: exe, args: [...renderArgs(), '--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--disable-dev-shm-usage'] });

console.log('\n── the dark start ──');
let page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/?nosound=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });
let R = await page.evaluate(() => ({ curtain: !!document.querySelector('#zs-dark'), lit: window.ZS.lit(), dark: window.ZS.ctx.dark, z: getComputedStyle(document.querySelector('#zs-dark')).zIndex }));
check('the curtain is up at boot, under the title (z 9)', R.curtain && R.lit === -1 && R.dark === true && R.z === '9', JSON.stringify(R));
// tap the title away at once: the arc must still wait for the curtain
await page.mouse.click(215, 500);
await page.waitForTimeout(400);
R = await page.evaluate(() => ({ dark: window.ZS.ctx.dark, fruit: window.ZS.director.live.length, title: !!document.querySelector('.zs-title:not(.out)') }));
check('title tapped away early: the arc waits while dark (no ordinary toss)', R.title === false && (R.dark === false || R.fruit <= 1), JSON.stringify(R));
const t0 = Date.now();
await page.waitForFunction(() => window.ZS.lit() >= 0, null, { timeout: 8000 }).catch(() => {});
R = await page.evaluate(() => ({ lit: window.ZS.lit(), dark: window.ZS.ctx.dark, warm: window.ZS.warm().done, cls: document.querySelector('#zs-dark')?.className ?? 'removed' }));
check('the curtain lifts by the 5 s ceiling at the latest', R.lit >= 0 && R.lit <= 5.3 && R.dark === false, JSON.stringify(R));
check('…as a fade (class lit), then leaves the DOM', R.cls === 'lit' || R.cls === 'removed', R.cls);
await page.waitForTimeout(2000);
R = await page.evaluate(() => ({ gone: !document.querySelector('#zs-dark'), fruit: window.ZS.director.live.length }));
check('curtain removed after the fade; the arc has begun', R.gone && R.fruit >= 1, JSON.stringify(R));
check('no page errors', errs.length === 0, errs.join(' | '));
await page.close();

console.log('\n── ?capture ──');
page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${PORT}/?capture=1&nosound=1&nophys=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });
R = await page.evaluate(() => ({ curtain: !!document.querySelector('#zs-dark'), dark: window.ZS.ctx.dark, lit: window.ZS.lit() }));
check('no curtain under ?capture (probes measure pixels)', !R.curtain && R.dark !== true && R.lit === -1, JSON.stringify(R));
await page.close();
await browser.close(); server.close();
console.log(failures.length ? `\nFAIL — ${failures.length}/${checks} checks:\n  ${failures.join('\n  ')}` : `\nPASS — ${checks}/${checks} checks`);
process.exit(failures.length ? 1 : 0);
