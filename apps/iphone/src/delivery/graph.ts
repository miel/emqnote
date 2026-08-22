/**
 * Microsoft Graph as a delivery destination.
 *
 * Thin by design: it turns native rejections into the six outcomes `deliverer.ts` defines
 * and does nothing else. The one piece of judgement it does carry — deciding what a taken
 * name means — is here rather than in Swift because it is the decision that makes
 * "delivered exactly once" true, and it belongs where it can be tested.
 */

import {
  GRAPH_ERRORS,
  type GraphBridge,
  type GraphErrorDomain,
} from "../graph-bridge.js";
import { failureOf } from "../native-bridge.js";
import type { Deliverer, DeliveryOutcome } from "./deliverer.js";
import { sha256Hex } from "./hash.js";

function domainOf(error: unknown): GraphErrorDomain | null {
  const { errorDomain } = failureOf(error);
  const known = Object.values(GRAPH_ERRORS) as string[];
  return errorDomain !== null && known.includes(errorDomain)
    ? (errorDomain as GraphErrorDomain)
    : null;
}

function messageOf(error: unknown): string {
  return failureOf(error).message;
}

export function graphDeliverer(bridge: GraphBridge): Deliverer {
  /**
   * The name is taken. By us, or by something else?
   *
   * `07-iphone.md` §5 step 6: identical content means the first delivery succeeded;
   * different content gets the next collision-safe name. The comparison downloads the item
   * and hashes it, because the only hash Graph publishes for a business drive is one this
   * app does not compute.
   *
   * When the probe itself fails there is no honest answer, so this reports neither — a
   * retry is the only outcome that cannot turn one note into two or overwrite somebody's
   * work on a guess.
   */
  const resolveTakenName = async (
    filename: string,
    bytes: string,
  ): Promise<DeliveryOutcome> => {
    try {
      const [probe, ours] = await Promise.all([
        bridge.probeItem({ filename }),
        sha256Hex(bytes),
      ]);
      if (!probe.exists) {
        // It was there a moment ago and is not now. Someone moved or deleted it between
        // the two calls; going round again under the same name is exactly right.
        return { kind: "retry", reason: "the name freed up between attempts" };
      }
      return probe.contentSha256 === ours
        ? { kind: "already-delivered", itemId: probe.itemId }
        : { kind: "collision" };
    } catch (error) {
      return {
        kind: "retry",
        reason: `could not check the existing ${filename}: ${messageOf(error)}`,
      };
    }
  };

  return {
    id: "graph",

    async deliver(filename: string, bytes: string): Promise<DeliveryOutcome> {
      try {
        const result = await bridge.uploadNew({ filename, bytes });
        return { kind: "delivered", itemId: result.itemId };
      } catch (error) {
        switch (domainOf(error)) {
          case GRAPH_ERRORS.nameExists:
            return resolveTakenName(filename, bytes);
          case GRAPH_ERRORS.noAccount:
          case GRAPH_ERRORS.interactionRequired:
            return { kind: "needs-signin" };
          case GRAPH_ERRORS.transient:
            return { kind: "retry", reason: messageOf(error) };
          case GRAPH_ERRORS.noInbox:
            return { kind: "failed", reason: "the 00 Inbox folder could not be found" };
          default:
            // An unrecognised domain is not a licence to keep hammering Graph with a
            // request it has already refused. Hold the note and name the refusal.
            return { kind: "failed", reason: messageOf(error) };
        }
      }
    },
  };
}
