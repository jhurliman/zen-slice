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
  playPluck, playRiser, playSigh, playBloom, playHum,
} from './instruments.js';

const CHORD_GATHER = 0.08;  // s to gather a stroke's LATER cuts (first note is immediate)
const STRUM = 0.028;        // s between rolled chord notes
const MAX_ERRORS = 20;

// r27: the room follows the day (engine.SPACES — dawn close, noon open,
// night vast). Index-matched to director.js LEVELS like every per-level
// array; the probe asserts the length.
export const SPACE_FOR_LEVEL = [
  'dawn', 'dawn', 'dawn', 'open', 'open',
  'open', 'open', 'night', 'night', 'night',
];

export function createAudio() {
  const api = { enabled: true, errors: [] };
  const engine = createEngine();
  const harmony = createHarmony();
  const conductor = createConductor(engine, harmony);

  let ctxRef = null, started = false;
  let pianoKit = null, thumpBuf = null, swishBank = null;
  let pending = [];            // gathered notes of the current stroke
  let pendingAt = -1;          // engine time of the stroke's first cut
  let pendingQuant = -1;       // r28: the 16th-grid time the stroke's notes land on
  // r31: hums are QUEUED and pitched at drain (≤150 ms before onset) — a
  // spawn-time pitch could be 2 s stale by the apex, sustaining an
  // old-chord tone across a chord change for a full second
  const humQ = [];             // { at, id, pan }
  const HUM_Q_MAX = 8;
  let lastShimmer = -1e9, lastRiser = -1e9, lastSigh = -1e9, lastSwish = -1e9, lastHum = -1e9;
  let lastWatchdog = 0, swishCount = 0;
  // r36: zombie-context detection — see the watchdog in api.frame().
  let lastCT = -1, frozenSecs = 0, recoveries = 0;
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
  // r33: ceiling 7 kHz → 5.2 kHz. A full-speed flick used to throw the note
  // filter wide open onto the piano's harshest band; the top of the velocity
  // range now lands where the felt still sounds like felt.
  const brightOf = (v) => 1200 * Math.pow(5200 / 1200, v);

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

    // r36: shared return-to-foreground path — resume, unmute, and arm the
    // zombie watchdog to check FAST (~0.5 s instead of up to 3): baseline
    // the clock now, count this as the first frozen second, and let the
    // next watchdog tick decide. A healthy context advances its clock and
    // resets the count; a zombie gets cycled half a second after return.
    const wake = () => {
      engine.resume();
      engine.setMaster(masterLevel(), 0.4);
      lastCT = engine.actx ? engine.actx.currentTime : -1;
      frozenSecs = 1; lastWatchdog = 0.5;
    };

    document.addEventListener('visibilitychange', guard(() => {
      if (!started) return;
      if (document.hidden) {
        // mute only — NEVER self-suspend. iOS suspends the context itself on
        // background, and our own suspend() + a gesture-less resume() was the
        // "audio is gone when I come back" bug: the resume was rejected and
        // nothing retried. Let the OS own the context; we own the fader.
        engine.setMaster(0, 0.05);
      } else wake();
    }));

    // r36: in the Capacitor shell, the App plugin's appStateChange is the
    // shell's own foreground truth — belt-and-braces beside visibilitychange
    // (WebKit has a history of dropping one or the other after edge cases
    // like Siri or a call). Reads the injected global like haptics.js does:
    // zero wrapper bytes and a guaranteed no-op on the web.
    try {
      window.Capacitor?.Plugins?.App?.addListener?.('appStateChange', guard((s) => {
        if (started && s?.isActive && !document.hidden) wake();
      }));
    } catch (_) { /* */ }

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
    c.bus.on('level', guard((e) => {
      conductor.setLevel(e.level);
      engine.setSpace(SPACE_FOR_LEVEL[Math.max(0, Math.min(SPACE_FOR_LEVEL.length - 1, e.level | 0))]);
    }));
    c.bus.on('reset', guard(() => {
      pending.length = 0; pendingAt = -1; pendingQuant = -1;
      humQ.length = 0;
      conductor.reset();
      engine.setSpace(SPACE_FOR_LEVEL[0], 3);
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
        t, 0.09 + v * 0.075, 1100 + v * 2400, pan);   // r30 baked (?tune swish 0.75)
    }
    // r25: the mass thump is GONE from the slice. r23 already tamed it, and
    // the player still heard "some sort of muffled crunchy sound with a
    // delay" — that was this: a pitched-up sine drop (up to 2.2× rate on
    // small fruit) whose low tail blooms tens of ms after the piano's onset,
    // reading as a delayed muffled knock on a phone speaker. A slice is now
    // exactly two sounds — air and the note. The thump buffer survives only
    // as the rock's knuckle of contact (onRockHit).

    conductor.onSlice();

    // ── the note — QUANTIZED to the 16th grid (r28, the Rez move) ──
    // The SWISH owns contact (immediate, unpitched — Rez's own trick); the
    // pitch snaps to the scheduler's next 16th (≤ 250 ms at 60 bpm, usually
    // far less) and every slice becomes a sequencer step. r31: NO pitch is
    // decided here anymore — r28 fixed the first note's pitch at contact,
    // and when the chord advanced inside the contact→tick window the stroke
    // came out bichordal (old-chord first note, new-chord rest). The player
    // heard exactly that: "it doesn't always seem like the notes flow well
    // into the track". Every pitch is now derived in flush(), which the
    // frame deadline runs ≤30 ms before the tick — the field AT SOUND TIME
    // decides the notes. climb is recorded now (combo is already
    // incremented; combo-1 is this cut's walk up the chord).
    const combo = ctxRef.score?.combo ?? 1;
    const entry = {
      id: e.fruit.species.id, pitch: e.fruit.species.pitch,
      x: e.fruit.pos.x, y: e.fruit.pos.y,
      v, dirY: e.stroke.dir.y, climb: Math.max(0, combo - 1), combo,
    };
    if (pending.length === 0) {
      pendingAt = t;
      pendingQuant = conductor.quantize(t);
    }
    pending.push(entry);

    // silence broken: the first note back blooms
    if (wasIdle) playBloom(engine, harmony.noteFor('orange', 0), t);
  }

  /** Voice and play the WHOLE stroke. r31: every pitch is derived HERE, and
   *  flush runs ≤30 ms before the grid tick (see the frame deadline), so
   *  the harmonic field at sound time decides the notes — a chord advance
   *  can never split a stroke across two chords again. */
  function flush() {
    const n = pending.length;
    // r28: the whole gesture anchors on the stroke's grid time — the
    // strum rolls off the 16th the sequencer gave us, not off wall clock
    const t = Math.max(engine.now(), pendingQuant);
    const first = pending[0];

    let semis;
    try {
      semis = n === 1
        ? [harmony.noteFor(first.id, first.climb)]
        : harmony.voiceChord(pending);
    } catch (err) {
      fail(err);
      semis = pending.map((p) => harmony.fallbackPitch(p.pitch, p.combo));
    }

    // the top three voices (by PITCH, not strum position — a descending
    // roll's last notes are its lowest) come back as the answer; a full
    // five-note echo would be a blob, not a phrase. The first note competes
    // for its echo slot like any other voice.
    const byPitch = pending.map((_, i) => i).sort((a, b) => semis[b] - semis[a]);
    const echoes = new Set(byPitch.slice(0, 3));
    // the stroke's first cut leads the roll, ON the tick. r34: at 3+ the
    // anchor carries an ACCENT — the r18 boost only ever lifted the LATER
    // cuts, so the downbeat of the reward moment landed at single-note
    // weight and triads read flatter than they scored ("big game moments
    // should be sonic exclamation points"). Modest and size-scaled.
    const accent = n >= 3 ? Math.min(1.22, 1 + 0.08 * (n - 2)) : 1;
    const av = Math.min(1, first.v * accent);
    playNote(semis[0], av, panOf(first.x), t, brightOf(av), wetOf(first.y));
    if (echoes.has(0)) conductor.echo(semis[0], first.v, panOf(first.x));

    if (n > 1) {
      // strum the LATER cuts in fruit x-order (an up-swipe rolls ascending,
      // down descending); the first note anchors the roll at position 0
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
        const taper = 1 - (k + 1) * 0.04;   // the first note holds roll position 0
        const bv = Math.min(1, p.v * boost) * taper;
        playNote(semis[i], bv, panOf(p.x), t + (k + 1) * STRUM, brightOf(bv), wetOf(p.y));
        if (echoes.has(i)) conductor.echo(semis[i], p.v * taper, panOf(p.x));
      }
      // 3+ fruit: reinforce the chord's foundation an octave under its lowest
      // voice — body, not mud (the low register stays wide by voicing law).
      // SKIPPED when the octave leaves the kit's span: clamping a pitch
      // transposes it to a different note (an A1 bottom would gain a G#),
      // which is an off-chord semitone at the exact reward moment.
      if (n >= 3) {
        const sub = semis[byPitch[byPitch.length - 1]] - 12;
        // r34: the foundation grows a step with the stroke (0.5 / 0.55 / 0.6)
        const subG = 0.5 + 0.05 * Math.min(2, n - 3);
        if (sub >= -25) playNote(sub, Math.min(1, first.v * boost) * subG, 0, t, 900, 0.45);
        // r34: the mix breathes for a TRIAD too — a light one-beat dip (the
        // 4+ duck below is the deep one). Oomph by making room, not loudness.
        if (n === 3) engine.duckBed(0.78, 0.3, 1.4);
      }
      // r26: FOUR and up earns the grand run — the player: a 4+ harmony "is
      // quite rare… it should be rewarded with a more impactful musical
      // event like a longer glissando slide". A real harp sweep now: every
      // chord tone ascending across 2 octaves at CHORD (n=4), 3 at
      // FLOURISH (5+), crescendo left-to-right across the stereo field,
      // brightening as it climbs, the top note accented and ringing.
      if (n >= 4) {
        // r27 sidechain breathing: the bed makes room for the reward moment,
        // then swells back while the run rings — authored, not pumping
        // (r34: a touch deeper, ~+0.7 dB more room for the exclamation point)
        engine.duckBed(0.55, 0.5, 2.4);
        const run = harmony.runNotes(n >= 5 ? 3 : 2);
        const t0 = t + 0.10 + (order.length + 1) * STRUM;
        const last = run.length - 1;
        for (let k = 0; k < run.length; k++) {
          const u = last > 0 ? k / last : 1;
          // r34: the crown of the run rings a little prouder (0.46 → 0.52)
          const gv = (k === last ? 0.52 : 0.20 + 0.14 * u);
          playNote(run[k], gv, (u - 0.5) * 0.9, t0 + k * 0.052,
            3000 + 2600 * u, 0.8);
        }
      }
    }
    pending.length = 0; pendingAt = -1; pendingQuant = -1;
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
    conductor.onRockHit();   // r30: the arrangement dims — bloom is halved
    const t = engine.now();
    let n;
    try { n = harmony.noteFor('apple', 0); } catch (_) { n = 3; }
    playNote(n + 1, 0.55, 0, t, brightOf(0.55), 0.3);
    playNote(n, 0.35, 0.12, t + 0.015, brightOf(0.35), 0.3);
    engine.playThump(thumpBuf, 0.7, t, 0.08);
  }

  function onSpawn(e) {
    if (!started || !api.enabled) return;
    if (e.fruit.species.noCut) return;   // rocks are not notes: no riser, no hum — the SILENCE is the tell
    const t = engine.now();
    // r28 THE APEX HUM: the fruit whispers the note it would sing, centered
    // on its arc apex and panned to where it will hang — the player hears
    // the canvas offering notes before the swipe, and slicing resolves the
    // hum into the piano. Gated off in hot play (it is an invitation for
    // quiet moments, clutter in a flurry) and rate-limited so bursts don't
    // stack whispers.
    if (conductor.intensity < 0.75 && t - lastHum > 0.6 && humQ.length < HUM_Q_MAX) {
      lastHum = t;
      const apexDt = Math.min(2.2, Math.max(0.4, e.fruit.vel.y / 14));
      humQ.push({
        at: t + Math.max(0.05, apexDt - 0.55),
        id: e.fruit.species.id,
        pan: panOf(e.fruit.pos.x + e.fruit.vel.x * apexDt),
      });
    }
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
        if (!document.hidden && engine.actx) {
          const st = engine.actx.state, ct = engine.actx.currentTime;
          if (st !== 'running') { engine.resume(); frozenSecs = 0; }
          else if (ct === lastCT) {
            // r36 ZOMBIE: the context CLAIMS 'running' but its clock is
            // frozen and it renders silence — the WKWebView (and old mobile
            // Safari) background/resume failure this watchdog could never
            // see, because every retry path here trusts `state`. Two
            // consecutive frozen checks while visible = declared dead;
            // cycle rebuilds the pipeline, the kick wakes the render
            // thread. Worst case the cycle's resume needs a gesture and
            // the context parks at 'suspended' — a state the branch above
            // and the permanent tap listeners already revive. Silent-
            // while-'running' is the one state nothing retried; not anymore.
            frozenSecs += 1;
            if (frozenSecs >= 2) {
              frozenSecs = 0; recoveries += 1;
              engine.cycle(); engine.kick();
            }
          } else frozenSecs = 0;
          lastCT = ct;
        }
      }
      conductor.frame(dt);
      // r27: publish the live beat for the beat-synced combo window —
      // score.js reads ctx.beatSec (and clamps); modules share via ctx.
      if (ctxRef) {
        ctxRef.beatSec = 60 / conductor.bpm;
        // r28: seconds to the next audible 8th, for the director's
        // beat-quantized toss (absent/0 = toss immediately)
        ctxRef.toss8In = started ? conductor.timeToNext8(engine.now()) : 0;
        // r28: the chain stem follows the live multiplier
        conductor.setChain((ctxRef.score?.combo ?? 0) >= 2);
      }
      // r28: the gather now runs to just before the GRID TICK, not a fixed
      // 80 ms — the chord commits right before it sounds. That is musically
      // where the deadline belongs, and it buys a hitchy frame (or a slow
      // device) more time to drain r19-perf's queued cuts into the group.
      // CHORD_GATHER stays as the floor for when the tick is nearly on top
      // of the contact. Bounded: a 16th is at most 0.25 s at 60 bpm.
      if (pendingAt >= 0) {
        const deadline = Math.max(pendingAt + CHORD_GATHER, pendingQuant - 0.03);
        if (engine.now() >= deadline) flush();
      }
      // r31: drain hums as they near onset, pitching them from the chord of
      // NOW (drop any the drain missed by more than a beat — a hum that
      // starts late has lost its fruit)
      for (let i = 0; i < humQ.length;) {
        const h = humQ[i];
        const now = engine.now();
        if (h.at < now + 0.15) {
          humQ[i] = humQ[humQ.length - 1]; humQ.pop();
          if (h.at > now - 0.1) {
            try { playHum(engine, harmony.noteFor(h.id, 0), h.at, 1.1, h.pan); }
            catch (err) { fail(err); }
          }
        } else i++;
      }
    } catch (err) { fail(err); }
  };

  /** ?tune / ?debug surfaces: the engine's voicing macros and the mix meter. */
  api.getVoicing = () => engine.getVoicing();
  api.setVoicing = (v) => { try { engine.setVoicing(v); } catch (err) { fail(err); } };
  api.meter = () => { try { return engine.ready ? engine.meter() : null; } catch (_) { return null; } };

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
    // r36: times the zombie watchdog declared the context dead and cycled
    // it. Nonzero on device = the WKWebView background/resume bug fired
    // and was caught; visible on the ?debug strip as `rec N`.
    recoveries,
    // hardware truth for the latency conversation: seconds from "we scheduled
    // it" to "the speaker moves". Read these off the device via ?debug.
    baseLatency: engine.actx?.baseLatency ?? null,
    outputLatency: engine.actx?.outputLatency ?? null,
    bpm: Math.round(conductor.bpm * 10) / 10,
    space: engine.ready ? engine.space() : 'none',
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
