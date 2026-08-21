import UIKit
import Capacitor

/// The game's shell view controller — the Capacitor-documented subclassing
/// point (https://capacitorjs.com/docs/ios/viewcontroller). Referenced from
/// Main.storyboard in place of the stock CAPBridgeViewController.
///
/// A full-screen slicing game wants the system to get out of the way:
///  - the home indicator dims and hides until the player pauses — via
///    `ios.hideHomeIndicator` in capacitor.config.json, since Capacitor 8
///    declares `prefersHomeIndicatorAutoHidden` non-open (extension member);
///  - edge swipes (the game IS swiping) require a second, deliberate swipe
///    before the system takes them — otherwise a slice that starts near the
///    bottom edge would tug the app switcher instead of cutting fruit.
class GameViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var prefersStatusBarHidden: Bool { true }

    // r36: app-local plugins register here — the Capacitor 8 subclassing hook.
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}
