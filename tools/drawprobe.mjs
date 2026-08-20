/**
 * drawprobe.mjs — DETERMINISTIC draw-call accounting.
 *
 * Why this exists: shoot.mjs's complexity probe calls Math.random() inside the
 * loop, so the number of fruit that actually get cut — and therefore the number
 * of live bodies at the peak render — is different every run. Across rounds it
 * produced 53 / 57 / 60 live bodies and scores of 462 / 806 / 1218 while the
 * peakDrawCalls number was quoted as if it were a fixed property of the build.
 * It is not. This rig pins Math.random to a seeded LCG so the SAME scene is
 * built every time, and additionally reports the fixed post-stack cost and the
 * marginal cost per body, so a draw-call number can be attributed.
 *
 * It does not write to shots/ and it measures the live scene, not images: it
 * measures the renderer, not a PNG. PROBE_VERSION is untouched.
 *
 *   node tools/drawprobe.mjs [--tier 3]
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const TIER = Number(arg('tier', 3));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(join(root, 'dist/index.html')));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const CHROMES = [
  '/opt/pw-browsers/chromium-1234/chrome-linux64/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];
const browser = await chromium.launch({
  executablePath: CHROMES.find((p) => existsSync(p)),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

// seed BEFORE any game code runs
await page.addInitScript(() => {
  let s = 0x2545f491;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
});

await page.goto(`http://localhost:${PORT}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 60000 });
const backend = await page.evaluate(() => window.ZS.backend || 'webgl2');
await page.evaluate((t) => { window.ZS.pause(); window.ZS.setTier(t); }, TIER);

const out = { backend, tier: TIER, seeded: true };

// (1) the shoot.mjs complexity loop, verbatim, but deterministic
out.complexity = await page.evaluate(() => {
  const ZS = window.ZS;
  const peak = { calls: 0, tris: 0, bodies: 0 };
  const trace = [];
  for (let i = 0; i < 60; i++) {
    if (i % 10 === 0) {
      const f = ZS.spawn('watermelon');
      f.pos.set((Math.random() - 0.5) * 8, -7, 0); f.vel.set(0, 12, 0);
    }
    if (i % 8 === 3) { ZS.newStroke(); ZS.swipe(-0.9, Math.random() - 0.5, 0.9, Math.random() - 0.5, 10, 6.0); }
    const render = i % 20 === 19;
    ZS.step(1 / 120, 1, render);
    if (render) {
      const info = ZS.ctx.renderer.info.render;
      trace.push({ i, calls: info.calls, tris: info.triangles, bodies: ZS.director.live.length });
      peak.calls = Math.max(peak.calls, info.calls);
      peak.tris = Math.max(peak.tris, info.triangles);
      peak.bodies = Math.max(peak.bodies, ZS.director.live.length);
    }
  }
  return { peakDrawCalls: peak.calls, peakTriangles: peak.tris, liveBodies: ZS.director.live.length, score: ZS.score.score, trace };
});

// (2) attribution: empty scene at each tier = the fixed post + background cost
out.fixed = await page.evaluate(async () => {
  const ZS = window.ZS, r = {};
  for (const t of [0, 1, 2, 3]) {
    ZS.setTier(t); ZS.clear(); ZS.step(1 / 120, 1, true);
    ZS.step(1 / 120, 1, true);
    r['tier' + t] = ZS.ctx.renderer.info.render.calls;
  }
  ZS.setTier(3);
  return r;
});

// (3) marginal cost per live body, no juice: spawn N whole fruit, render, count
out.perBody = await page.evaluate(() => {
  const ZS = window.ZS, r = [];
  for (const n of [0, 2, 4, 8, 16]) {
    ZS.clear();
    for (let k = 0; k < n; k++) {
      const f = ZS.spawn('watermelon');
      f.pos.set(((k % 4) - 1.5) * 2.2, Math.floor(k / 4) * 1.6 - 2, 0); f.vel.set(0, 0.2, 0);
    }
    ZS.step(1 / 120, 1, true); ZS.step(1 / 120, 1, true);
    r.push({ n, bodies: ZS.director.live.length, calls: ZS.ctx.renderer.info.render.calls, tris: ZS.ctx.renderer.info.render.triangles });
  }
  ZS.clear();
  return r;
});

// (4) the real thing: accumulate bodies by actually cutting, sample (bodies, calls)
out.load = await page.evaluate(() => {
  const ZS = window.ZS, r = [];
  ZS.clear();
  for (let round = 0; round < 14; round++) {
    if (round % 2 === 0) {
      for (let k = 0; k < 3; k++) {
        const f = ZS.spawn('watermelon');
        f.pos.set((k - 1) * 2.4, -0.6 + k * 0.5, 0); f.vel.set(0, 0.4, 0); f.spin.set(0.1, 0.2, 0);
      }
    }
    ZS.newStroke();
    const y = -0.55 + (round % 7) * 0.18;
    ZS.swipe(-0.97, y, 0.97, y + 0.06, 20, 7.5);
    ZS.step(1 / 120, 1, true);
    const info = ZS.ctx.renderer.info.render;
    r.push({ bodies: ZS.director.live.length, calls: info.calls, tris: info.triangles });
  }
  ZS.clear();
  return r;
});

// (5) where the JS frame-time MAX actually is. Same 400-step loop shoot.mjs
// uses for `cpu`, but every step is labelled, so the spike can be attributed
// instead of guessed at.
out.cpu = await page.evaluate(() => {
  const ZS = window.ZS;
  ZS.clear();
  const ids = ['watermelon', 'pineapple', 'orange', 'apple', 'kiwi', 'strawberry'];
  const rows = [];
  for (let i = 0; i < 400; i++) {
    let spawned = false, swiped = false;
    if (i % 10 === 0) {
      const f = ZS.spawn(ids[i % ids.length]);
      f.pos.set((Math.random() - 0.5) * 8, -7, (Math.random() - 0.5) * 3);
      f.vel.set(0, 12, 0); spawned = true;
    }
    if (i % 8 === 3) { ZS.newStroke(); ZS.swipe(-0.9, Math.random() - 0.5, 0.9, Math.random() - 0.5, 10, 6.0); swiped = true; }
    const before = ZS.director.live.length;
    const s = performance.now();
    ZS.step(1 / 120, 1, false);
    const ms = performance.now() - s;
    rows.push({ i, ms: +ms.toFixed(3), spawned, swiped, cut: ZS.director.live.length - before,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null });
  }
  const sorted = [...rows].sort((a, b) => b.ms - a.ms);
  const only = (f) => { const v = rows.filter(f).map((r) => r.ms).sort((a, b) => a - b); return v.length ? { n: v.length, med: v[v.length >> 1], max: v[v.length - 1] } : null; };
  return {
    max: sorted[0].ms, top6: sorted.slice(0, 6),
    steps_that_cut: only((r) => r.cut > 0),
    steps_that_spawned: only((r) => r.spawned && r.cut <= 0),
    plain_steps: only((r) => !r.spawned && !r.swiped && r.cut <= 0),
    firstSliceStep: rows.find((r) => r.cut > 0) || null,
    heapTrace: rows.filter((r) => r.i % 25 === 0).map((r) => r.heapMB),
    heapAroundSpike: rows.slice(Math.max(0, sorted[0].i - 3), sorted[0].i + 3).map((r) => [r.i, r.ms, r.heapMB]),
  };
});

// (6) steady-state allocation: 600 sim steps with NOTHING happening.
// The perf bar requires zero allocation in the hot loop.
out.idleAlloc = await page.evaluate(() => {
  const ZS = window.ZS;
  ZS.clear();
  for (let i = 0; i < 30; i++) ZS.step(1 / 120, 1, false);   // settle
  const h0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) ZS.step(1 / 120, 1, false);
  const ms = performance.now() - t0;
  const h1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  // and again with one live fruit in the air
  const f = ZS.spawn('watermelon'); f.pos.set(0, 0, 0); f.vel.set(0, 1, 0);
  for (let i = 0; i < 30; i++) ZS.step(1 / 120, 1, false);
  const h2 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  for (let i = 0; i < 600; i++) ZS.step(1 / 120, 1, false);
  const h3 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  ZS.clear();
  return {
    empty_bytes_per_step: +((h1 - h0) / 600).toFixed(1),
    empty_ms_per_step: +(ms / 600).toFixed(4),
    oneFruit_bytes_per_step: +((h3 - h2) / 600).toFixed(1),
  };
});

out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
