/**
 * The JavaScript half of the Microsoft Graph delivery bridge.
 *
 * `ios/App/GraphBridge.swift` implements these operations over MSAL and
 * `https://graph.microsoft.com`. It exists because Phase 0 disproved the route this app
 * was designed around: OneDrive's iOS File Provider extension does not support
 * directory-domain selection, so no security-scoped bookmark to `00 Inbox` can be
 * obtained through the Files picker at all (B77, `phase-0-results.md`).
 *
 * The division of labour is deliberate and is the reason this file is worth having.
 * **Swift does the things only Swift can do** — hold a token in the Keychain, speak to a
 * broker, make an HTTPS request that is not subject to a webview's CORS rules. **Policy
 * stays here in TypeScript**, where `npm run test:iphone` can reach it: which item to
 * deliver next, when to retry, what the next collision-safe name is, and whether an
 * interrupted upload actually landed. Nothing in the Swift half decides anything.
 *
 * Like `inbox-bridge.ts`, this imports nothing from `@capacitor/core`.
 */

import { nativePlugin, type ProbeResult } from "./native-bridge.js";

/**
 * Which kind of Microsoft account is signed in.
 *
 * Worth reporting rather than assuming: the app registration is multi-tenant plus personal
 * accounts (authority `common`), because at the time it was written it was not known
 * whether the business tenant would permit registration or consent at all. A note
 * delivered to a personal drive when the user meant the work one is a silently wrong
 * outcome, so the UI names which account it is signed into.
 */
export type AccountKind = "work" | "personal";

export interface AccountResult extends ProbeResult {
  signedIn: boolean;
  username: string;
  accountKind: AccountKind | null;
}

export interface InboxResult extends ProbeResult {
  /** The drive holding the vault. Recorded so a second drive cannot be written to by accident. */
  driveId: string;
  /** The `00 Inbox` folder's item id — uploads address it by id, not by re-walking the path. */
  itemId: string;
  folderName: string;
}

export interface UploadResult extends ProbeResult {
  filename: string;
  byteCount: number;
  sha256: string;
  itemId: string;
  eTag: string;
}

/**
 * What Graph currently holds under a name.
 *
 * `contentSha256` is computed by downloading the item and hashing the bytes, not read from
 * a Graph facet. Business OneDrive exposes only `quickXorHash` — never sha256 — and
 * reimplementing QuickXorHash in Swift to compare against would put an unverified
 * assumption in the exact place the app must not guess: deciding whether a note that may
 * already have been delivered was delivered (B79). A note is a few kilobytes.
 */
export interface ItemProbeResult extends ProbeResult {
  exists: boolean;
  size: number;
  itemId: string;
  eTag: string;
  contentSha256: string;
}

export interface GraphBridge {
  /** Interactive sign-in. Only ever called from a user action, never from a retry. */
  signIn(): Promise<AccountResult>;
  /** Cached-account sign-in. Rejects `NO_ACCOUNT` or `INTERACTION_REQUIRED`. */
  signInSilently(): Promise<AccountResult>;
  signOut(): Promise<ProbeResult>;
  accountStatus(): Promise<AccountResult>;
  /** Resolves `<vaultFolder>/00 Inbox` on the signed-in user's own drive and remembers it. */
  resolveInbox(options: { vaultFolder: string }): Promise<InboxResult>;
  /** Uploads without ever replacing. Rejects `NAME_EXISTS` when the name is taken. */
  uploadNew(options: { filename: string; bytes: string }): Promise<UploadResult>;
  probeItem(options: { filename: string }): Promise<ItemProbeResult>;
  showDiagnosticLog(): Promise<{ entries: string[] }>;
}

/**
 * The named refusals the Swift half raises, as `errorDomain`.
 *
 * These are the ones the delivery layer *acts* on differently; everything else is a
 * message to show and an item to retry. Keeping them as a union rather than loose strings
 * means `delivery/graph.ts` cannot quietly stop handling one.
 */
export const GRAPH_ERRORS = {
  /** No account has ever signed in on this device. */
  noAccount: "NO_ACCOUNT",
  /** A token exists but the user must complete a prompt — never do this from a retry. */
  interactionRequired: "INTERACTION_REQUIRED",
  /** `00 Inbox` has not been resolved yet, or the stored reference no longer resolves. */
  noInbox: "NO_INBOX",
  /** Graph answered 409 `nameAlreadyExists`; the destination was not touched. */
  nameExists: "NAME_EXISTS",
  /** Reachability, timeout, 429 or 5xx — worth trying again unchanged. */
  transient: "TRANSIENT",
} as const;

export type GraphErrorDomain = (typeof GRAPH_ERRORS)[keyof typeof GRAPH_ERRORS];

/** The native bridge, or null in the browser — where it cannot run at all. */
export function graphBridge(scope: unknown = globalThis): GraphBridge | null {
  return nativePlugin<GraphBridge>("GraphBridge", scope);
}
