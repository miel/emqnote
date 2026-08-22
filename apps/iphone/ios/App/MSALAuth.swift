//
//  MSALAuth.swift
//  emqnote iPhone — Microsoft sign-in
//
//  ⚠️  DRAFTED AGAINST THE DOCUMENTATION, NOT YET RUN AGAINST A REAL TENANT.
//
//  `09-iphone-graph.md` §G0 is the spike that settles whether the business tenant permits
//  any of this at all. Until its evidence sheet is filled in, treat every assumption here
//  as a written-down expectation rather than a fact — particularly the consent behaviour,
//  which is a tenant setting nobody here can read from code.
//
//  Three pieces of project configuration have to be right or this file fails in ways that
//  do not name their cause. They are listed in `CONSTRAINTS.md` as well, because each one
//  was learned the expensive way somewhere:
//
//  1. The redirect URI `msauth.<bundle id>://auth` must appear in `Info.plist` under
//     `CFBundleURLTypes`, *and* the callback must be handled in `SceneDelegate`. This app
//     has a scene delegate, so `application(_:open:options:)` is never called at all — the
//     symptom is a sign-in that opens Safari and never comes back.
//  2. `LSApplicationQueriesSchemes` must list `msauthv2` and `msauthv3`, or MSAL cannot see
//     the Microsoft Authenticator broker and silently falls back to an in-app webview.
//     Conditional Access policies that require an approved client app then fail, with an
//     error about the app rather than about the policy.
//  3. The keychain sharing entitlement must include `com.microsoft.adalcache`, or the token
//     cache does not persist and `acquireTokenSilent` never succeeds across launches.
//

import Foundation
import MSAL

enum AuthError: Error {
  case notConfigured
  case noAccount
  case interactionRequired
  case noViewController

  var message: String {
    switch self {
    case .notConfigured:
      return "no Entra client id is configured in this build"
    case .noAccount:
      return "no Microsoft account has signed in on this iPhone"
    case .interactionRequired:
      return "Microsoft needs you to sign in again"
    case .noViewController:
      return "no view controller to present the sign-in from"
    }
  }

  /// The domain the JavaScript side switches on; see `GRAPH_ERRORS` in `graph-bridge.ts`.
  var domain: String {
    switch self {
    case .noAccount: return "NO_ACCOUNT"
    case .interactionRequired: return "INTERACTION_REQUIRED"
    case .notConfigured, .noViewController: return "NOT_CONFIGURED"
    }
  }
}

struct AuthToken {
  let accessToken: String
  let username: String
  /// `work` for an Entra tenant, `personal` for a consumer Microsoft account.
  let accountKind: String
}

/// One `MSALPublicClientApplication` for the process.
final class MSALAuth {
  static let shared = MSALAuth()

  /// Delegated, and the narrowest scope that can write a file to the signed-in user's own
  /// drive. Not `Files.ReadWrite.All`: this app writes one file to one folder, and a wider
  /// scope would be asking a corporate tenant for access it has no use for. MSAL adds
  /// `openid`, `profile` and `offline_access` itself.
  static let scopes = ["Files.ReadWrite"]

  /// The tenant a personal Microsoft account signs into. Used only to label the account.
  private static let consumersTenant = "9188040d-6c67-4c5b-b112-36a304b66dad"

  private let log = DiagnosticLog.shared
  private let lock = NSLock()
  private var application: MSALPublicClientApplication?

  /// Signs in with a cached account, never showing UI.
  func tokenSilently() async throws -> AuthToken {
    let application = try client()
    guard let account = try application.allAccounts().first else { throw AuthError.noAccount }

    let parameters = MSALSilentTokenParameters(scopes: Self.scopes, account: account)
    do {
      return try token(from: await acquire { application.acquireTokenSilent(with: parameters, completionBlock: $0) })
    } catch let error as NSError where isInteractionRequired(error) {
      throw AuthError.interactionRequired
    }
  }

