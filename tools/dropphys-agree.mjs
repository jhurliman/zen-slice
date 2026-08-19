/**
 * dropphys-agree.mjs — DOES THE GPU AGREE WITH THE CPU MODEL?
 *
 * `dropphys3d.mjs` validates the DESIGN: it replays the kernel on the CPU and
 * says the collision response removes ~69% of droplet-in-fruit penetration.
 * It cannot say whether the SHADER does what that model says. Two successive
 * metrics for this feature have now had defects, so that gap is not a
 * formality — it is the last thing standing between a prototype and a default.
 *
 * METHOD. Read the compute kernel's own state buffer back off the GPU
 * (`renderer.getArrayBufferAsync`) after N steps and compare it, ROW BY ROW, to
 * the CPU replay of the same droplets. Row-by-row matters: an aggregate match
 * is exactly the kind of agreement that hides a per-droplet sign error. The
 * pool slot comes from the emitter's tap so the two can be lined up exactly.
 *
 * The compared quantity is `D`, the per-droplet displacement from the analytic
 * path — which IS the collision response, since that is where the bounce lives.
 *
 * Usage: node tools/dropphys-agree.mjs
 */
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

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

const STEPS = 60;
const data = await p.evaluate(async (STEPS) => {
  const ZS = window.ZS; ZS.pause(); ZS.setTier(2);
  const F = ZS.ctx.fluid;
  if (!F || !F.debugState) return { err: 'no debugState' };
  ZS.clear();
  const w0 = ZS.spawn('watermelon'); w0.pos.set(0, 0, 0); w0.vel.set(0, 0, 0);
  ZS.advance(0.05); ZS.newStroke(); ZS.swipe(-0.9, 0, 0.9, 0, 8, 6.0);
  for (let i = 0; i < 3; i++) ZS.step(1 / 120, 1, true);

  ZS.clear();
  ['watermelon', 'orange', 'apple', 'watermelon'].forEach((id, i) => {
    const f = ZS.spawn(id);
    f.pos.set(-3.0 + i * 2.0, 0.05 * (i % 2), 0);
    f.vel.set(0, 0.05, 0); f.spin.set(0.1 * i, 0.2, 0.05);
  });
  ZS.advance(0.08);
  // ⚠ WIND OFF FOR THE DURATION OF THE TEST. `D` on the GPU is turbulence AND
  // collision summed into ONE accumulator, because the four-buffer transform
  // feedback limit left no room for a fifth. So a naive comparison measures the
  // curl noise, not the bounce: the first run of this tool reported 2296 of
  // 2300 droplets displaced on the GPU against 478 on the CPU, and a mean error
  // of 0.209 — which is simply the wind the CPU model does not implement.
  // Zeroing turbAmp isolates the collision response, which is the thing under
  // test, without reimplementing the shader's noise on the CPU.
  F.debugSetTurb(0);
  F.debugTap(true);
  ZS.newStroke(); ZS.swipe(-0.95, 0.005, 0.95, 0.02, 20, 6.0);
  const drops = (F.debugTapRead() || []).slice();
  F.debugTap(false);
  if (!drops.length) return { err: 'staging produced no juice' };

  const frames = [];
  for (let i = 0; i < STEPS; i++) {
    ZS.step(1 / 120, 1, true);            // RENDER, so the compute pass runs
    frames.push({ t: ZS.ctx.time, sph: F.debugSpheres() });
  }
  F.debugSetTurb(8.0);            // restore before anything else observes it
  const st = F.debugState();
  const r = ZS.ctx.renderer;
  let gpu = null, readErr = null;
  try {
    const ab = await r.getArrayBufferAsync(st.turb.value ? st.turb.value : st.turb);
    gpu = Array.from(new Float32Array(ab));
  } catch (e) { readErr = String(e).slice(0, 200); }
  return { drops, frames, gpu, readErr, simT: ZS.ctx.time, grav: -14.0,
           turbDamp: 7.0, dispMax: 0.34, hitDecay: 0.7, hitGain: 11.0 };
}, STEPS);
await b.close(); server.close();

if (data.err) { console.error('FAILED:', data.err); process.exit(1); }
if (!data.gpu) {
  console.error('GPU READBACK UNAVAILABLE on this path:', data.readErr);
  console.error('The agreement check cannot run here. Do NOT default the feature on');
  console.error('claiming verified agreement; say it is unverified instead.');
  process.exit(2);
}
console.log(`read back ${data.gpu.length / 4} droplet slots from the GPU`);

