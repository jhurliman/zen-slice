/**
 * instruments.js — every sound generator. Pure functions of (engine, params);
 * no bus knowledge, no musical state (harmony.js decides notes, the conductor
 * decides when).
 *
 * ── The piano ───────────────────────────────────────────────────────────────
 * No-assets rule: the piano is RENDERED, not loaded. At unlock we render ten
 * buffers — one every 6 semitones from A1 to D#6 — in an OfflineAudioContext
 * (off the main thread), then play them via BufferSource with playbackRate
 * pitch-shifting ≤ ±3 semitones, where shift artifacts are inaudible. What
 * makes it read as "piano" instead of the old music box:
 *
 *   · inharmonicity: partial n sits at n·f0·√(1+Bn²), the stretched tuning of
 *     real strings (B grows toward treble);
 *   · TWO-stage decay per partial — a fast "prompt" decay handing over to a
 *     quiet slow tail (chained setTargetAtTime). Single-stage decay is the
 *     entire difference between a chime and a piano;
 *   · a 6 ms filtered-noise hammer transient, brighter with register;
 *   · 2 detuned strings per note below ~500 Hz (unison beating);
 *   · a strike-point comb (strike at ~1/8 of string length) shaping partial
 *     amplitudes.
 *
 * Until the render resolves, callers fall back to playPluck (the old chime),
 * so first-slice audio can never be missing.
 */

import { semisToFreq } from './harmony.js';

// sample centers, semitones from A3 = 220 Hz: A1 … D#6
export const PIANO_CENTERS = [-24, -18, -12, -6, 0, 6, 12, 18, 24, 30];

export async function renderPianoKit(sampleRate) {
  const kit = [];
  for (let i = 0; i < PIANO_CENTERS.length; i++) {
    kit.push(await renderPianoNote(sampleRate, semisToFreq(PIANO_CENTERS[i]), i));
  }
  return kit;
}

/** Nearest sample + playbackRate for a note (semitones from A3). */
export function pianoSample(kit, semis) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < PIANO_CENTERS.length; i++) {
    const d = Math.abs(semis - PIANO_CENTERS[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return { buffer: kit[best], rate: Math.pow(2, (semis - PIANO_CENTERS[best]) / 12) };
}

async function renderPianoNote(sr, f0, idx) {
  const dur = Math.min(4.2, Math.max(1.6, 4.2 * Math.pow(220 / f0, 0.3)));
  const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
  const B = 0.0002 + (idx / (PIANO_CENTERS.length - 1)) * 0.0006;
  const strings = f0 < 500 ? 2 : 1;
  const out = off.createGain(); out.gain.value = 1; out.connect(off.destination);

  for (let p = 1; p <= 14; p++) {
    const fp = p * f0 * Math.sqrt(1 + B * p * p);
    if (fp > sr * 0.45) break;
    // strike-point comb (~1/8 along the string) + spectral rolloff
    const amp = Math.pow(p, -1.05) * (0.25 + Math.abs(Math.sin(Math.PI * p / 8)) * 0.75);
    // prompt decay fast and register-dependent, then a quiet long tail
    const tauP = Math.min(3.0, Math.max(0.08, 3.0 * Math.pow(220 / fp, 0.85)));
    const tSwitch = tauP * 1.2;
    for (let s = 0; s < strings; s++) {
      const det = strings === 1 ? 0 : (s === 0 ? -0.65 : 0.65);
      const o = off.createOscillator();
      o.frequency.value = fp * Math.pow(2, det / 1200);
      const g = off.createGain();
      const a = (amp * 0.5) / strings;
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(a, 0.002);
      g.gain.setTargetAtTime(a * 0.12, 0.002, tauP);        // prompt
      g.gain.setTargetAtTime(0, tSwitch, tauP * 3);          // tail
      o.connect(g); g.connect(out);
      o.start(0); o.stop(dur);
    }
  }

  // sympathetic fifth — the soundboard ghost
  {
    const o = off.createOscillator();
    o.frequency.value = f0 * 1.5 * 0.997;
    const g = off.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.02, 0.01);
    g.gain.setTargetAtTime(0, 0.01, 2.2);
    o.connect(g); g.connect(out);
    o.start(0); o.stop(dur);
  }

  // hammer: 6 ms of bandpassed noise, brighter with register
  {
    const nlen = (sr * 0.03) | 0;
    const nb = off.createBuffer(1, nlen, sr);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    const src = off.createBufferSource(); src.buffer = nb;
    const bp = off.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, Math.max(800, f0 * 6));
    bp.Q.value = 0.8;
    const g = off.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.3, 0.001);
    g.gain.setTargetAtTime(0, 0.002, 0.004);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(0);
  }

  const buf = await off.startRendering();
  // normalize to a fixed headroom so every sample plays at a predictable level
  const d = buf.getChannelData(0);
  let peak = 1e-6;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const k = 0.5 / peak;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return buf;
}

/** The wet splat under a cut, pre-rendered once: sine drop 130→45 Hz.
 *  playbackRate at play time scales it by species mass. Synchronous — it is
 *  ~16k samples of straight math. */
export function makeThumpBuffer(actx) {
  const sr = actx.sampleRate, dur = 0.36, len = (sr * dur) | 0;
  const buf = actx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = 45 + (130 - 45) * Math.exp(-t * 11);
    phase += (2 * Math.PI * f) / sr;
    const env = Math.min(1, t / 0.008) * Math.exp(-t * 9.5);
    d[i] = Math.sin(phase) * env;
  }
  return buf;
}

