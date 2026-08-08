/**
 * audio.js — entirely procedural WebAudio. No files, no loading, no licensing.
 *
 *  - ambient: two detuned sine pads on a slow LFO + filtered noise "room"
 *  - slice:   a short filtered-noise "shhk" whose brightness tracks blade speed,
 *             plus a plucked sine chime on a pentatonic scale that climbs with
 *             the combo. The chime is what makes slicing feel like an instrument.
 *  - slowmo:  master lowpass sweeps down and the pad detunes flat, so the world
 *             audibly thickens for the duration of the dilation.
 *
 * iOS: the context is created suspended and resumed on the first pointerdown.
 */

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export function createAudio() {
  const api = { enabled: true };
  let actx = null, master, lp, padGain, ctxRef;
  let started = false;

  function ensure() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { api.enabled = false; return; }
    actx = new AC();
    master = actx.createGain(); master.gain.value = 0.0;
    lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = 0.3;
    lp.connect(master); master.connect(actx.destination);

    // ambient pad
    padGain = actx.createGain(); padGain.gain.value = 0.055; padGain.connect(lp);
    [55, 82.4, 110, 164.8].forEach((f, i) => {
      const o = actx.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = actx.createGain(); g.gain.value = 0.35 / (i + 1);
      const lfo = actx.createOscillator(); lfo.frequency.value = 0.03 + i * 0.017;
      const lfg = actx.createGain(); lfg.gain.value = 0.5 + i * 0.35;
      lfo.connect(lfg); lfg.connect(o.detune); lfo.start();
      o.connect(g); g.connect(padGain); o.start();
    });

    // noise buffer reused for every slice
    const len = actx.sampleRate * 1.0;
    api._noise = actx.createBuffer(1, len, actx.sampleRate);
    const d = api._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function unlock() {
    ensure();
    if (!actx || started) return;
    actx.resume?.();
    master.gain.setTargetAtTime(0.85, actx.currentTime, 0.8);
    started = true;
  }

  api.init = (c) => {
    ctxRef = c;
    const el = c.renderer.domElement;
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
      window.addEventListener(ev, unlock, { once: false, passive: true }));

    c.bus.on('slice', (e) => slice(e));
    c.bus.on('slowmo', (e) => {
      if (!actx) return;
      const t = actx.currentTime;
      lp.frequency.cancelScheduledValues(t);
      lp.frequency.setValueAtTime(Math.max(400, lp.frequency.value), t);
      lp.frequency.linearRampToValueAtTime(900, t + 0.04);
      lp.frequency.exponentialRampToValueAtTime(18000, t + e.seconds + 0.35);
    });
  };

  function slice(e) {
    if (!actx || !api.enabled) return;
    const t = actx.currentTime;
    const speed = Math.min(1, e.stroke.speed / 18);
    const combo = ctxRef.score?.combo ?? 1;

    // ── the cut: filtered noise burst ──
    const src = actx.createBufferSource(); src.buffer = api._noise;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700 + speed * 2600, t);
    bp.frequency.exponentialRampToValueAtTime(280, t + 0.22);
    bp.Q.value = 0.9;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.32 + speed * 0.25, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
    src.connect(bp); bp.connect(g); g.connect(lp);
    src.start(t); src.stop(t + 0.3);

    // ── wet splat: low thump scaled by mass ──
    const o2 = actx.createOscillator(); o2.type = 'sine';
    const mass = e.fruit.species.mass;
    o2.frequency.setValueAtTime(120 + 40 / mass, t);
    o2.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    const g2 = actx.createGain();
    g2.gain.setValueAtTime(0.0, t);
    g2.gain.linearRampToValueAtTime(0.16 * Math.min(1.4, mass * 0.5), t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.30);
    o2.connect(g2); g2.connect(lp); o2.start(t); o2.stop(t + 0.34);

    // ── the chime: pentatonic, climbs with combo ──
    const semis = e.fruit.species.pitch + PENTA[Math.min(PENTA.length - 1, combo - 1)];
    const f0 = 220 * Math.pow(2, semis / 12);
    [1, 2.01, 3.02].forEach((h, i) => {
      const o = actx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f0 * h;
      const gg = actx.createGain();
      const amp = 0.14 / (i + 1.4);
      gg.gain.setValueAtTime(0, t + 0.012);
      gg.gain.linearRampToValueAtTime(amp, t + 0.02);
      gg.gain.exponentialRampToValueAtTime(0.0004, t + 1.5 - i * 0.35);
      o.connect(gg); gg.connect(lp); o.start(t + 0.012); o.stop(t + 1.6);
    });
  }

  api.quality = () => {};
  return api;
}