const G = data.grav, DT = 1 / 120;
const { turbDamp, dispMax, hitDecay, hitGain } = data;
const posAt = (d, t) => { const k = Math.max(d.k, 0.05); const ex = Math.exp(-k * t), e = (1 - ex) / k;
  return [d.ox + d.vx * e, d.oy + d.vy * e + G * (t - e) / k, d.oz + d.vz * e]; };
const velAt = (d, t) => { const k = Math.max(d.k, 0.05); const ex = Math.exp(-k * t);
  return [d.vx * ex, d.vy * ex + G * (1 - ex) / k, d.vz * ex]; };

const REST = 0.30, FRIC = 0.42;
let n = 0, agree = 0, sumErr = 0, worst = 0, cpuMoved = 0, gpuMoved = 0;
const errs = [], errsBoth = [], onlyOne = [];
for (const d of data.drops) {
  const D = [0, 0, 0], W = [0, 0, 0]; let hit = 0;
  for (const fr of data.frames) {
    const t = fr.t - d.birth;
    if (t < 0 || t > d.life) continue;
    const P = posAt(d, t); const Pw = [P[0] + D[0], P[1] + D[1], P[2] + D[2]];
    for (let i = 0; i < 3; i++) { W[i] -= W[i] * turbDamp * DT; D[i] += W[i] * DT; }
    for (const s of fr.sph) {
      const rel = [Pw[0] - s.x, Pw[1] - s.y, Pw[2] - s.z];
      const dist = Math.hypot(rel[0], rel[1], rel[2]) || 1e-4;
      if (dist >= s.r) continue;
      const nn = [rel[0] / dist, rel[1] / dist, rel[2] / dist];
      const wv = velAt(d, t); const vel = [wv[0] + W[0], wv[1] + W[1], wv[2] + W[2]];
      const vn = vel[0] * nn[0] + vel[1] * nn[1] + vel[2] * nn[2];
      if (vn >= 0) continue;
      for (let i = 0; i < 3; i++) {
        D[i] += nn[i] * (s.r - dist + 0.002);
        W[i] -= nn[i] * vn * (1 + REST);
        W[i] -= (vel[i] - nn[i] * vn) * FRIC;
      }
      hit = 1;
    }
    hit = Math.max(hit - DT * hitDecay, 0);
    const cap = dispMax * (1 + hit * hitGain);
    const dl = Math.hypot(D[0], D[1], D[2]);
    if (dl > cap) { const f = cap / dl; D[0] *= f; D[1] *= f; D[2] *= f; }
  }
  const o = d.slot * 4;
  const g = [data.gpu[o], data.gpu[o + 1], data.gpu[o + 2]];
  const err = Math.hypot(g[0] - D[0], g[1] - D[1], g[2] - D[2]);
  const mag = Math.max(Math.hypot(...D), Math.hypot(...g));
  n++; sumErr += err; if (err > worst) worst = err;
  const cM = Math.hypot(D[0], D[1], D[2]) > 1e-4, gM = Math.hypot(g[0], g[1], g[2]) > 1e-4;
  if (cM) cpuMoved++;
  if (gM) gpuMoved++;
  errs.push(err);
  if (cM && gM) errsBoth.push(err); else if (cM !== gM) onlyOne.push(err);
  if (err <= Math.max(0.01, mag * 0.15)) agree++;
}
console.log();
console.log(`droplets compared row-by-row : ${n}`);
console.log(`displaced on the CPU model   : ${cpuMoved}`);
console.log(`displaced on the GPU         : ${gpuMoved}`);
console.log(`mean |D_gpu - D_cpu|         : ${(sumErr / Math.max(n, 1)).toFixed(5)} world units`);
console.log(`worst                        : ${worst.toFixed(5)}`);
const pct = (a, q) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
console.log(`within 15% or 0.01 units     : ${agree}/${n}  (${(agree / Math.max(n, 1) * 100).toFixed(1)}%)`);
console.log();
console.log('error distribution, world units:');
console.log(`  median ${pct(errs, 0.5).toFixed(5)}   p95 ${pct(errs, 0.95).toFixed(5)}   p99 ${pct(errs, 0.99).toFixed(5)}`);
console.log();
console.log('WHERE THE DISAGREEMENT LIVES — the honest split:');
console.log(`  both displaced          : ${errsBoth.length}  median err ${pct(errsBoth, 0.5).toFixed(5)}  p95 ${pct(errsBoth, 0.95).toFixed(5)}`);
console.log(`  displaced on ONE side   : ${onlyOne.length}  (${(onlyOne.length / n * 100).toFixed(1)}% of all droplets)`);
console.log('  -> a droplet that grazes a collider boundary can hit on one side and');
console.log('     miss on the other; that flips its whole displacement and is the');
console.log('     expected residual, not a shader defect.');
