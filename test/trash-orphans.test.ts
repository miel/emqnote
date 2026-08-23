import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachmentsOrphanedByTrash } from "../src/main/unlinked-attachments.js";

/**
 * The attachments emptying the trash would leave behind unreferenced.
 *
 * The consequence the Empty-trash question could not show, because the files it names are
 * not in the trash at all. A trashed note goes on counting as a reference for exactly as
 * long as it can be restored — `findUnlinkedAttachments` is deliberately built that way,
 * so a picture only a trashed note embeds is *not* unlinked today. It becomes unlinked the
 * moment the trash is emptied, and turns up in §6.5's Unlinked attachments pane.
 *
 * Exact rather than approximate: an attachment a live note also names stays linked and is
 * not counted. A real temp directory rather than a mocked filesystem, like
 * `trash-contents.test.ts` beside it — what is being tested is two recursive walks over
 * real `Dirent`s and a match between them.
 */

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-orphans-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

function put(relative: string, contents = "x"): void {
  const full = join(vault, relative);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

describe("attachmentsOrphanedByTrash", () => {
  it("answers nothing when the trash points at nothing", async () => {
    put("_attachments/foto.png");
    put("00 Inbox/levend.md", "Een notitie met ![[foto.png]] erin.\n");
    put("_trash/dood.md", "Niets bijzonders.\n");

    expect(await attachmentsOrphanedByTrash(vault)).toEqual([]);
  });

  it("names a picture only a trashed note still refers to", async () => {
    put("_attachments/foto.png");
    put("_trash/dood.md", "Een notitie met ![[foto.png]] erin.\n");

    expect(await attachmentsOrphanedByTrash(vault)).toEqual(["_attachments/foto.png"]);
  });

  it("leaves out one a live note also names", async () => {
    // The subtraction, and the reason this is not simply "how many files do the trashed
    // notes name". A picture two notes share does not become unlinked because one of them
    // goes.
    put("_attachments/gedeeld.png");
    put("_trash/dood.md", "![[gedeeld.png]]\n");
    put("00 Inbox/levend.md", "![[gedeeld.png]]\n");

    expect(await attachmentsOrphanedByTrash(vault)).toEqual([]);
  });

  it("matches the path form as well as the bare name", async () => {
    // Both spellings are real: this app's own insertion writes the bare name, Copy link on
    // a file row writes the path, and a vault written elsewhere is full of the path form.
    put("_attachments/2026/07/offerte.pdf");
    put("_trash/dood.md", "[[_attachments/2026/07/offerte.pdf]]\n");

    expect(await attachmentsOrphanedByTrash(vault)).toEqual([
      "_attachments/2026/07/offerte.pdf",
    ]);
  });

  it("takes the live references from the index when it is given them", async () => {
    // What the handler actually does: `note_links` already holds every target of every
    // note outside the trash, so the vault is not read a second time. Only the trash is.
    put("_attachments/foto.png");
    put("_attachments/los.png");
    put("_trash/dood.md", "![[foto.png]] en ![[los.png]]\n");

    expect(await attachmentsOrphanedByTrash(vault, ["foto.png"])).toEqual([
      "_attachments/los.png",
    ]);
  });

  it("does not count a file nothing ever pointed at, which is already unlinked", async () => {
    // That one is the Unlinked attachments pane's business today and emptying the trash
    // changes nothing about it. Counting it here would attribute a state to an action that
    // did not cause it.
    put("_attachments/vergeten.png");
    put("_trash/dood.md", "Niets erin.\n");

    expect(await attachmentsOrphanedByTrash(vault)).toEqual([]);
  });
});
