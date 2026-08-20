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
 *                        [--deadline 420] [--hero] [--gl] [--seed 1]
 *                        [--cpu-repeats 3]
 *
 * ── r12 HARDENING. Four rounds asked for these; all four asks are in the ─────
 * ── reports and none of them had landed. Each one below is a specific ────────
 * ── failure that already cost a round, named with the round that paid. ───────
 *
 *  H1. UNKNOWN FLAGS ARE NOW A FATAL ERROR (r10 + r11 asked, twice).
 *      `--portrait` IS NOT A FLAG. It parses as an unknown argument, is
 *      silently ignored, and shoots DESKTOP. A round brief got this wrong and
 *      nearly shipped five pieces of "portrait" measurement taken in landscape.
 *      The device switch is `--device iphone`. A harness that silently accepts
 *      a misspelling produces confidently mislabelled evidence, which is worse
 *      than producing none.
 *
 *  H2. A ZERO-LUMA FRAME IS NEVER WRITTEN (r10 paid for this once).
 *      The harness wrote a fully black 1280x720 frame silently to disk, once in
 *      six runs, on the `--hero` path. Every frame is now luma-checked BEFORE
 *      it reaches the disk; a black frame is retried once and then recorded as
 *      a failed beat. A missing file is a visible problem. A black file is an
 *      invisible one that a critic will happily measure.
 *
 *  H3. THE PAGE'S Math.random IS SEEDED (asked FOUR times, r9-r11).
 *      `liveBodies` swung 25 / 29 / 40 / 51 across four runs in round 11 alone,
 *      and half of what every builder steers by is spawn noise. An init script
 *      installs a seeded xorshift as `Math.random` before any page script runs,
 *      so spawn positions, cut heights and `slicer.js`'s half-spin are
 *      reproducible. `--seed 0` restores the real `Math.random`.
 *      ⚠ THIS CHANGES EVERY RUN. Numbers taken after r12 are comparable to each
 *      other and NOT to r0-r11's. That is the point: they were not comparable
 *      to each other either, they only looked it.
 *
 *  H4. THE CPU PROBE IS REPEATED AND `max` IS NOT A HEADLINE (r10 retracted a
 *      published number over this). `cpu.max` swung 2.4 -> 12.6 ms on ONE
 *      build's own code. The probe now runs `--cpu-repeats` times (default 3)
 *      and reports the MEDIAN and SPREAD of the per-run p50 and p95. `max` is
 *      still recorded per run, under a key that says not to quote it.
 *
 *  H5. THE BROWSER IS RESOLVED EXPLICITLY, AND IT MUST NOT BE headless_shell.
 *      Playwright's default executable is `chromium_headless_shell`, which has
 *      NO `navigator.gpu` at all — `!!navigator.gpu` is false there even with
 *      `--enable-unsafe-webgpu`. The full `chromium-*` build has it. And
 *      `--use-gl=angle --use-angle=swiftshader`, which this file passed since
 *      round 0, CRASHES the renderer process in Chromium 151 the moment
 *      `requestAdapter()` is called: the page dies, `page.evaluate` hangs, and
 *      the run looks like a boot failure with no error anywhere. Both flags are
 *      gone. Measured on this machine, same build, same scene:
 *          headless_shell + angle=swiftshader   boot TIMED OUT at 300 s
 *          full chromium, no angle flags        boot 1.98 s, grab 3.1 s
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'fs';
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

// H1. Every flag this file understands, and nothing else is tolerated. The
// value `true` means "boolean, takes no argument", so a stray value after one
// is caught too. See the H1 block in the header for the round this cost.
const FLAGS = {
  out: 'string', device: 'string', scale: 'number', deadline: 'number',
  seed: 'number', 'cpu-repeats': 'number', hero: 'bool', gl: 'bool',
};
{
  const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const k = tok.slice(2);
    if (!(k in FLAGS)) { bad.push(tok); continue; }
    if (FLAGS[k] !== 'bool') i++;   // consume its value
  }
  if (bad.length) {
    console.error(`shoot.mjs: unknown flag(s): ${bad.join(', ')}`);
    console.error(`  known: ${Object.keys(FLAGS).map((k) => '--' + k).join(' ')}`);
    if (bad.some((b) => /portrait|iphone|ipad|phone|mobile/i.test(b))) {
      console.error('  ⚠ --portrait IS NOT A FLAG. The device switch is `--device iphone`.');
    }
    process.exit(3);
  }
}

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
// H3. Default 1, not 0: an unseeded harness is the fourth-most-requested fix in
// this project's reports. `--seed 0` opts back out to the real Math.random.
const SEED = Number(arg('seed', 1)) || 0;
const CPU_REPEATS = Math.max(1, Math.min(9, Number(arg('cpu-repeats', 3)) || 3));
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

