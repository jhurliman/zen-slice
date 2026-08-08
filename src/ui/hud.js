/**
 * hud.js — DOM overlay. Deliberately almost invisible: a thin score, a level
 * name that fades in and out, and combo callouts that rise from the cut point.
 * Nothing boxed, nothing chunky, nothing that competes with the fruit.
 */
import * as THREE from 'three';

export function createHud() {
  const api = {};
  let ctx, root, scoreEl, levelEl, comboLayer, hintEl;
  let shownScore = 0;
  const floats = [];

  api.init = (c) => {
    ctx = c;
    root = document.createElement('div');
    root.className = 'zs-hud';
    root.innerHTML = `
      <div class="zs-score"><span id="zs-num">0</span></div>
      <div class="zs-level" id="zs-level"></div>
      <div class="zs-combos" id="zs-combos"></div>
      <div class="zs-hint" id="zs-hint">swipe to slice</div>`;
    document.body.appendChild(root);
    scoreEl = root.querySelector('#zs-num');
    levelEl = root.querySelector('#zs-level');
    comboLayer = root.querySelector('#zs-combos');
    hintEl = root.querySelector('#zs-hint');

    c.bus.on('level', (e) => {
      levelEl.textContent = e.name;
      levelEl.classList.remove('show'); void levelEl.offsetWidth;
      levelEl.classList.add('show');
    });
    c.bus.on('combo', (e) => {
      const p = e.at.clone().project(c.camera);
      const el = document.createElement('div');
      el.className = 'zs-combo';
      el.textContent = `${e.count}×`;
      el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      comboLayer.appendChild(el);
      floats.push({ el, t: 0 });
    });
    c.bus.on('slice', () => { if (hintEl) { hintEl.classList.add('gone'); } });

    // first level name
    setTimeout(() => c.bus.emit('level', { level: 0, name: 'Still Water' }), 700);
  };

  api.frame = (dt, alpha, c) => {
    const s = c.score?.score ?? 0;
    shownScore += (s - shownScore) * Math.min(1, dt * 9);
    scoreEl.textContent = Math.round(shownScore);
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      f.el.style.transform = `translate(-50%,-50%) translateY(${-f.t * 46}px) scale(${1 + f.t * 0.5})`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 0.9));
      if (f.t > 0.95) { f.el.remove(); floats.splice(i, 1); }
    }
  };

  return api;
}