  /// Signs in with UI. Only ever reached from a user action — never from a retry.
  @MainActor
  func tokenInteractively(from viewController: UIViewController) async throws -> AuthToken {
    let application = try client()
    let webParameters = MSALWebviewParameters(authPresentationViewController: viewController)
    let parameters = MSALInteractiveTokenParameters(scopes: Self.scopes, webviewParameters: webParameters)
    // `.whenRequired` lets MSAL reuse an existing session rather than asking someone who is
    // already signed in to the device to prove it again.
    parameters.promptType = .promptIfNecessary

    return try token(from: await acquire { application.acquireToken(with: parameters, completionBlock: $0) })
  }

  func signedInAccount() -> (username: String, accountKind: String)? {
    guard let application = try? client(), let account = try? application.allAccounts().first else {
      return nil
    }
    return (account.username ?? "", Self.kind(of: account))
  }

  func signOut() throws {
    let application = try client()
    for account in try application.allAccounts() {
      try application.remove(account)
    }
    log.append("signed out")
  }

  // MARK: Plumbing

  private func client() throws -> MSALPublicClientApplication {
    lock.lock()
    defer { lock.unlock() }
    if let application { return application }

    guard let clientId = GraphConfig.clientId else { throw AuthError.notConfigured }

    let authority = try MSALAADAuthority(url: GraphConfig.authorityURL)
    let configuration = MSALPublicClientApplicationConfig(
      clientId: clientId,
      redirectUri: GraphConfig.redirectURI,
      authority: authority
    )
    let created = try MSALPublicClientApplication(configuration: configuration)
    application = created
    return created
  }

  private func acquire(
    _ operation: (@escaping MSALCompletionBlock) -> Void
  ) async -> Result<MSALResult, Error> {
    await withCheckedContinuation { continuation in
      operation { result, error in
        if let result {
          continuation.resume(returning: .success(result))
        } else {
          continuation.resume(returning: .failure(error ?? AuthError.interactionRequired))
        }
      }
    }
  }

  private func token(from result: Result<MSALResult, Error>) throws -> AuthToken {
    switch result {
    case .success(let value):
      // Deliberately not logged, not even truncated. See `DiagnosticLog.redact`.
      log.append("acquired a token for \(Self.kind(of: value.account)) account")
      return AuthToken(
        accessToken: value.accessToken,
        username: value.account.username ?? "",
        accountKind: Self.kind(of: value.account)
      )
    case .failure(let error):
      throw error
    }
  }

  private func isInteractionRequired(_ error: NSError) -> Bool {
    error.domain == MSALErrorDomain && error.code == MSALError.interactionRequired.rawValue
  }

  /// Which kind of Microsoft account this is.
  ///
  /// Worth reporting rather than assuming. The registration accepts both — it has to,
  /// because it is not yet known whether the business tenant permits one at all — so a
  /// note delivered to a personal drive when the user meant the work one is a plausible
  /// and completely silent mistake.
  private static func kind(of account: MSALAccount) -> String {
    account.homeAccountId?.tenantId == consumersTenant ? "personal" : "work"
  }
}

/// Where the Entra registration's details come from.
///
/// The client id is not a secret — this is a public client using PKCE, and there is no
/// client secret anywhere in this app — so it is committed rather than injected. The
/// authority is `common` rather than a tenant id on purpose: `08-iphone-phase-0.md` §6 says
/// not to commit tenant identifiers, and `common` also lets the same build sign into either
/// a work or a personal account, which is what makes the fallback in `09-iphone-graph.md`
/// §G0 possible without a second build.
enum GraphConfig {
  /// Filled in by the G0 spike. Nil until then, so the failure is "not configured" rather
  /// than an authentication error nobody can interpret.
  static let clientId: String? = Bundle.main.object(forInfoDictionaryKey: "EMQNOTE_CLIENT_ID")
    as? String

  static let authorityURL = URL(string: "https://login.microsoftonline.com/common")!

  static var redirectURI: String {
    "msauth.\(Bundle.main.bundleIdentifier ?? "com.emqnote.capture")://auth"
  }

  static let graphRoot = URL(string: "https://graph.microsoft.com/v1.0")!
}
