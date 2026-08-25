/**
 * governor.js — the adaptive quality governor, as PURE ARITHMETIC (r40).
 *
 * This used to live inline in main.js. It was moved here for one reason: it
 * was untestable there, and three real bugs had been sitting in it because
 * the only way to exercise it was to hold a warm phone and squint. Nothing in
 * this file touches THREE, the DOM or `window` — it consumes (ms, dt) samples
 * and emits decisions through callbacks, so `tools/govprobe.mjs` can drive a
 * whole 5-minute session through it in a few milliseconds of pure node.
 *
 * ── WHAT WENT WRONG IN r39 ──────────────────────────────────────────────────
 * Reported from the device: "immediately tunes the game down to a visibly very
 * pixelated resolution and keeps it there the whole time." Reproduced exactly
 * in the probe. Three defects, all in the SAME direction (down), which is why
 * the ratchet only ever ratcheted:
 *
 *  1. THE MISS TEST WAS RELATIVE TO THE PANEL, NOT TO THE GOAL.
 *     r39 learned the panel period as a rolling minimum of dt and called a
 *     frame missed at `dt > vsyncS * 1.5`. On a ProMotion iPhone the light
 *     title scene runs at 120, so vsyncS latches 1/120 — and then play starts
 *     and ProMotion drops to its next stable divisor, 60. An honest,
 *     goal-meeting 16.7 ms frame is 2.0x vsyncS, so EVERY FRAME reads as
 *     missed. The upward decay was 1.0005/frame, which needs 576 frames
 *     (9.6 s) to forgive a 1/120 -> 1/60 step. The governor only needs ~12 s
 *     to spend all four tiers. Measured: floor at 12.4 s, tier LOW, 11% of
 *     native pixels. The same latch fires when two rAF callbacks coalesce and
 *     hand us a single 4 ms dt.
 *     FIX: the miss test is relative to the TARGET period — never better than
 *     60 fps — and the panel estimate only decides whether there is headroom
 *     to climb. See downTarget/upTarget below.
 *
 *  2. THE CLEAN-RUN COUNTER WAS ZEROED, NOT DEBITED.
 *     `framesUnder = 0` on any over-frame, while a tier upshift needs 1800
 *     consecutive clean frames (30 s). One GC pause, one shader compile, one
 *     spawn hitch inside 30 s and recovery restarts from zero — on a real
 *     device that is every 30 s, forever. The ratchet had no pawl release.
 *     FIX: leaky counters. A bad frame debits UNDER_PENALTY frames of credit
 *     instead of erasing it, so an isolated hitch costs ~0.5 s of progress
 *     and a sustained problem still drains it in a fraction of a second.
 *
 *  3. THE UPSHIFT GATE WAS ARITHMETICALLY UNREACHABLE.
 *     Tier-up required `emaMs < 1000/120 * 0.7` = 5.83 ms of JS. The game's
 *     own budget is 2 ms p95 for JS *in the frame*, but emaMs measures
 *     encode+submit for the whole frame and sits around 6 ms on the device
 *     when everything is healthy. A perfectly good frame could not satisfy
 *     it, so tier recovery was dead code and LOW was absorbing.
 *     FIX: every threshold is expressed as a fraction of the CURRENT target
 *     period, so the same numbers mean the same thing at 60 and at 120.
 *
 * ── THE SHAPE ───────────────────────────────────────────────────────────────
 * Two nested loops, unchanged from r39 because that part was right: pixels
 * are the cheapest thing to shed (the fluid sim is per-pixel), so renderScale
 * is the fine inner loop and moves first; tiers are the coarse outer loop and
 * only move when the inner loop is saturated.
 *
 * The asymmetry that makes it stable is DOWN and UP judging against different
 * periods:
 *   · downTarget = max(panel, 1/60) — we defend 60 fps and never demand more.
 *     A ProMotion phone pinned at a rock-solid 60 is NOT failing.
 *   · upTarget   = panel            — we only climb when the panel rate itself
 *     is being met with room to spare, i.e. there is real headroom.
 * Between the two lies a dead band where the governor deliberately does
 * nothing. That band is the whole anti-oscillation story: a device pinned at
 * 60 on a 120 Hz panel sits in it and holds still forever, which is exactly
 * the behaviour the device report was missing.
 *
 * The r39 THERMAL RATCHET survives intact, because the soak harness proved it
 * was solving a real problem (15-min slowdown = SoC thermal limit, not a
 * leak): a downshift shortly after an upshift means that upshift was a
 * thermal mistake, so a session-long ceiling ratchets down and we stop
 * re-testing a level the device has already failed.
 */

