import { describe, expect, it } from "vitest";
import {
  LAST_DELIVERED_KEY,
  LEGACY_OUTBOX_KEY,
  OUTBOX_KEY,
  enqueue,
  loadLastDelivered,
  loadOutbox,
  queuedItem,
  type DraftStorage,
} from "../src/draft.js";
import type { Deliverer, DeliveryOutcome } from "../src/delivery/deliverer.js";
import { drainOutbox } from "../src/delivery/drain.js";

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

/** Answers whatever the test queued, and records every name it was asked to write. */
function fakeDeliverer(outcomes: DeliveryOutcome[]): Deliverer & { names: string[] } {
  const names: string[] = [];
  return {
    id: "graph",
    names,
    deliver: (filename) => {
      names.push(filename);
      return Promise.resolve(outcomes.shift() ?? { kind: "failed", reason: "unexpected call" });
    },
  };
}

function note(id: string, filename: string, bytes = `bytes for ${id}`) {
  return queuedItem({ id, filename, bytes, queuedAt: "2026-08-22T11:59:00.000Z" });
}

const CLOCK = () => new Date("2026-08-22T12:00:00.000Z");

describe("draining the outbox", () => {
  it("delivers everything queued and leaves the outbox empty", async () => {
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 One.md"));
    enqueue(storage, note("two", "2026-08-22 1401 Two.md"));

    const deliverer = fakeDeliverer([{ kind: "delivered" }, { kind: "delivered" }]);
    const report = await drainOutbox(storage, deliverer, CLOCK);

    expect(deliverer.names).toEqual(["2026-08-22 1400 One.md", "2026-08-22 1401 Two.md"]);
    expect(report).toEqual({
      delivered: ["2026-08-22 1400 One.md", "2026-08-22 1401 Two.md"],
      waiting: 0,
      needsSignIn: 0,
      failed: 0,
    });
    expect(loadOutbox(storage)).toEqual([]);
  });

  it("renames past a collision within one drain, without a second Save", async () => {
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 Call Els.md"));

    const deliverer = fakeDeliverer([{ kind: "collision" }, { kind: "delivered" }]);
    const report = await drainOutbox(storage, deliverer, CLOCK);

    expect(deliverer.names).toEqual([
      "2026-08-22 1400 Call Els.md",
      "2026-08-22 1400 Call Els (2).md",
    ]);
    expect(report.delivered).toEqual(["2026-08-22 1400 Call Els (2).md"]);
    expect(loadOutbox(storage)).toEqual([]);
  });

  it("delivers an interrupted note exactly once", async () => {
    // The first attempt landed but never reported back, so the retry finds its own bytes
    // under its own name. Criterion 7: one note, not two, and nothing overwritten.
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 One.md"));

    const deliverer = fakeDeliverer([{ kind: "already-delivered" }]);
    const report = await drainOutbox(storage, deliverer, CLOCK);

    expect(report.delivered).toEqual(["2026-08-22 1400 One.md"]);
    expect(deliverer.names).toHaveLength(1);
    expect(loadOutbox(storage)).toEqual([]);
  });

  it("holds a note back when nobody is signed in, and says so", async () => {
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 One.md"));

    const report = await drainOutbox(storage, fakeDeliverer([{ kind: "needs-signin" }]), CLOCK);

    expect(report).toEqual({ delivered: [], waiting: 0, needsSignIn: 1, failed: 0 });
    expect(loadOutbox(storage)[0]?.bytes).toBe("bytes for one");
  });

  it("counts a missing sign-in apart from a real failure", async () => {
    // The repair differs, so the UI has to be able to tell them apart: one is a Sign in
    // button, the other is a reason and a Retry. Reporting a single "blocked" count made a
    // mixed queue show whichever message happened to be checked first.
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 One.md"));
    enqueue(storage, note("two", "2026-08-22 1401 Two.md"));
    enqueue(storage, note("three", "2026-08-22 1402 Three.md"));

    const report = await drainOutbox(
      storage,
      fakeDeliverer([
        { kind: "needs-signin" },
        { kind: "failed", reason: "the 00 Inbox folder could not be found" },
        { kind: "retry", reason: "offline" },
      ]),
      CLOCK,
    );

    expect(report).toEqual({ delivered: [], waiting: 1, needsSignIn: 1, failed: 1 });
  });

  it("stops at an item that is waiting, and carries on with the next one", async () => {
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 One.md"));
    enqueue(storage, note("two", "2026-08-22 1401 Two.md"));

    const deliverer = fakeDeliverer([
      { kind: "retry", reason: "offline" },
      { kind: "delivered" },
    ]);
    const report = await drainOutbox(storage, deliverer, CLOCK);

    expect(report.delivered).toEqual(["2026-08-22 1401 Two.md"]);
    expect(report.waiting).toBe(1);
    const [remaining] = loadOutbox(storage);
    expect(remaining?.id).toBe("one");
    expect(remaining?.nextAttemptAt).toBe("2026-08-22T12:00:02.000Z");
  });

  it("persists after every item, so being killed mid-drain loses nothing", async () => {
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 One.md"));
    enqueue(storage, note("two", "2026-08-22 1401 Two.md"));

    let seenAfterFirst: number | null = null;
    const deliverer: Deliverer = {
      id: "graph",
      deliver: (filename) => {
        if (filename.includes("Two")) seenAfterFirst = loadOutbox(storage).length;
        return Promise.resolve({ kind: "delivered" });
      },
    };

    await drainOutbox(storage, deliverer, CLOCK);
    expect(seenAfterFirst).toBe(1);
  });

  it("records the last delivery, under the name it really used", async () => {
    const storage = memoryStorage();
    enqueue(storage, note("one", "2026-08-22 1400 Call Els.md"));

    await drainOutbox(storage, fakeDeliverer([{ kind: "collision" }, { kind: "delivered" }]), CLOCK);

    expect(loadLastDelivered(storage)).toEqual({
      filename: "2026-08-22 1400 Call Els (2).md",
      deliveredAt: "2026-08-22T12:00:00.000Z",
    });
    expect(storage.getItem(LAST_DELIVERED_KEY)).not.toBeNull();
  });

  it("does nothing at all when there is nothing due", async () => {
    const storage = memoryStorage();
    const deliverer = fakeDeliverer([]);
    expect(await drainOutbox(storage, deliverer, CLOCK)).toEqual({
      delivered: [],
      waiting: 0,
      needsSignIn: 0,
      failed: 0,
    });
    expect(deliverer.names).toEqual([]);
  });
});

