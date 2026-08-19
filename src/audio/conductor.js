/**
 * conductor.js — the musical intelligence. Owns every clock the music has:
 *
 *  · TEMPO, inferred from the player. An EMA over inter-slice intervals,
 *    octave-folded into 60–90 BPM and slew-limited to 2 BPM/s. The grid
 *    follows the player, never the reverse — slice lazily and the music
 *    breathes at your pace; slice in rhythm and your next cut lands near-grid
 *    by construction. That is the whole Rez illusion with zero added latency.
 *  · THE CHORD CLOCK. The progression advances every barsPerChord bars
 *    (2, or 4 in Still Water / Deep Calm). A combo peak can NUDGE the next
 *    change to the next bar boundary — never delaying, only leaning in.
 *  · THE LOOK-AHEAD SCHEDULER (the "tale of two clocks" pattern): frame()
 *    walks a 16th-note cursor 120 ms ahead of actx.currentTime. At 120 fps
 *    that is at most one step per frame — bounded, allocation-free work.
 *    Background time lives ENTIRELY on the actx clock; gesture events never
 *    bridge into it (they sound immediately, in audio.js).
 *
 * Background content is deliberately ambient-forward: the player's slices are
 * the melodic lead, always. A felt-soft bass pulse appears above intensity
 * 0.25; the arp sparkle — quiet, wet, high — only above 0.6. Below that the
 * music is pad, drone, and whatever the player plays.
 */

import { makeDrone, makePadBank, playBloom } from './instruments.js';

const LOOKAHEAD = 0.12;   // seconds of actx time scheduled ahead
const PAD_COUNT = [2, 2, 3, 3, 4, 5];   // pad voices per level

export function createConductor(engine, harmony) {
  let drone = null, pad = null, playNote = null;
  let started = false;

  let bpm = 66, bpmTarget = 66;
  let heat = 0, intensity = 0;
  let lastSliceT = -1e9;
  let level = 0;

  let nextStep = 0, stepIdx = 0, barInChord = 0, nudged = false;
  let arpPool = null;
  let padLpNow = 2200;
  let background = true, arps = true;

  const api = {
    get bpm() { return bpm; },
    get intensity() { return intensity; },

    /** Called once the context exists. `play` = (semis, vel, pan, when, brightHz) → void */
    start(play) {
      playNote = play;
      drone = makeDrone(engine);
      pad = makePadBank(engine, 5);
      retarget(4.0);
      nextStep = engine.now() + 0.1;
      stepIdx = 0; barInChord = 0;
      started = true;
    },

    /** Tempo + heat, fed from every slice. Wall-side of the clock divide:
     *  only the derived bpm/intensity cross over, never the timestamps. */
    onSlice() {
      const t = engine.now();
      const iv = t - lastSliceT;
      lastSliceT = t;
      heat = Math.min(1.4, heat + 0.16);
      if (iv > 0.3 && iv < 2.5) {
        let b = 60 / iv;
        while (b < 55) b *= 2;
        while (b > 95) b /= 2;
        b = Math.min(90, Math.max(60, b));
        bpmTarget += (b - bpmTarget) * 0.25;
      }
    },

    /** True while the soundscape is breathed down; audio.js blooms the slice
     *  that breaks a silence like this. */
    isIdle: () => engine.now() - lastSliceT > 10,

    onComboPeak() { nudged = true; },

    setLevel(l) {
      level = Math.max(0, Math.min(5, l | 0));
      harmony.setLevel(level);   // palette lands at the next chord boundary
    },

    setCaps(caps) { background = caps.background; arps = caps.arps; },

    reset() {
      harmony.reset();
      level = 0; heat = 0; bpm = bpmTarget = 66;
      lastSliceT = prevSliceT = -1e9;
      barInChord = 0; nudged = false;
      if (started) retarget(2.0);
    },

    frame(dt) {
      if (!started) return;
      const now = engine.now();

      // decay + derive
      heat *= Math.exp(-dt / 3.5);
      intensity = Math.min(1, heat);
      const idle = now - lastSliceT > 10;
      if (now - lastSliceT > 6) bpmTarget += (66 - bpmTarget) * Math.min(1, dt * 0.12);
      const slew = 2 * dt;
      bpm += Math.min(slew, Math.max(-slew, bpmTarget - bpm));

      // idle breathing: the pad filter closes to a murmur, opens with play
      const lpTarget = idle ? 800 : 1400 + 3800 * intensity;
      if (Math.abs(lpTarget - padLpNow) > 60) {
        engine.padLp.frequency.setTargetAtTime(lpTarget, now, lpTarget < padLpNow ? 2.5 : 0.6);
        padLpNow = lpTarget;
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
      // the level's palette landing gets its tonic bloom
      if (paletteArrived) playBloom(engine, harmony.noteFor('orange', 0), t);
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
    // bass pulse: beats 1 & 3, felt-soft, darker than any played note
    if ((step === 0 || step === 8) && intensity > 0.25) {
      const vel = 0.16 + 0.14 * intensity;
      playNote(harmony.noteFor('watermelon', 0), vel, 0, t, 900);
    }
    // arp sparkle: high, quiet, probabilistic — only when play runs hot
    if (arps && intensity > 0.6 && step % 2 === 1) {
      if (Math.random() < (intensity - 0.6) * 1.25) {
        // upper half of the flourish pool — sparkle sits above played notes
        const half = arpPool.length >> 1;
        const n = arpPool[half + ((Math.random() * (arpPool.length - half)) | 0)];
        playNote(n, 0.09 + 0.05 * intensity, (Math.random() * 2 - 1) * 0.4, t, 3200);
      }
    }
  }

  return api;
}
