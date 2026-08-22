/**
 * The JavaScript half of the Phase 0 feasibility bridge.
 *
 * `ios/InboxBridge.swift` implements §2's six operations; this is the contract they answer
 * on. It deliberately imports nothing from `@capacitor/core`: Capacitor is added on the Mac
 * (§1) and is not a dependency of this workspace, so a hard import would break `typecheck`
 * on every machine that is not the one running Phase 0. Reading the plugin off the global
 * costs one optional chain and keeps the web build honest.
 *
 * This is a *feasibility* interface, not the outbox. §2 says not to build that yet.
 */

/** What every operation reports back, whether it succeeded or not. */
export interface ProbeResult {
  ok: boolean;
  durationMs: number;
}

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

/** A rejected call arrives as an Error carrying the native domain and code (§6 wants both). */
export interface BridgeFailure extends Error {
  errorDomain?: string;
  errorCode?: number;
  durationMs?: number;
}

export interface InboxBridge {
  selectInbox(): Promise<FolderResult>;
  restoreInbox(): Promise<FolderResult>;
  writeDirect(options: { filename: string; bytes: string }): Promise<WriteResult>;
  writeByMove(options: { filename: string; bytes: string }): Promise<WriteResult>;
  readBack(options: { filename: string }): Promise<ReadBackResult>;
  showDiagnosticLog(): Promise<{ entries: string[] }>;
}

interface CapacitorGlobal {
  Capacitor?: { Plugins?: Record<string, unknown> };
}

/** The native bridge, or null in the browser — where Phase 0 cannot run at all. */
export function inboxBridge(scope: unknown = globalThis): InboxBridge | null {
  const plugin = (scope as CapacitorGlobal).Capacitor?.Plugins?.InboxBridge;
  return typeof plugin === "object" && plugin !== null ? (plugin as InboxBridge) : null;
}

/** Narrows a rejected native call into the fields the results sheet has columns for. */
export function failureOf(error: unknown): {
  message: string;
  errorDomain: string | null;
  errorCode: number | null;
} {
  if (typeof error !== "object" || error === null) {
    return { message: String(error), errorDomain: null, errorCode: null };
  }
  const failure = error as BridgeFailure;
  return {
    message: typeof failure.message === "string" ? failure.message : String(error),
    errorDomain: typeof failure.errorDomain === "string" ? failure.errorDomain : null,
    errorCode: typeof failure.errorCode === "number" ? failure.errorCode : null,
  };
}
