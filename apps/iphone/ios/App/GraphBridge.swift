//
//  GraphBridge.swift
//  emqnote iPhone — OneDrive delivery over Microsoft Graph
//
//  ⚠️  DRAFTED AGAINST THE DOCUMENTATION, NOT YET RUN AGAINST A REAL TENANT OR DRIVE.
//
//  Why this exists at all: Phase 0 proved on the real business iPhone that the route this
//  app was designed around does not exist. OneDrive's iOS File Provider extension does not
//  implement directory-domain selection, so no security-scoped bookmark to `00 Inbox` can
//  be obtained through the Files picker — see `phase-0-results.md` and B77. Graph is the
//  route that is left.
//
//  What this file is allowed to do is deliberately small. It signs in, resolves one folder,
//  writes one file without replacing anything, and reads one file back. It does not decide
//  when to retry, what the next collision-safe name is, or whether an interrupted upload
//  counts as delivered — all of that is in `src/delivery/`, in TypeScript, where
//  `npm run test:iphone` reaches it on any machine. The half of this feature that can only
//  be verified on the device is already big enough.
//
//  Registration assumes Capacitor 6 or newer, like `InboxBridge`, and happens in
//  `MainViewController.capacitorDidLoad()` because a local plugin never appears in
//  Capacitor's generated manifest.
//

import Capacitor
import Foundation
import UIKit

