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
 *   objs/geos/mats  a scene-graph census (traverse, unique-by-uuid) — the
 *               retention leak classes: growth means meshes/geometries/
 *               materials accumulate without being removed and released
 *   live        live bodies (governor-bounded; growth = retirement leak)
 *   nodes/voices audio engine node count (static after init) and pool use
 *   floats/dom  HUD callout count and total document nodes
 *
 * NO GPU work at all: no renders, and the fluid compute kernel is switched
 * off (ZS.setFluidCompute(false)). Both lessons were bought: v2's once-a-
 * minute render blocked the GL pipe for minutes under SwiftShader, and v3
 * (render-free) STILL stalled 3.6s-60s+ on single steps — module frame()
 * hooks run per step even with doRender=false, and fluid dispatches its
 * kernel in frame(). On device that dispatch is once per display frame on
 * real silicon; only the fast-forward-on-software-GL combination chokes.
 * Every three.js resource has a JS wrapper, so retention shows up in the
 * census and the heap trend without a render; drawprobe owns the draw path.
 * Physics ON (no ?nophys) — Rapier is a prime leak suspect class.
 * Tier 2 and 60 Hz steps: the first draft ran ULTRA at 120 Hz in one giant
 * evaluate per minute and was SwiftShader-throttled into hours; the leak
 * signal does not need the top tier, it needs many minutes of churn. Work
 * is chunked per sim-second so the protocol stays responsive, and a wall
 * watchdog aborts with a partial report rather than ever hanging silently.
 *
 * Usage: node tools/soak.mjs [--minutes 10] [--json out.json]
 * (~30-60s wall per sim-minute, CDP round-trips dominating.)
 * Exit 0 unless a leak gate trips: stepMs slope, scene-census growth, or
 * unbounded live/DOM counts. Run it WITHOUT an output pipe — `| tail` eats
 * the exit code and buffers the per-minute progress lines.
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

