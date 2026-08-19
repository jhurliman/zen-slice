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

import { loadPrefs } from '../core/prefs.js';
import { createEngine } from './engine.js';
import { createHarmony } from './harmony.js';
import { createConductor } from './conductor.js';
import {
  renderPianoKit, pianoSample, makeThumpBuffer, makeSwishBank, makeSnickBuffer, SWISH_FOR_LEVEL,
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

  let ctxRef = null, started = false;
  let pianoKit = null, thumpBuf = null, swishBank = null, snickBuf = null;
  let pending = [];            // gathered notes of the current stroke
  let pendingAt = -1;          // engine time of the stroke's first cut
  let lastShimmer = -1e9, lastRiser = -1e9, lastSigh = -1e9, lastSwish = -1e9;
  let lastWatchdog = 0, swishCount = 0;
  // r21: the settings mute. Everything keeps RUNNING (engine, conductor,
  // scheduler) — mute is just the master fader at 0, so unmute is instant.
  let soundOn = loadPrefs().sound !== false;
  const masterLevel = () => (soundOn ? 0.85 : 0);
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
    if (started) {
      // r18: the gesture listeners stay attached FOREVER, and after first
      // unlock every tap becomes a resume retry. iOS rejects resume() outside
      // a gesture (backgrounding, interruptions, a phone call), so this is
      // the one path guaranteed to be able to bring audio back.
      if (engine.actx.state !== 'running') engine.resume();
      return;
    }
    started = true;
    engine.resume();
    engine.setMaster(masterLevel(), 0.25);   // audible within ~0.5 s, not ~2.5
    thumpBuf = makeThumpBuffer(engine.actx);
    swishBank = makeSwishBank(engine.actx);
    snickBuf = makeSnickBuffer(engine.actx);
    conductor.start(playNote);
    conductor.setCaps(caps);
    engine.setPianoCap(caps.voices);
    engine.setWetScale(caps.wet);
    // r18: the piano render WAITS 1.5 s. Firing ten OfflineAudioContext
    // renders at the exact moment the live context starts starved the media
    // thread on the phone — measured as "15+ seconds before any audio". The
    // pluck fallback covers the gap; the kit lands quietly a few seconds in.
    setTimeout(() => {
      renderPianoKit().then((kit) => { pianoKit = kit; }).catch(fail);
    }, 1500);
  }
  api.unlock = unlock;   // harness path: no real gesture ever fires

  api.init = (c) => {
    ctxRef = c;
    // permanent — see unlock(): after first use these are the resume path
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
      window.addEventListener(ev, unlock, { passive: true }));

    document.addEventListener('visibilitychange', guard(() => {
      if (!started) return;
      if (document.hidden) {
        // mute only — NEVER self-suspend. iOS suspends the context itself on
        // background, and our own suspend() + a gesture-less resume() was the
        // "audio is gone when I come back" bug: the resume was rejected and
        // nothing retried. Let the OS own the context; we own the fader.
        engine.setMaster(0, 0.05);
      } else {
        engine.resume();
        engine.setMaster(masterLevel(), 0.4);
      }
    }));

    c.bus.on('pref', guard((e) => {
      if (e.key !== 'sound') return;
      soundOn = !!e.value;
      if (started) engine.setMaster(masterLevel(), 0.1);
    }));

    c.bus.on('slice', guard(onSlice));
    c.bus.on('rockhit', guard(onRockHit));
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

    // ── immediate: the cut and the weight ──
    // The swish is per STROKE, not per fruit (r18): pending.length === 1
    // below means this is the stroke's first cut, and a hard 120 ms floor
    // stops even separate rapid strokes from clattering. The recipe follows
    // the level — a breath at dawn, rain grains in the orchard, dry leaves
    // at dusk — so the cut is part of the scenery, not an effect on top.
    if (pending.length === 0 && t - lastSwish > 0.12) {
      lastSwish = t;
      swishCount++;
      const recipe = swishBank[SWISH_FOR_LEVEL[harmony.level()]] || swishBank.wind;
      engine.playSwish(recipe[(Math.random() * recipe.length) | 0],
        0.92 + v * 0.22 + Math.random() * 0.08,
        t, 0.14 + v * 0.12, 1100 + v * 2400, pan);
    }
    // the CONTACT — the SNICK (r22): per fruit, unconditional, at the exact
    // cut instant, loud enough to BE the slice sound. The swish is air behind
    // it, the piano waits out the chord gather; this owns the first frame.
    // Heavy fruit snick lower via playbackRate.
    engine.playThump(snickBuf, Math.min(1.22, Math.max(0.8, 1.25 - mass * 0.12)),
      t, 0.16 + v * 0.14);
    // the wet weight under it
    engine.playThump(thumpBuf, Math.min(2.2, Math.max(0.8, 0.8 + 0.5 / mass)),
      t, 0.10 * Math.min(1.4, mass * 0.5));

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
      // the top three of a chord (by PITCH, not strum position — a descending
      // roll's last notes are its lowest) come back as the answer; a full
      // five-note echo would be a blob, not a phrase
      const byPitch = pending.map((_, i) => i).sort((a, b) => semis[b] - semis[a]);
      const echoes = new Set(byPitch.slice(0, 3));
      // r18: chords land FULLER than single notes — a combo is the game's
      // reward moment and the player asked for "a touch more oomph"
      const boost = Math.min(1.35, 1.1 + 0.07 * n);
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const p = pending[i];
        const taper = 1 - k * 0.04;
        const bv = Math.min(1, p.v * boost) * taper;
        playNote(semis[i], bv, panOf(p.x), t + k * STRUM, brightOf(bv), wetOf(p.y));
        if (echoes.has(i)) conductor.echo(semis[i], p.v * taper, panOf(p.x));
      }
      // 3+ fruit: reinforce the chord's foundation an octave under its lowest
      // voice — body, not mud (the low register stays wide by voicing law).
      // SKIPPED when the octave leaves the kit's span: clamping a pitch
      // transposes it to a different note (an A1 bottom would gain a G#),
      // which is an off-chord semitone at the exact reward moment.
      if (n >= 3) {
        const sub = semis[byPitch[byPitch.length - 1]] - 12;
        if (sub >= -25) playNote(sub, Math.min(1, pending[0].v * boost) * 0.5, 0, t, 900, 0.45);
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

  /**
   * The rock (r20): the one deliberately unmusical sound in the game. A dead,
   * heavy thud (the thump buffer pitched way down) and a low dissonant
   * cluster — the current chord root smeared against its minor 2nd and
   * tritone, dark and quick. No swish, no tick, no echo, no heat: the world
   * does not celebrate a mistake, it just… clunks.
   */
  function onRockHit(e) {
    if (!engine.ready || !api.enabled) return;
    const t = engine.now();
    engine.playThump(thumpBuf, 0.55, t, 0.24);
    let root;
    try { root = harmony.noteFor('watermelon', 0) + 12; } catch (_) { root = -12; }
    playNote(root, 0.5, 0, t, 900, 0.3);
    playNote(root + 1, 0.42, -0.15, t + 0.015, 800, 0.3);
    playNote(root + 6, 0.36, 0.15, t + 0.03, 800, 0.3);
  }

  function onSpawn(e) {
    if (!started || !api.enabled) return;
    if (e.fruit.species.noCut) return;   // a riser promises reward; rocks aren't one
    const t = engine.now();
    if (conductor.intensity >= 0.5 || t - lastRiser < 1.2) return;
    lastRiser = t;
    playRiser(engine, e.fruit.vel.y / 14);   // apex = v_y / |GRAVITY|
  }

  function onExpire(e) {
    if (!started || !api.enabled || e.reason !== 'missed') return;
    if (e.fruit.species.noCut) return;   // letting a rock fall IS the correct play — no regret sigh
    const t = engine.now();
    if (t - lastSigh < 2.0) return;
    lastSigh = t;
    playSigh(engine, harmony.noteFor('apple', 0));
  }

  api.frame = (dt) => {
    if (!started || !api.enabled) return;
    try {
      // watchdog (r18, ~1 Hz): a context that should be running but is not —
      // an OS interruption ended, a rejected resume — gets nudged every
      // second while the page is visible. Combined with the permanent
      // gesture listeners this is why "audio never comes back" cannot recur.
      lastWatchdog += dt;
      if (lastWatchdog > 1) {
        lastWatchdog = 0;
        if (!document.hidden && engine.actx && engine.actx.state !== 'running') engine.resume();
      }
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
    muted: !soundOn,
    actxState: engine.actx ? engine.actx.state : 'none',
    // hardware truth for the latency conversation: seconds from "we scheduled
    // it" to "the speaker moves". Read these off the device via ?debug.
    baseLatency: engine.actx?.baseLatency ?? null,
    outputLatency: engine.actx?.outputLatency ?? null,
    bpm: Math.round(conductor.bpm * 10) / 10,
    chord: harmony.chordName(),
    level: harmony.level(),
    levelPending: harmony.levelPending(),
    intensity: Math.round(conductor.intensity * 100) / 100,
    bloom: Math.round(conductor.bloom * 100) / 100,
    voicesActive: engine.ready ? engine.voicesActive() : 0,
    nodesCreated: engine.nodesCreated,
    pending: pending.length,
    voiceDebug: engine.ready ? engine.voiceDebug() : [],
    swishes: swishCount,
    errors: api.errors,
  });

  api.dispose = () => { engine.dispose(); };

  return api;
}
