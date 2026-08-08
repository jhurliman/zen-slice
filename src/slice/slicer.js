/**
 * slicer.js — turns swipes into SliceStrokes, cuts the fruit, births the halves.
 *
 * Detection is done in the plane that contains the camera eye and the swipe
 * segment. That is exactly the surface a real blade would sweep, so a swipe
 * that *looks* like it crosses a fruit always cuts it, at any depth — the
 * single most important fairness property for feel.
 *
 * Guards:
 *  - a fruit can only be cut once per pointer stroke (`strokeId`)
 *  - fragments stop being cuttable past MAX_GENERATION
 *  - a minimum swipe speed prevents "resting finger" cuts (feels like a knife,
 *    not a laser pointer) but the floor is low enough to stay forgiving
 */

import * as THREE from 'three';
import { Plane, SliceStroke, MAX_GENERATION, nextId, clamp } from '../core/contract.js';
import { cutGeometry, recenter } from './cutter.js';

const MIN_SPEED_NDC = 0.55;   // ndc units / second

export function createSlicer() {
  const api = {};
  let ctx, strokeId = 0;

  const _e = new THREE.Vector3();       // eye
  const _ra = new THREE.Vector3(), _rb = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3(), _q = new THREE.Vector3();
  const _screen = new THREE.Vector3();
  const _localPlaneN = new THREE.Vector3();
  const _m = new THREE.Matrix4();

  api.init = (c) => {
    ctx = c;
    c.renderer.domElement.addEventListener('pointerdown', () => { strokeId++; });
    c.bus.on('swipe', onSwipe);
  };

  function rayDir(ndc, out) {
    out.set(ndc.x, ndc.y, 0.5).unproject(ctx.camera).sub(_e).normalize();
    return out;
  }

  function onSwipe(sw) {
    if (sw.speedNdc < MIN_SPEED_NDC) return;
    const cam = ctx.camera;
    cam.getWorldPosition(_e);
    rayDir(sw.a, _ra); rayDir(sw.b, _rb);
    _n.copy(_ra).cross(_rb);
    if (_n.lengthSq() < 1e-12) return;
    _n.normalize();
    const plane = new Plane(_n.clone(), _n.dot(_e));

    // world-space blade direction at mid depth
    const mid = new THREE.Vector3().addVectors(_ra, _rb).normalize();
    const dir = new THREE.Vector3().subVectors(_rb, _ra).normalize();

    const list = ctx.fruits.live;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      if (f.dead || f.generation >= MAX_GENERATION) continue;
      if (f.lastStroke === strokeId) continue;

      const d = plane.signed(f.pos);
      if (Math.abs(d) > f.radius * 0.92) continue;

      // did the *segment* (not the infinite line) actually pass over it?
      _screen.copy(f.pos).project(cam);
      const ax = sw.a.x, ay = sw.a.y, bx = sw.b.x, by = sw.b.y;
      const vx = bx - ax, vy = by - ay;
      const wx = _screen.x - ax, wy = _screen.y - ay;
      const len2 = vx * vx + vy * vy || 1e-9;
      let tt = (wx * vx + wy * vy) / len2;
      // generous: allow the fruit to sit a little past either end of this
      // segment, because segments are short and fruit are fat
      const margin = 0.75;
      if (tt < -margin || tt > 1 + margin) continue;

      f.lastStroke = strokeId;
      const at = new THREE.Vector3().copy(f.pos).addScaledVector(plane.n, -d);
      const worldSpeed = sw.speedNdc * _e.distanceTo(f.pos) * 0.55;
      const stroke = new SliceStroke(plane, dir.clone(), worldSpeed, at, sw.t);
      cut(f, stroke);
    }
  }

  function cut(f, stroke) {
    // plane -> fruit local space
    _m.copy(f.mesh.matrixWorld).invert();
    const nLocal = _localPlaneN.copy(stroke.plane.n).transformDirection(_m).normalize();
    const pOnPlane = _p.copy(stroke.plane.n).multiplyScalar(stroke.plane.d).applyMatrix4(_m);
    const localPlane = { n: nLocal.clone(), d: nLocal.dot(pOnPlane) };

    const rind = f.species.id === 'watermelon' ? 0.085 : f.species.id === 'pineapple' ? 0.075 : 0.05;
    let res;
    try { res = cutGeometry(f.mesh.geometry, localPlane, rind); }
    catch (err) { return; }
    if (!res || !res.pos || !res.neg) return;

    const halves = [];
    const sep = clamp(0.7 + stroke.speed * 0.045, 0.8, 3.2);
    for (const [geom, sign] of [[res.pos, +1], [res.neg, -1]]) {
      const off = recenter(geom);
      off.applyQuaternion(f.quat);
      const pos = f.pos.clone().add(off);
      const vel = f.vel.clone()
        .addScaledVector(stroke.plane.n, sign * sep)
        .addScaledVector(stroke.dir, stroke.speed * 0.06);
      const mesh = new THREE.Mesh(geom, f.mesh.material);
      mesh.frustumCulled = false;
      geom.computeBoundingSphere();
      const h = {
        id: nextId(), species: f.species, mesh, pos, vel,
        quat: f.quat.clone(),
        spin: f.spin.clone().multiplyScalar(0.7)
          .addScaledVector(stroke.dir, sign * (1.2 + Math.random() * 1.6)),
        radius: geom.boundingSphere.radius,
        generation: f.generation + 1, dead: false, bornAt: 0, lastStroke: strokeId,
      };
      mesh.position.copy(pos);
      mesh.quaternion.copy(h.quat);
      ctx.fruits.add(h);
      halves.push(h);
    }

    ctx.fruits.remove(f);
    ctx.fruits.noteSlice?.();

    // juice: one burst per exposed face, aimed along the cut normal
    const capR = res.ring
      ? res.ring.reduce((m, p) => Math.max(m, p.length()), 0.2)
      : f.radius * 0.8;
    const amount = f.species.juiciness * (f.generation === 0 ? 1.0 : 0.5)
      * clamp(0.55 + stroke.speed * 0.03, 0.6, 1.5);
    for (const sign of [+1, -1]) {
      ctx.bus.emit('juice', {
        stroke, species: f.species, at: stroke.at.clone(),
        normal: stroke.plane.n.clone().multiplyScalar(sign),
        radius: capR * 0.95, amount, inherit: f.vel.clone().multiplyScalar(0.8),
      });
    }
    ctx.bus.emit('slice', { stroke, fruit: f, halves });
  }

  return api;
}
