#!/usr/bin/env node
/**
 * stallcheck.mjs — one line of truth about whether work is progressing.
 *
 * Written after a round-2 workflow hung for ~12 hours. The failure was subtle
 * and worth encoding precisely, because "nothing is happening" has two very
 * different meanings:
 *
 *   IDLE     no agents outstanding, nothing running. Normal between rounds.
 *   STALLED  agents outstanding (a workflow logged `started` with no matching
 *            `result`) but nothing has written a byte in a long time.
 *
 * Round 2 was the second kind. Six agents finished their edits and then died on
 * terminal API errors; five logged a null result, the sixth logged nothing at
 * all, and the pipeline waited on it forever. Distinguishing those two states is
 * the entire job of this script — a monitor that cannot tell them apart either
 * cries wolf between every round or sleeps through a real hang.
 *
 * Prints exactly ONE line, prefixed OK / IDLE / STALL / ERROR, so it can be
 * dropped straight into a Monitor poll loop.
 *
 *   node tools/stallcheck.mjs [--quiet-if-ok] [--stale-min 60]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const num = (f, d) => {
  const i = argv.indexOf('--' + f);
  return i < 0 ? d : (Number(argv[i + 1]) || d);
};

const STALE_MIN = num('stale-min', 60);
const QUIET_IF_OK = has('quiet-if-ok');
const now = Date.now();
const mins = (t) => Math.round((now - t) / 60000);

/** Newest mtime under a directory tree, bounded so this stays cheap. */
function newestMtime(dir, depth = 4) {
  let best = 0;
  const walk = (d, lvl) => {
    if (lvl > depth) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = join(d, e.name);
      try {
        if (e.isDirectory()) walk(p, lvl + 1);
        else { const m = statSync(p).mtimeMs; if (m > best) best = m; }
      } catch { /* raced deletion */ }
    }
  };
  walk(dir, 0);
  return best;
}

