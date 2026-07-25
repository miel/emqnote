import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFolder,
  flattenFolders,
  moveNote,
  openNote,
  readFolderTree,
  readNotesIn,
  renameNote,
  saveNote,
} from "../src/main/vault-io.js";
import { paragraphs } from "./helpers/doc.js";

let vault: string;

const NOTE = `---
title: Kickoff project Alpha
type: meeting
created: 2026-07-25T14:32:00+02:00
location: Teams
attendees: [Jan de Vries, Els Bakker]
---

Els zit voor.

- Eerste punt
- Tweede punt
`;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-vault-"));
  mkdirSync(join(vault, "00 Inbox"), { recursive: true });
  mkdirSync(join(vault, "10 Projects", "Klant X", "Project Alpha"), { recursive: true });
  mkdirSync(join(vault, "_attachments", "2026", "07"), { recursive: true });
  writeFileSync(join(vault, "00 Inbox", "2026-07-25 1432 Kickoff project Alpha.md"), NOTE);
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

describe("browsing the vault", () => {
  it("lists folders without the ones the app owns", () => {
    const tree = readFolderTree(vault);
    const names = tree.children.map((child) => child.name);

    expect(names).toContain("00 Inbox");
    expect(names).toContain("10 Projects");
    // _attachments and _templates are plumbing, not somewhere to browse.
    expect(names).not.toContain("_attachments");
  });

  it("goes several levels deep", () => {
    const projects = readFolderTree(vault).children.find((c) => c.name === "10 Projects");
    const client = projects!.children[0]!;

    expect(client.name).toBe("Klant X");
    expect(client.children[0]!.path).toBe("10 Projects/Klant X/Project Alpha");
  });

  it("summarises the notes in a folder", () => {
    const [note] = readNotesIn(vault, "00 Inbox");

    expect(note!.title).toBe("Kickoff project Alpha");
    expect(note!.kind).toBe("meeting");
    expect(note!.attendees).toEqual(["Jan de Vries", "Els Bakker"]);
    expect(note!.excerpt).toBe("Els zit voor.");
    expect(note!.path).toBe("00 Inbox/2026-07-25 1432 Kickoff project Alpha.md");
  });
});

describe("opening a note", () => {
  it("reads the frontmatter and the document", () => {
    const opened = openNote(vault, "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md");

    expect(opened!.title).toBe("Kickoff project Alpha");
    expect(opened!.location).toBe("Teams");
    expect(opened!.doc).toBeDefined();
  });

  it("does not touch the file", () => {
    // Decision B10. An app that rewrites notes for having looked at them is an app
    // that manufactures OneDrive conflict copies across two machines.
    const path = "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md";
    const before = statSync(join(vault, path)).mtimeMs;

    openNote(vault, path);
    readNotesIn(vault, "00 Inbox");
    readFolderTree(vault);

    expect(statSync(join(vault, path)).mtimeMs).toBe(before);
  });

  it("returns nothing for a note that is gone", () => {
    expect(openNote(vault, "00 Inbox/weg.md")).toBeNull();
  });
});

describe("saving a note", () => {
  const path = "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md";

  function request(doc = paragraphs("Els zit voor.")) {
    const opened = openNote(vault, path)!;
    return { ...opened, doc: doc.toJSON() };
  }

  it("writes nothing when nothing changed", () => {
    const opened = openNote(vault, path)!;
    const result = saveNote(vault, { ...opened });

    expect(result.written).toBe(false);
  });

  it("writes when the body changed", () => {
    const result = saveNote(vault, request(paragraphs("Heel iets anders.")));

    expect(result.written).toBe(true);
    expect(readFileSync(join(vault, path), "utf8")).toContain("Heel iets anders.");
  });

  it("drops meeting fields when the note becomes a quick note", () => {
    const opened = openNote(vault, path)!;
    saveNote(vault, { ...opened, kind: "quick" });

    const contents = readFileSync(join(vault, path), "utf8");
    expect(contents).toContain("type: quick");
    expect(contents).not.toContain("location:");
    expect(contents).not.toContain("attendees:");
  });
});

describe("moving and renaming", () => {
  const path = "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md";

  it("moves a note into a project folder", () => {
    const moved = moveNote(vault, path, "10 Projects/Klant X/Project Alpha");

    expect(moved).toBe(
      "10 Projects/Klant X/Project Alpha/2026-07-25 1432 Kickoff project Alpha.md",
    );
    expect(readNotesIn(vault, "00 Inbox")).toHaveLength(0);
    expect(readNotesIn(vault, "10 Projects/Klant X/Project Alpha")).toHaveLength(1);
  });

  it("never overwrites a note already in the target folder", () => {
    writeFileSync(
      join(vault, "10 Projects", "2026-07-25 1432 Kickoff project Alpha.md"),
      NOTE,
    );
    const moved = moveNote(vault, path, "10 Projects");

    expect(moved).toContain("(2).md");
    expect(readNotesIn(vault, "10 Projects")).toHaveLength(2);
  });

  it("renames the title and the file, keeping the timestamp", () => {
    const renamed = renameNote(vault, path, "Kickoff Alpha herzien");

    expect(renamed).toBe("00 Inbox/2026-07-25 1432 Kickoff Alpha herzien.md");
    expect(readFileSync(join(vault, renamed), "utf8")).toContain(
      "title: Kickoff Alpha herzien",
    );
  });

  it("makes a folder", () => {
    const created = createFolder(vault, "10 Projects", "Klant Y");

    expect(created).toBe("10 Projects/Klant Y");
    expect(flattenFolders(readFolderTree(vault))).toContain("10 Projects/Klant Y");
  });

  it("keeps a folder name usable on Windows", () => {
    expect(createFolder(vault, "", 'Klant: Z*')).toBe("Klant- Z-");
  });
});