const exe = resolveChrome();
if (!exe) {
  console.error('soak.mjs: no full Chromium found. Run: npx playwright install chromium');
  process.exit(1);
}
const browser = await chromium.launch({
  executablePath: exe,
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
const stalls = [];
// Tier 2 for realistic churn, but the fluid GPU kernel OFF: frame() runs per
// step here (60x/sim-sec), and each run dispatches the kernel — on device
// that is once per display frame on real silicon; here it is SwiftShader
// eating minutes of wall and blocking single steps for 3.6s-60s+ (the v3
// stalls). The analytic wind path keeps the sim identical.
await page.evaluate(() => { window.ZS.setTier?.(2); window.ZS.setFluidCompute?.(false); });
let aborted = null;
outer:
for (let minute = 0; minute < MINUTES; minute++) {
  await page.evaluate((minute) => {
    const ZS = window.ZS;
    // walk the arc: one level per ~90 sim-seconds, capped at Dreaming of Bliss
    const lvl = Math.min(9, Math.floor((minute * 60) / 90));
    if (ZS.ctx.fruits.level !== lvl && ZS.ctx.fruits.jumpLevel) ZS.ctx.fruits.jumpLevel(lvl);
    window.__soakWall = 0;
  }, minute);
  for (let sec = 0; sec < 60; sec++) {
    const r = await Promise.race([
      page.evaluate((sec) => {
        const ZS = window.ZS;
        // any single op past 500ms is the slowdown caught red-handed: return a
        // scene snapshot naming the guilty phase instead of hanging in the dark
        const snap = (phase, dt, i) => ({
          slow: true, phase, dt: +dt.toFixed(0), stepIdx: i,
          live: ZS.ctx.fruits.live.map((f) => ({
            id: f.id, gen: f.generation,
            p: f.mesh?.position ? [+f.mesh.position.x.toFixed(1), +f.mesh.position.y.toFixed(1), +f.mesh.position.z.toFixed(1)] : null,
          })),
        });
        const t0 = performance.now();
        if ((sec & 1) === 0) {
          ZS.newStroke();
          const y = [-0.1, 0.05, 0.2, -0.05][(sec >> 1) & 3];
          ZS.swipe(-0.9, y, 0.9, y, 14, 6.0);
          const dt = performance.now() - t0;
          if (dt > 500) return snap('swipe', dt, -1);
        }
        for (let i = 0; i < 60; i++) {
          const s0 = performance.now();
          ZS.step(1 / 60, 1, false);
          const dt = performance.now() - s0;
          if (dt > 500) return snap('step', dt, i);
        }
        window.__soakWall += performance.now() - t0;
        return true;
      }, sec),
      new Promise((r) => setTimeout(() => r('timeout'), SEC_WALL_CAP_MS)),
    ]);
    if (r === 'timeout') { aborted = `watchdog: sim-second took >${SEC_WALL_CAP_MS}ms at minute ${minute} (single op never returned)`; break outer; }
    if (r && r.slow) {
      stalls.push({ minute, sec, ...r });
      console.error(`[soak] STALL min ${minute} sec ${sec} ${r.phase} ${r.dt}ms live=${JSON.stringify(r.live)}`);
      if (stalls.length >= 4) { aborted = `${stalls.length} stalls >500ms — aborting with diagnostics`; break outer; }
    }
  }
  const s = await page.evaluate((minute) => {
    const ZS = window.ZS;
    // scene-graph census: what is RETAINED, counted without rendering
    let objs = 0; const geos = new Set(), mats = new Set();
    ZS.ctx.scene.traverse((o) => {
      objs++;
      if (o.geometry) geos.add(o.geometry.uuid);
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) mats.add(m.uuid);
    });
    const st = ZS.audio.state();
    return {
      minute,
      level: ZS.ctx.fruits.level,
      stepMs: +(window.__soakWall / 3600).toFixed(3),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
      objs,
      geos: geos.size,
      mats: mats.size,
      live: ZS.ctx.fruits.live.length,
      sliced: ZS.ctx.fruits.sliced,
      voices: st.voicesActive,
      audioErrs: st.errors.length,
      dom: document.getElementsByTagName('*').length,
      moduleErrs: ZS.moduleErrors.length,
    };
  }, minute);
  samples.push(s);
  console.error(`[soak] min ${String(minute + 1).padStart(2)} L${s.level} step ${s.stepMs}ms heap ${s.heapMB}MB objs ${s.objs} geos ${s.geos} mats ${s.mats} live ${s.live} dom ${s.dom}`);
}

// ── gates: compare the last quarter to the second quarter (skip warm-up) ────
const q = (list, f) => list.map(f).reduce((a, b) => a + b, 0) / list.length;
const quarter = Math.max(1, Math.floor(samples.length / 4));
const early = samples.slice(quarter, quarter * 2);
const late = samples.slice(-quarter);
const failures = [];
const stepGrowth = q(late, (s) => s.stepMs) / Math.max(0.001, q(early, (s) => s.stepMs));
if (stepGrowth > 1.35) failures.push(`step cost grew ${((stepGrowth - 1) * 100).toFixed(0)}% late vs early`);
const geoGrowth = q(late, (s) => s.geos) - q(early, (s) => s.geos);
if (geoGrowth > 25) failures.push(`scene geometries grew by ${geoGrowth.toFixed(0)} — something isn't releasing`);
const matGrowth = q(late, (s) => s.mats) - q(early, (s) => s.mats);
if (matGrowth > 25) failures.push(`scene materials grew by ${matGrowth.toFixed(0)} — something isn't releasing`);
const objGrowth = q(late, (s) => s.objs) - q(early, (s) => s.objs);
if (objGrowth > 60) failures.push(`scene objects grew by ${objGrowth.toFixed(0)} — something isn't being removed`);
const domGrowth = q(late, (s) => s.dom) - q(early, (s) => s.dom);
if (domGrowth > 40) failures.push(`DOM grew by ${domGrowth.toFixed(0)} nodes`);
if (samples.some((s) => s.moduleErrs > 0)) failures.push('module errors during soak');
if (samples.some((s) => s.audioErrs > 0)) failures.push('audio errors during soak');
// heap: allow sawtooth; flag only a strong monotonic trend
const heapGrowth = q(late, (s) => s.heapMB) - q(early, (s) => s.heapMB);
if (heapGrowth > 60) failures.push(`heap grew ${heapGrowth.toFixed(0)}MB late vs early`);

if (aborted) failures.push(aborted);
if (stalls.length) failures.push(`${stalls.length} single ops >500ms (see stalls[])`);
const out = { pass: failures.length === 0, failures, aborted, stepGrowth: +stepGrowth.toFixed(3), heapGrowth: +heapGrowth.toFixed(1), geoGrowth: +geoGrowth.toFixed(1), matGrowth: +matGrowth.toFixed(1), objGrowth: +objGrowth.toFixed(1), stalls, samples, pageErrors: errs.slice(0, 6) };
console.log(JSON.stringify(out, null, 2));
const jf = arg('json', null);
if (jf) writeFileSync(join(root, jf), JSON.stringify(out, null, 2));
await browser.close();
server.close();
process.exit(failures.length === 0 ? 0 : 1);
