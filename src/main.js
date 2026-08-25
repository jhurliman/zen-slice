/**
 * main.js — wiring harness only. Owns the renderer, the clock, the slow-motion
 * time dilation, and the APPLY half of quality: what a tier means, what a
 * render scale means, and who needs telling. The DECIDE half moved to
 * core/governor.js in r40 so that it could be tested (tools/govprobe.mjs).
 * It knows nothing about fruit, juice or scoring.
 *
 * ── Renderer: WebGPURenderer + TSL ──────────────────────────────────────────
 * `build.mjs` points the bare specifier 'three' at `three/webgpu`, so every
 * module in the bundle is on the node renderer. Three things about that are
 * load-bearing and easy to get wrong:
 *
 *  1. `await renderer.init()` is MANDATORY. If you skip it, three lazily
 *     initialises on the first render() call and returns a promise you are not
 *     awaiting; the frame silently never lands and you get a permanently black
 *     canvas with NO exception anywhere. Every symptom of a broken build looks
 *     identical to this one, so it is the first thing to check.
 *     Because of it, boot() is async and the HTML bootstrap awaits it.
 *
 *  2. `?gl=1` forces the WebGL2 backend (`forceWebGL`). WebGPU output cannot be
 *     screenshotted in the CI container at all — the compositor hands back a
 *     blank surface and mapAsync never resolves — so all visual verification
 *     runs on WebGL2. TSL compiles to both WGSL and GLSL from one source, which
 *     is the entire reason that fallback is a faithful preview and not a
 *     different renderer.
 *     `?capture=1` (what the screenshot harness always passes) therefore also
 *     defaults to WebGL2. Pass `?capture=1&gpu=1` to override that and actually
 *     exercise the WebGPU path.
 *
 *  3. Under `capture`, the WebGL2 context is created HERE, by hand, with
 *     `preserveDrawingBuffer: true`, and handed to the backend as
 *     `parameters.context`. three's own attributes hard-code it to false, and
 *     without it `canvas.toDataURL()` from a later task returns a blank image —
 *     ZS.grab() would silently produce black PNGs.
 *
 * ── Module fault tolerance ──────────────────────────────────────────────────────
 * Modules are converted to TSL one at a time by different agents. A module
 * whose init() throws is recorded in `ZS.moduleErrors` and then skipped for the
 * rest of the session instead of taking the whole build down; the same applies
 * to fixed/frame/quality/resize. ⚠ r38f: TOLERATED IS NOT INVISIBLE. This
 * exact mechanism shipped a dead input module to the device twice (blade
 * init() ReferenceError; every bus-driven probe green). The ledger is now
 * WATCHED: hud.js paints a red fault badge in dev builds (ctx.moduleErrors),
 * window 'error'/'unhandledrejection' funnel in the throws safe() can't see
 * (DOM handlers, timers), tools/pointerprobe.mjs asserts the ledger empty
 * through REAL PointerEvents and gates `npm run ios`, and audioprobe's
 * session asserts it empty for all modules.
 * One agent mid-conversion can no longer blank
 * the round for everyone else. Note that a raw ShaderMaterial does NOT throw —
 * three logs `Material "ShaderMaterial" is not compatible` and substitutes an
 * empty NodeMaterial — so a silently flat-shaded object is the symptom of a
 * not-yet-converted material, and it will not appear in moduleErrors.
 */

import * as THREE from 'three';
import { Bus, SIM_DT, MAX_SUBSTEPS, TIER, STAGE, clamp, damp, Clock, nowSec } from './core/contract.js';
import { createGovernor, scaleFloorFor, GFX_MODES } from './core/governor.js';
import { loadPrefs } from './core/prefs.js';
import { installTextureViewCompat, watchDeviceLost, backendName } from './render/compat.js';
import { createStage } from './render/stage.js';
import { createBlade } from './input/blade.js';
import { createSlicer } from './slice/slicer.js';
import { createFluid } from './juice/fluid.js';
import { createDirector } from './play/director.js';
import { createScore } from './play/score.js';
import { createHud } from './ui/hud.js';
import { createHaptics } from './input/haptics.js';
import { createAudio } from './audio/audio.js';
import { initNative } from './core/native.js';
import { initTuner } from './ui/tuner.js';

