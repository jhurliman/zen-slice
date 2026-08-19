/**
 * audio.js — the generative music system's orchestrator. Entirely procedural
 * WebAudio: no files, no loading, no licensing. The parts live next door —
 * engine.js (plumbing: master chain, reverb, voice pools), harmony.js (the
 * harmonic field: what notes exist right now), instruments.js (how each sound
 * is made), conductor.js (tempo inference, chord clock, background layers).
 * This file is the only one on the bus.
 *
 * ── The architecture in one paragraph ───────────────────────────────────────
 * Foreground sounds are IMMEDIATE: the noise "shhk" and the mass thump fire
 * per fruit at the instant of the cut, and the piano is held only long enough
 * to gather one stroke into one chord (below). Cohesion comes from harmony,
 * not quantization — every pitched voice draws from the shared harmonic
 * field, so the player can never play a wrong note. Background layers (pad,
 * bass pulse, arp sparkle) ARE grid-quantized, but the grid's tempo is
 * inferred from the player's own slicing cadence: the music follows the
 * player, never the reverse, and no note is ever delayed to fit a beat.
 *
 * ── The chord gather (multi-fruit combos) ───────────────────────────────────
 * One swipe through three fruit is three 'slice' events — same tick if the
 * segment crosses them together, tens of ms apart when the blade travels
 * between them. Either way it is ONE musical gesture: piano notes are pooled
 * for CHORD_GATHER seconds from the first cut of a stroke, then voiced as a
 * single rolled chord — strummed in fruit x-order, roll direction from the
 * swipe, each note panned to its fruit. The shhk under it is instant, so the
 * gather reads as "cut… then the fruit sings", not as latency.
 *
 * iOS: the context is created suspended and resumed on the first gesture;
 * visibilitychange suspends/resumes so an interruption never leaves a stuck
 * context. A throw in any handler is caught and logged to api.errors — the
 * safe() wrapper in main.js would otherwise retire audio for the session.
 */

import { createEngine } from './engine.js';
import { createHarmony } from './harmony.js';
import { createConductor } from './conductor.js';
import {
  renderPianoKit, pianoSample, makeThumpBuffer, makeSwishBank,
  playPluck, playRiser, playSigh, playBloom,
} from './instruments.js';

const CHORD_GATHER = 0.08;  // s from first cut of a stroke to the chord (blade travel time)
const STRUM = 0.028;        // s between rolled chord notes
const MAX_ERRORS = 20;

