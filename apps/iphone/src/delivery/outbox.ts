/**
 * What happens to an outbox item after a destination answers.
 *
 * Pure on purpose: no timers, no network, no storage. Every rule that decides whether a
 * note is delivered once, twice or not at all lives in this file and is reachable from
 * `npm run test:iphone` on any machine — which matters, because the half of this feature
 * that cannot be tested anywhere but on the device is already large enough.
 */

import { collisionCandidate, MAX_COLLISION_COUNTER } from "@emqnote/core/filename";
import type { OutboxItem } from "../draft.js";
import type { DeliveryOutcome } from "./deliverer.js";

/** First retry waits this long; each further one doubles it. */
export const FIRST_BACKOFF_MS = 2_000;

/** The ceiling. A note waiting out a week offline should still be tried every few minutes. */
export const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * The name this attempt writes under.
 *
 * Goes through `@emqnote/core`'s `collisionCandidate` rather than formatting a suffix
 * here, so the iPhone and the desktop cannot disagree about what the third copy of a name
 * is called. `conflicts.ts` on the desktop refuses to treat a bare ` (N)` as a OneDrive
 * conflict copy precisely because it is this contract's shape.
 */
export function deliveryName(item: OutboxItem): string {
  return collisionCandidate(item.filename, item.candidate);
}

export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(FIRST_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

export interface DeliveryStep {
  /** The item as it should be stored next, or null when it leaves the outbox for good. */
  item: OutboxItem | null;
  /** True when the note is now in the Inbox — under `name`, which may not be its original. */
  delivered: boolean;
  /** The name it went in under, when it did. */
  name: string | null;
  /**
   * Whether to go straight round again instead of waiting.
   *
   * Only a collision sets this: nothing failed, the item simply needs the next name, and
   * making the user wait out a backoff for a rename they cannot influence would be silly.
   */
  again: boolean;
}

function waiting(item: OutboxItem, reason: string, now: Date): DeliveryStep {
  const attempts = item.attempts + 1;
  return {
    item: {
      ...item,
      state: "queued",
      attempts,
      lastError: reason,
      nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)).toISOString(),
    },
    delivered: false,
    name: null,
    again: false,
  };
}

function blocked(item: OutboxItem, reason: string): DeliveryStep {
  return {
    item: { ...item, state: "blocked", lastError: reason, nextAttemptAt: null },
    delivered: false,
    name: null,
    again: false,
  };
}

/**
 * Folds one destination answer into the item's next state.
 *
 * A delivered item leaves the outbox entirely rather than lingering with a `delivered`
 * flag. The outbox then means exactly one thing — notes that are not in the Inbox yet —
 * and the note's bytes, which are the bulk of it, stop occupying `localStorage` the moment
 * they are safe somewhere else.
 */
export function applyOutcome(
  item: OutboxItem,
  outcome: DeliveryOutcome,
  now = new Date(),
): DeliveryStep {
  const name = deliveryName(item);

  switch (outcome.kind) {
    case "delivered":
    case "already-delivered":
      return { item: null, delivered: true, name, again: false };

    case "collision": {
      const candidate = item.candidate + 1;
      if (candidate >= MAX_COLLISION_COUNTER) {
        // A thousand notes in one minute sharing one title is not a situation to invent a
        // recovery for; it is one to report. The desktop's `uniquePath` gives up at the
        // same count, for the same reason.
        return blocked(item, `no free name after ${String(MAX_COLLISION_COUNTER)} attempts`);
      }
      return {
        // Not a failed attempt: `attempts` drives the backoff, and nothing went wrong.
        item: { ...item, candidate, lastError: null, nextAttemptAt: null },
        delivered: false,
        name: null,
        again: true,
      };
    }

    case "needs-signin":
      // Deliberately terminal until the user acts. Popping a Microsoft sign-in out of a
      // background retry would interrupt whatever they were doing, from a queue they had
      // forgotten about.
      return blocked(item, "needs-signin");

    case "retry":
      return waiting(item, outcome.reason, now);

    case "failed":
      return blocked(item, outcome.reason);
  }
}

/** Whether a drain should pick this item up at `now`. */
export function isDue(item: OutboxItem, now = new Date()): boolean {
  if (item.state !== "queued") return false;
  if (item.nextAttemptAt === null) return true;
  const due = new Date(item.nextAttemptAt).getTime();
  return Number.isNaN(due) || due <= now.getTime();
}

/** The next item to attempt, oldest first, or null when there is nothing to do yet. */
export function nextDue(items: readonly OutboxItem[], now = new Date()): OutboxItem | null {
  return items.find((item) => isDue(item, now)) ?? null;
}

/** Puts `next` back in place of `id`, or removes it when the item is done. */
export function replaceItem(
  items: readonly OutboxItem[],
  id: string,
  next: OutboxItem | null,
): OutboxItem[] {
  const result: OutboxItem[] = [];
  for (const item of items) {
    if (item.id !== id) result.push(item);
    else if (next !== null) result.push(next);
  }
  return result;
}

/** Clears a block so the next drain tries again — what the Retry button and sign-in do. */
export function unblock(item: OutboxItem): OutboxItem {
  return { ...item, state: "queued", attempts: 0, lastError: null, nextAttemptAt: null };
}
