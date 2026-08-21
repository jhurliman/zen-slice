/**
 * director.js — the world: fruit registry, ballistic integration, spawning,
 * wave pacing, and level progression.
 *
 * PACING PHILOSOPHY (this is a *relaxing* game):
 *  - Never more than a handful of things in the air; empty sky is part of the
 *    composition. Breathing room > density.
 *  - Every toss is aimed so its apex lands inside a comfortable "slice window"
 *    near the upper-middle of the frame, where a thumb naturally travels.
 *  - Hang time is long (≈2.2s), so there is no reflex pressure.
 *  - Missing costs nothing. Levels advance on fruit sliced, not on survival.
 */

import * as THREE from 'three';
import { GRAVITY, STAGE, BUDGET, MAX_GENERATION, nextId, makeRng, rr, clamp } from '../core/contract.js';
import { SPECIES_LIST, SPECIES } from '../fruit/species.js';
import { makeFruitGeometry } from '../fruit/geometry.js';
import { createPhysics } from './physics.js';

/**
 * ── r18: THE 30-MINUTE DAY ARC ──────────────────────────────────────────────
 * The r17 table advanced on slice counts alone (6/10/14/18/24), and the player
 * measured the consequence: "we quickly blow through all the levels and then
 * sit in the last level for the majority of gameplay time. I want this game to
 * be around 30 minutes of content."
 *
 * Ten levels now form a dawn→night arc, and a level needs BOTH its `dur`
 * seconds of sim time AND its `need` slices. r29 tightened the whole arc
 * 30 → 20 minutes at the player's request ("the beginning is so slow…
 * now that we throw fruits on the beat there are no overlapping fruits in
 * round one"): durs sum to ~18.3 min to the coda, cadence up across the
 * board, and burst 2 arrives at First Light (was Orchard Rain) so dyad
 * strokes exist from the second level. Time is still the pacer; the slice gate
 * just proves you are playing — idling never advances, which keeps the
 * founding "advance on participation" philosophy. The advance itself still
 * fires from noteSlice(), never from the clock, so a level never changes
 * under an idle player mid-stillness.
 *
 * Each level also has a musical identity (palette/motif/cut-timbre) owned by
 * src/audio/ — the arrays there are index-matched to this table.
 */
/**
 * `rock` (r20) is the per-spawn chance that a toss is a river stone instead
 * of a fruit — the hazard: slicing one plays the wrong-key piano flam,
 * costs points, and breaks the phrase chain. r25 pacing, from the player:
 * rocks are "the only element that adds real gameplay and our pacing is
 * quite slow so we need to get the gameplay aspect going quicker" — they
 * now start at First Light (one level earlier), at roughly DOUBLE the old
 * early-game rates, ramping to a hard cap of 0.18 by night. Only Still
 * Water stays pure (the guard below never draws rng when rock is zero, so
 * level 0's frozen probe baselines stay byte-identical). ⚠ For levels with
 * rock > 0 every spawn draws one extra rng, so those levels' probe
 * baselines shift — re-baselining is expected, not a regression.
 */
