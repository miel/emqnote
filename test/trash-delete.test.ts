import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearReadOnly, findRemovalCulprit, removeFromTrash } from "../src/main/trash-delete.js";

/**
 * Permanent deletion, and what it says when it cannot.
 *
 * This module exists because the first fix for "deleting a folder from the trash does not
 * work" (B57, chokidar's directory handles) shipped and the report came back unchanged. So
 * what is tested here is not only that things go, but that a refusal arrives as an *answer*
 * naming a code and an entry — that being the difference between another guess and a
 * diagnosis.
 *
 * The cases that simulate a refusal take a directory's write bit away, which is the
 * portable stand-in for a Windows handle held on a file inside a folder. They are skipped
 * on Windows, where `chmod` means something else entirely, and as root, where permissions
 * are not enforced at all.
 */

const enforced =
  process.platform !== "win32" &&
  !(typeof process.getuid === "function" && process.getuid() === 0);

let vault: string;
let trash: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-trash-"));
  trash = join(vault, "_trash");
  mkdirSync(trash, { recursive: true });
});

/**
 * Puts the write bit back on every directory, so the temp tree can be removed.
 *
 * `clearReadOnly` deliberately will not do this off Windows — see its own comment — so a
 * test that takes a directory's write permission away to simulate a lock has to hand it
 * back itself.
 */
function restore(target: string): void {
  let stats;
  try {
    stats = lstatSync(target);
  } catch {
    return;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) return;

  try {
    chmodSync(target, 0o700);
  } catch {
    return;
  }
  for (const entry of readdirSync(target)) restore(join(target, entry));
}

afterEach(() => {
  restore(vault);
  rmSync(vault, { recursive: true, force: true });
});

describe("removing something from the trash", () => {
  it("removes a file and says so", () => {
    const file = join(trash, "los.md");
    writeFileSync(file, "weg");

    expect(removeFromTrash(vault, file)).toEqual({ removed: true });
    expect(existsSync(file)).toBe(false);
  });

  it("removes a folder with everything under it", () => {
    mkdirSync(join(trash, "Alpha", "Diep"), { recursive: true });
    writeFileSync(join(trash, "Alpha", "Diep", "notitie.md"), "tekst");

    expect(removeFromTrash(vault, join(trash, "Alpha"))).toEqual({ removed: true });
    expect(existsSync(join(trash, "Alpha"))).toBe(false);
  });

  it("clears the read-only attribute rather than retrying against it", () => {
    // The Windows case this exists for, in the form a POSIX box can express: `rmSync`
    // retries EPERM, and retrying is no use against an attribute — it is still read-only a
    // second later. On Windows `chmod` *is* that attribute, so this is the same code path.
    const file = join(trash, "alleen-lezen.md");
    writeFileSync(file, "tekst");
    chmodSync(file, 0o400);

    expect(removeFromTrash(vault, file)).toEqual({ removed: true });
    expect(existsSync(file)).toBe(false);
  });

  it("names the entry that refused, not the folder that was asked for", () => {
    if (!enforced) return;

    mkdirSync(join(trash, "Vast", "Binnenin"), { recursive: true });
    writeFileSync(join(trash, "Vast", "Binnenin", "vast.md"), "vast");
    // A directory with no write permission: its children cannot be unlinked, which is the
    // portable stand-in for a Windows handle held on a file inside a folder.
    chmodSync(join(trash, "Vast", "Binnenin"), 0o500);

    const outcome = removeFromTrash(vault, join(trash, "Vast"));

    expect(outcome.removed).toBe(false);
    if (outcome.removed) return;
    // The whole point: `_trash/Vast/Binnenin/vast.md`, not `_trash/Vast`.
    expect(outcome.failure.path).toBe("_trash/Vast/Binnenin/vast.md");
    expect(outcome.failure.code).toBe("EACCES");
    expect(outcome.failure.message).not.toBe("");
  });

  it("leaves what it could not remove where it was", () => {
    if (!enforced) return;

    mkdirSync(join(trash, "Vast", "Binnenin"), { recursive: true });
    writeFileSync(join(trash, "Vast", "Binnenin", "vast.md"), "vast");
    chmodSync(join(trash, "Vast", "Binnenin"), 0o500);

    removeFromTrash(vault, join(trash, "Vast"));

    expect(existsSync(join(trash, "Vast", "Binnenin", "vast.md"))).toBe(true);
  });

  it("answers removed for a path that is already gone", () => {
    // `force: true` and the caller's own `existsSync` both allow it; a delete that finds
    // nothing to delete has done what was asked.
    expect(removeFromTrash(vault, join(trash, "nooit-bestaan.md"))).toEqual({ removed: true });
  });
});

describe("clearing the read-only attribute", () => {
  it("clears it on a file, at any depth", () => {
    mkdirSync(join(trash, "Diep"), { recursive: true });
    const file = join(trash, "Diep", "alleen-lezen.md");
    writeFileSync(file, "tekst");
    chmodSync(file, 0o400);

    clearReadOnly(join(trash, "Diep"));

    expect(lstatSync(file).mode & 0o200).not.toBe(0);
  });

  it("leaves a directory's own mode alone off Windows", () => {
    if (!enforced) return;

    // Deliberate: on POSIX a directory's mode is a real permission this app has no
    // business rewriting on its way past, and it is not what blocks a delete there.
    mkdirSync(join(trash, "Map"), { recursive: true });
    chmodSync(join(trash, "Map"), 0o500);

    clearReadOnly(join(trash, "Map"));

    expect(lstatSync(join(trash, "Map")).mode & 0o200).toBe(0);
  });
});

describe("finding the culprit", () => {
  it("answers null when everything goes", () => {
    mkdirSync(join(trash, "Leeg"), { recursive: true });
    writeFileSync(join(trash, "Leeg", "een.md"), "een");

    expect(findRemovalCulprit(vault, join(trash, "Leeg"))).toBeNull();
    // It removes as it walks — that is how it finds out — so the tree really is gone.
    expect(existsSync(join(trash, "Leeg"))).toBe(false);
  });

  it("answers null for a path that does not exist", () => {
    expect(findRemovalCulprit(vault, join(trash, "weg.md"))).toBeNull();
  });
});
