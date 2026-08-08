/**
 * progress.mjs — regenerate the live progress page from rounds/*.json.
 *
 * Each round record looks like:
 * {
 *   round: 1, at: "2026-08-06T12:00:00Z", note: "…",
 *   perf: { desktop: {...}, iphone: {...} },
 *   pieces: [ { key, name, score, verdict, biggestGap, fix, status } ],
 *   shots: ["shots/r1/01-….png", …],
 *   heroShot: "shots/r1/04-….png"
 * }
 *
 * Output: dist/progress.html — self-contained, thumbnails inlined as WebP.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const roundsDir = join(root, 'rounds');
mkdirSync(join(root, 'dist'), { recursive: true });

const rounds = existsSync(roundsDir)
  ? readdirSync(roundsDir).filter((f) => f.endsWith('.json')).sort()
      .map((f) => JSON.parse(readFileSync(join(roundsDir, f), 'utf8')))
  : [];

const cache = new Map();
async function thumb(rel, width = 440) {
  if (!rel) return null;
  const key = rel + ':' + width;
  if (cache.has(key)) return cache.get(key);
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  const buf = await sharp(abs).resize({ width, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
  const url = 'data:image/webp;base64,' + buf.toString('base64');
  cache.set(key, url);
  return url;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── build per-piece score history ───────────────────────────────────────────
const pieceOrder = [];
const history = new Map();
for (const r of rounds) {
  for (const p of r.pieces || []) {
    if (!history.has(p.key)) { history.set(p.key, []); pieceOrder.push({ key: p.key, name: p.name }); }
    history.get(p.key).push({ round: r.round, score: p.score, verdict: p.verdict });
  }
}

const latest = rounds[rounds.length - 1];
const refThumb = await thumb('reference/plate-01.png', 900);

let cards = '';
for (const r of [...rounds].reverse()) {
  const shots = [];
  for (const s of (r.shots || []).slice(0, 8)) {
    const t = await thumb(s, 400);
    if (t) shots.push(`<figure><img src="${t}" alt=""><figcaption>${esc(s.split('/').pop().replace('.png', ''))}</figcaption></figure>`);
  }
  const pieces = (r.pieces || []).map((p) => {
    const cls = p.score >= 90 ? 'good' : p.score >= 70 ? 'mid' : 'low';
    return `<tr>
      <td class="pname">${esc(p.name)}</td>
      <td><span class="score ${cls}">${p.score ?? '—'}</span></td>
      <td><span class="verdict v-${esc(p.verdict)}">${esc(p.verdict)}</span></td>
      <td class="gap">${esc(p.biggestGap)}</td>
      <td class="fix">${esc(p.fix)}</td>
    </tr>`;
  }).join('');
  const perf = Object.entries(r.perf || {}).map(([k, v]) =>
    `<span class="chip"><b>${esc(k)}</b> ${v.peakDrawCalls} calls · ${(v.peakTriangles / 1000).toFixed(0)}k tris · ${v.cpuMsPerFrame ?? '?'} ms js</span>`).join('');
  cards += `
  <section class="round">
    <header><h2>Round ${r.round}</h2><time>${esc(r.at)}</time></header>
    ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
    <div class="chips">${perf}</div>
    <div class="strip">${shots.join('')}</div>
    <table><thead><tr><th>Piece</th><th>Score</th><th>Blind verdict</th><th>Biggest remaining gap</th><th>Next fix</th></tr></thead><tbody>${pieces}</tbody></table>
  </section>`;
}

// sparkline per piece
const spark = pieceOrder.map(({ key, name }) => {
  const h = history.get(key);
  const pts = h.map((d, i) => `${(i / Math.max(1, h.length - 1)) * 100},${100 - (d.score || 0)}`).join(' ');
  const last = h[h.length - 1];
  const cls = last.score >= 90 ? 'good' : last.score >= 70 ? 'mid' : 'low';
  return `<div class="sp">
    <div class="sp-h"><span>${esc(name)}</span><b class="${cls}">${last.score}</b></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts}"/></svg>
  </div>`;
}).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Zen Slice — build progress</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#07080c;--panel:#0e1017;--line:#1c2030;--ink:#e8ecf4;--dim:#7f8aa3;--good:#4ade80;--mid:#fbbf24;--low:#f87171;--accent:#8ab4ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,-apple-system,"SF Pro Text",system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:26px;font-weight:600;letter-spacing:-.02em;margin:0 0 4px}
.sub{color:var(--dim);margin:0 0 26px}
.bar{display:grid;grid-template-columns:1fr;gap:18px;margin-bottom:30px}
@media(min-width:820px){.bar{grid-template-columns:1.15fr .85fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.card h3{margin:0 0 10px;font-size:13px;letter-spacing:.10em;text-transform:uppercase;color:var(--dim);font-weight:600}
.card img{width:100%;border-radius:9px;display:block}
.sparks{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.sp{background:#0a0c12;border:1px solid var(--line);border-radius:9px;padding:8px 9px}
.sp-h{display:flex;justify-content:space-between;font-size:12px;color:var(--dim)}
.sp-h b{font-size:14px}
.sp svg{width:100%;height:34px;margin-top:4px}
.sp polyline{fill:none;stroke:var(--accent);stroke-width:3;vector-effect:non-scaling-stroke}
.good{color:var(--good)}.mid{color:var(--mid)}.low{color:var(--low)}
.round{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:20px}
.round header{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:12px}
.round h2{margin:0;font-size:19px}
.round time{color:var(--dim);font-size:12px}
.note{color:#b9c2d6;margin:0 0 12px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.chip{background:#111726;border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-size:12px;color:var(--dim)}
.chip b{color:var(--ink);font-weight:600}
.strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px;margin-bottom:16px}
.strip figure{margin:0}
.strip img{width:100%;border-radius:7px;display:block;background:#000}
.strip figcaption{font-size:10.5px;color:var(--dim);margin-top:4px;text-align:center}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--dim);font-weight:600;font-size:11px;letter-spacing:.07em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:8px;border-bottom:1px solid #14171f;vertical-align:top}
.pname{font-weight:600;white-space:nowrap}
.score{font-weight:700;font-variant-numeric:tabular-nums}
.verdict{font-size:11px;padding:2px 7px;border-radius:999px;background:#141a28;border:1px solid var(--line);white-space:nowrap}
.v-reference{color:var(--low)}.v-render{color:var(--low)}.v-coin-flip{color:var(--good)}
.gap{color:#cdd6e6}.fix{color:var(--dim)}
footer{color:var(--dim);font-size:12px;margin-top:30px}
</style></head><body><div class="wrap">
<h1>Zen Slice — build progress</h1>
<p class="sub">Builder → harsh-critic loop. ${rounds.length} round${rounds.length === 1 ? '' : 's'} so far${latest ? ` · latest ${esc(latest.at)}` : ''}.</p>
<div class="bar">
  <div class="card"><h3>The bar (user reference plate)</h3>${refThumb ? `<img src="${refThumb}" alt="reference">` : ''}</div>
  <div class="card"><h3>Piece scores over rounds</h3><div class="sparks">${spark || '<p class="sub">no rounds yet</p>'}</div></div>
</div>
${cards || '<p class="sub">No rounds recorded yet.</p>'}
<footer>Regenerated by <code>tools/progress.mjs</code>. Scores are blind-comparison scores against <code>REFERENCE_BAR.md</code>: 100 = indistinguishable from the reference.</footer>
</div></body></html>`;

writeFileSync(join(root, 'dist/progress.html'), html);
console.log('dist/progress.html', (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
