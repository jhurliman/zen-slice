/**
 * govprobe.mjs — the quality governor, driven through whole synthetic
 * sessions in pure node (r40).
 *
 * WHY THIS EXISTS. The r39 governor shipped with four defects that all
 * pointed the same way (down), and none were findable by the existing
 * harness: drawprobe measures a frame, soak measures a leak, perfprofile
 * measures attribution — nothing drove the CONTROL LOOP over minutes of
 * plausible frame timings. The bug that reached the device ("immediately
 * tunes the game down to a visibly very pixelated resolution and keeps it
 * there") reproduces here in milliseconds, so every scenario below is a scar.
 *
 * ⚠ THE SCENARIOS ARE CLOSED-LOOP, AND THAT IS THE WHOLE POINT. The first
 * draft of this probe replayed FIXED dt traces, and it lied in both
 * directions: a trace that never gets cheaper says the governor "climbs
 * forever", and a trace that never gets faster says it "does nothing". A
 * governor is a feedback loop and can only be judged inside one. `makeDevice`
 * below is a small physical model — frame cost scales with the pixels and
 * features the governor just chose, and the delivered frame period is
 * QUANTISED to the panel's vsync divisors, which is what makes a ProMotion
 * phone land on exactly 60 and is the crux of the reported bug.
 *
 * `src/core/governor.js` deliberately imports nothing, so this needs no
 * browser, no bundle and no three.
 *
 *   node tools/govprobe.mjs
 */

import { createGovernor, scaleFloorFor, GOV, MIN_EFFECTIVE_DPR } from '../src/core/governor.js';

// Mirrors main.js PROFILES.
const TIER = { ULTRA: 3, HIGH: 2, MED: 1, LOW: 0 };
const TIER_DPR = { 3: 2.0, 2: 2.0, 1: 1.5, 0: 1.0 };
const TIER_NAME = { 3: 'ultra', 2: 'high', 1: 'med', 0: 'low' };
/** Per-tier GPU cost multiplier at equal pixels: bloom on/off, segment counts. */
const TIER_FEATURE = { 3: 1.30, 2: 1.00, 1: 0.78, 0: 0.55 };
/** Per-tier CPU cost (encode + submit), ms. Draw calls, not pixels. */
const TIER_JS = { 3: 7.5, 2: 6.0, 1: 5.0, 0: 4.0 };

/**
 * A device. `gpuMs` is the GPU cost of one frame at tier HIGH and effective
 * dpr 2.0; everything else scales off it. May be a function of time to model
 * a scene getting heavier, or thermal throttling.
 */
function makeDevice({ panelHz, dpr, gpuMs }) {
  const period = 1 / panelHz;
  const costAt = typeof gpuMs === 'function' ? gpuMs : () => gpuMs;
  return (tier, scale, t) => {
    const eff = Math.min(dpr, TIER_DPR[tier]) * scale;
    const pixels = (eff / 2.0) ** 2;
    const gpu = costAt(t) * pixels * TIER_FEATURE[tier];
    const js = TIER_JS[tier];
    // The frame takes as long as its slowest half, then waits for vsync.
    const work = Math.max(gpu, js) / 1000;
    const dt = period * Math.max(1, Math.ceil(work / period - 1e-9));
    return { dt, ms: js };
  };
}

/** Drive a governor against a device for `seconds` of simulated wall time. */
function session(device, { seconds, dpr = 3, startTier = TIER.HIGH, mode = 'auto', pinTier } = {}) {
  let tier = startTier;
  let scale = 1;
  let changes = 0;
  let lateChanges = 0;
  let now = 0;
  const late = () => { if (now > seconds * (2 / 3)) lateChanges++; };
  const gov = createGovernor({
    tier: startTier,
    minTier: TIER.LOW,
    maxTier: TIER.ULTRA,
    scaleFloor: () => scaleFloorFor(dpr, TIER_DPR[tier]),
    onTier: (t) => { tier = t; changes++; late(); },
    onScale: (s) => { scale = s; changes++; late(); },
  });
  if (mode !== 'auto') gov.setMode(mode, pinTier);

  let t = 0;
  let minEff = Infinity;
  let effTime = 0;
  let slowTime = 0;
  let settleEffTime = 0;
  let settleTime = 0;
  const SETTLE_AFTER = Math.min(30, seconds * 0.25);
  while (t < seconds) {
    now = t;
    const { dt, ms } = device(tier, scale, t);
    gov.frame(ms, dt);
    const eff = Math.min(dpr, TIER_DPR[tier]) * scale;
    if (eff < minEff) minEff = eff;
    effTime += eff * dt;
    // "below 60" with a hair of tolerance for float noise
    if (dt > (1 / 60) * 1.05) slowTime += dt;
    if (t > SETTLE_AFTER) { settleEffTime += eff * dt; settleTime += dt; }
    t += dt;
  }
  const eff = Math.min(dpr, TIER_DPR[tier]) * scale;
  return {
    tier, scale, eff, minEff, changes, lateChanges,
    meanEff: effTime / t,
    settledEff: settleTime > 0 ? settleEffTime / settleTime : eff,
    slowFrac: slowTime / t,
    nativeFrac: eff / dpr,
  };
}

