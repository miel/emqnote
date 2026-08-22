/**
 * Which destination is in use, and where the vault is.
 *
 * One line of policy, kept out of the components: Graph is the destination, because it is
 * the only one that reaches OneDrive. `filesDeliverer` is constructed here too so the
 * choice is a value rather than a hardcoded import somewhere in the drain loop.
 */

import type { DraftStorage } from "../draft.js";
import { graphBridge } from "../graph-bridge.js";
import { inboxBridge } from "../inbox-bridge.js";
import type { Deliverer, DestinationId } from "./deliverer.js";
import { filesDeliverer } from "./files.js";
import { graphDeliverer } from "./graph.js";

export const DESTINATION_KEY = "emqnote.iphone.destination.v1";
export const VAULT_FOLDER_KEY = "emqnote.iphone.vault-folder.v1";

/**
 * The vault folder's name inside the user's own OneDrive, as the desktop knows it.
 *
 * Stored rather than compiled in because Graph addresses it by path exactly once, when
 * resolving `00 Inbox`, and getting it wrong should be a settings correction rather than a
 * rebuild. `src/main/vault.ts` on the desktop reaches the same folder by looking for
 * `OneDrive - <tenant>` in the home directory; there is no equivalent to discover here, so
 * it is asked for.
 */
export const DEFAULT_VAULT_FOLDER = "emqnote";

export function loadDestination(storage: DraftStorage): DestinationId {
  return storage.getItem(DESTINATION_KEY) === "files" ? "files" : "graph";
}

export function storeDestination(storage: DraftStorage, id: DestinationId): void {
  storage.setItem(DESTINATION_KEY, id);
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
