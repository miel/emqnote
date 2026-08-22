import Capacitor

/// `InboxBridgePlugin` is a local plugin, not an npm package `cap sync` would list — so it is
/// never covered by Capacitor's generated plugin manifest. `CAPBridgedPlugin` only supplies the
/// metadata a registered instance needs; registration itself still has to happen here.
class MainViewController: CAPBridgeViewController {
  override func capacitorDidLoad() {
    bridge?.registerPluginInstance(InboxBridgePlugin())
  }
}
