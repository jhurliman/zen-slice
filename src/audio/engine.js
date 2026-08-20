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
  // The whole engine surface is declared here, including members filled in
  // later (the ensure() nodes, and every method below). JS tooling infers this
  // object's type from the literal alone, so a member that first appears as
  // `eng.foo = ...` reads as "may not exist on type" at every call site
  // (ts 2568). Declaring it null costs nothing at runtime and keeps this
  // literal an honest table of contents for the file.
  const eng = {
    ready: false,
    actx: null,
    // master chain, built by ensure()
    dry: null, reverbIn: null, wet: null, master: null, comp: null,
    warmth: null, air: null, trim: null, rumble: null, limiter: null, clip: null,
    padBus: null, padLp: null, padGain: null, padDuck: null,
    noise: null,          // shared 1 s white-noise buffer (shhk, risers, hammer)
    nodesCreated: 0,      // steady-state pool-integrity counter for the harness
    // lifecycle
    now: null, ensure: null, resume: null, suspend: null, dispose: null,
    cycle: null, kick: null,
    // voices
    playPiano: null, playThump: null, playSwish: null,
    voiceDebug: null, voicesActive: null, setPianoCap: null,
    // mix
    setMaster: null, setWetScale: null, setSpace: null, space: null,
    duckBed: null, setVoicing: null, getVoicing: null, meter: null,
  };

  let pianoPool = [], shhkPool = [], thumpPool = [];
  let pianoCap = 16;
  // r30: wetBase 0.35 → 0.4725 — the owner's device tuning (?tune space
  // 1.35) baked in. Every baked value below keeps the tuner macro at 1 ==
  // this new shipped baseline, so future tuning stays relative.
  let wetBase = 0.4725, wetScale = 1.0;
  // r27 state: the space crossfade pair, the ?tune voicing, the lazy meter
  let convs = null, convGain = null, spaceActive = 0, spaceName = 'open';
  const irCache = {};
  let noteScale = 1.0, swishScale = 1.0, spaceScale = 1.0;
  let voicing = { air: 0, warmth: 0, space: 1, bed: 1, note: 1, swish: 1, glue: 1, master: 1 };
  let analyser = null, meterTime = null, meterFreq = null;

  eng.now = () => (eng.actx ? eng.actx.currentTime : 0);

  eng.ensure = () => {
    if (eng.actx) return true;
    // bracket access on the prefixed constructor: it is not in lib.dom, and
    // dot access reads to JS tooling as a misspelling of AudioContext
    const AC = window.AudioContext || window['webkitAudioContext'];
    if (!AC) return false;
    // r22: latencyHint 'interactive' is the default on paper, but say it out
    // loud — the slice sound's whole job is immediacy. Legacy webkit
    // constructors may reject an options bag; fall back bare.
    let actx;
    try { actx = new AC({ latencyHint: 'interactive' }); } catch (_) { actx = new AC(); }
    eng.actx = actx;
    eng.nodesCreated = 0;
    const mk = (n) => { eng.nodesCreated++; return n; };

    eng.master = mk(actx.createGain()); eng.master.gain.value = 0.0;
    eng.comp = mk(actx.createDynamicsCompressor());
    // r30 baked (?tune glue 1.2): threshold −16 → −17.6, ratio 3 → 3.3
    eng.comp.threshold.value = -17.6; eng.comp.knee.value = 18;
    eng.comp.ratio.value = 3.3; eng.comp.attack.value = 0.004; eng.comp.release.value = 0.18;
    // r27, the voicing shelves (the ?tune macros' tonal half). Both sit AFTER
    // master so they shape the whole mix, pads included; both are flat (0 dB)
    // in the shipped voicing, so the retail signal path is bit-transparent
    // until a tuning session moves them.
    eng.warmth = mk(actx.createBiquadFilter());
    eng.warmth.type = 'lowshelf'; eng.warmth.frequency.value = 240; eng.warmth.gain.value = 0;
    eng.air = mk(actx.createBiquadFilter());
    eng.air.type = 'highshelf'; eng.air.frequency.value = 7500; eng.air.gain.value = 0;
    // trim: the ?tune master macro — separate from eng.master, which the mute
    // fader and visibilitychange own
    eng.trim = mk(actx.createGain()); eng.trim.gain.value = 1.0;
    // r26 mastering insert #1: a 28 Hz rumble highpass between master and the
    // hardware. Nothing musical lives below it (the drone's A1 bass is 55 Hz,
    // the rock thump's tail ends at 45 Hz) but noise-derived buffers carry a
    // little sub-30 energy, and on headphones that reads as pressure, not
    // sound. Everything audible passes untouched.
    eng.rumble = mk(actx.createBiquadFilter());
    eng.rumble.type = 'highpass'; eng.rumble.frequency.value = 28; eng.rumble.Q.value = 0.5;
    // mastering insert #2, THE SAFETY LIMITER — the only brickwall before the
    // DAC. The musical compressor (comp) sits BEFORE master and the pad/
    // texture bed routes AROUND it by design (r17: a bed that pumps under
    // piano hits reads as broken), so nothing bounded the SUM — at Golden
    // Hour density the player heard the overflow as a "lofi digital chirp"
    // (DAC clipping). No knee, 20:1, near-instant attack: it only ever
    // touches the overs; at retail levels it passes bit-transparent.
    eng.limiter = mk(actx.createDynamicsCompressor());
    eng.limiter.threshold.value = -3; eng.limiter.knee.value = 0;
    eng.limiter.ratio.value = 20; eng.limiter.attack.value = 0.001; eng.limiter.release.value = 0.12;
    // mastering insert #3, THE TRANSIENT CEILING (r38b). The limiter alone
    // still chirped on 4-fruit chords (2 of 3): DynamicsCompressor has NO
    // LOOKAHEAD, so the first ~1 ms of a stacked transient — anchor accent +
    // rolled chord + grand run over the full bed — rides through its attack
    // and clips the DAC anyway. A WaveShaper is instantaneous: exactly linear
    // below −6 dBFS, a tanh shoulder above (ceiling ~0.88 FS), so overs
    // SATURATE smoothly instead of wrapping, and 4× oversampling keeps the
    // shoulder's harmonics from aliasing — aliased clipping IS the "lofi
    // digital chirp". Retail program lives under the knee; bit-transparent.
    eng.clip = mk(actx.createWaveShaper());
    {
      const N = 4096, curve = new Float32Array(N), knee = 0.5;
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x);
        curve[i] = Math.sign(x) * (a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
      }
      eng.clip.curve = curve; eng.clip.oversample = '4x';
    }
    eng.comp.connect(eng.master);
    eng.master.connect(eng.warmth); eng.warmth.connect(eng.air);
    eng.air.connect(eng.trim); eng.trim.connect(eng.rumble);
    eng.rumble.connect(eng.limiter);
    eng.limiter.connect(eng.clip);
    eng.clip.connect(actx.destination);

    eng.dry = mk(actx.createGain()); eng.dry.gain.value = 1.0; eng.dry.connect(eng.comp);
    eng.reverbIn = mk(actx.createGain()); eng.reverbIn.gain.value = 1.0;
    eng.wet = mk(actx.createGain()); eng.wet.gain.value = wetBase * wetScale;
    // r27: TWO convolvers, crossfaded — the room changes with the day (see
    // SPACES and setSpace below). A ConvolverNode's buffer cannot be swapped
    // audibly mid-tail, so space changes fade between a live pair instead.
    convGain = [mk(actx.createGain()), mk(actx.createGain())];
    convGain[0].gain.value = 1; convGain[1].gain.value = 0;
    convs = [mk(actx.createConvolver()), mk(actx.createConvolver())];
    convs[0].buffer = spaceIR(actx, 'open');
    for (let i = 0; i < 2; i++) {
      eng.reverbIn.connect(convs[i]); convs[i].connect(convGain[i]); convGain[i].connect(eng.wet);
    }
    eng.wet.connect(eng.comp);

    // pad bus: its lowpass is the "breathing" filter the conductor drives.
    // r17: the pad/drone route AROUND the compressor, straight into master —
    // the player heard the comp duck the drone under every piano hit, and a
    // sustained bed that pumps with the notes reads as "rough… buggy?". The
    // percussive material still compresses; the bed stays still.
    eng.padLp = mk(actx.createBiquadFilter());
    eng.padLp.type = 'lowpass'; eng.padLp.frequency.value = 2200; eng.padLp.Q.value = 0.4;
    eng.padGain = mk(actx.createGain()); eng.padGain.gain.value = 1.15;   // r30 baked (?tune bed 1.15)
    // r27: the DUCK node — a separate stage so the breathing (duckBed) and
    // the ?tune bed macro (padGain) never fight over one AudioParam
    eng.padDuck = mk(actx.createGain()); eng.padDuck.gain.value = 1.0;
    eng.padBus = mk(actx.createGain()); eng.padBus.gain.value = 1.0;
    eng.padBus.connect(eng.padLp); eng.padLp.connect(eng.padGain);
    eng.padGain.connect(eng.padDuck); eng.padDuck.connect(eng.master);
    const padSend = mk(actx.createGain()); padSend.gain.value = 0.8;
    eng.padDuck.connect(padSend); padSend.connect(eng.reverbIn);

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
    // r20: the pool doubles — the contact tick and the wet thump both play
    // through it, per fruit, so a 3-fruit combo is six one-shots in one tick
    thumpPool = []; for (let i = 0; i < 8; i++) thumpPool.push(mkThump());

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
    v.gain.gain.linearRampToValueAtTime(gain * noteScale, t + 0.004);
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
    v.gain.gain.linearRampToValueAtTime((loud * swishScale) / (1 + 0.7 * active), t + 0.008);
    v.pan.pan.setValueAtTime(pan, t);
    src.start(t);
    const dur = buffer.duration / rate;
    src.stop(t + dur + 0.02);
    v.src = src; v.until = t + dur;
  };

  /** Diagnostic: seconds of remaining life per piano voice (negative = idle). */
  eng.voiceDebug = () => {
    const now = eng.now();
    return pianoPool.map((v) => +(v.until - now).toFixed(2));
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
    if (eng.wet) eng.wet.gain.setTargetAtTime(wetBase * wetScale * spaceScale, eng.now(), 0.25);
  };
  eng.setMaster = (v, tau = 0.8) => {
    if (eng.master) eng.master.gain.setTargetAtTime(v, eng.now(), tau);
  };

  /**
   * r27: the day changes the room. Crossfade the convolver pair to the named
   * space over `fade` seconds — dawn is close and intimate, noon open, night
   * vast and dark. IRs are generated once, lazily, and cached (a few ms of
   * synchronous math each). A no-op when the space is already current.
   */
  eng.setSpace = (name, fade = 6) => {
    if (!eng.ready || !SPACES[name] || name === spaceName) return;
    spaceName = name;
    const t = eng.now();
    const next = 1 - spaceActive;
    convs[next].buffer = spaceIR(eng.actx, name);
    convGain[next].gain.cancelScheduledValues(t);
    convGain[spaceActive].gain.cancelScheduledValues(t);
    convGain[next].gain.setTargetAtTime(1, t, fade * 0.33);
    convGain[spaceActive].gain.setTargetAtTime(0, t, fade * 0.33);
    spaceActive = next;
  };
  eng.space = () => spaceName;

  /**
   * r27: the mix BREATHES — duck the pad/drone bed and bloom it back. Used
   * for the sidechain moment after a big harmony (the world making room for
   * the player's chord, then swelling back) and for the hush before a level
   * lands. Depth is linear gain (0.6 = about −4.4 dB), release is a time
   * constant so the bloom-back is long and soft.
   */
  eng.duckBed = (depth = 0.6, hold = 0.4, release = 2.2, attack = 0.08) => {
    if (!eng.ready) return;
    const t = eng.now();
    const g = eng.padDuck.gain;
    g.cancelScheduledValues(t);
    // r38g: `attack` is a parameter now. The chord sidechain needs ~0.03 —
    // flush() ducks ≤30 ms before the notes land, and at the old fixed 0.08
    // the bed was still ~70% up when the transient stack hit, so the duck
    // made room AFTER the peak it existed to make room for. The level-change
    // hush keeps the soft default.
    g.setTargetAtTime(depth, t, attack);
    g.setTargetAtTime(1.0, t + hold, release / 3);
  };

  /**
   * r27: the ?tune voicing — eight macro parameters over curated bundles.
   * All identity at ship values; every setter is smoothed so live tuning
   * never clicks. `air`/`warmth` in dB (±), the rest linear scales.
   */
  eng.setVoicing = (v) => {
    voicing = Object.assign({}, voicing, v);
    if (!eng.ready) return;
    const t = eng.now();
    eng.air.gain.setTargetAtTime(voicing.air, t, 0.1);
    eng.warmth.gain.setTargetAtTime(voicing.warmth, t, 0.1);
    spaceScale = voicing.space;
    eng.wet.gain.setTargetAtTime(wetBase * wetScale * spaceScale, t, 0.1);
    eng.padGain.gain.setTargetAtTime(1.15 * voicing.bed, t, 0.1);   // r30: 1 = baked bed
    noteScale = voicing.note;
    swishScale = voicing.swish;
    // glue 1 = the r30 baked −17.6 dB / 3.3:1; span re-centered around it
    eng.comp.threshold.setTargetAtTime(-9.6 - 8 * voicing.glue, t, 0.1);
    eng.comp.ratio.setTargetAtTime(1.8 + 1.5 * voicing.glue, t, 0.1);
    eng.trim.gain.setTargetAtTime(voicing.master, t, 0.1);
  };
  eng.getVoicing = () => Object.assign({}, voicing);

  /**
   * r27: the mix meter (?debug). Lazy AnalyserNode tapped after the whole
   * voicing chain, so the numbers describe what the hardware receives.
   * Returns dBFS-ish figures: RMS and peak from the time domain, and three
   * band levels (lo <250 Hz, mid 250–2k, hi >2k) from the magnitude bins.
   */
  eng.meter = () => {
    if (!eng.ready) return null;
    if (!analyser) {
      analyser = eng.actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      // tapped POST-ceiling so the numbers stay "what the hardware receives"
      eng.clip.connect(analyser);
      meterTime = new Float32Array(analyser.fftSize);
      meterFreq = new Float32Array(analyser.frequencyBinCount);
    }
    analyser.getFloatTimeDomainData(meterTime);
    let sum = 0, peak = 0;
    for (let i = 0; i < meterTime.length; i++) {
      const a = meterTime[i];
      sum += a * a;
      const ab = Math.abs(a);
      if (ab > peak) peak = ab;
    }
    const dB = (x) => (x > 1e-7 ? Math.max(-90, 20 * Math.log10(x)) : -90);
    analyser.getFloatFrequencyData(meterFreq);
    const sr = eng.actx.sampleRate, binHz = sr / analyser.fftSize;
    const band = (lo, hi) => {
      let acc = 0, n = 0;
      for (let i = Math.max(1, (lo / binHz) | 0); i < Math.min(meterFreq.length, (hi / binHz) | 0); i++) {
        acc += meterFreq[i]; n++;
      }
      return n ? Math.round(acc / n) : -90;
    };
    return {
      rms: Math.round(dB(Math.sqrt(sum / meterTime.length))),
      peak: Math.round(dB(peak)),
      lo: band(30, 250), mid: band(250, 2000), hi: band(2000, 12000),
    };
  };

  /** Lazy, cached IR lookup for the space pair (a few ms of math, once). */
  function spaceIR(actx, name) {
    if (!irCache[name]) irCache[name] = makeIR(actx, SPACES[name]);
    return irCache[name];
  }

  /** Safe to call any time, from any path — resume() rejections are expected
   *  on iOS outside a gesture and simply mean "try again from the next tap". */
  eng.resume = () => { try { eng.actx?.resume?.()?.catch?.(() => { }); } catch (_) { /* */ } };
  eng.suspend = () => { try { eng.actx?.suspend?.()?.catch?.(() => { }); } catch (_) { /* */ } };
  eng.dispose = () => { try { eng.actx?.close?.(); } catch (_) { /* */ } };

  /** The ZOMBIE cure (r36): a suspend→resume CYCLE. After a WKWebView
   *  background/resume the context can claim 'running' with a frozen clock
   *  and a dead render pipeline — resume() alone is a no-op on a context
   *  that already says it is running, so the only lever WebKit gives us is
   *  a full state round-trip, which rebuilds the pipeline. If the resume
   *  half is rejected (no gesture), the context parks at 'suspended' —
   *  a state the watchdog and the permanent tap listeners already revive. */
  eng.cycle = () => {
    try {
      const a = eng.actx; if (!a) return;
      const go = () => { try { a.resume?.()?.catch?.(() => { }); } catch (_) { /* */ } };
      const p = a.suspend?.();
      if (p && p.then) p.then(go, go); else go();
    } catch (_) { /* */ }
  };
  /** One silent frame straight to the destination — wakes the render thread
   *  after a cycle. Inaudible, O(1), source is one-shot garbage. */
  eng.kick = () => {
    try {
      const a = eng.actx; if (!a) return;
      const s = a.createBufferSource();
      s.buffer = a.createBuffer(1, 1, a.sampleRate);
      s.connect(a.destination); s.start(0);
    } catch (_) { /* */ }
  };

  return eng;
}

