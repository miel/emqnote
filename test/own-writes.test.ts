import { afterEach, describe, expect, it } from "vitest";
import { rememberOwnWrite, wasOwnWrite } from "../src/main/own-writes.js";

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
