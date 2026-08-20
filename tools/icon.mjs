/**
 * icon.mjs — rasterize the vector app-icon master into the iOS asset catalog.
 *
 * Source of truth: art/icon/icon.svg (1024x1024 design space).
 * Output: ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 *   — the single 1024x1024 universal icon the catalog's Contents.json names.
 *   Apple requires it opaque with square corners (the OS applies the mask),
 *   so alpha is stripped even though the SVG already paints a full background.
 *
 * Usage: node tools/icon.mjs
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'art/icon/icon.svg');
const out = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');

const { default: sharp } = await import('sharp');
await sharp(src)
  .resize(1024, 1024)
  .flatten({ background: '#0b0908' })
  .removeAlpha()
  .png()
  .toFile(out);
const m = await sharp(out).metadata();
console.log(`wrote ${out} — ${m.width}x${m.height}, hasAlpha: ${m.hasAlpha}`);
