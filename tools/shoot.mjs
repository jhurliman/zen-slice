/**
 * shoot.mjs — the critic harness.
 *
 * Loads the build in headless Chromium, detaches the game from the wall clock
 * via ZS.step(), and captures WebGL/WebGPU pixels directly. Because time is
 * virtual, the frames produced here are what a 120Hz phone would draw at the
 * same beat; the slowness of software rasterisation cannot distort the result.
 *
 * ── Why this file is defensive ───────────────────────────────────────────────
 * Under a software rasteriser, cost scales with PIXELS, and a fragment shader
 * with a few octaves of fbm plus a 3x3x3 cellular loop can take tens of seconds
 * for a single full-resolution frame. A harness that simply waits will appear to
 * hang, and an agent driving it will sit there for hours.
 *
 * So, three rules:
 *   1. RENDER SMALL. The capture buffer is capped by --scale (default 0.5 of a
 *      already-modest layout size). Composition is identical; only pixel count
 *      changes. One optional hero frame is taken at full size.
 *   2. EVERY await IS BOUNDED. There is no unbounded page call anywhere. Each
 *      beat has its own timeout and, on expiry, is recorded as failed and the
 *      run moves on rather than blocking.
 *   3. THERE IS A HARD DEADLINE. A watchdog kills the browser and the process
 *      at --deadline seconds no matter what, after flushing a partial report.
 *      A wedged run must die loudly, not hang quietly.
 *
 * Usage:
 *   node tools/shoot.mjs --out shots/r1 --device desktop [--scale 0.5]
 *                        [--deadline 420] [--hero] [--gl]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

// Layout sizes are deliberately modest. These are COMPOSITION references, not
// fidelity references — the critics judge framing, form, colour and fluid
// behaviour, none of which need a 2880x1800 buffer. Rendering one of those under
// SwiftShader costs 15-35 s per frame and is how a run stalls for hours.
const DEVICES = {
  desktop: { width: 1280, height: 720, tier: 3 },
  ipad: { width: 900, height: 1200, tier: 3 },
  iphone: { width: 430, height: 932, tier: 2 },
};

const devName = String(arg('device', 'desktop'));
const dev = DEVICES[devName] || DEVICES.desktop;
const SCALE = Math.max(0.25, Math.min(1, Number(arg('scale', 0.5)) || 0.5));
const DEADLINE_S = Number(arg('deadline', 420)) || 420;
const WANT_HERO = !!arg('hero', false);
const FORCE_GL = !!arg('gl', false);
const outDir = join(root, String(arg('out', 'shots/latest')));
mkdirSync(outDir, { recursive: true });

const W = Math.round(dev.width * SCALE);
const H = Math.round(dev.height * SCALE);

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
const log = (...m) => console.log(`[${el()}]`, ...m);

const state = {
  device: devName, viewport: { ...dev }, renderSize: { width: W, height: H, scale: SCALE },
  beats: [], perf: null, cpu: null, errors: [], timedOut: false, complete: false,
};
const flush = () => {
  try { writeFileSync(join(outDir, 'report.json'), JSON.stringify(state, null, 2)); }
  catch (e) { /* nothing useful to do */ }
};

// ── watchdog ─────────────────────────────────────────────────────────────────
let browser = null, server = null;
let watchdogFired = false;
const watchdog = setTimeout(async () => {
  watchdogFired = true;
  state.timedOut = true;
  state.errors.push(`WATCHDOG: exceeded ${DEADLINE_S}s hard deadline; run aborted with partial results`);
  log(`!! WATCHDOG at ${DEADLINE_S}s — killing browser and exiting non-zero`);
  flush();
  try { await browser?.close(); } catch (e) { /* ignore */ }
  try { server?.close(); } catch (e) { /* ignore */ }
  process.exit(2);
}, DEADLINE_S * 1000);
watchdog.unref?.();

