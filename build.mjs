/**
 * build.mjs — single self-contained dist/index.html.
 *
 * ── The three.js entry-point swap ────────────────────────────────────────────
 * The whole bundle must run on the NODE renderer (`WebGPURenderer` + TSL), so a
 * bare `import * as THREE from 'three'` has to resolve to `three/webgpu`
 * (build/three.webgpu.js) rather than build/three.module.js. That build is a
 * superset of the classic core: everything the game already used (Vector3,
 * Scene, PerspectiveCamera, MeshPhysicalMaterial, PMREMGenerator, ...) plus the
 * node materials, the node PostProcessing/RenderPipeline stack and TSL.
 *
 * Why a plugin instead of esbuild's `alias`: `alias` does PREFIX substitution,
 * so `{ three: 'three/webgpu' }` would silently rewrite `three/tsl` into
 * `three/webgpu/tsl` and `three/addons/*` into `three/webgpu/addons/*`, neither
 * of which exists. An onResolve filter of /^three$/ is an EXACT match, which
 * leaves the subpath entries alone:
 *
 *   'three'          -> node_modules/three/build/three.webgpu.js   (this plugin)
 *   'three/tsl'      -> node_modules/three/build/three.tsl.js      (exports map)
 *   'three/addons/*' -> node_modules/three/examples/jsm/*          (exports map)
 *
 * three.tsl.js itself does `import { TSL } from 'three/webgpu'`, which resolves
 * through the exports map to the very same file this plugin points at, so there
 * is exactly ONE copy of three in the bundle and `instanceof` keeps working.
 *
 * Anything that still imports 'three/examples/jsm/postprocessing/*' (the
 * EffectComposer stack) will now resolve its own `from 'three'` to the webgpu
 * build and fail loudly — that is intentional. EffectComposer, ShaderMaterial,
 * RawShaderMaterial and onBeforeCompile are all unsupported on this renderer.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
mkdirSync(join(root, 'dist'), { recursive: true });

const THREE_WEBGPU = require.resolve('three/webgpu');
const THREE_TSL = require.resolve('three/tsl');

// ── the DEMO build (what GitHub Pages publishes) ─────────────────────────
// DEMO=1 gates the web build to the first three levels of the day arc; the
// page-turn to level 3 becomes the full-game veil (director.js + hud.js).
// The App Store build never sets it, so esbuild compiles the gate out
// entirely — the shipped app is provably ungated. A plain `node build.mjs`
// also produces the ungated game: that is intended (see README §License).
// APPSTORE_URL lights up the veil's CTA link; APPSTORE_ID additionally turns
// on Safari's Smart App Banner. Both stay empty until the app is live.
const DEMO = process.env.DEMO === '1';
const APPSTORE_URL = process.env.APPSTORE_URL || '';
const APPSTORE_ID = process.env.APPSTORE_ID || '';

/** Exact-match redirect of the bare specifier only. */
const threeWebGPUPlugin = {
  name: 'three-webgpu',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: THREE_WEBGPU }));
    // Belt and braces: pin the two subpaths we care about to the exact files the
    // exports map would give us, so a stray resolver condition can never split
    // the bundle across two copies of three.
    b.onResolve({ filter: /^three\/webgpu$/ }, () => ({ path: THREE_WEBGPU }));
    b.onResolve({ filter: /^three\/tsl$/ }, () => ({ path: THREE_TSL }));
  },
};

const res = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  globalName: 'ZenSlice',
  // WebGPURenderer needs top-level `await` support in the toolchain; safari16 is
  // fine for the syntax we emit because boot() is a plain async function.
  target: ['safari16', 'chrome110'],
  // Debug UI availability (hud.js): the ?debug strip and its settings toggle.
  // App Store builds run `APPSTORE=1 node build.mjs`, which compiles the flag
  // to false — the toggle never renders and the strip can never be enabled,
  // so no debug chrome can ship to review.
  minify: process.env.DEV !== '1',
  // ⚠ r42: THIS WAS TWO SEPARATE `define` KEYS IN ONE OBJECT LITERAL, and the
  // second silently overwrote the first — a duplicate key is legal JS, so
  // esbuild only ever received `__ZS_DEMO__`/`__ZS_APPSTORE_URL__` and
  // `__ZS_DEBUG_UI__` was NEVER substituted in any build. It survived into the
  // bundle as a bare identifier, which means (a) every read of it threw a
  // ReferenceError rather than testing a boolean, and (b) `APPSTORE=1` was not
  // compiling the debug UI out — the one guarantee that flag exists to make.
  // Found because r42 added a read of it in main.js just above
  // `window.ZS = ZS`, which turned the silent failure into a blank canvas.
  define: {
    __ZS_DEBUG_UI__: process.env.APPSTORE === '1' ? 'false' : 'true',
    __ZS_DEMO__: DEMO ? 'true' : 'false',
    __ZS_APPSTORE_URL__: JSON.stringify(APPSTORE_URL),
  },
  sourcemap: false,
  write: false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [threeWebGPUPlugin],
});

const js = res.outputFiles[0].text;
const css = readFileSync(join(root, 'src/ui/style.css'), 'utf8');

// boot() is async now (`await renderer.init()` is mandatory — skipping it fails
// SILENTLY with a permanently blank canvas and no exception). The bootstrap must
// therefore await it, and must surface a failure somewhere a harness can read:
// window.ZS_BOOT_ERROR plus a console error plus a data attribute on <body>.
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Chord Cut</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#000000">${APPSTORE_ID ? `\n<meta name="apple-itunes-app" content="app-id=${APPSTORE_ID}">` : ''}
<style>${css}</style>
</head>
<body>
<canvas id="zs-canvas"></canvas>
<script>${js}</script>
<script>
(async function () {
  try {
    await ZenSlice.boot(document.getElementById('zs-canvas'));
  } catch (err) {
    window.ZS_BOOT_ERROR = String((err && err.stack) || err);
    document.body.setAttribute('data-zs-error', String(err));
    console.error('ZenSlice boot failed:', err);
  }
})();
</script>
</body>
</html>`;

writeFileSync(join(root, 'dist/index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`dist/index.html  ${kb} KB  (three -> ${THREE_WEBGPU.split('/node_modules/').pop()})`);
