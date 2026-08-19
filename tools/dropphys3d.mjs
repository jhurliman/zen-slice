/**
 * dropphys3d.mjs — THE 3D METRIC for droplet-vs-fruit collision.
 *
 * ⚠ THIS IS NOT THE FROZEN SUITE. `tools/probes.py` measures IMAGES and stays
 * frozen. This measures WORLD SPACE, and it exists because r15's screen-space
 * metric could not tell a collision from an occlusion: counting juice pixels
 * that overlap a fruit counts droplets passing IN FRONT of it as though they
 * had passed THROUGH it. That is why r15 reported "-0%" for a feature that a
 * 2.2x-collider control proved was working. A metric that cannot distinguish
 * the thing it is named after is worse than no metric.
 *
 * WHAT IT MEASURES. `fluid.js`'s gated tap (`api.debugTap`) records what the
 * emitter actually drew — origin, velocity, drag, birth, life — for every
 * droplet of a real cut. This then integrates the SAME closed form the vertex
 * shader evaluates, at 120 Hz, against the SAME world sphere set the kernel
 * reads (`api.debugSpheres`), and counts droplet-frames spent inside a
 * collider. Two numbers:
 *
 *   penetration  droplet-frames inside a sphere with NO correction. This is
 *                the OPPORTUNITY — how much there is for collision to fix. If
 *                it is near zero, the feature cannot matter no matter how well
 *                it is implemented, and that is worth knowing before tuning.
 *   corrected    the same with the kernel's response modelled on the CPU.
 *
 * ⚠ WHAT IT DOES NOT MEASURE: whether the GPU agrees with this model. It
 * validates the DESIGN and lets a collider configuration be swept in
 * milliseconds instead of a rebuild-and-squint. Agreement between this and the
 * shader is unverified and is the next thing anyone should check.
 *
 * Usage: node tools/dropphys3d.mjs [--sweep]
 */
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const SWEEP = process.argv.includes('--sweep');
const root = join(process.env.HOME, '.cache/ms-playwright');
const EXE = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d))
  .map((d) => join(root, d, 'chrome-linux64/chrome')).find(existsSync);