const PROFILES = {
  // fruitSegments is PolyhedronGeometry `detail`: triangles = 20*(detail+1)^2
  [TIER.ULTRA]: { tier: TIER.ULTRA, dpr: 2.0, maxFruit: 6, bloom: true, fruitSegments: 11, sheetSegments: 96 },
  [TIER.HIGH]: { tier: TIER.HIGH, dpr: 2.0, maxFruit: 5, bloom: true, fruitSegments: 8, sheetSegments: 72 },
  [TIER.MED]: { tier: TIER.MED, dpr: 1.5, maxFruit: 5, bloom: true, fruitSegments: 6, sheetSegments: 48 },
  [TIER.LOW]: { tier: TIER.LOW, dpr: 1.0, maxFruit: 4, bloom: false, fruitSegments: 4, sheetSegments: 32 },
};

function pickInitialTier() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mem = navigator.deviceMemory || (iOS ? 6 : 8);
  const cores = navigator.hardwareConcurrency || 4;
  if (!iOS && cores >= 8 && mem >= 8) return TIER.ULTRA;
  if (cores >= 6) return TIER.HIGH;
  if (cores >= 4) return TIER.MED;
  return TIER.LOW;
}

/** URL switches, resolved once. See the header for why capture implies WebGL2. */
function readFlags() {
  const s = (typeof location !== 'undefined' ? location.search : '') || '';
  const q = new URLSearchParams(s);
  const on = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const capture = on('capture');
  const gl = on('gl');
  const gpu = on('gpu');
  return { capture, forceWebGL: gl || (capture && !gpu), explicitGL: gl, explicitGPU: gpu, tune: on('tune') };
}

/**
 * Boot the game. ASYNC — the caller must await it.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<object>} the ZS automation surface (also set on window.ZS)
 */
