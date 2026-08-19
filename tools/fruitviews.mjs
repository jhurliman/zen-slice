/**
 * fruitviews.mjs — per-species portrait harness.
 *
 * Renders each fruit species alone at the stage centre, in the REAL game
 * environment (game lighting, game materials, ULTRA tier = fruitSegments 11),
 * from three fixed poses, so procedural geometry and materials can be iterated
 * visually. One fruit, one frame, no motion blur, no depth of field.
 *
 * How it stays deterministic and un-wedgeable (all inherited from shoot.mjs):
 *  - ?capture=1 forces WebGL2 + preserveDrawingBuffer (required for ZS.grab),
 *    ?nophys=1 uses the ballistic integrator (leaves a manually set quat
 *    untouched bit-for-bit when spin=0), ?nosound=1 skips audio.
 *  - Full Chromium is resolved explicitly (headless_shell has no navigator.gpu)
 *    and launched WITHOUT --use-gl=angle/--use-angle=swiftshader (they crash
 *    the WebGPU adapter in Chromium 151 — see shoot.mjs H5).
 *  - Math.random is seeded via addInitScript (same xorshift as the game's rng).
 *  - Depth of field is killed AFTER setTier (applyTier re-runs resize, which
 *    would restore it): ZS.ctx.stage.grade.bokeh.value = 0.
 *  - Every await is bounded; a watchdog kills the run at --deadline.
 *  - Frames are luma-checked before hitting the disk; a black frame is retried
 *    once and then recorded as a failed shot (shoot.mjs H2).
 *
 * Usage:
 *   node tools/fruitviews.mjs [--species watermelon] [--zoom] [--seed 7]
 *                             [--deadline 600]
 * Output: shots/fruit/<species>-<pose>.png + shots/fruit/report.json
 * Exit 0 on success, 1 on any failed shot.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

// Unknown flags are fatal (shoot.mjs H1): a silently ignored flag produces
// confidently mislabelled evidence, which is worse than none.
const FLAGS = { species: 'string', seed: 'number', deadline: 'number', zoom: 'bool' };
{
  const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const k = tok.slice(2);
    if (!(k in FLAGS)) { bad.push(tok); continue; }
    if (FLAGS[k] !== 'bool') i++;
  }
  if (bad.length) {
    console.error(`fruitviews.mjs: unknown flag(s): ${bad.join(', ')}`);
    console.error(`  known: ${Object.keys(FLAGS).map((k) => '--' + k).join(' ')}`);
    process.exit(3);
  }
}

const ALL_SPECIES = ['watermelon', 'orange', 'kiwi', 'apple', 'strawberry', 'pineapple', 'rock'];
const POSES = ['side', 'top', 'threequarter'];
const only = arg('species', null);
if (only && !ALL_SPECIES.includes(String(only))) {
  console.error(`fruitviews.mjs: unknown species '${only}' (known: ${ALL_SPECIES.join(', ')})`);
  process.exit(3);
}
const SPECIES = only ? [String(only)] : ALL_SPECIES;
const SEED = Number(arg('seed', 7)) || 0;
const DEADLINE_S = Number(arg('deadline', 600)) || 600;
const ZOOM = !!arg('zoom', false);
const SHOT_MS = 120000;          // fruit renders take ~1s under SwiftShader; be generous
const outDir = join(root, 'shots/fruit');
mkdirSync(outDir, { recursive: true });

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
const log = (...m) => console.log(`[${el()}]`, ...m);

const state = { seed: SEED, zoom: ZOOM, shots: [], errors: [], timedOut: false, complete: false };
const flush = () => {
  try { writeFileSync(join(outDir, 'report.json'), JSON.stringify(state, null, 2)); } catch (e) { /* */ }
};

// ── watchdog: a wedged run must die loudly, not hang quietly ─────────────────
let browser = null, server = null;
const watchdog = setTimeout(async () => {
  state.timedOut = true;
  state.errors.push(`WATCHDOG: exceeded ${DEADLINE_S}s hard deadline`);
  log(`!! WATCHDOG at ${DEADLINE_S}s — killing browser and exiting non-zero`);
  flush();
  try { await browser?.close(); } catch (e) { /* */ }
  try { server?.close(); } catch (e) { /* */ }
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
    return result;
  } catch (e) {
    state.errors.push(`${label}: ${String(e.message || e).slice(0, 200)}`);
    log(`  !! ${label} FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s: ${String(e.message || e).slice(0, 120)}`);
    flush();
    return null;
  } finally { clearTimeout(timer); }
}

// ── build if missing or stale, then serve dist over localhost ────────────────
const indexPath = join(root, 'dist/index.html');
const stale = () => {
  if (!existsSync(indexPath)) return true;
  const built = statSync(indexPath).mtimeMs;
  const scan = (d) => readdirSync(d, { withFileTypes: true }).some((e) => {
    const p = join(d, e.name);
    return e.isDirectory() ? scan(p) : statSync(p).mtimeMs > built;
  });
  return scan(join(root, 'src')) || statSync(join(root, 'build.mjs')).mtimeMs > built;
};
if (stale()) {
  log('dist/index.html missing or stale — running build.mjs');
  execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'inherit' });
}
server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(indexPath));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

