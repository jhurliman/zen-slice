import Capacitor
import GameKit

/// Game Center with no app UI (r36) — the design constraint, verbatim: "i
/// don't want to add a bunch of new ui to the app though". So: authenticate
/// quietly at boot (the one sheet iOS itself may present on first sign-in is
/// system UI, and only ever appears once per account), submit the best streak
/// whenever score.js says so, and never show a leaderboard, banner, or
/// GKAccessPoint in-app. The player reads their standing in the Game Center
/// app / profile — the game itself stays a fruit, a blade, and a number.
///
/// Registered from GameViewController.capacitorDidLoad (the Capacitor 8
/// pattern for app-local plugins). JS reaches it via the injected global —
/// `Capacitor.Plugins.GameCenter.submitScore({ value })` in score.js — so the
/// web build carries zero wrapper bytes, same rule as haptics and native.js.
///
/// ⚠ Submissions land only after the leaderboard exists in App Store Connect:
/// App → Services → Game Center → create leaderboard with id LEADERBOARD_ID.
/// Until then GameKit returns an error and we swallow it — by design, scoring
/// must never surface a failure to the player.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise)
    ]

    static let LEADERBOARD_ID = "chordcut.best"

    /// The latest value JS asked for while unauthenticated — replayed the
    /// moment auth lands, so a best set before sign-in completes still counts.
    private var pendingValue: Int?

    override public func load() {
        GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
            if let vc = viewController {
                DispatchQueue.main.async { self?.bridge?.viewController?.present(vc, animated: true) }
                return
            }
            guard GKLocalPlayer.local.isAuthenticated, let self else { return }
            if let v = self.pendingValue { self.pendingValue = nil; Self.submit(v) }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        let value = call.getInt("value") ?? 0
        // resolve unconditionally and immediately: the JS side is
        // fire-and-forget, and a throw/reject would trip score.js's guard
        call.resolve()
        guard value > 0 else { return }
        if GKLocalPlayer.local.isAuthenticated { Self.submit(value) }
        else { pendingValue = value }
    }

    private static func submit(_ value: Int) {
        GKLeaderboard.submitScore(value, context: 0, player: GKLocalPlayer.local,
                                  leaderboardIDs: [LEADERBOARD_ID]) { _ in
            // errors swallowed: no leaderboard yet / no network / signed out —
            // localStorage still has the truth and the next submit retries
        }
    }
}