export const LEVELS = [
  { name: 'Still Water', pool: ['orange', 'apple'], every: [1.6, 2.2], burst: 1, need: 10, dur: 60, rock: 0 },
  { name: 'First Light', pool: ['orange', 'apple', 'kiwi'], every: [1.3, 1.8], burst: 2, need: 16, dur: 90, rock: 0.04 },
  { name: 'Morning Dew', pool: ['apple', 'kiwi', 'strawberry'], every: [1.2, 1.7], burst: 2, need: 24, dur: 110, rock: 0.07 },
  { name: 'Orchard Rain', pool: ['orange', 'apple', 'kiwi', 'strawberry'], every: [1.1, 1.6], burst: 2, need: 32, dur: 130, rock: 0.10 },
  { name: 'Noon Bloom', pool: ['watermelon', 'orange', 'apple', 'strawberry'], every: [1.0, 1.5], burst: 2, need: 36, dur: 130, rock: 0.12 },
  { name: 'Summer Weight', pool: ['watermelon', 'pineapple', 'orange', 'kiwi'], every: [1.0, 1.4], burst: 3, need: 40, dur: 140, rock: 0.14 },
  { name: 'Golden Hour', pool: ['pineapple', 'watermelon', 'orange', 'apple', 'kiwi', 'strawberry'], every: [0.95, 1.35], burst: 3, need: 42, dur: 140, rock: 0.15 },
  { name: 'Dusk Ember', pool: ['pineapple', 'watermelon', 'orange', 'kiwi', 'strawberry'], every: [0.9, 1.3], burst: 3, need: 45, dur: 150, rock: 0.16 },
  { name: 'Night Jasmine', pool: ['pineapple', 'watermelon', 'orange', 'apple', 'kiwi', 'strawberry'], every: [0.85, 1.25], burst: 3, need: 48, dur: 150, rock: 0.18 },
  // the endless coda — the journey arrives here and stays
  // r32: the coda is ROCK-FREE — "you get that far and it's just fruit swiping bliss"
  { name: 'Deep Calm', pool: ['pineapple', 'watermelon', 'orange', 'apple', 'kiwi', 'strawberry'], every: [0.8, 1.2], burst: 3, need: Infinity, dur: Infinity, rock: 0 },
];

