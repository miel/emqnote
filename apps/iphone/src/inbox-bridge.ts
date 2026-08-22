/**
 * The JavaScript half of the Phase 0 feasibility bridge — the iOS Files route.
 *
 * `ios/App/InboxBridge.swift` implements `08-iphone-phase-0.md` §2's six operations; this
 * is the contract they answer on. The shared plumbing (the plugin lookup, the failure
 * narrowing, the `ok`/`durationMs` shape) lives in `native-bridge.ts` now, because Graph
 * answers in the same shape.
 *
 * **Phase 0 ruled this route out for OneDrive** — see `phase-0-results.md`: Microsoft's
 * File Provider extension does not implement directory-domain selection, so `selectInbox`
 * cannot obtain a bookmark to `00 Inbox` at all. It is kept, and kept working, because the
 * same run showed iCloud Drive and Dropbox *do* implement it. Delivery is a port with two
 * adapters (B78); this is the second one, and it is the only route that will ever work for
 * a provider that isn't OneDrive.
 */

import { nativePlugin, type ProbeResult } from "./native-bridge.js";

export { failureOf, nativePlugin } from "./native-bridge.js";
export type { BridgeFailure, ProbeResult } from "./native-bridge.js";

export interface WriteResult extends ProbeResult {
  filename: string;
  byteCount: number;
  sha256: string;
}

export interface ReadBackResult extends WriteResult {
  text: string;
}

export interface FolderResult extends ProbeResult {
  folderName: string;
}

export interface InboxBridge {
  selectInbox(): Promise<FolderResult>;
  restoreInbox(): Promise<FolderResult>;
  writeDirect(options: { filename: string; bytes: string }): Promise<WriteResult>;
  writeByMove(options: { filename: string; bytes: string }): Promise<WriteResult>;
  readBack(options: { filename: string }): Promise<ReadBackResult>;
  showDiagnosticLog(): Promise<{ entries: string[] }>;
}

/** The native bridge, or null in the browser — where it cannot run at all. */
export function inboxBridge(scope: unknown = globalThis): InboxBridge | null {
  return nativePlugin<InboxBridge>("InboxBridge", scope);
}
