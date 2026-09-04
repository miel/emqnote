import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentsAt, trashContents } from "../src/main/vault-io.js";

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
    expect(trashContents(vault)).toEqual({ notes: 0, folders: 0, files: 0, openTasks: 0 });
  });

  it("counts notes sitting directly in the trash", () => {
    put("_trash/een.md");
    put("_trash/twee.md");
    expect(trashContents(vault)).toEqual({ notes: 2, folders: 0, files: 0, openTasks: 0 });
  });

  it("counts a trashed folder and everything inside it", () => {
    // The case the old count missed entirely: the note list's readdir does not descend,
    // so this whole folder read as nothing at all.
    put("_trash/Project/plan.md");
    put("_trash/Project/Diep/notulen.md");
    expect(trashContents(vault)).toEqual({ notes: 2, folders: 2, files: 0, openTasks: 0 });
  });

  it("counts attachments and anything else that is not a note", () => {
    put("_trash/foto.png");
    put("_trash/offerte.pdf");
    put("_trash/notitie.md");
    expect(trashContents(vault)).toEqual({ notes: 1, folders: 0, files: 2, openTasks: 0 });
  });

  it("counts names `folderContents` would skip, because the trash is not the vault tree", () => {
    // `isHidden` exists so a folder chooser does not offer `_attachments` or a dotfile.
    // Nothing here is being offered — it is being deleted, and a count that quietly left
    // things out would understate the button in exactly the way the old one did.
    put("_trash/_attachments/foto.png");
    put("_trash/.DS_Store");
    expect(trashContents(vault)).toEqual({ notes: 0, folders: 1, files: 2, openTasks: 0 });
  });

  it("looks only inside the trash", () => {
    put("00 Inbox/levend.md");
    put("_trash/dood.md");
    expect(trashContents(vault)).toEqual({ notes: 1, folders: 0, files: 0, openTasks: 0 });
  });

  it("counts the open tasks in the notes, and only the open ones", () => {
    // The number someone actually wants before emptying the trash: not how many notes
    // are going but whether anything still to be *done* is going with them. A finished
    // task is a record and leaves with its note, which is what deleting a note means.
    put("_trash/taken.md", "- [ ] bellen\n- [x] gedaan\n- [ ] mailen\n");
    put("_trash/map/meer.md", "- [ ] nog een\n");
    // Not a task item at all, and it must not become one by looking like a line of text
    // with a bullet in front of it.
    put("_trash/gewoon.md", "- gewoon een opsomming\n");

    const counted = trashContents(vault);
    expect(counted.notes).toBe(3);
    expect(counted.openTasks).toBe(3);
  });

  it("counts a note that will not parse as no tasks rather than as no trash", () => {
    // The count is a warning in a sentence, not a manifest. One unreadable note must not
    // take the numbers beside it down with it — in front of the one operation in this
    // app with no way back, an understated count is the failure that matters.
    put("_trash/stuk.md", "---\nnot: [valid\n");
    put("_trash/goed.md", "- [ ] bellen\n");

    const counted = trashContents(vault);
    expect(counted.notes).toBe(2);
    expect(counted.openTasks).toBe(1);
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

/**
 * The same walk asked about one thing rather than about the whole trash.
 *
 * "Delete permanently" is offered on a folder inside the trash as well as on the trash
 * itself, and that question named the folder and nothing else (§59) — the more
 * destructive of the two deletes, saying less than the reversible one beside it.
 */
describe("contentsAt", () => {
  it("counts one trashed folder rather than the whole trash", () => {
    put("_trash/02 Oud/a.md");
    put("_trash/02 Oud/Sub/b.md");
    put("_trash/02 Oud/Sub/foto.png");
    put("_trash/elders.md");

    expect(contentsAt(vault, "_trash/02 Oud")).toEqual({ notes: 2, folders: 1, files: 1 });
  });

  it("counts files and hidden names, exactly as the whole-trash walk does", () => {
    // The reason this is not `folderContents`: everything under a path in the trash is
    // going, so a count that skipped `_attachments` would understate the button.
    put("_trash/02 Oud/_attachments/offerte.pdf");
    put("_trash/02 Oud/.hidden/x.md");

    expect(contentsAt(vault, "_trash/02 Oud")).toEqual({ notes: 1, folders: 2, files: 1 });
  });

  it("answers zero for a path that is not there", () => {
    expect(contentsAt(vault, "_trash/gone")).toEqual({ notes: 0, folders: 0, files: 0 });
  });

  it("adds up to what trashContents says for the trash itself", () => {
    put("_trash/02 Oud/a.md");
    put("_trash/los.png");

    const whole = trashContents(vault);
    expect(contentsAt(vault, "_trash")).toEqual({
      notes: whole.notes,
      folders: whole.folders,
      files: whole.files,
    });
  });
});
