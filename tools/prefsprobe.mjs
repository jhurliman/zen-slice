/**
 * prefsprobe.mjs — the persistence layer, with and without persistence (r43b).
 *
 * WHY THIS EXISTS. src/core/prefs.js has always carried the comment "private
 * mode: the choice still applies this session", and it was not true: every
 * reader called loadPrefs(), loadPrefs re-read localStorage, and when setItem
 * throws there is nothing there to read — so the choice evaporated between one
 * tap and the next. Raised in review of PR #31 against the graphics button,
 * which cycles by looking up its own current value and therefore computed
 * `low` from `auto` on every single tap, but `sound` and `haptics` flip the
 * same way and could be turned off and never back on.
 *
 * Nothing could have caught this in a browser harness: Playwright's context
 * has working storage, so the path only exists for a real player in Safari
 * private browsing. It is testable in pure node with six lines of fake
 * localStorage, which is what this is.
 *
 *   node tools/prefsprobe.mjs
 */

const GFX_MODES = ['auto', 'low', 'med', 'high', 'ultra'];
const failures = [];
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`);
}

/** @param {boolean} writable false = Safari private browsing: setItem throws. */
function fakeStorage(writable) {
  let v = null;
  return {
    getItem: () => v,
    setItem(_k, val) {
      if (!writable) throw new Error('QuotaExceededError: private browsing');
      v = val;
    },
  };
}

/** prefs.js keeps module-level session state, so each case needs a fresh copy. */
async function loadModule() {
  return import(`../src/core/prefs.js?case=${Math.random()}`);
}

for (const writable of [true, false]) {
  const label = writable ? 'storage available' : 'storage THROWS (private browsing)';
  console.log(`\n── ${label} ──`);
  globalThis.localStorage = fakeStorage(writable);
  const { loadPrefs, savePref } = await loadModule();

  // hud.js's cycling expression, verbatim: the next value is derived from the
  // CURRENT one, which is exactly why a failed write used to wedge it.
  const cycle = () => {
    const cur = GFX_MODES.indexOf(loadPrefs().gfx);
    const next = GFX_MODES[(cur + 1) % GFX_MODES.length];
    savePref('gfx', next);
    return next;
  };
  const seen = [cycle(), cycle(), cycle(), cycle(), cycle()];
  check('graphics cycles the whole ladder and wraps',
    seen.join(',') === 'low,med,high,ultra,auto', seen.join(','));

  // hud.js's boolean flip, verbatim.
  const flip = (k) => { const now = !(loadPrefs()[k] !== false); savePref(k, now); return now; };
  check('sound turns off AND back on', flip('sound') === false && flip('sound') === true);
  check('haptics turns off AND back on', flip('haptics') === false && flip('haptics') === true);

  savePref('bestScore', 4200);
  check('a written value reads back', loadPrefs().bestScore === 4200, `best=${loadPrefs().bestScore}`);
  check('untouched keys keep their defaults', loadPrefs().debug === false);
}

// A fresh session with working storage must see what the last one persisted —
// the session mirror must not have replaced persistence, only backstopped it.
console.log('\n── persistence still persists across sessions ──');
{
  const store = fakeStorage(true);
  globalThis.localStorage = store;
  const a = await loadModule();
  a.savePref('gfx', 'high');
  a.savePref('sound', false);
  const b = await loadModule();          // new module instance, same storage
  check('a later session reads the earlier one\'s choices',
    b.loadPrefs().gfx === 'high' && b.loadPrefs().sound === false,
    `gfx=${b.loadPrefs().gfx} sound=${b.loadPrefs().sound}`);
}

const pass = failures.length === 0;
console.log(`\n${pass ? 'PASS' : 'FAIL'} — ${checks - failures.length}/${checks} checks`);
if (!pass) {
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
console.log('');
