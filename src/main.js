/**
 * main.js — wiring harness only. Owns the renderer, the clock, the quality
 * governor and the slow-motion time dilation. It knows nothing about fruit,
 * juice or scoring.
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
 * ── Module fault tolerance ──────────────────────────────────────────────────
 * Modules are converted to TSL one at a time by different agents. A module
 * whose init() throws is recorded in `ZS.moduleErrors` and then skipped for the
 * rest of the session instead of taking the whole build down; the same applies
 * to fixed/frame/quality/resize. One agent mid-conversion can no longer blank
 * the round for everyone else. Note that a raw ShaderMaterial does NOT throw —
 * three logs `Material "ShaderMaterial" is not compatible` and substitutes an
 * empty NodeMaterial — so a silently flat-shaded object is the symptom of a
 * not-yet-converted material, and it will not appear in moduleErrors.
 */

import * as THREE from 'three';
import { Bus, SIM_DT, MAX_SUBSTEPS, TIER, STAGE, clamp, damp, Clock, nowSec } from './core/contract.js';
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
  return { capture, forceWebGL: gl || (capture && !gpu), explicitGL: gl, explicitGPU: gpu };
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
  ctx.stage = stage;
  ctx.score = score;

  /** @type {{module:string,phase:string,error:string}[]} */
  const moduleErrors = [];

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

  // ── slow motion ────────────────────────────────────────────────────────────
  let slowUntil = 0, slowTarget = 1;
  bus.on('slowmo', (e) => {
    const now = nowSec();
    slowUntil = Math.max(slowUntil, now + e.seconds);
    slowTarget = Math.min(slowTarget === 1 ? 9 : slowTarget, e.scale);
  });

  // ── resize ─────────────────────────────────────────────────────────────────
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, ctx.quality.dpr);
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
  let emaMs = 8, sinceChange = 0, framesOver = 0, framesUnder = 0;
  function applyTier(t) {
    ctx.quality = { ...PROFILES[t] };
    for (const m of modules) safe(m, 'quality', ctx.quality);
    resize();
    bus.emit('quality', { profile: ctx.quality });
  }
  function governor(ms, dt) {
    emaMs += (ms - emaMs) * 0.05;
    sinceChange += dt;
    const budget = 1000 / 60 * 0.92;   // never dip under 60
    if (emaMs > budget) { framesOver++; framesUnder = 0; } else { framesUnder++; framesOver = 0; }
    if (sinceChange > 1.5 && framesOver > 45 && ctx.quality.tier > TIER.LOW) {
      applyTier(ctx.quality.tier - 1); sinceChange = 0; framesOver = 0; emaMs = budget * 0.8;
    } else if (sinceChange > 6 && framesUnder > 500 && emaMs < 1000 / 120 * 0.7 && ctx.quality.tier < TIER.ULTRA) {
      applyTier(ctx.quality.tier + 1); sinceChange = 0; framesUnder = 0;
    }
  }

  // ── loop ───────────────────────────────────────────────────────────────────
  let last = performance.now(), acc = 0, running = true;
  const stats = { fps: 0, ms: 0, tier: ctx.quality.tier, fruit: 0, frames: 0 };
  let fpsAcc = 0, fpsN = 0;
  let virtualNow = performance.now() / 1000;   // harness-controlled clock
  let useVirtual = false;

  /** One complete tick. `dt` in seconds. Shared by the rAF loop and the harness. */
  function tick(dt, wallStart, doRender = true) {
    // rAF timestamps and performance.now() can disagree on the first frame (and
    // a backgrounded tab can hand us a huge or negative delta). A negative dt
    // silently poisons the accumulator forever, so clamp hard.
    if (!(dt > 0)) dt = SIM_DT;
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
    if (prof) {
      prof.frames++;
      prof.frameMs.push(ms);
      // A CUT is the event he is describing — "every swipe is full framerate" —
      // so cut frames are recorded separately. Averaging them into the
      // steady-state is how a spike disappears into a good-looking mean.
      if (ctx.__zsCutThisFrame) { prof.cutFrames.push(ms); ctx.__zsCutThisFrame = false; }
    }
    if (!useVirtual) governor(ms, dt); else emaMs += (ms - emaMs) * 0.05;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    stats.ms = emaMs; stats.tier = ctx.quality.tier;
    stats.fruit = director.live?.length ?? 0; stats.frames++;
    stats.acc = acc; stats.steps = steps; stats.simdt = SIM_DT;
  }

  let firstFrame = true;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = firstFrame ? SIM_DT : (now - last) / 1000;
    firstFrame = false;
    last = now;
    tick(dt, performance.now());
  }
  requestAnimationFrame(frame);

  // ── automation surface for the screenshot/perf harness ────────────────────
  // EVERY member below is part of the harness contract. Do not rename or drop
  // one without changing tools/shoot.mjs in the same commit.
  const ZS = {
    ctx, stats, bus, director, score, audio,
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
    setTier: applyTier,
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
  window.ZS = ZS;
  return ZS;
}
