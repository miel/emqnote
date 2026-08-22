/**
 * Emptying the outbox, one note at a time.
 *
 * Serial on purpose. Two uploads in flight to the same folder can both be told a name is
 * free and both take it, and the second one to arrive is the one that would have to be
 * renamed — by which point the first has already reported success. One at a time removes
 * the whole class of problem, and there is never a queue long enough for the throughput to
 * matter: this is a note-taking app used by one person.
 *
 * Storage is written after *every* item rather than once at the end, because the process
 * being killed mid-drain is the normal way an iPhone app stops.
 */

import {
  loadOutbox,
  storeLastDelivered,
  storeOutbox,
  type DraftStorage,
  type OutboxItem,
} from "../draft.js";
import type { Deliverer } from "./deliverer.js";
import { applyOutcome, deliveryName, nextDue, replaceItem } from "./outbox.js";

export interface DrainReport {
  /** The names notes actually went in under — a collision means this is not the original. */
  delivered: string[];
  /** Still queued, waiting for a retry or the network. */
  waiting: number;
  /** Held back because nobody is signed in. Counted apart from `failed`: the repair differs. */
  needsSignIn: number;
  /** Held back by something the user has to look at. */
  failed: number;
}

/**
 * A ceiling on work per drain.
 *
 * Not a queue limit — nothing is dropped, the next drain picks up where this one stopped.
 * It is here so that a destination answering `collision` forever cannot spin this loop
 * indefinitely inside one call, which on a phone means inside one foreground moment.
 */
const MAX_STEPS = 200;

function summarise(items: readonly OutboxItem[], delivered: string[]): DrainReport {
  const blocked = items.filter((item) => item.state === "blocked");
  const needsSignIn = blocked.filter((item) => item.lastError === "needs-signin");
  return {
    delivered,
    waiting: items.length - blocked.length,
    needsSignIn: needsSignIn.length,
    failed: blocked.length - needsSignIn.length,
  };
}

export async function drainOutbox(
  storage: DraftStorage,
  deliverer: Deliverer,
  clock: () => Date = () => new Date(),
): Promise<DrainReport> {
  let items = loadOutbox(storage);
  const delivered: string[] = [];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const item = nextDue(items, clock());
    if (item === null) break;

    const name = deliveryName(item);
    const outcome = await deliverer.deliver(name, item.bytes);
    const next = applyOutcome(item, outcome, clock());

    items = replaceItem(items, item.id, next.item);
    storeOutbox(storage, items);

    if (next.delivered && next.name !== null) {
      delivered.push(next.name);
      storeLastDelivered(storage, {
        filename: next.name,
        deliveredAt: clock().toISOString(),
      });
    }
  }

  return summarise(items, delivered);
}