describe("the outbox schema upgrade", () => {
  it("delivers a note queued by the version that had no delivery loop", async () => {
    // `.v1` items were written by a build that never drained them. Losing one to a schema
    // change would lose a note the user was told was saved.
    const storage = memoryStorage();
    storage.setItem(
      LEGACY_OUTBOX_KEY,
      JSON.stringify([
        {
          id: "old",
          filename: "2026-08-21 0930 Older note.md",
          bytes: "---\ntitle: Older note\n---\n",
          queuedAt: "2026-08-21T07:30:00.000Z",
        },
      ]),
    );

    expect(loadOutbox(storage)[0]).toEqual({
      id: "old",
      filename: "2026-08-21 0930 Older note.md",
      bytes: "---\ntitle: Older note\n---\n",
      queuedAt: "2026-08-21T07:30:00.000Z",
      state: "queued",
      candidate: 1,
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
    });

    const report = await drainOutbox(storage, fakeDeliverer([{ kind: "delivered" }]), CLOCK);
    expect(report.delivered).toEqual(["2026-08-21 0930 Older note.md"]);
  });

  it("retires the old key only once the new one holds the notes", async () => {
    const storage = memoryStorage();
    storage.setItem(
      LEGACY_OUTBOX_KEY,
      JSON.stringify([
        { id: "old", filename: "One.md", bytes: "x", queuedAt: "2026-08-21T07:30:00.000Z" },
      ]),
    );
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();

    await drainOutbox(storage, fakeDeliverer([{ kind: "needs-signin" }]), CLOCK);

    expect(storage.getItem(LEGACY_OUTBOX_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(OUTBOX_KEY)!)).toHaveLength(1);
  });

  it("ignores a corrupt store rather than failing launch", () => {
    const storage = memoryStorage();
    storage.setItem(OUTBOX_KEY, "not json");
    expect(loadOutbox(storage)).toEqual([]);
    storage.setItem(OUTBOX_KEY, JSON.stringify([{ id: "no bytes" }, null, 7]));
    expect(loadOutbox(storage)).toEqual([]);
  });
});