const buf = readFileSync('dist/index.html');
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(buf); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const b = await chromium.launch({ executablePath: EXE, args: [
  '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader',
  '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
await p.addInitScript((s) => { let x = s >>> 0; Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }, 1);
await p.goto(`http://127.0.0.1:${PORT}/?capture=1&dropphys=1`, { waitUntil: 'commit' });
await p.waitForFunction(() => !!window.ZS, null, { timeout: 120000 });

const data = await p.evaluate(() => {
  const ZS = window.ZS; ZS.pause(); ZS.setTier(2);
  const F = ZS.ctx.fluid;
  if (!F || !F.debugTap) return { err: 'no debug tap — ctx.fluid missing' };
  // warm-up cut (r13: the first cut of a page loses its juice on the dark path)
  ZS.clear();
  const w0 = ZS.spawn('watermelon'); w0.pos.set(0, 0, 0); w0.vel.set(0, 0, 0);
  ZS.advance(0.05); ZS.newStroke(); ZS.swipe(-0.9, 0, 0.9, 0, 8, 6.0);
  for (let i = 0; i < 3; i++) ZS.step(1 / 120, 1, true);

  // THE SCENE: a combo, which is the only case where juice from one fruit can
  // meet another. A single lone cut has almost nothing to collide with, and
  // measuring that would flatter the feature by giving it nothing to do.
  ZS.clear();
  ['watermelon', 'orange', 'apple', 'watermelon'].forEach((id, i) => {
    const f = ZS.spawn(id);
    // ⚠ ON the swipe line and nearly stationary. My first staging put them at
    // world y ~ -0.8 and swiped at ndc y 0.10, which in PORTRAIT is world y
    // 0.85 (half-height 8.45) — a clean miss, 0 cuts, 0 droplets, and a metric
    // that confidently reported 0.00% penetration for a scene with no juice in
    // it. An instrument that returns a plausible number when its input is empty
    // is the most dangerous kind, so the diagnostic block below is permanent.
    f.pos.set(-3.0 + i * 2.0, 0.05 * (i % 2), 0);
    f.vel.set(0, 0.05, 0); f.spin.set(0.1 * i, 0.2, 0.05);
  });
  ZS.advance(0.08);
  let juiceEvents = 0, sliceEvents = 0;
  ZS.ctx.bus.on('juice', () => juiceEvents++);
  ZS.ctx.bus.on('slice', () => sliceEvents++);
  const liveBefore = ZS.director.live.length;
  F.debugTap(true);
  ZS.newStroke(); ZS.swipe(-0.95, 0.005, 0.95, 0.02, 20, 6.0);
  const tapAfterSwipe = (F.debugTapRead() || []).length;
  ZS.step(1/120, 1, false);
  const drops = (F.debugTapRead() || []).slice();
  F.debugTap(false);
  const diag = { juiceEvents, sliceEvents, liveBefore, liveAfter: ZS.director.live.length,
                 tapAfterSwipe, tapFinal: drops.length };
  // sample the collider set over the flight, since the bodies MOVE
  const frames = [];
  for (let i = 0; i < 150; i++) {
    ZS.step(1 / 120, 1, false);
    if (i % 3 === 0) frames.push({ t: ZS.ctx.time, sph: F.debugSpheres() });
  }
  return { drops, frames, grav: -14.0, diag };
});
await b.close(); server.close();

if (data.err) { console.error('FAILED:', data.err); process.exit(1); }
console.log('diag:', JSON.stringify(data.diag));
if (!data.diag.juiceEvents || !data.drops.length) {
  console.error('\nABORT: the staging produced no juice. Every number below would be a');
  console.error('confident 0.00% measured on an empty scene. Fix the staging, not the metric.');
  process.exit(2);
}
console.log(`tapped ${data.drops.length} droplets, ${data.frames.length} collider samples`);

// ── the model: the SAME closed form the vertex shader evaluates ──────────────
const G = data.grav;
function posAt(d, t) {
  const k = Math.max(d.k, 0.05);
  const ex = Math.exp(-k * t), e = (1 - ex) / k;
  return [d.ox + d.vx * e, d.oy + d.vy * e + G * (t - e) / k, d.oz + d.vz * e];
}
function velAt(d, t) {
  const k = Math.max(d.k, 0.05); const ex = Math.exp(-k * t);
  return [d.vx * ex, d.vy * ex + G * (1 - ex) / k, d.vz * ex];
}
/** @param scale multiply every collider radius, to sweep */
function run(scale, correct) {
  let pen = 0, frames = 0, hitDrops = 0;
  const REST = 0.30, FRIC = 0.42, DT = 1 / 40;   // frames sampled every 3 steps
  for (const d of data.drops) {
    let D = [0, 0, 0], W = [0, 0, 0], everHit = false;
    for (const fr of data.frames) {
      const t = fr.t - d.birth;
      if (t < 0 || t > d.life) continue;
      frames++;
      const P = posAt(d, t); const Pw = [P[0] + D[0], P[1] + D[1], P[2] + D[2]];
      let inside = false;
      for (const s of fr.sph) {
        const rel = [Pw[0] - s.x, Pw[1] - s.y, Pw[2] - s.z];
        const dist = Math.hypot(...rel) || 1e-4;
        const R = s.r * scale;
        if (dist >= R) continue;
        inside = true;
        if (!correct) continue;
        const n = rel.map((v) => v / dist);
        const wv = velAt(d, t);
        const vel = [wv[0] + W[0], wv[1] + W[1], wv[2] + W[2]];
        const vn = vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2];
        if (vn >= 0) continue;                       // r15b: only if approaching
        for (let i = 0; i < 3; i++) {
          D[i] += n[i] * (R - dist + 0.002);
          W[i] -= n[i] * vn * (1 + REST);
          W[i] -= (vel[i] - n[i] * vn) * FRIC;
        }
        everHit = true;
      }
      if (inside) pen++;
      if (correct) for (let i = 0; i < 3; i++) D[i] += W[i] * DT;
    }
    if (everHit) hitDrops++;
  }
  return { pen, frames, hitDrops, pct: frames ? pen / frames * 100 : 0 };
}

const scales = SWEEP ? [0.6, 0.8, 0.92, 1.0, 1.15, 1.3] : [1.0];
console.log();
console.log('droplet-frames spent INSIDE a collider, world space (lower = fewer droplets in fruit)');
console.log('radius   uncorrected        with collision      reduction   droplets ever hit');
for (const sc of scales) {
  const a = run(sc, false), c = run(sc, true);
  const red = a.pen ? (1 - c.pen / a.pen) * 100 : 0;
  console.log(`${sc.toFixed(2).padStart(5)}   ${String(a.pen).padStart(6)} (${a.pct.toFixed(2)}%)   `
    + `${String(c.pen).padStart(6)} (${c.pct.toFixed(2)}%)   ${red.toFixed(0).padStart(6)}%      ${c.hitDrops}`);
}
