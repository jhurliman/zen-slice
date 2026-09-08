import Capacitor
import StoreKit

/// The one purchase (1.2) — Chord Cut becomes a free download with the first
/// three levels open and a single non-consumable unlocking the rest of the
/// day. Same shape as GameCenterPlugin: a CAPPlugin registered from
/// GameViewController.capacitorDidLoad, reached from JS through the injected
/// global (`Capacitor.Plugins.StoreKit`, see src/core/store.js), so the web
/// build carries zero wrapper bytes. StoreKit 2 only.
///
/// Methods (all resolve, never reject — the JS side treats a missing answer
/// as "not entitled" and keeps the cached answer from prefs):
///   status()   → { entitled, reason, price }
///   purchase() → status + { outcome: purchased | cancelled | pending | unavailable | unverified | error }
///   restore()  → AppStore.sync() then status + { outcome: restored }
///
/// GRANDFATHERING. Everyone who bought the paid 1.0/1.1 owns the full game.
/// Two independent tests on the app receipt (AppTransaction), either entitles:
///   1. originalPurchaseDate < FREE_SWITCH — the instant the ASC price change
///      to Free is scheduled for (2026-10-01T00:00:00Z). Date wins: someone
///      who paid after 1.2 was live but before the price propagated carries
///      1.2's build number and must not be asked to pay again.
///   2. originalAppVersion ≤ PAID_THROUGH_BUILD — on iOS this string is the
///      ORIGINAL install's build number (CFBundleVersion), 1.1's final build
///      being 5. Parsed defensively: a dotted string is a marketing version
///      (compare < 1.2), a bare integer is the build.
/// ⚠ In sandbox and TestFlight both fields are synthetic (originalAppVersion
/// is "1.0", the date is 2013), so every tester is grandfathered. The JS side
/// passes { testing: true } when the debug pref is on (a toggle that only
/// exists in non-App-Store builds), which skips the receipt tests so the
/// purchase path can be exercised on a device.
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    static let PRODUCT_ID = "org.jhurliman.chordcut.full"
    /// 1.1's final build number. 1.2's first build must be strictly greater.
    static let PAID_THROUGH_BUILD = 5
    static let FREE_SWITCH: Date = ISO8601DateFormatter().date(from: "2026-10-01T00:00:00Z")!

    private var updates: Task<Void, Never>?

    override public func load() {
        // Finish every transaction that arrives outside a purchase() call
        // (Ask to Buy approvals, purchases from another device, refunds) so
        // StoreKit stops redelivering it — and TELL THE PAGE (PR #51 review):
        // the veil promises "the orchard will open when approval arrives",
        // so the entitlement has to reach store.js while the app is open,
        // not at the next boot. Emitted as the 'entitlement' plugin event;
        // store.js listens and re-reads status() on foreground as well.
        updates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let t) = result else { continue }
                await t.finish()
                guard t.productID == StoreKitPlugin.PRODUCT_ID, let self else { continue }
                let entitled = t.revocationDate == nil
                var data: [String: Any] = ["entitled": entitled, "reason": entitled ? "purchase" : "none",
                                           "price": "", "outcome": "update"]
                if let p = await Self.product() { data["price"] = p.displayPrice }
                self.notifyListeners("entitlement", data: data)
            }
        }
    }

    deinit { updates?.cancel() }

    @objc func status(_ call: CAPPluginCall) {
        let testing = call.getBool("testing") ?? false
        Task { call.resolve(await Self.snapshot(testing: testing)) }
    }

    @objc func restore(_ call: CAPPluginCall) {
        let testing = call.getBool("testing") ?? false
        Task {
            try? await AppStore.sync()
            var s = await Self.snapshot(testing: testing)
            s["outcome"] = "restored"
            call.resolve(s)
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        let testing = call.getBool("testing") ?? false
        Task {
            guard let product = await Self.product() else {
                call.resolve(["entitled": false, "reason": "none", "price": "", "outcome": "unavailable"])
                return
            }
            do {
                let vc = await MainActor.run { self.bridge?.viewController }
                let result: Product.PurchaseResult
                if let vc { result = try await product.purchase(confirmIn: vc) }
                else { result = try await product.purchase() }
                switch result {
                case .success(let verification):
                    if case .verified(let t) = verification {
                        await t.finish()
                        var s = await Self.snapshot(testing: testing)
                        s["outcome"] = "purchased"
                        call.resolve(s)
                    } else {
                        call.resolve(["entitled": false, "reason": "none", "price": product.displayPrice, "outcome": "unverified"])
                    }
                case .userCancelled:
                    call.resolve(["entitled": false, "reason": "none", "price": product.displayPrice, "outcome": "cancelled"])
                case .pending:
                    call.resolve(["entitled": false, "reason": "none", "price": product.displayPrice, "outcome": "pending"])
                @unknown default:
                    call.resolve(["entitled": false, "reason": "none", "price": product.displayPrice, "outcome": "error"])
                }
            } catch {
                call.resolve(["entitled": false, "reason": "none", "price": product.displayPrice,
                              "outcome": "error", "message": error.localizedDescription])
            }
        }
    }

    // MARK: - the facts

    static func snapshot(testing: Bool) async -> [String: Any] {
        var out: [String: Any] = ["entitled": false, "reason": "none", "price": ""]
        if !testing, let why = await grandfathered() {
            out["entitled"] = true; out["reason"] = why
        } else if await owned() {
            out["entitled"] = true; out["reason"] = "purchase"
        }
        if let p = await product() { out["price"] = p.displayPrice }
        return out
    }

    static func product() async -> Product? {
        (try? await Product.products(for: [PRODUCT_ID]))?.first
    }

    static func owned() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productID == PRODUCT_ID, t.revocationDate == nil { return true }
        }
        return false
    }

    static func grandfathered() async -> String? {
        guard let result = try? await AppTransaction.shared, case .verified(let tx) = result else { return nil }
        if tx.originalPurchaseDate < FREE_SWITCH { return "grandfather-date" }
        if paidBuild(tx.originalAppVersion) { return "grandfather-build" }
        return nil
    }

    /// "5" → build 5 (≤ PAID_THROUGH_BUILD entitles); "1.1" → marketing < 1.2 entitles.
    static func paidBuild(_ v: String) -> Bool {
        let s = v.trimmingCharacters(in: .whitespaces)
        if s.contains(".") {
            let parts = s.split(separator: ".").map { Int($0) ?? 0 }
            let major = parts.count > 0 ? parts[0] : 0, minor = parts.count > 1 ? parts[1] : 0
            return major * 100 + minor < 120
        }
        if let n = Int(s) { return n <= PAID_THROUGH_BUILD }
        return false
    }
}