/** Every tunable, in one frozen table. Fractions are OF THE TARGET PERIOD. */
export const GOV = Object.freeze({
  /** We defend 60 fps. The governor never downshifts for missing more. */
  TARGET_FPS: 60,

  // ── detector ──────────────────────────────────────────────────────────────
  /** Smoothed frame period above this fraction of the 60 fps period = over. */
  OVER_FRAME: 1.15,
  /** Smoothed JS encode+submit above this fraction of the 60 fps period. */
  OVER_JS: 0.92,
  /** Smoothed frame period below this fraction of the PANEL period = headroom. */
  UNDER_FRAME: 1.05,
  /** Smoothed JS below this fraction of the PANEL period = headroom. */
  UNDER_JS: 0.80,
  /** EMA weight for both ms and dt. ~20 frames of memory. */
  EMA: 0.05,
  /** Frames of clean credit burned by one bad frame (defect 2). */
  UNDER_PENALTY: 30,

  // ── inner loop: render scale ──────────────────────────────────────────────
  SCALE_STEP: 0.85,
  SCALE_MIN: 0.5,
  OVER_SCALE: 20,
  UNDER_SCALE: 360,
  HOLD_SCALE_DOWN: 1.0,
  HOLD_SCALE_UP: 6,

  // ── outer loop: tier ──────────────────────────────────────────────────────
  OVER_TIER: 45,
  UNDER_TIER: 1800,
  HOLD_TIER_DOWN: 1.5,
  HOLD_TIER_UP: 30,

  // ── thermal ratchet ───────────────────────────────────────────────────────
  RATCHET_SCALE_S: 60,
  RATCHET_TIER_S: 90,
  /** ...and the release. r39's ceilings were SESSION-LONG and unconditional,
   *  which is a third absorbing state: one bad patch — a level that happened
   *  to be heavy, a backgrounded tab, the phone in a pocket — capped quality
   *  until the app was killed. After this long with no downshift at all, the
   *  ceilings are released and the normal up-loop gets to try again. */
  RATCHET_RELAX_S: 180,
  /** A released ceiling that fails again TRIPLES the wait, so genuinely
   *  incapable hardware stops being probed almost immediately (3 min, 9 min,
   *  27 min, ...) while a device that really did recover pays only the first
   *  interval. Circuit-breaker half-open, with backoff.
   *
   *  Probing is the only instrument available, and that is worth stating
   *  plainly: once the governor has settled, the device is holding 60 fps BY
   *  CONSTRUCTION, so emaDt reads 16.7 ms whether the hardware is comfortable
   *  or right at its limit. Vsync quantisation has erased the margin we would
   *  need to distinguish "recovered" from "still weak". The only way to find
   *  out is to try, and the only defensible policy is to try rarely and to
   *  make failure cheap (see TIER_REVERT_S). */
  RATCHET_RELAX_MULT: 3,
  RATCHET_RELAX_MAX_S: 3600,
  /** An upshift that is over budget again within this long was a mistake, and
   *  is reverted DIRECTLY rather than by grinding the render scale down to
   *  its floor first (which is the slow path the two-loop ordering would
   *  otherwise force: four visible resolution steps to undo one bad tier). */
  TIER_REVERT_S: 20,

  /** The opening seconds of a session are pathologically expensive and say
   *  nothing about the game: pipeline prewarm, shader compiles, the audio
   *  unlock, the first GC. r39 governed straight through them AND let the
   *  ratchet nail a session-long ceiling to those numbers. Smooth, but decide
   *  nothing, until the session is representative. */
  WARMUP_S: 8,

  // ── panel-rate learner ────────────────────────────────────────────────────
  /** Rolling min, decaying upward. 1.02/frame forgives a 1/120 -> 1/60 step
   *  in ~35 frames instead of r39's 576 — a latch is now transient. Pulling
   *  DOWN is instant (it is a min), so it still tracks the fastest recent
   *  cadence, which is what "is there headroom" wants to know. */
  VSYNC_DECAY: 1.02,
  /** No panel is faster than this; below it, dt is a coalesced-callback lie. */
  VSYNC_FLOOR: 1 / 144,
  /** ...and no panel is SLOWER than this, as far as the governor is allowed to
   *  believe. Without this cap the learner has a second absorbing state, the
   *  mirror of defect 1 and just as bad: a renderer stuck at 34 ms teaches
   *  the rolling min that the panel is 29 Hz, the target relaxes to meet it,
   *  and the governor concludes everything is fine and goes to sleep at 29
   *  fps. Found by govprobe scenario 4 against the first draft of this file.
   *  The panel estimate may therefore only ever say "as fast as, or faster
   *  than, 60" — which is the only question the upshift asks of it. */
  VSYNC_CEIL: 1 / 60,
});

