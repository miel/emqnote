import { describe, expect, it } from "vitest";
import {
  canDropNote,
  canDropNotes,
  decodeDraggedNotes,
  encodeDraggedNotes,
  NOTE_DRAG_TYPE,
} from "../src/renderer/library/drag.js";

/**
 * The rules behind dragging a note onto a folder — `04-bouwplan.md`'s phase-3 "slepen in
 * de boom". The gesture itself needs a real pointer, but every decision it makes is this
 * one function, and the highlight and the drop both ask it, so a wrong answer here shows
 * up as a folder that lights up and then refuses.
 */
describe("canDropNote", () => {
  it("accepts a folder the note is not already in", () => {
    expect(canDropNote("00 Inbox/note.md", "10 Projects")).toBe(true);
    expect(canDropNote("00 Inbox/note.md", "10 Projects/Klant X/Project Alpha")).toBe(true);
  });

  it("accepts the vault root", () => {
    expect(canDropNote("00 Inbox/note.md", "")).toBe(true);
  });

  it("refuses the folder the note is already in", () => {
    expect(canDropNote("00 Inbox/note.md", "00 Inbox")).toBe(false);
    expect(canDropNote("note.md", "")).toBe(false);
  });

  // Dropping on the trash is Delete, and Delete only moves a file — `emptyTrash` and
  // `deleteFromTrash` are the only code that destroys anything (B24), and Restore is the
  // named way back out. `Library.tsx` routes this drop through the same `trashNote` the
  // Delete menu item calls rather than through `moveNoteTo`.
  it("accepts the trash itself as a destination", () => {
    expect(canDropNote("00 Inbox/note.md", "_trash")).toBe(true);
  });

  // Delete files flat, so a note three levels deep inside the trash would be somewhere
  // nothing in the app puts one and nothing looks.
  it("refuses a folder inside the trash", () => {
    expect(canDropNote("00 Inbox/note.md", "_trash/oud")).toBe(false);
  });

  // A folder that merely starts with the same letters is not inside it.
  it("does not mistake a similarly named folder for the trash", () => {
    expect(canDropNote("00 Inbox/note.md", "_trashy")).toBe(true);
  });

  // Restore is the named action, and it asks where: the trash remembers nothing about
  // where a note came from, so a drag onto one folder would be answering that question
  // by accident.
  it("refuses to drag a note back out of the trash", () => {
    expect(canDropNote("_trash/note.md", "00 Inbox")).toBe(false);
    expect(canDropNote("_trash/oud/note.md", "00 Inbox")).toBe(false);
    // Including onto the trash it is already in — which the "already there" rule would
    // catch for a note sitting directly in `_trash`, but not for one in a folder below.
    expect(canDropNote("_trash/oud/note.md", "_trash")).toBe(false);
  });

  // Not `text/plain`: that would make every row draggable into any text field on the
  // machine, dropping a vault-relative path into an email.
  it("uses a private drag type", () => {
    expect(NOTE_DRAG_TYPE).not.toBe("text/plain");
    expect(NOTE_DRAG_TYPE.startsWith("application/")).toBe(true);
  });
});

describe("carrying several notes in one drag (B94)", () => {
  it("encodes and decodes a set, one path per line", () => {
    const paths = ["00 Inbox/Een.md", "01 Projecten/Twee.md"];
    expect(decodeDraggedNotes(encodeDraggedNotes(paths))).toEqual(paths);
  });

  it("reads a bare path, which is what one note has always been", () => {
    // The wire format did not change for a single note: a reader that has not been
    // updated still sees a path where it expected one.
    expect(decodeDraggedNotes("00 Inbox/Een.md")).toEqual(["00 Inbox/Een.md"]);
  });

  it("reads an empty payload as no notes rather than as one nameless one", () => {
    expect(decodeDraggedNotes("")).toEqual([]);
  });

  it("accepts a drop the folder can take *something* from", () => {
    // Some, not every: a set dragged out of two folders onto one of them still has
    // something to do, and refusing the whole drag over one row with nothing to do reads
    // as the drag being broken. The drop itself filters per note.
    expect(canDropNotes(["00 Inbox/Een.md", "01 Projecten/Twee.md"], "01 Projecten")).toBe(true);
  });

  it("refuses one the folder can take nothing from", () => {
    expect(canDropNotes(["01 Projecten/Een.md", "01 Projecten/Twee.md"], "01 Projecten")).toBe(
      false,
    );
  });
});
