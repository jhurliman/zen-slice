/**
 * appstore.mjs — compose App Store screenshots from raw device captures.
 *
 * Input:  art/appstore/raw/<file> per art/appstore/shots.json (display order,
 *         headline + sub caption each). Raw captures may be any resolution;
 *         they are contain-fit into a rounded frame.
 * Output: art/appstore/out/<size>/NN-<slug>.png for each required App Store
 *         Connect slot. Only the 6.9" and 6.5" iPhone sets are needed — ASC
 *         auto-scales them for every smaller display slot (6.3/6.1/5.5/4.7/4/3.5).
 *
 * Design language matches the app icon (art/icon/icon.svg): dark warm stage
 * background, juice-gold #ffc61a accent, palette from src/fruit/species.js.
 *
 * Usage: node tools/appstore.mjs
 * Exit non-zero if any manifest entry is missing its raw file.
 */
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rawDir = join(root, 'art/appstore/raw');
const outDir = join(root, 'art/appstore/out');
mkdirSync(outDir, { recursive: true });

// One entry per ASC slot worth filling. If an iPad set is ever needed:
// { dir: 'ipad-13', W: 2064, H: 2752 }, same layout.
const SIZES = [
  { dir: 'iphone-6.9', W: 1320, H: 2868 },
  { dir: 'iphone-6.5', W: 1284, H: 2778 },
];

const { default: sharp } = await import('sharp');
const manifest = JSON.parse(readFileSync(join(root, 'art/appstore/shots.json'), 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let failed = 0;
for (const { dir, W, H } of SIZES) {
  mkdirSync(join(outDir, dir), { recursive: true });
  // layout constants were tuned at 1284 wide; scale everything with the canvas
  const K = W / 1284;
  const IMG_W = Math.round(1128 * K), IMG_X = (W - IMG_W) / 2, IMG_Y = Math.round(460 * K);
  const IMG_H_MAX = H - IMG_Y - Math.round(96 * K);
  const RADIUS = Math.round(64 * K);

  for (let i = 0; i < manifest.shots.length; i++) {
    const { file, headline, sub } = manifest.shots[i];
    const src = join(rawDir, file);
    if (!existsSync(src)) {
      console.error(`MISSING raw capture: art/appstore/raw/${file}`);
      failed++;
      continue;
    }

    // contain-fit the capture into the frame box
    const meta = await sharp(src).metadata();
    const s = Math.min(IMG_W / meta.width, IMG_H_MAX / meta.height);
    const iw = Math.round(meta.width * s), ih = Math.round(meta.height * s);
    const ix = Math.round(IMG_X + (IMG_W - iw) / 2), iy = IMG_Y;

    // round the capture's corners with a dest-in mask
    const mask = Buffer.from(
      `<svg width="${iw}" height="${ih}"><rect width="${iw}" height="${ih}" rx="${RADIUS}" fill="#fff"/></svg>`);
    const shot = await sharp(src).resize(iw, ih)
      .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

    // canvas: stage gradient, caption, gold hairline around the frame
    const canvas = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <radialGradient id="bg" cx="50%" cy="30%" r="95%">
          <stop offset="0%" stop-color="#2b2320"/>
          <stop offset="55%" stop-color="#171211"/>
          <stop offset="100%" stop-color="#0b0908"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <text x="${W / 2}" y="${Math.round(240 * K)}" text-anchor="middle" fill="#f4ede2"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="${Math.round(92 * K)}" font-weight="600" letter-spacing="1">${esc(headline)}</text>
      <text x="${W / 2}" y="${Math.round(352 * K)}" text-anchor="middle" fill="#ffc61a"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="${Math.round(52 * K)}" font-weight="300" letter-spacing="2">${esc(sub)}</text>
      <rect x="${ix - 3}" y="${iy - 3}" width="${iw + 6}" height="${ih + 6}" rx="${RADIUS + 3}"
        fill="none" stroke="#ffc61a" stroke-opacity="0.55" stroke-width="3"/>
      <rect x="${ix - 10}" y="${iy - 10}" width="${iw + 20}" height="${ih + 20}" rx="${RADIUS + 10}"
        fill="none" stroke="#ffc61a" stroke-opacity="0.12" stroke-width="10"/>
    </svg>`);

    const out = join(outDir, dir, `${String(i + 1).padStart(2, '0')}-${slug(headline)}.png`);
    await sharp(canvas).composite([{ input: shot, left: ix, top: iy }])
      .flatten({ background: '#0b0908' }).removeAlpha().png().toFile(out);
    const m = await sharp(out).metadata();
    console.log(`${out.replace(root + '/', '')}  ${m.width}x${m.height}`);
  }
}
process.exit(failed ? 1 : 0);