export function createDirector({ seed = 20260806 } = {}) {
  const rng = makeRng(seed);
  const api = { live: [], level: 0, sliced: 0 };
  let ctx, geoCache = new Map(), matCache = new Map();
  // ── ROUND 11: RIGID BODIES ────────────────────────────────────────────────
  // The player asked for real contacts between fruit. src/play/physics.js owns
  // Rapier; this file owns WHO EXISTS. The whole coupling is four lines — add,
  // remove, one call at the top of the integrate loop, and the ctx handle — and
  // the direction of authority is deliberate: physics mirrors the registry, the
  // registry never mirrors physics, so nothing the budget governor retires can
  // come back. If Rapier is not up yet (its WASM loads asynchronously) or is
  // switched off with ?nophys=1, `physics.step()` returns false and the
  // ballistic integrator below runs exactly as it did in round 10.
  const physics = createPhysics();
  let nextSpawn = 1.2;
  let lastFan = -1e9;   // r32: last constellation offer (sim seconds)
  let titleWait = 0.5, titleSide = 1;   // r36: the marquee melon's cadence
  let t = 0;
  let levelT = 0;   // sim seconds in the current level (the r18 time gate)
  let demoEnded = false;   // the demo veil fires once (web demo build only)
  // running triangle total of the live population, maintained incrementally by
  // add()/remove() so the budget check is two comparisons and not an O(n) sum
  // every fixed step (R4: zero steady-state allocation, and no per-step scan we
  // do not need).
  let liveTris = 0;

  const geomFor = (sp, detail) => {
    const k = sp.id + ':' + detail;
    if (!geoCache.has(k)) geoCache.set(k, makeFruitGeometry(sp, detail));
    return geoCache.get(k);
  };
  const matsFor = (sp) => {
    if (!matCache.has(sp.id)) matCache.set(sp.id, [sp.makeSkinMaterial(), sp.makeFleshMaterial()]);
    return matCache.get(sp.id);
  };

  api.init = (c) => {
    ctx = c;
    ctx.fruits = api;
    ctx.physics = physics;
    physics.init(c);
    // warm the caches so the first slice never hitches (this also compiles
    // the rock's shader programs once, even though rock spawns then use
    // fresh per-instance materials for the damage uniform)
    for (const sp of SPECIES_LIST) { geomFor(sp, ctx.quality.fruitSegments); matsFor(sp); }
    // r20: a struck rock takes a visible crack — the registry owns the mesh,
    // so the damage bump lives here, not in the slicer
    c.bus.on('rockhit', (e) => {
      const m = e.rock?.mesh?.material?.[0];
      if (m && m._zsDamage) m._zsDamage.value = Math.min(3, m._zsDamage.value + 1);
    });
  };

  // ── ROUND 10 (perf). Everything that enters the world goes through add(), so
  // this is the one place that can stamp the two facts the budget governor
  // needs, and the one place that can turn frustum culling back on for BOTH
  // whole fruit and halves without touching slicer.js.
  //
  // `mesh.frustumCulled = false` was set in TWO places (director.spawn and
  // slicer.js:111) with no comment. It is not needed: makeFruitGeometry() and
  // cutGeometry() both call computeBoundingSphere(), and slicer.js recomputes
  // it on every half before handing it over, so three's cull test is exact. A
  // body whose bounding sphere is wholly outside the frustum contributes zero
  // pixels to the scene target and therefore zero to bloom and DOF, so turning
  // culling ON cannot change one pixel of any frame — it only stops paying for
  // draws nobody can see. In landscape that is most of the load: a tossed fruit
  // spends 43% of its flight below the visible bottom (apex -1.86 against a
  // world half-height of 3.90) and was being drawn for all of it.
  api.add = (f) => {
    const g = f.mesh.geometry;
    f._tris = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    f._addedAt = t;
    f.mesh.frustumCulled = true;
    liveTris += f._tris;
    api.live.push(f);
    ctx.scene.add(f.mesh);
    // r19 measurement hook: Rapier builds a convex hull here, synchronously,
    // and for a CUT this runs inside the pointer handler rather than a frame.
    const CP = ctx && ctx.__zsCutProf;
    const t0 = CP ? performance.now() : 0;
    physics.addBody(f);
    if (CP) (CP.phys || (CP.phys = [])).push(performance.now() - t0);
  };
  api.remove = (f) => {
    const i = api.live.indexOf(f);
    if (i >= 0) { api.live.splice(i, 1); liveTris -= f._tris || 0; }
    physics.removeBody(f);
    ctx.scene.remove(f.mesh);
    if (f.generation > 0) f.mesh.geometry.dispose(); // halves own their geometry
    // r20: rocks own their material instance (per-body damage uniform), so it
    // dies with the body — Deep Calm is endless, and undisposed per-spawn
    // materials would accumulate renderer-side forever. Fruit keep using the
    // shared cache, which is never disposed. Both rock slots are the same
    // instance, so dispose once.
    if (f.species?.noCut) f.mesh.material?.[0]?.dispose?.();
    f.dead = true;
  };

  function spawn(speciesId, aim) {
    const sp = SPECIES[speciesId];
    const geom = geomFor(sp, ctx.quality.fruitSegments);
    // r20: rocks carry a per-instance crack `damage` uniform, so they get a
    // FRESH material instance (same compiled shader program — only the
    // uniform values are per-mesh) instead of the shared cache. The skin
    // fills BOTH group slots: a rock is never cut, so its cap group is empty
    // and a second material would be dead weight built per spawn.
    let mats;
    if (sp.noCut) { const m = sp.makeSkinMaterial(); mats = [m, m]; }
    else mats = matsFor(sp);
    const mesh = new THREE.Mesh(geom, mats);

    // r32: `aim` (optional) is the CONSTELLATION override — a coordinated
    // toss hands each fruit its exact x/z/apex so a whole fan hangs at the
    // same height at the same moment. The ordinary path's rng draw order is
    // untouched (aim skips those draws entirely).
    const x = aim ? aim.x : rr(rng, -STAGE.halfWidth * 0.62, STAGE.halfWidth * 0.62);
    const z = aim ? aim.z : rr(rng, STAGE.nearZ * 0.6, STAGE.farZ * 0.6);
    const pos = new THREE.Vector3(x, STAGE.floorY + 0.5, z);

    // aim the apex into the slice window
    const apexY = aim ? aim.apexY : rr(rng, 4.2, 7.0);
    const vy = Math.sqrt(Math.max(1, 2 * -GRAVITY * (apexY - pos.y)));
    // gently converge toward centre — a FIXED rate for a fan so its authored
    // spacing survives to the apex instead of scrambling
    const drift = aim ? -x * 0.12 : -x * rr(rng, 0.10, 0.24);
    const vel = new THREE.Vector3(drift, vy, aim ? 0 : rr(rng, -0.25, 0.25));

    const f = {
      id: nextId(), species: sp, mesh, pos, vel,
      // ── Orientation is BIASED, not uniform ────────────────────────────────
      // The geometry critic has now flagged this three rounds running. A fully
      // random Euler points a fruit's authored long axis down the camera as
      // often as across it, and a prolate body seen near its own pole is a
      // circle to within measurement noise. Round 4 measured the consequence
      // exactly: geometry.js carries an 18.1% median protrusion signature, and
      // the delivered hero frame showed 5.8% — the shape was authored and then
      // thrown away by the toss.
      //
      // So: keep the local +Y (long) axis near the SCREEN PLANE. Pick a random
      // in-plane azimuth, tilt it out of plane by at most ~28 degrees, and let
      // roll about that axis stay fully random so nothing looks posed. Every
      // fruit therefore presents a readable profile from the camera while still
      // arriving at a different attitude each time.
      quat: (() => {
        const azim = rr(rng, 0, Math.PI * 2);
        const tilt = rr(rng, -0.49, 0.49);          // radians out of the screen plane
        const roll = rr(rng, 0, Math.PI * 2);
        const axis = new THREE.Vector3(
          Math.cos(azim) * Math.cos(tilt),
          Math.sin(azim) * Math.cos(tilt),
          Math.sin(tilt)
        ).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
        return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
      })(),
      // Spin mostly about the camera axis so the profile the toss just set up is
      // preserved through the arc rather than tumbling back down the view axis.
      spin: new THREE.Vector3(rr(rng, -0.5, 0.5), rr(rng, -0.5, 0.5), rr(rng, -1.5, 1.5)),
      radius: sp.radius * 1.06,
      generation: 0, dead: false, bornAt: t, lastCutBy: -1,
    };
    mesh.position.copy(pos);
    mesh.quaternion.copy(f.quat);
    api.add(f);
    ctx.bus.emit('spawn', { fruit: f });
    return f;
  }

  api.spawnAt = spawn;

  // ── THE VISIBLE BOX, IN WORLD UNITS, RECOMPUTED FROM THE CAMERA ────────────
  // Round 10's finding, and it is the same disease as the pixel thresholds:
  // the retirement test was two WORLD constants (`STAGE.floorY - 2` = -9.5 and
  // `STAGE.halfWidth * 2.4` = 10.56) while the thing they are supposed to
  // approximate — the edge of the frame — is a function of ASPECT, because
  // main.js CONTAIN-fits STAGE.halfExtent. Measured on the shipped build:
  //     landscape (1.778)  half-height 3.900  half-width 6.933
  //     portrait  (0.461)  half-height 8.453  half-width 3.900
  // So the old constants meant "1.5 screen-widths past the edge" in landscape
  // and "2.7 screen-widths past the edge" in portrait on X, and "2.4 screens
  // below" landscape against "1.1 below" portrait on Y. Bodies were kept alive,
  // integrated and drawn for wildly different amounts of invisible travel in
  // the two orientations. Deriving the box from the camera fixes both ends at
  // once and is the only version that is correct at every raster.
  //
  // Conservative by construction: evaluated at STAGE.nearZ (the FAR edge of the
  // stage volume, z = -2, the largest cross-section any body can occupy), so a
  // body we call invisible is invisible at every depth it could be at.
  const vis = { halfH: STAGE.halfExtent, halfW: STAGE.halfExtent, dist: 0 };
  const VIS_MARGIN = 1.2;   // world units of slack before anything is retired
  function updateVisibleBox() {
    const cam = ctx.camera;
    const dist = Math.max(1, cam.position.z - STAGE.nearZ);
    if (dist === vis.dist && cam.aspect === vis.aspect) return;
    vis.dist = dist; vis.aspect = cam.aspect;
    vis.halfH = Math.tan((cam.fov * Math.PI) / 360) * dist;
    vis.halfW = vis.halfH * cam.aspect;
  }
  /** Is any part of this body inside the visible box? Bounding-sphere test. */
  const onScreen = (f) => (
    Math.abs(f.pos.x) - f.radius < vis.halfW &&
    Math.abs(f.pos.y) - f.radius < vis.halfH
  );

  // ── THE SCENE BUDGET GOVERNOR ─────────────────────────────────────────────
  // See contract.js BUDGET. `quality.maxFruit` caps generation-0 fruit only,
  // and a cut turns one body into two, so before this the live population — and
  // with it the draw-call count, which is exactly 13 + 2*bodies — had no upper
  // bound at all. Portrait reached 105 bodies / 223 draw calls on the seeded
  // load loop against an R4 ceiling of 120.
  //
  // It is a CEILING, not a target: it can only remove bodies. Retirement order
  // is off-screen first, then highest generation, then oldest, so the first
  // things to go are fragments nobody can see. Allocation-free (no sort, no
  // closure, no temporary array) because R4 requires zero steady-state
  // allocation in the hot loop.
  function enforceBudget() {
    const n = api.live.length;
    if (n === 0) return;
    let calls = BUDGET.fixedDrawCalls + BUDGET.reserveDrawCalls + BUDGET.callsPerBody * n;
    let tris = BUDGET.fixedTriangles + BUDGET.reserveTriangles + liveTris;
    if (calls <= BUDGET.drawCalls && tris <= BUDGET.triangles) return;

    let retired = 0;
    while ((calls > BUDGET.drawCalls || tris > BUDGET.triangles)
           && retired < BUDGET.maxRetirePerStep && api.live.length > 0) {
      let worst = -1, worstKeep = 1e9, worstAge = -1;
      for (let i = 0; i < api.live.length; i++) {
        const f = api.live[i];
        // r29 (codex): every generation gets its own rank — gen 2 and 3 used
        // to tie at 0 and the age tiebreak then retired OLDER (larger)
        // quarters before fresh eighths. The on-screen weight (4) still
        // dominates the whole generation span (max 3), so "off-screen first"
        // is preserved exactly.
        const keep = (onScreen(f) ? 4 : 0) + Math.max(0, 3 - f.generation);
        const age = t - f._addedAt;
        if (keep < worstKeep || (keep === worstKeep && age > worstAge)) {
          worst = i; worstKeep = keep; worstAge = age;
        }
      }
      if (worst < 0) break;
      const f = api.live[worst];
      calls -= BUDGET.callsPerBody;
      tris -= f._tris;
      ctx.bus.emit('expire', { fruit: f, reason: 'offstage' });
      api.remove(f);
      retired++;
    }
  }

  api.fixed = (sdt) => {
    t += sdt;
    // ══ r36 THE MARQUEE HOLD ════════════════════════════════════════════════
    // While the title screen is up (hud.js publishes ctx.titleHold) the arc
    // has not begun: the level clock waits and nothing ordinary spawns — the
    // player read random toss traffic under the title as "stressful, like you
    // are missing points". Instead ONE watermelon at a time lobs a slow arc
    // past the wordmark (the icon, by request), alternating sides. Physics
    // and retirement below run as normal so the melon flies and leaves.
    // Probes never set the flag (?capture suppresses the title), so frozen
    // rng streams are untouched.
    const held = !!ctx.titleHold;
    if (!held) levelT += sdt;
    const L = LEVELS[api.level];
    updateVisibleBox();

    if (held) {
      let whole = 0;
      for (let i = 0; i < api.live.length; i++) if (api.live[i].generation === 0) whole++;
      if (whole === 0 && (titleWait -= sdt) <= 0) {
        titleSide = -titleSide;
        spawn('watermelon', {
          x: titleSide * rr(rng, 0.7, 1.3),
          apexY: rr(rng, 2.5, 3.2),
          z: rr(rng, -0.5, 0.5),
        });
        titleWait = rr(rng, 1.6, 2.6);
      }
    }

    // pacing. The generation-0 census used to be `api.live.filter(...)`, which
    // allocated a throwaway array every fixed step — 120 of them a second
    // against R4's "zero steady-state allocation in the hot loop".
    nextSpawn -= sdt;
    if (!held && nextSpawn <= 0) {
      // ══ r28 THE BEAT-QUANTIZED TOSS (the Lumines/Rez move) ══════════════
      // When the timer expires, the toss HOLDS until the conductor's next
      // audible 8th (audio.js publishes ctx.toss8In each render frame; the
      // whole burst launches together — one musical moment). Fruit then
      // ARRIVE on the music, the player naturally slices on the music, and
      // the tempo inference locks the loop. Rails: no publisher (audio off,
      // ?nosound, harness) → toss immediately; a hold is never allowed past
      // 0.75 s beyond expiry, so a stalled publisher cannot starve the game.
      // rng-stream note: the hold delays draws in TIME but never reorders
      // or adds them — frozen rng streams are byte-identical, only frame
      // TIMING baselines shift (expected, as with every pacing change).
      const hold = ctx.toss8In;
      if (hold != null && hold > 0.02 && hold < 0.6 && nextSpawn > -0.75) {
        // not on the grid yet — nextSpawn keeps counting down past 0 and we
        // re-check next step; the -0.75 rail above guarantees the toss
      } else {
        let whole = 0;
        for (let i = 0; i < api.live.length; i++) if (api.live[i].generation === 0) whole++;
        // ══ r32 THE CONSTELLATION ══════════════════════════════════════════
        // "It is very rare to get a 4x or 5x… it's really a highlight moment"
        // — so the sky occasionally OFFERS the chord: on a clear sky (whole
        // fruit only readable when nothing else is up), from Morning Dew on,
        // a fan of 4 fruit (5 from Summer Weight, tier maxFruit permitting)
        // launches together with a SHARED apex height and even x spacing —
        // they hang side by side at the top of the arc, one clean stroke
        // wide. Never rocks (it is a gift), 22 s minimum between offers, and
        // an extra beat of empty sky afterward so the moment breathes.
        // ⚠ the eligibility gate draws one rng, so spawn streams shift for
        // levels ≥ 2 (same documented trade as L.rock; L0-L1 streams and
        // their frozen baselines are untouched).
        if (api.level >= 2 && whole === 0 && t - lastFan > 22 && rng() < 0.16) {
          // codex r32: the fan must be born COLLISION-FREE, or physics'
          // separateAtSpawn() shoves the overlapping bodies apart while
          // their velocities still aim from the authored spots — the
          // formation dies before it is visible. So: species are chosen
          // FIRST (small fruit only, radius ≤ 1.0 — a melon fan would not
          // fit one stroke anyway), every gap is computed from its actual
          // neighbours' radii, and an alternating depth stagger (±DZ) buys
          // clearance without adding width. Same-z second neighbours sit
          // two gaps apart, which always clears too. If five will not fit
          // inside one stroke's reach, four fly instead.
          const fanPool = [];
          for (const id of L.pool) if (SPECIES[id].radius <= 1.0) fanPool.push(id);
          const DZ = 0.6;
          let n = Math.min(ctx.quality.maxFruit, api.level >= 5 ? 5 : 4);
          let ids, xs, span;
          for (;;) {
            ids = []; xs = [0];
            for (let i = 0; i < n; i++) ids.push(fanPool[Math.floor(rng() * fanPool.length)]);
            for (let i = 1; i < n; i++) {
              const need = (SPECIES[ids[i - 1]].radius + SPECIES[ids[i]].radius) * 1.06 * 0.98;
              const gap = Math.max(0.8, Math.sqrt(Math.max(0.2, need * need - 4 * DZ * DZ)) * 1.08);
              xs.push(xs[i - 1] + gap);
            }
            span = xs[n - 1];
            if (span <= 5.2 || n <= 4) break;
            n--;
          }
          const apexY = rr(rng, 5.0, 6.1);
          const zBase = rr(rng, STAGE.nearZ * 0.4, STAGE.farZ * 0.4);
          for (let i = 0; i < n; i++) {
            spawn(ids[i], {
              x: xs[i] - span / 2,
              apexY: apexY + rr(rng, -0.12, 0.12),
              z: zBase + (i & 1 ? DZ : -DZ),
            });
          }
          lastFan = t;
          nextSpawn = rr(rng, L.every[0], L.every[1]) + 1.2;
        } else if (whole < ctx.quality.maxFruit) {
          const n = 1 + Math.floor(rng() * L.burst);
          for (let i = 0; i < n; i++) {
            // the L.rock > 0 guard keeps levels with no rocks from drawing rng,
            // so their spawn streams (and frozen probe baselines) are untouched
            if (L.rock > 0 && rng() < L.rock) spawn('rock');
            else spawn(L.pool[Math.floor(rng() * L.pool.length)]);
          }
          nextSpawn = rr(rng, L.every[0], L.every[1]) + (n - 1) * 0.25;
        }
      }
    }

    // integrate. Rapier does it if it is up (and then f.pos/f.quat/f.vel/f.spin
    // are already this step's values when we get here); otherwise the original
    // ballistic scheme runs per body below. Both are semi-implicit Euler at the
    // same sdt, so a fruit that touches nothing flies the same arc either way.
    const stepped = physics.step(sdt);

    for (let i = api.live.length - 1; i >= 0; i--) {
      const f = api.live[i];
      if (!stepped) {
        f.vel.y += GRAVITY * sdt;
        f.pos.addScaledVector(f.vel, sdt);
        const w = f.spin;
        const ang = w.length() * sdt;
        if (ang > 1e-7) {
          _q.setFromAxisAngle(_ax.copy(w).normalize(), ang);
          f.quat.premultiply(_q);
        }
      }
      f.mesh.position.copy(f.pos);
      f.mesh.quaternion.copy(f.quat);

      // ⚠ THE RASTER-CORRECT RETIREMENT BOX IS MEASURED, WRITTEN UP ABOVE, AND
      // DELIBERATELY NOT SHIPPED. It belongs here:
      //     (f.pos.y + f.radius < -vis.halfH - VIS_MARGIN && f.vel.y <= 0)
      //  || (Math.abs(f.pos.x) - f.radius > vis.halfW + VIS_MARGIN
      //      && f.pos.x * f.vel.x >= 0)
      // and it is strictly tighter than the two world constants in both
      // orientations. I built it, shot it, and TOOK IT OUT, because it moves
      // pixels in frames it has no business touching and the reason is worth
      // more than the change was:
      //
      // `rng` is ONE stream shared by every spawn, and a fruit's whole
      // orientation (`quat`, three draws) and `spin` (three more) come off it.
      // Retiring a body sooner frees a `maxFruit` slot sooner, which lets the
      // pacing block fire an extra automatic spawn, which advances the stream —
      // so EVERY fruit after that point is at a different attitude. Between
      // boot and the harness's first `ZS.pause()` the rAF loop runs for an
      // unbounded amount of wall time, so this lands before beat one. Measured
      // on the isolated build (stage.js pinned, ONLY this file and contract.js
      // differing): `outline shots/A/01-whole-watermelon.png` protr_height_pct
      // 2.18 -> 2.68 and 91 of 118 frozen-suite keys moved in portrait, on a
      // one-whole-melon frame my change cannot otherwise reach. That is four
      // other pieces' evidence invalidated to save draw calls I can save in the
      // governor instead. The budget ceiling below is bounded by triangles as
      // well as calls, so nothing is lost by leaving this out.
      if (f.pos.y < STAGE.floorY - 2 || Math.abs(f.pos.x) > STAGE.halfWidth * 2.4) {
        ctx.bus.emit('expire', { fruit: f, reason: f.generation === 0 ? 'missed' : 'offstage' });
        api.remove(f);
      }
    }

    enforceBudget();
  };

  // ⚠ AND ALSO IN THE FRAME PHASE, WHICH IS NOT BELT-AND-BRACES — IT IS THE
  // ONLY PLACE THAT IS ACTUALLY GUARANTEED TO RUN BEFORE A RENDER, AND LEAVING
  // IT OUT COST ME A WHOLE MEASUREMENT PASS. `api.fixed` runs inside main.js's
  // `while (acc >= SIM_DT)` accumulator, and NOTHING guarantees that loop runs
  // a step on any given tick.
  //
  // ── R11 UPDATE: THE REASON GOT SMALLER, THE RULE DID NOT ──────────────────
  // This used to read "slow-motion scales the accumulator: score.js emits
  // `slowmo` at scale 0.16..0.34 on EVERY cut, so five or six consecutive
  // ticks run no fixed step at all". Round 11 DELETED slow-mo (score.js), so
  // that specific mechanism is gone and the budget governor no longer has a 3x
  // clock working against it. Measured then, portrait, with enforcement in
  // `fixed` only: 59 live bodies against a cap of 51 — 13 + 2*59 = 131 draw
  // calls, over the R4 ceiling, swinging 113..165 between runs purely on
  // whether a fixed step landed on the render tick.
  //
  // Keep the frame hook anyway, because the residual case is real and
  // permanent: SIM_DT is 1/120 s and a 60 Hz display ticks at 1/60 s, so `acc`
  // is chronically out of phase with the render and any tick whose dt lands
  // fractionally under SIM_DT runs zero steps and still draws. MAX_SUBSTEPS is
  // 4, so a stall also dumps the accumulator and skips steps outright. The
  // frame phase runs exactly once per tick; it is the only hook that cannot be
  // skipped, and that was always the actual argument.
  // Cost when under budget: `updateVisibleBox` is memoised on (dist, aspect)
  // and `enforceBudget` is two comparisons against an incrementally maintained
  // total. No allocation, no scan.
  api.frame = () => {
    updateVisibleBox();
    enforceBudget();
  };

  api.noteSlice = () => {
    api.sliced++;
    const L = LEVELS[api.level];
    // Both gates (r18): the level has run its course in TIME and the player
    // has proven participation in SLICES. Checked only here — the clock never
    // advances a level on its own, so the world cannot change under an idle
    // player mid-stillness; the slice that finally satisfies both is the one
    // that turns the page.
    if (api.sliced >= L.need && levelT >= L.dur && api.level < LEVELS.length - 1) {
      // ══ THE DEMO GATE (web build only) ═══════════════════════════════
      // The published Pages build is the first three levels; the page that
      // would turn to level 3 announces the full game instead. 'demoend'
      // fires ONCE — hud.js owns the veil — and the gate blocks only the
      // page-turn, never the slicing: level 2 keeps playing underneath
      // forever, in the coda's spirit. Compiled out of the App Store build
      // (__ZS_DEMO__ is an esbuild define; false makes this dead code).
      if (typeof __ZS_DEMO__ !== 'undefined' && __ZS_DEMO__ && api.level >= 2) {
        if (!demoEnded) { demoEnded = true; ctx.bus.emit('demoend', {}); }
        return;
      }
      api.level++; api.sliced = 0; levelT = 0;
      ctx.bus.emit('level', { level: api.level, name: LEVELS[api.level].name });
    }
  };

  /** r20, for the ?debug overlay: jump straight to a level. Emits the same
   *  'level' event a natural advance does, so audio/hud react identically. */
  api.jumpLevel = (n) => {
    const l = Math.max(0, Math.min(LEVELS.length - 1, n | 0));
    api.level = l; api.sliced = 0; levelT = 0;
    ctx.bus.emit('level', { level: l, name: LEVELS[l].name });
  };

  api.reset = () => {
    demoEnded = false;
    titleWait = 0.5; titleSide = 1;
    for (let i = api.live.length - 1; i >= 0; i--) api.remove(api.live[i]);
    api.level = 0; api.sliced = 0; levelT = 0; nextSpawn = 0.8; liveTris = 0; lastFan = -1e9;
    // ⚠ ROUND 10, FOR THE JUICE PIECE — READ THIS. The r9 juice verdict's open
    // item (1) is that `api.reset` retires the bodies but nothing retires the
    // live beads/grains/strands/sheets, so shots/*/00-hero.png carries eleven
    // beats of prior juice and no hero number is reproducible. director.js is
    // not fluid.js's to edit and fluid.js is not mine, so instead of calling
    // into it I publish the event: `bus.on('reset', ...)` in fluid.js is now
    // all that is needed, with no change in this file and none in main.js.
    // Nothing listens today, so this emit is a no-op until juice takes it.
    ctx.bus.emit('reset', {});
  };

  return api;
}

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