export function createAudio() {
  const api = { enabled: true, errors: [] };
  const engine = createEngine();
  const harmony = createHarmony();
  const conductor = createConductor(engine, harmony);

  let ctxRef = null, started = false, unlockers = null;
  let pianoKit = null, thumpBuf = null, swishBank = null;
  let pending = [];            // gathered notes of the current stroke
  let pendingAt = -1;          // engine time of the stroke's first cut
  let lastShimmer = -1e9, lastRiser = -1e9, lastSigh = -1e9;
  let caps = { background: true, arps: true, voices: 16, wet: 1.0 };

  const nosound = (() => {
    try {
      const q = new URLSearchParams((typeof location !== 'undefined' ? location.search : '') || '');
      return q.has('nosound') && q.get('nosound') !== '0';
    } catch (_) { return false; }
  })();

  function fail(err) {
    if (api.errors.length >= MAX_ERRORS) api.errors.shift();
    api.errors.push(String(err && err.stack ? err.stack : err).slice(0, 300));
  }
  const guard = (fn) => (e) => { try { fn(e); } catch (err) { fail(err); } };

  /** velocity law over the MEASURED stroke.speed range (~5 slow … ~170 flick).
   *  The old /18 was saturated for every ordinary cut; log spreads the whole
   *  expressive range instead. */
  const vel = (speed) => Math.min(1, Math.max(0, Math.log(Math.max(1e-3, speed / 5)) / Math.log(34)));
  const panOf = (x) => Math.max(-1, Math.min(1, x / 4.4)) * 0.7;
  const brightOf = (v) => 1200 * Math.pow(7000 / 1200, v);

  /** Every pitched note goes through here — piano when the kit has rendered,
   *  the old pluck until then. Also handed to the conductor for bass/arps. */
  function playNote(semis, v, pan, when, brightHz, wet) {
    if (pianoKit) {
      const s = pianoSample(pianoKit, semis);
      engine.playPiano(s.buffer, s.rate, when, 0.55 * (0.3 + 0.7 * v), pan,
        brightHz ?? brightOf(v), wet);
    } else {
      playPluck(engine, semis, v, pan, when);
    }
  }

  function unlock() {
    if (nosound) return;
    if (!engine.ensure()) { api.enabled = false; return; }
    if (started) return;
    started = true;
    engine.resume();
    engine.setMaster(0.85, 0.8);
    thumpBuf = makeThumpBuffer(engine.actx);
    swishBank = makeSwishBank(engine.actx);
    conductor.start(playNote);
    conductor.setCaps(caps);
    engine.setPianoCap(caps.voices);
    engine.setWetScale(caps.wet);
    // renders off the main thread; slices use the pluck until it lands
    renderPianoKit(engine.actx.sampleRate)
      .then((kit) => { pianoKit = kit; })
      .catch(fail);
    if (unlockers) { unlockers(); unlockers = null; }
  }
  api.unlock = unlock;   // harness path: no real gesture ever fires

  api.init = (c) => {
    ctxRef = c;
    const evs = ['pointerdown', 'touchstart', 'keydown'];
    evs.forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
    unlockers = () => evs.forEach((ev) => window.removeEventListener(ev, unlock));

    document.addEventListener('visibilitychange', guard(() => {
      if (!started) return;
      if (document.hidden) { engine.setMaster(0, 0.05); engine.suspend(); }
      else { engine.resume(); engine.setMaster(0.85, 0.8); }
    }));

    c.bus.on('slice', guard(onSlice));
    c.bus.on('combo', guard(onCombo));
    c.bus.on('spawn', guard(onSpawn));
    c.bus.on('expire', guard(onExpire));
    c.bus.on('level', guard((e) => conductor.setLevel(e.level)));
    c.bus.on('reset', guard(() => {
      pending.length = 0; pendingAt = -1;
      conductor.reset();
    }));
  };

  function onSlice(e) {
    if (!engine.ready || !api.enabled) return;
    const t = engine.now();
    const v = vel(e.stroke.speed);
    const pan = panOf(e.fruit.pos.x);
    const mass = e.fruit.species.mass;
    const wasIdle = conductor.isIdle();

    // ── immediate, per fruit: the cut and the weight ──
    engine.playSwish(swishBank[(Math.random() * swishBank.length) | 0],
      0.92 + v * 0.25 + Math.random() * 0.08,
      t, 0.24 + v * 0.2, 900 + v * 2200, pan);
    engine.playThump(thumpBuf, Math.min(2.2, Math.max(0.8, 0.8 + 0.5 / mass)),
      t, 0.16 * Math.min(1.4, mass * 0.5));

    conductor.onSlice();

    // ── gathered: the note. combo is already incremented (audio runs last),
    //    so combo-1 is this cut's climb up the chord. ──
    const combo = ctxRef.score?.combo ?? 1;
    pending.push({
      id: e.fruit.species.id, pitch: e.fruit.species.pitch,
      x: e.fruit.pos.x, y: e.fruit.pos.y,
      v, dirY: e.stroke.dir.y, climb: Math.max(0, combo - 1), combo,
    });
    if (pending.length === 1) pendingAt = t;

    // silence broken: the first note back blooms
    if (wasIdle) playBloom(engine, harmony.noteFor('orange', 0), t);
  }

  /** Voice and play everything the stroke gathered. */
  function flush() {
    const n = pending.length;
    const t = engine.now();

    let semis;
    try {
      semis = n === 1
        ? [harmony.noteFor(pending[0].id, pending[0].climb)]
        : harmony.voiceChord(pending);
    } catch (err) {
      fail(err);
      semis = pending.map((p) => harmony.fallbackPitch(p.pitch, p.combo));
    }

    if (n === 1) {
      const p = pending[0];
      playNote(semis[0], p.v, panOf(p.x), t, brightOf(p.v), wetOf(p.y));
      conductor.echo(semis[0], p.v, panOf(p.x));
    } else {
      // strum in fruit x-order; an up-swipe rolls ascending, down descending
      const order = pending.map((_, i) => i);
      const d = pending[0].dirY;
      if (Math.abs(d) > 0.5) order.sort((a, b) => (semis[a] - semis[b]) * Math.sign(d));
      else order.sort((a, b) => pending[a].x - pending[b].x);
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const p = pending[i];
        const taper = 1 - k * 0.06;
        playNote(semis[i], p.v * taper, panOf(p.x), t + k * STRUM, brightOf(p.v), wetOf(p.y));
        // the top three of a chord come back as the answer — a full 5-note
        // echo would be a blob, not a phrase
        if (k >= order.length - 3) conductor.echo(semis[i], p.v * taper, panOf(p.x));
      }
      // five and up earns the harp flourish
      if (n >= 5) {
        const gliss = harmony.glissNotes();
        for (let k = 0; k < gliss.length; k++) {
          playNote(gliss[k], 0.22, (k / gliss.length - 0.5) * 0.8,
            t + 0.08 + order.length * STRUM + k * 0.045, 4200, 0.85);
        }
      }
    }
    pending.length = 0; pendingAt = -1;
  }

  const wetOf = (y) => 0.35 + Math.max(0, Math.min(1, (y + 4) / 8)) * 0.4;

  function onCombo(e) {
    if (!engine.ready || !api.enabled) return;
    if (e.peak) conductor.onComboPeak();
    const t = engine.now();
    if (e.count >= 3 && t - lastShimmer > 0.8) {
      lastShimmer = t;
      const a = harmony.noteFor('kiwi', 2);
      const b = harmony.noteFor('strawberry', 1);
      playNote(a, 0.18, -0.3, t + 0.05, 3800, 0.85);
      playNote(b, 0.15, 0.3, t + 0.11, 3800, 0.85);
    }
  }

  function onSpawn(e) {
    if (!started || !api.enabled) return;
    const t = engine.now();
    if (conductor.intensity >= 0.5 || t - lastRiser < 1.2) return;
    lastRiser = t;
    playRiser(engine, e.fruit.vel.y / 14);   // apex = v_y / |GRAVITY|
  }

  function onExpire(e) {
    if (!started || !api.enabled || e.reason !== 'missed') return;
    const t = engine.now();
    if (t - lastSigh < 2.0) return;
    lastSigh = t;
    playSigh(engine, harmony.noteFor('apple', 0));
  }

  api.frame = (dt) => {
    if (!started || !api.enabled) return;
    try {
      conductor.frame(dt);
      if (pendingAt >= 0 && engine.now() - pendingAt >= CHORD_GATHER) flush();
    } catch (err) { fail(err); }
  };

  api.quality = (q) => {
    caps = q.tier <= 0
      ? { background: false, arps: false, voices: 8, wet: 0.5 }
      : q.tier === 1
        ? { background: true, arps: false, voices: 12, wet: 0.8 }
        : { background: true, arps: true, voices: 16, wet: 1.0 };
    if (!started) return;
    conductor.setCaps(caps);
    engine.setPianoCap(caps.voices);
    engine.setWetScale(caps.wet);
  };

  /** Harness surface (ZS.audio) — sound made assertable without ears. */
  api.state = () => ({
    started, pianoReady: !!pianoKit,
    actxState: engine.actx ? engine.actx.state : 'none',
    bpm: Math.round(conductor.bpm * 10) / 10,
    chord: harmony.chordName(),
    level: harmony.level(),
    levelPending: harmony.levelPending(),
    intensity: Math.round(conductor.intensity * 100) / 100,
    bloom: Math.round(conductor.bloom * 100) / 100,
    voicesActive: engine.ready ? engine.voicesActive() : 0,
    nodesCreated: engine.nodesCreated,
    pending: pending.length,
    errors: api.errors,
  });

  api.dispose = () => { engine.dispose(); };

  return api;
}
