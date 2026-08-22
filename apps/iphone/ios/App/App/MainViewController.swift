import Capacitor

/// Both bridges are local plugins, not npm packages `cap sync` would list — so neither is ever
/// covered by Capacitor's generated plugin manifest. `CAPBridgedPlugin` only supplies the
/// metadata a registered instance needs; registration itself still has to happen here.
///
/// `GraphBridge` delivers to OneDrive; `InboxBridge` is the iOS Files route, which Phase 0
/// showed works for every provider except the one this app needs (B77/B78). Both are
/// registered: `destination.ts` picks between them.
class MainViewController: CAPBridgeViewController {
  override func capacitorDidLoad() {
    bridge?.registerPluginInstance(InboxBridgePlugin())
    bridge?.registerPluginInstance(GraphBridgePlugin())
  }
}