export async function boot(canvas) {
  const flags = readFlags();

  const params = {
    canvas,
    antialias: false,
    alpha: true,          // three's own WebGL attributes force alpha:true; match
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    forceWebGL: flags.forceWebGL,
  };

  // preserveDrawingBuffer is not among the attributes three sets, and ZS.grab()
  // runs in a different task from the render that produced the frame. Own the
  // context so the harness can read it back.
  if (flags.forceWebGL && flags.capture) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: true, depth: true, stencil: false,
      preserveDrawingBuffer: true, powerPreference: 'high-performance',
      premultipliedAlpha: true, failIfMajorPerformanceCaveat: false,
    });
    if (gl) params.context = gl;
  }

  // ══ r42: THE SHEET WAS NEVER DRAWN ON WEBGPU. NOT ONCE, ON ANY DEVICE. ═════
  // The juice sheet's geometry is `position` plus NINE instanced attributes
  // (fOrg fTan fNrm fDir fInh fA fB fC fTint — fluid.js makeSheet), which is
  // ten vertex buffers. WebGPU's DEFAULT `maxVertexBuffers` is 8, three asks
  // for default limits, and so the sheet's pipeline fails to create:
  //   "Vertex buffer count (10) exceeds the maximum number of vertex buffers (8)"
  // three then flags the material errored and silently skips the draw. Asked
  // directly, Safari 26 on macOS — the same WebKit the iOS app runs — answers
  //   maxVertexBuffers: default-device 8, adapter 12
  //   10-buffer pipeline: NO — vertexBuffer count(10) exceeds limit(8)
  // so this failed on the iPad exactly as it fails in Chrome. Nothing caught
  // it because every visual probe runs `?capture=1`, which forces the WebGL2
  // backend, where no such limit exists — the one path the sheet DOES draw on
  // is the one path no player ever sees.
  //
  // The adapter will grant 12; only the requested DEVICE was capped at 8. So
  // ask for 10 — but ask CONDITIONALLY. requestDevice REJECTS outright if the
  // adapter cannot meet a required limit, and a rejected device is
  // `renderer.init()` throwing, which this file's header calls the failure
  // mode that looks like every other failure mode: a permanently black canvas.
  // An adapter that cannot do 10 therefore gets exactly today's behaviour.
  if (!flags.forceWebGL && navigator.gpu?.requestAdapter) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter && adapter.limits?.maxVertexBuffers >= 10) params.requiredLimits = { maxVertexBuffers: 10 };
    } catch (_) { /* no adapter probe, no raised limit, no change */ }
  }

  const renderer = new THREE.WebGPURenderer(params);
  // MANDATORY. See header note 1.
  await renderer.init();

  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
  camera.position.set(0, 0.6, 22);
  camera.lookAt(0, 0.6, 0);

  const bus = new Bus();
  const ctx = {
    renderer, scene, camera, bus,
    quality: { ...PROFILES[pickInitialTier()] },
    timeScale: 1, time: 0, aspect: 1, fruits: null, score: null,
  };

  const stage = createStage();
  const blade = createBlade();
  const slicer = createSlicer();
  const fluid = createFluid();
  const director = createDirector();
  const score = createScore();
  const hud = createHud();
  const haptics = createHaptics();
  const audio = createAudio();

  const modules = [stage, director, fluid, blade, slicer, score, hud, haptics, audio];
  const names = ['stage', 'director', 'fluid', 'blade', 'slicer', 'score', 'hud', 'haptics', 'audio'];
  for (let i = 0; i < modules.length; i++) modules[i].__zsName = names[i];
  // Capacitor shell bootstrap (r26): no-op outside the native app
  ctx.native = initNative();
  // ?tune (r27): the dev-only voicing panel — constructed ONLY behind the
  // flag, and a failure here must never take the game down (it is a tuning
  // tool, not a module). Statically imported: a dynamic import() would ask
  // the single-file esbuild bundle to split.
  if (flags.tune) {
    try { initTuner(audio); } catch (_) { /* tuning tool only */ }
  }
  ctx.stage = stage;
  ctx.score = score;

  /** @type {{module:string,phase:string,error:string}[]} */
  const moduleErrors = [];
  // r38f: THE FAULT LEDGER IS PUBLISHED, NOT JUST EXPOSED. safe() was doing
  // its job (record + console.error) but nothing LOOKED: the phone has no
  // console, most probes only checked their own module's errors, and a build
  // with a dead input module sailed to the device twice. Three consumers now
  // watch this array: the HUD fault badge (dev builds — hud.js reads
  // ctx.moduleErrors), tools/pointerprobe.mjs (asserts it empty through the
  // REAL pointer path), and audioprobe's session (asserts it empty for ALL
  // modules, not just audio/haptics). Errors that never pass through safe()
  // — DOM event handlers, timers, promise rejections — are funneled in below
  // via the window listeners, tagged module 'window' and NOT marked dead:
  // there is no module object to retire, but the fault must not be invisible.
  const windowFault = (kind) => (ev) => {
    if (moduleErrors.length >= 40) return;
    const e = ev.error || ev.reason || ev.message || ev;
    moduleErrors.push({ module: 'window', phase: kind, error: String(e && e.stack ? e.stack : e).slice(0, 400) });
  };
  window.addEventListener('error', windowFault('error'));
  window.addEventListener('unhandledrejection', windowFault('rejection'));
  // assigned HERE, after the const — putting `moduleErrors` in the ctx
  // literal above would be this file's documented TDZ bug all over again
  ctx.moduleErrors = moduleErrors;

  // ── WebGPU-only compatibility shims ────────────────────────────────────────
  // Both must be installed BEFORE the first render (module init() renders: the
  // stage's PMREM pass runs there). three calls createView() while building
  // every render pass descriptor, and one unhandled throw there is a
  // permanently black screen with no exception surfaced anywhere.
  let swizzleCompat = 'n/a';
  let stopDeviceWatch = () => {};
  {
    const be = renderer.backend;
    if (be?.isWebGPUBackend && be.device) {
      swizzleCompat = installTextureViewCompat(be.device);
      stopDeviceWatch = watchDeviceLost(be.device, (info) => {
        moduleErrors.push({ module: 'renderer', phase: 'device', error: `device lost: ${info.reason} ${info.message}` });
        running = false;
      });
    }
  }

  /**
   * Run one module hook. On the first throw the module is retired for the rest
   * of the session — a hook that throws once throws every frame, and a console
   * full of the same stack hides the next real problem.
   */
  // ══ r19: PER-MODULE, PER-PHASE ATTRIBUTION, OPT-IN ══════════════════════
  // He reports "we lag or skip frames here and there" — which is TAIL latency,
  // not a mean, and the existing cpu probe reports one aggregate number for
  // `step()`. An aggregate cannot tell you WHICH of nine modules spent the
  // 12 ms, and "here and there" means the answer is in the p99 and the max, not
  // the median. `performance.now()` per call is ~40 ns and this is off unless
  // `ZS.profile(true)` turns it on, so the shipping path is unchanged.
  let prof = null;
  function profReset() {
    prof = { frames: 0, t0: 0, mod: Object.create(null), frameMs: [], cutFrames: [] };
  }
  // ⚠ `let`, declared HERE. It was previously assigned two lines above its own
  // `let` further down — a temporal dead zone violation that threw
  // "Cannot access 'K' before initialization" at boot, i.e. a blank canvas. The
  // build was clean; esbuild does not evaluate. Only running it finds this.
  let api_profile = (on) => { if (on) profReset(); else prof = null; return prof; };

  /** Percentiles are computed here rather than in the harness so every caller
   *  gets the same definition. p99 and max are the point of this instrument:
   *  "we skip frames here and there" is a statement about the tail. */
  function __profSnapshot() {
    if (!prof) return null;
    const pct = (a, q) => {
      if (!a.length) return 0;
      const b = Float64Array.from(a).sort();
      return +b[Math.min(b.length - 1, Math.floor(b.length * q))].toFixed(3);
    };
    const mods = {};
    for (const k in prof.mod) {
      const e = prof.mod[k];
      mods[k] = { calls: e.n, meanMs: +(e.sum / e.n).toFixed(4), totalMs: +e.sum.toFixed(1),
                  p50: pct(e.s, 0.5), p95: pct(e.s, 0.95), p99: pct(e.s, 0.99),
                  max: +e.max.toFixed(3) };
    }
    const rank = Object.entries(mods).sort((a, b) => b[1].totalMs - a[1].totalMs);
    return {
      frames: prof.frames,
      frame: { p50: pct(prof.frameMs, 0.5), p95: pct(prof.frameMs, 0.95),
               p99: pct(prof.frameMs, 0.99), max: +Math.max(0, ...prof.frameMs).toFixed(3) },
      cutFrames: { n: prof.cutFrames.length, p50: pct(prof.cutFrames, 0.5),
                   p95: pct(prof.cutFrames, 0.95), max: +Math.max(0, ...prof.cutFrames, 0).toFixed(3) },
      byTotal: rank.map(([k, v]) => ({ module: k, ...v })),
    };
  }
  function profFail(m, phase, e) {
    m.__zsDead = true;
    const rec = { module: m.__zsName, phase, error: String(e && e.stack ? e.stack : e).slice(0, 400) };
    moduleErrors.push(rec);
    console.error(`[zs] module "${rec.module}" disabled: ${phase}() threw`, e);
  }

  function safe(m, phase, a, b, c) {
    const fn = m[phase];
    if (fn === undefined || m.__zsDead) return;
    if (prof) {
      const t = performance.now();
      try { fn.call(m, a, b, c); } catch (e) { profFail(m, phase, e); return; }
      const d = performance.now() - t;
      const key = m.__zsName + '.' + phase;
      const e = prof.mod[key] || (prof.mod[key] = { n: 0, sum: 0, max: 0, s: [] });
      e.n++; e.sum += d; if (d > e.max) e.max = d;
      if (e.s.length < 40000) e.s.push(d);
      return;
    }
    try {
      fn.call(m, a, b, c);
    } catch (e) {
      m.__zsDead = true;
      const rec = { module: m.__zsName, phase, error: String(e && e.stack ? e.stack : e).slice(0, 400) };
      moduleErrors.push(rec);
      console.error(`[zs] module "${rec.module}" disabled: ${phase}() threw`, e);
    }
  }

  for (const m of modules) safe(m, 'init', ctx);
  for (const m of modules) safe(m, 'quality', ctx.quality);

  // r37: compile every fruit pipeline while the title screen holds the sky.
  // Materials exist from director.init's cache warm, but a pipeline compiles
  // on first DRAW — so a level introducing a species dropped frames on its
  // first toss, and the first cut of each species compiled the cap pipeline
  // mid-swipe. Fire-and-forget; skipped under ?capture (probes drive the sim
  // dark and pay their own compile cost when they actually draw).
  if (!flags.capture) Promise.resolve().then(() => director.prewarmPipelines?.());

  // ── slow motion ────────────────────────────────────────────────────────────
  let slowUntil = 0, slowTarget = 1;
  bus.on('slowmo', (e) => {
    const now = nowSec();
    slowUntil = Math.max(slowUntil, now + e.seconds);
    slowTarget = Math.min(slowTarget === 1 ? 9 : slowTarget, e.scale);
  });

  // ── r39: GOVERNED RENDER SCALE ─────────────────────────────────────────────
  // The tier table's `dpr` is a CAP — `min(devicePixelRatio, tier.dpr)` — so
  // it can only trim high-DPR phones. On a devicePixelRatio-1 desktop monitor
  // every tier resolves to NATIVE resolution and the governor has no pixel
  // lever at all: it can shed bloom and fruit segments while the per-pixel
  // fluid sim — the dominant cost — stays untouchable. (Found via the itch.io
  // embed: a fixed-size iframe reports ITS dimensions as innerWidth/Height,
  // and the game obediently rendered ~2× the visible pixels.) `renderScale`
  // is the missing lever: a continuous multiplier on the tier-capped dpr,
  // governed in the frame loop below. At 1 (the default and the ceiling) the
  // pipeline is byte-identical to pre-r39 — a fast GPU that never misses
  // budget renders native, 8K included; the only ceiling anyone gets is
  // their own hardware's measured ability to hold frame rate.
  let renderScale = 1;

  // ── resize ─────────────────────────────────────────────────────────────────
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, ctx.quality.dpr) * renderScale;
    ctx.aspect = w / h;
    camera.aspect = ctx.aspect;
    // fit the stage box regardless of orientation
    const vfov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distV = STAGE.halfExtent / Math.tan(vfov);
    const distH = STAGE.halfExtent / (Math.tan(vfov) * ctx.aspect);
    camera.position.z = Math.max(distV, distH);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    for (const m of modules) safe(m, 'resize', w, h, dpr);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  resize();

  // ── quality governor ───────────────────────────────────────────────────────
  // r40: the decision logic lives in core/governor.js so that it can be tested
  // (tools/govprobe.mjs drives whole sessions through it in pure node). It
  // shipped in r39 with four defects that between them turned a ProMotion
  // iPhone holding an honest 60 fps into tier LOW at 11% of native pixels
  // within 12 seconds, with no path back — read that file's header for the
  // full account. main.js keeps only the APPLY half: what a tier means, what
  // a scale means, and who needs telling.
  let emaMs = 8;
  function applyTier(t) {
    ctx.quality = { ...PROFILES[t] };
    for (const m of modules) safe(m, 'quality', ctx.quality);
    resize();
    bus.emit('quality', { profile: ctx.quality });
    // ── r42: A TIER FLIP USED TO UNDO THE WARMUP, MID-PLAY ────────────────────
    // stage.quality() rebuilds the post graph whenever the DOF tap count or the
    // bloom flag changes — which is every tier step — and a rebuild sets
    // `pipeline.needsUpdate`, so EVERY material in the scene re-links on the
    // next draw. That re-link runs on the draw path, where three passes
    // `promises = null` and the backend therefore calls the SYNCHRONOUS
    // `device.createRenderPipeline()`. One frame pays for the whole scene.
    // compileAsync takes the identical work down the `createRenderPipelineAsync`
    // branch instead, off the main thread, before anyone draws. The governor's
    // first decision lands at WARMUP_S = 8 s — inside the ten seconds the
    // player was complaining about — so this is not a hypothetical path.
    // Fire-and-forget: a compile failure must never take a tier change down.
    if (!flags.capture && renderer.compileAsync) {
      Promise.resolve().then(() => renderer.compileAsync(scene, camera)).catch(() => {});
    }
  }
  const gov = createGovernor({
    tier: ctx.quality.tier,
    minTier: TIER.LOW,
    maxTier: TIER.ULTRA,
    // Re-read per frame: the floor is expressed in effective dpr and so moves
    // with the tier's dpr cap. See scaleFloorFor().
    scaleFloor: () => scaleFloorFor(window.devicePixelRatio || 1, ctx.quality.dpr),
    // r43b: what renderScale 1 is WORTH at this tier, so the thermal ratchet
    // can remember its ceiling in effective dpr instead of as a bare
    // multiplier that means different pixel counts at different tiers.
    effBase: () => Math.min(window.devicePixelRatio || 1, ctx.quality.dpr),
    onTier: applyTier,
    // No 'quality' bus event — the tier profile did not change, only the
    // raster size, and resize() already tells every module.
    onScale: (s) => { renderScale = s; resize(); },
  });

  // ── graphics setting (auto / low / med / high / ultra) ──────────────────────
  // r40, asked for directly: "expose the total graphics level as a setting we
  // can cycle through, for people that want to sacrifice some framerate for
  // gfx". `auto` is the governor. Anything else pins the tier AND the render
  // scale and switches the governor off entirely — a player who picked ultra
  // has said what they want, and a governor that quietly walks it back would
  // be the same disrespect this round is fixing.
  const GFX_TIER = { low: TIER.LOW, med: TIER.MED, high: TIER.HIGH, ultra: TIER.ULTRA };
  let gfxMode = 'auto';
  function applyGfx(mode) {
    gfxMode = GFX_MODES.includes(mode) ? mode : 'auto';
    if (gfxMode !== 'auto') applyTier(GFX_TIER[gfxMode]);
    gov.setMode(gfxMode, GFX_TIER[gfxMode]);
  }
  applyGfx(loadPrefs().gfx);
  bus.on('pref', (e) => { if (e.key === 'gfx') applyGfx(e.value); });

  // ── loop ───────────────────────────────────────────────────────────────────
  let last = performance.now(), acc = 0, running = true;
  const bootAt = performance.now();
  /** @type {{t:number,ms:number,warm:number,fruit:number,tier:number}[]} r42 */
  const stalls = [];
  const stats = { fps: 0, ms: 0, tier: ctx.quality.tier, fruit: 0, frames: 0 };
  let fpsAcc = 0, fpsN = 0;
  let virtualNow = performance.now() / 1000;   // harness-controlled clock
  let useVirtual = false;

  /** One complete tick. `dt` in seconds. Shared by the rAF loop and the harness. */
  function tick(dt, wallStart, doRender = true, syntheticDt = false) {
    // rAF timestamps and performance.now() can disagree on the first frame (and
    // a backgrounded tab can hand us a huge or negative delta). A negative dt
    // silently poisons the accumulator forever, so clamp hard.
    if (!(dt > 0)) { dt = SIM_DT; syntheticDt = true; }
    if (dt > 0.1) dt = 0.1;
    const nowS = nowSec();

    const target = nowS < slowUntil ? slowTarget : 1;
    if (nowS >= slowUntil) slowTarget = 1;
    ctx.timeScale = damp(ctx.timeScale, target, target < ctx.timeScale ? 42 : 6.5, dt);

    acc = Math.max(0, acc + dt * ctx.timeScale);
    let steps = 0;
    while (acc >= SIM_DT && steps < MAX_SUBSTEPS) {
      for (let i = 0; i < modules.length; i++) safe(modules[i], 'fixed', SIM_DT, ctx);
      ctx.time += SIM_DT;
      acc -= SIM_DT; steps++;
    }
    if (steps === MAX_SUBSTEPS) acc = 0;

    const alpha = acc / SIM_DT;
    for (let i = 0; i < modules.length; i++) safe(modules[i], 'frame', dt, alpha, ctx);
    if (doRender) safe(stage, 'render');

    const ms = performance.now() - wallStart;
    // ── r42: THE STALL LEDGER ─────────────────────────────────────────────────
    // "several long frame stalls in the first 10 seconds" is a report nothing
    // in this build could answer: ZS.profile() has to be armed in advance and
    // is off on the shipping path, so the one session that matters — a cold
    // boot on the player's own device — was never recorded. This costs one
    // comparison per frame, always on, and keeps the first 48 frames that blew
    // four vsyncs at 120 Hz. Virtual-clock frames are excluded: `ms` there is
    // wall time for a step the harness asked for, not a hitch anyone saw.
    if (!useVirtual && ms > 33 && stalls.length < 48) {
      stalls.push({
        t: +((performance.now() - bootAt) / 1000).toFixed(2), ms: +ms.toFixed(1),
        warm: ctx.prewarmed === false ? 0 : 1, fruit: director.live?.length ?? 0,
        tier: ctx.quality.tier,
      });
    }
    if (prof) {
      prof.frames++;
      prof.frameMs.push(ms);
      // A CUT is the event he is describing — "every swipe is full framerate" —
      // so cut frames are recorded separately. Averaging them into the
      // steady-state is how a spike disappears into a good-looking mean.
      if (ctx.__zsCutThisFrame) { prof.cutFrames.push(ms); ctx.__zsCutThisFrame = false; }
    }
    // Synthesized dt (first frame after boot/resume, a negative rAF delta) and
    // the harness's virtual clock never reach the governor: SIM_DT is not a
    // vsync interval and the panel-rate learner would believe it.
    emaMs += (ms - emaMs) * 0.05;
    if (!useVirtual && !syntheticDt) gov.frame(ms, dt);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    stats.ms = emaMs; stats.tier = ctx.quality.tier; stats.scale = renderScale;
    stats.gfx = gfxMode;
    stats.fruit = director.live?.length ?? 0; stats.frames++;
    stats.acc = acc; stats.steps = steps; stats.simdt = SIM_DT;
  }

  let firstFrame = true;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const synth = firstFrame;
    const dt = synth ? SIM_DT : (now - last) / 1000;
    firstFrame = false;
    last = now;
    tick(dt, performance.now(), true, synth);
  }
  requestAnimationFrame(frame);

  // ── automation surface for the screenshot/perf harness ────────────────────
  // EVERY member below is part of the harness contract. Do not rename or drop
  // one without changing tools/shoot.mjs in the same commit.
  const ZS = {
    ctx, stats, bus, director, score, audio, haptics,
    // r36c: fluid joins the surface for its debugTap — the ballistics
    // measurements (%out-before-death, exit route, sink speed) need the
    // emitter's actual parameters, not pixels. See fluid.js `api.debugTap`.
    fluid,
    moduleErrors,
    // reported by the harness so a run can never silently be judging the wrong
    // backend (WebGL2 fallback frames are legitimate for critique, but we must
    // always know which one produced them)
    get backend() {
      const b = renderer.backend;
      const n = backendName(b);
      if (n !== 'unknown') return n;
      return renderer.isWebGLRenderer ? 'webgl2' : 'unknown';
    },
    swizzleCompat,
    /** r19: opt-in per-module profiler. ZS.profile(true) to arm, ZS.profileRead()
     *  for the report, ZS.profile(false) to disarm. Off costs nothing. */
    profile: (on) => { api_profile(on); },
    /** Snapshot WITHOUT resetting — reading a profiler must never disturb it. */
    profileRead: () => __profSnapshot(),
    /** r42: every frame since boot that cost more than 33 ms (four vsyncs at
     *  120 Hz), capped at 48, plus what the warmup was doing at the time.
     *  `ZS.warm()` is its companion: the per-phase cost of the warm start. */
    stalls: () => stalls.slice(),
    warm: () => ({ done: ctx.prewarmed, phases: ctx.warmLog || [] }),
    setTier: applyTier,
    /** r39: manual render-scale override for testing, same spirit as setTier —
     *  applies immediately, and the governor may adjust it afterwards. */
    setScale: (s) => { renderScale = Math.min(1, Math.max(0.25, s)); resize(); },
    /** r40: the graphics setting, same values as the panel button.
     *  ZS.setGfx('ultra') pins; ZS.setGfx('auto') hands it back. */
    setGfx: applyGfx,
    /** governor triage (the ?debug strip): live tier, ratchet ceilings,
     *  frame-cost EMA, render scale, and (r39b) delivered fps + panel rate.
     *  r40: `mode` is the graphics setting — anything but `auto` means every
     *  other number here is frozen by choice, which is the first thing to
     *  check before debugging a governor that "isn't doing anything". */
    gov: () => {
      const s = gov.snapshot();
      return {
        mode: s.mode, tier: ctx.quality.tier, ceil: s.tierCeil, ms: +emaMs.toFixed(2),
        scale: +renderScale.toFixed(2), sceil: +Math.min(1, s.scaleCeil).toFixed(2),
        fps: Math.round(1 / Math.max(s.emaDt, 1e-4)), hz: Math.round(1 / s.vsyncS),
        eff: +(Math.min(window.devicePixelRatio || 1, ctx.quality.dpr) * renderScale).toFixed(2),
      };
    },
    /** Probe hook: fluid's per-frame GPU kernel off/on (see fluid.setCompute).
     *  Fast-forward harnesses dispatch it per step — minutes of wall under a
     *  software rasterizer. Gameplay sim is identical without it. */
    setFluidCompute: (on) => fluid.setCompute?.(on),
    /** r40: juice flight/wind tuning — ZS.juice() reads, ZS.juice({…}) writes. */
    juice: (o) => fluid.tune?.(o),
    pause: () => { running = false; },
    resume: () => { running = true; useVirtual = false; Clock.virtual = false; firstFrame = true; requestAnimationFrame(frame); },
    /** Deterministic single-step. Detaches from wall clock entirely so that a
     *  software-GL harness produces the exact same frames a 120Hz phone would. */
    step(dt = 1 / 120, n = 1, doRender = true) {
      running = false; useVirtual = true; Clock.virtual = true;
      for (let i = 0; i < n; i++) {
        virtualNow += dt; Clock.t = virtualNow;
        tick(dt, performance.now(), doRender);
      }
    },
    /** Advance `seconds` of virtual time at 120Hz, rendering ONLY the last
     *  frame. Under software GL a render costs ~1s, so simulating dark and
     *  drawing once is the difference between a 6-second harness and a
     *  10-minute one. The simulation path is identical either way. */
    advance(seconds, hz = 120) {
      const n = Math.max(1, Math.round(seconds * hz));
      if (n > 1) this.step(1 / hz, n - 1, false);
      this.step(1 / hz, 1, true);
    },
    /** Simulate with no rendering at all — used for the CPU-cost probe. */
    simulate(seconds, hz = 120) { this.step(1 / hz, Math.max(1, Math.round(seconds * hz)), false); },
    grab() { return canvas.toDataURL('image/png'); },
    /** Corner luminance / blown-pixel measurement of the last drawn frame.
     *  The round-1 grade regression was caught by exactly these two numbers. */
    probe() { return stage.probe ? stage.probe() : null; },
    /** synthetic swipe in NDC, used by the critic harness */
    swipe(ax, ay, bx, by, steps = 8, speed = 4.0) {
      const t = performance.now() / 1000;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        bus.emit('swipe', {
          a: new THREE.Vector2(ax + (bx - ax) * t0, ay + (by - ay) * t0),
          b: new THREE.Vector2(ax + (bx - ax) * t1, ay + (by - ay) * t1),
          speedNdc: speed, t,
        });
      }
    },
    newStroke() { canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 1, clientY: 1, bubbles: true })); },
    spawn: (id) => director.spawnAt(id),
    clear: () => director.reset(),
    dispose() {
      running = false;
      stopDeviceWatch();
      for (const m of modules) safe(m, 'dispose');
    },
    THREE,
  };
  // r42: the phone has no console anyone can reach mid-play, so a dev build
  // says its cold-boot numbers out loud once, at 12 s — late enough that the
  // warmup, the audio unlock and the governor's first decision (WARMUP_S = 8)
  // have all happened. Capacitor forwards console.log to the native log, so
  // `xcrun devicectl device process launch --console` captures a real cold
  // boot on real hardware without a probe or a cable-side harness.
  // `APPSTORE=1 node build.mjs` compiles this out with the rest of the debug UI.
  if (__ZS_DEBUG_UI__) {
    // Written repeatedly, earliest first: a launch made by `devicectl` with the
    // iPad idle is SUSPENDED within a few seconds — rAF stops, timers stop —
    // so a single 12 s dump captured nothing off a real device. The 2.5 s shot
    // lands while the app is certainly alive and already has the whole warm
    // log; the later ones overwrite it with governor state if the app survives.
    const dump = () => {
      try {
        const diag = JSON.stringify({
          at: +((performance.now() - bootAt) / 1000).toFixed(1),
          warm: ZS.warm(), stalls,
          gov: (() => { try { return ZS.gov(); } catch (_) { return null; } })(),
          backend: ZS.backend, frames: stats.frames, fps: Math.round(stats.fps),
        });
        console.log('[zs] diag ' + diag);
        // …and to localStorage, because the native app's console is not
        // reachable over the wireless tunnel (devicectl's --console channel
        // fails where install/launch succeed) while its container IS:
        //   devicectl device copy from … LocalStorage/localstorage.sqlite3
        // is the only path off the device that needs nothing installed.
        localStorage.setItem('zsDiag', diag);
      } catch (_) { /* diagnostics only */ }
    };
    setTimeout(dump, 2500);
    setTimeout(dump, 12000);
    setTimeout(dump, 30000);
  }

  window.ZS = ZS;
  return ZS;
}