@objc(GraphBridgePlugin)
public class GraphBridgePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "GraphBridgePlugin"
  public let jsName = "GraphBridge"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signInSilently", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "accountStatus", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolveInbox", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "uploadNew", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "probeItem", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "showDiagnosticLog", returnType: CAPPluginReturnPromise),
  ]

  private static let inboxDefaultsKey = "emqnote.iphone.graph-inbox.v1"

  private let auth = MSALAuth.shared
  private let graph = GraphClient()
  private let log = DiagnosticLog.shared

  // MARK: Sign-in

  @objc func signIn(_ call: CAPPluginCall) {
    Task { @MainActor in
      let started = Date()
      do {
        guard let host = self.bridge?.viewController else { throw AuthError.noViewController }
        let token = try await self.auth.tokenInteractively(from: host)
        self.resolveAccount(call, token.username, token.accountKind, since: started)
      } catch {
        self.reject(call, error, since: started)
      }
    }
  }

  @objc func signInSilently(_ call: CAPPluginCall) {
    Task {
      let started = Date()
      do {
        let token = try await self.auth.tokenSilently()
        self.resolveAccount(call, token.username, token.accountKind, since: started)
      } catch {
        self.reject(call, error, since: started)
      }
    }
  }

  @objc func signOut(_ call: CAPPluginCall) {
    let started = Date()
    do {
      try auth.signOut()
      // The Inbox reference belongs to the account that resolved it. Leaving it behind
      // would point the next account at a folder it may not even be able to see.
      UserDefaults.standard.removeObject(forKey: Self.inboxDefaultsKey)
      resolve(call, [:], since: started)
    } catch {
      reject(call, error, since: started)
    }
  }

  @objc func accountStatus(_ call: CAPPluginCall) {
    let started = Date()
    guard let account = auth.signedInAccount() else {
      resolve(
        call,
        ["signedIn": false, "username": "", "accountKind": NSNull()],
        since: started
      )
      return
    }
    resolveAccount(call, account.username, account.accountKind, since: started)
  }

  // MARK: The Inbox

  @objc func resolveInbox(_ call: CAPPluginCall) {
    guard let vaultFolder = call.getString("vaultFolder"), !vaultFolder.isEmpty else {
      call.reject("vaultFolder is required", "ARGUMENTS")
      return
    }

    Task {
      let started = Date()
      do {
        let token = try await self.auth.tokenSilently()
        let (driveId, item) = try await self.graph.resolveInbox(
          vaultFolder: vaultFolder, token: token.accessToken
        )
        UserDefaults.standard.set(
          ["driveId": driveId, "itemId": item.id], forKey: Self.inboxDefaultsKey
        )
        self.resolve(
          call,
          ["driveId": driveId, "itemId": item.id, "folderName": item.name],
          since: started
        )
      } catch {
        self.reject(call, error, since: started)
      }
    }
  }

  private func storedInbox() throws -> (driveId: String, itemId: String) {
    guard
      let stored = UserDefaults.standard.dictionary(forKey: Self.inboxDefaultsKey),
      let driveId = stored["driveId"] as? String,
      let itemId = stored["itemId"] as? String
    else {
      throw GraphError.noInbox("no inbox has been resolved yet")
    }
    return (driveId, itemId)
  }

  // MARK: Delivery

  @objc func uploadNew(_ call: CAPPluginCall) {
    guard let filename = call.getString("filename"), !filename.isEmpty,
      let text = call.getString("bytes")
    else {
      call.reject("filename and bytes are required", "ARGUMENTS")
      return
    }
    guard !filename.contains("/") else {
      call.reject("filename must not contain a path separator", "ARGUMENTS")
      return
    }
    let data = Data(text.utf8)

    Task {
      let started = Date()
      do {
        let inbox = try self.storedInbox()
        let token = try await self.auth.tokenSilently()
        let item = try await self.graph.uploadNew(
          filename: filename,
          bytes: data,
          driveId: inbox.driveId,
          parentId: inbox.itemId,
          token: token.accessToken
        )
        self.log.append("uploaded \(filename) (\(data.count) bytes)")
        self.resolve(
          call,
          [
            "filename": filename,
            "byteCount": data.count,
            "sha256": GraphClient.sha256(of: data),
            "itemId": item.id,
            "eTag": item.eTag,
          ],
          since: started
        )
      } catch {
        self.log.append("upload of \(filename) failed: \(self.describe(error))")
        self.reject(call, error, since: started)
      }
    }
  }

  @objc func probeItem(_ call: CAPPluginCall) {
    guard let filename = call.getString("filename"), !filename.isEmpty else {
      call.reject("filename is required", "ARGUMENTS")
      return
    }

    Task {
      let started = Date()
      do {
        let inbox = try self.storedInbox()
        let token = try await self.auth.tokenSilently()
        let found = try await self.graph.probe(
          filename: filename,
          driveId: inbox.driveId,
          parentId: inbox.itemId,
          token: token.accessToken
        )

        guard let found else {
          self.resolve(
            call,
            ["exists": false, "size": 0, "itemId": "", "eTag": "", "contentSha256": ""],
            since: started
          )
          return
        }
        self.resolve(
          call,
          [
            "exists": true,
            "size": found.item.size,
            "itemId": found.item.id,
            "eTag": found.item.eTag,
            "contentSha256": found.sha256,
          ],
          since: started
        )
      } catch {
        self.reject(call, error, since: started)
      }
    }
  }

  @objc func showDiagnosticLog(_ call: CAPPluginCall) {
    call.resolve(["entries": log.entries()])
  }

  // MARK: Structured results

  private func resolveAccount(
    _ call: CAPPluginCall, _ username: String, _ kind: String, since started: Date
  ) {
    resolve(
      call,
      ["signedIn": true, "username": username, "accountKind": kind],
      since: started
    )
  }

  private func resolve(_ call: CAPPluginCall, _ fields: [String: Any], since started: Date) {
    var payload = fields
    payload["ok"] = true
    payload["durationMs"] = Self.elapsedMs(since: started)
    call.resolve(payload)
  }

  /// The same shape `InboxBridge` rejects with, so `failureOf` narrows both unchanged.
  ///
  /// `errorDomain` carries the *named* refusal rather than an Apple domain wherever there
  /// is one, because that is what `delivery/graph.ts` switches on to decide between
  /// renaming, retrying, and asking the user to sign in. An unrecognised domain is treated
  /// as "hold the note and say why", which is the right default for a refusal nobody
  /// anticipated.
  private func reject(_ call: CAPPluginCall, _ error: Error, since started: Date) {
    let nsError = error as NSError
    let domain = Self.domain(of: error) ?? nsError.domain
    call.reject(
      describe(error),
      domain,
      nsError,
      [
        "ok": false,
        "durationMs": Self.elapsedMs(since: started),
        "errorDomain": domain,
        "errorCode": nsError.code,
      ]
    )
  }

  private static func domain(of error: Error) -> String? {
    if let graphError = error as? GraphError { return graphError.domain }
    if let authError = error as? AuthError { return authError.domain }
    return nil
  }

  private func describe(_ error: Error) -> String {
    if let graphError = error as? GraphError { return graphError.message }
    if let authError = error as? AuthError { return authError.message }
    return (error as NSError).localizedDescription
  }

  private static func elapsedMs(since started: Date) -> Int {
    Int(Date().timeIntervalSince(started) * 1000)
  }
}
