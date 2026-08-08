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
import { GRAVITY, STAGE, MAX_GENERATION, nextId, makeRng, rr, clamp } from '../core/contract.js';
import { SPECIES_LIST, SPECIES } from '../fruit/species.js';
import { makeFruitGeometry } from '../fruit/geometry.js';

export const LEVELS = [
  { name: 'Still Water', pool: ['orange', 'apple'], every: [1.9, 2.6], burst: 1, need: 6 },
  { name: 'First Light', pool: ['orange', 'apple', 'kiwi'], every: [1.6, 2.2], burst: 1, need: 10 },
  { name: 'Orchard Rain', pool: ['orange', 'apple', 'kiwi', 'strawberry'], every: [1.3, 1.9], burst: 2, need: 14 },
  { name: 'Summer Weight', pool: ['watermelon', 'orange', 'kiwi', 'strawberry'], every: [1.2, 1.7], burst: 2, need: 18 },
  { name: 'Golden Hour', pool: ['pineapple', 'watermelon', 'orange', 'apple', 'kiwi', 'strawberry'], every: [1.0, 1.5], burst: 2, need: 24 },
  { name: 'Deep Calm', pool: ['pineapple', 'watermelon', 'orange', 'apple', 'kiwi', 'strawberry'], every: [0.85, 1.35], burst: 3, need: 999 },
];

export function createDirector({ seed = 20260806 } = {}) {
  const rng = makeRng(seed);
  const api = { live: [], level: 0, sliced: 0 };
  let ctx, geoCache = new Map(), matCache = new Map();
  let nextSpawn = 1.2;
  let t = 0;

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
    // warm the caches so the first slice never hitches
    for (const sp of SPECIES_LIST) { geomFor(sp, ctx.quality.fruitSegments); matsFor(sp); }
  };

  api.add = (f) => { api.live.push(f); ctx.scene.add(f.mesh); };
  api.remove = (f) => {
    const i = api.live.indexOf(f);
    if (i >= 0) api.live.splice(i, 1);
    ctx.scene.remove(f.mesh);
    if (f.generation > 0) f.mesh.geometry.dispose(); // halves own their geometry
    f.dead = true;
  };

  function spawn(speciesId) {
    const sp = SPECIES[speciesId];
    const geom = geomFor(sp, ctx.quality.fruitSegments);
    const mesh = new THREE.Mesh(geom, matsFor(sp));
    mesh.frustumCulled = false;

    const x = rr(rng, -STAGE.halfWidth * 0.62, STAGE.halfWidth * 0.62);
    const z = rr(rng, STAGE.nearZ * 0.6, STAGE.farZ * 0.6);
    const pos = new THREE.Vector3(x, STAGE.floorY + 0.5, z);

    // aim the apex into the slice window
    const apexY = rr(rng, 4.2, 7.0);
    const vy = Math.sqrt(Math.max(1, 2 * -GRAVITY * (apexY - pos.y)));
    const drift = -x * rr(rng, 0.10, 0.24);   // gently converge toward centre
    const vel = new THREE.Vector3(drift, vy, rr(rng, -0.25, 0.25));

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

  api.fixed = (sdt) => {
    t += sdt;
    const L = LEVELS[api.level];

    // pacing
    nextSpawn -= sdt;
    if (nextSpawn <= 0 && api.live.filter((f) => f.generation === 0).length < ctx.quality.maxFruit) {
      const n = 1 + Math.floor(rng() * L.burst);
      for (let i = 0; i < n; i++) spawn(L.pool[Math.floor(rng() * L.pool.length)]);
      nextSpawn = rr(rng, L.every[0], L.every[1]) + (n - 1) * 0.25;
    }

    // integrate
    for (let i = api.live.length - 1; i >= 0; i--) {
      const f = api.live[i];
      f.vel.y += GRAVITY * sdt;
      f.pos.addScaledVector(f.vel, sdt);
      const w = f.spin;
      const ang = w.length() * sdt;
      if (ang > 1e-7) {
        _q.setFromAxisAngle(_ax.copy(w).normalize(), ang);
        f.quat.premultiply(_q);
      }
      f.mesh.position.copy(f.pos);
      f.mesh.quaternion.copy(f.quat);

      if (f.pos.y < STAGE.floorY - 2 || Math.abs(f.pos.x) > STAGE.halfWidth * 2.4) {
        ctx.bus.emit('expire', { fruit: f, reason: f.generation === 0 ? 'missed' : 'offstage' });
        api.remove(f);
      }
    }
  };

  api.noteSlice = () => {
    api.sliced++;
    const L = LEVELS[api.level];
    if (api.sliced >= L.need && api.level < LEVELS.length - 1) {
      api.level++; api.sliced = 0;
      ctx.bus.emit('level', { level: api.level, name: LEVELS[api.level].name });
    }
  };

  api.reset = () => {
    for (let i = api.live.length - 1; i >= 0; i--) api.remove(api.live[i]);
    api.level = 0; api.sliced = 0; nextSpawn = 0.8;
  };

  return api;
}

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