/** Bound every page interaction. On timeout: record, continue, never block. */
async function bounded(label, ms, fn) {
  const started = Date.now();
  let timer;
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms); }),
    ]);
    const took = Date.now() - started;
    state.beats.push({ label, ms: took, ok: true });
    if (took > 5000) log(`  ${label} ${(took / 1000).toFixed(1)}s (slow)`);
    return result;
  } catch (e) {
    const took = Date.now() - started;
    state.beats.push({ label, ms: took, ok: false, error: String(e.message || e).slice(0, 200) });
    state.errors.push(`${label}: ${String(e.message || e).slice(0, 200)}`);
    log(`  !! ${label} FAILED after ${(took / 1000).toFixed(1)}s: ${String(e.message || e).slice(0, 120)}`);
    flush();
    return null;
  } finally { clearTimeout(timer); }
}

// ── serve over localhost (WebGPU requires a secure context; localhost counts) ─
const indexPath = join(root, 'dist/index.html');
if (!existsSync(indexPath)) {
  state.errors.push('dist/index.html missing — run `node build.mjs` first');
  flush();
  console.error('dist/index.html missing — run `node build.mjs` first');
  process.exit(1);
}
server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(indexPath));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

// Prefer the newest Chromium present; fall back to whatever exists.
const CHROMES = [
  '/opt/pw-browsers/chromium-1234/chrome-linux64/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];
const exe = CHROMES.find((p) => existsSync(p));

log(`launching ${devName} layout ${dev.width}x${dev.height} -> render ${W}x${H} (scale ${SCALE}), deadline ${DEADLINE_S}s`);

browser = await chromium.launch({
  executablePath: exe,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan',
    '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox', '--disable-dev-shm-usage',
  ],
});

const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  hasTouch: devName !== 'desktop',
  isMobile: devName !== 'desktop',
});
page.on('pageerror', (e) => state.errors.push('pageerror: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') state.errors.push('console: ' + m.text().slice(0, 300)); });
page.on('crash', () => state.errors.push('PAGE CRASHED'));

const url = `http://localhost:${PORT}/?capture=1${FORCE_GL ? '&gl=1' : ''}`;
await bounded('goto', 45000, () => page.goto(url, { waitUntil: 'domcontentloaded' }));
const booted = await bounded('boot', 60000, () => page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 }));
if (!booted) {
  state.errors.push('FATAL: window.ZS never appeared — the build did not boot');
  flush();
  log('FATAL: build did not boot');
  clearTimeout(watchdog);
  await browser.close(); server.close();
  process.exit(1);
}

