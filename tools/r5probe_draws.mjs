/**
 * r5 check (c): where the draw calls are.
 * Rebuilds the harness's own complexity load, then walks the scene graph and
 * buckets visible drawables so the 131-against-120 overrun is attributable.
 */
import { chromium } from 'playwright';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import http from 'http';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'dist/index.html'));
const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); });
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 90000 });
await p.waitForFunction(() => window.ZS && window.ZS.ready, null, { timeout: 90000 });

const out = await p.evaluate(() => {
  const ZS = window.ZS;
  const peak = { calls: 0, tris: 0 };
  for (let i = 0; i < 60; i++) {
    if (i % 10 === 0) { const f = ZS.spawn('watermelon'); f.pos.set((Math.random() - 0.5) * 8, -7, 0); f.vel.set(0, 12, 0); }
    if (i % 8 === 3) { ZS.newStroke(); ZS.swipe(-0.9, Math.random() - 0.5, 0.9, Math.random() - 0.5, 10, 6.0); }
    const render = i % 20 === 19;
    ZS.step(1 / 120, 1, render);
    if (render) { const inf = ZS.ctx.renderer.info.render; peak.calls = Math.max(peak.calls, inf.calls); peak.tris = Math.max(peak.tris, inf.triangles); }
  }
  const buckets = {};
  const tris = {};
  ZS.ctx.scene.traverse((o) => {
    if (!o.visible || !o.geometry) return;
    let vis = true; let q = o.parent;
    while (q) { if (!q.visible) { vis = false; break; } q = q.parent; }
    if (!vis) return;
    const n = o.name || o.type + (o.isInstancedMesh ? '(instanced)' : '');
    buckets[n] = (buckets[n] || 0) + 1;
    const g = o.geometry;
    const c = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    const inst = o.isInstancedMesh ? o.count : 1;
    tris[n] = (tris[n] || 0) + (c / 3) * inst;
  });
  return { peak, buckets, tris, live: ZS.director.live.length, dc: ZS.ctx.renderer.info.render.calls };
});

console.log('peak', out.peak, 'liveBodies', out.live);
const rows = Object.entries(out.buckets).sort((a, c) => c[1] - a[1]);
let sum = 0;
for (const [k, v] of rows) { sum += v; console.log(String(v).padStart(4), k, ' tris', Math.round(out.tris[k])); }
console.log('scene drawables total', sum, '-> renderer.info.calls', out.dc, '(difference = post chain / shadow / clears)');
await b.close(); server.close();
