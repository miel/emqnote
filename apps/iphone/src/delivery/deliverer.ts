/**
 * The one interface a delivery destination has to satisfy.
 *
 * There are two of them, and there are two for a reason that was measured rather than
 * guessed. Phase 0 ran the iOS Files folder picker on the real device and found OneDrive's
 * File Provider greyed out while iCloud Drive and Dropbox were selectable — so the Files
 * route works everywhere except the one provider this app needs, and Graph works only for
 * OneDrive. Neither replaces the other, so neither is hardcoded (B78).
 *
 * Everything a destination is allowed to do is in this file. It is handed finished bytes
 * and a finished name and answers with one of six outcomes; it does not decide when to
 * retry, what to call the next attempt, or whether a half-finished upload counts. That is
 * `outbox.ts`, which is pure and tested.
 */

export type DestinationId = "graph" | "files";

export type DeliveryOutcome =
  /** The bytes are in the Inbox under the name we asked for. */
  | { kind: "delivered"; itemId?: string }
  /**
   * The name is taken, and by a file with our exact bytes.
   *
   * This is the interrupted-delivery case, and it is the whole reason `07-iphone.md` §5
   * step 6 exists: a first attempt that never reported back had in fact succeeded.
   * Treating it as delivered is what makes retrying safe, and what keeps criterion 7's
   * "exactly once" true rather than approximately true.
   */
  | { kind: "already-delivered"; itemId?: string }
  /** The name is taken by *different* bytes. Never overwrite; take the next name. */
  | { kind: "collision" }
  /** No usable credentials. Interactive sign-in is the user's to trigger, never a retry's. */
  | { kind: "needs-signin" }
  /** Reachability, a timeout, throttling. Worth trying again unchanged, later. */
  | { kind: "retry"; reason: string }
  /** Retrying unchanged will not fix this. Hold the note and say why. */
  | { kind: "failed"; reason: string };

/**
 * A destination has exactly one method, and that is not an oversight.
 *
 * An earlier version also had `status()`, so the app could ask whether delivery was possible
 * before attempting it. Nothing ever called it: `deliver` already reports `needs-signin`, and
 * asking first costs a round trip to learn what the attempt would have told us anyway. Two
 * implementations and a set of tests for a method with no callers is worse than a missing
 * abstraction — the tests make it look load-bearing.
 */
export interface Deliverer {
  readonly id: DestinationId;
  /**
   * Writes `bytes` under exactly `filename`, or reports why not.
   *
   * `filename` is the collision candidate the outbox chose, not the note's original name.
   * A destination must never rename on its own — a name chosen server-side would not
   * follow the product-wide `(2)` contract, and the desktop's conflict-copy detector
   * reads filenames.
   */
  deliver(filename: string, bytes: string): Promise<DeliveryOutcome>;
}
