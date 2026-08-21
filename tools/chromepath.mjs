/**
 * chromepath.mjs — shared FULL-Chromium resolver for the tools/ harnesses.
 *
 * Every probe needs a real Chromium, never `chromium_headless_shell` (it has
 * no navigator.gpu — see shoot.mjs H5). The search is a glob rather than a
 * fixed list because the playwright revision changes under us: a hard-coded
 * path pair silently falls through to `undefined`, which hands the launch to
 * playwright's default — and playwright's default IS the headless shell.
 *
 * On macOS the binary MUST be the one inside its .app bundle: a bare
 * executable copied to a linux-shaped path half-boots (the launch handshake
 * succeeds) but wedges forever in newPage(), so a run eats its whole
 * --deadline and dies by watchdog instead of failing fast.
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export const chromeCandidates = () => {
  const home = process.env.HOME || '/root';
  const roots = [
    '/opt/pw-browsers',                          // CI container
    join(home, '.cache/ms-playwright'),          // Linux default
    join(home, 'Library/Caches/ms-playwright'),  // macOS default
  ];
  const subs = [
    'chrome-linux64/chrome', 'chrome-linux/chrome',
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  ];
  const out = [];
  for (const r of roots) {
    let entries = [];
    try { entries = readdirSync(r); } catch (e) { continue; }
    // `chromium-1234` yes; `chromium_headless_shell-1234` NO. Newest revision first.
    const dirs = entries.filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      for (const sub of subs) {
        const c = join(r, d, sub);
        if (existsSync(c)) out.push(c);
      }
    }
  }
  // Prefer bundled mac binaries over any bare linux-shaped copy of them.
  if (process.platform === 'darwin') {
    out.sort((a, b) => Number(b.includes('.app/')) - Number(a.includes('.app/')));
  }
  // Legacy container fallback (a plain binary at a fixed path).
  if (existsSync('/opt/pw-browsers/chromium')) out.push('/opt/pw-browsers/chromium');
  return out;
};

/** First candidate or null. Callers must fail LOUDLY on null — passing
 *  undefined to chromium.launch() silently selects the headless shell. */
export const resolveChrome = () => chromeCandidates()[0] ?? null;
