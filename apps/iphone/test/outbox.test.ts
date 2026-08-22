import { describe, expect, it } from "vitest";
import { queuedItem, type OutboxItem } from "../src/draft.js";
import type { DeliveryOutcome } from "../src/delivery/deliverer.js";
import {
  applyOutcome,
  backoffMs,
  deliveryName,
  isDue,
  MAX_BACKOFF_MS,
  nextDue,
  replaceItem,
  unblock,
} from "../src/delivery/outbox.js";

const NOW = new Date("2026-08-22T12:00:00.000Z");

function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    ...queuedItem({
      id: "one",
      filename: "2026-08-22 1400 Call Els.md",
      bytes: "---\ntitle: Call Els\n---\n",
      queuedAt: "2026-08-22T11:59:00.000Z",
    }),
    ...overrides,
  };
}

function step(outcome: DeliveryOutcome, overrides: Partial<OutboxItem> = {}) {
  return applyOutcome(item(overrides), outcome, NOW);
}

describe("the name an attempt writes under", () => {
  it("is the plain name first", () => {
    expect(deliveryName(item())).toBe("2026-08-22 1400 Call Els.md");
  });

  it("follows the product-wide (2), (3) contract afterwards", () => {
    expect(deliveryName(item({ candidate: 2 }))).toBe("2026-08-22 1400 Call Els (2).md");
    expect(deliveryName(item({ candidate: 3 }))).toBe("2026-08-22 1400 Call Els (3).md");
  });
});

describe("a delivered note", () => {
  it("leaves the outbox rather than lingering as a flag", () => {
    const result = step({ kind: "delivered" });
    expect(result).toEqual({
      item: null,
      delivered: true,
      name: "2026-08-22 1400 Call Els.md",
      again: false,
    });
  });

  it("reports the name it actually went in under after a rename", () => {
    // The UI has to be able to say "In OneDrive Inbox" about a file the user can find,
    // and after a collision that is not the name the note was queued as.
    expect(step({ kind: "delivered" }, { candidate: 2 }).name).toBe(
      "2026-08-22 1400 Call Els (2).md",
    );
  });
});

describe("an interrupted delivery that had in fact succeeded", () => {
  it("counts as delivered, so retrying cannot make a second note", () => {
    // 07-iphone.md §5 step 6, and acceptance criterion 7's "exactly once".
    const result = step({ kind: "already-delivered" });
    expect(result.delivered).toBe(true);
    expect(result.item).toBeNull();
  });
});

describe("a name taken by different bytes", () => {
  it("takes the next candidate and goes straight round again", () => {
    const result = step({ kind: "collision" });
    expect(result.item?.candidate).toBe(2);
    expect(result.again).toBe(true);
    expect(result.delivered).toBe(false);
  });

  it("does not count as a failed attempt", () => {
    // `attempts` exists to space out retries after something went wrong. Nothing went
    // wrong here, and making the user wait out a backoff for a rename they cannot
    // influence would be a delay with no purpose.
    const result = step({ kind: "collision" }, { attempts: 3 });
    expect(result.item?.attempts).toBe(3);
    expect(result.item?.nextAttemptAt).toBeNull();
    expect(result.item?.lastError).toBeNull();
  });

  it("gives up naming rather than looping when a thousand names are taken", () => {
    const result = step({ kind: "collision" }, { candidate: 999 });
    expect(result.item?.state).toBe("blocked");
    expect(result.again).toBe(false);
  });
});

describe("a missing sign-in", () => {
  it("blocks the item instead of retrying into a prompt nobody asked for", () => {
    const result = step({ kind: "needs-signin" });
    expect(result.item?.state).toBe("blocked");
    expect(result.item?.lastError).toBe("needs-signin");
    expect(result.item?.nextAttemptAt).toBeNull();
  });

  it("keeps the note, and unblocking restores it whole", () => {
    const blockedItem = step({ kind: "needs-signin" }).item!;
    expect(blockedItem.bytes).toBe(item().bytes);

    const retried = unblock(blockedItem);
    expect(retried.state).toBe("queued");
    expect(retried.lastError).toBeNull();
    expect(isDue(retried, NOW)).toBe(true);
  });
});

describe("something transient", () => {
  it("stays queued and waits out a backoff", () => {
    const result = step({ kind: "retry", reason: "offline" });
    expect(result.item?.state).toBe("queued");
    expect(result.item?.attempts).toBe(1);
    expect(result.item?.lastError).toBe("offline");
    expect(result.item?.nextAttemptAt).toBe("2026-08-22T12:00:02.000Z");
  });

  it("backs off further each time, up to a ceiling", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(8_000);
    expect(backoffMs(30)).toBe(MAX_BACKOFF_MS);
  });

  it("never gives up — being offline for a week is not a failure", () => {
    let current = item();
    for (let round = 0; round < 50; round += 1) {
      current = applyOutcome(current, { kind: "retry", reason: "offline" }, NOW).item!;
    }
    expect(current.state).toBe("queued");
    expect(current.bytes).toBe(item().bytes);
  });
});

describe("a refusal that retrying will not fix", () => {
  it("blocks with the reason, rather than hammering the destination", () => {
    const result = step({ kind: "failed", reason: "the 00 Inbox folder could not be found" });
    expect(result.item?.state).toBe("blocked");
    expect(result.item?.lastError).toBe("the 00 Inbox folder could not be found");
  });
});

describe("picking the next item to attempt", () => {
  it("skips one that is still waiting out its backoff", () => {
    const waiting = item({ id: "waiting", nextAttemptAt: "2026-08-22T12:00:30.000Z" });
    expect(isDue(waiting, NOW)).toBe(false);
    expect(isDue(waiting, new Date("2026-08-22T12:00:30.000Z"))).toBe(true);
  });

  it("skips a blocked one entirely", () => {
    expect(isDue(item({ state: "blocked" }), NOW)).toBe(false);
  });

  it("takes the oldest due item first", () => {
    const held = item({ id: "held", state: "blocked" });
    const later = item({ id: "later" });
    expect(nextDue([held, later], NOW)?.id).toBe("later");
    expect(nextDue([held], NOW)).toBeNull();
  });

  it("treats an unreadable nextAttemptAt as due rather than stranding the note", () => {
    expect(isDue(item({ nextAttemptAt: "not a date" }), NOW)).toBe(true);
  });
});

describe("putting an item back", () => {
  it("replaces it in place, preserving order", () => {
    const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
    const updated = replaceItem(items, "b", item({ id: "b", candidate: 4 }));
    expect(updated.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(updated[1]?.candidate).toBe(4);
  });

  it("removes it when it is done", () => {
    const items = [item({ id: "a" }), item({ id: "b" })];
    expect(replaceItem(items, "a", null).map((entry) => entry.id)).toEqual(["b"]);
  });
});