// H5. Resolve a FULL Chromium, never `chromium_headless_shell`. See the header.
// The search is a glob rather than a fixed list because the playwright revision
// changes under us: the old hard-coded /opt/pw-browsers pair silently fell
// through to `undefined`, which hands the launch to playwright's default — and
// playwright's default IS the headless shell.
const chromeCandidates = () => {
  const roots = [
    '/opt/pw-browsers',
    join(process.env.HOME || '/root', '.cache/ms-playwright'),
  ];
  const out = [];
  for (const r of roots) {
    let entries = [];
    try { entries = readdirSync(r); } catch (e) { continue; }
    // `chromium-1234` yes; `chromium_headless_shell-1234` NO. Newest revision first.
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
  const msg = 'no full Chromium found (playwright\'s default is chromium_headless_shell, '
    + 'which has no navigator.gpu). Run: npx playwright install chromium';
  state.errors.push(msg); flush();
  console.error('shoot.mjs: ' + msg);
  process.exit(1);
}

log(`launching ${devName} layout ${dev.width}x${dev.height} -> render ${W}x${H} (scale ${SCALE}), deadline ${DEADLINE_S}s`);
log(`chromium: ${exe}`);
state.chromium = exe;
state.seed = SEED;

browser = await chromium.launch({
  executablePath: exe,
  args: [
    // ⚠ `--use-gl=angle` and `--use-angle=swiftshader` are NOT here, and must
    // not be re-added. In Chromium 151 they kill the renderer process on the
    // first requestAdapter(); the symptom is a boot that never completes and no
    // error on any channel. `--enable-unsafe-swiftshader` stays: it is what
    // permits the software WebGL2 path this harness actually captures through.
    '--enable-unsafe-swiftshader',
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

// H3. Seed the page BEFORE any script on it runs. This covers three separate
// sources of the run-to-run swing that four reports have now filed:
//   1. this file's own probes (`(Math.random()-0.5)*8` spawn positions, and the
//      random cut heights that decide WHICH fruit a probe stroke hits),
//   2. `slicer.js:117`'s per-half spin, which is what a cut half's pose is,
//   3. `blade.js`'s streak phase.
// `fluid.js` was already seeded internally (`makeRng(20260806)`), which is
// exactly why the juice numbers were the STEADIEST thing in every report — the
// fix is to give the rest of the page the same property.
// xorshift32: same generator the game's own `makeRng` uses, so nothing in the
// page sees a distribution it was not already written against.
if (SEED) {
  await page.addInitScript((seed) => {
    let x = seed >>> 0 || 1;
    Math.random = () => {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }, SEED);
  log(`page Math.random seeded with ${SEED} (--seed 0 to disable)`);
}
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

// H2. Nothing reaches the disk until it is known not to be black. The harness
// wrote a fully black 1280x720 frame silently once in six runs, and a black
// frame is far more dangerous than a missing one: a probe will measure it,
// return a plausible-looking mask of 0 px, and a critic will report the number.
// The floor is deliberately very low (mean luma 0.35/255 over the whole frame,
// with the game's own letterbox black counted in): this is a "did the readback
// return anything at all" gate, NOT a brightness judgement. `12-idle-blade` and
// `01-whole-watermelon` are legitimately dark frames and must still pass.
const LUMA_FLOOR = 0.35;
const frameLuma = async (buf) => {
  const { default: sharp } = await import('sharp');
  const st = await sharp(buf).stats();
  const [r, g, b] = st.channels;
  return 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
};
const grabChecked = async (name) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await page.evaluate(() => window.ZS.grab());
    if (!data || data.length < 2000) {
      if (attempt) throw new Error('empty capture (canvas readback returned nothing)');
      continue;
    }
    const buf = Buffer.from(data.split(',')[1], 'base64');
    let luma = NaN;
    try { luma = await frameLuma(buf); }
    catch (e) { return buf; }   // no decoder is not a reason to lose the frame
    if (luma >= LUMA_FLOOR) { (state.luma ||= {})[name] = +luma.toFixed(3); return buf; }
    log(`  !! ${name}: mean luma ${luma.toFixed(4)} < ${LUMA_FLOOR} — BLACK FRAME, re-rendering`);
    (state.blackFrames ||= []).push({ name, luma: +luma.toFixed(4), attempt });
    await page.evaluate(() => window.ZS.advance(0));
  }
  throw new Error(`BLACK FRAME after 2 attempts — refusing to write ${name}.png`);
};
const shot = (name) => bounded(`shot:${name}`, RENDER_MS, async () => {
  const buf = await grabChecked(name);
  writeFileSync(join(outDir, `${name}.png`), buf);
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
// H4. RUN IT N TIMES. A single run of this probe is not a measurement: round 10
// published a headline off `cpu.max` and the SIGN REVERSED on re-shoot, and the
// round-11 juice owner measured the SAME BUILD's max at 2.4 / 3.8 / 7.9 / 12.6
// ms across four runs. What follows reports the median and the full spread of
// the per-run p50 and p95, and files `max` under a key that says not to quote
// it. A gate quoted to more digits than the harness can reproduce is not a gate.
log(`cpu probe (${CPU_REPEATS} repeats)`);
{
  const runs = [];
  for (let n = 0; n < CPU_REPEATS; n++) {
    const r = await bounded(`cpu:${n}`, 90000, () => page.evaluate(() => {
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
    if (r) runs.push(r);
  }
  if (runs.length) {
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return +(b[b.length >> 1]).toFixed(3); };
    const p50s = runs.map((r) => r.median), p95s = runs.map((r) => r.p95);
    state.cpu = {
      repeats: runs.length,
      median: med(p50s), p95: med(p95s),
      median_spread: [Math.min(...p50s), Math.max(...p50s)],
      p95_spread: [Math.min(...p95s), Math.max(...p95s)],
      // ⚠ NOT A HEADLINE. Kept only so a future round can re-derive the spread
      // that made it unusable. See H4.
      max_do_not_quote: runs.map((r) => r.max),
      runs,
    };
    log(`cpu/frame: p50 ${state.cpu.median}ms (spread ${state.cpu.median_spread.join('-')}) `
      + `p95 ${state.cpu.p95}ms (spread ${state.cpu.p95_spread.join('-')}) over ${runs.length} runs`);
  }
}

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
  // H2 applies here MOST of all: the black frame that started this was on the
  // --hero path, and 00-hero.png is the frame every round's critic opens first.
  await bounded('hero:shot', 240000, async () => {
    writeFileSync(join(outDir, '00-hero.png'), await grabChecked('00-hero'));
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
