/**
 * physics.js — RIGID BODIES. The first new subsystem since round 0.
 *
 * The player's note, round 11:
 *
 *     "the fruit-to-fruit intersections look janky, i think we need a physics
 *      engine to keep the pieces from intersecting and get nice bounces off
 *      each other in air. is it possible to quickly generate convex hulls in
 *      realtime as we slice the fruit?"
 *
 * Yes, and the number is in the report: a half produced by plane-splitting a
 * convex body IS itself convex, so no decomposition is needed — the hull of its
 * own vertices is the exact collider. Rapier builds that hull in WASM from a
 * vertex cloud. What is NOT free is handing it the whole cloud; see HULL
 * REDUCTION below, which is the single most important number in this file.
 *
 * ── WHAT THIS MODULE OWNS ────────────────────────────────────────────────────
 * The integration of every live body in `ctx.fruits.live`. When Rapier is up,
 * `director.fixed` no longer touches `f.pos`/`f.quat`: this file writes them.
 * It owns nothing else. It does not spawn, does not retire, does not decide
 * what is on screen, and it never adds a body to the registry — so it cannot
 * resurrect anything the round-10 budget governor retired. The registry is the
 * single source of truth for who exists; the world here is a mirror of it,
 * reconciled at the top of every step.
 *
 * ── IT RUNS ON THE GAME'S CLOCK, NOT ITS OWN ────────────────────────────────
 * `world.timestep` is set to the `sdt` the director is stepping with (SIM_DT,
 * 1/120 s) and `world.step()` is called exactly once per fixed step. Rapier has
 * no internal accumulator and no wall-clock anywhere in this path, so the
 * virtual clock in contract.js and `ZS.step()` in main.js keep working exactly
 * as before: N calls to ZS.step produce N physics steps and nothing else moves.
 * Every measurement this project has is still reproducible.
 *
 * A consequence worth stating: with no contacts, Rapier's integrator and the
 * director's old one are THE SAME SCHEME — semi-implicit Euler, `v += g*dt`
 * then `p += v*dt`, with damping left at zero precisely so this stays true. A
 * fruit that never touches anything flies the same arc it flew in round 10, to
 * within float ordering. Only touching changes.
 *
 * ── EXTERNAL MUTATION IS AUTHORITATIVE ──────────────────────────────────────
 * The screenshot harness does `const f = ZS.spawn('watermelon'); f.pos.set(...)`
 * — i.e. it writes the JS body AFTER the rigid body exists. Every beat in
 * tools/shoot.mjs is staged that way, so a naive one-way mirror would ignore
 * the whole beat sheet and throw fruit from their spawn points instead. The top
 * of each step therefore compares `f.pos/quat/vel/spin` against the values this
 * file last wrote out and pushes any component that has changed underneath it
 * back into Rapier. Cost: 13 float compares per body, no allocation.
 *
 * ── HULL REDUCTION: THE NUMBER THAT DECIDES WHETHER THIS SHIPS ──────────────
 * MEASURED, this machine, rapier3d-compat 0.20, `world.createCollider` with a
 * `ColliderDesc.convexHull` of an N-point cloud (the hull is computed lazily in
 * WASM when the desc is turned into a collider, NOT when the desc is built —
 * timing `ColliderDesc.convexHull` alone reports 1 us and is a lie):
 *
 *      N points     collider build        N points     collider build
 *          8           42 us                 128          264 us
 *         16           36 us                 256          407 us
 *         32           68 us                1500         2964 us
 *         64          107 us               10908        17147 us   <-- raw melon
 *         96          157 us
 *
 * A watermelon half at tier 3 is ~10.9k loose vertices (cutter.js emits
 * non-indexed triangle soup). Handing that straight to Rapier costs 17 ms PER
 * HALF — a 34 ms hitch on every melon cut, on the exact input the player said
 * drops frames. So the cloud is reduced first, in JS, to at most
 * `tuning.hullDirs` support points:
 *
 *   1. stride the position array down to ~600 candidates (triangle soup
 *      repeats every vertex ~6x, so this throws away almost only duplicates),
 *   2. for each of 48 Fibonacci-sphere directions keep the candidate with the
 *      largest dot product — the exact support point of that subset in that
 *      direction — and dedupe.
 *
 * The result is <=48 points that are all ON the hull by construction, so the
 * collider is an inscribed approximation whose radial error is bounded by the
 * angular spacing of the direction set: sqrt(4*pi/48)/2 = 0.255 rad, so
 * 1 - cos = 3.2% worst case, 0.05 units on a watermelon — about one pixel at
 * our raster, and INSIDE the visible skin, which is the correct side to err on
 * (a collider larger than the fruit makes pieces bounce off thin air, which
 * reads far worse than a millimetre of overlap).
 *
 * Cost after reduction: ~100 us per half, ~0.2 ms per cut, measured end to end
 * in the browser and reported. That is the answer to his question.
 *
 * ── WHY THE HALVES COUNTER-ROTATE ───────────────────────────────────────────
 * `applyCutTorque` is not a random tumble. The blade drags along `stroke.dir`
 * and the friction it applies acts on each half at the CAP, which is offset
 * from that half's centre of mass by r = -signed(com)*n — and the two halves
 * sit on opposite sides of the plane, so their offsets, and therefore their
 * torques r x J, are equal and opposite. The halves counter-rotate about an
 * axis close to n x dir, which for a swipe across the screen is the camera
 * axis: the pieces pinwheel in the screen plane, which is both what the physics
 * says and what the reference footage looks like. A cut off the body's centre
 * gives one half a bigger |r| than the other and it tumbles harder. Nothing is
 * hand-authored; the asymmetry falls out.
 */