// ── resolve a FULL Chromium, never chromium_headless_shell (shoot.mjs H5) ────
const chromeCandidates = () => {
  const roots = ['/opt/pw-browsers', join(process.env.HOME || '/root', '.cache/ms-playwright')];
  const out = [];
  for (const r of roots) {
    let entries = [];
    try { entries = readdirSync(r); } catch (e) { continue; }
    const dirs = entries.filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const c = join(r, d, sub);
        if (existsSync(c)) out.push(c);
      }
    }
  }
  return out;
};
const exe = chromeCandidates()[0];
if (!exe) {
  console.error('fruitviews.mjs: no full Chromium found. Run: npx playwright install chromium');
  process.exit(1);
}
log(`chromium: ${exe}`);

browser = await chromium.launch({
  executablePath: exe,
  args: [
    // ⚠ no --use-gl=angle / --use-angle=swiftshader — they crash the WebGPU
    // adapter (renderer dies on first requestAdapter, run looks like a hang).
    '--enable-unsafe-swiftshader',
    '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan',
    '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox', '--disable-dev-shm-usage',
  ],
});

// Square frame: the camera CONTAIN-fits half-extent 3.9, so a centred fruit
// fills a good fraction of a 900x900 viewport.
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });

// Seed the page BEFORE any script runs — same xorshift32 the game's makeRng
// uses, so procedural fruit noise is reproducible run to run (shoot.mjs H3).
if (SEED) {
  await page.addInitScript((seed) => {
    let x = seed >>> 0 || 1;
    Math.random = () => {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }, SEED);
  log(`page Math.random seeded with ${SEED}`);
}
page.on('pageerror', (e) => state.errors.push('pageerror: ' + String(e).slice(0, 300)));
page.on('crash', () => state.errors.push('PAGE CRASHED'));

await bounded('goto', 45000, () =>
  page.goto(`http://localhost:${PORT}/?capture=1&nophys=1&nosound=1`, { waitUntil: 'domcontentloaded' }));
const booted = await bounded('boot', 60000, () => page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 }));
if (!booted) {
  state.errors.push('FATAL: window.ZS never appeared');
  flush();
  clearTimeout(watchdog);
  await browser.close(); server.close();
  process.exit(1);
}

// ULTRA tier first, THEN kill depth of field: applyTier re-runs resize, which
// would restore bokeh if the order were reversed.
await bounded('setTier', 30000, () => page.evaluate(() => {
  window.ZS.pause();
  window.ZS.setTier(3);
  window.ZS.ctx.stage.grade.bokeh.value = 0;
}));

// ── luma gate: nothing black reaches the disk (shoot.mjs H2) ─────────────────
const LUMA_FLOOR = 0.35;
const frameLuma = async (buf) => {
  const { default: sharp } = await import('sharp');
  const st = await sharp(buf).stats();
  const [r, g, b] = st.channels;
  return 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
};

const pose = ({ id, pose, zoom }) => {
  const ZS = window.ZS, THREE = ZS.THREE;
  ZS.clear();
  const f = ZS.spawn(id);
  f.pos.set(0, 0.6, 0); f.vel.set(0, 0, 0); f.spin.set(0, 0, 0);
  if (zoom) f.pos.z = 2.0;   // closer to camera, still inside the stage volume
  if (pose === 'side') f.quat.identity();
  else if (pose === 'top') f.quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  else { // threequarter: long axis tilted like the game's biased spawn
    const axis = new THREE.Vector3(Math.cos(0.6) * Math.cos(0.5), Math.sin(0.6) * Math.cos(0.5), Math.sin(0.5)).normalize();
    f.quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  }
  ZS.advance(0);   // exactly one 1/120 step — ~0.0005u of gravity drop, invisible
};

let failures = 0;
for (const id of SPECIES) {
  for (const p of POSES) {
    const name = `${id}-${p}`;
    const started = Date.now();
    const ok = await bounded(`shot:${name}`, SHOT_MS, async () => {
      await page.evaluate(pose, { id, pose: p, zoom: ZOOM });
      for (let attempt = 0; attempt < 2; attempt++) {
        const data = await page.evaluate(() => window.ZS.grab());
        if (!data || data.length < 2000) {
          if (attempt) throw new Error('empty capture (canvas readback returned nothing)');
          continue;
        }
        const buf = Buffer.from(data.split(',')[1], 'base64');
        let luma = NaN;
        try { luma = await frameLuma(buf); } catch (e) { luma = NaN; }
        if (Number.isNaN(luma) || luma >= LUMA_FLOOR) {
          writeFileSync(join(outDir, `${name}.png`), buf);
          state.shots.push({ name, luma: Number.isNaN(luma) ? null : +luma.toFixed(3), ms: Date.now() - started, ok: true });
          log(`${name}  luma ${Number.isNaN(luma) ? '?' : luma.toFixed(2)}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
          return true;
        }
        log(`  !! ${name}: mean luma ${luma.toFixed(4)} < ${LUMA_FLOOR} — BLACK FRAME, re-rendering`);
        await page.evaluate(() => window.ZS.advance(0));
      }
      throw new Error(`BLACK FRAME after 2 attempts — refusing to write ${name}.png`);
    });
    if (!ok) {
      failures++;
      state.shots.push({ name, luma: null, ms: Date.now() - started, ok: false });
    }
    flush();
  }
}

state.complete = true;
flush();
log(`done in ${el()} — ${state.shots.length} shots, ${failures} failed`);
clearTimeout(watchdog);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
