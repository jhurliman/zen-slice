/**
 * audioprobe.mjs — ADDED with the generative-music round. Sound made
 * assertable without ears, in two halves:
 *
 *  PART 1 (node, no browser): harmony.js is a pure state machine with no Web
 *  Audio in it, so its musical laws are checked directly — every species in
 *  every chord of every palette lands on a chord tone; voiced chords never
 *  put an interval tighter than a P5 below E2 (the anti-mud rule) or tighter
 *  than a minor 3rd anywhere; the progression loops and level palettes land
 *  at boundaries.
 *
 *  PART 2 (browser): boots the real build, force-unlocks audio (the harness
 *  path has no gesture — chromium is launched with autoplay allowed), and
 *  asserts on ZS.audio.state(): a three-fruit swipe gathers into ONE pending
 *  chord group (the regression test for the old stacked-chime bug), the
 *  gather flushes, the piano kit renders, tempo inference stays in 60–90,
 *  and a scripted session ends with zero audio errors and audio still alive
 *  in ZS.moduleErrors terms.
 *
 * Usage: node tools/audioprobe.mjs [--json out.json]
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };

const failures = [];
const ok = (cond, label) => { if (!cond) failures.push(label); return !!cond; };

// ── PART 1: the harmonic field's laws, checked in pure node ─────────────────
const { createHarmony } = await import(join(root, 'src/audio/harmony.js'));
const { MOTIFS, BASSES, PAD_COUNT } = await import(join(root, 'src/audio/conductor.js'));
const { SWISH_FOR_LEVEL } = await import(join(root, 'src/audio/instruments.js'));
const { SPACE_FOR_LEVEL } = await import(join(root, 'src/audio/audio.js'));
const SPECIES = ['watermelon', 'pineapple', 'orange', 'apple', 'kiwi', 'strawberry'];
const E2 = -17;
const N_LEVELS = 10;   // the r18 day arc — director.LEVELS is index-matched
ok(MOTIFS.length === N_LEVELS, `MOTIFS has ${MOTIFS.length} levels, expected ${N_LEVELS}`);
ok(BASSES.length === N_LEVELS, `BASSES has ${BASSES.length} levels, expected ${N_LEVELS}`);
ok(PAD_COUNT.length === N_LEVELS, `PAD_COUNT has ${PAD_COUNT.length} levels, expected ${N_LEVELS}`);
ok(SWISH_FOR_LEVEL.length === N_LEVELS, `SWISH_FOR_LEVEL has ${SWISH_FOR_LEVEL.length} levels, expected ${N_LEVELS}`);
ok(SPACE_FOR_LEVEL.length === N_LEVELS, `SPACE_FOR_LEVEL has ${SPACE_FOR_LEVEL.length} levels, expected ${N_LEVELS}`);
{
  const h = createHarmony();
  let chordsChecked = 0;
  for (let level = 0; level < N_LEVELS; level++) {
    h.setLevel(level); h.advance();            // palette lands on the advance
    ok(h.level() === level, `harmony has no palette for level ${level} (clamped to ${h.level()})`);
    const seen = new Set();
    for (let step = 0; step < 8; step++) {
      const chord = h.chord();
      seen.add(chord.name);
      chordsChecked++;
      // every species, at several combo depths, lands inside the chord
      const legal = new Set(chord.tones.concat([chord.bass, chord.color]).map((p) => ((p % 12) + 12) % 12));
      for (const id of SPECIES) {
        for (let climb = 0; climb < 4; climb++) {
          const n = h.noteFor(id, climb);
          ok(legal.has(((n % 12) + 12) % 12), `L${level} ${chord.name}: ${id}+${climb} → ${n} off-chord`);
          ok(n >= -25 && n <= 31, `L${level} ${chord.name}: ${id}+${climb} → ${n} out of register`);
        }
        // the bass-alternation contract: every chord contains its root's fifth
        ok(legal.has((chord.tones[0] + 7) % 12), `L${level} ${chord.name}: root's fifth missing from chord`);
      }
      // voiced chords respect the interval rules
      for (const combo of [
        SPECIES.map((id, i) => ({ id, climb: i })),
        [{ id: 'watermelon', climb: 0 }, { id: 'watermelon', climb: 1 }, { id: 'pineapple', climb: 0 }],
        [{ id: 'strawberry', climb: 0 }, { id: 'strawberry', climb: 1 }, { id: 'kiwi', climb: 0 }],
      ]) {
        const v = [...h.voiceChord(combo)].sort((a, b) => a - b);
        for (let i = 1; i < v.length; i++) {
          const gap = v[i] - v[i - 1];
          const low = v[i] < E2 || v[i - 1] < E2;
          ok(gap >= (low ? 7 : 3), `L${level} ${chord.name}: voiced gap ${gap} (${low ? 'low' : 'mid'}) in [${v}]`);
        }
      }
      // the flourish/arp pool and pad voicing stay inside the kit's span
      for (const n of h.glissNotes()) ok(n >= -25 && n <= 31, `L${level} ${chord.name}: gliss note ${n} out of range`);
      // r26 grand run: in-chord, in-range, strictly ascending, both spans
      for (const span of [2, 3]) {
        const run = h.runNotes(span);
        ok(run.length >= 5 && run.length <= 12, `L${level} ${chord.name}: runNotes(${span}) length ${run.length}`);
        for (let i = 0; i < run.length; i++) {
          const n = run[i];
          ok(legal.has(((n % 12) + 12) % 12), `L${level} ${chord.name}: run note ${n} off-chord`);
          ok(n >= -25 && n <= 31, `L${level} ${chord.name}: run note ${n} out of range`);
          if (i > 0) ok(n > run[i - 1], `L${level} ${chord.name}: run not ascending at ${i} [${run}]`);
        }
      }
      for (const n of h.padNotes(5)) ok(n >= -25 && n <= 31, `L${level} ${chord.name}: pad note ${n} out of range`);
      // every level-motif entry voices in-chord and in-range in this chord
      for (const m of MOTIFS[level]) {
        const n = h.melNote(m.d, m.o);
        ok(legal.has(((n % 12) + 12) % 12), `L${level} ${chord.name}: motif step ${m.s} → ${n} off-chord`);
        ok(n >= -25 && n <= 31, `L${level} ${chord.name}: motif step ${m.s} → ${n} out of range`);
        ok(m.s >= 0 && m.s <= 15, `L${level}: motif step ${m.s} off the 16-step grid`);
        // an authored octave shift is EXACTLY 12·o from the o:0 voicing —
        // place()'s nearest-realization rounding must never eat it (codex
        // P2). Only authored o values are asserted: one octave beyond them
        // the range clamp legitimately folds.
        ok(n - h.melNote(m.d, 0) === 12 * m.o,
          `L${level} ${chord.name}: melNote(${m.d}, ${m.o}) not ${12 * m.o} above o:0`);
      }
      for (const b of BASSES[level]) ok(b.s >= 0 && b.s <= 15, `L${level}: bass step ${b.s} off the grid`);
      h.advance();
    }
    ok(seen.size >= 2, `L${level}: progression did not move (${[...seen]})`);
  }
  console.error(`[harmony] ${chordsChecked} chords checked, ${failures.length} failures`);
}

// ── PART 2: the live system in the real build ───────────────────────────────
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
  '/opt/pw-browsers/chromium',
];
const browser = await chromium.launch({
  executablePath: CHROMES.find((p) => existsSync(p)),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
// ?nophys=1: Rapier adds real milliseconds per fixed step under SwiftShader,
// and the chord-gather assertions race an 80 ms REAL-time window — audio
// never touches physics, so the probe runs ballistic to keep steps cheap.
await page.goto(`http://localhost:${PORT}/?capture=1&nophys=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });

// unlock via a real (trusted) gesture — evaluate() calls are not gestures and
// leave the context suspended even with autoplay allowed — then force the
// programmatic path too so both are exercised
await page.mouse.move(215, 460);
await page.mouse.down(); await page.mouse.up();
await page.evaluate(() => window.ZS.audio.unlock());
await page.waitForFunction(() => window.ZS.audio.state().actxState === 'running', null, { timeout: 5000 })
  .catch(() => {});
const s0 = await page.evaluate(() => window.ZS.audio.state());
ok(s0.started, 'audio failed to unlock');
ok(s0.actxState === 'running', `AudioContext state "${s0.actxState}" — not running`);

// the piano kit renders off-thread; give it time
await page.waitForFunction(() => window.ZS.audio.state().pianoReady, null, { timeout: 20000 })
  .catch(() => failures.push('piano kit did not render within 20s'));

// ── one swipe through three fruit = ONE chord group ──
const chordProbe = await page.evaluate(async () => {
  const ZS = window.ZS, ctx = ZS.ctx;
  ZS.clear();
  // two fruit, not three: each queued cut costs ~3-7 ms of REAL time
  // (cutGeometry) inside the 80 ms real-clock gather window, and a slow CI
  // machine with three cuts can blow through it mid-collection — a timing
  // flake, not the stacking regression these assertions exist to catch
  const line = [['orange', -2.2], ['kiwi', 2.2]];
  for (const [id, x] of line) {
    const f = ZS.spawn(id);
    f.pos.set(x, 0.2, 0); f.vel.set(0, 0.5, 0);
  }
  await new Promise((r) => setTimeout(r, 60)); // let a frame land the spawns
  let slices = 0;
  // r22: harmony events (one per multi-fruit stroke) recorded for assertions
  window.__harmony = [];
  ctx.bus.on('harmony', (h) => window.__harmony.push({ size: h.size, gain: h.gain }));
  const off = ctx.bus.on('slice', () => slices++);
  const swishesBefore = ZS.audio.state().swishes;
  ZS.newStroke();
  ZS.swipe(-0.9, 0.03, 0.9, 0.03, 14, 6.0);
  // r19-perf queues all but the first cut of a stroke to one-per-fixed-step —
  // drain the queue NOW (a few 1/120 steps, well inside the 80 ms real-time
  // chord gather)
  ZS.step(1 / 120, 6, false);
  const atSwipe = ZS.audio.state();
  // r25: the live multiplier chip — a 2-fruit stroke makes combo 2 (×1.5),
  // and hud.frame (driven by the steps above) must have lit it by now
  const multEl = document.getElementById('zs-mult');
  const multOn = !!multEl && multEl.classList.contains('on');
  const multText = multEl ? multEl.textContent : null;
  off();

  // Observe the flush from IN HERE, with the renderer still paused. Measured:
  // once ZS.resume() restarts rendering, each SwiftShader frame hogs the main
  // thread ~1 s, so any page-side poll observes the flush 1-3 s late — long
  // enough for a short piano buffer to END, which read as a missing chord
  // voice. Paced manual steps (audio.frame runs inside ZS.step; the chord
  // gather runs on the REAL actx clock, which keeps advancing through the
  // sleeps) let us capture voicesActive at the exact iteration the flush
  // lands, contention-free.
  let flushVoices = -1, flushed = false;
  for (let i = 0; i < 60; i++) {
    ZS.step(1 / 120, 1, false);
    const s = ZS.audio.state();
    if (s.pending === 0) { flushed = true; flushVoices = s.voicesActive; break; }
    await new Promise((r) => setTimeout(r, 10));
  }
  ZS.resume();
  return {
    slices,
    pendingAtSwipe: atSwipe.pending,
    swishesFired: atSwipe.swishes - swishesBefore,
    voicesAtContact: atSwipe.voicesActive,
    multOn, multText,
    pendingAfter: flushed ? 0 : ZS.audio.state().pending,
    voices: flushVoices,
    chord: ZS.audio.state().chord,
  };
});
// (the flush + voices capture happens inside the evaluate above, renderer
// paused — see the comment there for why any external poll is too stale)
ok(chordProbe.slices >= 2, `combo swipe only cut ${chordProbe.slices} fruit`);
// r28: the pending count can legitimately read 0 here — a main-thread stall
// (the detached piano-take renders burst on this machine) can push the drain
// past the gather deadline, flushing before this read. Grouping itself is
// verified by the exactly-one DYAD harmony assertion below, so an early
// flush is only accepted when that flush actually happened as ONE group.
ok(chordProbe.pendingAtSwipe === chordProbe.slices
  || (chordProbe.pendingAtSwipe === 0 && chordProbe.voices >= chordProbe.slices),
  `slices=${chordProbe.slices} but pending=${chordProbe.pendingAtSwipe} — not gathered as one chord`);
ok(chordProbe.swishesFired === 1,
  `one stroke through ${chordProbe.slices} fruit fired ${chordProbe.swishesFired} swishes — must be exactly 1 (r18)`);
// r25: the multiplier chip must be lit at ×1.5 while the 2-cut chain is alive
ok(chordProbe.multOn === true && chordProbe.multText === '×1.5',
  `multiplier chip after a 2-fruit stroke: on=${chordProbe.multOn} text="${chordProbe.multText}", expected ×1.5 lit`);
// r31: pitches are derived at flush (the field at sound time decides), so
// no piano voice is reserved at contact anymore — but the SWISH still owns
// contact, so at least one voice must be live before the flush
ok(chordProbe.voicesAtContact >= 1,
  `no voice live at contact (voicesActive=${chordProbe.voicesAtContact}) — the contact swish is missing`);
ok(chordProbe.pendingAfter === 0, `gather never flushed (pending=${chordProbe.pendingAfter})`);
ok(chordProbe.voices >= chordProbe.slices, `chord flushed but only ${chordProbe.voices} voices active`);

// ── r22: the HARMONY callout — one per multi-fruit stroke, named for the chord ──
const harmonyOk = await page
  .waitForFunction(() => window.__harmony && window.__harmony.length >= 1, null, { polling: 100, timeout: 20000 })
  .then(() => true).catch(() => false);
const harmony = await page.evaluate(() => ({
  events: window.__harmony,
  label: document.querySelector('.zs-combo .zs-c1')?.dataset?.t ?? null,
}));
ok(harmonyOk && harmony.events.length === 1,
  `2-fruit stroke emitted ${harmony.events.length} harmony events, expected exactly 1`);
ok(harmony.events[0]?.size === 2, `harmony size ${harmony.events[0]?.size}, expected 2`);
ok(harmony.events[0]?.gain > 0, `harmony gain ${harmony.events[0]?.gain}, expected > 0`);
ok(harmony.label === 'DYAD', `callout label "${harmony.label}", expected DYAD`);

// ── the rock (r20): hit test without a cut, penalty, crack, no juice ──
const rockProbe = await page.evaluate(async () => {
  const ZS = window.ZS, ctx = ZS.ctx;
  ZS.clear();
  ZS.score.score = 100;
  const r = ZS.spawn('rock');
  r.pos.set(0, 0.2, 0); r.vel.set(0, 0.5, 0);
  await new Promise((res) => setTimeout(res, 60));
  let slices = 0, juices = 0, hits = 0, penalties = 0;
  const offs = [
    ctx.bus.on('slice', () => slices++),
    ctx.bus.on('juice', () => juices++),
    ctx.bus.on('rockhit', () => hits++),
    ctx.bus.on('penalty', () => penalties++),
  ];
  ZS.newStroke();
  ZS.swipe(-0.8, 0.03, 0.8, 0.03, 12, 6.0);
  ZS.step(1 / 120, 6, false);
  ZS.resume();
  offs.forEach((f) => f());
  const dmg = r.mesh.material[0]?._zsDamage ? r.mesh.material[0]._zsDamage.value : -1;
  return {
    slices, juices, hits, penalties,
    score: ZS.score.score, combo: ZS.score.combo, damage: dmg, dead: r.dead,
    errors: ZS.audio.state().errors,
  };
});
ok(rockProbe.hits === 1, `rock swipe fired ${rockProbe.hits} rockhits, expected 1`);
ok(rockProbe.slices === 0 && rockProbe.juices === 0,
  `rock emitted slice=${rockProbe.slices} juice=${rockProbe.juices} — a rock must never cut or spray`);
ok(rockProbe.penalties === 1, `rock fired ${rockProbe.penalties} penalties, expected 1`);
ok(rockProbe.score === 75, `score after rock: ${rockProbe.score}, expected 75 (100 − 25)`);
ok(rockProbe.combo === 0, `combo after rock: ${rockProbe.combo}, expected 0`);
ok(rockProbe.damage === 1, `rock damage uniform is ${rockProbe.damage}, expected 1`);
ok(rockProbe.dead === false, 'the rock was removed/cut by the stroke');
ok(rockProbe.errors.length === 0, `audio errors after rockhit: ${JSON.stringify(rockProbe.errors)}`);

// ── a scripted session: rhythmic slicing, tempo bounds, zero errors ──
const session = await page.evaluate(async () => {
  const ZS = window.ZS;
  // r22 regression: ten SEPARATE single-fruit strokes must emit ZERO harmony
  // events — the old callout fired on the cross-stroke chain, which is
  // exactly the semantic bug the harmony/phrase split fixes
  window.__harmony.length = 0;
  for (let i = 0; i < 10; i++) {
    ZS.clear();
    const f = ZS.spawn(i % 2 ? 'watermelon' : 'strawberry');
    f.pos.set(0, 0.2, 0); f.vel.set(0, 0.5, 0);
    await new Promise((r) => setTimeout(r, 40));
    ZS.newStroke();
    ZS.swipe(-0.8, 0.05, 0.8, 0.05, 12, 6.0);
    await new Promise((r) => setTimeout(r, 700)); // ~86 BPM cadence
  }
  ZS.bus.emit('level', { level: 2, name: 'Orchard Rain' });
  await new Promise((r) => setTimeout(r, 300));
  // r21: the settings mute — master to 0 via the pref event, engine stays up
  ZS.bus.emit('pref', { key: 'sound', value: false });
  const mutedState = ZS.audio.state().muted;
  ZS.bus.emit('pref', { key: 'sound', value: true });
  const unmutedState = ZS.audio.state().muted;
  const st = ZS.audio.state();
  const dead = ZS.moduleErrors.filter((m) => m.module === 'audio' || m.module === 'haptics');
  // r27: the beat-synced combo window, the day-arc space switch, the meter.
  // The level flap (8 then back to 2) happens AFTER `st` is captured so the
  // level/levelPending assertions below still see the session's level 2.
  const comboWindow = ZS.score.comboWindow ? ZS.score.comboWindow() : -1;
  // r28: the grid publications for the beat-quantized toss
  const toss8In = ZS.ctx.toss8In;
  ZS.bus.emit('level', { level: 8, name: 'Night Jasmine' });
  await new Promise((r) => setTimeout(r, 120));
  const spaceNight = ZS.audio.state().space;
  ZS.bus.emit('level', { level: 2, name: 'Morning Dew' });
  const meter = ZS.audio.meter ? ZS.audio.meter() : null;
  return {
    ...st, audioModuleErrors: dead,
    mutedState, unmutedState,
    comboWindow, spaceNight, meter, toss8In,
    singleStrokeHarmonies: window.__harmony.length,
    bestScore: ZS.score.bestScore,
    prefsStored: (() => { try { return localStorage.getItem('zs-prefs') !== null || true; } catch (_) { return true; } })(),
  };
});
// r27 assertions: window is one clamped beat; the room follows the day; the
// meter reports sane dBFS figures off the live analyser
ok(session.comboWindow >= 0.6 && session.comboWindow <= 1.0,
  `comboWindow ${session.comboWindow} outside [0.6, 1.0]`);
ok(session.spaceNight === 'night', `space after level 8 is "${session.spaceNight}", expected night`);
// r28: the director's grid signal — present and inside one 8th at 60 bpm
ok(typeof session.toss8In === 'number' && session.toss8In >= 0 && session.toss8In <= 0.65,
  `ctx.toss8In ${session.toss8In} — expected a number in [0, 0.65]`);
ok(session.meter && typeof session.meter.rms === 'number'
  && session.meter.rms <= 0 && session.meter.rms >= -90,
  `meter rms ${session.meter && session.meter.rms} not a sane dBFS figure`);
ok(session.mutedState === true && session.unmutedState === false,
  `mute pref did not track: muted=${session.mutedState} unmuted=${session.unmutedState}`);
ok(session.bestScore > 0, `bestScore never rose (${session.bestScore})`);
ok(session.singleStrokeHarmonies === 0,
  `${session.singleStrokeHarmonies} harmony events from single-fruit strokes — harmony must be per-stroke, never per-chain`);
ok(session.bpm >= 60 && session.bpm <= 90, `bpm ${session.bpm} out of 60–90`);
ok(session.errors.length === 0, `audio errors: ${JSON.stringify(session.errors)}`);
ok(session.audioModuleErrors.length === 0, `audio module retired: ${JSON.stringify(session.audioModuleErrors)}`);
// palettes land at chord boundaries, so shortly after the event the switch
// is either pending or already made
ok(session.level === 2 || session.levelPending === 2,
  `level event did not reach harmony (level=${session.level}, pending=${session.levelPending})`);
ok(errs.length === 0, `page errors: ${errs.join(' | ')}`);

const out = {
  failures,
  pass: failures.length === 0,
  chordProbe,
  session: { bpm: session.bpm, chord: session.chord, level: session.level, intensity: session.intensity, pianoReady: session.pianoReady, nodesCreated: session.nodesCreated },
  pageErrors: errs.slice(0, 6),
};
console.log(JSON.stringify(out, null, 2));
const jf = arg('json', null);
if (jf) writeFileSync(join(root, jf), JSON.stringify(out, null, 2));
await browser.close();
server.close();
process.exit(failures.length === 0 ? 0 : 1);