/**
 * The ambient drone — the same four A/E partials the game has had since
 * round 1, with one change: the LOWEST oscillator is now the progression's
 * moving bass. setBass() glides it to the current chord's bass note while
 * the upper A/E partials stay put; a moving bass under a static pedal is the
 * cheapest possible "composed" sound. Routed through the pad bus so the idle
 * breathing filter closes over it too.
 */
export function makeDrone(engine) {
  const actx = engine.actx;
  const oscs = [];
  [55, 82.4, 110, 164.8].forEach((f, i) => {
    const o = actx.createOscillator();
    o.type = i % 2 ? 'sine' : 'triangle';
    o.frequency.value = f;
    const g = actx.createGain(); g.gain.value = 0.055 * (0.35 / (i + 1));
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.03 + i * 0.017;
    const lfg = actx.createGain(); lfg.gain.value = 0.5 + i * 0.35;
    lfo.connect(lfg); lfg.connect(o.detune); lfo.start();
    o.connect(g); g.connect(engine.padBus); o.start();
    oscs.push(o);
  });
  return {
    /** glide the bass oscillator to `semis` (from A3), an octave below A1 range */
    setBass(semis) {
      const f = semisToFreq(semis);
      oscs[0].frequency.setTargetAtTime(f, engine.now(), 0.8);
    },
  };
}

/**
 * Chord-following pad: up to `max` continuous voices that crossfade between
 * voicings on chord changes. Voices past the requested count fade to silence
 * (level richness: Still Water breathes on 2 voices, Deep Calm blooms on 5).
 */
export function makePadBank(engine, max = 5) {
  const actx = engine.actx;
  const voices = [];
  for (let i = 0; i < max; i++) {
    const o = actx.createOscillator();
    o.type = i % 2 ? 'triangle' : 'sine';
    o.frequency.value = 220;
    const g = actx.createGain(); g.gain.value = 0;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.021;
    const lfg = actx.createGain(); lfg.gain.value = 1.1 + i * 0.4;
    lfo.connect(lfg); lfg.connect(o.detune); lfo.start();
    o.connect(g); g.connect(engine.padBus);
    o.start();
    voices.push({ o, g });
  }
  return {
    /** semis[] ascending; fade in seconds */
    setChord(semis, fade = 1.5) {
      const t = engine.now();
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (i < semis.length) {
          v.o.frequency.setTargetAtTime(semisToFreq(semis[i]), t, 0.35);
          v.g.gain.setTargetAtTime(0.05 / (1 + i * 0.35), t, fade * 0.45);
        } else {
          v.g.gain.setTargetAtTime(0, t, fade * 0.6);
        }
      }
    },
  };
}

/** The pre-piano chime, kept verbatim as the fallback while the kit renders. */
export function playPluck(engine, semis, vel, pan, when) {
  const actx = engine.actx;
  const t = Math.max(when, actx.currentTime);
  const f0 = semisToFreq(semis);
  const p = actx.createStereoPanner(); p.pan.value = pan; p.connect(engine.dry);
  [1, 2.01, 3.02].forEach((h, i) => {
    const o = actx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = f0 * h;
    const g = actx.createGain();
    const amp = (0.14 / (i + 1.4)) * (0.4 + 0.6 * vel);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 1.5 - i * 0.35);
    o.connect(g); g.connect(p);
    o.start(t); o.stop(t + 1.6);
  });
}

/** Sub-audible anticipation: a filtered-noise swell that peaks at the tossed
 *  fruit's arc apex. −28 dB — felt, not heard. */
export function playRiser(engine, apexDt) {
  const actx = engine.actx;
  const t = actx.currentTime;
  const peak = t + Math.min(2.2, Math.max(0.5, apexDt));
  const src = actx.createBufferSource(); src.buffer = engine.noise;
  src.loop = true;
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.exponentialRampToValueAtTime(2400, peak);
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.04, peak);
  g.gain.setTargetAtTime(0, peak, 0.18);
  src.connect(bp); bp.connect(g); g.connect(engine.reverbIn);
  src.start(t); src.stop(peak + 1.0);
}

/** A missed fruit: one soft tone bending down a whole step and gone. The
 *  world exhaling — never a penalty buzzer. */
export function playSigh(engine, semis) {
  const actx = engine.actx;
  const t = actx.currentTime;
  const f = semisToFreq(semis);
  const o = actx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * Math.pow(2, -2 / 12), t + 1.2);
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.35);
  g.gain.setTargetAtTime(0, t + 0.5, 0.35);
  const dry = actx.createGain(); dry.gain.value = 0.35;
  o.connect(g); g.connect(engine.reverbIn); g.connect(dry); dry.connect(engine.dry);
  o.start(t); o.stop(t + 2.2);
}

/** Arrival/return bloom: tonic in octaves with a slow swell, mostly reverb.
 *  Marks a level's palette landing, and the first slice after long silence. */
export function playBloom(engine, semis, when = 0) {
  const actx = engine.actx;
  const t = Math.max(when, actx.currentTime);
  [0, 12].forEach((oct, i) => {
    const o = actx.createOscillator(); o.type = 'sine';
    o.frequency.value = semisToFreq(semis + oct);
    const g = actx.createGain();
    const a = i === 0 ? 0.1 : 0.06;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.04 + i * 0.03);
    g.gain.setTargetAtTime(0, t + 0.2, 0.9);
    const dry = actx.createGain(); dry.gain.value = 0.4;
    o.connect(g); g.connect(engine.reverbIn); g.connect(dry); dry.connect(engine.dry);
    o.start(t); o.stop(t + 4.0);
  });
}
