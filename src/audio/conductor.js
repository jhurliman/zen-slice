/**
 * conductor.js — the musical intelligence. Owns every clock the music has:
 *
 *  · TEMPO, inferred from the player. An EMA over inter-slice intervals,
 *    octave-folded into 60–90 BPM and slew-limited to 2 BPM/s. The grid
 *    follows the player, never the reverse.
 *  · THE CHORD CLOCK. The progression advances every barsPerChord bars
 *    (2, or 4 in Still Water / Deep Calm). A combo peak can NUDGE the next
 *    change to the next bar boundary — never delaying, only leaning in.
 *  · THE LOOK-AHEAD SCHEDULER ("tale of two clocks"): frame() walks a
 *    16th-note cursor 120 ms ahead of actx.currentTime. Background time
 *    lives ENTIRELY on the actx clock; gesture events never bridge into it.
 *
 * ── r17: BLOOM, MOTIFS, and the ECHO ────────────────────────────────────────
 * The player's verdict on r16: "you're just hitting notes on a keyboard with
 * random timing… I want to be participatory in the evolution of the
 * soundtrack, not just hearing my swipes echo in the darkness." The r16
 * background was gated on instantaneous intensity thresholds that calm play
 * never crossed, so calm play WAS swipes in the dark. Three changes:
 *
 *  · BLOOM — a slow accumulator (each slice adds a little, decays over ~a
 *    minute of play, faster after 15 s idle). Playing GROWS the arrangement
 *    and it STAYS grown: bass enters first, then the level's motif, then the
 *    sparkle ornaments. Flower's mechanic, in sound: the world fills in
 *    around you because you played, not because you're playing hard enough
 *    right now.
 *  · MOTIFS — each level has a composed 16-step pattern (and a bass
 *    pattern) with its own rhythmic identity, voiced live from the harmonic
 *    field. Still Water has none; Orchard Rain patters like rain; Golden
 *    Hour flows in 16ths; Deep Calm breathes in wide slow arcs. This is the
 *    "musical structure per level".
 *  · THE ECHO — every note the player plays is answered: it returns 8 grid
 *    steps (2 beats) later, snapped TO the grid, an octave up, quiet and
 *    reverb-heavy. The player's own phrases become the loop material, and
 *    because the answer is quantized, it teaches the pulse without ever
 *    delaying the played note.
 */

import { makeDrone, makePadBank, playBloom } from './instruments.js';

const LOOKAHEAD = 0.12;   // seconds of actx time scheduled ahead
export const PAD_COUNT = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];   // pad voices per level (r18: 10-level day arc)

/**
 * Per-level motifs: 16 steps per bar (16ths), each entry {s, d, o, v} —
 * step, melodic degree (harmony.melNote), octave shift, velocity scale.
 * Exported for tools/audioprobe.mjs, which asserts every entry voices
 * in-range in every chord of every palette.
 */
