import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { trashContents } from "../src/main/vault-io.js";

/**
 * The Empty-trash confirmation counts what is actually going.
 *
 * It named `notes.length` — the rows the note list happened to be showing for `_trash`,
 * which come from one non-recursive `readdir` of `.md` files. So a folder dragged to the
 * trash with forty notes inside it counted as nothing, every folder counted as nothing,
 * and every attachment counted as nothing, in the sentence asking whether to destroy
 * them. This is the count that replaces it, and the cases below are the ones the old one
 * got wrong.
 *
 * A real temp directory rather than a mocked filesystem, like `vault-io.test.ts`: what is
 * being tested is a recursive walk of real `Dirent`s, and a mock of `readdirSync` would be
 * testing the mock.
 */

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-trash-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

function put(relative: string, contents = "x"): void {
  const full = join(vault, relative);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

describe("trashContents", () => {
  it("answers zero for a vault with no trash folder at all", () => {
    expect(trashContents(vault)).toEqual({ notes: 0, folders: 0, files: 0 });
  });

  it("counts notes sitting directly in the trash", () => {
    put("_trash/een.md");
    put("_trash/twee.md");
    expect(trashContents(vault)).toEqual({ notes: 2, folders: 0, files: 0 });
  });

  it("counts a trashed folder and everything inside it", () => {
    // The case the old count missed entirely: the note list's readdir does not descend,
    // so this whole folder read as nothing at all.
    put("_trash/Project/plan.md");
    put("_trash/Project/Diep/notulen.md");
    expect(trashContents(vault)).toEqual({ notes: 2, folders: 2, files: 0 });
  });

  it("counts attachments and anything else that is not a note", () => {
    put("_trash/foto.png");
    put("_trash/offerte.pdf");
    put("_trash/notitie.md");
    expect(trashContents(vault)).toEqual({ notes: 1, folders: 0, files: 2 });
  });

  it("counts names `folderContents` would skip, because the trash is not the vault tree", () => {
    // `isHidden` exists so a folder chooser does not offer `_attachments` or a dotfile.
    // Nothing here is being offered — it is being deleted, and a count that quietly left
    // things out would understate the button in exactly the way the old one did.
    put("_trash/_attachments/foto.png");
    put("_trash/.DS_Store");
    expect(trashContents(vault)).toEqual({ notes: 0, folders: 1, files: 2 });
  });

  it("looks only inside the trash", () => {
    put("00 Inbox/levend.md");
    put("_trash/dood.md");
    expect(trashContents(vault)).toEqual({ notes: 1, folders: 0, files: 0 });
  });

  it("stops descending rather than running away down a deep tree", () => {
    // The same depth cap `folderContents` carries. Twelve levels of folder, one note at
    // the bottom that is past the cap and one at the top that is not.
    let path = "_trash";
    for (let depth = 0; depth < 14; depth += 1) path = `${path}/d${depth}`;
    put(`${path}/diep.md`);
    put("_trash/ondiep.md");

    const counted = trashContents(vault);
    expect(counted.notes).toBe(1);
    expect(counted.folders).toBeLessThan(14);
  });
});
