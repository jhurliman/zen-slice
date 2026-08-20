/**
 * audio.js — the generative music system's orchestrator. Entirely procedural
 * WebAudio: no files, no loading, no licensing. The parts live next door —
 * engine.js (plumbing: master chain, reverb, voice pools), harmony.js (the
 * harmonic field: what notes exist right now), instruments.js (how each sound
 * is made), conductor.js (tempo inference, chord clock, background layers).
 * This file is the only one on the bus.
 *
 * ── The architecture in one paragraph ───────────────────────────────────────
 * The cut IS the note (r23): the first fruit of a stroke plays its piano
 * note at the instant of contact — zero hold — with only a breath of air
 * (the swish) beside it; r25 removed the last slice percussion (the mass
 * thump). The player is painting on the audio canvas, not triggering pads. Cohesion comes from harmony, not
 * quantization — every pitched voice draws from the shared harmonic field,
 * so the player can never play a wrong note. Background layers (pad, bass
 * pulse, arp sparkle) ARE grid-quantized, but the grid's tempo is inferred
 * from the player's own slicing cadence: the music follows the player,
 * never the reverse, and no note is ever delayed to fit a beat.
 *
 * ── The chord gather (multi-fruit strokes) ──────────────────────────────────
 * One swipe through three fruit is three 'slice' events — same tick if the
 * segment crosses them together, tens of ms apart when the blade travels
 * between them. It is ONE musical gesture, and its first note must not
 * wait: the first cut sounds immediately, and the gather window collects
 * only the REST of the stroke, voiced AROUND that already-sounding pitch
 * (harmony.voiceAround) and rolled in behind it — strummed in fruit
 * x-order, roll direction from the swipe, each note panned to its fruit.
 * So a stroke reads as "the fruit sings, then blooms into a chord" — the
 * old 80 ms hold before ANY pitch was the last audible latency.
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
  renderPianoKit, pianoSample, makeThumpBuffer, makeSwishBank, SWISH_FOR_LEVEL,
  playPluck, playRiser, playSigh, playBloom,
} from './instruments.js';

const CHORD_GATHER = 0.08;  // s to gather a stroke's LATER cuts (first note is immediate)
const STRUM = 0.028;        // s between rolled chord notes
const MAX_ERRORS = 20;

export function createAudio() {
  const api = { enabled: true, errors: [] };
  const engine = createEngine();
  const harmony = createHarmony();
  const conductor = createConductor(engine, harmony);

  let ctxRef = null, started = false;
  let pianoKit = null, thumpBuf = null, swishBank = null;
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
    const wasIdle = conductor.isIdle();

    // ── immediate: the air of the cut ──
    // The swish is per STROKE, not per fruit (r18): pending.length === 1
    // below means this is the stroke's first cut, and a hard 120 ms floor
    // stops even separate rapid strokes from clattering. The recipe follows
    // the level — a dark breath at dawn, brighter air at first light, dew
    // mist, dusk air — so the cut is part of the scenery, never percussion.
    if (pending.length === 0 && t - lastSwish > 0.12) {
      lastSwish = t;
      swishCount++;
      const recipe = swishBank[SWISH_FOR_LEVEL[harmony.level()]] || swishBank.air;
      engine.playSwish(recipe[(Math.random() * recipe.length) | 0],
        0.92 + v * 0.22 + Math.random() * 0.08,
        t, 0.12 + v * 0.10, 1100 + v * 2400, pan);
    }
    // r25: the mass thump is GONE from the slice. r23 already tamed it, and
    // the player still heard "some sort of muffled crunchy sound with a
    // delay" — that was this: a pitched-up sine drop (up to 2.2× rate on
    // small fruit) whose low tail blooms tens of ms after the piano's onset,
    // reading as a delayed muffled knock on a phone speaker. A slice is now
    // exactly two sounds — air and the note. The thump buffer survives only
    // as the rock's knuckle of contact (onRockHit).

    conductor.onSlice();

    // ── the note — IMMEDIATE on the stroke's first cut (r23) ──
    // "As soon as my blade comes into contact with fruit … in that first
    // frame is when I want to hear the immediate feedback slice sound."
    // The first note sounds AT CONTACT and its pitch is fixed; the gather
    // window collects only the stroke's later cuts, voiced around it at
    // flush. combo is already incremented (audio runs last), so combo-1 is
    // this cut's climb up the chord.
    const combo = ctxRef.score?.combo ?? 1;
    const entry = {
      id: e.fruit.species.id, pitch: e.fruit.species.pitch,
      x: e.fruit.pos.x, y: e.fruit.pos.y,
      v, dirY: e.stroke.dir.y, climb: Math.max(0, combo - 1), combo,
      semis: 0,
    };
    if (pending.length === 0) {
      pendingAt = t;
      try { entry.semis = harmony.noteFor(entry.id, entry.climb); }
      catch (err) { fail(err); entry.semis = harmony.fallbackPitch(entry.pitch, entry.combo); }
      playNote(entry.semis, v, pan, t, brightOf(v), wetOf(entry.y));
    }
    pending.push(entry);

    // silence broken: the first note back blooms
    if (wasIdle) playBloom(engine, harmony.noteFor('orange', 0), t);
  }

  /** Voice and play what the stroke gathered AFTER its first note. r23: the
   *  first cut already sounded at contact and its pitch is history — flush
   *  owes only the REST of the chord, voiced around that pitch
   *  (harmony.voiceAround never moves it), plus the shared dressing: the
   *  conductor's echo answer, the low reinforcement, the 5+ gliss. */
  function flush() {
    const n = pending.length;
    const t = engine.now();
    const first = pending[0];

    let semis;
    if (n === 1) {
      semis = [first.semis];
    } else {
      try {
        semis = [first.semis].concat(harmony.voiceAround(first.semis, pending.slice(1)));
      } catch (err) {
        fail(err);
        semis = pending.map((p, i) =>
          (i === 0 ? first.semis : harmony.fallbackPitch(p.pitch, p.combo)));
      }
    }

    // the top three voices (by PITCH, not strum position — a descending
    // roll's last notes are its lowest) come back as the answer; a full
    // five-note echo would be a blob, not a phrase. The first note competes
    // for its echo slot like any other voice.
    const byPitch = pending.map((_, i) => i).sort((a, b) => semis[b] - semis[a]);
    const echoes = new Set(byPitch.slice(0, 3));
    if (echoes.has(0)) conductor.echo(semis[0], first.v, panOf(first.x));

    if (n > 1) {
      // strum the LATER cuts in fruit x-order (an up-swipe rolls ascending,
      // down descending); the already-played first note anchors the roll
      const order = [];
      for (let i = 1; i < n; i++) order.push(i);
      const dir = first.dirY;
      if (Math.abs(dir) > 0.5) order.sort((a, b) => (semis[a] - semis[b]) * Math.sign(dir));
      else order.sort((a, b) => pending[a].x - pending[b].x);
      // r18: chords land FULLER than single notes — a combo is the game's
      // reward moment and the player asked for "a touch more oomph"
      const boost = Math.min(1.35, 1.1 + 0.07 * n);
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const p = pending[i];
        const taper = 1 - (k + 1) * 0.04;   // the first note was roll position 0
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
        if (sub >= -25) playNote(sub, Math.min(1, first.v * boost) * 0.5, 0, t, 900, 0.45);
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
   * The rock (r23): a piano MISTAKE, not a sound effect. "Like we were about
   * to play the next note or chord but our finger hit the wrong key" — so it
   * IS the game's piano, at normal brightness, playing the fat-finger flam
   * every pianist knows: the wrong key (a minor 2nd above the note the fruit
   * would have sung) lands first and hardest, the intended note stumbles in
   * ~15 ms behind, softer. The dissonance penalizes by making the music less
   * beautiful for a moment; nothing else is added — no cluster, no dead
   * thud, just the faintest knuckle of contact under it.
   */
  function onRockHit(e) {
    if (!engine.ready || !api.enabled) return;
    const t = engine.now();
    let n;
    try { n = harmony.noteFor('apple', 0); } catch (_) { n = 3; }
    playNote(n + 1, 0.55, 0, t, brightOf(0.55), 0.3);
    playNote(n, 0.35, 0.12, t + 0.015, brightOf(0.35), 0.3);
    engine.playThump(thumpBuf, 0.7, t, 0.08);
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
