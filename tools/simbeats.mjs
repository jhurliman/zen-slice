/**
 * simbeats.mjs — ADDED in round 11. A probe, not a target. Nothing here is
 * scored; it answers exactly one question:
 *
 *     when tools/shoot.mjs writes a file called "05-cut+500ms.png",
 *     how many milliseconds of SIMULATION time have actually elapsed
 *     since the cut?
 *
 * Every lifetime constant in src/juice/fluid.js, every drag coefficient, every
 * birth delay is authored in SIM seconds, but every critic has read the beat
 * labels as if they were sim time. They were not, because score.js emitted
 * `slowmo` on every cut and main.js feeds the fixed-step accumulator
 * `dt * ctx.timeScale`. fluid.js note (h) works the discrepancy out by hand at
 * 3x. This measures it instead of deriving it.
 *
 * It renders NOTHING (ZS.step(dt, n, false) throughout), so a full run is a few
 * seconds even under SwiftShader. It replays the exact beat sheet of shoot.mjs
 * — same spawns, same swipes, same advance() durations, in the same order —
 * and reads ctx.time (which only advances inside the fixed-step loop) around
 * each beat.
 *
 * Usage: node tools/simbeats.mjs [--device desktop|iphone] [--json out.json]
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };

const DEVICES = {
  desktop: { width: 1280, height: 720, tier: 3 },
  iphone: { width: 430, height: 932, tier: 2 },
};
const devName = String(arg('device', 'desktop'));
const dev = DEVICES[devName] || DEVICES.desktop;

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
];
const browser = await chromium.launch({
  executablePath: CHROMES.find((p) => existsSync(p)),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });
await page.evaluate((t) => { window.ZS.pause(); window.ZS.setTier(t); }, dev.tier);

const out = await page.evaluate(() => {
  const ZS = window.ZS, ctx = ZS.ctx;
  const rows = [];
  // dark advance: never render, so this is cheap under software GL
  const adv = (label, seconds) => {
    const t0 = ctx.time, ts0 = ctx.timeScale;
    ZS.step(1 / 120, Math.max(1, Math.round(seconds * 120)), false);
    rows.push({
      label,
      wall_ms: +(seconds * 1000).toFixed(1),
      sim_ms: +((ctx.time - t0) * 1000).toFixed(1),
      ratio: +((ctx.time - t0) / seconds).toFixed(3),
      timeScale_before: +ts0.toFixed(3),
      timeScale_after: +ctx.timeScale.toFixed(3),
    });
  };
  const cut = (ax, ay, bx, by, steps, speed) => { ZS.newStroke(); ZS.swipe(ax, ay, bx, by, steps, speed); };

  // ── shoot.mjs beat sheet, verbatim ─────────────────────────────────────────
  ZS.clear(); ZS.step(1 / 120, 6, false);
  const f = ZS.spawn('watermelon');
  f.pos.set(0, 0.2, 0); f.vel.set(0, 2.0, 0); f.spin.set(0.15, 0.35, 0.05);
  adv('01-whole-watermelon (pre-cut 300ms)', 0.30);
  cut(-0.85, 0.16, 0.85, -0.10, 12, 5.0);
  adv('02-cut+33ms', 0.033);
  adv('03-cut+100ms', 0.067);
  adv('04-cut+250ms', 0.150);
  adv('05-cut+500ms', 0.250);
  adv('06-cut+1000ms', 0.500);

  ZS.clear();
  const o = ZS.spawn('orange'); o.pos.set(-2.2, -0.4, 1.6); o.vel.set(0.5, 2.4, 0); o.spin.set(0.2, 0.2, 0.1);
  const k = ZS.spawn('kiwi'); k.pos.set(2.4, -0.8, 1.2); k.vel.set(-0.4, 2.8, 0); k.spin.set(0.1, 0.3, 0.2);
  adv('citrus settle', 0.30);
  cut(-0.95, -0.22, 0.95, 0.20, 14, 6.0);
  adv('07-citrus-cut (+120ms)', 0.12);
  adv('08-citrus-caps (+350ms)', 0.35);

  ZS.clear();
  const of = ZS.spawn('orange'); of.pos.set(0, 0, 0); of.vel.set(0, 1.2, 0); of.spin.set(0.1, 0.2, 0);
  adv('fast settle', 0.20);
  cut(-0.9, 0.0, 0.9, 0.05, 16, 14.0);
  adv('15-fast-flick+50ms', 0.05);

  ZS.clear();
  const wm = ZS.spawn('watermelon'); wm.pos.set(0, 0, 0); wm.vel.set(0, 1.2, 0); wm.spin.set(0.1, 0.2, 0);
  adv('slow settle', 0.20);
  cut(-0.5, 0.0, 0.5, 0.03, 16, 1.2);
  adv('16-slow-cleave+50ms', 0.05);

  ZS.clear();
  ['watermelon', 'pineapple', 'strawberry', 'apple', 'orange'].forEach((id, i) => {
    const g = ZS.spawn(id);
    g.pos.set(-5.4 + i * 2.7, -2.6 + (i % 2) * 1.6, (i % 3 - 1) * 1.2);
    g.vel.set(0, 4.6 - i * 0.25, 0); g.spin.set(0.2 * i, 0.3, 0.1);
  });
  adv('combo settle', 0.35);
  cut(-0.97, -0.30, 0.97, 0.30, 20, 7.5);
  adv('09-combo+50ms', 0.05);
  adv('10-combo+200ms', 0.15);
  adv('11-combo+550ms', 0.35);

  // cumulative sim time since each cut, for the labels critics actually quote
  const idx = (frag) => rows.findIndex((r) => r.label.indexOf(frag) === 0);
  const cum = (from, upto) => {
    let s = 0;
    for (let i = from; i <= upto; i++) s += rows[i].sim_ms;
    return +s.toFixed(1);
  };
  // ── PART 2: play cadence ───────────────────────────────────────────────────
  // director.js counts down `nextSpawn` in SIM seconds and score.js measures
  // the combo window in REAL seconds. When timeScale < 1 those two clocks
  // disagree, so how often a player SEES a fruit appear depends on how often
  // they cut. This runs a plausible session — a wide swipe every N real
  // seconds — and reports the real-time cadence the player actually gets.
  const cadence = (realSeconds, sliceEveryReal, level = 0) => {
    ZS.clear();
    ZS.director.level = level; ZS.director.sliced = 0;
    let spawns = 0, slices = 0;
    const offS = ctx.bus.on('spawn', () => spawns++);
    const offC = ctx.bus.on('slice', () => slices++);
    const t0 = ctx.time;
    const steps = Math.round(realSeconds * 120);
    const every = Math.max(1, Math.round(sliceEveryReal * 120));
    let comboSum = 0, comboN = 0, bodySum = 0, bodyN = 0, bodyPeak = 0;
    const stepHist = [0, 0, 0, 0, 0];
    for (let i = 0; i < steps; i++) {
      if (i % every === 0) {
        // aim the swipe THROUGH a live body, or the sample measures nothing:
        // a blind horizontal swipe at a fixed height connects ~1 time in 15.
        const live = ZS.director.live;
        let best = null;
        for (let j = 0; j < live.length; j++) {
          if (live[j].generation !== 0) continue;
          const p = live[j].pos.clone().project(ctx.camera);
          if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) continue;
          if (!best || Math.abs(p.y) < Math.abs(best.y)) best = p;
        }
        if (best) {
          ZS.newStroke();
          ZS.swipe(best.x - 0.45, best.y - 0.18, best.x + 0.45, best.y + 0.18, 14, 6.0);
          if (ZS.score.combo) { comboSum += ZS.score.combo; comboN++; }
        }
      }
      ZS.step(1 / 120, 1, false);
      // steps-per-tick: main.js runs `while (acc >= SIM_DT)` up to MAX_SUBSTEPS
      // (4). Every module's fixed() runs once per step, so this histogram IS
      // the per-frame CPU shape. A steady 1 is a smooth frame; a run of 0s
      // followed by a 3 or a 4 is a visible hitch.
      const st = ZS.stats.steps | 0;
      stepHist[Math.min(4, st)]++;
      const n = ZS.director.live.length;
      bodySum += n; bodyN++; if (n > bodyPeak) bodyPeak = n;
    }
    offS(); offC();
    const sim = ctx.time - t0;
    return {
      level,
      slice_every_real_s: sliceEveryReal,
      real_s: realSeconds,
      sim_s: +sim.toFixed(2),
      sim_per_real: +(sim / realSeconds).toFixed(3),
      spawns, slices,
      spawns_per_real_min: +(spawns / realSeconds * 60).toFixed(1),
      mean_combo: comboN ? +(comboSum / comboN).toFixed(2) : 0,
      // draw calls are exactly 13 + 2*bodies (BUDGET.fixedDrawCalls +
      // callsPerBody), so the population IS the draw-call curve
      mean_bodies: bodyN ? +(bodySum / bodyN).toFixed(1) : 0,
      peak_bodies: bodyPeak,
      mean_draw_calls: bodyN ? +(13 + 2 * bodySum / bodyN).toFixed(1) : 0,
      peak_draw_calls: 13 + 2 * bodyPeak,
      // ticks that ran 0/1/2/3/4+ fixed steps
      steps_per_tick: stepHist,
      pct_ticks_0_steps: +(100 * stepHist[0] / steps).toFixed(1),
      pct_ticks_ge2_steps: +(100 * (stepHist[2] + stepHist[3] + stepHist[4]) / steps).toFixed(1),
    };
  };
  const cadences = [
    cadence(24, 2.5, 0), cadence(24, 1.2, 0),
    cadence(24, 1.2, 5), cadence(24, 0.5, 5),
  ];

  const m0 = idx('02-cut'), c0 = idx('09-combo');
  const melon = {
    '+33ms': cum(m0, m0), '+100ms': cum(m0, m0 + 1), '+250ms': cum(m0, m0 + 2),
    '+500ms': cum(m0, m0 + 3), '+1000ms': cum(m0, m0 + 4),
  };
  const combo = { '+50ms': cum(c0, c0), '+200ms': cum(c0, c0 + 1), '+550ms': cum(c0, c0 + 2) };
  return { rows, melonCutBeats: melon, comboCutBeats: combo, cadences, score: ZS.score.score, best: ZS.score.best };
});

console.log(JSON.stringify({ device: devName, errors: errs.slice(0, 6), ...out }, null, 2));
const jf = arg('json', null);
if (jf) writeFileSync(join(root, jf), JSON.stringify({ device: devName, ...out }, null, 2));
await browser.close();
server.close();
process.exit(0);
