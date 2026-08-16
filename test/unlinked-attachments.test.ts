import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findUnlinkedAttachments } from "../src/main/unlinked-attachments.js";

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
  vault = mkdtempSync(join(tmpdir(), "emqnote-unlinked-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

describe("finding unlinked attachments", () => {
  it("finds an attachment nothing refers to", async () => {
    attachment("2026/07/afbeelding-1.png");

    expect(await findUnlinkedAttachments(vault)).toEqual(["_attachments/2026/07/afbeelding-1.png"]);
  });

  it("does not flag an attachment an embed points at", async () => {
    attachment("2026/07/afbeelding-1.png");
    note("00 Inbox", "Kickoff", "![[afbeelding-1.png]]");

    expect(await findUnlinkedAttachments(vault)).toEqual([]);
  });

  it("does not flag a non-image attachment a wikilink points at", async () => {
    attachment("2026/07/offerte.pdf");
    note("00 Inbox", "Kickoff", "Zie [[offerte.pdf]] voor details.");

    expect(await findUnlinkedAttachments(vault)).toEqual([]);
  });

  it("matches by name regardless of the note's folder", async () => {
    attachment("2026/07/afbeelding-1.png");
    note("10 Projects/Klant X", "Diep genest", "![[afbeelding-1.png]]");

    expect(await findUnlinkedAttachments(vault)).toEqual([]);
  });

  it("still counts a reference from a note in the trash", async () => {
    attachment("2026/07/afbeelding-1.png");
    note("_trash", "Verwijderd", "![[afbeelding-1.png]]");

    expect(await findUnlinkedAttachments(vault)).toEqual([]);
  });

  it("finds only the attachments nothing refers to, among several", async () => {
    attachment("2026/07/gebruikt.png");
    attachment("2026/07/ongebruikt.png");
    note("00 Inbox", "Kickoff", "![[gebruikt.png]]");

    expect(await findUnlinkedAttachments(vault)).toEqual(["_attachments/2026/07/ongebruikt.png"]);
  });

  it("returns an empty list for a vault with no attachments folder at all", async () => {
    note("00 Inbox", "Kickoff", "Geen bijlagen hier.");

    expect(await findUnlinkedAttachments(vault)).toEqual([]);
  });

  it("returns an empty list when every attachment is referenced", async () => {
    attachment("2026/07/een.png");
    attachment("2026/07/twee.png");
    note("00 Inbox", "Kickoff", "![[een.png]] en ![[twee.png]]");

    expect(await findUnlinkedAttachments(vault)).toEqual([]);
  });
});

/**
 * The half that stopped this stalling at "Looking…" (14 August 2026).
 *
 * `note_links` already holds every `[[…]]` and `![[…]]` target of every live note (B45),
 * so the caller hands the set over and the whole-vault read disappears — which is what was
 * blocking the main process on a Files On-Demand vault, one hydration per note.
 */
describe("finding them from the index's targets", () => {
  it("takes the reference set it is given instead of reading the notes", async () => {
    attachment("2026/07/gebruikt.png");
    attachment("2026/07/ongebruikt.png");
    // Deliberately no note on disk at all: if this still read the vault it would find no
    // reference and report both files.
    expect(await findUnlinkedAttachments(vault, ["gebruikt.png"])).toEqual([
      "_attachments/2026/07/ongebruikt.png",
    ]);
  });

  it("counts a path-form reference, which is what Copy link writes", async () => {
    attachment("2026/07/gebruikt.png");
    attachment("2026/07/ongebruikt.png");

    // `![[_attachments/2026/07/gebruikt.png]]` is a real spelling and a common one: it is
    // what the file row's own **Copy link** puts on the clipboard, and what a vault
    // written in Obsidian is full of (B38). Matching the bare name alone listed a picture
    // a note was drawing as unlinked, and so offered to delete it.
    expect(
      await findUnlinkedAttachments(vault, ["_attachments/2026/07/gebruikt.png"]),
    ).toEqual(["_attachments/2026/07/ongebruikt.png"]);
  });

  it("still reads the trash, which the index deliberately leaves out", async () => {
    attachment("2026/07/afbeelding-1.png");
    note("_trash", "Verwijderd", "![[afbeelding-1.png]]");

    // `index-scan.ts` excludes `_trash` so a deleted note cannot resurface under its tags.
    // A reference is a different question: a trashed note can be restored, and cleaning up
    // the attachment it needs would break it on the way back.
    expect(await findUnlinkedAttachments(vault, [])).toEqual([]);
  });

  it("counts an embed inside a folder in the trash too", async () => {
    attachment("2026/07/diep.png");
    note("_trash/Oud project", "Verwijderd", "![[diep.png]]");

    expect(await findUnlinkedAttachments(vault, [])).toEqual([]);
  });

  it("does not descend into the folders the app owns when it falls back to reading", async () => {
    attachment("2026/07/plaatje.png");
    // A template naming the file is not a note referring to it — and before this the walk
    // went into `_templates`, `_incoming` and `.git` alike, to depth 12.
    note("_templates", "Sjabloon", "![[plaatje.png]]");

    expect(await findUnlinkedAttachments(vault)).toEqual(["_attachments/2026/07/plaatje.png"]);
  });
});
