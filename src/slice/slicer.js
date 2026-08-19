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
  // r19: cuts deferred out of the pointer handler. See the block in onSwipe.
  const pending = [];
  let cutsThisTick = 0;

  const _e = new THREE.Vector3();       // eye
  const _ra = new THREE.Vector3(), _rb = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3(), _q = new THREE.Vector3();
  const _screen = new THREE.Vector3();
  const _localPlaneN = new THREE.Vector3();
  const _m = new THREE.Matrix4();

  /** Drain at most ONE queued cut per RENDERED FRAME, and reopen the budget for
   *  the next one.
   *
   *  ⚠ THIS MUST BE `frame`, NOT `fixed`, AND THE DIFFERENCE IS THE WHOLE POINT.
   *  `main.js` runs `fixed` inside an accumulator loop, up to MAX_SUBSTEPS = 4
   *  times per rendered tick — twice on a 60 Hz display as a matter of course,
   *  and up to four times while recovering from a stall. Draining there reopened
   *  the allowance on every substep, so ONE frame could perform 2-4 cuts and
   *  re-concentrate exactly the work this queue exists to spread — and it did so
   *  hardest during stall recovery, i.e. it made a bad frame worse. Caught in
   *  review. `frame` runs exactly once per rendered tick, which is the unit the
   *  budget is actually denominated in.
   *
   *  Running after `fluid.frame` costs nothing visible: `api.burst` writes and
   *  flushes the droplet attributes synchronously, and `stage.render` runs after
   *  every module's `frame`, so a cut made here still draws this frame. Only the
   *  turbulence compute for those droplets starts one tick later.
   *
   *  A fruit that died or was already re-cut while queued is dropped. */
  api.frame = () => {
    cutsThisTick = 0;
    while (pending.length) {
      const job = pending.shift();
      if (!job.f || job.f.dead) continue;          // died in flight; nothing to cut
      cutsThisTick++;
      cut(job.f, job.stroke);
      break;
    }
  };

  api.init = (c) => {
    ctx = c;
    c.renderer.domElement.addEventListener('pointerdown', () => { strokeId++; });
    c.bus.on('reset', () => { pending.length = 0; cutsThisTick = 0; });
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

    // ══ r12: `worldSpeed` HAD NO ASPECT TERM, AND PORTRAIT IS THE ORIENTATION ══
    // ══      HE PLAYS IN.                                                     ══
    // `speedNdc` is `hypot(dx, dy)/dt` in NDC, where x and y are EACH mapped to
    // [-1,1] over the viewport. One ndc-x is therefore a different number of
    // world units from one ndc-y unless the aspect ratio is 1, and this line
    // used to be `sw.speedNdc * dist * 0.55` — a single magic factor with the
    // aspect ratio simply absent from it.
    //
    // MEASURED ON THE LIVE BUS (tools/.r12speed.mjs instruments `bus.on('juice')`
    // and reads `stroke.speed` back), the identical harness gesture:
    //     gesture (ndc/s)   landscape S   portrait S    ratio
    //     slow cleave 1.2         6.72        14.54     2.16x
    //     melon cut   5.0        28.01        60.60     2.16x
    //     fast flick 14.0        78.42       169.67     2.16x
    // The correct horizontal conversion is `dist * tan(fov/2) * aspect`, which is
    // just the visible HALF-WIDTH at that depth: 6.933 landscape, 3.900 portrait.
    // So portrait should read 0.56x landscape for the same finger movement — the
    // frame is NARROWER, the blade covers less world — and it read 2.16x instead.
    // The shipped factor is 3.11x too high in portrait and 0.81x too low in
    // landscape; the two orientations were 3.85x apart on the same gesture.
    //
    // WHAT THAT DID, and it is the player's note: `fluid.js` gates its whole
    // spray/blob morphology on `fast = clamp((S-18)/62, 0, 1)`. In portrait an
    // ORDINARY melon cut read S = 60.6, i.e. fast = 0.687, and anything brisker
    // saturated at 1.0 — so `filmness` was 0, the sheet never fired, the rim
    // beads collapsed to the 5% floor and every cut on his phone was aerosol.
    // Measured spray share of on-screen juice AREA for the same 5 ndc/s cut:
    // landscape 17.3%, PORTRAIT 63.4% (tools/.r12mix.mjs). "We should always
    // show some combination of both with each hit" is this line.
    //
    // Exact, and it costs one hypot per swipe rather than one per fruit: project
    // the ndc delta onto the two world axes and take its length, then normalise
    // by the ndc length so `speedNdc * dist * axisScale` stays the shape of the
    // original expression.
    const dnx = sw.b.x - sw.a.x, dny = sw.b.y - sw.a.y;
    const dnLen = Math.hypot(dnx, dny) || 1e-9;
    const asp = cam.aspect || 1.7778;
    const axisScale = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5)
      * Math.hypot(dnx * asp, dny) / dnLen;

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
      const worldSpeed = sw.speedNdc * _e.distanceTo(f.pos) * axisScale;
      const stroke = new SliceStroke(plane, dir.clone(), worldSpeed, at, sw.t);
      // ══ r20: ROCKS DON'T CUT ═════════════════════════════════════════════
      // A noCut body (the river stone) takes the same hit test but never
      // reaches cut(): the blade shoves it a little (external pos/vel/spin
      // mutation is authoritative over Rapier — physics.js header), and one
      // 'rockhit' fires per stroke (lastStroke is already stamped above).
      // Everything downstream of cut() — juice, slice, noteSlice — is
      // skipped wholesale, so a rock never advances levels or sprays.
      if (f.species.noCut) {
        f.vel.addScaledVector(stroke.dir, clamp(worldSpeed * 0.012, 0.2, 1.2));
        f.spin.addScaledVector(plane.n, 0.9);
        ctx.bus.emit('rockhit', { stroke, rock: f, at });
        continue;
      }
      // ══ r19: ONE CUT PER FRAME. THE REST ARE QUEUED. ═════════════════════
      // Measured (tools/perfprofile.mjs): one cut costs ~3.1 ms at p50 and
      // 7.5 ms at max, and this loop ran ALL of a stroke's cuts back-to-back —
      // inside a pointermove handler, outside the animation frame, where a
      // 120 Hz frame budget is 8.3 ms. A swipe across three fruit therefore
      // spent p95 11.2 ms and up to 22.1 ms in one go, which is two to three
      // dropped frames at exactly the moment the player is looking. That is
      // "we lag or skip frames here and there".
      //
      // The frame loop itself was never the problem: p99 0.8 ms against 8.3.
      // So this is not a matter of shaving constants, it is that N cuts were
      // being charged to one frame. The first cut still happens IMMEDIATELY —
      // the fruit under the blade must split on contact or the game feels
      // broken — and any further fruit on the same stroke are queued and taken
      // one per fixed step, i.e. 8.3 ms later each. `f.lastStroke` is already
      // set above, so a queued fruit cannot be re-cut by the same stroke, and
      // it keeps flying normally until its turn.
      if (cutsThisTick === 0) { cutsThisTick++; cut(f, stroke); }
      else pending.push({ f, stroke });
    }
  }

  function cut(f, stroke) {
    // plane -> fruit local space
    _m.copy(f.mesh.matrixWorld).invert();
    const nLocal = _localPlaneN.copy(stroke.plane.n).transformDirection(_m).normalize();
    const pOnPlane = _p.copy(stroke.plane.n).multiplyScalar(stroke.plane.d).applyMatrix4(_m);
    const localPlane = { n: nLocal.clone(), d: nLocal.dot(pOnPlane) };

    const rind = f.species.id === 'watermelon' ? 0.085 : f.species.id === 'pineapple' ? 0.075 : 0.05;
    // r19: opt-in stage timing. The cut runs in a POINTER HANDLER, outside the
    // animation frame, so none of it appears in a per-module frame profiler —
    // and it is the most expensive thing in the game. Off unless armed.
    const CP = ctx.__zsCutProf;
    const t0 = CP ? performance.now() : 0;
    let res;
    try { res = cutGeometry(f.mesh.geometry, localPlane, rind); }
    catch (err) { return; }
    if (CP) CP.geom.push(performance.now() - t0);
    if (!res || !res.pos || !res.neg) return;

    const halves = [];
    // ══ r14: THE CUT WAS THROWING THE HALVES OFF SCREEN ══════════════════════
    // THE PLAYER, 2026-08-18: "too much force is being applied to the fruit
    // parts when I swipe and cut them. I want a little but right now a swipe is
    // sending the two parts flying off screen."
    //
    // Three terms push the halves and ALL THREE scale with stroke speed, so
    // they compound: this separation impulse along the cut normal, the lateral
    // kick along the blade below, and the spin. On top of that r11 put the
    // halves on Rapier bodies, which no longer damp the way the old ad-hoc
    // integrator did, and r12's aspect fix changed what `stroke.speed` even
    // reads. Nobody re-checked the constants after either change.
    //
    // `0.7 + S*0.045` clamped at 3.2 saturates at S = 55.6 — i.e. an ordinary
    // swipe was pinned at the CEILING, and every swipe above that felt
    // identical and maximal. The new law reaches its ceiling at S = 103, which
    // is a hard flick, so the whole ordinary range is now expressive instead of
    // clipped. Peak separation impulse is more than halved (3.2 -> 1.45).
    // He asked for "a little", not none: the floor is unchanged in spirit, a
    // cleave still opens.
    const sep = clamp(0.45 + stroke.speed * 0.0097, 0.5, 1.45);
    for (const [geom, sign] of [[res.pos, +1], [res.neg, -1]]) {
      const off = recenter(geom);
      off.applyQuaternion(f.quat);
      const pos = f.pos.clone().add(off);
      const vel = f.vel.clone()
        .addScaledVector(stroke.plane.n, sign * sep)
        // the lateral kick along the blade. At r12's corrected speeds a 14 ndc/s
        // flick is S ~ 97, so 0.06 was adding 5.8 units/s of sideways travel to
        // a half on a playfield whose visible half-width is 3.90 in portrait —
        // it cleared the frame in well under a second on its own, before the
        // separation impulse or gravity did anything. 0.021 puts that at
        // 2.0 units/s, which reads as "the blade shoved it" and still leaves
        // the arc legible.
        .addScaledVector(stroke.dir, stroke.speed * 0.021);
      const mesh = new THREE.Mesh(geom, f.mesh.material);
      mesh.frustumCulled = false;
      // r19: `recenter` now leaves an EXACT bounding sphere centred on the
      // origin, so this recompute was a third full pass over the geometry on
      // the cut path for a value it already had.
      const h = {
        id: nextId(), species: f.species, mesh, pos, vel,
        quat: f.quat.clone(),
        // Tumble reads as force too, and it was the third term nobody counted.
        // 1.2..2.8 rad/s on a half that is only on screen for a second is more
        // than a full rotation before it lands — which makes the cut FACE, the
        // one thing r10 spent a round on, face away for most of its flight.
        spin: f.spin.clone().multiplyScalar(0.7)
          .addScaledVector(stroke.dir, sign * (0.55 + Math.random() * 0.85)),
        radius: geom.boundingSphere.radius,
        generation: f.generation + 1, dead: false, bornAt: 0, lastStroke: strokeId,
      };
      mesh.position.copy(pos);
      mesh.quaternion.copy(h.quat);
      ctx.fruits.add(h);
      halves.push(h);
    }

    if (CP) CP.halves.push(performance.now() - t0);
    ctx.fruits.remove(f);
    ctx.fruits.noteSlice?.();

    // juice: one burst per exposed face, aimed along the cut normal
    const capR = res.ring
      ? res.ring.reduce((m, p) => Math.max(m, p.length()), 0.2)
      : f.radius * 0.8;
    const amount = f.species.juiciness * (f.generation === 0 ? 1.0 : 0.5)
      * clamp(0.55 + stroke.speed * 0.03, 0.6, 1.5);
    // ══ r14b: `faceVel` — STOP fluid.js RE-DERIVING THIS FROM THE CONSTANTS ══
    // The `cling` class is foam sitting ON a cut face, so it has to travel with
    // the half that carries that face. It was riding a SECOND COPY of the
    // launch arithmetic, written out again in fluid.js against `stroke.speed`:
    //     const sep = cl(0.7 + S*0.045, 0.8, 3.2);
    //     _j.copy(B.inh).addScaledVector(B.N, -sep*0.5).addScaledVector(B.D, S*0.05);
    // Review caught the consequence the moment this round retuned the kick:
    // fluid.js still launched cling at `0.05*S` while the half moved at
    // `0.021*S`, which at a flick is ~2.8 units/s of relative motion — about a
    // world unit of drift over cling's 0.345 s life, i.e. the foam detaching
    // from the face and outrunning the fruit.
    //
    // Re-syncing the two copies would fix this instance and guarantee the next
    // one. The halves' velocities EXIST here, three lines up, and the bus
    // payload is the contract between these two files — so send the real thing
    // and delete the duplicate. `halves` is built in the [+1, -1] order this
    // loop uses, so index i is the half whose exposed face this burst is on.
    // This is the r3 lesson (`geometry.js` encoded a contract in a comment and
    // `species.js` did not honour it) with the fix applied for once.
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? +1 : -1;
      ctx.bus.emit('juice', {
        stroke, species: f.species, at: stroke.at.clone(),
        normal: stroke.plane.n.clone().multiplyScalar(sign),
        // ⚠ THE OPPOSITE HALF, AND cutter.js SAYS SO IN SO MANY WORDS:
        // `addCap` is documented "`sign` = +1 for the positive half (its face
        // points along -plane.n)", and builds the cap normal as `-sign * n`.
        // So the face whose outward normal is +n belongs to the NEGATIVE half.
        // This burst is aimed along `+n` at i = 0, so its foam rides halves[1].
        // I had it as halves[i], which gave every cling burst the velocity of
        // the half on the far side of the cut — foam moving AWAY from the face
        // it is painted on, which is the bug this payload was added to fix,
        // reintroduced by the same commit. Caught in review.
        faceVel: halves[1 - i] ? halves[1 - i].vel.clone() : null,
        radius: capR * 0.95, amount, inherit: f.vel.clone().multiplyScalar(0.8),
      });
    }
    if (CP) CP.juice.push(performance.now() - t0);
    // r19: mark the frame so the profiler can separate CUT frames from
    // steady-state. Averaging a cut into the steady-state is exactly how a
    // spike disappears into a good-looking mean.
    ctx.__zsCutThisFrame = true;
    // r22: strokeId comes from f.lastStroke, which was stamped AT HIT TIME —
    // the module-level counter may have advanced by the time a queued cut
    // drains, so this is the only value that correctly groups a stroke's cuts.
    // score.js gathers slices by it into the HARMONY (one stroke, one chord).
    ctx.bus.emit('slice', { stroke, fruit: f, halves, strokeId: f.lastStroke });
  }

  return api;
}
