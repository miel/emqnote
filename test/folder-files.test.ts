import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFilesIn, readNotesIn, summariseFile } from "../src/main/vault-io.js";

/**
 * The files in a folder that are not notes (B47).
 *
 * A vault imported from Obsidian keeps its pictures and PDFs in an ordinary folder beside
 * the notes — `99 - Attachments`, usually — and that folder was browsable and completely
 * empty: it appeared in the tree with a `0` badge, and clicking it said "No notes".
 */

let vault: string;

function write(relativePath: string, contents = "x"): void {
  const full = join(vault, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-files-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

describe("readFilesIn", () => {
  it("lists the pictures and PDFs an imported attachments folder is full of", () => {
    write("99 - Attachments/foto.png");
    write("99 - Attachments/offerte.pdf");
    write("99 - Attachments/contract.docx");

    expect(readFilesIn(vault, "99 - Attachments").map((file) => file.name)).toEqual([
      "contract.docx",
      "foto.png",
      "offerte.pdf",
    ]);
  });

  it("leaves the notes to readNotesIn, and takes everything else", () => {
    write("01 Projecten/Kickoff.md", "---\ntitle: Kickoff\ntype: quick\n---\n\nHoi\n");
    write("01 Projecten/Oud.markdown", "---\ntitle: Oud\ntype: quick\n---\n\nHoi\n");
    write("01 Projecten/schema.png");

    expect(readFilesIn(vault, "01 Projecten").map((file) => file.name)).toEqual(["schema.png"]);
    // Both halves of the pane, and nothing counted twice: `.markdown` is a note (B37).
    expect(readNotesIn(vault, "01 Projecten").map((note) => note.fileName).sort()).toEqual([
      "Kickoff.md",
      "Oud.markdown",
    ]);
  });

  it("gives a vault-relative path with forward slashes, the shape resolveAttachment takes", () => {
    write("99 - Attachments/2026/foto.png");

    const [file] = readFilesIn(vault, "99 - Attachments/2026");

    expect(file).toMatchObject({
      path: "99 - Attachments/2026/foto.png",
      name: "foto.png",
      extension: ".png",
      size: 1,
    });
    expect(file!.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("lowercases the extension, so .PNG previews like .png does", () => {
    write("Bijlagen/FOTO.PNG");
    expect(readFilesIn(vault, "Bijlagen")[0]!.extension).toBe(".png");
  });

  it("says nothing about a file with no extension at all", () => {
    write("Bijlagen/LICENSE");
    expect(readFilesIn(vault, "Bijlagen")[0]!.extension).toBe("");
  });

  it("skips dotfiles — .DS_Store is not a thing to offer someone", () => {
    write("Bijlagen/foto.png");
    write("Bijlagen/.DS_Store");

    expect(readFilesIn(vault, "Bijlagen").map((file) => file.name)).toEqual(["foto.png"]);
  });

  it("lists the vault root, which is a folder like any other", () => {
    write("losse-scan.pdf");
    expect(readFilesIn(vault, "").map((file) => file.name)).toEqual(["losse-scan.pdf"]);
  });

  it("counts no folders, only files", () => {
    write("Bijlagen/2026/foto.png");
    expect(readFilesIn(vault, "Bijlagen")).toEqual([]);
  });

  it("answers an empty list for a folder that is not there", () => {
    expect(readFilesIn(vault, "Weg")).toEqual([]);
  });
});

/**
 * The per-file half of `readFilesIn`, split out because the unlinked-attachment pane
 * draws the very same rows from a different question: `findUnlinkedAttachments` answers
 * with paths rather than a `readdir`, and the two lists must not describe one file two
 * different ways.
 */
describe("summariseFile", () => {
  it("describes one file exactly as readFilesIn describes it", () => {
    write("99 - Attachments/2026/foto.PNG", "twelve bytes");

    const direct = summariseFile(vault, join(vault, "99 - Attachments/2026/foto.PNG"));
    const [listed] = readFilesIn(vault, "99 - Attachments/2026");

    expect(direct).toEqual(listed);
    expect(direct).toMatchObject({
      path: "99 - Attachments/2026/foto.PNG",
      name: "foto.PNG",
      extension: ".png",
      size: 12,
    });
  });

  it("answers null for a file that has gone, rather than throwing", () => {
    // A real race on a synced vault: the scan names it, OneDrive removes it, the stat
    // arrives late. The caller drops the row.
    expect(summariseFile(vault, join(vault, "weg.png"))).toBeNull();
  });
});
