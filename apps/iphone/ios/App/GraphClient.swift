//
//  GraphClient.swift
//  emqnote iPhone — the OneDrive calls, and only those
//
//  ⚠️  DRAFTED AGAINST THE DOCUMENTATION, NOT YET RUN AGAINST A REAL DRIVE.
//
//  Four operations: find the Inbox, upload without replacing, read an item's bytes back,
//  and nothing else. There is no listing, no search, no enumeration — acceptance criterion
//  10 says no action may enumerate the vault, and the simplest way to keep that true is for
//  the code that could to not exist.
//
//  The one thing in here that must be *measured* rather than believed is the collision
//  behaviour; see `uploadNew`.
//

import CryptoKit
import Foundation

struct GraphItem {
  let id: String
  let eTag: String
  let name: String
  let size: Int
}

enum GraphError: Error {
  case noInbox(String)
  case nameExists
  case transient(String)
  case refused(status: Int, message: String)

  var message: String {
    switch self {
    case .noInbox(let detail): return detail
    case .nameExists: return "a file with that name already exists"
    case .transient(let detail): return detail
    case .refused(let status, let message): return "Graph refused with \(status): \(message)"
    }
  }

  /// The domain the JavaScript side switches on; see `GRAPH_ERRORS` in `graph-bridge.ts`.
  var domain: String {
    switch self {
    case .noInbox: return "NO_INBOX"
    case .nameExists: return "NAME_EXISTS"
    case .transient: return "TRANSIENT"
    case .refused: return "REFUSED"
    }
  }
}

final class GraphClient {
  private let log = DiagnosticLog.shared
  private let session: URLSession

  init() {
    let configuration = URLSessionConfiguration.ephemeral
    // Short on purpose. An unreachable network has to *fail* an outbox item so the drain
    // can move on and the backoff can start; a request that hangs instead holds the whole
    // serial queue behind it for as long as iOS allows.
    configuration.timeoutIntervalForRequest = 20
    configuration.timeoutIntervalForResource = 60
    configuration.waitsForConnectivity = false
    session = URLSession(configuration: configuration)
  }

  // MARK: Resolving the Inbox

  /// Finds `<vaultFolder>/00 Inbox` on the signed-in user's own drive.
  ///
  /// Addressed by path exactly once, here. Everything afterwards uses the returned drive
  /// and item ids, so a later upload cannot walk into a different folder because a path
  /// component changed underneath it.
  func resolveInbox(vaultFolder: String, token: String) async throws -> (driveId: String, item: GraphItem) {
    let path = "\(vaultFolder)/00 Inbox"
    let url = GraphConfig.graphRoot
      .appendingPathComponent("me")
      .appendingPathComponent("drive")
      .appendingPathComponent("root:/\(path):")

    let (data, response) = try await send(request(.get, url: try encoded(url), token: token))

    guard response.statusCode == 200 else {
      throw GraphError.noInbox("\(path) could not be found (\(response.statusCode))")
    }
    let item = try decodeItem(data)
    guard item.name == "00 Inbox" else {
      // The same guard `InboxBridge` applies to a picked folder. Selecting the whole vault
      // is not something to fall back to.
      throw GraphError.noInbox("expected the folder '00 Inbox', got '\(item.name)'")
    }
    guard let driveId = try driveId(from: data) else {
      throw GraphError.noInbox("Graph returned no drive for \(path)")
    }
    log.append("resolved 00 Inbox")
    return (driveId, item)
  }

  // MARK: Uploading

  /// Uploads `bytes` under exactly `filename`, failing rather than replacing.
  ///
  /// **The collision guard is `@microsoft.graph.conflictBehavior=fail`, and whether the
  /// simple-upload endpoint honours it in the query string is the one thing `G2`'s matrix
  /// has to establish before this is relied on.** Microsoft documents the annotation for
  /// upload sessions; the query-string form on `PUT …/content` is widely used and widely
  /// asserted, which is not the same as measured. If the device run shows it replacing an
  /// existing file, switch to `createUploadSession` with the annotation in the body — a
  /// note is a few kilobytes, so the extra round trip costs nothing anybody would notice.
  ///
  /// This is the Graph analogue of `08-iphone-phase-0.md` §3's two write strategies, and it
  /// gets settled the same way: by running it, not by preferring one.
  func uploadNew(
    filename: String,
    bytes: Data,
    driveId: String,
    parentId: String,
    token: String
  ) async throws -> GraphItem {
    let url = try encoded(
      GraphConfig.graphRoot
        .appendingPathComponent("drives")
        .appendingPathComponent(driveId)
        .appendingPathComponent("items")
        .appendingPathComponent("\(parentId):/\(filename):")
        .appendingPathComponent("content"),
      query: [URLQueryItem(name: "@microsoft.graph.conflictBehavior", value: "fail")]
    )

    var upload = request(.put, url: url, token: token)
    upload.setValue("text/markdown", forHTTPHeaderField: "Content-Type")
    upload.httpBody = bytes

    let (data, response) = try await send(upload)

    switch response.statusCode {
    case 200, 201:
      return try decodeItem(data)
    case 409:
      throw GraphError.nameExists
    default:
      throw try refusal(status: response.statusCode, data: data, response: response)
    }
  }

