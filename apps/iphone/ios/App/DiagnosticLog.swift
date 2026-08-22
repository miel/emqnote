//
//  DiagnosticLog.swift
//  emqnote iPhone
//
//  A small in-memory ring, shared by both native bridges.
//
//  It exists because the questions this app has to answer on the device — did the write
//  land, which error did the provider give, how long did the upload take — have to be
//  readable *on the device*, with no Mac attached and no Xcode console. `showDiagnosticLog`
//  on either plugin returns the same buffer, so a session that touched both routes reads as
//  one sequence rather than two interleaved guesses.
//
//  Nothing here is written to disk, which is deliberate now that there is a Microsoft token
//  in the process: a log that cannot outlive the app cannot leak from a backup.
//

import Foundation

final class DiagnosticLog {
  /// One buffer for the whole app. Two bridges writing to two rings would be two partial
  /// stories of one sequence of events.
  static let shared = DiagnosticLog()

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
    lines.append("\(formatter.string(from: Date())) \(Self.redact(message))")
    if lines.count > limit { lines.removeFirst(lines.count - limit) }
  }

  func entries() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    return lines
  }

  /// Last line of defence, not the first.
  ///
  /// Callers are expected not to log a token at all. This exists because the diagnostic log
  /// is a screen the user can read and screenshot, and because Graph error bodies are echoed
  /// into it verbatim — one of them carrying a bearer token or a tenant id back is exactly
  /// the kind of thing nobody notices until it is in a support thread.
  private static func redact(_ message: String) -> String {
    var result = message
    for pattern in ["Bearer ", "access_token", "refresh_token", "id_token"] {
      guard let range = result.range(of: pattern, options: .caseInsensitive) else { continue }
      result = String(result[..<range.lowerBound]) + "\(pattern)<redacted>"
    }
    return result
  }
}
