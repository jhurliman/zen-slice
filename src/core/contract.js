/**
 * ZEN SLICE — domain model & module contract.
 *
 * This file is the FROZEN SPINE. Builder agents own exactly one module file each
 * and may not edit this file without an explicit contract-change note.
 *
 * ── Domain nouns ────────────────────────────────────────────────────────────
 *
 *  Species      Static identity of a fruit kind. Rind, flesh, juice, seeds,
 *               mass, radius, juiciness, pitch. Pure data + material factories.
 *
 *  Fruit        A live instance in the world. Owns a Solid (its sliceable
 *               geometry), a Body (position/velocity/spin), and a Species.
 *               A Fruit is whole until it is cut; then it dies and yields Halves.
 *
 *  Solid        A closed triangle mesh treated as a convex-ish solid that can be
 *               cut by a Plane into two closed Solids, each with a fresh flat
 *               "cap" polygon on the cut plane. Caps are what the player sees —
 *               they carry the flesh material and must look photographic.
 *
 *  Half         A Fruit-like fragment produced by a cut. Same contract as Fruit
 *               (it can be cut again). Carries `capFrame` = the local frame of
 *               the flat face, used to aim juice.
 *
 *  Body         Rigid state: position, velocity, orientation (quat), angular
 *               velocity. Integrated by the Director's simple ballistic solver.
 *               No collisions between fruit — this is a calm game.
 *
 *  Blade        The player's finger/mouse as a time-stamped polyline in NDC.
 *               Emits SliceStrokes. Owns its own ribbon mesh.
 *
 *  SliceStroke  The atomic *event* of the game: a world-space Plane, a speed,
 *               and the segment of blade travel that produced it. Everything
 *               downstream (cut, juice, sound, slow-mo, score) is a pure
 *               function of a SliceStroke + the Fruit it hit.
 *
 *  JuiceBurst   The fluid response to one SliceStroke×Fruit. Three coupled
 *               layers: sheet (the expanding translucent film), droplets
 *               (ballistic beads), and mist (fine spray). Colored by Species.
 *
 *  Director     Decides what is thrown, when, and how — waves, arcs, pacing,
 *               and the slow-motion time dilation that makes slicing feel good.
 *
 *  Score        Combo/streak/zen-level progression. Deliberately shallow.
 *
 * ── Frame & units ───────────────────────────────────────────────────────────
 *  +Y up, +X right, -Z into the screen. 1 unit = 1 decimetre (a plum ≈ 0.4).
 *  Gravity = -9.8 * GRAVITY_SCALE on Y. Camera looks down -Z from +Z.
 *  Fruit are tossed from below the frustum and arc through the "stage volume".
 *
 * ── Time ────────────────────────────────────────────────────────────────────
 *  Two clocks. `dt` is real seconds. `sdt` is simulation seconds = dt*timeScale.
 *  Slow-mo scales `sdt` only. UI/audio ducking read `timeScale` directly.
 *  Sim runs on a fixed accumulator at SIM_HZ; render interpolates.
 */

import * as THREE from 'three';

// ── World constants ──────────────────────────────────────────────────────────
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
export const MAX_SUBSTEPS = 4;
export const GRAVITY = -14.0;      // dm/s^2, tuned for hang-time not realism
export const STAGE = Object.freeze({
  // The frame is composed like the reference plate: a watermelon reads at
  // roughly a third of frame height, so the visible half-extent is ~5 units in
  // BOTH axes on every device. Fruit fill the frame; the void does the rest.
  // Framing. The round-2 critic measured the hero watermelon at 30.0% of frame
  // height against plate-01's 61.1% — "an outline-identical ball at half the
  // reference scale". Authored detail was invisible for a mechanical reason: at
  // 108 px across, a 1.9 px stem and a 1.14 prolate axis are both under the
  // threshold of visibility, so no amount of work in geometry.js could show up.
  //
  // halfExtent is the visible half-height in world units, so a 3.1-unit
  // watermelon occupies 3.1/(2*halfExtent) of the frame:
  //   5.2 -> 30%   (round 2)
  //   3.9 -> 40%   (here)
  // Not the full 61%: plate-01 is a hero composition of one subject, while this
  // has to hold a five-fruit combo without shoving pieces off-frame. Push the
  // rest of the way with fruit radius, not by cropping the playfield.
  halfExtent: 3.9,
  halfWidth: 4.4,    // spawn spread, slightly wider than the focal box
  floorY: -7.5,
  ceilY: 9.0,
  nearZ: -2.0,
  farZ: 2.0,
});

// ── Quality tiers (the perf governor moves between these) ────────────────────
export const TIER = Object.freeze({
  ULTRA: 3,   // desktop / M-series iPad
  HIGH: 2,    // ProMotion iPhone at 120
  MED: 1,     // older iPhone at 60
  LOW: 0,     // emergency
});

/** @typedef {{tier:number, dpr:number, maxFruit:number, maxDroplets:number,
 *             bloom:boolean, refraction:boolean, sheetSegments:number,
 *             fruitSegments:number, shadow:boolean}} QualityProfile */

