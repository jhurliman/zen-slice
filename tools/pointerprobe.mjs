/**
 * pointerprobe.mjs — the REAL-INPUT probe (r38e). Every other harness drives
 * the game through `ZS.swipe()`, which emits 'swipe' straight onto the bus —
 * so the entire pointer path (blade.js's listeners → toNdc → push → the bus)
 * was untested, and r38d shipped a change that killed real-finger slicing
 * while every probe stayed green. This closes that hole: Playwright's
 * page.mouse dispatches TRUSTED PointerEvents through the canvas, exactly the
 * events a finger produces, and the probe asserts they become 'swipe' bus
 * traffic and an actual slice of a staged fruit.
 *
 * Usage: node tools/pointerprobe.mjs [--json out.json]
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolveChrome } from './chromepath.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };

const failures = [];
const ok = (cond, label) => { if (!cond) failures.push(label); return !!cond; };

const indexPath = join(root, 'dist/index.html');
if (!existsSync(indexPath)) { console.error('dist/index.html missing — run `node build.mjs`'); process.exit(1); }
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(indexPath));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const exe = resolveChrome();
if (!exe) { console.error('pointerprobe.mjs: no full Chromium found. Run: npx playwright install chromium'); process.exit(1); }
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
// nosound: audio is not what this probe tests; nophys keeps steps cheap under
// SwiftShader (slicing is camera-plane hit testing, not Rapier — audioprobe
// precedent). NO ?capture: capture mode must not be a precondition of input.
await page.goto(`http://localhost:${PORT}/?nosound=1&nophys=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });

// stage: count bus traffic and hang a fat fruit at center — audioprobe's
// exact staging (slow upward toss, brief settle), because a PARKED fruit
// falls under the director's gravity during the drag and can sink out from
// under the swipe line. ZS.clear() first so the director's own tosses don't
// photobomb.
await page.evaluate(() => {
  const ZS = window.ZS;
  ZS.clear();
  window.__swipes = 0; window.__slices = 0; window.__maxSpeed = 0;
  ZS.bus.on('swipe', (e) => {
    window.__swipes++;
    if (e.speedNdc > window.__maxSpeed) window.__maxSpeed = e.speedNdc;
  });
  ZS.bus.on('slice', () => { window.__slices++; });
  const f = ZS.spawn('watermelon');
  f.pos.set(0, 0.2, 0); f.vel.set(0, 0.5, 0);
});
await page.waitForTimeout(60);

// the real gesture: pointerdown, a fast 24-step drag across the fruit,
// pointerup — Playwright dispatches trusted PointerEvents on the element
// under the cursor, which is the canvas. steps:24 over ~a third of the
// viewport is comfortably above slicer.js's MIN_SPEED_NDC gate. The drag
// row is computed from the STAGED FRUIT'S OWN PROJECTION at drag time —
// under SwiftShader whole wall-seconds can pass between staging and input,
// and the fruit falls; aiming at a hardcoded row was this probe's first bug.
const aim = await page.evaluate(() => {
  const ZS = window.ZS;
  const f = ZS.ctx.fruits.live[0];
  // PIN the target for the drag's duration: SwiftShader's slow frames mean
  // wall-seconds can pass mid-gesture and gravity moves the fruit off any
  // row you aim at. An interval re-parks it dead center until the read-back.
  f.pos.set(0, 0.2, 0); f.vel.set(0, 0, 0);
  window.__pin = setInterval(() => { f.pos.set(0, 0.2, 0); f.vel.set(0, 0, 0); }, 25);
  const v = f.pos.clone().project(ZS.ctx.camera);
  return { px: (v.x * 0.5 + 0.5) * innerWidth, py: (-v.y * 0.5 + 0.5) * innerHeight };
});
// steps: 6, NOT more — each CDP dispatch costs ~15 ms of wall clock under
// SwiftShader, and blade.js computes speedNdc from wall time: 24 steps made
// an honest-to-goodness SLOW drag (measured 0.37 ndc/s, under slicer.js's
// 0.55 gate — every geometry guard passed). Six fat segments read ~1.5+.
await page.mouse.move(Math.max(10, aim.px - 140), aim.py);
await page.mouse.down();
await page.mouse.move(Math.min(420, aim.px + 140), aim.py, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.evaluate(() => clearInterval(window.__pin));

const out = await page.evaluate(() => ({
  swipes: window.__swipes, slices: window.__slices,
  maxSpeedNdc: +window.__maxSpeed.toFixed(2),   // slicer gate: MIN_SPEED_NDC 0.55
  live: window.ZS.ctx?.fruits?.live?.length ?? -1,
  fruitPos: (() => { const f = window.ZS.ctx?.fruits?.live?.[0]; return f ? [+f.pos.x.toFixed(2), +f.pos.y.toFixed(2), +f.pos.z.toFixed(2)] : null; })(),
  moduleErrors: (window.ZS.moduleErrors || []).map((m) => `${m.module}: ${String(m.error).slice(0, 120)}`),
}));
// moduleErrors FIRST: a module that threw in init() is exactly how r38d/r38e
// shipped dead input twice — safe() swallows the throw, every bus-driven
// probe stays green, and only a real finger notices
ok(out.moduleErrors.length === 0, `modules retired by safe(): ${out.moduleErrors.join(' | ')}`);
ok(out.swipes > 0, `real PointerEvents produced ${out.swipes} 'swipe' bus events — the pointer path is dead`);
ok(out.slices > 0, `a real drag across a parked watermelon produced ${out.slices} slices`);
ok(errs.length === 0, `page errors: ${errs.join(' | ')}`);

const report = { failures, pass: failures.length === 0, ...out, pageErrors: errs.slice(0, 6) };
console.log(JSON.stringify(report, null, 2));
const jf = arg('json', null);
if (jf) writeFileSync(jf, JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(report.pass ? 0 : 1);
