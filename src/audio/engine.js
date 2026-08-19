/**
 * engine.js — the Web Audio plumbing under audio.js. No musical opinions here:
 * context lifecycle, the master chain, the procedural reverb, and the voice
 * pools. Everything musical (what note, when) lives in harmony/conductor;
 * everything that makes a sound at all goes through this file.
 *
 * ── Master chain ────────────────────────────────────────────────────────────
 *
 *   voice → pan ─┬────────────────────→ dry ─┐
 *                └→ send → reverbIn           ├→ compressor → master → destination
 *        reverbIn → convolver(IR) → wet ──────┘
 *
 * The compressor is not a mastering flourish — it is the reason a five-note
 * chord over the pad over the bass pulse cannot clip. Gain staging elsewhere
 * assumes it exists.
 *
 * ── Voice pools ─────────────────────────────────────────────────────────────
 * The known frame spike in this game is the slice instant (cutGeometry
 * allocates on the main thread at the exact moment the player is watching).
 * The old audio.js added 11 fresh AudioNodes to that same instant. Pools are
 * built once at ensure(); a "play" is one BufferSource (they are one-shot by
 * spec — the only node that MUST be fresh) + a connect + a few param
 * schedules. Pool exhaustion steals the voice that ends soonest, with a 10 ms
 * fade so the steal is click-free.
 */

const FADE = 0.01; // voice-steal fade, seconds

