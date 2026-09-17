/**
 * darkprobe.mjs — the dark start (r51/r51d) and the staged warmup (r51d).
 * Boots WITHOUT ?capture (the curtain and the warmup exist only there):
 *   - the curtain is up on the first frame and lifts as a short fade;
 *   - before play only the first page's species compile (marquee melon +
 *     Still Water's pool); the arc waits for them, the melon keeps lobbing;
 *   - a page turn compiles that page's new species; tosses skip a species
 *     until it is warm;
 *   - under ?capture there is no curtain and nothing is gated.
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
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(indexPath)); });
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const exe = resolveChrome();
if (!exe) { console.error('darkprobe.mjs: no full Chromium found'); process.exit(1); }
const browser = await chromium.launch({ executablePath: exe, args: [...renderArgs(), '--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--disable-dev-shm-usage'] });
const phases = () => window.ZS.warm().phases.map((p) => p.phase);

console.log('\n── the dark start ──');
let page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/?nosound=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });
let R = await page.evaluate(() => ({ curtain: !!document.querySelector('#zs-dark'), z: getComputedStyle(document.querySelector('#zs-dark')).zIndex }));
check('the curtain is up at boot, under the title (z 9)', R.curtain && R.z === '9', JSON.stringify(R));
await page.waitForFunction(() => window.ZS.lit() >= 0, null, { timeout: 6000 }).catch(() => {});
R = await page.evaluate(() => ({ lit: window.ZS.lit(), dark: window.ZS.ctx.dark }));
check('it lifts after the first frames (a fade, not a wait)', R.lit >= 0 && R.lit < 3 && R.dark === false, JSON.stringify(R));

console.log('\n── the staged warmup ──');
await page.mouse.click(215, 500);   // the title goes; the first page may still be warming
await page.waitForTimeout(300);
R = await page.evaluate(() => ({ warming: window.ZS.ctx.prewarmed === false, fruit: window.ZS.director.live.length, title: !!document.querySelector('.zs-title:not(.out)') }));
check('title tapped away: only the marquee melon flies while the first page warms', R.title === false && R.fruit <= 1, JSON.stringify(R));
await page.waitForFunction(() => window.ZS.warm().done === true, null, { timeout: 30000 }).catch(() => {});
R = await page.evaluate(() => ({ done: window.ZS.warm().done, phases: window.ZS.warm().phases.map((p) => p.phase) }));
check('before play: scene, watermelon, orange, apple, the arenas and their crowd — nothing else', R.done === true
  && R.phases.includes('scene') && R.phases.includes('fruit:watermelon') && R.phases.includes('fruit:orange') && R.phases.includes('fruit:apple')
  && R.phases.includes('crowd') && !R.phases.includes('fruit:kiwi') && !R.phases.includes('fruit:pineapple') && !R.phases.includes('fruit:rock'), R.phases.join(','));
await page.waitForTimeout(2500);
R = await page.evaluate(() => ({ fruit: window.ZS.director.live.length, level: window.ZS.director.level }));
check('the arc has begun on the first page', R.fruit >= 1 && R.level === 0, JSON.stringify(R));
await page.evaluate(() => { window.ZS.director.jumpLevel(1); });
await page.waitForTimeout(150);
R = await page.evaluate(() => window.ZS.warm().phases.map((p) => p.phase));
const kiwiStarted = await page.waitForFunction(() => window.ZS.warm().phases.some((p) => p.phase === 'fruit:kiwi'), null, { timeout: 30000 }).then(() => true).catch(() => false);
R = await page.evaluate(() => window.ZS.warm().phases.map((p) => p.phase));
check('the page turn to First Light compiles kiwi and the rock, then a crowd of them', kiwiStarted && R.filter((p) => p === 'crowd').length >= 2 || (kiwiStarted && R.includes('fruit:rock')), R.join(','));
await page.waitForFunction(() => window.ZS.warm().phases.filter((p) => p.phase === 'crowd').length >= 2, null, { timeout: 30000 }).catch(() => {});
R = await page.evaluate(() => window.ZS.warm().phases.map((p) => p.phase));
check('…and only those (strawberry waits for Morning Dew)', R.includes('fruit:kiwi') && R.includes('fruit:rock') && !R.includes('fruit:strawberry'), R.join(','));
check('no page errors', errs.length === 0, errs.join(' | '));
await page.close();

console.log('\n── ?capture ──');
page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${PORT}/?capture=1&nosound=1&nophys=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });
R = await page.evaluate(() => {
  const ZS = window.ZS; ZS.clear(); ZS.director.jumpLevel(5); ZS.step(1 / 120, 3, false);
  return { curtain: !!document.querySelector('#zs-dark'), lit: ZS.lit(), warm: ZS.warm().phases.length, prewarmed: ZS.ctx.prewarmed };
});
check('no curtain, no warmup, nothing gated under ?capture', !R.curtain && R.lit === -1 && R.warm === 0 && R.prewarmed === undefined, JSON.stringify(R));
await page.close();
await browser.close(); server.close();
console.log(failures.length ? `\nFAIL — ${failures.length}/${checks} checks:\n  ${failures.join('\n  ')}` : `\nPASS — ${checks}/${checks} checks`);
process.exit(failures.length ? 1 : 0);
