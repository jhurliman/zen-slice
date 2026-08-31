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

/**
 * r18: rendered at 24 kHz, with a real yield between notes. The r17 version
 * fired ten OfflineAudioContext renders back-to-back at unlock and the player
 * measured the consequence on the phone: "a good 15+ seconds before any audio
 * plays" — the offline renders were starving the LIVE context's media thread
 * at exactly the moment it was trying to start. 24 kHz is free quality-wise
 * (the piano is lowpassed at ≤5.2 kHz at play time and BufferSource resamples
 * automatically) and the 60 ms gaps let the live thread breathe. The caller
 * additionally delays the whole render until after first sound.
 */
export async function renderPianoKit() {
  const sampleRate = 24000;
  const kit = [];
  for (let i = 0; i < PIANO_CENTERS.length; i++) {
    kit.push([await renderPianoNote(sampleRate, semisToFreq(PIANO_CENTERS[i]), i, 0)]);
    await new Promise((r) => setTimeout(r, 60));
  }
  // r27 ROUND-ROBIN: two more takes per center, rendered DETACHED after the
  // kit resolves so first-note readiness is unchanged — the per-center
  // arrays grow in place and pianoSample starts drawing on them as they
  // land. Each take moves the strike point, string detune, inharmonicity
  // and hammer brightness a few percent: repetition is the tell of
  // procedural audio, and no real piano plays the same note twice.
  // A failed background render degrades to fewer takes, never to a throw.
  (async () => {
    for (let vnt = 1; vnt < 3; vnt++) {
      for (let i = 0; i < PIANO_CENTERS.length; i++) {
        try {
          kit[i].push(await renderPianoNote(sampleRate, semisToFreq(PIANO_CENTERS[i]), i, vnt));
        } catch (_) { return; }
        await new Promise((r) => setTimeout(r, 80));
      }
    }
  })();
  return kit;
}

/** Nearest center + playbackRate for a note (semitones from A3); the take is
 *  round-robined at random among however many have rendered. */
export function pianoSample(kit, semis) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < PIANO_CENTERS.length; i++) {
    const d = Math.abs(semis - PIANO_CENTERS[i]);
    if (d < bd) { bd = d; best = i; }
  }
  const takes = kit[best];
  return {
    buffer: takes[(Math.random() * takes.length) | 0],
    rate: Math.pow(2, (semis - PIANO_CENTERS[best]) / 12),
  };
}