  // MARK: Reading back

  /// The item under `filename`, and the sha256 of the bytes it actually holds.
  ///
  /// Downloads the content rather than reading a hash facet. Business OneDrive publishes
  /// only `quickXorHash`, and reimplementing QuickXorHash here to compare against would put
  /// an unverified assumption in the single place this app must not guess — deciding
  /// whether a note that may already have been delivered was delivered (B79).
  func probe(
    filename: String,
    driveId: String,
    parentId: String,
    token: String
  ) async throws -> (item: GraphItem, sha256: String)? {
    let base = GraphConfig.graphRoot
      .appendingPathComponent("drives")
      .appendingPathComponent(driveId)
      .appendingPathComponent("items")
      .appendingPathComponent("\(parentId):/\(filename):")

    let (metadata, metaResponse) = try await send(request(.get, url: try encoded(base), token: token))
    if metaResponse.statusCode == 404 { return nil }
    guard metaResponse.statusCode == 200 else {
      throw try refusal(status: metaResponse.statusCode, data: metadata, response: metaResponse)
    }
    let item = try decodeItem(metadata)

    let contentURL = try encoded(base.appendingPathComponent("content"))
    let (content, contentResponse) = try await send(request(.get, url: contentURL, token: token))
    guard contentResponse.statusCode == 200 else {
      throw try refusal(status: contentResponse.statusCode, data: content, response: contentResponse)
    }

    return (item, Self.sha256(of: content))
  }

  // MARK: Requests

  private enum Method: String {
    case get = "GET"
    case put = "PUT"
  }

  private func request(_ method: Method, url: URL, token: String) -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = method.rawValue
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  /// Percent-encodes the path, leaving Graph's own `:` and `/` delimiters alone.
  ///
  /// A note's filename reaches here straight out of `sanitiseTitle`, which strips what
  /// Windows forbids and nothing else — so `#`, `?` and `%` all survive into a name, and
  /// all three end a URL path early if they are not encoded. `#` is the one that actually
  /// happens: the Tag button puts them in bodies, and a title pasted from a body brings one
  /// along.
  private func encoded(_ url: URL, query: [URLQueryItem] = []) throws -> URL {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      throw GraphError.transient("could not build a request URL")
    }
    var allowed = CharacterSet.urlPathAllowed
    allowed.remove(charactersIn: "#?%")
    // `percentEncodedPath` is assigned rather than `path` because the delimiters Graph's
    // path addressing relies on (`:` and `/`) must stay literal.
    components.percentEncodedPath =
      components.path.addingPercentEncoding(withAllowedCharacters: allowed) ?? components.path
    if !query.isEmpty { components.queryItems = query }

    guard let result = components.url else {
      throw GraphError.transient("could not build a request URL")
    }
    return result
  }

  private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else {
        throw GraphError.transient("Graph returned a response that was not HTTP")
      }
      log.append("\(request.httpMethod ?? "?") \(request.url?.path ?? "") → \(http.statusCode)")
      return (data, http)
    } catch let error as GraphError {
      throw error
    } catch {
      // Reachability, DNS, a timeout. All worth trying again unchanged.
      throw GraphError.transient((error as NSError).localizedDescription)
    }
  }

  /// Turns a non-success status into the right *kind* of failure.
  ///
  /// The distinction that matters is retry-or-not. Throttling and 5xx are Graph asking to
  /// be left alone briefly; `Retry-After` is honoured by the outbox's backoff rather than by
  /// sleeping here, so the app stays responsive and the wait survives being backgrounded.
  private func refusal(status: Int, data: Data, response: HTTPURLResponse) throws -> GraphError {
    let body = String(decoding: data.prefix(512), as: UTF8.self)
    if status == 429 || status >= 500 {
      let after = response.value(forHTTPHeaderField: "Retry-After") ?? "unspecified"
      return .transient("Graph asked to wait (\(status), Retry-After \(after))")
    }
    if status == 404 {
      return .noInbox("Graph could not find the item (404)")
    }
    return .refused(status: status, message: body)
  }

  // MARK: Decoding

  private struct ItemPayload: Decodable {
    struct ParentReference: Decodable { let driveId: String? }
    struct Folder: Decodable { let childCount: Int? }
    let id: String
    let name: String
    let size: Int?
    let eTag: String?
    let folder: Folder?
    let parentReference: ParentReference?
  }

  private func decodeItem(_ data: Data) throws -> GraphItem {
    guard let payload = try? JSONDecoder().decode(ItemPayload.self, from: data) else {
      throw GraphError.transient("Graph returned something this app could not read")
    }
    return GraphItem(
      id: payload.id,
      eTag: payload.eTag ?? "",
      name: payload.name,
      size: payload.size ?? 0
    )
  }

  private func driveId(from data: Data) throws -> String? {
    let payload = try? JSONDecoder().decode(ItemPayload.self, from: data)
    return payload?.parentReference?.driveId
  }

  static func sha256(of data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}