export const MOTIFS = [
  /* 0 Still Water — silence is the motif */
  [],
  /* 1 First Light — two soft notes rocking on the offbeats */
  [{ s: 4, d: 1, o: 0, v: 0.5 }, { s: 12, d: 2, o: 0, v: 0.42 }],
  /* 2 Morning Dew — sparse high dewdrops, barely there */
  [
    { s: 2, d: 3, o: 1, v: 0.34 }, { s: 4, d: 2, o: 1, v: 0.30 },
    { s: 10, d: 3, o: 1, v: 0.32 }, { s: 12, d: 1, o: 1, v: 0.28 },
  ],
  /* 3 Orchard Rain — raindrop 8ths, falling then lifting */
  [
    { s: 0, d: 3, o: 1, v: 0.42 }, { s: 2, d: 2, o: 1, v: 0.34 },
    { s: 4, d: 1, o: 1, v: 0.38 }, { s: 6, d: 3, o: 0, v: 0.30 },
    { s: 8, d: 2, o: 0, v: 0.40 }, { s: 10, d: 1, o: 1, v: 0.32 },
    { s: 12, d: 0, o: 1, v: 0.36 }, { s: 14, d: 2, o: 1, v: 0.30 },
  ],
  /* 4 Noon Bloom — open climbing quarters, full sun */
  [
    { s: 0, d: 0, o: 0, v: 0.45 }, { s: 4, d: 1, o: 0, v: 0.40 },
    { s: 8, d: 2, o: 0, v: 0.42 }, { s: 12, d: 3, o: 0, v: 0.38 },
  ],
  /* 5 Summer Weight — dotted, unhurried, mid register */
  [
    { s: 0, d: 0, o: 0, v: 0.5 }, { s: 3, d: 1, o: 0, v: 0.36 },
    { s: 6, d: 2, o: 0, v: 0.44 }, { s: 10, d: 3, o: 0, v: 0.38 },
    { s: 12, d: 2, o: 0, v: 0.32 },
  ],
  /* 6 Golden Hour — a 16th-note wave, up and over */
  [
    { s: 0, d: 0, o: 0, v: 0.42 }, { s: 1, d: 1, o: 0, v: 0.30 },
    { s: 2, d: 2, o: 0, v: 0.34 }, { s: 3, d: 3, o: 0, v: 0.30 },
    { s: 4, d: 2, o: 1, v: 0.40 }, { s: 6, d: 1, o: 1, v: 0.32 },
    { s: 8, d: 0, o: 1, v: 0.38 }, { s: 11, d: 3, o: 0, v: 0.30 },
    { s: 12, d: 2, o: 0, v: 0.34 }, { s: 14, d: 1, o: 0, v: 0.28 },
  ],
  /* 7 Dusk Ember — falling sighs as the light goes */
  [
    { s: 0, d: 3, o: 0, v: 0.42 }, { s: 6, d: 2, o: 0, v: 0.36 },
    { s: 8, d: 1, o: 0, v: 0.40 }, { s: 14, d: 0, o: 0, v: 0.32 },
  ],
  /* 8 Night Jasmine — low and high pairs across the dark */
  [
    { s: 0, d: 0, o: -1, v: 0.40 }, { s: 7, d: 3, o: 1, v: 0.30 },
    { s: 8, d: 2, o: 0, v: 0.36 }, { s: 15, d: 3, o: 1, v: 0.26 },
  ],
  /* 9 Deep Calm — wide slow arcs */
  [
    { s: 0, d: 0, o: -1, v: 0.5 }, { s: 6, d: 2, o: 0, v: 0.4 },
    { s: 8, d: 3, o: 0, v: 0.44 }, { s: 14, d: 1, o: 1, v: 0.34 },
  ],
];

/** Bass patterns per level: {s, f: 'root'|'fifth'|'oct', v}. */
export const BASSES = [
  [],
  [{ s: 0, f: 'root', v: 0.5 }],
  [{ s: 0, f: 'root', v: 0.5 }],
  [{ s: 0, f: 'root', v: 0.55 }, { s: 8, f: 'fifth', v: 0.42 }],
  [{ s: 0, f: 'root', v: 0.55 }, { s: 8, f: 'fifth', v: 0.45 }],
  [{ s: 0, f: 'root', v: 0.6 }, { s: 8, f: 'fifth', v: 0.48 }, { s: 12, f: 'oct', v: 0.36 }],
  [{ s: 0, f: 'root', v: 0.6 }, { s: 6, f: 'fifth', v: 0.42 }, { s: 8, f: 'root', v: 0.5 }, { s: 14, f: 'fifth', v: 0.38 }],
  [{ s: 0, f: 'root', v: 0.55 }, { s: 8, f: 'fifth', v: 0.45 }, { s: 12, f: 'oct', v: 0.34 }],
  [{ s: 0, f: 'root', v: 0.5 }, { s: 6, f: 'fifth', v: 0.4 }],
  [{ s: 0, f: 'root', v: 0.55 }, { s: 8, f: 'fifth', v: 0.4 }],
];