async function renderPianoNote(sr, f0, idx, vnt = 0) {
  const dur = Math.min(4.2, Math.max(1.6, 4.2 * Math.pow(220 / f0, 0.3)));
  const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
  // r27 per-take variation (vnt 0 = the reference take; r33 rewarmed the
  // shared voicing — rolloff, tails, register loudness — for all takes):
  // strike point wanders 1/8 → 1/7.2 or 1/8.9, string detune breathes ±12%,
  // inharmonicity ±5%, hammer brightness ±6% — a different touch per take.
  const strike = vnt === 0 ? 8 : vnt === 1 ? 7.2 : 8.9;
  const detK = 1 + 0.12 * (vnt === 1 ? 1 : vnt === 2 ? -1 : 0);
  const bK = 1 + 0.05 * (vnt === 1 ? 1 : vnt === 2 ? -1 : 0);
  const hamK = 1 + 0.06 * (vnt === 1 ? -1 : vnt === 2 ? 1 : 0);
  // r33: treble stretch eased 0.0008 → 0.00065 max — with the long tails of
  // r16-r32 the detuned upper partials read as bells; less stretch, less chime
  const B = (0.0002 + (idx / (PIANO_CENTERS.length - 1)) * 0.00045) * bK;
  const strings = f0 < 500 ? 2 : 1;
  const out = off.createGain(); out.gain.value = 1; out.connect(off.destination);

  for (let p = 1; p <= 14; p++) {
    const fp = p * f0 * Math.sqrt(1 + B * p * p);
    if (fp > sr * 0.45) break;
    // strike-point comb + spectral rolloff. r33: the player heard the old
    // p^-1.05 slope as "shrieking" — partial 10 sat only -21 dB under the
    // fundamental, parking real energy in the harsh 2-6 kHz band. A felt
    // hammer at mezzo touch rolls off far steeper, so: -1.35 exponent AND a
    // gentle absolute-frequency shade above ~3.4 kHz (felt, not a brick).
    const amp = Math.pow(p, -1.35) * (0.25 + Math.abs(Math.sin(Math.PI * p / strike)) * 0.75)
      / (1 + Math.pow(fp / 3400, 2));
    // prompt decay fast and register-dependent, then a quiet long tail
    const tauP = Math.min(3.0, Math.max(0.08, 3.0 * Math.pow(220 / fp, 0.85)));
    const tSwitch = tauP * 1.2;
    // r33: the tail handoff is what read as "windchimey" — every partial,
    // however high, handed 12% into a long pure-sine ring. Real piano upper
    // partials die almost entirely in the prompt stage; only the warm low
    // ones keep singing. Shade the handoff by frequency and shorten the ring.
    const hand = 0.12 * Math.min(1, Math.pow(600 / fp, 0.5));
    for (let s = 0; s < strings; s++) {
      const det = strings === 1 ? 0 : (s === 0 ? -0.65 : 0.65) * detK;
      const o = off.createOscillator();
      o.frequency.value = fp * Math.pow(2, det / 1200);
      const g = off.createGain();
      const a = (amp * 0.5) / strings;
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(a, 0.002);
      g.gain.setTargetAtTime(a * hand, 0.002, tauP);         // prompt
      g.gain.setTargetAtTime(0, tSwitch, tauP * 2.2);        // tail
      o.connect(g); g.connect(out);
      o.start(0); o.stop(dur);
    }
  }

  // sympathetic fifth — the soundboard ghost (r33: quieter and shorter; a
  // pure fifth ringing for seconds was one more voice in the chime choir)
  {
    const o = off.createOscillator();
    o.frequency.value = f0 * 1.5 * 0.997;
    const g = off.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.012, 0.01);
    g.gain.setTargetAtTime(0, 0.01, 1.5);
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
    // r33: 6·f0 capped 6 kHz put the click of every high note right in the
    // shriek band; 5·f0 capped 5.2 kHz keeps the knuckle, loses the spike
    bp.frequency.value = Math.min(5200, Math.max(800, f0 * 5 * hamK));
    bp.Q.value = 0.8;
    const g = off.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.3, 0.001);
    g.gain.setTargetAtTime(0, 0.002, 0.004);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(0);
  }

  const buf = await off.startRendering();
  // normalize to a REGISTER-WEIGHTED headroom (r33). The old fixed 0.5 made a
  // D#6 exactly as loud as an A1 — no acoustic piano does that, and the equal-
  // loudness treble was half the "shrieking" report. Treble sits back ~2.5 dB;
  // bass keeps its old level.
  const d = buf.getChannelData(0);
  let peak = 1e-6;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const target = Math.min(0.5, Math.max(0.34, 0.5 * Math.pow(220 / f0, 0.18)));
  const k = target / peak;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return buf;
}

/**
 * The cut sound, pre-rendered. The swipe is AIR — a brush stroke on the
 * canvas, never percussion. r23 rebuilt every recipe after the player named
 * exactly what was wrong: the fast grain trains (30/70 Hz raised-cosine)
 * read as "a closed hi-hat tick" and "a single shake of an aluminum pan" —
 * i.e. drum machine, and the direction is "painting on the audio canvas,
 * not triggering 808 sampler pads". So: no grain buzz anywhere. Four
 * flavors of pure filtered air, distinguished by brightness, length, and —
 * at most — a slow, shallow tremolo you feel as breathing, not rattling:
 *
 *   breath — long dark exhale (dawn, and the Dreaming of Bliss coda)
 *   air    — brighter, quicker passing air (first light, noon, golden hour)
 *   mist   — soft air with a 7 Hz / 25% swell — dew shimmer, not droplets
 *   dusk   — darker medium air with a barely-there 5 Hz breathe
 *
 * L0 → L1 is deliberately the clearest step (dark/slow → bright/quick) so
 * the player learns in the first minutes that the world's sound evolves.
 * Every buffer is normalized; two variants per recipe; one swish per STROKE
 * with stack ducking (audio.js / engine.js).
 */
