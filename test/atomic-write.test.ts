import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AtomicWriteError,
  setRecoveryDirectory,
  writeAtomicAsync,
  writeAtomicSync,
} from "../src/main/atomic-write.js";

/**
 * The write path, and what it does when the vault will not take a note.
 *
 * Every rule here is one the incident of 31 August 2026 showed was missing: OneDrive held
 * a note open, `rename()` came back `EPERM`, and the text the user had typed was never
 * written anywhere at all. `capture-writer.test.ts` pins the *queue* half of that (one
 * failure must not disable every later write); this file pins the half about the bytes.
 */

let root: string;
let vault: string;
let recovery: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "emqnote-atomic-"));
  vault = join(root, "vault");
  recovery = join(root, "recovered");
  mkdirSync(vault, { recursive: true });
  setRecoveryDirectory(recovery);
});

afterEach(() => {
  setRecoveryDirectory(null);
  rmSync(root, { recursive: true, force: true });
});

/**
 * A destination that cannot be renamed onto, on any of the three platforms: a directory
 * with something in it. Deliberately not a permissions trick — `chmod` on a directory
 * means nothing on Windows, and a test that only fails on two platforms out of three is
 * exactly what `CLAUDE.md` says this suite keeps relearning.
 */
function immovableTarget(): string {
  const target = join(vault, "occupied.md");
  mkdirSync(target, { recursive: true });
  mkdirSync(join(target, "child"), { recursive: true });
  return target;
}

function temporariesIn(directory: string): string[] {
  return readdirSync(directory).filter((name) => name.endsWith(".tmp"));
}

describe("writing a note that lands", () => {
  it("writes the contents and leaves no temporary behind", () => {
    const file = join(vault, "note.md");
    writeAtomicSync(file, "hello\n");

    expect(readFileSync(file, "utf8")).toBe("hello\n");
    expect(temporariesIn(vault)).toEqual([]);
  });

  it("creates the folder on the way", async () => {
    const file = join(vault, "deep", "deeper", "note.md");
    await writeAtomicAsync(file, "hello\n");

    expect(readFileSync(file, "utf8")).toBe("hello\n");
  });

  /**
   * The temporary name used to be a flat `${file}.tmp`, and two writes of one note a
   * moment apart therefore shared it: the second renamed a file the first had already
   * consumed, which surfaced as `ENOENT … rename '…Eerste titel.md.tmp'` and an unhandled
   * rejection attributed to whichever test happened to be running by then. That is the
   * *lesser* consequence of the shared name; the greater one is in the next block.
   */
  it("does not let two writes of one note share a temporary", async () => {
    const file = join(vault, "note.md");
    await Promise.all([
      writeAtomicAsync(file, "one\n"),
      writeAtomicAsync(file, "two\n"),
      writeAtomicAsync(file, "three\n"),
    ]);

    expect(["one\n", "two\n", "three\n"]).toContain(readFileSync(file, "utf8"));
    expect(temporariesIn(vault)).toEqual([]);
  });
});

describe("writing a note that cannot land", () => {
  it("throws an AtomicWriteError carrying the OS code", () => {
    const target = immovableTarget();

    expect(() => writeAtomicSync(target, "hello\n")).toThrow(AtomicWriteError);
  });

  /**
   * The rule the whole module exists for. The text was in the editor the entire time and
   * the app had nowhere it was willing to put it — so it went nowhere.
   */
  it("preserves the text outside the vault", () => {
    const target = immovableTarget();

    let error: unknown;
    try {
      writeAtomicSync(target, "the words that must not be lost\n");
    } catch (thrown) {
      error = thrown;
    }

    const failure = error as AtomicWriteError;
    expect(failure.recoveryPath).not.toBeNull();
    expect(readFileSync(failure.recoveryPath!, "utf8")).toBe(
      "the words that must not be lost\n",
    );
    // Outside the vault, which is the thing refusing the write.
    expect(failure.recoveryPath!.startsWith(recovery)).toBe(true);
  });

  it("preserves the text on the asynchronous path too", async () => {
    const target = immovableTarget();

    await expect(writeAtomicAsync(target, "async words\n")).rejects.toThrow(
      AtomicWriteError,
    );
    const saved = readdirSync(recovery);
    expect(saved).toHaveLength(1);
    expect(readFileSync(join(recovery, saved[0]!), "utf8")).toBe("async words\n");
  });

  /**
   * A recovery copy is what makes it safe to clear the temporary. Without a recovery
   * directory the temporary is the *only* surviving copy of the text, and tidying it away
   * would be the same mistake in a smaller coat.
   */
  it("keeps the temporary when there is nowhere to recover to", () => {
    setRecoveryDirectory(null);
    const target = immovableTarget();

    expect(() => writeAtomicSync(target, "nowhere else to go\n")).toThrow();

    const left = temporariesIn(vault);
    expect(left).toHaveLength(1);
    expect(readFileSync(join(vault, left[0]!), "utf8")).toBe("nowhere else to go\n");
  });

  it("clears the temporary once the text is safe elsewhere", () => {
    const target = immovableTarget();

    expect(() => writeAtomicSync(target, "hello\n")).toThrow();

    expect(temporariesIn(vault)).toEqual([]);
    expect(existsSync(recovery)).toBe(true);
  });

  /**
   * One failed write must not stop the next one, at this level as well as at
   * `CaptureWriter`'s: nothing here is left in a state that a later call inherits.
   */
  it("leaves the module able to write the next note", () => {
    expect(() => writeAtomicSync(immovableTarget(), "hello\n")).toThrow();

    const file = join(vault, "next.md");
    writeAtomicSync(file, "still working\n");
    expect(readFileSync(file, "utf8")).toBe("still working\n");
  });
});
