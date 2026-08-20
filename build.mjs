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
  minify: process.env.DEV !== '1',
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
<meta name="theme-color" content="#000000">
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