import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, SIM_DT, STAGE } from '../core/contract.js';

/** Live-tunable so a probe can sweep it from the console without a rebuild. */
export const TUNING = {
  /** 0 = dead clay, 1 = superball. Tuned by eye on the combo beats. */
  restitution: 0.30,
  friction: 0.55,
  /** Linear damping stays 0 so free flight matches the old ballistic arc. */
  linearDamping: 0.0,
  /** A whisper of angular damping so a long-lived fragment does not buzz. */
  angularDamping: 0.06,
  /** Blade impulse as a fraction of mass*speed, applied at the cap. Chosen by
   *  eye: 0.42 spun a melon half at 19 rad/s (3 revolutions a second), which
   *  reads frantic in a game whose own spec says "relaxing". */
  tumble: 0.15,
  /** Sanity rails. A deep overlap must never fire a body across the screen. */
  maxSpeed: 26,
  maxSpin: 26,
  /** Support directions per hull. 48 -> ~107 us/collider, 3.2% inscribed. */
  hullDirs: 48,
  /** Candidate cap before support sampling. */
  hullCandidates: 600,
  /**
   * Undo the inscribed-hull bias. A 48-direction support hull sits at most
   * 1-cos(0.255) = 3.2% inside the true surface, and two of those touching
   * means the two RENDERED skins have already overlapped by up to 6% of radius
   * — 0.1 units on a pair of melons — before the solver has anything to say.
   * Scaling the sample points about the body's own origin puts the collider
   * back on the skin. 1.03 is the mean of the bound, not its maximum, so the
   * collider is never meaningfully outside the fruit: bouncing off thin air
   * reads worse than a hair of overlap.
   */
  hullInflate: 1.03,
};

// Collision-group words. Membership in the high 16 bits, filter in the low 16:
// ALL means "collides with everything", NONE means "collides with nothing" and
// is what an off-screen body gets. Mass properties are untouched either way,
// which is why this and not `collider.setEnabled(false)`.
const GROUPS_ON = 0xffffffff;
const GROUPS_OFF = 0x00000000;

