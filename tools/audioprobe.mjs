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
const { MOTIFS, BASSES } = await import(join(root, 'src/audio/conductor.js'));
const SPECIES = ['watermelon', 'pineapple', 'orange', 'apple', 'kiwi', 'strawberry'];
const E2 = -17;
{
  const h = createHarmony();
  let chordsChecked = 0;
  for (let level = 0; level <= 5; level++) {
    h.setLevel(level); h.advance();            // palette lands on the advance
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
await page.goto(`http://localhost:${PORT}/?capture=1`, { waitUntil: 'domcontentloaded' });
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
  const line = [['orange', -2.2], ['apple', 0], ['kiwi', 2.2]];
  for (const [id, x] of line) {
    const f = ZS.spawn(id);
    f.pos.set(x, 0.2, 0); f.vel.set(0, 0.5, 0);
  }
  await new Promise((r) => setTimeout(r, 60)); // let a frame land the spawns
  let slices = 0;
  const off = ctx.bus.on('slice', () => slices++);
  ZS.newStroke();
  ZS.swipe(-0.9, 0.03, 0.9, 0.03, 14, 6.0);
  const atSwipe = ZS.audio.state();
  off();
  return { slices, pendingAtSwipe: atSwipe.pending };
});
// the flush runs in audio's frame hook, and under software GL the game's rAF
// loop ticks at ~1 fps (each render is ~1 s in SwiftShader — see simbeats.mjs)
// — so wait on the state, never on wall time
const flushed = await page
  .waitForFunction(() => window.ZS.audio.state().pending === 0, null, { polling: 100, timeout: 20000 })
  .then(() => true).catch(() => false);
const afterFlush = await page.evaluate(() => window.ZS.audio.state());
chordProbe.pendingAfter = flushed ? 0 : afterFlush.pending;
chordProbe.voices = afterFlush.voicesActive;
chordProbe.chord = afterFlush.chord;
ok(chordProbe.slices >= 2, `combo swipe only cut ${chordProbe.slices} fruit`);
ok(chordProbe.pendingAtSwipe === chordProbe.slices,
  `slices=${chordProbe.slices} but pending=${chordProbe.pendingAtSwipe} — not gathered as one chord`);
ok(chordProbe.pendingAfter === 0, `gather never flushed (pending=${chordProbe.pendingAfter})`);
ok(chordProbe.voices >= chordProbe.slices, `chord flushed but only ${chordProbe.voices} voices active`);

// ── a scripted session: rhythmic slicing, tempo bounds, zero errors ──
const session = await page.evaluate(async () => {
  const ZS = window.ZS;
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
  const st = ZS.audio.state();
  const dead = ZS.moduleErrors.filter((m) => m.module === 'audio');
  return { ...st, audioModuleErrors: dead };
});
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
