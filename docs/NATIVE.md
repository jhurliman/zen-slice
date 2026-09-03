# Chord Cut — native iOS wrapper (Capacitor 8)

Shipped to the App Store as 1.0 (2026-08), researched against 2026 practice. The web game is
untouched: the shell loads the same single self-contained `dist/index.html`
from the app bundle, and every native integration reaches the game through
the injected `window.Capacitor` global (`src/core/native.js`,
`src/input/haptics.js`) — zero wrapper bytes in the web/PWA build.

## Design rationale (researched 2026-08)

- **Capacitor 8.5 (SPM-based), not a bare Swift shell or Tauri**: same
  WKWebView either way (zero runtime penalty), first-party plugins cover
  haptics/status bar/keep-awake, and everything except build+sign works from
  Linux. Tauri mobile brings a Rust toolchain for no capability gain.
- **Minimum deployment target: iOS 26.0.** WebGPU is enabled by default in
  WKWebView from iOS 26 (Apple confirmed WKWebView follows the default, not
  Safari's feature flags), and this game is WebGPURenderer-only by design.
  There is no flag, entitlement, or plist key that enables WebGPU in a
  WKWebView on iOS 18 or earlier.
- **The App Store build runs at 60 fps, by Apple's design.** WKWebView's
  requestAnimationFrame is hard-capped at 60 Hz with no public opt-out
  (WebKit bug 294338, still unassigned Aug 2026);
  `CADisableMinimumFrameDurationOnPhone` affects native CoreAnimation only.
  It is in our Info.plist anyway — harmless, and required the day WebKit
  exposes the switch. The one community plugin that unlocks 120 Hz uses
  private WebKit API (`_setEnabled:forFeature:`) — a guideline 2.5.1
  rejection risk, not acceptable for a retail 1.0. The game loop is
  delta-time based, so the app inherits 120 Hz automatically if Apple ever
  opens it. The PWA remains the 120 Hz enthusiast path.
- **Review posture**: the game is embedded in the binary (guideline 4.7's
  Nov-2025 tightening targets *non-embedded* HTML5 software), fully offline
  (2.5.2 trivially satisfied), and the shell hides every browser affordance
  (4.2 "not just a website"): status bar and home indicator hidden, scrolling
  disabled, edge swipes deferred.

## Native integration

| Piece | Where |
|---|---|
| Capacitor config (`webDir: dist`, no scroll, no content inset) | `capacitor.config.json` |
| iOS project (SPM, deployment target 26.0) | `ios/` (committed; synced web assets are gitignored) |
| Status bar hidden + ProMotion plist keys | `ios/App/App/Info.plist` |
| Home indicator hidden, edge swipes deferred | `ios/App/App/GameViewController.swift` (+ `Main.storyboard` class ref) |
| AVAudioSession `.playback` insurance | `ios/App/App/AppDelegate.swift` (see caveat below) |
| Haptics → UIImpactFeedbackGenerator | `src/input/haptics.js` backend `'native'` (LIGHT/MEDIUM/HEAVY by event weight) |
| Screen keep-awake + status bar re-hide | `src/core/native.js` |
| Game Center best-streak submission (no in-app UI) | `ios/App/App/GameCenterPlugin.swift` (app-local plugin, registered in `GameViewController.capacitorDidLoad`), called from `src/play/score.js`; entitlement in `App.entitlements` |
| Plugins | `@capacitor/haptics` `@capacitor/status-bar` `@capacitor/app` `@capacitor-community/keep-awake` |

## Build loop

```bash
node build.mjs        # emits dist/index.html (unchanged)
npx cap sync ios      # copies dist/ into ios/App/App/public + SPM sync
```

⚠ `cap sync` REGENERATES `ios/App/CapApp-SPM/Package.swift` with
`swift-tools-version: 5.9`, which cannot express the committed manifest's
`.iOS(.v26)` — the next xcodebuild fails with "'v26' is unavailable". The
committed file (tools-version 6.2) is the truth; restore it after every sync.
`npm run ios` does the whole loop (build → sync → restore) in one step.

Deploying from the CLI (Xcode GUI not required):

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'id=<device-udid>' -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=<team-id> CODE_SIGN_STYLE=Automatic build
xcrun devicectl device install app --device <device-udid> \
  ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device <device-udid> org.jhurliman.chordcut
```

(`xcrun devicectl list devices` for the UDID; launch requires the phone
unlocked — install works either way.)

## Mac-only steps (signing & distribution)

- Xcode 26+ (`npx cap open ios`); signing is automatic under the enrolled
  Apple Developer account, bundle id `org.jhurliman.chordcut`.
- When the shell changes, verify on a physical iPhone in this order:
  - `navigator.gpu` exists and the game renders (WebGPU in the WKWebView);
  - haptics tick on slice (`?debug` strip shows `hap native·Nc`);
  - audio behavior vs the silent switch (see caveats);
  - watch for the known iOS 26.4 WebContent/GPU-process crash
    (Apple forums thread 822200) — platform bug, file Feedback if hit.
- Distribution is Archive → Distribute → App Store Connect → TestFlight.
- No CI by design for a solo 1.0: manual archive has been enough. If it ever
  gets wanted, GitHub Actions `macos-26` runners ship Xcode 26, or Xcode
  Cloud (25 free compute hours/month, signing handled).

## Caveats shipped as-is

- **Silent switch**: WKWebView runs its own audio session and largely ignores
  the host app's category (WebKit bug 167788, open since 2017). Pure WebAudio
  is treated as ambient → muted by the hardware silent switch, same as the
  Safari PWA. The AppDelegate `.playback` line is cheap insurance only. The
  alternative — looping a silent `<audio>` element so WebKit self-promotes
  the page to playback — was deliberately not taken; matching the PWA's
  behavior was the 1.0 call.
- **Haptics latency**: `@capacitor/haptics` allocates a fresh generator per
  impact and never calls `prepare()`. If ticks feel a few ms loose, the fix
  is a ~30-line local Swift plugin holding three pre-prepared
  UIImpactFeedbackGenerators — Apple's documented pattern.
- **Game Center** (r36): implemented as a ~60-line app-local plugin — the
  community plugin only advertises Capacitor 3–5, so we own it. Design: NO
  in-app UI. Auth happens quietly at boot (iOS may present its own sign-in
  sheet once), score.js submits the best streak on its existing rate-limited
  persist moments, and every failure is swallowed. Submissions go to
  leaderboard `chordcut.best` (the constant in GameCenterPlugin.swift); they
  are silent no-ops if the leaderboard is missing under App Store Connect →
  App → Services → Game Center.
- **StoreKit**: not used; nothing is sold.