export function createEngine() {
  const eng = {
    ready: false,
    actx: null,
    dry: null, reverbIn: null, wet: null, master: null, comp: null,
    padBus: null, padLp: null, padGain: null,
    noise: null,          // shared 1 s white-noise buffer (shhk, risers, hammer)
    nodesCreated: 0,      // steady-state pool-integrity counter for the harness
  };

  let pianoPool = [], shhkPool = [], thumpPool = [];
  let pianoCap = 16;
  let wetBase = 0.35, wetScale = 1.0;

  eng.now = () => (eng.actx ? eng.actx.currentTime : 0);

  eng.ensure = () => {
    if (eng.actx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const actx = (eng.actx = new AC());
    eng.nodesCreated = 0;
    const mk = (n) => { eng.nodesCreated++; return n; };

    eng.master = mk(actx.createGain()); eng.master.gain.value = 0.0;
    eng.comp = mk(actx.createDynamicsCompressor());
    eng.comp.threshold.value = -16; eng.comp.knee.value = 18;
    eng.comp.ratio.value = 3; eng.comp.attack.value = 0.004; eng.comp.release.value = 0.18;
    eng.comp.connect(eng.master); eng.master.connect(actx.destination);

    eng.dry = mk(actx.createGain()); eng.dry.gain.value = 1.0; eng.dry.connect(eng.comp);
    eng.reverbIn = mk(actx.createGain()); eng.reverbIn.gain.value = 1.0;
    eng.wet = mk(actx.createGain()); eng.wet.gain.value = wetBase * wetScale;
    const conv = mk(actx.createConvolver());
    conv.buffer = makeIR(actx, 2.4);
    eng.reverbIn.connect(conv); conv.connect(eng.wet); eng.wet.connect(eng.comp);

    // pad bus: its lowpass is the "breathing" filter the conductor drives.
    // r17: the pad/drone route AROUND the compressor, straight into master —
    // the player heard the comp duck the drone under every piano hit, and a
    // sustained bed that pumps with the notes reads as "rough… buggy?". The
    // percussive material still compresses; the bed stays still.
    eng.padLp = mk(actx.createBiquadFilter());
    eng.padLp.type = 'lowpass'; eng.padLp.frequency.value = 2200; eng.padLp.Q.value = 0.4;
    eng.padGain = mk(actx.createGain()); eng.padGain.gain.value = 1.0;
    eng.padBus = mk(actx.createGain()); eng.padBus.gain.value = 1.0;
    eng.padBus.connect(eng.padLp); eng.padLp.connect(eng.padGain);
    eng.padGain.connect(eng.master);
    const padSend = mk(actx.createGain()); padSend.gain.value = 0.8;
    eng.padGain.connect(padSend); padSend.connect(eng.reverbIn);

    // shared noise buffer (same trick as the old audio.js, kept)
    const len = (actx.sampleRate * 1.0) | 0;
    eng.noise = actx.createBuffer(1, len, actx.sampleRate);
    const d = eng.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // ── pools ────────────────────────────────────────────────────────────────
    const mkPiano = () => {
      const lpf = mk(actx.createBiquadFilter()); lpf.type = 'lowpass'; lpf.frequency.value = 6000; lpf.Q.value = 0.2;
      const gain = mk(actx.createGain()); gain.gain.value = 0.0;
      const pan = mk(actx.createStereoPanner());
      const send = mk(actx.createGain()); send.gain.value = 0.5;
      lpf.connect(gain); gain.connect(pan); pan.connect(eng.dry);
      pan.connect(send); send.connect(eng.reverbIn);
      return { lpf, gain, pan, send, src: null, until: 0 };
    };
    const mkSwish = () => {
      // r18: highpass INTO lowpass. The r17 chain let the buffer's low-mid
      // energy through and the player heard "a ruler slapped against a trash
      // can" — the 350 Hz highpass removes the bin, the lowpass still tracks
      // velocity and sweeps darker through the sound.
      const hp = mk(actx.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 350; hp.Q.value = 0.4;
      const lp = mk(actx.createBiquadFilter()); lp.type = 'lowpass'; lp.Q.value = 0.5;
      const gain = mk(actx.createGain()); gain.gain.value = 0.0;
      const pan = mk(actx.createStereoPanner());
      hp.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(eng.dry);
      const send = mk(actx.createGain()); send.gain.value = 0.35;
      pan.connect(send); send.connect(eng.reverbIn);
      return { hp, lp, gain, pan, src: null, until: 0 };
    };
    const mkThump = () => {
      const gain = mk(actx.createGain()); gain.gain.value = 0.0;
      gain.connect(eng.dry); // low frequencies stay centered — they pan badly
      return { gain, src: null, until: 0 };
    };
    pianoPool = []; for (let i = 0; i < 16; i++) pianoPool.push(mkPiano());
    shhkPool = []; for (let i = 0; i < 6; i++) shhkPool.push(mkSwish());
    thumpPool = []; for (let i = 0; i < 4; i++) thumpPool.push(mkThump());

    eng.ready = true;
    return true;
  };

  /** Acquire from a pool: first free voice, else steal the one ending soonest. */
  function acquire(pool, cap, when) {
    let free = null, oldest = null;
    const n = Math.min(pool.length, cap);
    for (let i = 0; i < n; i++) {
      const v = pool[i];
      if (v.until <= when) { free = v; break; }
      if (!oldest || v.until < oldest.until) oldest = v;
    }
    const v = free || oldest;
    if (!free && v.src) {
      // click-free steal: yank the envelope down, stop the old source
      v.gain.gain.cancelScheduledValues(when);
      v.gain.gain.setTargetAtTime(0, when, FADE * 0.35);
      try { v.src.stop(when + FADE); } catch (_) { /* already stopped */ }
    }
    return v;
  }

  /**
   * Play a pre-rendered buffer (piano note, thump) through a pooled voice.
   * The buffer carries its own amplitude envelope; `gain` is just level.
   */
  eng.playPiano = (buffer, rate, when, gain, pan, brightHz, wet = 0.5) => {
    const actx = eng.actx;
    const v = acquire(pianoPool, pianoCap, when);
    const t = Math.max(when, actx.currentTime);
    const src = actx.createBufferSource();
    src.buffer = buffer; src.playbackRate.value = rate;
    src.connect(v.lpf);
    v.lpf.frequency.setValueAtTime(brightHz, t);
    v.send.gain.setValueAtTime(wet, t);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(0, t);
    v.gain.gain.linearRampToValueAtTime(gain, t + 0.004);
    v.pan.pan.setValueAtTime(pan, t);
    src.start(t);
    const dur = buffer.duration / rate;
    src.stop(t + dur + 0.05);
    v.src = src; v.until = t + dur;
    return v;
  };

  eng.playThump = (buffer, rate, when, gain) => {
    const actx = eng.actx;
    const v = acquire(thumpPool, thumpPool.length, when);
    const t = Math.max(when, actx.currentTime);
    const src = actx.createBufferSource();
    src.buffer = buffer; src.playbackRate.value = rate;
    src.connect(v.gain);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(gain, t);
    src.start(t);
    const dur = buffer.duration / rate;
    src.stop(t + dur + 0.05);
    v.src = src; v.until = t + dur;
  };

  /** The cut: a pre-rendered swish buffer (self-enveloped texture),
   *  rate-varied so no two cuts are identical, through a highpass + a
   *  velocity-tracked lowpass. Overlapping swishes DUCK each other — the
   *  gain divides by the count already sounding, so a flurry of strokes
   *  reads as one continuous breeze instead of a clatter. */
  eng.playSwish = (buffer, rate, when, loud, cutoffHz, pan) => {
    const actx = eng.actx;
    const t0 = Math.max(when, actx.currentTime);
    let active = 0;
    for (const s of shhkPool) if (s.until > t0) active++;
    const v = acquire(shhkPool, shhkPool.length, when);
    const t = t0;
    const src = actx.createBufferSource();
    src.buffer = buffer; src.playbackRate.value = rate;
    src.connect(v.hp);
    v.lp.frequency.cancelScheduledValues(t);
    v.lp.frequency.setValueAtTime(cutoffHz, t);
    v.lp.frequency.exponentialRampToValueAtTime(Math.max(400, cutoffHz * 0.35), t + 0.2);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(0, t);
    v.gain.gain.linearRampToValueAtTime(loud / (1 + 0.7 * active), t + 0.008);
    v.pan.pan.setValueAtTime(pan, t);
    src.start(t);
    const dur = buffer.duration / rate;
    src.stop(t + dur + 0.02);
    v.src = src; v.until = t + dur;
  };

  eng.voicesActive = () => {
    const now = eng.now();
    let n = 0;
    for (const v of pianoPool) if (v.until > now) n++;
    for (const v of shhkPool) if (v.until > now) n++;
    for (const v of thumpPool) if (v.until > now) n++;
    return n;
  };

  eng.setPianoCap = (n) => { pianoCap = Math.max(2, Math.min(pianoPool.length, n)); };
  eng.setWetScale = (s) => {
    wetScale = s;
    if (eng.wet) eng.wet.gain.setTargetAtTime(wetBase * wetScale, eng.now(), 0.25);
  };
  eng.setMaster = (v, tau = 0.8) => {
    if (eng.master) eng.master.gain.setTargetAtTime(v, eng.now(), tau);
  };

  /** Safe to call any time, from any path — resume() rejections are expected
   *  on iOS outside a gesture and simply mean "try again from the next tap". */
  eng.resume = () => { try { eng.actx?.resume?.()?.catch?.(() => { }); } catch (_) { /* */ } };
  eng.suspend = () => { try { eng.actx?.suspend?.()?.catch?.(() => { }); } catch (_) { /* */ } };
  eng.dispose = () => { try { eng.actx?.close?.(); } catch (_) { /* */ } };

  return eng;
}

/**
 * Procedural reverb impulse: exponentially decaying noise, one independent
 * channel per side (the decorrelation IS the stereo width), with the high end
 * dying faster than the low end via a cheap one-pole that closes over time —
 * the difference between "noise tail" and "room".
 */
function makeIR(actx, seconds) {
  const sr = actx.sampleRate, len = (sr * seconds) | 0;
  const buf = actx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, 2.1) * Math.exp(-3.1 * t);
      // one-pole lowpass whose coefficient tightens as the tail decays
      const k = 0.22 + 0.55 * t;
      lp += ((Math.random() * 2 - 1) - lp) * (1 - k);
      d[i] = lp * env;
    }
    // 12 ms fade-in so the early reflections don't read as a slapback click
    const fadeIn = Math.min(len, (sr * 0.012) | 0);
    for (let i = 0; i < fadeIn; i++) d[i] *= i / fadeIn;
  }
  return buf;
}