/** The manual settings ladder, low -> high. `auto` hands the wheel back. */
export const GFX_MODES = Object.freeze(['auto', 'low', 'med', 'high', 'ultra']);

/**
 * The floor is expressed in EFFECTIVE dpr, never as a bare multiplier — this
 * is the fourth r39 defect and the one that turned a bad decision into an
 * ugly one. `min(devicePixelRatio, tier.dpr) * renderScale` has TWO governed
 * factors, and r39 bounded them separately: tier LOW caps dpr at 1.0 and
 * SCALE_MIN allows 0.5, so the reachable floor on a dpr-3 phone was 0.5
 * effective dpr — one SIXTH of native linear resolution, one thirty-sixth of
 * the pixels. That is the "looks like trash" the report describes, and no
 * amount of fixing the trigger would have made it acceptable to land there.
 *
 * On a high-dpr screen the two factors may now compound only down to
 * MIN_EFFECTIVE_DPR. Low-dpr displays keep the full SCALE_MIN range, because
 * there sub-1.0 is a legitimate last resort and the only pixel lever there is
 * — that case is exactly the itch.io iframe overdraw r39 was written for.
 *
 * @param {number} devicePixelRatio window.devicePixelRatio
 * @param {number} tierDpr          the current tier's dpr cap
 * @returns {number} smallest renderScale that keeps effective dpr acceptable
 */
export const MIN_EFFECTIVE_DPR = 1.0;
export function scaleFloorFor(devicePixelRatio, tierDpr) {
  const dpr = devicePixelRatio || 1;
  if (dpr <= 1.5) return GOV.SCALE_MIN;
  const base = Math.min(dpr, tierDpr);
  return Math.max(GOV.SCALE_MIN, Math.min(1, MIN_EFFECTIVE_DPR / base));
}

/**
 * @param {object} o
 * @param {number} o.tier           starting tier
 * @param {number} o.minTier        TIER.LOW
 * @param {number} o.maxTier        TIER.ULTRA
 * @param {()=>number} [o.scaleFloor] smallest renderScale allowed RIGHT NOW —
 *        main.js expresses this in effective-dpr terms so that the tier's dpr
 *        cap and renderScale cannot compound into mush. Re-read every frame
 *        because it depends on the current tier.
 * @param {()=>number} [o.effBase] the tier's EFFECTIVE dpr at renderScale 1,
 *        i.e. `min(devicePixelRatio, tier.dpr)`. r43b: the thermal ratchet's
 *        scale ceiling is stored in effective dpr and needs this to convert.
 *        Defaults to 1, which makes the ceiling a bare multiplier again — the
 *        pre-r43b behaviour, correct only when the tier's dpr cap never binds.
 * @param {(t:number)=>void} [o.onTier]
 * @param {(s:number)=>void} [o.onScale]
 */
