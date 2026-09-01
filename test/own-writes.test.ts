import { afterEach, describe, expect, it } from "vitest";
import {
  rememberOwnMove,
  rememberOwnWrite,
  renameOwnWrite,
  wasOwnArrival,
  wasOwnRemoval,
  wasOwnWrite,
} from "../src/main/own-writes.js";

/**
 * `own-writes.ts` is what lets the watcher tell its own echo of a debounced autosave
 * apart from a real external change, by content hash rather than a timer — see the
 * module's own comment for why a timer cannot be trusted against OneDrive's own
 * re-materialise schedule. Every test here writes to its own unique path, since the
 * module holds process-wide state with no reset hook (by design — it is meant to
 * accumulate across the app's whole lifetime).
 */

let counter = 0;
/** A path unique to this test, so tests never see each other's remembered hashes. */
function freshPath(): string {
  counter += 1;
  return `/vault/00 Inbox/own-writes-test-${counter}.md`;
}

describe("own-writes", () => {
  it("recognises identical contents as this app's own write", () => {
    const path = freshPath();
    rememberOwnWrite(path, "hello");
    expect(wasOwnWrite(path, "hello")).toBe(true);
  });

  it("rejects different contents at the same path", () => {
    const path = freshPath();
    rememberOwnWrite(path, "hello");
    expect(wasOwnWrite(path, "goodbye")).toBe(false);
  });

  it("returns false for a path that was never written", () => {
    expect(wasOwnWrite(freshPath(), "anything")).toBe(false);
  });

  it("replaces the remembered hash on a second write, rather than adding to it", () => {
    const path = freshPath();
    rememberOwnWrite(path, "first version");
    rememberOwnWrite(path, "second version");

    expect(wasOwnWrite(path, "first version")).toBe(false);
    expect(wasOwnWrite(path, "second version")).toBe(true);
  });

  it("checking does not consume the remembered hash", () => {
    const path = freshPath();
    rememberOwnWrite(path, "hello");

    expect(wasOwnWrite(path, "hello")).toBe(true);
    // Still true the second time — an `add` immediately followed by a `change` event
    // for the same logical write, which chokidar can produce on some platforms, must
    // not see the first check "use up" the answer.
    expect(wasOwnWrite(path, "hello")).toBe(true);
  });

  it("normalises a relative path against the same base to the same key", () => {
    rememberOwnWrite("./a/own-writes-relative.md", "hello");
    expect(wasOwnWrite("a/own-writes-relative.md", "hello")).toBe(true);
  });

  describe("on Windows", () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("matches two different casings of the same path", () => {
      Object.defineProperty(process, "platform", { value: "win32" });

      rememberOwnWrite("C:\\Vault\\Note.md", "hello");
      expect(wasOwnWrite("C:\\VAULT\\NOTE.md", "hello")).toBe(true);
    });

    it("does not fold case on other platforms", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });

      rememberOwnWrite("/vault/own-writes-case.md", "hello");
      expect(wasOwnWrite("/vault/OWN-WRITES-CASE.md", "hello")).toBe(false);
    });
  });

  describe("across a rename", () => {
    it("answers for the new path and no longer for the old one", () => {
      const from = freshPath();
      const to = freshPath();
      rememberOwnWrite(from, "hello");

      renameOwnWrite(from, to);

      expect(wasOwnWrite(to, "hello")).toBe(true);
      // Nothing is at the old path any more, so nothing there can be this app's write.
      expect(wasOwnWrite(from, "hello")).toBe(false);
    });

    it("does nothing when the old path was never written by this app", () => {
      const from = freshPath();
      const to = freshPath();
      rememberOwnWrite(to, "already here");

      renameOwnWrite(from, to);

      // An unrelated rename must not wipe what the destination already had — the file
      // that was there is gone, but only a rename this app actually knows about says so.
      expect(wasOwnWrite(to, "already here")).toBe(true);
    });

    it("replaces what the destination remembered when there is something to move", () => {
      const from = freshPath();
      const to = freshPath();
      rememberOwnWrite(from, "the survivor");
      rememberOwnWrite(to, "about to be overwritten");

      renameOwnWrite(from, to);

      expect(wasOwnWrite(to, "the survivor")).toBe(true);
      expect(wasOwnWrite(to, "about to be overwritten")).toBe(false);
    });

    it("folds case on Windows on both sides of the move", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });
      try {
        rememberOwnWrite("C:\\Vault\\Before.md", "hello");
        renameOwnWrite("C:\\VAULT\\BEFORE.md", "C:\\Vault\\After.md");

        expect(wasOwnWrite("C:\\vault\\after.md", "hello")).toBe(true);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });
  });

  /**
   * B95. The half a content hash cannot answer: a file this app *moved* leaves no bytes at
   * the path it came from, so `wasOwnWrite` has nothing to compare and the watcher called
   * every one of this app's own moves an external deletion.
   */
  describe("a move this app performed", () => {
    it("answers for the path it left and the path it arrived at", () => {
      const from = freshPath();
      const to = freshPath();
      rememberOwnMove(from, to);

      expect(wasOwnRemoval(from)).toBe(true);
      expect(wasOwnArrival(to)).toBe(true);
    });

    it("does not answer the two questions the other way round", () => {
      const from = freshPath();
      const to = freshPath();
      rememberOwnMove(from, to);

      // The destination was not vacated and the source was not arrived at. Asked in
      // reverse this would suppress a real deletion of the file just written.
      expect(wasOwnRemoval(to)).toBe(false);
      expect(wasOwnArrival(from)).toBe(false);
    });

    it("says nothing about a path this app never moved", () => {
      expect(wasOwnRemoval(freshPath())).toBe(false);
      expect(wasOwnArrival(freshPath())).toBe(false);
    });

    /** Non-consuming, for `wasOwnWrite`'s reason: chokidar can fire `add` then `change`
     *  for one logical arrival, and both have to get the same answer. */
    it("keeps answering, rather than being used up by the first asker", () => {
      const from = freshPath();
      const to = freshPath();
      rememberOwnMove(from, to);

      expect(wasOwnRemoval(from)).toBe(true);
      expect(wasOwnRemoval(from)).toBe(true);
      expect(wasOwnArrival(to)).toBe(true);
      expect(wasOwnArrival(to)).toBe(true);
    });

    it("is capped the way the hashes are, oldest first", () => {
      const first = freshPath();
      rememberOwnMove(first, freshPath());
      for (let i = 0; i < 64; i += 1) rememberOwnMove(freshPath(), freshPath());

      expect(wasOwnRemoval(first)).toBe(false);
    });

    it("lowercases the key on Windows, where two spellings are one file", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });
      try {
        rememberOwnMove("C:\\Vault\\Van.md", "C:\\Vault\\Naar.md");

        expect(wasOwnRemoval("C:\\VAULT\\VAN.md")).toBe(true);
        expect(wasOwnArrival("C:\\vault\\naar.md")).toBe(true);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });
  });

  it("evicts the oldest entry once the 64-entry cap is exceeded", () => {
    // The module holds one process-wide map with no reset hook, and earlier tests in
    // this file have already put a handful of entries in it. Flushing 64 fresh, unique
    // entries first guarantees every one of those is pushed out — inserting 64
    // never-before-seen keys can never leave an older key behind, whatever the map held
    // going in — so what follows is judged purely against paths this test controls.
    for (let i = 0; i < 64; i += 1) rememberOwnWrite(freshPath(), "flush");

    const paths = Array.from({ length: 65 }, () => freshPath());
    for (const path of paths) rememberOwnWrite(path, "content");

    // The very first of these 65 is the oldest — pushed out once the 65th arrived.
    expect(wasOwnWrite(paths[0]!, "content")).toBe(false);
    // Everything from the second write on is still within the cap and still remembered.
    expect(wasOwnWrite(paths[1]!, "content")).toBe(true);
    expect(wasOwnWrite(paths[64]!, "content")).toBe(true);
  });
});