/**
 * r27: the three rooms of the day. `seconds` is tail length, k0→k1 the
 * darkening one-pole coefficients (higher = darker), `pre` the fade-in that
 * stands in for predelay — longer predelay reads as a bigger room.
 *   dawn  — short, close, slightly veiled: the world at arm's length
 *   open  — the shipped r16 room: mid-size, balanced (noon)
 *   night — long, dark, far away: the vast end of the arc
 */
const SPACES = {
  dawn: { seconds: 1.7, k0: 0.30, k1: 0.85, pre: 0.008 },
  open: { seconds: 2.4, k0: 0.22, k1: 0.77, pre: 0.012 },
  night: { seconds: 3.8, k0: 0.30, k1: 0.92, pre: 0.026 },
};

/**
 * Procedural reverb impulse: exponentially decaying noise, one independent
 * channel per side (the decorrelation IS the stereo width), with the high end
 * dying faster than the low end via a cheap one-pole that closes over time —
 * the difference between "noise tail" and "room".
 */
function makeIR(actx, spec) {
  const sr = actx.sampleRate, len = (sr * spec.seconds) | 0;
  const buf = actx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, 2.1) * Math.exp(-3.1 * t);
      // one-pole lowpass whose coefficient tightens as the tail decays
      const k = spec.k0 + (spec.k1 - spec.k0) * t;
      lp += ((Math.random() * 2 - 1) - lp) * (1 - k);
      d[i] = lp * env;
    }
    // fade-in: early-reflection softness AND the predelay stand-in
    const fadeIn = Math.min(len, (sr * spec.pre) | 0);
    for (let i = 0; i < fadeIn; i++) d[i] *= i / fadeIn;
  }
  return buf;
}
