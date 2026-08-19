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
  // EVERY step, not every third: the replay below runs at the kernel's own
  // 120 Hz, and interpolating collider positions would be one more place for
  // the model and the shader to disagree.
  const frames = [];
  for (let i = 0; i < 170; i++) {
    ZS.step(1 / 120, 1, false);
    frames.push({ t: ZS.ctx.time, sph: F.debugSpheres() });
  }
  return { drops, frames, grav: -14.0, diag,
           turbDamp: 7.0, dispMax: 0.34, turbAmp: 8.0, hitDecay: 0.7, hitGain: 11.0 };
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
/** Replay the kernel's OWN state updates, at the kernel's OWN cadence.
 *
 * ⚠ THE FIRST VERSION OF THIS FUNCTION WAS WRONG AND ITS 68% WAS NOT MEANINGFUL.
 * It advanced `D` with an UNDAMPED `W` at 40 Hz, while the shipping kernel runs
 * at 120 Hz, damps `W` by `turbDamp` every step, and clamps |D| against
 * `dispMax * (1 + hit*11)`. Undamped `W` never decays, so a droplet that
 * bounced once was flung away from the fruit and never came back — which
 * flatters exactly the droplets counted as "with collision". Caught in review.
 *
 * Replayed here, in the kernel's order (fluid.js, `const kernel = Fn`):
 *   1. P = analytic(t) + D                     (collision reads LAST frame's D)
 *   2. W += (F*resp - W*turbDamp) * dt         (turbulence)
 *   3. D += W * dt
 *   4. collision: correct D, reflect into W, set hit
 *   5. hit decays; cap = dispMax * (1 + hit*hitGain); clamp |D| <= cap
 *
 * ⚠ STILL OMITTED: the curl-noise force F and the blade wake. Modelling those
 * on the CPU would be a second implementation of the shader's noise, which is
 * the drift this tool exists to avoid. `resp` and `turbDamp` ARE modelled, so
 * the damping that bleeds off a bounce is present; what is missing is the wind
 * that would jitter a droplet ACROSS a collider boundary. Since r14 cut the
 * wind's authority to ~9% of a fruit radius, that is a small error — but it is
 * an error, and it is why this validates the design rather than the shader.
 */
function run(scale, correct) {
  let pen = 0, frames = 0, hitDrops = 0;
  const REST = 0.30, FRIC = 0.42, DT = 1 / 120;
  const { turbDamp, dispMax, turbAmp, hitDecay, hitGain } = data;
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (const d of data.drops) {
    const D = [0, 0, 0], W = [0, 0, 0];
    let hit = 0, everHit = false;
    // `resp` is the kernel's air-responsiveness, read off drag exactly as it is
    const resp = smoothstep(0.9, 6.5, d.k) * turbAmp;
    void resp;   // used only by the omitted curl term; kept so the omission is visible
    for (const fr of data.frames) {
      const t = fr.t - d.birth;
      if (t < 0 || t > d.life) continue;
      frames++;
      const P = posAt(d, t);
      const Pw = [P[0] + D[0], P[1] + D[1], P[2] + D[2]];        // step 1
      for (let i = 0; i < 3; i++) {                              // steps 2-3
        if (correct) { W[i] -= W[i] * turbDamp * DT; D[i] += W[i] * DT; }
      }
      let inside = false;
      for (const sp of fr.sph) {                                  // step 4
        const rel = [Pw[0] - sp.x, Pw[1] - sp.y, Pw[2] - sp.z];
        const dist = Math.hypot(rel[0], rel[1], rel[2]) || 1e-4;
        const R = sp.r * scale;
        if (dist >= R) continue;
        inside = true;
        if (!correct) continue;
        const n = [rel[0] / dist, rel[1] / dist, rel[2] / dist];
        const wv = velAt(d, t);
        const vel = [wv[0] + W[0], wv[1] + W[1], wv[2] + W[2]];
        const vn = vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2];
        if (vn >= 0) continue;                                    // r15b approach gate
        for (let i = 0; i < 3; i++) {
          D[i] += n[i] * (R - dist + 0.002);
          W[i] -= n[i] * vn * (1 + REST);
          W[i] -= (vel[i] - n[i] * vn) * FRIC;
        }
        hit = 1; everHit = true;
      }
      if (inside) pen++;
      if (correct) {                                              // step 5
        hit = Math.max(hit - DT * hitDecay, 0);
        const cap = dispMax * (1 + hit * hitGain);
        const dl = Math.hypot(D[0], D[1], D[2]);
        if (dl > cap) { const f = cap / dl; D[0] *= f; D[1] *= f; D[2] *= f; }
      }
    }
    if (everHit) hitDrops++;
  }
  return { pen, frames, hitDrops, pct: frames ? pen / frames * 100 : 0 };
}

// 1.00 IS WHAT SHIPS: the runtime uploads localSpheres()' inscribed radius
// unchanged. The r17 report first labelled 0.92 as shipped, which was a row
// the live build never used. Caught in review.
const scales = SWEEP ? [0.8, 1.0, 1.15, 1.3] : [1.0];
console.log();
console.log('droplet-frames spent INSIDE a collider, world space (lower = fewer droplets in fruit)');
console.log('radius   uncorrected        with collision      reduction   droplets ever hit');
for (const sc of scales) {
  const tag = sc === 1.0 ? '  <- SHIPPED' : '';
  const a = run(sc, false), c = run(sc, true);
  const red = a.pen ? (1 - c.pen / a.pen) * 100 : 0;
  console.log(`${sc.toFixed(2).padStart(5)}   ${String(a.pen).padStart(6)} (${a.pct.toFixed(2)}%)   `
    + `${String(c.pen).padStart(6)} (${c.pct.toFixed(2)}%)   ${red.toFixed(0).padStart(6)}%      ${String(c.hitDrops).padStart(5)}${tag}`);
}
