/**
 * perfprofile.mjs — WHERE DOES THE FRAME GO?
 *
 * "we lag or skip frames here and there" is a statement about the TAIL, and the
 * existing cpu probe reports one aggregate number for `ZS.step()`. That number
 * cannot say which of nine modules spent the 12 ms, and a mean cannot see a
 * spike at all. This arms `ZS.profile()` and reports per-module p50/p95/p99/max,
 * plus CUT frames separated from steady-state, because a cut is the event he is
 * describing and averaging it in is how a spike vanishes into a good mean.
 *
 * ⚠ CPU ONLY, and deliberately: this harness renders under a software
 * rasteriser, so GPU timings here are fiction. `ZS.step(dt, 1, false)` is used
 * so the numbers are the JS the phone would also run.
 *
 * Usage: node tools/perfprofile.mjs [--tier 2] [--frames 900]
 */
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync } from 'fs';
import { resolveChrome } from './chromepath.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const TIER = Number(arg('tier', 2));
const FRAMES = Number(arg('frames', 900));
const EXE = resolveChrome();
if (!EXE) {
  console.error('perfprofile.mjs: no full Chromium found. Run: npx playwright install chromium');
  process.exit(1);
}
const buf = readFileSync('dist/index.html');
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(buf); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const b = await chromium.launch({ executablePath: EXE, args: [
  '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader',
  '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
await p.addInitScript((s) => { let x = s >>> 0; Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }, 1);
await p.goto(`http://127.0.0.1:${PORT}/?capture=1`, { waitUntil: 'commit' });
await p.waitForFunction(() => !!window.ZS, null, { timeout: 120000 });

const rep = await p.evaluate(({ TIER, FRAMES }) => {
  const ZS = window.ZS; ZS.pause(); ZS.setTier(TIER);
  if (!ZS.profile) return { err: 'no ZS.profile — build is older than r19' };
  const ids = ['watermelon', 'pineapple', 'orange', 'apple', 'kiwi', 'strawberry'];
  ZS.clear();
  // warm-up: shaders, pipelines, and r13's first-cut artefact, off the record
  for (let i = 0; i < 90; i++) {
    if (i % 12 === 0) { const f = ZS.spawn(ids[i % 6]); f.pos.set((Math.random() - 0.5) * 6, -6, 0); f.vel.set(0, 11, 0); }
    if (i % 20 === 7) { ZS.newStroke(); ZS.swipe(-0.9, Math.random() * 0.4 - 0.2, 0.9, Math.random() * 0.4 - 0.2, 12, 6.0); }
    ZS.step(1 / 120, 1, false);
  }
  ZS.profile(true);
  // ⚠ THE CUT DOES NOT HAPPEN INSIDE A FRAME. `ZS.swipe()` emits on the bus and
  // `slicer.onSwipe` -> `cut()` -> `cutGeometry()` runs SYNCHRONOUSLY inside
  // that call — and in real play that call comes from a pointermove handler,
  // not from the animation frame. So the most expensive thing in the game is
  // invisible to a per-module frame profiler, and lands between frames, which
  // is exactly what "lag or skip frames here and there" looks like.
  const swipeMs = [];
  ZS.ctx.__zsCutProf = { geom: [], halves: [], juice: [] };
  // REAL PLAY CADENCE: a fruit every ~0.1 s and a swipe every ~0.17 s, which is
  // a busy but not absurd rally. 900 frames is 7.5 s of play at 120 Hz.
  for (let i = 0; i < FRAMES; i++) {
    if (i % 12 === 0) { const f = ZS.spawn(ids[i % 6]); f.pos.set((Math.random() - 0.5) * 6, -6, (Math.random() - 0.5) * 2); f.vel.set(0, 11 + Math.random() * 2, 0); }
    if (i % 20 === 7) {
      ZS.newStroke();
      const t0 = performance.now();
      ZS.swipe(-0.9, Math.random() * 0.5 - 0.25, 0.9, Math.random() * 0.5 - 0.25, 12, 5.0 + Math.random() * 6);
      swipeMs.push(performance.now() - t0);
    }
    ZS.step(1 / 120, 1, false);
  }
  const r = ZS.profileRead();
  r.swipeMs = swipeMs;
  r.cutProf = ZS.ctx.__zsCutProf; ZS.ctx.__zsCutProf = null;
  ZS.profile(false);
  r.liveBodies = ZS.director.live.length;
  return r;
}, { TIER, FRAMES });
await b.close(); server.close();

if (rep.err) { console.error(rep.err); process.exit(1); }
const BUDGET = 8.3;
console.log(`tier ${TIER}, ${rep.frames} frames, ${rep.liveBodies} live bodies at the end`);
console.log(`FRAME (JS only, no render)   p50 ${rep.frame.p50}  p95 ${rep.frame.p95}  p99 ${rep.frame.p99}  max ${rep.frame.max}   [120fps budget ${BUDGET} ms]`);
console.log(`CUT frames (n=${rep.cutFrames.n})          p50 ${rep.cutFrames.p50}  p95 ${rep.cutFrames.p95}  max ${rep.cutFrames.max}`);
const sm = (rep.swipeMs || []).slice().sort((a, b) => a - b);
const q = (a, x) => (a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * x))].toFixed(3) : 0);
console.log(`SWIPE->CUT (outside the frame, n=${sm.length})  p50 ${q(sm, 0.5)}  p95 ${q(sm, 0.95)}  max ${sm.length ? +sm[sm.length - 1].toFixed(3) : 0}`);
console.log(`   sum ${sm.reduce((a, c) => a + c, 0).toFixed(1)} ms over the run  <- this is NOT in the frame numbers above`);
const cp = rep.cutProf || { geom: [], halves: [], juice: [] };
const stat = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length
  ? `p50 ${q(b,0.5).toFixed(2)}  p95 ${q(b,0.95).toFixed(2)}  max ${b[b.length-1].toFixed(2)}  sum ${b.reduce((s,c)=>s+c,0).toFixed(0)}`
  : 'none'; };
console.log();
console.log(`INSIDE THE CUT, cumulative from the top (n=${cp.geom.length} cuts):`);
console.log(`  cutGeometry()          ${stat(cp.geom)}`);
console.log(`  + build the two halves ${stat(cp.halves)}`);
console.log(`  + juice burst + events ${stat(cp.juice)}`);
console.log(`  of which physics.addBody (per half, Rapier convex hull):`);
console.log(`                         ${stat(cp.phys || [])}`);
console.log();
console.log('module.phase                 total ms    mean      p50     p95     p99     max');
for (const m of rep.byTotal) {
  if (m.totalMs < 0.5) continue;
  console.log(`${m.module.padEnd(28)} ${String(m.totalMs).padStart(8)}  ${m.meanMs.toFixed(4).padStart(8)}  `
    + `${String(m.p50).padStart(6)}  ${String(m.p95).padStart(6)}  ${String(m.p99).padStart(6)}  ${String(m.max).padStart(6)}`);
}
