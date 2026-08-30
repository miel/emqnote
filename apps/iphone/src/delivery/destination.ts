/**
 * Which destination is in use, and where the vault is.
 *
 * One line of policy, kept out of the components: Graph is the destination, because it is
 * the only one that reaches OneDrive. `filesDeliverer` is constructed here too so the
 * choice is a value rather than a hardcoded import somewhere in the drain loop.
 */

import type { DraftStorage } from "../draft.js";
import { graphBridge, type AccountKind } from "../graph-bridge.js";
import { inboxBridge } from "../inbox-bridge.js";
import type { Deliverer, DestinationId } from "./deliverer.js";
import { filesDeliverer } from "./files.js";
import { graphDeliverer } from "./graph.js";

export const DESTINATION_KEY = "emqnote.iphone.destination.v1";
export const VAULT_FOLDER_KEY = "emqnote.iphone.vault-folder.v1";
export const ACCOUNT_KIND_KEY = "emqnote.iphone.account-kind.v1";

/**
 * The vault folder's name inside the user's own OneDrive, as the desktop knows it.
 *
 * Matches `VAULT_FOLDER_NAME` in `src/main/vault.ts`. Stored rather than compiled in
 * because Graph addresses it by path exactly once, when resolving `00 Inbox`, and getting
 * it wrong should be a settings correction rather than a rebuild.
 *
 * There is nothing to discover here the way the desktop discovers it. Worth knowing that
 * the desktop's `findOneDriveCandidates` would not find this vault either: it rejects any
 * path matching `/personal/i` on the grounds that a personal OneDrive is not a work
 * environment. That only suppresses the *suggestion* — B21 makes the vault a click in a
 * chooser rather than a guess — so a personal-OneDrive vault is picked by hand on the
 * desktop and named here on the phone.
 */
export const DEFAULT_VAULT_FOLDER = "emqnote";

export function loadDestination(storage: DraftStorage): DestinationId {
  return storage.getItem(DESTINATION_KEY) === "files" ? "files" : "graph";
}

export function storeDestination(storage: DraftStorage, id: DestinationId): void {
  storage.setItem(DESTINATION_KEY, id);
}

/**
 * Which kind of Microsoft account this install expects to deliver through.
 *
 * `personal`, because the business tenant does not permit an app registration and there is
 * no portal access to ask for one — so both the registration and the vault live on a
 * personal Microsoft account (B80).
 *
 * It is stored, and checked against what actually signed in, because the app registration
 * accepts both kinds and the two drives are different places. Signing into the wrong one
 * does not fail: it delivers a real note into a real `00 Inbox` on a drive nobody is
 * looking at. That is the failure worth catching, and it can only be caught by knowing
 * which one was meant.
 */
export function loadExpectedAccountKind(storage: DraftStorage): AccountKind {
  return storage.getItem(ACCOUNT_KIND_KEY) === "work" ? "work" : "personal";
}

export function storeExpectedAccountKind(storage: DraftStorage, kind: AccountKind): void {
  storage.setItem(ACCOUNT_KIND_KEY, kind);
}

export function loadVaultFolder(storage: DraftStorage): string {
  const stored = storage.getItem(VAULT_FOLDER_KEY);
  return stored === null || stored.trim() === "" ? DEFAULT_VAULT_FOLDER : stored;
}

export function storeVaultFolder(storage: DraftStorage, folder: string): void {
  storage.setItem(VAULT_FOLDER_KEY, folder.trim());
}

/**
 * The active destination, or null outside the iOS app.
 *
 * Null is the ordinary case in a browser during development, and it is not an error: the
 * capture screen still works, notes still queue durably, and nothing is delivered. That is
 * the same shape the app has when it is offline.
 */
export function activeDeliverer(storage: DraftStorage, scope: unknown = globalThis): Deliverer | null {
  if (loadDestination(storage) === "files") {
    const bridge = inboxBridge(scope);
    return bridge === null ? null : filesDeliverer(bridge);
  }
  const bridge = graphBridge(scope);
  return bridge === null ? null : graphDeliverer(bridge);
}