state.backend = await bounded('backend', 10000, () =>
  page.evaluate(() => window.ZS.backend || (window.ZS.ctx?.renderer?.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2')));
log('backend:', state.backend);

await bounded('setTier', 20000, () => page.evaluate((t) => { window.ZS.pause(); window.ZS.setTier(t); }, dev.tier));

// ── capture helpers, all bounded ─────────────────────────────────────────────
// A single render under SwiftShader is the expensive operation; give it room but
// never let it be unbounded.
const RENDER_MS = 90000;

const shot = (name) => bounded(`shot:${name}`, RENDER_MS, async () => {
  const data = await page.evaluate(() => window.ZS.grab());
  if (!data || data.length < 2000) throw new Error('empty capture (canvas readback returned nothing)');
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
  return true;
});
// advance() simulates dark and renders only the final frame, so its cost is
// ~one render regardless of how much virtual time passes.
const adv = (s) => bounded(`adv:${s}`, RENDER_MS, () => page.evaluate((x) => window.ZS.advance(x), s));
const run = (label, fn) => bounded(`run:${label}`, 30000, () => page.evaluate(fn));

// ── beat sheet ───────────────────────────────────────────────────────────────
log('beat sheet');
await run('reset', () => { window.ZS.clear(); window.ZS.advance(0.05); });

await run('spawn-melon', () => {
  const f = window.ZS.spawn('watermelon');
  f.pos.set(0, 0.2, 0); f.vel.set(0, 2.0, 0); f.spin.set(0.15, 0.35, 0.05);
});
await adv(0.30); await shot('01-whole-watermelon');
await run('cut-melon', () => { window.ZS.newStroke(); window.ZS.swipe(-0.85, 0.16, 0.85, -0.10, 12, 5.0); });
await adv(0.033); await shot('02-cut+33ms');
await adv(0.067); await shot('03-cut+100ms');
await adv(0.150); await shot('04-cut+250ms');
await adv(0.250); await shot('05-cut+500ms');
await adv(0.500); await shot('06-cut+1000ms');

await run('stage-citrus', () => {
  window.ZS.clear();
  const f = window.ZS.spawn('orange'); f.pos.set(-2.2, -0.4, 1.6); f.vel.set(0.5, 2.4, 0); f.spin.set(0.2, 0.2, 0.1);
  const k = window.ZS.spawn('kiwi'); k.pos.set(2.4, -0.8, 1.2); k.vel.set(-0.4, 2.8, 0); k.spin.set(0.1, 0.3, 0.2);
});
await adv(0.30);
await run('cut-citrus', () => { window.ZS.newStroke(); window.ZS.swipe(-0.95, -0.22, 0.95, 0.20, 14, 6.0); });
await adv(0.12); await shot('07-citrus-cut');
await adv(0.35); await shot('08-citrus-caps');

// fast flick vs slow draw — R1b says morphology must differ between these
await run('stage-fast', () => {
  window.ZS.clear();
  const f = window.ZS.spawn('orange'); f.pos.set(0, 0, 0); f.vel.set(0, 1.2, 0); f.spin.set(0.1, 0.2, 0);
});
await adv(0.20);
await run('flick', () => { window.ZS.newStroke(); window.ZS.swipe(-0.9, 0.0, 0.9, 0.05, 16, 14.0); });
await adv(0.05); await shot('15-fast-flick+50ms');
await run('stage-slow', () => {
  window.ZS.clear();
  const f = window.ZS.spawn('watermelon'); f.pos.set(0, 0, 0); f.vel.set(0, 1.2, 0); f.spin.set(0.1, 0.2, 0);
});
await adv(0.20);
await run('slowcut', () => { window.ZS.newStroke(); window.ZS.swipe(-0.5, 0.0, 0.5, 0.03, 16, 1.2); });
await adv(0.05); await shot('16-slow-cleave+50ms');

await run('stage-combo', () => {
  window.ZS.clear();
  ['watermelon', 'pineapple', 'strawberry', 'apple', 'orange'].forEach((id, i) => {
    const f = window.ZS.spawn(id);
    f.pos.set(-5.4 + i * 2.7, -2.6 + (i % 2) * 1.6, (i % 3 - 1) * 1.2);
    f.vel.set(0, 4.6 - i * 0.25, 0); f.spin.set(0.2 * i, 0.3, 0.1);
  });
});
await adv(0.35);
await run('cut-combo', () => { window.ZS.newStroke(); window.ZS.swipe(-0.97, -0.30, 0.97, 0.30, 20, 7.5); });
await adv(0.05); await shot('09-combo+50ms');
await adv(0.15); await shot('10-combo+200ms');
await adv(0.35); await shot('11-combo+550ms');

await run('stage-idle', () => {
  window.ZS.clear();
  const f = window.ZS.spawn('pineapple'); f.pos.set(-2.0, 1.0, 0); f.vel.set(0.3, 1.5, 0);
  const g = window.ZS.spawn('strawberry'); g.pos.set(2.6, -1.2, 1.5); g.vel.set(-0.2, 3.0, 0);
  window.ZS.newStroke(); window.ZS.swipe(-0.6, -0.5, 0.3, 0.45, 10, 4.0);
});
await adv(0.05); await shot('12-idle-blade');

// ── CPU-only probe: the real 120fps predictor, and it costs no pixels ────────
log('cpu probe');
state.cpu = await bounded('cpu', 90000, () => page.evaluate(() => {
  const ZS = window.ZS;
  ZS.clear();
  const ids = ['watermelon', 'pineapple', 'orange', 'apple', 'kiwi', 'strawberry'];
  const samples = [];
  for (let i = 0; i < 400; i++) {
    if (i % 10 === 0) {
      const f = ZS.spawn(ids[i % ids.length]);
      f.pos.set((Math.random() - 0.5) * 8, -7, (Math.random() - 0.5) * 3);
      f.vel.set(0, 12, 0);
    }
    if (i % 8 === 3) { ZS.newStroke(); ZS.swipe(-0.9, Math.random() - 0.5, 0.9, Math.random() - 0.5, 10, 6.0); }
    const s = performance.now();
    ZS.step(1 / 120, 1, false);
    samples.push(performance.now() - s);
  }
  samples.sort((a, b) => a - b);
  const pct = (p) => +(samples[Math.floor(samples.length * p)] || 0).toFixed(3);
  return { median: pct(0.5), p95: pct(0.95), max: +samples[samples.length - 1].toFixed(3), frames: samples.length };
}));
if (state.cpu) log(`cpu/frame: median ${state.cpu.median}ms p95 ${state.cpu.p95}ms max ${state.cpu.max}ms`);

// ── GPU complexity probe: a handful of real renders only ────────────────────
log('complexity probe');
state.perf = await bounded('perf', 180000, () => page.evaluate(() => {
  const ZS = window.ZS;
  const peak = { calls: 0, tris: 0 };
  for (let i = 0; i < 60; i++) {
    if (i % 10 === 0) {
      const f = ZS.spawn('watermelon');
      f.pos.set((Math.random() - 0.5) * 8, -7, 0); f.vel.set(0, 12, 0);
    }
    if (i % 8 === 3) { ZS.newStroke(); ZS.swipe(-0.9, Math.random() - 0.5, 0.9, Math.random() - 0.5, 10, 6.0); }
    const render = i % 20 === 19;          // only 3 real renders in the whole probe
    ZS.step(1 / 120, 1, render);
    if (render) {
      const info = ZS.ctx.renderer.info.render;
      peak.calls = Math.max(peak.calls, info.calls);
      peak.tris = Math.max(peak.tris, info.triangles);
    }
  }
  return {
    peakDrawCalls: peak.calls, peakTriangles: peak.tris,
    programs: ZS.ctx.renderer.info.programs?.length ?? 0,
    geometries: ZS.ctx.renderer.info.memory.geometries,
    textures: ZS.ctx.renderer.info.memory.textures,
    liveBodies: ZS.director.live.length, score: ZS.score.score,
  };
}));
await shot('13-load');

// ── optional full-resolution hero frame ──────────────────────────────────────
if (WANT_HERO) {
  log(`hero frame at ${dev.width}x${dev.height} (expensive)`);
  await bounded('hero:resize', 30000, () => page.setViewportSize({ width: dev.width, height: dev.height }));
  await run('hero:stage', () => {
    window.ZS.clear();
    const f = window.ZS.spawn('watermelon');
    f.pos.set(0, 0.2, 0); f.vel.set(0, 2.0, 0); f.spin.set(0.15, 0.35, 0.05);
    window.ZS.advance(0.3);
    window.ZS.newStroke(); window.ZS.swipe(-0.85, 0.16, 0.85, -0.10, 12, 5.0);
  });
  await bounded('hero:adv', 240000, () => page.evaluate(() => window.ZS.advance(0.25)));
  await bounded('hero:shot', 240000, async () => {
    const d = await page.evaluate(() => window.ZS.grab());
    if (d && d.length > 2000) writeFileSync(join(outDir, '00-hero.png'), Buffer.from(d.split(',')[1], 'base64'));
  });
}

// ── DOM HUD, captured live ───────────────────────────────────────────────────
await bounded('hud', 60000, async () => {
  await page.evaluate(() => window.ZS.resume());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(outDir, '14-hud.png'), timeout: 45000 });
});

state.complete = true;
const failed = state.beats.filter((b) => !b.ok);
const slowest = [...state.beats].sort((a, b) => b.ms - a.ms).slice(0, 3)
  .map((b) => `${b.label} ${(b.ms / 1000).toFixed(1)}s`);
state.slowestBeats = slowest;
flush();

log(`done in ${el()} — ${state.beats.length} beats, ${failed.length} failed`);
log('slowest:', slowest.join(', '));
console.log(JSON.stringify({
  device: state.device, backend: state.backend, renderSize: state.renderSize,
  perf: state.perf, cpu: state.cpu, failedBeats: failed.length,
  errors: state.errors.slice(0, 12), timedOut: state.timedOut, slowest,
}, null, 2));

clearTimeout(watchdog);
await browser.close();
server.close();
// Exit 0 whenever the run produced a usable report, even with some failed
// beats — a non-zero code invites a caller to retry forever, which is its own
// way of stalling. Only a watchdog kill (2) or a build that never booted (1)
// are non-zero, and both of those are genuinely unrecoverable by retrying.
process.exit(0);
