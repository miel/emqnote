/**
 * The iOS Files folder as a delivery destination — iCloud Drive, Dropbox, and anything
 * else whose File Provider implements directory-domain selection.
 *
 * Not OneDrive. Phase 0 established that on the real device: OneDrive's provider greys
 * itself out in a `.folder` picker, so `selectInbox` can never return a bookmark to
 * `00 Inbox` (B77). Every other provider tried was selectable, which is why this adapter
 * exists at all rather than being deleted along with the route it was written for.
 *
 * It is not reachable from the capture UI yet — `destination.ts` only ever hands back the
 * Graph deliverer. It is written now, against the same port, so that supporting a second
 * provider later is a choice in one file rather than a refactor of the delivery loop.
 */

import type { InboxBridge } from "../inbox-bridge.js";
import { failureOf } from "../native-bridge.js";
import type { Deliverer, DeliveryOutcome } from "./deliverer.js";
import { sha256Hex } from "./hash.js";

/**
 * How the Swift side says "that name is taken".
 *
 * `writeDirect` uses `Data.WritingOptions.withoutOverwriting`, whose refusal is Cocoa's
 * `NSFileWriteFileExistsError`; `writeByMove` checks first and raises its own named
 * refusal. Both mean the same thing here, and both mean the destination was not touched.
 */
const FILE_EXISTS_CODE = 516;

function isNameTaken(error: unknown): boolean {
  const failure = failureOf(error);
  if (failure.errorDomain === "NSCocoaErrorDomain" && failure.errorCode === FILE_EXISTS_CODE) {
    return true;
  }
  return failure.message.includes("already exists");
}

export function filesDeliverer(bridge: InboxBridge): Deliverer {
  return {
    id: "files",

    async deliver(filename: string, bytes: string): Promise<DeliveryOutcome> {
      try {
        await bridge.writeDirect({ filename, bytes });
        return { kind: "delivered" };
      } catch (error) {
        if (!isNameTaken(error)) {
          return { kind: "retry", reason: failureOf(error).message };
        }
        try {
          const [existing, ours] = await Promise.all([
            bridge.readBack({ filename }),
            sha256Hex(bytes),
          ]);
          return existing.sha256 === ours
            ? { kind: "already-delivered" }
            : { kind: "collision" };
        } catch (readError) {
          return {
            kind: "retry",
            reason: `could not check the existing ${filename}: ${failureOf(readError).message}`,
          };
        }
      }
    },
  };
}
