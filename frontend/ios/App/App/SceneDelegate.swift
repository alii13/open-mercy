import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BelowStatusBarViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Turns page zoom off, as native apps have it. iOS zooms into any text box
/// or dropdown under 16px when it gets focus and never zooms back out (the
/// leaderboard's country search did it). maximum-scale=1 stops that for every
/// field at once, on every page, including the static ones under public/.
final class NoZoomBridgeViewController: CAPBridgeViewController {
    private static let noZoom = WKUserScript(
        source: """
        var viewport = document.querySelector('meta[name=viewport]');
        if (viewport && !/maximum-scale/.test(viewport.content)) viewport.content += ', maximum-scale=1';
        """,
        injectionTime: .atDocumentEnd,
        forMainFrameOnly: true
    )

    // Not webViewConfiguration(for:): Capacitor swaps in its own
    // userContentController after that returns, dropping anything added there.
    // This runs once the web view exists and before the first page loads.
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.configuration.userContentController.addUserScript(Self.noZoom)
    }
}

/// Starts the page below the status bar, the way Safari and the home-screen
/// web app (status-bar-style "black") show it, so the web's top bars never
/// sit under the clock. The page still runs to the bottom edge and pads for
/// the home indicator itself with env(safe-area-inset-bottom).
/// CAPBridgeViewController makes the web view its root view in a final
/// loadView(), so it can't be inset directly; it is hosted as a child instead.
final class BelowStatusBarViewController: UIViewController {
    private let bridgeViewController = NoZoomBridgeViewController()
    private var urlObservation: NSKeyValueObservation?
    /// The edge swipes WebKit itself switched on: one back, one forward.
    private var webKitSwipes: Set<ObjectIdentifier> = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 11 / 255, alpha: 1)

        addChild(bridgeViewController)
        let page = bridgeViewController.view!
        if let webView = bridgeViewController.webView {
            // Stays on everywhere: WebKit records the picture of a page that a
            // back swipe slides in only while this is on, so switching it off on
            // home would leave the swipe back to home showing plain white.
            webView.allowsBackForwardNavigationGestures = true
            webKitSwipes = Set((webView.gestureRecognizers ?? [])
                .filter { $0 is UIScreenEdgePanGestureRecognizer && $0.isEnabled }
                .map(ObjectIdentifier.init))
            // The router changes the URL with pushState, which updates webView.url.
            urlObservation = webView.observe(\.url, options: [.initial, .new]) { [weak self] webView, _ in
                self?.updateEdgeSwipes(in: webView)
            }
        }
        page.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(page)
        NSLayoutConstraint.activate([
            page.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            page.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            page.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            page.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        bridgeViewController.didMove(toParent: self)
    }

    /// A swipe from the left edge goes back from the menu pages, as in Safari.
    /// It is off on home, the app's root, where history holds only older home
    /// screens (before sign-in, or the game just left). It is off at the
    /// table too: the hand fans out to the screen edges, so a card drag would
    /// start it, and the exit button is the way out.
    /// The right edge (forward) is off everywhere. WebKit puts back and forward
    /// on one switch, so its two swipes are told apart by their edge. Only the
    /// ones WebKit switched on are touched; the ones it keeps off stay off.
    private func updateEdgeSwipes(in webView: WKWebView) {
        let canSwipeBack = Self.canSwipeBack(from: webView.url?.path ?? "/")
        for case let swipe as UIScreenEdgePanGestureRecognizer in webView.gestureRecognizers ?? []
        where webKitSwipes.contains(ObjectIdentifier(swipe)) {
            swipe.isEnabled = swipe.edges == .left && canSwipeBack
        }
    }

    /// Home and the game screens, by their paths in frontend/src/utils/routes.ts.
    static func canSwipeBack(from path: String) -> Bool {
        let path = path.lowercased()
        return !["/", "/bot", "/daily", "/public"].contains(path) && !path.hasPrefix("/r/")
    }

    override var childForStatusBarStyle: UIViewController? { bridgeViewController }
    override var childForStatusBarHidden: UIViewController? { bridgeViewController }
}
