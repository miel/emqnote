import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uniquePath } from "../src/main/filename.js";
import { isNoteFile, noteExtension, noteStem } from "../src/main/note-files.js";
import { findConflictCopies } from "../src/main/conflicts.js";
import { openNote, readNotesIn, renameNote } from "../src/main/vault-io.js";

/**
 * `.markdown` is read like `.md`, and a file keeps the extension it arrived with.
 *
 * The app still writes `.md` for everything it creates — that is `noteFileName`, which is
 * deliberately untouched. What changed is the reading side: a vault is a folder on a
 * OneDrive, files arrive in it that this app did not write, and a note the app refuses to
 * list is invisible in the one window onto that folder.
 */

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-note-files-"));
  mkdirSync(join(vault, "00 Inbox"), { recursive: true });
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

describe("isNoteFile / noteStem / noteExtension", () => {
  it("accepts both extensions and nothing else", () => {
    expect(isNoteFile("a.md")).toBe(true);
    expect(isNoteFile("a.markdown")).toBe(true);
    expect(isNoteFile("a.txt")).toBe(false);
    expect(isNoteFile("a.pdf")).toBe(false);
    expect(isNoteFile("README")).toBe(false);
  });

  it("matches case-insensitively but reports the extension as it is written", () => {
    expect(isNoteFile("Aantekening.MD")).toBe(true);
    expect(noteExtension("Aantekening.MD")).toBe(".MD");
    expect(noteStem("Aantekening.MD")).toBe("Aantekening");
  });

  it("prefers the longer extension, so .markdown never reads as a stem ending in .mark", () => {
    expect(noteStem("verslag.markdown")).toBe("verslag");
    expect(noteExtension("verslag.markdown")).toBe(".markdown");
  });

  it("leaves a non-note name whole", () => {
    expect(noteStem("offerte.pdf")).toBe("offerte.pdf");
    expect(noteExtension("offerte.pdf")).toBe("");
  });
});

describe("a .markdown note in the vault", () => {
  it("is listed like any other note", () => {
    writeFileSync(join(vault, "00 Inbox", "verslag.markdown"), "Zonder frontmatter.\n", "utf8");
    const notes = readNotesIn(vault, "00 Inbox");
    expect(notes.map((note) => note.fileName)).toEqual(["verslag.markdown"]);
  });

  it("keeps its extension through a rename", () => {
    const file = join(vault, "00 Inbox", "verslag.markdown");
    writeFileSync(file, "---\ntitle: Verslag\ntype: quick\n---\n\nTekst.\n", "utf8");

    const renamed = renameNote(vault, "00 Inbox/verslag.markdown", "Nieuw verslag");
    expect(renamed.endsWith(".markdown")).toBe(true);
    expect(renamed.endsWith(".md")).toBe(false);
  });
});

describe("uniquePath", () => {
  it("keeps the extension it was handed when it has to disambiguate", () => {
    const directory = join(vault, "00 Inbox");
    writeFileSync(join(directory, "verslag.markdown"), "x", "utf8");

    expect(uniquePath(directory, "verslag.markdown").endsWith("verslag (2).markdown")).toBe(true);
  });
});

describe("findConflictCopies across extensions", () => {
  it("pairs a .markdown conflict copy with its .markdown original", () => {
    expect(
      findConflictCopies(["notitie.markdown", "notitie-LAPTOP-4KJ8Q1.markdown"]),
    ).toEqual([{ original: "notitie.markdown", conflict: "notitie-LAPTOP-4KJ8Q1.markdown" }]);
  });

  it("never pairs one extension's copy with the other's original", () => {
    expect(findConflictCopies(["notitie.md", "notitie-LAPTOP-4KJ8Q1.markdown"])).toEqual([]);
  });
});

describe("a note this app did not write", () => {
  /**
   * The report: "MD files that get copied into the vault from the file system can be
   * read, they show up with their title in the note list, but the title field in the
   * note editor is not filled in." The list used `summarise`, which falls back to the
   * filename; `openNote` read `frontmatter.title` raw and returned an empty string.
   */
  it("opens with the filename as its title when the frontmatter has none", () => {
    writeFileSync(join(vault, "00 Inbox", "Losse aantekening.md"), "Zomaar tekst.\n", "utf8");

    const opened = openNote(vault, "00 Inbox/Losse aantekening.md");
    expect(opened?.title).toBe("Losse aantekening");
  });

  it("agrees with what the note list shows for the same file", () => {
    writeFileSync(join(vault, "00 Inbox", "Losse aantekening.md"), "Zomaar tekst.\n", "utf8");

    const listed = readNotesIn(vault, "00 Inbox")[0];
    const opened = openNote(vault, "00 Inbox/Losse aantekening.md");
    expect(opened?.title).toBe(listed?.title);
  });

  it("falls back to the file's own mtime rather than an empty date", () => {
    writeFileSync(join(vault, "00 Inbox", "Losse aantekening.md"), "Zomaar tekst.\n", "utf8");

    const opened = openNote(vault, "00 Inbox/Losse aantekening.md");
    expect(opened?.created).not.toBe("");
    expect(Number.isNaN(new Date(opened!.created).getTime())).toBe(false);
  });

  it("still does not touch the file — B10 holds for a fallback that is only displayed", () => {
    const file = join(vault, "00 Inbox", "Losse aantekening.md");
    writeFileSync(file, "Zomaar tekst.\n", "utf8");
    const before = readNotesIn(vault, "00 Inbox")[0]!.modified;

    openNote(vault, "00 Inbox/Losse aantekening.md");

    expect(readNotesIn(vault, "00 Inbox")[0]!.modified).toBe(before);
  });
});
