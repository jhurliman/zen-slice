/**
 * score.js — deliberately shallow progression. Combo, streak, zen level.
 *
 * No fail state, no bombs, no timer. The only pressure is the gentle pull of a
 * combo window that rewards slicing two or three things in one arc.
 */
import { clamp, nowSec } from '../core/contract.js';

const COMBO_WINDOW = 0.55;   // real seconds

export function createScore() {
  const api = { score: 0, combo: 0, best: 0, total: 0, level: 0, levelName: 'Still Water' };
  let ctx, lastSliceT = -1e9;

  api.init = (c) => {
    ctx = c;
    c.bus.on('slice', (e) => {
      const now = e.stroke.t;
      if (now - lastSliceT < COMBO_WINDOW) api.combo++; else api.combo = 1;
      lastSliceT = now;
      api.best = Math.max(api.best, api.combo);
      api.total++;

      const base = Math.round(10 * (e.fruit.species.mass * 0.5 + 0.8));
      const mult = 1 + (api.combo - 1) * 0.35;
      api.score += Math.round(base * mult);

      if (api.combo >= 2) c.bus.emit('combo', { count: api.combo, at: e.stroke.at.clone() });
      // slow-mo is the reward: deeper and longer with bigger combos
      const depth = clamp(0.34 - (api.combo - 1) * 0.05, 0.16, 0.34);
      const dur = clamp(0.30 + (api.combo - 1) * 0.12, 0.30, 0.85);
      c.bus.emit('slowmo', { scale: depth, seconds: dur });
    });
    c.bus.on('level', (e) => { api.level = e.level; api.levelName = e.name; });
  };

  api.frame = () => {
    if (api.combo && nowSec() - lastSliceT > COMBO_WINDOW) api.combo = 0;
  };

  return api;
}
