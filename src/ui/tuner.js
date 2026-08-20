/**
 * tuner.js — the ?tune voicing panel (r27). DEV-ONLY: main.js constructs
 * this only when the URL carries ?tune, so the retail build never creates a
 * node of it. The philosophy (agreed with the owner): raw EQ/compressor
 * parameters are a trap for anyone but a mixing engineer — what taste needs
 * is a few PERCEPTUAL macros, an instant A/B against the shipped baseline,
 * and an export. The owner tunes on real hardware, copies the JSON, and the
 * winning values get baked into engine.js as the new authored voicing.
 *
 * Macros (see engine.setVoicing for the parameter bundles behind each):
 *   air     ±6 dB   high shelf @ 7.5 kHz — sheen vs smooth
 *   warmth  ±6 dB   low shelf @ 240 Hz — body vs clarity
 *   space   0..2    reverb level (the room's presence)
 *   bed     0..2    pad/drone level under everything
 *   note    0..2    the piano itself
 *   swish   0..2    the cut's air
 *   glue    0..2    compressor amount (1 = shipped −16 dB / 3:1)
 *   master  .5..1.5 output trim
 *
 * All styling is inline and self-contained — nothing lands in style.css.
 */

const MACROS = [
  { key: 'air', label: 'air', min: -6, max: 6, step: 0.5, def: 0, unit: 'dB' },
  { key: 'warmth', label: 'warmth', min: -6, max: 6, step: 0.5, def: 0, unit: 'dB' },
  { key: 'space', label: 'space', min: 0, max: 2, step: 0.05, def: 1, unit: 'x' },
  { key: 'bed', label: 'bed', min: 0, max: 2, step: 0.05, def: 1, unit: 'x' },
  { key: 'note', label: 'note', min: 0, max: 2, step: 0.05, def: 1, unit: 'x' },
  { key: 'swish', label: 'swish', min: 0, max: 2, step: 0.05, def: 1, unit: 'x' },
  { key: 'glue', label: 'glue', min: 0, max: 2, step: 0.05, def: 1, unit: 'x' },
  { key: 'master', label: 'master', min: 0.5, max: 1.5, step: 0.025, def: 1, unit: 'x' },
];

export function initTuner(audio) {
  const edits = {};
  for (const m of MACROS) edits[m.key] = m.def;
  let live = true;   // true = edits audible, false = baseline audible (A/B)

  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed', 'right:10px', 'top:50%', 'transform:translateY(-50%)',
    'z-index:99', 'width:210px', 'padding:12px 14px', 'border-radius:10px',
    'background:rgba(8,10,14,0.88)', 'border:1px solid rgba(255,255,255,0.13)',
    'font:11px/1.5 -apple-system,system-ui,monospace', 'color:rgba(255,255,255,0.85)',
    'letter-spacing:0.04em', 'user-select:none', '-webkit-user-select:none',
    'touch-action:manipulation',
  ].join(';');
  // Slider drags must not become blade strokes — but ONLY move events are
  // contained: pointerdown/up must keep bubbling to window, because that is
  // the audio-unlock and haptics-grant path (the r21 settings-gear lesson,
  // relearned once already: stopPropagation there breaks iOS audio resume).
  for (const ev of ['pointermove', 'touchmove'])
    root.addEventListener(ev, (e) => e.stopPropagation());

  let html = '<div style="font-weight:600;margin-bottom:8px;letter-spacing:0.2em">TUNE</div>';
  for (const m of MACROS) {
    html += `
      <div style="display:flex;align-items:center;gap:6px;margin:3px 0">
        <span style="width:52px;opacity:0.75">${m.label}</span>
        <input data-k="${m.key}" type="range" min="${m.min}" max="${m.max}"
               step="${m.step}" value="${m.def}" style="flex:1;accent-color:#e8c87a">
        <span data-v="${m.key}" style="width:44px;text-align:right;font-variant-numeric:tabular-nums">${m.def}${m.unit}</span>
      </div>`;
  }
  html += `
    <div style="display:flex;gap:6px;margin-top:10px">
      <button data-b="ab" style="flex:1">A/B: EDIT</button>
      <button data-b="reset" style="flex:1">reset</button>
      <button data-b="copy" style="flex:1">copy</button>
    </div>
    <div data-meter style="margin-top:8px;opacity:0.7;font-variant-numeric:tabular-nums">meter —</div>`;
  root.innerHTML = html;
  for (const b of root.querySelectorAll('button')) {
    b.style.cssText = 'background:rgba(255,255,255,0.10);color:inherit;border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:4px 0;font:inherit;cursor:pointer';
  }
  document.body.appendChild(root);

  const fmt = (m, v) => `${v > 0 && m.unit === 'dB' ? '+' : ''}${(+v).toFixed(m.unit === 'dB' ? 1 : 2)}${m.unit}`;
  const apply = () => { audio.setVoicing(live ? edits : baseline()); };
  const baseline = () => {
    const b = {};
    for (const m of MACROS) b[m.key] = m.def;
    return b;
  };

  for (const m of MACROS) {
    const input = root.querySelector(`input[data-k="${m.key}"]`);
    const out = root.querySelector(`span[data-v="${m.key}"]`);
    out.textContent = fmt(m, m.def);
    input.addEventListener('input', () => {
      edits[m.key] = +input.value;
      out.textContent = fmt(m, +input.value);
      if (!live) { live = true; abBtn.textContent = 'A/B: EDIT'; }
      apply();
    });
  }

  const abBtn = root.querySelector('button[data-b="ab"]');
  abBtn.addEventListener('click', () => {
    live = !live;
    abBtn.textContent = live ? 'A/B: EDIT' : 'A/B: BASE';
    apply();
  });
  root.querySelector('button[data-b="reset"]').addEventListener('click', () => {
    for (const m of MACROS) {
      edits[m.key] = m.def;
      root.querySelector(`input[data-k="${m.key}"]`).value = m.def;
      root.querySelector(`span[data-v="${m.key}"]`).textContent = fmt(m, m.def);
    }
    live = true; abBtn.textContent = 'A/B: EDIT';
    apply();
  });
  root.querySelector('button[data-b="copy"]').addEventListener('click', () => {
    const json = JSON.stringify(edits, null, 2);
    const done = () => { const b = root.querySelector('button[data-b="copy"]'); b.textContent = 'copied'; setTimeout(() => { b.textContent = 'copy'; }, 1200); };
    try { navigator.clipboard.writeText(json).then(done, () => window.prompt('voicing JSON', json)); }
    catch (_) { window.prompt('voicing JSON', json); }
  });

  // live meter readout while tuning (same numbers as the ?debug strip)
  const meterEl = root.querySelector('[data-meter]');
  setInterval(() => {
    try {
      const m = audio.meter && audio.meter();
      meterEl.textContent = m
        ? `rms ${m.rms} pk ${m.peak} · ${m.lo}/${m.mid}/${m.hi}`
        : 'meter — (unlock audio first)';
    } catch (_) { /* diagnostic only */ }
  }, 300);
}