const out = [];
try {
  // ── artefact progress ─────────────────────────────────────────────────────
  let lastArtifact = 0;
  for (const d of ['src', 'shots', 'rounds', 'dist', 'tools']) {
    const p = join(root, d);
    if (existsSync(p)) lastArtifact = Math.max(lastArtifact, newestMtime(p));
  }

  // ── workflow agent progress ───────────────────────────────────────────────
  // Agents stream their transcripts to <workflowdir>/agent-*.jsonl, so those
  // mtimes are the truest "is anyone actually thinking right now" signal —
  // truer than the journal, which only gets a line when an agent finishes.
  const wfRoots = [];
  const base = '/root/.claude/projects';
  if (existsSync(base)) {
    for (const proj of readdirSync(base)) {
      for (const sess of (() => { try { return readdirSync(join(base, proj)); } catch { return []; } })()) {
        const wf = join(base, proj, sess, 'subagents', 'workflows');
        if (existsSync(wf)) {
          for (const run of readdirSync(wf)) wfRoots.push(join(wf, run));
        }
      }
    }
  }

  // Runs already triaged by a human/agent — a permanently dead run must not
  // alarm every two hours forever, or the monitor trains us to ignore it.
  const ignorePath = join(root, 'rounds', '.stall-ignore');
  const ignored = new Set(
    existsSync(ignorePath)
      ? readFileSync(ignorePath, 'utf8').split('\n').map((l) => l.split('#')[0].trim()).filter(Boolean)
      : []
  );

  let lastAgentWrite = 0;
  let outstanding = 0;
  const openRuns = [];
  const stalledRuns = [];
  for (const dir of wfRoots) {
    const runId = dir.split('/').pop();
    let files;
    try { files = readdirSync(dir); } catch { continue; }
    // Per-run recency. A global clock is wrong: one live workflow would mask a
    // different workflow that died hours ago, and one dead workflow would
    // alarm forever while everything else is healthy.
    let runWrite = 0;
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      try {
        const m = statSync(join(dir, f)).mtimeMs;
        if (m > runWrite) runWrite = m;
      } catch { /* */ }
    }
    if (!ignored.has(runId)) lastAgentWrite = Math.max(lastAgentWrite, runWrite);
    const jp = join(dir, 'journal.jsonl');
    if (!existsSync(jp)) continue;
    let started = 0, results = 0;
    try {
      for (const line of readFileSync(jp, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        if (d.type === 'started') started++;
        else if (d.type === 'result') results++;
      }
    } catch { continue; }
    const open = started - results;
    if (open > 0 && !ignored.has(runId)) {
      const runQuiet = runWrite ? mins(runWrite) : 1e9;
      outstanding += open;
      if (runQuiet >= STALE_MIN) stalledRuns.push(`${runId} open=${open} quiet=${runQuiet}m`);
      else openRuns.push(`${runId}(${open},${runQuiet}m)`);
    }
  }

  // ── IS THE WATCH ITSELF ALIVE? ────────────────────────────────────────────
  // Round 5 taught this the hard way: the daemon died and nothing noticed for
  // ~12 hours, because the heartbeat file existed but NOTHING EVER READ IT.
  // A liveness signal with no alarm attached is just a decoration. The daemon
  // writes the heartbeat immediately BEFORE sleeping, so at the moment the
  // daemon itself runs this check the file is ~one interval old; anything much
  // beyond that means the writer is gone.
  let watchAgeMin = null;
  try {
    const beat = join(root, 'rounds', '.stallwatch-heartbeat');
    if (existsSync(beat)) watchAgeMin = mins(statSync(beat).mtimeMs);
  } catch { /* */ }

  // ── live processes ────────────────────────────────────────────────────────
  let procs = 0;
  try {
    procs = Number(execSync(
      "ps -eo comm= 2>/dev/null | grep -cE '^(node|chrome|chromium|chrome_crashpad)' || true",
      { encoding: 'utf8' }
    ).trim()) || 0;
  } catch { /* */ }

  const quietMin = Math.min(
    lastArtifact ? mins(lastArtifact) : 1e9,
    lastAgentWrite ? mins(lastAgentWrite) : 1e9
  );

  // ── verdict ───────────────────────────────────────────────────────────────
  const tail = `agents_open=${outstanding} quiet=${quietMin}m procs=${procs}` +
    (watchAgeMin !== null ? ` watch=${watchAgeMin}m` : ' watch=absent') +
    (openRuns.length ? ` runs=${openRuns.join(',')}` : '');

  // A dead watch outranks everything else: if this is stale, every other line
  // this script could print is untrustworthy, because nobody has been looking.
  if (watchAgeMin !== null && watchAgeMin > 30) {
    out.push(`ERROR  STALL WATCH IS DEAD — heartbeat ${watchAgeMin}m old (expected <20m). ` +
      `No stall detection has been running for that entire window, so treat any recent ` +
      `"quiet" as unverified. Restart: setsid nohup sh tools/stallwatch2.sh >/dev/null 2>&1 </dev/null & disown`);
  } else if (stalledRuns.length) {
    out.push(`STALL  wedged workflow(s): ${stalledRuns.join('; ')} — ${tail}. ` +
      `Work is usually already on disk: check git status / file mtimes, integrate manually, ` +
      `then add the run id to rounds/.stall-ignore.`);
  } else if (outstanding > 0) {
    out.push(`OK     work in flight — ${tail}`);
  } else if (quietMin >= STALE_MIN * 4) {
    out.push(`IDLE   no agents outstanding, nothing written for ${quietMin}m — ${tail}`);
  } else {
    out.push(`OK     idle between rounds — ${tail}`);
  }
} catch (e) {
  out.push(`ERROR  stallcheck itself failed: ${String(e && e.message || e).slice(0, 160)}`);
}

const line = out[0];
const isOk = line.startsWith('OK');
if (!(QUIET_IF_OK && isOk)) console.log(new Date().toISOString().slice(11, 16) + 'Z ' + line);