// ── Plane ────────────────────────────────────────────────────────────────────
/**
 * A cutting plane in WORLD space. `n` unit normal, `d` such that
 * dot(n, p) - d > 0 means p is on the POSITIVE side.
 */
export class Plane {
  constructor(n = new THREE.Vector3(0, 1, 0), d = 0) { this.n = n; this.d = d; }
  static fromPointNormal(p, n) { return new Plane(n.clone().normalize(), n.dot(p)); }
  signed(p) { return this.n.dot(p) - this.d; }
  clone() { return new Plane(this.n.clone(), this.d); }
}

// ── SliceStroke ──────────────────────────────────────────────────────────────
/**
 * @property {Plane}   plane    world cutting plane
 * @property {THREE.Vector3} dir  unit world direction of blade travel
 * @property {number}  speed    world units / second at the moment of contact
 * @property {THREE.Vector3} at  approximate world contact point
 * @property {number}  t        performance.now()/1000 at contact
 */
export class SliceStroke {
  constructor(plane, dir, speed, at, t) {
    this.plane = plane; this.dir = dir; this.speed = speed; this.at = at; this.t = t;
  }
}

// ── Module interfaces ────────────────────────────────────────────────────────
/**
 * Every module is a factory returning an object with this shape. Any of the
 * hooks may be omitted. This keeps main.js a dumb wiring harness so that
 * modules can be swapped/regenerated independently.
 *
 * @typedef {Object} Module
 * @property {(ctx:Ctx)=>void}            [init]     once, after renderer exists
 * @property {(sdt:number, ctx:Ctx)=>void} [fixed]   fixed-step sim, sdt = SIM_DT*timeScale
 * @property {(dt:number, alpha:number, ctx:Ctx)=>void} [frame]  per render frame
 * @property {(q:QualityProfile)=>void}   [quality]  quality tier changed
 * @property {(w:number,h:number,dpr:number)=>void} [resize]
 * @property {()=>void}                   [dispose]
 */

/**
 * Shared context passed to every module. Modules communicate ONLY through this
 * and through the event bus — never by importing each other.
 *
 * @typedef {Object} Ctx
 * @property {THREE.WebGLRenderer} renderer
 * @property {THREE.Scene}   scene
 * @property {THREE.Camera}  camera
 * @property {Bus}           bus
 * @property {QualityProfile} quality
 * @property {number}        timeScale
 * @property {number}        time      accumulated sim seconds
 * @property {Object}        stage     render module public API
 * @property {Object}        fruits    live registry (see FruitRegistry below)
 */

// ── Event bus ────────────────────────────────────────────────────────────────
/**
 * Named events (the entire game vocabulary — keep this list short):
 *
 *  'slice'      {stroke:SliceStroke, fruit:Fruit, halves:Half[]}
 *  'juice'      {stroke:SliceStroke, species:Species, at:Vector3, capFrame, amount:number}
 *  'spawn'      {fruit:Fruit}
 *  'expire'     {fruit:Fruit, reason:'missed'|'offstage'}
 *  'combo'      {count:number, at:Vector3}
 *  'level'      {level:number, name:string}
 *  'slowmo'     {scale:number, seconds:number}
 *  'quality'    {profile:QualityProfile}
 *  'perf'       {fps:number, ms:number, tier:number}
 */
export class Bus {
  constructor() { this._m = new Map(); }
  on(k, fn) { (this._m.get(k) ?? this._m.set(k, []).get(k)).push(fn); return () => this.off(k, fn); }
  off(k, fn) { const a = this._m.get(k); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(k, payload) { const a = this._m.get(k); if (a) for (let i = 0; i < a.length; i++) a[i](payload); }
}

// ── Fruit registry contract ──────────────────────────────────────────────────
/**
 * @typedef {Object} FruitRegistry
 * @property {Fruit[]} live          all cuttable bodies (whole fruit AND halves)
 * @property {(f:Fruit)=>void} add
 * @property {(f:Fruit)=>void} remove
 */

// ── Fruit / Half shared shape ────────────────────────────────────────────────
/**
 * @typedef {Object} Fruit
 * @property {number}  id
 * @property {Species} species
 * @property {THREE.Mesh} mesh          world-parented; mesh.geometry is the Solid
 * @property {THREE.Vector3} pos
 * @property {THREE.Vector3} vel
 * @property {THREE.Quaternion} quat
 * @property {THREE.Vector3} spin       axis*radians/sec
 * @property {number}  radius           bounding radius, world units
 * @property {number}  generation       0 = whole fruit, 1 = half, 2 = quarter...
 * @property {boolean} dead
 * @property {number}  bornAt
 */

export const MAX_GENERATION = 2; // pieces stop being cuttable after this

// ── Utility ──────────────────────────────────────────────────────────────────
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
/** frame-rate independent exponential approach */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Global time source. The harness swaps this to a virtual clock so that
 *  screenshots are deterministic and independent of software-GL slowness. */
export const Clock = { virtual: false, t: 0 };
export const nowSec = () => (Clock.virtual ? Clock.t : performance.now() / 1000);

let _id = 1;
export const nextId = () => _id++;

/** Deterministic PRNG so critic screenshots are reproducible. */
export function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return function rng() {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export const rr = (rng, a, b) => a + (b - a) * rng();
