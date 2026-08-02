import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOrphanedAttachments } from "../src/main/orphaned-attachments.js";

let vault: string;

function note(folder: string, name: string, body: string): void {
  const front = ["---", `title: ${name}`, "type: quick", "created: 2026-07-26T09:00:00+02:00", "---", ""].join(
    "\n",
  );
  mkdirSync(join(vault, folder), { recursive: true });
  writeFileSync(join(vault, folder, `${name}.md`), `${front}${body}\n`);
}

function attachment(relativePath: string, contents = "binary"): void {
  const full = join(vault, "_attachments", relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-orphans-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

describe("finding orphaned attachments", () => {
  it("finds an attachment nothing refers to", () => {
    attachment("2026/07/afbeelding-1.png");

    expect(findOrphanedAttachments(vault)).toEqual(["_attachments/2026/07/afbeelding-1.png"]);
  });

  it("does not flag an attachment an embed points at", () => {
    attachment("2026/07/afbeelding-1.png");
    note("00 Inbox", "Kickoff", "![[afbeelding-1.png]]");

    expect(findOrphanedAttachments(vault)).toEqual([]);
  });

  it("does not flag a non-image attachment a wikilink points at", () => {
    attachment("2026/07/offerte.pdf");
    note("00 Inbox", "Kickoff", "Zie [[offerte.pdf]] voor details.");

    expect(findOrphanedAttachments(vault)).toEqual([]);
  });

  it("matches by name regardless of the note's folder", () => {
    attachment("2026/07/afbeelding-1.png");
    note("10 Projects/Klant X", "Diep genest", "![[afbeelding-1.png]]");

    expect(findOrphanedAttachments(vault)).toEqual([]);
  });

  it("still counts a reference from a note in the trash", () => {
    attachment("2026/07/afbeelding-1.png");
    note("_trash", "Verwijderd", "![[afbeelding-1.png]]");

    expect(findOrphanedAttachments(vault)).toEqual([]);
  });

  it("finds only the attachments nothing refers to, among several", () => {
    attachment("2026/07/gebruikt.png");
    attachment("2026/07/ongebruikt.png");
    note("00 Inbox", "Kickoff", "![[gebruikt.png]]");

    expect(findOrphanedAttachments(vault)).toEqual(["_attachments/2026/07/ongebruikt.png"]);
  });

  it("returns an empty list for a vault with no attachments folder at all", () => {
    note("00 Inbox", "Kickoff", "Geen bijlagen hier.");

    expect(findOrphanedAttachments(vault)).toEqual([]);
  });

  it("returns an empty list when every attachment is referenced", () => {
    attachment("2026/07/een.png");
    attachment("2026/07/twee.png");
    note("00 Inbox", "Kickoff", "![[een.png]] en ![[twee.png]]");

    expect(findOrphanedAttachments(vault)).toEqual([]);
  });
});
