/**
 * flourishrec.mjs — LISTEN to a reward moment. Boots the built bundle in
 * Chromium, jumps to a level, stages five fruit in a row (the ?debug strip's
 * combo trigger, verbatim), sweeps them, and records 2.6 s of the
 * post-ceiling mix through ZS.audio.record() — the exact signal the DAC gets.
 * Writes a WAV and prints level, voice, steal and spectral figures, so an
 * audio round can be A/B'd by ear AND by number before it ships.
 *
 *   node tools/flourishrec.mjs --dist dist --out /tmp/flourish.wav [--level 4] [--tier 3]
 *
 * r46: written to chase "the flourish goes up up up and chirps" — the numbers
 * that mattered were the spectral centroid (register), steals (the chirps),
 * and the post-ceiling peak against the tanh knee at −6 dBFS.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import http from 'http';
import { resolveChrome } from './chromepath.mjs';
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const html = readFileSync(arg('dist') + '/index.html');
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => server.listen(0, r)); const PORT = server.address().port;
const browser = await chromium.launch({ executablePath: resolveChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/?capture=1&nophys=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS, null, { timeout: 55000 });
await page.mouse.move(215, 460); await page.mouse.down(); await page.mouse.up();
await page.evaluate(() => window.ZS.audio.unlock());
await page.waitForFunction(() => window.ZS.audio.state().actxState === 'running', null, { timeout: 5000 });
await page.waitForFunction(() => window.ZS.audio.state().pianoReady, null, { timeout: 30000 });
const level = +arg('level', 4); const qtier = +arg('tier', 3);
const res = await page.evaluate(async ({ level, qtier }) => {
  const ZS = window.ZS; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ZS.clear();
  if (qtier !== 3) ZS.audio.quality({ tier: qtier });
  ZS.director.jumpLevel(level);
  for (let i = 0; i < 160 && ZS.audio.state().level !== level; i++) { ZS.step(1 / 120, 6, false); await sleep(100); }
  ZS.step(1 / 120, 12, false); await sleep(200);
  const kinds = ['orange', 'apple', 'kiwi', 'strawberry', 'pineapple'];
  const span = 0.75 * 4; const staged = [];
  for (let i = 0; i < 5; i++) { const f = ZS.spawn(kinds[i]); f.pos.set(-span / 2 + i * 0.75, 0.3, 0); f.vel.set(0, 1.0, 0); staged.push(f); }
  ZS.step(1 / 120, 6, true); await sleep(60);
  const liveAfterSpawn = ZS.director.live.length; const tier = ZS.ctx.quality.tier; const maxFruit = ZS.ctx.quality.maxFruit;
  let slices = 0; ZS.bus.on('slice', () => slices++);
  const harm = []; ZS.bus.on('harmony', (h) => harm.push({ size: h.size }));
  const s0 = ZS.audio.state(); const steals0 = s0.steals;
  const recP = ZS.audio.record(2.6);
  await sleep(80);
  const alive = staged.filter((f) => f && !f.dead); let y = 0; for (const f of alive) y += f.pos.clone().project(ZS.ctx.camera).y; y /= alive.length;
  ZS.newStroke(); ZS.swipe(-0.85, y, 0.85, y, 12, 6.0);
  ZS.step(1 / 120, 8, false);
  let peakVoices = 0, flushed = false;
  for (let i = 0; i < 40; i++) { ZS.step(1 / 120, 1, false); const s = ZS.audio.state(); peakVoices = Math.max(peakVoices, s.voicesActive); if (s.pending === 0) flushed = true; await sleep(10); }
  for (let i = 0; i < 25; i++) { const s = ZS.audio.state(); peakVoices = Math.max(peakVoices, s.voicesActive); await sleep(40); }
  const pcm = await recP;
  const s1 = ZS.audio.state();
  return { slices, liveAfterSpawn, tier, maxFruit, pcm: Array.from(pcm), harm, flushed, peakVoices, steals: s1.steals - steals0, level: s1.level, chord: s1.chord, errors: s1.errors, vd: s1.voiceDebug };
}, { level, qtier });
const sr = await page.evaluate(() => window.ZS.audio.state().baseLatency !== undefined ? (window.AudioContext ? 48000 : 48000) : 48000);
await browser.close(); server.close();
const x = Float32Array.from(res.pcm); const SR = 48000;
// stats
let peak = 0, over = 0, sumsq = 0; for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; if (a > 0.5) over++; sumsq += v * v; }
const db = (a) => (20 * Math.log10(Math.max(1e-9, a))).toFixed(1);
// spectral: radix-2 FFT, 4096 hop 2048, hann; centroid + high-band ratio over frames with energy
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr; } } } }
const N = 4096; const cents = [], highs = []; let framesLoud = 0;
for (let off = 0; off + N <= x.length; off += 2048) {
  const re = new Float64Array(N), im = new Float64Array(N); let e = 0;
  for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); re[i] = x[off + i] * w; e += re[i] * re[i]; }
  if (e / N < 1e-6) continue; framesLoud++;
  fft(re, im); let num = 0, den = 0, hi = 0;
  for (let k = 1; k < N / 2; k++) { const m = re[k] * re[k] + im[k] * im[k]; const f = k * SR / N; num += f * m; den += m; if (f > 2000) hi += m; }
  cents.push(num / den); highs.push(hi / den);
}
cents.sort((a, b) => a - b); highs.sort((a, b) => a - b);
const med = (a) => a.length ? a[a.length >> 1] : 0, p90 = (a) => a.length ? a[Math.floor(a.length * 0.9)] : 0;
console.log(JSON.stringify({ tier: qtier, slices: res.slices, live: res.liveAfterSpawn, tier: res.tier, maxFruit: res.maxFruit, level: res.level, chord: res.chord, harmony: res.harm, flushed: res.flushed, peakVoices: res.peakVoices, steals: res.steals, errors: res.errors?.length,
  peak_dBFS: db(peak), rms_dBFS: db(Math.sqrt(sumsq / x.length)), samples_in_shoulder: over, centroid_median_Hz: Math.round(med(cents)), centroid_p90_Hz: Math.round(p90(cents)), above2k_median: +med(highs).toFixed(2), above2k_p90: +p90(highs).toFixed(2), frames: framesLoud }));
// wav
const buf = Buffer.alloc(44 + x.length * 2); const w = (o, s) => buf.write(s, o); buf.writeUInt32LE; w(0, 'RIFF'); buf.writeUInt32LE(36 + x.length * 2, 4); w(8, 'WAVE'); w(12, 'fmt '); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); w(36, 'data'); buf.writeUInt32LE(x.length * 2, 40);
for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
writeFileSync(arg('out'), buf);
