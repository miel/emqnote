//
//  InboxBridge.swift
//  emqnote iPhone — Phase 0 feasibility bridge
//
//  ⚠️  THIS FILE HAS NEVER BEEN COMPILED OR RUN.
//
//  It was drafted on Linux from the Apple documentation cited in `08-iphone-phase-0.md`,
//  in a VM with no Xcode, no iOS SDK and no device. Treat it as a starting point that
//  encodes the plan's decisions — not as working code. Expect to fix it against the
//  compiler, and expect at least one of its assumptions about OneDrive's File Provider to
//  be wrong; finding that out is what Phase 0 is for.
//
//  It implements §2's six operations and §3's two write strategies, and nothing else. It
//  is deliberately not the outbox: §2 says not to build that yet.
//
//  Registration assumes Capacitor 6 or newer, where `CAPBridgedPlugin` lets a plugin
//  register from Swift alone. On Capacitor 5 this needs a companion `InboxBridge.m` with
//  the `CAP_PLUGIN` / `CAP_PLUGIN_METHOD` macros instead.
//

import Capacitor
import CryptoKit
import Foundation
import UIKit
import UniformTypeIdentifiers

// MARK: - Plugin

@objc(InboxBridgePlugin)
public class InboxBridgePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "InboxBridgePlugin"
  public let jsName = "InboxBridge"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "selectInbox", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "restoreInbox", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "writeDirect", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "writeByMove", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "readBack", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "showDiagnosticLog", returnType: CAPPluginReturnPromise),
  ]

  /// The folder the picker is allowed to return. §2 requires the exact Inbox, never the vault.
  private static let requiredFolderName = "00 Inbox"

  private static let bookmarkDefaultsKey = "emqnote.iphone.inbox-bookmark.v1"

  /// §3: file operations run off the main thread, serially, so two probes cannot interleave.
  private let fileQueue = DispatchQueue(label: "dev.emqnote.inbox-bridge.files")

  private let log = DiagnosticLog()

  /// Held only while the picker is on screen; the delegate callbacks resolve it.
  private var pendingSelectCall: CAPPluginCall?

  // MARK: Folder selection

  @objc func selectInbox(_ call: CAPPluginCall) {
    call.keepAlive = true
    pendingSelectCall = call

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard let host = self.bridge?.viewController else {
        self.finishSelect(call, error: BridgeError.noViewController)
        return
      }
      // Apple: directory selection yields a security-scoped URL and works with third-party
      // File Providers such as OneDrive.
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
      picker.allowsMultipleSelection = false
      picker.delegate = self
      host.present(picker, animated: true)
    }
  }

  /// §2's post-selection checklist, in order. Any failure leaves nothing persisted.
  private func acceptSelection(_ url: URL, for call: CAPPluginCall) {
    let started = Date()

    guard url.lastPathComponent == Self.requiredFolderName else {
      log.append("rejected folder named \(url.lastPathComponent)")
      finishSelect(call, error: BridgeError.wrongFolder(url.lastPathComponent))
      return
    }

    // Step 3 and 6 are one statement so they cannot drift apart. Apple warns that an
    // unbalanced start leaks kernel resources and eventually blocks all external access.
    guard url.startAccessingSecurityScopedResource() else {
      log.append("startAccessingSecurityScopedResource refused")
      finishSelect(call, error: BridgeError.accessRefused)
      return
    }
    defer { url.stopAccessingSecurityScopedResource() }

    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
      isDirectory.boolValue
    else {
      log.append("selection is not a directory")
      finishSelect(call, error: BridgeError.notADirectory)
      return
    }

    do {
      try validateCoordinatedAccess(to: url)
      // On iOS a plain bookmark is already security-scoped. `.withSecurityScope` is a
      // macOS-only option and passing it here does not compile.
      let bookmark = try url.bookmarkData()
      UserDefaults.standard.set(bookmark, forKey: Self.bookmarkDefaultsKey)
      log.append("inbox selected and bookmarked")
      finishSelect(call, result: ["folderName": url.lastPathComponent], since: started)
    } catch {
      log.append("selection validation failed: \(describe(error))")
      finishSelect(call, error: error)
    }
  }

  /// §2 step 4: a small coordinated read/write, so a folder that cannot be written to is
  /// rejected at selection time rather than at the first real capture.
  private func validateCoordinatedAccess(to folder: URL) throws {
    let probe = folder.appendingPathComponent(".emqnote-write-check")
    var coordinationError: NSError?
    var thrown: Error?

    NSFileCoordinator().coordinate(writingItemAt: probe, options: [], error: &coordinationError) {
      effectiveURL in
      do {
        try Data().write(to: effectiveURL, options: .withoutOverwriting)
        try FileManager.default.removeItem(at: effectiveURL)
      } catch {
        thrown = error
      }
    }

    if let coordinationError { throw coordinationError }
    if let thrown { throw thrown }
  }

  @objc func restoreInbox(_ call: CAPPluginCall) {
    let started = Date()
    fileQueue.async { [weak self] in
      guard let self else { return }
      do {
        let url = try self.resolveInboxURL()
        guard url.startAccessingSecurityScopedResource() else {
          throw BridgeError.accessRefused
        }
        defer { url.stopAccessingSecurityScopedResource() }

        // §2 step 5 on relaunch: the name and availability are revalidated, because a
        // bookmark can resolve to a folder that has since been renamed or unshared.
        guard url.lastPathComponent == Self.requiredFolderName else {
          throw BridgeError.wrongFolder(url.lastPathComponent)
        }
        guard FileManager.default.fileExists(atPath: url.path) else {
          throw BridgeError.folderUnavailable
        }

        self.log.append("inbox restored from bookmark")
        self.resolve(call, ["folderName": url.lastPathComponent], since: started)
      } catch {
        self.log.append("restore failed: \(self.describe(error))")
        self.reject(call, error, since: started)
      }
    }
  }

  /// Resolves the stored bookmark, replacing it when iOS reports it stale (§2 steps 1–3).
  private func resolveInboxURL() throws -> URL {
    guard let bookmark = UserDefaults.standard.data(forKey: Self.bookmarkDefaultsKey) else {
      throw BridgeError.noBookmark
    }

    var isStale = false
    let url = try URL(
      resolvingBookmarkData: bookmark,
      options: [],
      relativeTo: nil,
      bookmarkDataIsStale: &isStale
    )

    if isStale {
      log.append("bookmark was stale; recreating")
      // Recreating needs scope held, and the caller has not started it yet.
      if url.startAccessingSecurityScopedResource() {
        defer { url.stopAccessingSecurityScopedResource() }
        if let fresh = try? url.bookmarkData() {
          UserDefaults.standard.set(fresh, forKey: Self.bookmarkDefaultsKey)
        }
      }
    }

    return url
  }

  // MARK: Write strategies

  /// §3 Strategy A — coordinated direct create.
  @objc func writeDirect(_ call: CAPPluginCall) {
    performWrite(call) { destination, bytes in
      var coordinationError: NSError?
      var thrown: Error?

      NSFileCoordinator().coordinate(
        writingItemAt: destination, options: [], error: &coordinationError
      ) { effectiveURL in
        do {
          // `.withoutOverwriting` is the collision guard, not `FileManager.createFile`,
          // which Apple documents as overwriting an existing file.
          try bytes.write(to: effectiveURL, options: .withoutOverwriting)
        } catch {
          thrown = error
        }
      }

      if let coordinationError { throw coordinationError }
      if let thrown { throw thrown }
    }
  }

  /// §3 Strategy B — complete bytes to a sandbox temporary file, then a coordinated move.
  @objc func writeByMove(_ call: CAPPluginCall) {
    performWrite(call) { destination, bytes in
      let staging = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension("md")
      try bytes.write(to: staging, options: .atomic)
      defer { try? FileManager.default.removeItem(at: staging) }

      var coordinationError: NSError?
      var thrown: Error?
      let coordinator = NSFileCoordinator()

      coordinator.coordinate(
        writingItemAt: staging, options: .forMoving,
        writingItemAt: destination, options: [],
        error: &coordinationError
      ) { effectiveSource, effectiveDestination in
        do {
          guard !FileManager.default.fileExists(atPath: effectiveDestination.path) else {
            throw BridgeError.destinationExists
          }
          coordinator.item(at: effectiveSource, willMoveTo: effectiveDestination)
          try FileManager.default.moveItem(at: effectiveSource, to: effectiveDestination)
          coordinator.item(at: effectiveSource, didMoveTo: effectiveDestination)
        } catch {
          thrown = error
        }
      }

      if let coordinationError { throw coordinationError }
      if let thrown { throw thrown }
    }
  }

  /// The half both strategies share: argument checking, scope, timing, structured result.
  private func performWrite(
    _ call: CAPPluginCall,
    using write: @escaping (URL, Data) throws -> Void
  ) {
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

    fileQueue.async { [weak self] in
      guard let self else { return }
      let started = Date()
      do {
        let folder = try self.resolveInboxURL()
        guard folder.startAccessingSecurityScopedResource() else {
          throw BridgeError.accessRefused
        }
        defer { folder.stopAccessingSecurityScopedResource() }

        let destination = folder.appendingPathComponent(filename)
        try write(destination, data)

        self.log.append("wrote \(filename) (\(data.count) bytes)")
        self.resolve(
          call,
          [
            "filename": filename,
            "byteCount": data.count,
            "sha256": Self.sha256(of: data),
          ],
          since: started
        )
      } catch {
        self.log.append("write of \(filename) failed: \(self.describe(error))")
        self.reject(call, error, since: started)
      }
    }
  }

  // MARK: Readback and diagnostics

  @objc func readBack(_ call: CAPPluginCall) {
    guard let filename = call.getString("filename"), !filename.isEmpty else {
      call.reject("filename is required", "ARGUMENTS")
      return
    }

    fileQueue.async { [weak self] in
      guard let self else { return }
      let started = Date()
      do {
        let folder = try self.resolveInboxURL()
        guard folder.startAccessingSecurityScopedResource() else {
          throw BridgeError.accessRefused
        }
        defer { folder.stopAccessingSecurityScopedResource() }

        let source = folder.appendingPathComponent(filename)
        var coordinationError: NSError?
        var data: Data?
        var thrown: Error?

        NSFileCoordinator().coordinate(
          readingItemAt: source, options: [], error: &coordinationError
        ) { effectiveURL in
          do { data = try Data(contentsOf: effectiveURL) } catch { thrown = error }
        }

        if let coordinationError { throw coordinationError }
        if let thrown { throw thrown }
        guard let data else { throw BridgeError.folderUnavailable }

        self.resolve(
          call,
          [
            "filename": filename,
            "byteCount": data.count,
            "sha256": Self.sha256(of: data),
            "text": String(decoding: data, as: UTF8.self),
          ],
          since: started
        )
      } catch {
        self.log.append("readback of \(filename) failed: \(self.describe(error))")
        self.reject(call, error, since: started)
      }
    }
  }

  @objc func showDiagnosticLog(_ call: CAPPluginCall) {
    call.resolve(["entries": log.entries()])
  }

  // MARK: Structured results

  /// §2: every operation answers with success, duration, and any native error domain and code.
  private func resolve(_ call: CAPPluginCall, _ fields: [String: Any], since started: Date) {
    var payload = fields
    payload["ok"] = true
    payload["durationMs"] = Self.elapsedMs(since: started)
    call.resolve(payload)
  }

  private func reject(_ call: CAPPluginCall, _ error: Error, since started: Date) {
    let nsError = error as NSError
    call.reject(
      describe(error),
      nsError.domain,
      nsError,
      [
        "ok": false,
        "durationMs": Self.elapsedMs(since: started),
        "errorDomain": nsError.domain,
        "errorCode": nsError.code,
      ]
    )
  }

  private func finishSelect(
    _ call: CAPPluginCall, result: [String: Any] = [:], since started: Date = Date()
  ) {
    pendingSelectCall = nil
    call.keepAlive = false
    resolve(call, result, since: started)
  }

  private func finishSelect(_ call: CAPPluginCall, error: Error) {
    pendingSelectCall = nil
    call.keepAlive = false
    reject(call, error, since: Date())
  }

  private func describe(_ error: Error) -> String {
    (error as? BridgeError)?.message ?? (error as NSError).localizedDescription
  }

  private static func elapsedMs(since started: Date) -> Int {
    Int(Date().timeIntervalSince(started) * 1000)
  }

  private static func sha256(of data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

// MARK: - Picker delegate

extension InboxBridgePlugin: UIDocumentPickerDelegate {
  public func documentPicker(
    _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
  ) {
    guard let call = pendingSelectCall else { return }
    guard let url = urls.first else {
      finishSelect(call, error: BridgeError.cancelled)
      return
    }
    fileQueue.async { [weak self] in
      self?.acceptSelection(url, for: call)
    }
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    guard let call = pendingSelectCall else { return }
    finishSelect(call, error: BridgeError.cancelled)
  }
}

// MARK: - Errors

/// Named refusals, so a failed matrix row names a cause instead of asserting one.
enum BridgeError: Error {
  case noViewController
  case cancelled
  case wrongFolder(String)
  case notADirectory
  case accessRefused
  case noBookmark
  case folderUnavailable
  case destinationExists

  var message: String {
    switch self {
    case .noViewController: return "no view controller to present the picker from"
    case .cancelled: return "folder selection was cancelled"
    case .wrongFolder(let name): return "expected the folder '00 Inbox', got '\(name)'"
    case .notADirectory: return "the selected item is not a directory"
    case .accessRefused: return "the system refused security-scoped access"
    case .noBookmark: return "no inbox has been selected yet"
    case .folderUnavailable: return "the bookmarked folder is not available"
    case .destinationExists: return "a file with that name already exists"
    }
  }
}

// MARK: - Diagnostic log

/// A small in-memory ring. Phase 0 needs to read back what happened on the device without
/// a Mac attached; nothing here is written to disk, so it costs nothing to leave enabled.
final class DiagnosticLog {
  private let lock = NSLock()
  private var lines: [String] = []
  private let limit = 500

  private lazy var formatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  func append(_ message: String) {
    lock.lock()
    defer { lock.unlock() }
    lines.append("\(formatter.string(from: Date())) \(message)")
    if lines.count > limit { lines.removeFirst(lines.count - limit) }
  }

  func entries() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    return lines
  }
}
