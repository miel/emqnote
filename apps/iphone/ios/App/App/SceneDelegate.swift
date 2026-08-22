import UIKit
import Capacitor
import MSAL

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    /// Where Microsoft sign-in comes back.
    ///
    /// **It has to be here, and not in `AppDelegate`.** This app has a scene delegate, so
    /// `application(_:open:options:)` is never called at all — and nearly every MSAL iOS
    /// sample puts `handleMSALResponse` there. Following one produces a sign-in that opens
    /// Safari, completes, and never returns to the app, with nothing logged anywhere to say
    /// why. `CONSTRAINTS.md` carries this together with the other two MSAL settings whose
    /// absence fails silently.
    ///
    /// Capacitor still gets every URL afterwards: MSAL claims only its own redirect.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            MSALPublicClientApplication.handleMSALResponse(
                context.url,
                sourceApplication: context.options.sourceApplication
            )
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
