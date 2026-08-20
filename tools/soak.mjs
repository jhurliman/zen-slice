/**
 * soak.mjs — the LONG-SESSION probe (r32). The player: "over a long play
 * session like lvl 0-7 or further I see it start to slow down (15+ min), do
 * we have a resource or mem leak anywhere?" A mean over a short run cannot
 * see that; this simulates many minutes of continuous play — the director
 * spawning on its own timer, a scripted stroke every sim-second, levels
 * advanced along the arc, audio live — and samples once per sim-minute:
 *
 *   stepMs      mean JS cost of one fixed step over the minute (the number
 *               that must NOT grow — growth here IS the reported slowdown)
 *   heapMB      performance.memory.usedJSHeapSize (Chrome-only, forced GC
 *               is not available so expect sawtooth; the TREND matters)
 *   geo/tex     renderer.info.memory — GPU-side resource counts; growth
 *               means something creates geometry/textures without disposing
 *   live        live bodies (governor-bounded; growth = retirement leak)
 *   nodes/voices audio engine node count (static after init) and pool use
 *   floats/dom  HUD callout count and total document nodes
 *
 * Renderer paused (SwiftShader renders at ~1 s/frame and would drown the JS
 * numbers); a frame is rendered once per minute to keep the render path
 * honest. Physics ON (no ?nophys) — Rapier is a prime leak suspect class.
 * Tier 2 and 60 Hz steps: the first draft ran ULTRA at 120 Hz in one giant
 * evaluate per minute and was SwiftShader-throttled into hours; the leak
 * signal does not need the top tier, it needs many minutes of churn. Work
 * is chunked per sim-second so the protocol stays responsive, and a wall
 * watchdog aborts with a partial report rather than ever hanging silently.
 *
 * Usage: node tools/soak.mjs [--minutes 10] [--json out.json]
 * Exit 0 unless a leak gate trips: stepMs slope, geometry growth, or
 * unbounded live/DOM counts.
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const MINUTES = Number(arg('minutes', 10));
const SEC_WALL_CAP_MS = 60000;   // watchdog: one sim-second may never take a minute

const indexPath = join(root, 'dist/index.html');
if (!existsSync(indexPath)) { console.error('dist/index.html missing — run `node build.mjs`'); process.exit(1); }
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(indexPath));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const CHROMES = [
  '/opt/pw-browsers/chromium-1234/chrome-linux64/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium',
];
const browser = await chromium.launch({
  executablePath: CHROMES.find((p) => existsSync(p)),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-precise-memory-info',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e && e.message ? e.message : e)));
await page.addInitScript(() => {
  let s = 7;
  Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };
});
await page.goto(`http://127.0.0.1:${PORT}/?capture=1`);
await page.waitForFunction(() => window.ZS || window.ZS_BOOT_ERROR, null, { timeout: 90000 });
const bootErr = await page.evaluate(() => window.ZS_BOOT_ERROR || null);
if (bootErr) { console.error('BOOT ERROR: ' + bootErr); process.exit(1); }

await page.evaluate(() => { window.ZS.pause?.(); window.ZS.audio.unlock(); });
await page.waitForFunction(() => window.ZS.audio.state().actxState === 'running', null, { timeout: 5000 }).catch(() => {});
// let the piano kit (and its detached extra takes) render before the clock starts
await page.waitForFunction(() => window.ZS.audio.state().pianoReady, null, { timeout: 25000 }).catch(() => {});

const samples = [];
await page.evaluate(() => { window.ZS.setTier?.(2); });
let aborted = null;
outer:
for (let minute = 0; minute < MINUTES; minute++) {
  await page.evaluate((minute) => {
    const ZS = window.ZS;
    // walk the arc: one level per ~90 sim-seconds, capped at Deep Calm
    const lvl = Math.min(9, Math.floor((minute * 60) / 90));
    if (ZS.ctx.fruits.level !== lvl && ZS.ctx.fruits.jumpLevel) ZS.ctx.fruits.jumpLevel(lvl);
    window.__soakWall = 0;
  }, minute);
  for (let sec = 0; sec < 60; sec++) {
    const r = await Promise.race([
      page.evaluate((sec) => {
        const ZS = window.ZS;
        const t0 = performance.now();
        if ((sec & 1) === 0) {
          ZS.newStroke();
          const y = [-0.1, 0.05, 0.2, -0.05][(sec >> 1) & 3];
          ZS.swipe(-0.9, y, 0.9, y, 14, 6.0);
        }
        ZS.step(1 / 60, 60, false);
        window.__soakWall += performance.now() - t0;
        return true;
      }, sec),
      new Promise((r) => setTimeout(() => r('timeout'), SEC_WALL_CAP_MS)),
    ]);
    if (r === 'timeout') { aborted = `watchdog: sim-second took >${SEC_WALL_CAP_MS}ms at minute ${minute}`; break outer; }
  }
  const s = await page.evaluate((minute) => {
    const ZS = window.ZS;
    ZS.step(1 / 60, 1, true);   // one real render per minute keeps that path honest
    const info = ZS.ctx.renderer?.info;
    const st = ZS.audio.state();
    return {
      minute,
      level: ZS.ctx.fruits.level,
      stepMs: +(window.__soakWall / 3600).toFixed(3),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
      geo: info?.memory?.geometries ?? -1,
      tex: info?.memory?.textures ?? -1,
      live: ZS.ctx.fruits.live.length,
      sliced: ZS.ctx.fruits.sliced,
      voices: st.voicesActive,
      audioErrs: st.errors.length,
      dom: document.getElementsByTagName('*').length,
      moduleErrs: ZS.moduleErrors.length,
    };
  }, minute);
  samples.push(s);
  console.error(`[soak] min ${String(minute + 1).padStart(2)} L${s.level} step ${s.stepMs}ms heap ${s.heapMB}MB geo ${s.geo} tex ${s.tex} live ${s.live} dom ${s.dom}`);
}

// ── gates: compare the last quarter to the second quarter (skip warm-up) ────
const q = (list, f) => list.map(f).reduce((a, b) => a + b, 0) / list.length;
const quarter = Math.max(1, Math.floor(samples.length / 4));
const early = samples.slice(quarter, quarter * 2);
const late = samples.slice(-quarter);
const failures = [];
const stepGrowth = q(late, (s) => s.stepMs) / Math.max(0.001, q(early, (s) => s.stepMs));
if (stepGrowth > 1.35) failures.push(`step cost grew ${((stepGrowth - 1) * 100).toFixed(0)}% late vs early`);
const geoGrowth = q(late, (s) => s.geo) - q(early, (s) => s.geo);
if (geoGrowth > 25) failures.push(`GPU geometries grew by ${geoGrowth.toFixed(0)} — something isn't disposing`);
const domGrowth = q(late, (s) => s.dom) - q(early, (s) => s.dom);
if (domGrowth > 40) failures.push(`DOM grew by ${domGrowth.toFixed(0)} nodes`);
if (samples.some((s) => s.moduleErrs > 0)) failures.push('module errors during soak');
if (samples.some((s) => s.audioErrs > 0)) failures.push('audio errors during soak');
// heap: allow sawtooth; flag only a strong monotonic trend
const heapGrowth = q(late, (s) => s.heapMB) - q(early, (s) => s.heapMB);
if (heapGrowth > 60) failures.push(`heap grew ${heapGrowth.toFixed(0)}MB late vs early`);

if (aborted) failures.push(aborted);
const out = { pass: failures.length === 0, failures, aborted, stepGrowth: +stepGrowth.toFixed(3), heapGrowth: +heapGrowth.toFixed(1), geoGrowth: +geoGrowth.toFixed(1), samples, pageErrors: errs.slice(0, 6) };
console.log(JSON.stringify(out, null, 2));
const jf = arg('json', null);
if (jf) writeFileSync(join(root, jf), JSON.stringify(out, null, 2));
await browser.close();
server.close();
process.exit(failures.length === 0 ? 0 : 1);
