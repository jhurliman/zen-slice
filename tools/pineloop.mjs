/**
 * pineloop.mjs — the pineapple tuning loop (r47c). Boots the built bundle
 * ONCE in Chromium, then for every candidate in a JSON file sets the shell's
 * tunables through window.__zsPine (uniforms — no rebuild) and renders the
 * pineapple close to the camera, front or tilt view, to <out>/pine-<name>.png.
 * Pair it with tools/pngstats.py (hue/sat/value of the shell pixels) and the
 * reference photo: the reference shell measures hue 43° (p10 26°, p90 56°),
 * sat 0.67 — hue from this render path tracks the device within a degree or
 * two; saturation and value do not (SwiftShader, no tonemapping match), so
 * judge those by eye against a device capture.
 *
 *   node tools/pineloop.mjs --cands cands.json --out /tmp [--view front|tilt]
 *   cands.json: { "name": { "gold": [r,g,b], "eyeR": 0.4, ... }, ... }
 *   Unknown keys are reported; PINE_DEFAULTS in species.js lists them all.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import http from 'http';
import { resolveChrome } from './chromepath.mjs';
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const cands = JSON.parse(readFileSync(arg('cands'), 'utf8'));   // { name: {param: value, ...}, ... }
const out = arg('out', '/tmp');
const html = readFileSync('dist/index.html');
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(0, r)); const PORT = server.address().port;
const browser = await chromium.launch({ executablePath: resolveChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/?capture=1&nophys=1&nosound=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.ZS && !!window.__zsPine, null, { timeout: 60000 });
for (const [name, params] of Object.entries(cands)) {
  const png = await page.evaluate(async ({ params, view }) => {
    const ZS = window.ZS, T = window.__zsPine;
    for (const [k, v] of Object.entries(T.defaults)) T.set(k, v);
    for (const [k, v] of Object.entries(params)) if (!T.set(k, v)) console.error('unknown param', k);
    ZS.clear(); ZS.step(1 / 120, 2, false);
    const f = ZS.spawn('pineapple'); f.pos.set(0, 1.6, 2.4); f.vel.set(0, 0, 0);
    const ax = { front: [0.30, 0.15, 0], tilt: [0.55, 0.8, 0] }[view];
    f.quat.setFromEuler(new f.mesh.rotation.constructor(ax[0], ax[1], ax[2]));
    ZS.step(1 / 120, 3, true);
    return ZS.grab();
  }, { params, view: arg('view', 'front') });
  writeFileSync(`${out}/pine-${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  console.log('rendered', name);
}
await browser.close(); server.close();