const SWISH_RECIPES = {
  breath: { attack: 0.050, decay: 0.46, dur: 0.80, k0: 0.09, k1: 0.035, tremHz: 0, tremDepth: 0 },
  air: { attack: 0.028, decay: 0.30, dur: 0.58, k0: 0.22, k1: 0.07, tremHz: 0, tremDepth: 0 },
  mist: { attack: 0.035, decay: 0.30, dur: 0.58, k0: 0.15, k1: 0.06, tremHz: 7, tremDepth: 0.25 },
  dusk: { attack: 0.040, decay: 0.36, dur: 0.66, k0: 0.12, k1: 0.045, tremHz: 5, tremDepth: 0.18 },
};

/** level index (the 10-level day arc) → swish recipe name */
export const SWISH_FOR_LEVEL = [
  'breath', 'air', 'mist', 'mist', 'air',
  'dusk', 'air', 'dusk', 'dusk', 'breath',
];

export function makeSwishBank(actx) {
  const sr = actx.sampleRate;
  const bank = {};
  for (const name of Object.keys(SWISH_RECIPES)) {
    const r = SWISH_RECIPES[name];
    bank[name] = [0, 1].map((vnt) => {
      const seed = 0.92 + vnt * 0.16;
      const len = (sr * r.dur) | 0;
      const buf = actx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      let lp = 0, lp2 = 0;
      const tremPhase = Math.random() * Math.PI * 2;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // brightness falls from open to closed across the sound
        const k = (r.k0 - (r.k0 - r.k1) * Math.min(1, t / (r.decay * 1.6 * seed))) / seed;
        lp += ((Math.random() * 2 - 1) - lp) * k;
        lp2 += (lp - lp2) * 0.5;
        let env = Math.min(1, t / (r.attack * seed)) * Math.exp(-t / (r.decay * seed));
        if (r.tremHz) {
          // slow shallow swell — breathing, never a grain train (see header)
          env *= (1 - r.tremDepth) + r.tremDepth
            * (0.5 - 0.5 * Math.cos(2 * Math.PI * r.tremHz * seed * t + tremPhase));
        }
        d[i] = lp2 * env;
      }
      // normalize so every recipe plays at a predictable level
      let peak = 1e-6;
      for (let i = 0; i < len; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
      const g = 1.0 / peak;
      for (let i = 0; i < len; i++) d[i] *= g;
      return buf;
    });
  }
  return bank;
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
 * The ambient drone — the A/E pedal the game has had since round 1, reworked
 * in r17 after the player heard it as "a little rough… buggy?". Two causes,
 * both fixed here:
 *
 *   · the bass oscillator GLIDED between chord basses over ~2 s, sweeping
 *     through every dissonant beating region on the way. Now the bass is a
 *     CROSSFADED PAIR: the new note fades in at pitch while the old fades
 *     out — motion with no wobble;
 *   · the triangle partials + cent-deep pitch LFOs put gritty beating high
 *     harmonics on top. All partials are sine now, and the low ones breathe
 *     in AMPLITUDE (slow gain LFO) instead of pitch; only the top partial
 *     keeps a whisper of detune movement.
 *
 * Routed through the pad bus so the idle breathing filter closes over it too.
 */
export function makeDrone(engine) {
  const actx = engine.actx;

  // crossfaded bass pair (starts on A1)
  const bass = [0, 1].map(() => {
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
    const g = actx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(engine.padBus); o.start();
    return { o, g };
  });
  const BASS_LEVEL = 0.055 * 0.35;
  let bassActive = 0, bassSemis = -1e9;
  bass[0].g.gain.value = BASS_LEVEL;

  // static pedal partials: E2, A2, E3 — all sine, amplitude breathing
  [82.4, 110, 164.8].forEach((f, i) => {
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const base = 0.055 * (0.35 / (i + 2));
    const g = actx.createGain(); g.gain.value = base;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.04 + i * 0.023;
    const lfg = actx.createGain(); lfg.gain.value = base * 0.25;
    lfo.connect(lfg); lfg.connect(g.gain); lfo.start();
    if (i === 2) {
      const dl = actx.createOscillator(); dl.frequency.value = 0.07;
      const dg = actx.createGain(); dg.gain.value = 0.6;   // cents — a whisper
      dl.connect(dg); dg.connect(o.detune); dl.start();
    }
    o.connect(g); g.connect(engine.padBus); o.start();
  });

  return {
    /** crossfade the bass pair to `semis` (from A3) — never glide */
    setBass(semis) {
      if (semis === bassSemis) return;
      bassSemis = semis;
      const t = engine.now();
      const from = bass[bassActive], to = bass[1 - bassActive];
      bassActive = 1 - bassActive;
      to.o.frequency.setValueAtTime(semisToFreq(semis), t);
      to.g.gain.setTargetAtTime(BASS_LEVEL, t, 0.6);
      from.g.gain.setTargetAtTime(0, t, 0.6);
    },
  };
}

/**
 * Chord-following pad: up to `max` continuous voices that crossfade between
 * voicings on chord changes. Voices past the requested count fade to silence
 * (level richness: Still Water breathes on 2 voices, Dreaming of Bliss blooms on 5).
 */
export function makePadBank(engine, max = 5) {
  const actx = engine.actx;
  const voices = [];
  // r26 (the headphone pass): the pad bed used to sum dead-center mono, and
  // on headphones a centered bed sits INSIDE the head while the piano moves
  // around it. Static per-voice spread — mixing practice, not an effect: the
  // lowest voice stays anchored center, uppers fan out progressively.
  const PAD_PAN = [0, -0.18, 0.20, -0.38, 0.42];
  for (let i = 0; i < max; i++) {
    const o = actx.createOscillator();
    // r17: sine below, triangle only for the top sparkle voices, and detune
    // movement halved — part of the "rough hum" was chorus beating here
    o.type = i >= 3 ? 'triangle' : 'sine';
    o.frequency.value = 220;
    const g = actx.createGain(); g.gain.value = 0;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.021;
    const lfg = actx.createGain(); lfg.gain.value = 0.55 + i * 0.2;
    lfo.connect(lfg); lfg.connect(o.detune); lfo.start();
    const pan = actx.createStereoPanner();
    pan.pan.value = PAD_PAN[i % PAD_PAN.length];
    o.connect(g); g.connect(pan); pan.connect(engine.padBus);
    o.start();
    voices.push({ o, g, pan, basePan: PAD_PAN[i % PAD_PAN.length] });
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
    /** r28: width-as-bloom — scale every voice's authored pan by w (0..1);
     *  the conductor drives this from bloom so the image opens with play. */
    setWidth(w) {
      const t = engine.now();
      for (const v of voices) v.pan.pan.setTargetAtTime(v.basePan * w, t, 0.6);
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

/**
 * r28 THE APEX HUM — the fruit whispers the note it would sing. Every fruit
 * already IS a chord role; this makes that legible before the swipe: a very
 * quiet pitched swell (sine + a ghost of its octave), panned to where the
 * fruit will hang, centered on its arc apex. Slicing "resolves" the hum into
 * the piano note; rocks never hum (they are not notes — the silence is the
 * tell). Mostly reverb, a little dry; raw nodes like the riser, no pool.
 */
export function playHum(engine, semis, when, dur, pan) {
  const actx = engine.actx;
  const t = Math.max(when, actx.currentTime);
  const f = semisToFreq(semis);
  const p = actx.createStereoPanner(); p.pan.value = pan;
  const dry = actx.createGain(); dry.gain.value = 0.3;
  p.connect(engine.reverbIn); p.connect(dry); dry.connect(engine.dry);
  [[1, 0.034], [2, 0.011]].forEach(([h, a]) => {
    const o = actx.createOscillator(); o.type = 'sine';
    o.frequency.value = f * h;
    const g = actx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + dur * 0.45);
    g.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.2);
    o.connect(g); g.connect(p);
    o.start(t); o.stop(t + dur * 1.6);
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

/**
 * ── PER-LEVEL TEXTURES — the air in the room ────────────────────────────────
 * The day already changes its notes (palettes, motifs, basses), its cut sound
 * (SWISH_FOR_LEVEL) and its reverb room (engine.SPACES) per level — but the
 * continuous bed timbre was identical from dawn to the coda. This bank is the
 * missing axis: one always-running, whisper-quiet atmosphere per level, fully
 * procedural (the no-assets rule), crossfaded when a level's palette LANDS
 * (conductor.onBar) so the new air arrives out of the r27 hush together with
 * the tonic bloom. Still Water stays null: silence IS its texture, and it
 * makes First Light's first breath of air mean something.
 *
 * Three generator kinds; levels get parameter RECIPES, not code:
 *   · air     — engine.noise looped through a slowly wandering bandpass with
 *               a slow amplitude breathe. Dawn air, open daylight, night dark.
 *   · shimmer — two sine partials (chord root + fifth, high register) with
 *               independent slow swells and a whisper of detune drift,
 *               re-pitched via retune() on every chord change. Heat-haze.
 *   · grains  — sparse Poisson-timed DIEGETIC events: dewdrops (sine pings
 *               on the chord's color tone), rain drips (pitch-rising bloops
 *               with distance-as-depth), ember crackle, crickets. Weather,
 *               never rhythm — the random-on-the-grid slot already belongs
 *               to the sparkle arps, so grains are deliberately NOT
 *               grid-locked.
 *
 * Routing: air + shimmer feed padBus, so the idle breathing filter closes
 * over them and the level-change duck hushes them for free. Grains enter at
 * padDuck (post the breathing lowpass): a 4 kHz cricket or a 3 kHz rain tick
 * would simply vanish under padLp's calm-play cutoff — they keep the duck and
 * the room send, and presence (the conductor's bloom-driven floor) is what
 * settles them when the world goes still.
 *
 * Loudness discipline: everything here sits UNDER the drone (its partials run
 * ~0.01–0.02). If you can point at the texture, it is too loud.
 */
export const TEXTURES = [
  /* 0 Still Water — silence is the texture */
  null,
  /* 1 First Light — the first breath: low slow dawn air */
  { air: { f: 300, q: 1.1, g: 0.018, breathe: 0.5, trem: 0.045, wander: 60 } },
  /* 2 Morning Dew — that air, plus sine-ping dewdrops on the chord's color */
  {
    air: { f: 430, q: 1.2, g: 0.016, breathe: 0.45, trem: 0.06, wander: 80 },
    grains: { kind: 'dew', rate: 0.25, g: 0.045 },
  },
  /* 3 Orchard Rain — the GRAINS carry this level; the air is just damp
   * stillness under them. First-ear pass: breathe 0.4 read as ocean SWELLS
   * ("waves crashing on the beach") and drowned the rain — depth 0.2 is
   * humidity, not surf, and the bed drops ~5 dB out of the drops' way.
   * Second ear pass: 5/s ticks read as "finger taps" — rate 1.1 makes each
   * drop an EVENT (the drop itself is rebuilt as a bloop, see spawnGrain). */
  {
    air: { f: 480, q: 0.9, g: 0.009, breathe: 0.2, trem: 0.05, wander: 70 },
    grains: { kind: 'rain', rate: 1.1, g: 0.12 },
  },
  /* 4 Noon Bloom — bright open air, full sun, no weather (first-ear pass:
   * "a touch loud, could sit deeper in the mix" — 0.017 → 0.011) */
  { air: { f: 950, q: 0.8, g: 0.011, breathe: 0.35, trem: 0.04, wander: 160 } },
  /* 5 Summer Glare — heat HAZE: warm still air + detuned shimmer. The
   * first-ear version was a 5.2 Hz tremolo on a high band — "some wild
   * shaker! way too much" — exactly the r23 grain-train lesson relearned on
   * a new layer. Heavy summer heat doesn't pulse; it shimmers. */
  {
    air: { f: 900, q: 0.8, g: 0.01, breathe: 0.3, trem: 0.05, wander: 110 },
    shimmer: { g: 0.007, det: 6 },
  },
  /* 6 Golden Hour — warm low-mid air + the beating shimmer partials */
  {
    air: { f: 640, q: 0.9, g: 0.018, breathe: 0.4, trem: 0.05, wander: 90 },
    shimmer: { g: 0.01, det: 5 },
  },
  /* 7 Dusk's Edge — darkening air; ultra-sparse low crackle */
  {
    air: { f: 400, q: 1.0, g: 0.017, breathe: 0.5, trem: 0.045, wander: 60 },
    grains: { kind: 'ember', rate: 0.55, g: 0.04 },
  },
  /* 8 Night Jasmine — dark narrow air + rare crickets across the dark */
  {
    air: { f: 270, q: 1.3, g: 0.018, breathe: 0.55, trem: 0.035, wander: 45 },
    grains: { kind: 'cricket', rate: 0.14, g: 0.05 },
  },
  /* 9 Dreaming of Bliss — the widest, softest air + shimmer; the day, gentled */
  {
    air: { f: 500, q: 0.65, g: 0.019, breathe: 0.5, trem: 0.03, wander: 70 },
    shimmer: { g: 0.008, det: 3 },
  },
];

/** Nearest realization of pitch class `pc` to `center` (semitones from A3).
 *  Oscillator-only pitches — no kit-span clamp needed here. */
const placeNear = (pc, center) => pc + 12 * Math.round((center - pc) / 12);

export function makeTexture(engine, harmony) {
  const actx = engine.actx;

  // presence trunk for the filtered layers (air + shimmer) → padBus
  const out = actx.createGain(); out.gain.value = 0;
  out.connect(engine.padBus);
  // grains bypass padLp (see header): into padDuck, so duck + room still apply
  const grainOut = actx.createGain(); grainOut.gain.value = 0;
  grainOut.connect(engine.padDuck);
  // r38b: a presence-scaled DIRECT room trunk for grains that want more
  // reverb than padSend's fixed 0.8 — distance-as-depth for the rain drips
  const grainWet = actx.createGain(); grainWet.gain.value = 0;
  grainWet.connect(engine.reverbIn);

  // ── air: looping noise → wandering bandpass → breathing gain ──────────────
  const airSrc = actx.createBufferSource(); airSrc.buffer = engine.noise; airSrc.loop = true;
  const airBp = actx.createBiquadFilter(); airBp.type = 'bandpass';
  airBp.frequency.value = 400; airBp.Q.value = 1.0;
  const airG = actx.createGain(); airG.gain.value = 0;
  airSrc.connect(airBp); airBp.connect(airG); airG.connect(out);
  airSrc.start();
  const wanderLfo = actx.createOscillator(); wanderLfo.frequency.value = 0.031;
  const wanderG = actx.createGain(); wanderG.gain.value = 0;
  wanderLfo.connect(wanderG); wanderG.connect(airBp.frequency); wanderLfo.start();
  const breatheLfo = actx.createOscillator(); breatheLfo.frequency.value = 0.05;
  const breatheG = actx.createGain(); breatheG.gain.value = 0;
  breatheLfo.connect(breatheG); breatheG.connect(airG.gain); breatheLfo.start();

  // ── shimmer: two partials (root, fifth high), each a crossfaded osc pair
  // (the drone's r17 no-glide trick) with a slow swell and detune drift ─────
  const partials = [24, 31].map((center, i) => {
    const swell = actx.createGain(); swell.gain.value = 1;
    swell.connect(out);
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.041 + i * 0.018;
    const lfg = actx.createGain(); lfg.gain.value = 0.35;
    lfo.connect(lfg); lfg.connect(swell.gain); lfo.start();
    const drift = actx.createOscillator(); drift.frequency.value = 0.05 + i * 0.023;
    const driftG = actx.createGain(); driftG.gain.value = 0;   // cents, set per recipe
    drift.connect(driftG); drift.start();
    const pair = [0, 1].map(() => {
      const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
      const g = actx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(swell);
      driftG.connect(o.detune);
      o.start();
      return { o, g };
    });
    return { center, pair, driftG, active: 0, semis: -1e9, level: 0 };
  });

  let recipe = null;          // TEXTURES[level] (or null)
  let grainRecipe = null;
  let nextGrain = 1e9;        // engine-clock time of the next grain

  // ── the diegetic grains ────────────────────────────────────────────────────
  function spawnGrain(r, when) {
    const vel = 0.7 + Math.random() * 0.3;
    if (r.kind === 'dew') {
      // a dewdrop: one high sine ping on the chord's color tone, tiny
      // downward settle — pitched at spawn time so it can never go stale
      const f = semisToFreq(harmony.noteFor('strawberry', 0));
      const o = actx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.02, when);
      o.frequency.exponentialRampToValueAtTime(f, when + 0.05);
      const g = actx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(r.g * vel, when + 0.004);
      g.gain.setTargetAtTime(0, when + 0.01, 0.16);
      const pan = actx.createStereoPanner(); pan.pan.value = (Math.random() * 2 - 1) * 0.5;
      o.connect(g); g.connect(pan); pan.connect(grainOut);
      o.start(when); o.stop(when + 0.9);
    } else if (r.kind === 'rain') {
      // r38b: a DRIP, not a finger tap. The resonant-tick version was pure
      // transient and the player heard percussion ("finger taps"). A water
      // drop's identity is the BLOOP — classic drop synthesis: a small sine
      // whose pitch RISES as the cavity closes — landed on a chord tone so
      // the orchard drips in key. And DEPTH: each drop falls at a random
      // distance — far ones quieter, duller, panned wider and mostly room
      // (the grainWet trunk); near ones bright and dry, with a whisper of
      // splash noise. Rain becomes a place, not a pattern.
      const dist = Math.random();                    // 0 near … 1 far
      const amp = r.g * vel * (1 - 0.72 * dist);
      const chord = harmony.chord();
      const pc = chord.tones[(Math.random() * chord.tones.length) | 0];
      const f = semisToFreq(placeNear(pc, 12 + ((Math.random() * 8) | 0)));
      const pan = actx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * (0.3 + 0.5 * dist);
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 4600 - 3200 * dist;       // far = duller
      lp.connect(pan); pan.connect(grainOut);
      const wetG = actx.createGain(); wetG.gain.value = 0.3 + 1.1 * dist;
      pan.connect(wetG); wetG.connect(grainWet);
      const o = actx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 0.8, when);
      o.frequency.exponentialRampToValueAtTime(f, when + 0.035 + 0.05 * Math.random());
      const g = actx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp, when + 0.007);
      g.gain.setTargetAtTime(0, when + 0.015, 0.055 + 0.05 * (1 - dist));
      o.connect(g); g.connect(lp);
      o.start(when); o.stop(when + 0.6);
      if (dist < 0.4) {
        // the splash whisper, near drops only: 20 ms of high air beside the bloop
        const src = actx.createBufferSource(); src.buffer = engine.noise;
        const bp = actx.createBiquadFilter(); bp.type = 'bandpass';
        bp.frequency.value = 3200 + Math.random() * 1500; bp.Q.value = 2.5;
        const ng = actx.createGain();
        ng.gain.setValueAtTime(0, when);
        ng.gain.linearRampToValueAtTime(amp * 0.25, when + 0.003);
        ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
        src.connect(bp); bp.connect(ng); ng.connect(lp);
        src.start(when, Math.random() * 0.9, 0.03);
      }
    } else if (r.kind === 'ember') {
      // an ember pop: short low-mid crackle, sometimes a settling second
      const src = actx.createBufferSource(); src.buffer = engine.noise;
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 400 + Math.random() * 500; bp.Q.value = 3;
      const g = actx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(r.g * vel, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
      const pan = actx.createStereoPanner(); pan.pan.value = (Math.random() * 2 - 1) * 0.4;
      src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(grainOut);
      src.start(when, Math.random() * 0.9, 0.04);
      if (Math.random() < 0.3) spawnGrain({ ...r, g: r.g * 0.5 }, when + 0.04 + Math.random() * 0.05);
    } else if (r.kind === 'cricket') {
      // a cricket chirp: 3–4 pulses of a ~4 kHz sine — unpitched on purpose,
      // this high it is diegesis, not harmony
      const o = actx.createOscillator(); o.type = 'sine';
      o.frequency.value = 3700 + Math.random() * 600;
      const g = actx.createGain(); g.gain.value = 0;
      const pan = actx.createStereoPanner(); pan.pan.value = (Math.random() * 2 - 1) * 0.7;
      o.connect(g); g.connect(pan); pan.connect(grainOut);
      const pulses = 3 + ((Math.random() * 2) | 0);
      let t = when;
      for (let k = 0; k < pulses; k++) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(r.g * vel, t + 0.012);
        g.gain.linearRampToValueAtTime(0, t + 0.03);
        t += 0.055;
      }
      o.start(when); o.stop(t + 0.05);
    }
  }

  return {
    /** Crossfade to level `l`'s recipe over `fade` seconds. Called by the
     *  conductor when a palette LANDS, never when the level is merely set. */
    setLevel(l, fade = 5) {
      recipe = TEXTURES[Math.max(0, Math.min(TEXTURES.length - 1, l | 0))] || null;
      const t = engine.now();
      const k = Math.max(0.3, fade * 0.4);
      const a = recipe && recipe.air;
      if (a) {
        airBp.frequency.setTargetAtTime(a.f, t, k);
        airBp.Q.setTargetAtTime(a.q, t, k);
        airG.gain.setTargetAtTime(a.g, t, k);
        // breathe depth rides the base so the sum can never swing negative
        breatheG.gain.setTargetAtTime(a.g * a.breathe, t, k);
        breatheLfo.frequency.setTargetAtTime(a.trem, t, k);
        wanderG.gain.setTargetAtTime(a.wander, t, k);
      } else {
        airG.gain.setTargetAtTime(0, t, k);
        breatheG.gain.setTargetAtTime(0, t, k);
      }
      const sh = recipe && recipe.shimmer;
      for (const p of partials) {
        p.level = sh ? sh.g : 0;
        p.driftG.gain.setTargetAtTime(sh ? sh.det : 0, t, k);
      }
      this.retune(fade);
      grainRecipe = (recipe && recipe.grains) || null;
    },

    /** Re-aim the shimmer partials at the current chord (root + fifth). */
    retune(fade = 1.5) {
      const chord = harmony.chord();
      const t = engine.now();
      const k = Math.max(0.3, fade * 0.4);
      const pcs = [chord.tones[0], (chord.tones[0] + 7) % 12];
      for (let i = 0; i < partials.length; i++) {
        const p = partials[i];
        const semis = placeNear(pcs[i], p.center);
        if (semis === p.semis) {
          // pitch unchanged — just track the level on the sounding osc
          p.pair[p.active].g.gain.setTargetAtTime(p.level, t, k);
          continue;
        }
        const from = p.pair[p.active], to = p.pair[1 - p.active];
        p.active = 1 - p.active; p.semis = semis;
        to.o.frequency.setValueAtTime(semisToFreq(semis), t);
        to.g.gain.setTargetAtTime(p.level, t, k);
        from.g.gain.setTargetAtTime(0, t, k);
      }
    },

    /** Bloom-driven presence (conductor.frame): floor + growth, 0 when the
     *  background cap is off. One value scales air, shimmer AND grains. */
    setPresence(p) {
      const t = engine.now();
      out.gain.setTargetAtTime(p, t, 0.6);
      grainOut.gain.setTargetAtTime(p, t, 0.6);
      grainWet.gain.setTargetAtTime(p, t, 0.6);
    },

    /** Emit Poisson-timed grains inside [now, until) — called every frame
     *  with the conductor's own look-ahead horizon, actx clock throughout. */
    schedule(now, until) {
      if (!grainRecipe) { nextGrain = until + 0.05; return; }
      // a long suspend leaves the cursor in the past; jump, don't catch up
      if (nextGrain < now - 0.5) nextGrain = now + 0.1 + Math.random() * 0.4;
      while (nextGrain < until) {
        spawnGrain(grainRecipe, Math.max(nextGrain, now));
        nextGrain += -Math.log(1 - Math.random()) / grainRecipe.rate;
      }
    },
  };
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