const smooth01 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export function createConductor(engine, harmony) {
  let drone = null, pad = null, playNote = null;
  let started = false;

  let bpm = 66, bpmTarget = 66;
  let heat = 0, intensity = 0;
  let bloom = 0;
  let lastSliceT = -1e9;
  let level = 0;

  let nextStep = 0, stepIdx = 0, barInChord = 0, nudged = false;
  let arpPool = null;
  let padLpNow = 2200;
  let background = true, arps = true;
  let arrived = false, arrivalPending = false;   // the one-time Deep Calm arrival

  // layer presences, derived from bloom each frame
  let gBass = 0, gMotif = 0, gEcho = 0;

  // pending echoes, oldest-first; drained by frame() inside the look-ahead
  const echoQ = [];
  const ECHO_Q_MAX = 24;
  function queueEcho(t, semis, vel, pan, bright, wet) {
    if (echoQ.length >= ECHO_Q_MAX) echoQ.shift();
    echoQ.push({ t, semis, vel, pan, bright, wet });
  }

  const api = {
    get bpm() { return bpm; },
    get intensity() { return intensity; },
    get bloom() { return bloom; },

    /** Called once the context exists. `play` = (semis, vel, pan, when, brightHz, wet) → void */
    start(play) {
      playNote = play;
      drone = makeDrone(engine);
      pad = makePadBank(engine, 5);
      retarget(4.0);
      nextStep = engine.now() + 0.1;
      stepIdx = 0; barInChord = 0;
      started = true;
    },

    /** Tempo + heat + bloom, fed from every slice. */
    onSlice() {
      const t = engine.now();
      const iv = t - lastSliceT;
      lastSliceT = t;
      heat = Math.min(1.4, heat + 0.22);
      bloom = Math.min(1, bloom + 0.06);
      if (iv > 0.3 && iv < 2.5) {
        let b = 60 / iv;
        while (b < 55) b *= 2;
        while (b > 95) b /= 2;
        b = Math.min(90, Math.max(60, b));
        bpmTarget += (b - bpmTarget) * 0.25;
      }
    },

    /**
     * The answer: play this note back 8 grid steps (2 beats) later, snapped
     * to the grid, an octave up, quiet and wet. The grid time is fixed at
     * record time (a few ms of tempo drift is inaudible at echo levels), but
     * the note is QUEUED, not played: engine.playPiano marks its pooled
     * voice busy from acquisition to the note's end, so handing it a time
     * seconds out would reserve voices the live foreground needs now. The
     * queue drains in frame() as each echo enters the look-ahead window.
     */
    echo(semis, vel, pan) {
      if (!started || !background || gEcho < 0.05 || !playNote) return;
      const stepDur = 60 / bpm / 4;
      const now = engine.now();
      // snap "now + 8 steps" onto the scheduler's own grid
      const raw = now + 8 * stepDur;
      const t = nextStep + Math.ceil((raw - nextStep) / stepDur) * stepDur;
      // up an octave unless that leaves the kit's span — never Math.min a
      // pitch: clamping transposes to a different note, not a softer one
      const n = semis + 12 <= 31 ? semis + 12 : semis;
      queueEcho(t, n, vel * 0.32 * gEcho, pan * 0.5, 3600, 0.85);
      if (gEcho > 0.7) {
        queueEcho(t + 8 * stepDur, n, vel * 0.13 * gEcho, -pan * 0.5, 3000, 0.9);
      }
    },

    /** True while the soundscape is breathed down; audio.js blooms the slice
     *  that breaks a silence like this. */
    isIdle: () => engine.now() - lastSliceT > 10,

    onComboPeak() { nudged = true; },

    setLevel(l) {
      const next = Math.max(0, Math.min(PAD_COUNT.length - 1, l | 0));
      if (next !== level) nudged = true;   // r20: a level change lands its palette at the NEXT BAR
      level = next;
      harmony.setLevel(level);
      // the end of the 30-minute journey earns an arrival, once per session
      if (level === PAD_COUNT.length - 1 && !arrived) { arrived = true; arrivalPending = true; }
    },

    setCaps(caps) { background = caps.background; arps = caps.arps; },

    reset() {
      harmony.reset();
      level = 0; heat = 0; bloom = 0; bpm = bpmTarget = 66;
      lastSliceT = -1e9;
      barInChord = 0; nudged = false;
      arrived = false; arrivalPending = false;
      echoQ.length = 0;
      if (started) retarget(2.0);
    },

    frame(dt) {
      if (!started) return;
      const now = engine.now();

      // decay + derive
      heat *= Math.exp(-dt / 5);
      intensity = Math.min(1, heat);
      const sinceSlice = now - lastSliceT;
      const idle = sinceSlice > 10;
      // bloom decays over ~a minute while playing, faster once truly idle —
      // the arrangement you grew lingers, then the world settles back down
      bloom *= Math.exp(-dt / (sinceSlice > 15 ? 14 : 70));
      gBass = smooth01((bloom - 0.04) / 0.22);
      gMotif = smooth01((bloom - 0.22) / 0.34);
      gEcho = smooth01((bloom - 0.08) / 0.18);
      if (sinceSlice > 6) bpmTarget += (66 - bpmTarget) * Math.min(1, dt * 0.12);
      const slew = 2 * dt;
      bpm += Math.min(slew, Math.max(-slew, bpmTarget - bpm));

      // idle breathing: the pad filter closes to a murmur, opens with play
      const lpTarget = idle ? 800 : 1400 + 3800 * intensity;
      if (Math.abs(lpTarget - padLpNow) > 60) {
        engine.padLp.frequency.setTargetAtTime(lpTarget, now, lpTarget < padLpNow ? 2.5 : 0.6);
        padLpNow = lpTarget;
      }

      // release queued echoes as they enter the look-ahead window, so their
      // pooled voices are only held for the ~120 ms they actually need. Full
      // scan, not head-only: a second tap queues with a LATER time than
      // echoes recorded after it, so the queue is not time-sorted.
      for (let i = 0; i < echoQ.length;) {
        if (echoQ[i].t < now + LOOKAHEAD) {
          const e = echoQ[i];
          echoQ[i] = echoQ[echoQ.length - 1]; echoQ.pop();
          if (e.t > now - 0.05 && playNote) playNote(e.semis, e.vel, e.pan, e.t, e.bright, e.wet);
        } else i++;
      }

      // a long suspend leaves the cursor in the past; jump, don't catch up
      if (nextStep < now - 0.25) nextStep = now + 0.05;

      while (nextStep < now + LOOKAHEAD) {
        if (stepIdx === 0) onBar(nextStep);
        scheduleStep(stepIdx, nextStep);
        stepIdx = (stepIdx + 1) & 15;
        nextStep += 60 / bpm / 4;
      }
    },
  };

  function onBar(t) {
    barInChord++;
    if (barInChord >= harmony.barsPerChord() || (nudged && barInChord >= 1)) {
      const paletteArrived = harmony.advance();
      barInChord = 0; nudged = false;
      retarget(1.5);
      if (paletteArrived) {
        if (arrivalPending) {
          // ── THE ARRIVAL ── the journey's end, marked once: tonic, fifth,
          // and tonic-above blooming in sequence, the pad thrown fully open,
          // and the arrangement at full growth. Warm, not a fanfare.
          arrivalPending = false;
          const root = harmony.noteFor('orange', 0);
          playBloom(engine, root, t);
          playBloom(engine, root + 7, t + 0.12);
          playBloom(engine, root + 12, t + 0.26);
          bloom = 1.0;
          engine.padLp.frequency.setTargetAtTime(5200, t, 0.8);
          padLpNow = 5200;
        } else {
          // an ordinary level palette landing gets its single tonic bloom
          playBloom(engine, harmony.noteFor('orange', 0), t);
        }
      }
    }
  }

  /** Re-aim every continuous voice at the current chord. */
  function retarget(fade) {
    drone.setBass(harmony.noteFor('watermelon', 0));
    pad.setChord(harmony.padNotes(PAD_COUNT[level]), fade);
    arpPool = harmony.glissNotes();
  }

  function scheduleStep(step, t) {
    if (!background || !playNote) return;

    // the level's bass pattern — felt-soft, darker than any played note
    if (gBass > 0.05) {
      const bp = BASSES[level];
      for (let i = 0; i < bp.length; i++) {
        if (bp[i].s !== step) continue;
        const n = bp[i].f === 'fifth' ? harmony.noteFor('pineapple', 0)
          : bp[i].f === 'oct' ? harmony.noteFor('watermelon', 0) + 12
            : harmony.noteFor('watermelon', 0);
        playNote(n, bp[i].v * gBass * (0.7 + 0.3 * intensity), 0, t, 900, 0.4);
      }
    }

    // the level's motif — its composed identity, voiced from the field
    if (gMotif > 0.05) {
      const mo = MOTIFS[level];
      for (let i = 0; i < mo.length; i++) {
        if (mo[i].s !== step) continue;
        const n = harmony.melNote(mo[i].d, mo[i].o);
        const pan = ((step / 15) - 0.5) * 0.5;
        playNote(n, mo[i].v * gMotif * (0.65 + 0.35 * intensity), pan, t, 2600, 0.7);
      }
    }

    // sparkle ornaments: only once the arrangement is fully grown AND play
    // is actually hot — the last layer, never the first
    if (arps && bloom > 0.7 && intensity > 0.4 && step % 2 === 1) {
      if (Math.random() < (intensity - 0.4) * 0.5) {
        const half = arpPool.length >> 1;
        const n = arpPool[half + ((Math.random() * (arpPool.length - half)) | 0)];
        playNote(n, 0.09 + 0.05 * intensity, (Math.random() * 2 - 1) * 0.4, t, 3200, 0.8);
      }
    }
  }

  return api;
}