// ── assertions ───────────────────────────────────────────────────────────────
const failures = [];
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`);
}
const fmt = (r) => `tier=${TIER_NAME[r.tier]} scale=${r.scale.toFixed(2)} eff=${r.eff.toFixed(2)}`
  + ` settledEff=${r.settledEff.toFixed(2)} <60fps=${(r.slowFrac * 100).toFixed(1)}%`
  + ` changes=${r.changes}(late ${r.lateChanges})`;

// The device from the bug report: iPhone 16 Pro, dpr 3, ProMotion 120 Hz.
// The title scene is cheap enough for 120; once fruit are in the air the
// frame costs ~14 ms, so ProMotion drops to its next divisor — exactly 60.
// r39 read that honest 60 as "every frame missed" and spent all four tiers.
const iphoneScene = makeDevice({ panelHz: 120, dpr: 3, gpuMs: (t) => (t < 5 ? 4 : 14) });

console.log('\n── 1. THE REPORTED BUG: a ProMotion 120 → 60 step is not a failure ──');
{
  const r = session(iphoneScene, { seconds: 300, dpr: 3 });
  check('does not collapse to the bottom tier', r.tier > TIER.LOW, fmt(r));
  check('holds 60 fps', r.slowFrac < 0.05, fmt(r));
  check('stays visually sharp (settled effective dpr >= 1.7)', r.settledEff >= 1.7, fmt(r));
  check('never renders mush (r39 reached 0.50 here)', r.minEff >= MIN_EFFECTIVE_DPR, `minEff=${r.minEff.toFixed(2)}`);
  const long = session(iphoneScene, { seconds: 900, dpr: 3 });
  check('still sharp after 15 minutes', long.settledEff >= 1.7 && long.slowFrac < 0.05, fmt(long));
  // The ratchet re-probes on a backoff (see GOV.RATCHET_RELAX_S), so a long
  // session contains a few deliberate excursions. What must NOT happen is
  // r39's duty cycle, so the bound is on how much they cost: the settled
  // sharpness and the 60 fps floor above already carry that, and this just
  // pins the excursion COUNT to something like one every few minutes.
  check('and is not oscillating', long.changes <= 12, fmt(long));
}

console.log('\n── 2. it must STILL defend 60 fps on a genuinely slow device ──');
{
  // 60 Hz panel, dpr 2, a frame far too expensive at HIGH.
  const slow = makeDevice({ panelHz: 60, dpr: 2, gpuMs: 26 });
  const r = session(slow, { seconds: 300, dpr: 2 });
  check('downshifts until 60 fps is held', r.slowFrac < 0.10, fmt(r));
  check('and settles rather than hunting', r.changes <= 10, fmt(r));
  check('without going below the dpr floor', r.minEff >= MIN_EFFECTIVE_DPR, `minEff=${r.minEff.toFixed(2)}`);

  // Hopeless hardware: even LOW at the floor cannot hold 60. Must bottom out
  // cleanly at the floor and STOP, not thrash.
  const hopeless = makeDevice({ panelHz: 60, dpr: 3, gpuMs: 120 });
  const h = session(hopeless, { seconds: 300, dpr: 3 });
  check('hopeless hardware bottoms out at LOW', h.tier === TIER.LOW, fmt(h));
  check('...and still refuses to render mush', h.minEff >= MIN_EFFECTIVE_DPR, `minEff=${h.minEff.toFixed(2)}`);
  check('...and holds 60 fps once it gets there', h.slowFrac < 0.15, fmt(h));
  // It is allowed ONE exploratory climb (that is the ratchet doing its job)
  // but the backoff must make probing rare: by the last third, silence.
  // At most one backed-off probe (an up and its revert) in the final third.
  check('...and stops hunting (<= 1 probe in the final third)', h.lateChanges <= 2, fmt(h));
}

console.log('\n── 3. the learner has no absorbing state in EITHER direction ──');
{
  // A renderer stuck at 34 ms must not teach the governor that 29 Hz is the
  // panel rate and go to sleep. (This failed the first draft of governor.js.)
  const stuck = makeDevice({ panelHz: 120, dpr: 3, gpuMs: 34 });
  const r = session(stuck, { seconds: 240, dpr: 3 });
  check('a 29 fps renderer is still recognised as too slow', r.changes > 0, fmt(r));
  check('...and is actually downshifted', r.tier < TIER.HIGH || r.scale < 1 - 1e-6, fmt(r));

  // One coalesced rAF pair (4 ms) must not poison the panel estimate.
  let frame = 0;
  const base = makeDevice({ panelHz: 60, dpr: 3, gpuMs: 8 });
  const glitchy = (tier, scale, t) => {
    const s = base(tier, scale, t);
    return frame++ === 600 ? { dt: 1 / 240, ms: s.ms } : s;
  };
  // This device is fast enough to legitimately climb, so the assertion is
  // "the glitch cost nothing" — never downshifted, never lost a pixel — not
  // "nothing happened".
  const g = session(glitchy, { seconds: 300, dpr: 3 });
  check('a single 4 ms sample costs no resolution', g.scale > 1 - 1e-6, fmt(g));
  check('...and costs no tier', g.tier >= TIER.HIGH && g.minEff >= 2.0, `minEff=${g.minEff.toFixed(2)}`);
}

console.log('\n── 4. recovery: a transient must be given back ──');
{
  // 20 s of real trouble (a thermal blip, a heavy level), then fine forever.
  const blip = makeDevice({ panelHz: 120, dpr: 3, gpuMs: (t) => (t < 20 ? 40 : 5) });
  const r = session(blip, { seconds: 1200, dpr: 3 });
  check('resolution is restored after the trouble passes', r.scale > 1 - 1e-6, fmt(r));
  check('the tier climbs back', r.tier >= TIER.HIGH, fmt(r));
  // settledEff averages in the climb back, so "ends sharp" is the END state.
  check('and it ends sharp', r.eff >= 1.9, fmt(r));
}

console.log('\n── 5. the thermal ratchet still ratchets ──');
{
  // The soak scenario: the SoC slowly heats and gets slower. The governor
  // must settle DOWN and stay there, not duty-cycle the chip at its limit.
  const heating = makeDevice({ panelHz: 120, dpr: 3, gpuMs: (t) => 10 + Math.min(t, 600) * 0.02 });
  const r = session(heating, { seconds: 900, dpr: 3 });
  check('holds 60 fps across a 15-min thermal ramp', r.slowFrac < 0.10, fmt(r));
  check('settles instead of duty-cycling', r.changes <= 16, fmt(r));
  check('and is still not mush at the end', r.eff >= MIN_EFFECTIVE_DPR, fmt(r));
}

console.log('\n── 6. a fast device uses the hardware it has ──');
{
  const fast = makeDevice({ panelHz: 120, dpr: 2, gpuMs: 2 });
  const r = session(fast, { seconds: 600, dpr: 2, startTier: TIER.MED });
  check('120 fps with headroom climbs to ULTRA', r.tier === TIER.ULTRA, fmt(r));
  check('at full render scale', r.scale > 1 - 1e-6, fmt(r));
  check('and stays at 120 (never dips under 60)', r.slowFrac < 0.02, fmt(r));
}

console.log('\n── 7. the effective-dpr floor ──');
{
  check('a dpr-1 desktop keeps the full 0.5 scale range (itch.io iframe case)',
    scaleFloorFor(1, 2.0) === GOV.SCALE_MIN, `floor=${scaleFloorFor(1, 2.0)}`);
  for (const t of [TIER.LOW, TIER.MED, TIER.HIGH, TIER.ULTRA]) {
    const eff = Math.min(3, TIER_DPR[t]) * scaleFloorFor(3, TIER_DPR[t]);
    check(`tier ${TIER_NAME[t]} floors at effective dpr ${MIN_EFFECTIVE_DPR} on a dpr-3 phone`,
      Math.abs(eff - MIN_EFFECTIVE_DPR) < 1e-6, `eff=${eff.toFixed(2)}`);
  }
}

console.log('\n── 8. manual modes are fully manual ──');
{
  const brutal = makeDevice({ panelHz: 60, dpr: 3, gpuMs: 90 });
  for (const [name, t] of [['low', TIER.LOW], ['med', TIER.MED], ['high', TIER.HIGH], ['ultra', TIER.ULTRA]]) {
    const r = session(brutal, { seconds: 300, dpr: 3, mode: name, pinTier: t, startTier: TIER.HIGH });
    check(`manual ${name} holds tier + full scale under sustained overload`,
      r.tier === t && r.scale > 1 - 1e-6, fmt(r));
  }
  // ...and handing the wheel back re-enables governing.
  let tier = TIER.ULTRA;
  let scale = 1;
  const gov = createGovernor({
    tier: TIER.ULTRA, minTier: TIER.LOW, maxTier: TIER.ULTRA,
    scaleFloor: () => scaleFloorFor(3, TIER_DPR[tier]),
    onTier: (v) => { tier = v; }, onScale: (v) => { scale = v; },
  });
  gov.setMode('ultra', TIER.ULTRA);
  for (let i = 0; i < 60 * 60; i++) gov.frame(40, 0.05);
  check('manual ignores 60 s of overload', tier === TIER.ULTRA && scale === 1, `tier=${TIER_NAME[tier]}`);
  gov.setMode('auto');
  for (let i = 0; i < 60 * 60; i++) gov.frame(40, 0.05);
  check('auto resumes governing immediately after', tier < TIER.ULTRA || scale < 1,
    `tier=${TIER_NAME[tier]} scale=${scale.toFixed(2)}`);
}

const pass = failures.length === 0;
console.log(`\n${pass ? 'PASS' : 'FAIL'} — ${checks - failures.length}/${checks} checks`);
if (!pass) {
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
console.log('');
