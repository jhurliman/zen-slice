/**
 * blissprobe.mjs — the arrival at Dreaming of Bliss (r44), end to end.
 *
 * WHAT IT CHECKS. The three renamed levels; the one-time 5% journey bonus
 * and that it is paid on the LIVE streak while the journey's best is the
 * session peak (a stone before the last page-turn must not erase it); the
 * all-time best updating (and `newBest`) only when the lifted score earns
 * it; the director's toss hold from the facts to the end of the sequence;
 * the column's rows rolling on in order at half-bar lines and off on beats;
 * the readout pinned at the pre-bonus number until the bonus row appears,
 * then settling on the lifted one; the void's glow attached only while the
 * interlude is on screen; and the abort path (reset mid-wait).
 *
 * Runs under ?capture=1&nosound=1 on the harness's virtual clock, which is
 * the NO-GRID path: audio never starts, ctx.barIn stays -1, and hud.js runs
 * the sequence on its own metronome from the wait cap. That makes every
 * boundary below computable to the frame — the on-grid path is the same
 * step engine fed by conductor.timeToNextBar (covered by ear on device).
 *
 *   node tools/blissprobe.mjs
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import { resolveChrome, renderArgs } from './chromepath.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
let checks = 0;
const check = (name, cond, detail) => {
  checks++;
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`);
};

const indexPath = join(root, 'dist/index.html');
if (!existsSync(indexPath)) { console.error('dist/index.html missing — run `node build.mjs`'); process.exit(1); }
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(indexPath));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const exe = resolveChrome();
if (!exe) { console.error('blissprobe.mjs: no full Chromium found. Run: npx playwright install chromium'); process.exit(1); }
const browser = await chromium.launch({
  executablePath: exe,
  args: [...renderArgs(), '--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/?capture=1&nosound=1&nophys=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });

const R = await page.evaluate(() => {
  const ZS = window.ZS;
  const ctx = ZS.ctx;
  const DT = 1 / 120;
  const out = { names: {}, ev: { bliss: [], interlude: [], levels: [] }, t: {}, spawnsHeld: 0, spawnsAfter: 0 };
  let spawns = 0;
  ZS.bus.on('spawn', () => spawns++);
  ZS.bus.on('bliss', (e) => out.ev.bliss.push({ ...e }));
  ZS.bus.on('interlude', (e) => out.ev.interlude.push(!!e.on));
  ZS.bus.on('level', (e) => { out.ev.levels.push(e.level + ':' + e.name); });
  const num = () => document.querySelector('#zs-num')?.textContent;
  const col = () => document.querySelector('.zs-bliss');
  const rowState = () => Array.from(document.querySelectorAll('.zs-bliss-row')).map((r) =>
    (r.classList.contains('out') ? 'out' : r.classList.contains('in') ? 'in' : '-'));
  const step = (s, render = false) => ZS.step(DT, Math.round(s / DT), render);

  ZS.clear();
  step(0.2);
  ZS.director.jumpLevel(5); ZS.director.jumpLevel(7);
  step(0.1);

  // a real slice moves the peak with the score
  const slice = () => {
    const f = ZS.spawn('watermelon');
    f.pos.set(0, 1.2, 0); f.vel.set(0, 0.6, 0);
    step(2 * DT, true);
    const n = f.pos.clone().project(ctx.camera);
    ZS.newStroke?.(); ZS.swipe(n.x - 0.8, n.y, n.x + 0.8, n.y, 12, 7);
    step(0.3, true);
    return ZS.score.score;
  };
  const s1 = slice();
  out.peakAfterSlice = { score: s1, peak: ZS.score.peak };
  ZS.score.score = 4000;                     // stand in for a long run
  const s2 = slice();
  out.peakAfterLong = { score: s2, peak: ZS.score.peak, best: ZS.score.bestScore };
  ZS.bus.emit('rockhit', { at: ctx.camera.position.clone().set(0, 1, 0) });   // the stone takes the streak
  out.afterRock = { score: ZS.score.score, peak: ZS.score.peak };
  ZS.score.score = 2000;                     // a new streak, arriving
  step(2.5);                                 // let the readout settle on it
  spawns = 0;
  ZS.director.jumpLevel(9);
  step(DT);                                  // r44b: jumpLevel settles on the next frame
  out.holdAtArrival = !!ctx.blissHold;
  out.colAtArrival = !!col();
  out.rowsAtArrival = rowState();
  out.numAtArrival = num();

  // the wait: no 'arrival' under nosound, so the cap (6 s) starts it
  let t = 0;
  const until = (pred, cap) => { while (t < cap && !pred()) { step(DT); t += DT; } return pred() ? +t.toFixed(3) : -1; };
  out.t.on = until(() => col()?.classList.contains('on'), 8);
  out.spawnsHeld = spawns;
  step(3 * DT); t += 3 * DT;
  out.bgAtOn = !!ctx.scene.backgroundNode;
  out.numAtOn = num();
  const t0 = t;
  const rel = (v) => (v < 0 ? -1 : +(v - t0).toFixed(3));
  out.t.r0in = rel(until(() => rowState()[0] === 'in', t0 + 12));
  out.numAtBonusIn = num();
  out.t.r1in = rel(until(() => rowState()[1] === 'in', t0 + 12));
  out.t.r2in = rel(until(() => rowState()[2] === 'in', t0 + 12));
  out.t.r0out = rel(until(() => rowState()[0] === 'out', t0 + 14));
  out.t.r1out = rel(until(() => rowState()[1] === 'out', t0 + 14));
  out.t.r2out = rel(until(() => rowState()[2] === 'out', t0 + 14));
  out.t.nameOff = rel(until(() => col()?.classList.contains('off'), t0 + 14));
  out.t.end = rel(until(() => !ctx.blissHold, t0 + 16));
  out.codaAtEnd = document.querySelector('.zs-score')?.classList.contains('coda');
  out.numAtEnd = num();
  spawns = 0;
  step(4);
  out.spawnsAfter = spawns;
  step(2);
  out.bgAfter = !!ctx.scene.backgroundNode;
  out.colGone = !col();

  // second run: a lifted score that IS a new all-time best, then an abort
  ZS.clear(); step(0.2);
  out.blissAfterReset = ZS.score.peak === 0 && ZS.score.score === 0;
  ZS.score.score = 9000;                     // set and jump in the SAME tick: the
  ZS.director.jumpLevel(9);                  // readout has not begun easing toward it
  step(DT);
  out.numStale = num();                      // r44b: must snap to 9000, not pin the stale 0
  step(1.0);
  out.abortBefore = { hold: !!ctx.blissHold, col: !!col() };
  ZS.clear(); step(3 * DT);
  out.abortAfter = { hold: !!ctx.blissHold, col: !!col(), bg: !!ctx.scene.backgroundNode };

  // third run: the NATURAL page-turn (PR #32 review). slicer.js calls
  // noteSlice() before it emits that cut's 'slice', so the coda's 'level'
  // lands with the arriving cut unscored. Drive the real path: Night Jasmine
  // with its gates satisfied (dur 150 s of sim, 48 slices), then ONE real
  // cut turns the page — its gain must be in the streak the bonus is paid on.
  ZS.clear(); step(0.2);
  ZS.director.jumpLevel(8);
  ZS.director.sliced = 48;
  ZS.advance(151);
  ZS.score.score = 2000; ZS.score.peak = 2000;
  const nBefore = out.ev.bliss.length;
  const f9 = ZS.spawn('watermelon');
  f9.pos.set(0, 1.2, 0); f9.vel.set(0, 0.6, 0);
  step(2 * DT, true);
  const n9 = f9.pos.clone().project(ctx.camera);
  ZS.newStroke?.(); ZS.swipe(n9.x - 0.8, n9.y, n9.x + 0.8, n9.y, 12, 7);
  step(0.3, true);
  out.natural = { level: ZS.director.level, fired: out.ev.bliss.length - nBefore, total: ZS.score.total };
  out.moduleErrors = ZS.moduleErrors.map((m) => m.module + '.' + m.phase + ': ' + m.error.split('\n')[0]);
  return out;
});
await browser.close();
server.close();

console.log('\n── names ──');
check('level 5 is Summer Glare', R.ev.levels.includes('5:Summer Glare'), R.ev.levels[0]);
check("level 7 is Dusk's Edge", R.ev.levels.includes("7:Dusk's Edge"), R.ev.levels[1]);
check('level 9 is Dreaming of Bliss', R.ev.levels.some((l) => l === '9:Dreaming of Bliss'));

console.log('\n── the facts (score.js) ──');
const b1 = R.ev.bliss[0], b2 = R.ev.bliss[1];
check('a slice moves the peak with the score', R.peakAfterSlice.score > 0 && R.peakAfterSlice.peak === R.peakAfterSlice.score, JSON.stringify(R.peakAfterSlice));
check('the peak follows a long run', R.peakAfterLong.peak === R.peakAfterLong.score && R.peakAfterLong.score > 4000, JSON.stringify(R.peakAfterLong));
check('a stone takes the streak, not the peak', R.afterRock.score === 0 && R.afterRock.peak === R.peakAfterLong.peak, JSON.stringify(R.afterRock));
check('bliss fired once per arrival', R.ev.bliss.length === 3, `${R.ev.bliss.length} events over three runs`);
check('bonus is 5% of the LIVE streak (2000 → +100)', b1 && b1.bonus === 100 && b1.score === 2100, JSON.stringify(b1));
check('journey best is the session peak, not the arriving score', b1 && b1.journeyBest === R.peakAfterLong.peak, `${b1?.journeyBest} vs peak ${R.peakAfterLong.peak}`);
check('all-time best unchanged when the lifted score is below it', b1 && b1.allTimeBest === R.peakAfterLong.best && b1.newBest === false, `${b1?.allTimeBest} new=${b1?.newBest}`);
check('second run: 9000 → +450, and it IS a new all-time best', b2 && b2.bonus === 450 && b2.score === 9450 && b2.newBest === true && b2.allTimeBest === 9450, JSON.stringify(b2));
check('reset clears the peak (and re-arms the bonus)', R.blissAfterReset);
const b3 = R.ev.bliss[2];
check('natural page-turn: one real cut turns the page to the coda', R.natural.level === 9 && R.natural.fired === 1, JSON.stringify(R.natural));
check('…and THAT cut is in the streak the bonus is paid on (PR #32 review)',
  b3 && b3.score - b3.bonus > 2000 && b3.bonus === Math.round((b3.score - b3.bonus) * 0.05),
  b3 ? `pre-bonus ${b3.score - b3.bonus} (cut worth ${b3.score - b3.bonus - 2000}), bonus ${b3.bonus}` : 'no event');

console.log('\n── the hold and the column (hud.js / director.js) ──');
check('blissHold is up the moment the facts land', R.holdAtArrival);
check('the column exists, three rows, none shown yet', R.colAtArrival && R.rowsAtArrival.join(',') === '-,-,-', R.rowsAtArrival.join(','));
check('nothing is tossed under the hold', R.spawnsHeld === 0, `${R.spawnsHeld} spawns during ${R.t.on}s`);
check('no arrival (nosound) → the sequence starts at the 6 s cap', R.t.on >= 5.9 && R.t.on <= 6.2, `${R.t.on}s`);
check("'interlude' on/off bracket the sequence", R.ev.interlude.join(',') === 'true,false,false' || R.ev.interlude.join(',') === 'true,false', R.ev.interlude.join(','));
check('the void glows once the sequence is on', R.bgAtOn === true);

// the fallback metronome: beat 60/66 = 0.909 s, half-bar 1.818 s
const beat = 60 / 66, half = 2 * beat;
const near = (v, want, tol = 0.12) => v >= 0 && Math.abs(v - want) <= tol;
console.log('\n── the rolls, on the metronome (beat 0.909 s) ──');
check('bonus row rolls on at the first half-bar (1.82 s)', near(R.t.r0in, half), `${R.t.r0in}s`);
check('journey row at the next (3.64 s)', near(R.t.r1in, 2 * half), `${R.t.r1in}s`);
check('all-time row at the next (5.45 s)', near(R.t.r2in, 3 * half), `${R.t.r2in}s`);
check('bonus row rolls off a half-bar later (7.27 s)', near(R.t.r0out, 4 * half), `${R.t.r0out}s`);
check('journey row off on the next beat (8.18 s)', near(R.t.r1out, 4 * half + beat), `${R.t.r1out}s`);
check('all-time row off on the next beat (9.09 s)', near(R.t.r2out, 4 * half + 2 * beat), `${R.t.r2out}s`);
check('the name lets go a beat later (10.0 s)', near(R.t.nameOff, 4 * half + 3 * beat), `${R.t.nameOff}s`);
check('the hold lets go a beat after that (10.9 s)', near(R.t.end, 4 * half + 4 * beat), `${R.t.end}s`);

console.log('\n── the readout ──');
check('pinned at the pre-bonus number through the wait', R.numAtArrival === '2000' && R.numAtOn === '2000', `${R.numAtArrival} / ${R.numAtOn}`);
check('still pinned as the bonus row appears', R.numAtBonusIn === '2000', R.numAtBonusIn);
check('settled on the lifted number by the end', R.numAtEnd === '2100', R.numAtEnd);
check('the readout retires (coda) only when the sequence ends', R.codaAtEnd === true);
check('a readout still easing when the coda lands snaps to the exact pre-bonus number (PR #32 review)', R.numStale === '9000', R.numStale);

console.log('\n── after ──');
check('the arc resumes: tosses return once the hold lets go', R.spawnsAfter > 0, `${R.spawnsAfter} in 4 s`);
check('the void is dark again within 6 s', R.bgAfter === false);
check('the column is gone', R.colGone);
check('abort: reset mid-wait drops the hold, the column and the glow', R.abortBefore.hold && R.abortBefore.col && !R.abortAfter.hold && !R.abortAfter.col && !R.abortAfter.bg, JSON.stringify(R.abortAfter));
check('no module died', R.moduleErrors.length === 0 && errs.length === 0, [...R.moduleErrors, ...errs].join(' | '));

const pass = failures.length === 0;
console.log(`\n${pass ? 'PASS' : 'FAIL'} — ${checks - failures.length}/${checks} checks`);
if (!pass) { for (const f of failures) console.log(`  · ${f}`); process.exit(1); }
console.log('');