export function createGovernor({
  tier,
  minTier,
  maxTier,
  scaleFloor = () => GOV.SCALE_MIN,
  effBase = () => 1,
  onTier = () => {},
  onScale = () => {},
}) {
  const targetS = 1 / GOV.TARGET_FPS;

  let mode = 'auto';
  let curTier = tier;
  let scale = 1;

  let emaMs = targetS * 1000 * 0.5;
  let emaDt = targetS;
  let vsyncS = targetS;
  let sinceChange = 0;
  let framesOver = 0;
  let framesUnder = 0;
  let govT = 0;

  // session ceilings — the thermal ratchet
  let tierCeil = maxTier;
  // ══ r43b: THE CEILING IS EFFECTIVE DPR, NOT A MULTIPLIER ═══════════════════
  // Raised in review of PR #31: "a later tier upshift ... never restores the
  // ceiling, so the governor can report scale=1 with scaleCeil=0.5 and
  // reintroduce the load every 30 seconds, well before the 180-second ratchet
  // release." Correct, and the cause is this file's OWN fourth-defect lesson
  // applied to the floor but not to the ceiling: `min(dpr, tier.dpr) * scale`
  // has two governed factors, so a bare `scale` number means different pixel
  // counts at different tiers. A ceiling of 0.5 learned at HIGH (cap 2.0) is
  // 1.0 effective dpr; carried verbatim to MED (cap 1.5) it permits 1.5.
  //
  // Storing the memory in effective dpr fixes the reported path and is also
  // lossless across a round trip, which translating the multiplier at each
  // tier change is not: the ceiling has to be clamped to 1 to be usable, and
  // a ceiling that is not binding at LOW would come back from the clamp as a
  // tighter number than it left. Infinity = no ceiling.
  let scaleCeilEff = Infinity;
  /** The ceiling as a renderScale multiplier AT THE CURRENT TIER. */
  const scaleTop = () => Math.min(1, scaleCeilEff / Math.max(1e-6, effBase()));
  let lastTierUpAt = -Infinity;
  let lastScaleUpAt = -Infinity;
  let lastDownAt = -Infinity;
  let relaxAfter = GOV.RATCHET_RELAX_S;
  let probing = false;

  /** Neutralise the detector after any change: the next window must measure
   *  the NEW configuration, not carry the old one's guilt. The seed sits in
   *  the dead band on purpose — just inside the over threshold and just
   *  outside the under one — so the first frames after a change cannot vote
   *  either way before the EMAs have actually seen the new configuration. */
  function settle() {
    sinceChange = 0;
    framesOver = 0;
    framesUnder = 0;
    emaDt = targetS * 1.10;
    emaMs = targetS * 1000 * 0.5;
  }

  /** Record a downshift: it is what the ratchet release waits on, and a
   *  downshift during a release probe is that probe failing. */
  function noteDown() {
    lastDownAt = govT;
    if (probing) {
      relaxAfter = Math.min(GOV.RATCHET_RELAX_MAX_S, relaxAfter * GOV.RATCHET_RELAX_MULT);
      probing = false;
    }
  }

  function setTier(t) {
    const next = Math.max(minTier, Math.min(maxTier, t));
    if (next === curTier) return;
    curTier = next;
    onTier(curTier);
    // A tier change moves the dpr CAP, so it moves the scale floor with it,
    // and the scale we are holding may no longer be legal. Dropping a tier
    // therefore REFUNDS resolution: at LOW the cap is 1.0, the floor is 1.0,
    // and a scale of 0.67 inherited from HIGH would put us at 0.67 effective
    // dpr — the mush the floor exists to forbid, arrived at by the back door.
    // (govprobe scenario 2 caught exactly this: LOW @ scale 0.67.)
    setScale(scale);
  }

  function setScale(s) {
    // r43b: the ceiling binds HERE, not only in the up-loop. setTier() calls
    // this to re-clamp against a tier's new floor, and that back door was how
    // a refunded scale escaped the ratchet. The FLOOR still wins: a ceiling
    // below the floor would mean rendering mush, and the floor exists to
    // forbid exactly that — at LOW on a dpr-3 phone the floor is 1.0 and the
    // scale is 1.0 no matter what the ratchet remembers. That is not the
    // ratchet being ignored; the tier's own dpr cap is already holding the
    // pixel count down.
    const next = Math.min(1, Math.max(scaleFloor(), Math.min(s, scaleTop())));
    if (Math.abs(next - scale) < 1e-6) return;
    scale = next;
    onScale(scale);
  }

  return {
    /** One rendered frame. `ms` = JS encode+submit, `dt` = wall period.
     *  Callers must NOT feed synthesized dt (first frame after boot/resume,
     *  virtual-clock steps): a SIM_DT sample is not a vsync interval and the
     *  learner would believe it. */
    frame(ms, dt) {
      if (mode !== 'auto') return;

      govT += dt;
      sinceChange += dt;
      vsyncS = Math.min(
        GOV.VSYNC_CEIL,
        Math.min(vsyncS * GOV.VSYNC_DECAY, Math.max(dt, GOV.VSYNC_FLOOR)),
      );
      emaDt += (dt - emaDt) * GOV.EMA;
      emaMs += (ms - emaMs) * GOV.EMA;

      // Warm up: watch and smooth, decide nothing. See GOV.WARMUP_S.
      if (govT < GOV.WARMUP_S) {
        framesOver = 0;
        framesUnder = 0;
        sinceChange = 0;
        return;
      }

      // Defect 1, fixed. DOWN is judged against a FIXED 60 fps period — never
      // against a learned panel rate, because anything learned from dt can be
      // dragged downward by our own slowness and take the goalposts with it.
      // UP is judged against the panel period, which is the one question the
      // learner can answer honestly: are we vsync-limited (so there may be
      // headroom that dt cannot show) or are we GPU-limited below the panel
      // rate (so there is demonstrably none)?
      const downTarget = targetS;
      const upTarget = vsyncS;
      const downMs = downTarget * 1000;
      const upMs = upTarget * 1000;

      const over = emaDt > downTarget * GOV.OVER_FRAME || emaMs > downMs * GOV.OVER_JS;
      // Headroom is a CADENCE question, not a JS one. Resolution is paid for
      // in GPU fill, and emaMs (encode + submit) barely moves with it, so
      // gating the scale loop on JS time is measuring the wrong thing — it
      // stranded a device that was holding a flawless 120 fps at 61% render
      // scale, because ULTRA's 7.5 ms of encode failed a 6.7 ms bar. JS time
      // is checked where it IS the cost: a tier adds DRAW CALLS, so the tier
      // upshift below carries the extra jsHeadroom condition.
      const under = emaDt < upTarget * GOV.UNDER_FRAME;
      const jsHeadroom = emaMs < upMs * GOV.UNDER_JS;

      // Defect 2, fixed: debit, don't erase. The dead band between `over` and
      // `under` bleeds framesOver off slowly and leaves framesUnder alone, so
      // sitting exactly at target is a stable, decision-free state.
      if (over) {
        framesOver++;
        framesUnder = Math.max(0, framesUnder - GOV.UNDER_PENALTY);
      } else {
        framesOver = Math.max(0, framesOver - 1);
        if (under) framesUnder++;
      }

      // Ratchet release. Nothing has needed a downshift for a long time, so
      // whatever the ceilings are remembering may no longer be true.
      if (!probing && govT - lastDownAt > relaxAfter
        && (scaleTop() < 1 - 1e-6 || tierCeil < maxTier)) {
        scaleCeilEff = Infinity;
        tierCeil = maxTier;
        probing = true;
      }
      // Full quality reached and held: the ratchet's memory was wrong and is
      // now discharged, so the next probe starts from the base interval again.
      if (scale >= 1 - 1e-6 && curTier >= maxTier) {
        probing = false;
        relaxAfter = GOV.RATCHET_RELAX_S;
      }

      const floor = scaleFloor();
      const top = scaleTop();

      if (sinceChange > GOV.HOLD_SCALE_DOWN && framesOver > GOV.OVER_SCALE
        && curTier > minTier && govT - lastTierUpAt < GOV.TIER_REVERT_S) {
        // Fast revert: the tier we just took is the thing that broke budget.
        // NOTE the hold is HOLD_SCALE_DOWN, not HOLD_TIER_DOWN. This branch
        // races the scale-down branch below and must not lose: with the
        // longer tier hold it never fired at all, and every failed probe paid
        // the full four-step scale grind before undoing the one bad tier.
        tierCeil = Math.max(minTier, curTier - 1);
        noteDown();
        setTier(curTier - 1);
        settle();
      } else if (sinceChange > GOV.HOLD_SCALE_DOWN && framesOver > GOV.OVER_SCALE
        && scale > floor + 1e-6) {
        // inner loop, down: shed pixels before features
        if (govT - lastScaleUpAt < GOV.RATCHET_SCALE_S) {
          // r43b: recorded in effective dpr, so it still means the same number
          // of pixels after the tier moves underneath it.
          scaleCeilEff = Math.max(floor, scale * GOV.SCALE_STEP) * effBase();
        }
        noteDown();
        setScale(scale * GOV.SCALE_STEP);
        settle();
      } else if (sinceChange > GOV.HOLD_TIER_DOWN && framesOver > GOV.OVER_TIER
        && curTier > minTier && scale <= floor + 1e-6) {
        // outer loop, down: the inner loop is saturated and it was not enough
        if (govT - lastTierUpAt < GOV.RATCHET_TIER_S) {
          tierCeil = Math.max(minTier, curTier - 1);
        }
        noteDown();
        setTier(curTier - 1);
        settle();
      } else if (sinceChange > GOV.HOLD_SCALE_UP && framesUnder > GOV.UNDER_SCALE
        && scale < top - 1e-6) {
        // inner loop, up: pixels come back before features do
        lastScaleUpAt = govT;
        setScale(Math.min(top, scale / GOV.SCALE_STEP));
        settle();
      } else if (sinceChange > GOV.HOLD_TIER_UP && framesUnder > GOV.UNDER_TIER && jsHeadroom
        && curTier < Math.min(maxTier, tierCeil) && scale >= top - 1e-6) {
        lastTierUpAt = govT;
        setTier(curTier + 1);
        settle();
      }
    },

    /**
     * Manual override from the settings panel. A pinned mode is FULLY manual:
     * the tier is held and renderScale is pinned at 1, because the player who
     * picked `ultra` on a warm phone asked for pixels and is entitled to pay
     * for them in frame rate. Returning to `auto` clears the session ceilings
     * — the device deserves a fresh read, not the last session's grudge.
     * @param {'auto'|'low'|'med'|'high'|'ultra'} next
     * @param {number} [pinTier] tier for a manual mode (main.js maps the name)
     */
    setMode(next, pinTier) {
      mode = next;
      if (next === 'auto') {
        tierCeil = maxTier;
        scaleCeilEff = Infinity;
        lastTierUpAt = -Infinity;
        lastScaleUpAt = -Infinity;
        lastDownAt = -Infinity;
        relaxAfter = GOV.RATCHET_RELAX_S;
        probing = false;
      } else if (pinTier != null) {
        setTier(pinTier);
      }
      setScale(1);
      settle();
    },

    /** Read-only view for the debug strip and the probe. */
    snapshot() {
      return {
        mode, tier: curTier, scale, emaMs, emaDt, vsyncS,
        framesOver, framesUnder, tierCeil, govT, relaxAfter, probing,
        // `scaleCeil` stays in the snapshot as the multiplier AT THIS TIER, so
        // the ?debug strip's "×0.72≤0.85" keeps reading the way it always has.
        // scaleCeilEff is the number actually remembered (r43b).
        scaleCeil: scaleTop(), scaleCeilEff,
      };
    },
  };
}