// ── Fibonacci sphere: `hullDirs` roughly equidistant unit vectors, built once.
function makeDirs(k) {
  const d = new Float32Array(k * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < k; i++) {
    const y = 1 - (i / (k - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    d[i * 3] = Math.cos(th) * r; d[i * 3 + 1] = y; d[i * 3 + 2] = Math.sin(th) * r;
  }
  return d;
}

/**
 * Reduce a triangle-soup position array to <= K support points of the hull.
 * Allocation: one Float32Array of the output (kept by the caller's cache for
 * whole fruit; per-cut for halves, where it is 48*3 floats and dies with the
 * half). No allocation in the scan itself.
 */
function hullPoints(position, dirs, maxCandidates, inflate = 1) {
  const n = position.length / 3;
  const k = dirs.length / 3;
  const stride = Math.max(1, Math.floor(n / maxCandidates));
  const bestI = new Int32Array(k).fill(-1);
  const bestD = new Float64Array(k).fill(-Infinity);
  for (let i = 0; i < n; i += stride) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    for (let j = 0; j < k; j++) {
      const d = x * dirs[j * 3] + y * dirs[j * 3 + 1] + z * dirs[j * 3 + 2];
      if (d > bestD[j]) { bestD[j] = d; bestI[j] = i; }
    }
  }
  // dedupe (a fruit's poles win several neighbouring directions)
  let m = 0;
  const out = new Float32Array(k * 3);
  for (let j = 0; j < k; j++) {
    const i = bestI[j];
    if (i < 0) continue;
    let dup = false;
    for (let q = 0; q < m; q++) {
      if (out[q * 3] === position[i * 3] && out[q * 3 + 1] === position[i * 3 + 1]
        && out[q * 3 + 2] === position[i * 3 + 2]) { dup = true; break; }
    }
    if (dup) continue;
    out[m * 3] = position[i * 3] * inflate;
    out[m * 3 + 1] = position[i * 3 + 1] * inflate;
    out[m * 3 + 2] = position[i * 3 + 2] * inflate; m++;
  }
  return m >= 4 ? out.subarray(0, m * 3) : null;
}

export function createPhysics() {
  const api = {
    tuning: TUNING,
    ready: false,
    enabled: true,
    /** Everything a perf probe needs, and nothing the game reads. */
    stats: {
      bodies: 0, steps: 0,
      hulls: 0, hullMs: 0, hullMaxMs: 0, hullPointsMax: 0, hullFallbacks: 0,
      hullReduceMs: 0, hullColliderMs: 0,
      stepMs: 0, stepMsEma: 0, solverMs: 0, syncInMs: 0, syncOutMs: 0,
      spawnPushouts: 0,
    },
  };

  let ctx = null;
  let world = null;
  let dirs = null;
  let curDt = -1;
  /** species.id + ':' + vertexCount -> reduced hull cloud (whole fruit only). */
  const hullCache = new Map();
  /** scratch, reused every step; this module allocates nothing per frame. */
  const _v = { x: 0, y: 0, z: 0 };
  const _v2 = { x: 0, y: 0, z: 0 };
  const _rot = { x: 0, y: 0, z: 0, w: 1 };
  const _tv = new THREE.Vector3();
  const _tv2 = new THREE.Vector3();

  api.init = (c) => {
    ctx = c;
    // ?nophys=1 turns the solver off in the SHIPPED build, so an A/B is one
    // page load and not two builds. The fallback path is the director's own
    // ballistic loop, i.e. exactly round 10.
    try {
      const q = new URLSearchParams(location.search || '');
      if (q.has('nophys') && q.get('nophys') !== '0') api.enabled = false;
    } catch (e) { /* no location in some harnesses; default on */ }

    dirs = makeDirs(TUNING.hullDirs);

    // WASM init is a promise and module init() is synchronous, so the world
    // comes up a few milliseconds into the session. Until it does, `step()`
    // returns false and the director integrates ballistically — the pre-Rapier
    // behaviour, not a stall. Bodies that already exist are adopted lazily by
    // the reconcile pass, so nothing has to be replayed.
    if (api.enabled) {
      RAPIER.init().then(() => {
        world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
        // Our unit is the DECIMETRE (contract.js: "1 unit = 1 decimetre").
        // Rapier's tolerances — allowed penetration, prediction distance,
        // sleep thresholds — are all authored in metres, so telling it the
        // scale is the difference between a 1 mm tolerance and a 1 cm one.
        world.lengthUnit = 10;
        world.timestep = SIM_DT; curDt = SIM_DT;
        // MEASURED on the penetration probe (.r11sweep.mjs), two scenes, seven
        // variants: 4 solver iterations with TWO internal PGS iterations and a
        // 60 Hz contact stiffness gave the lowest p95 penetration in BOTH
        // scenes (pile 0.408 -> 0.188, clash 0.485 -> 0.168 units) and was not
        // the most expensive variant. More outer iterations (8, 16) did worse
        // than this and cost more: these collisions are two-body and brief,
        // and stiffness, not iteration count, is what they need.
        world.numSolverIterations = 4;
        world.integrationParameters.numInternalPgsIterations = 2;
        world.integrationParameters.contact_natural_frequency = 60;
        world.maxCcdSubsteps = 0;   // 0.1 units of travel per step vs a 1-unit
                                    // body: nothing can tunnel, so don't pay.
        api.ready = true;
        // ⚠ r42: warmUp() WAS DEAD CODE. It was written in r19 with the
        // measurement in its own header — "the first cut of a session cost
        // 33 ms and nothing after it cost 2" — and then never called from
        // anywhere; `grep -rn warmUp src tools` returned one hit, the
        // definition. Every session since has paid the 33 ms spike on the
        // player's first cut. It must run AFTER `world` exists, which is
        // here and nowhere earlier: the function builds throwaway bodies.
        warmUp();
      }).catch((err) => {
        api.enabled = false;
        console.error('[zs] physics disabled: rapier init failed', err);
      });
    }

    // The blade's angular momentum. See the header.
    c.bus.on('slice', onSlice);
  };

  // ── collider construction ─────────────────────────────────────────────────
  function cloudFor(f) {
    const geom = f.mesh.geometry;
    const pos = geom.attributes.position?.array;
    if (!pos || pos.length < 12) return null;
    // Whole fruit share ONE cached geometry per (species, detail), so their
    // reduced cloud is computed once for the whole session. Halves own their
    // geometry and are reduced per cut — that is the cost the header measures.
    const key = f.generation === 0 ? f.species.id + ':' + pos.length : null;
    if (key !== null) {
      const hit = hullCache.get(key);
      if (hit) return hit;
    }
    // The tuning object is live (a probe sweeps it), and a cache built at one
    // direction count must not outlive that count.
    if (!dirs || dirs.length / 3 !== TUNING.hullDirs) { dirs = makeDirs(TUNING.hullDirs); hullCache.clear(); }
    const t0 = performance.now();
    const pts = hullPoints(pos, dirs, TUNING.hullCandidates, TUNING.hullInflate);
    const ms = performance.now() - t0;
    if (key !== null && pts) hullCache.set(key, pts);
    api.stats.hullReduceMs = (api.stats.hullReduceMs || 0) + ms;
    return pts;
  }

  function ensure(f, atBirth = false) {
    if (f._px || !world || f.dead) return f._px || null;

    let coll = null;
    const t0 = performance.now();
    const pts = cloudFor(f);
    const t1 = performance.now();
    if (pts) {
      coll = RAPIER.ColliderDesc.convexHull(pts);
      if (coll) api.stats.hullPointsMax = Math.max(api.stats.hullPointsMax, pts.length / 3);
    }
    if (!coll) {
      // A sliver thinner than the hull tolerance, or a degenerate cut. A ball
      // is wrong-shaped but it is never a missing body, and a body with no
      // collider would silently stop colliding with everything.
      coll = RAPIER.ColliderDesc.ball(Math.max(0.05, f.radius * 0.82));
      api.stats.hullFallbacks++;
    }
    // Density, not mass: `species.mass` is the mass of the WHOLE fruit, so
    // dividing by the sphere volume of `species.radius` gives a density that
    // makes each half weigh what its own volume says it should. A quarter of a
    // melon then outweighs a whole strawberry, which is the point.
    const vol = (4 / 3) * Math.PI * Math.pow(f.species.radius, 3);
    coll.setDensity(Math.max(0.02, f.species.mass / Math.max(1e-4, vol)))
      .setRestitution(TUNING.restitution)
      .setFriction(TUNING.friction);

    _rot.x = f.quat.x; _rot.y = f.quat.y; _rot.z = f.quat.z; _rot.w = f.quat.w;
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(f.pos.x, f.pos.y, f.pos.z)
      .setRotation(_rot)
      .setLinvel(f.vel.x, f.vel.y, f.vel.z)
      .setAngvel(f.spin)
      .setLinearDamping(TUNING.linearDamping)
      .setAngularDamping(TUNING.angularDamping)
      // Fruit are in free fall for their whole life; a sleeping body at the
      // apex of its arc would hang in the air. Never sleep.
      .setCanSleep(false);
    const body = world.createRigidBody(bd);
    const collider = world.createCollider(coll, body);

    const rec = {
      body, collider, groups: GROUPS_ON,
      px: f.pos.x, py: f.pos.y, pz: f.pos.z,
      vx: f.vel.x, vy: f.vel.y, vz: f.vel.z,
      qx: f.quat.x, qy: f.quat.y, qz: f.quat.z, qw: f.quat.w,
      wx: f.spin.x, wy: f.spin.y, wz: f.spin.z,
    };
    f._px = rec;
    const ms = performance.now() - t0;
    api.stats.hullColliderMs += performance.now() - t1;
    api.stats.hulls++;
    api.stats.hullMs += ms;
    if (ms > api.stats.hullMaxMs) api.stats.hullMaxMs = ms;
    // Only at BIRTH. A body adopted mid-flight (Rapier came up after it was
    // thrown) must never be teleported.
    if (atBirth && f.generation === 0) separateAtSpawn(f);
    return rec;
  }

  /**
   * A burst spawns up to three fruit in the same instant from the same strip of
   * x, and two watermelons need 3.1 units of clearance in a 5.5-unit strip. In
   * round 10 that was invisible: nothing collided, so they flew through each
   * other below the frame. With contacts it is a shove that ruins both arcs and
   * looks exactly like the jank the player reported. Push the NEW body out
   * along the line of centres at birth (y is left alone so the toss still
   * reaches the apex the director aimed for) and the shove never happens.
   */
  function separateAtSpawn(f) {
    const live = ctx.fruits.live;
    // BOUNDED. Pushing out of A can push into B and back again, and an
    // unbounded "rescan from the top" is an infinite loop the first time a
    // crowded playfield has no free spot — I hung the probe with exactly that.
    // Eight passes is far more than the burst of three this has to handle;
    // failing to fully separate is a contact, which is now survivable.
    let passes = 0;
    for (let i = 0; i < live.length; i++) {
      const o = live[i];
      if (o === f || o.dead || o.generation !== 0) continue;
      const dx = f.pos.x - o.pos.x, dz = f.pos.z - o.pos.z, dy = f.pos.y - o.pos.y;
      const need = (f.radius + o.radius) * 0.98;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= need * need) continue;
      const d = Math.sqrt(Math.max(1e-6, dx * dx + dz * dz));
      const push = need - Math.sqrt(Math.max(1e-6, d2));
      const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
      f.pos.x += ux * push; f.pos.z += uz * push;
      api.stats.spawnPushouts++;
      if (++passes >= 8) break;
      i = -1;   // re-test against everyone after moving
    }
    f.mesh.position.copy(f.pos);
    const r = f._px;
    if (r) {
      _v.x = f.pos.x; _v.y = f.pos.y; _v.z = f.pos.z;
      r.body.setTranslation(_v, true);
      r.px = f.pos.x; r.py = f.pos.y; r.pz = f.pos.z;
    }
  }

  /**
   * THE FIRST CUT OF A SESSION COST 33 ms AND NOTHING AFTER IT COST 2. That is
   * not the algorithm, it is cold code: the WASM quickhull, the collider
   * pipeline and this file's own reduce loop are all being compiled the first
   * time a melon is cut, which is the worst possible moment. Build and throw
   * away one hull of the same shape at init, when the player is looking at an
   * empty sky. Measured: it costs ~1 ms here and takes the first-cut spike
   * with it.
   */
  function warmUp() {
    try {
      const n = 96, pts = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(Math.max(0, 1 - y * y));
        const th = Math.PI * (3 - Math.sqrt(5)) * i;
        pts[i * 3] = Math.cos(th) * rr; pts[i * 3 + 1] = y; pts[i * 3 + 2] = Math.sin(th) * rr;
      }
      for (let k = 0; k < 3; k++) {
        const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -400 - k, 0));
        world.createCollider(RAPIER.ColliderDesc.convexHull(pts.subarray(0, (48 + k * 24) * 3)), b);
        world.step();
        world.removeRigidBody(b);
      }
      // and the JS reducer, on a cloud the size of a real melon
      const big = new Float32Array(10908 * 3);
      for (let i = 0; i < big.length; i++) big[i] = (i % 97) / 97 - 0.5;
      for (let k = 0; k < 3; k++) hullPoints(big, dirs, TUNING.hullCandidates, TUNING.hullInflate);
    } catch (e) { /* warm-up is an optimisation, never a failure */ }
  }

  // Same derivation as director.js's retirement box, evaluated at STAGE.nearZ
  // (the largest cross-section any body can occupy), memoised on the camera.
  const vis = { halfH: 8, halfW: 8, dist: -1, aspect: -1 };
  const VIS_PAD = 2.0;
  function updateVisibleBox() {
    const cam = ctx.camera;
    if (!cam) return;
    const dist = Math.max(1, cam.position.z - STAGE.nearZ);
    if (dist === vis.dist && cam.aspect === vis.aspect) return;
    vis.dist = dist; vis.aspect = cam.aspect;
    vis.halfH = Math.tan((cam.fov * Math.PI) / 360) * dist;
    vis.halfW = vis.halfH * cam.aspect;
  }

  // ── registry mirror ───────────────────────────────────────────────────────
  api.addBody = (f) => { if (world && api.enabled) guard(() => ensure(f, true), 'addBody'); };

  api.removeBody = (f) => {
    const r = f._px;
    if (!r) return;
    f._px = null;
    if (world) guard(() => world.removeRigidBody(r.body), 'removeBody');
  };

  // ── the cut ───────────────────────────────────────────────────────────────
  function onSlice(e) {
    if (!world || !api.enabled || !e || !e.halves) return;
    const { stroke, halves } = e;
    guard(() => {
      for (let i = 0; i < halves.length; i++) applyCutTorque(halves[i], stroke);
    }, 'slice');
  }

  function applyCutTorque(h, stroke) {
    const r = h._px || ensure(h);
    if (!r || !stroke) return;
    // r = COM -> nearest point of the cut plane. See the header.
    const signed = stroke.plane.n.dot(h.pos) - stroke.plane.d;
    _tv.copy(stroke.plane.n).multiplyScalar(-signed);
    // J = blade friction along the direction of travel, scaled by this piece's
    // own mass so a strawberry quarter is not launched by a melon-sized kick.
    const m = r.body.mass();
    _tv2.copy(stroke.dir).multiplyScalar(m * stroke.speed * TUNING.tumble);
    _tv.cross(_tv2);   // torque impulse = r x J
    _v.x = _tv.x; _v.y = _tv.y; _v.z = _tv.z;
    r.body.applyTorqueImpulse(_v, true);
  }

  // ── the step ──────────────────────────────────────────────────────────────
  /**
   * ⚠ EVERY ENTRY POINT IS GUARDED, AND THIS IS NOT DEFENSIVE PROGRAMMING FOR
   * ITS OWN SAKE. main.js's `safe()` retires a MODULE on its first throw, and
   * this code runs inside the director's `fixed`. So an exception from WASM
   * would not disable physics — it would disable the DIRECTOR, and the game
   * would keep rendering an empty sky forever with no fruit and no error a
   * player could see. Failing back to ballistic flight is a bad frame; taking
   * the director down is a dead game.
   */
  function guard(fn, what) {
    try { return fn(); } catch (err) {
      api.enabled = false; api.ready = false;
      console.error('[zs] physics disabled after a throw in ' + what, err);
      return undefined;
    }
  }

  /**
   * @returns {boolean} true if this module integrated the world; false means
   *          Rapier is not up (or is switched off, or has failed) and the
   *          caller must run its own ballistic integration this step.
   */
  api.step = (sdt) => {
    if (!api.ready || !api.enabled || !world) return false;
    return guard(() => stepInner(sdt), 'step') === true;
  };

  const stepInner = (sdt) => {
    const live = ctx.fruits.live;
    updateVisibleBox();

    // 1. reconcile: adopt anything new, and let external writes win.
    const tIn = performance.now();
    for (let i = 0; i < live.length; i++) {
      const f = live[i];
      const r = f._px || ensure(f);
      if (!r) continue;
      const b = r.body;
      if (f.pos.x !== r.px || f.pos.y !== r.py || f.pos.z !== r.pz) {
        _v.x = f.pos.x; _v.y = f.pos.y; _v.z = f.pos.z;
        b.setTranslation(_v, true);
        r.px = f.pos.x; r.py = f.pos.y; r.pz = f.pos.z;
      }
      if (f.vel.x !== r.vx || f.vel.y !== r.vy || f.vel.z !== r.vz) {
        _v.x = f.vel.x; _v.y = f.vel.y; _v.z = f.vel.z;
        b.setLinvel(_v, true);
        r.vx = f.vel.x; r.vy = f.vel.y; r.vz = f.vel.z;
      }
      if (f.spin.x !== r.wx || f.spin.y !== r.wy || f.spin.z !== r.wz) {
        _v.x = f.spin.x; _v.y = f.spin.y; _v.z = f.spin.z;
        b.setAngvel(_v, true);
        r.wx = f.spin.x; r.wy = f.spin.y; r.wz = f.spin.z;
      }
      if (f.quat.x !== r.qx || f.quat.y !== r.qy || f.quat.z !== r.qz || f.quat.w !== r.qw) {
        _rot.x = f.quat.x; _rot.y = f.quat.y; _rot.z = f.quat.z; _rot.w = f.quat.w;
        b.setRotation(_rot, true);
        r.qx = f.quat.x; r.qy = f.quat.y; r.qz = f.quat.z; r.qw = f.quat.w;
      }
      // ── CONTACTS ONLY WHERE THEY CAN BE SEEN ─────────────────────────────
      // A tossed fruit spends 43% of its flight below the frame (director.js
      // measured it: apex -1.86 against a landscape world half-height of 3.90)
      // and the spawn strip itself is off-screen. Two bodies interpenetrating
      // down there cost solver time to fix and CANNOT be seen — this is the
      // same argument that let round 10 turn frustum culling back on, applied
      // to the narrow phase. Membership is switched, not the collider: mass
      // properties stay exactly as they were, so nothing about the arc changes.
      // The margin is generous (VIS_PAD) so a body is always colliding well
      // before it is visible; nothing can drift into frame already overlapping.
      const wantOn = (f.pos.y + f.radius > -vis.halfH - VIS_PAD)
        && (Math.abs(f.pos.x) - f.radius < vis.halfW + VIS_PAD)
        ? GROUPS_ON : GROUPS_OFF;
      if (wantOn !== r.groups) { r.collider.setCollisionGroups(wantOn); r.groups = wantOn; }
    }

    // 2. one Rapier step per fixed step, on the caller's dt. No inner clock.
    if (sdt !== curDt && sdt > 0) { world.timestep = sdt; curDt = sdt; }
    const t0 = performance.now();
    api.stats.syncInMs += t0 - tIn;
    world.step();
    const ms = performance.now() - t0;
    api.stats.solverMs += ms;
    api.stats.stepMs = ms;
    api.stats.stepMsEma += (ms - api.stats.stepMsEma) * 0.05;
    api.stats.steps++;
    api.stats.bodies = live.length;

    // 3. write back. `translation(target)` etc. fill the object we hand them,
    //    so this loop allocates nothing.
    const tOut = performance.now();
    for (let i = 0; i < live.length; i++) {
      const f = live[i];
      const r = f._px;
      if (!r) continue;
      const b = r.body;
      b.translation(f.pos);
      b.rotation(f.quat);
      b.linvel(f.vel);
      b.angvel(f.spin);
      // Rails. A pathological overlap (two bodies born inside each other by a
      // route separateAtSpawn does not cover) resolves as a large corrective
      // velocity; clamping it turns a body fired off screen into a firm shove.
      const s2 = f.vel.lengthSq();
      if (s2 > TUNING.maxSpeed * TUNING.maxSpeed) {
        f.vel.multiplyScalar(TUNING.maxSpeed / Math.sqrt(s2));
        _v.x = f.vel.x; _v.y = f.vel.y; _v.z = f.vel.z; b.setLinvel(_v, true);
      }
      const w2 = f.spin.lengthSq();
      if (w2 > TUNING.maxSpin * TUNING.maxSpin) {
        f.spin.multiplyScalar(TUNING.maxSpin / Math.sqrt(w2));
        _v.x = f.spin.x; _v.y = f.spin.y; _v.z = f.spin.z; b.setAngvel(_v, true);
      }
      r.px = f.pos.x; r.py = f.pos.y; r.pz = f.pos.z;
      r.vx = f.vel.x; r.vy = f.vel.y; r.vz = f.vel.z;
      r.qx = f.quat.x; r.qy = f.quat.y; r.qz = f.quat.z; r.qw = f.quat.w;
      r.wx = f.spin.x; r.wy = f.spin.y; r.wz = f.spin.z;
    }
    api.stats.syncOutMs += performance.now() - tOut;
    return true;
  };

  /** Probe hook. The solver's own knobs live on the world, not in TUNING, so a
   *  sweep needs a handle on it. Nothing in the game reads this. */
  Object.defineProperty(api, 'world', { get: () => world });

  api.dispose = () => {
    if (world) { world.free?.(); world = null; }
    api.ready = false;
  };

  return api;
}
