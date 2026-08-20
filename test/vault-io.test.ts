import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFolder,
  deleteFromTrash,
  diffConflict,
  duplicateNote,
  emptyTrash,
  flattenFolders,
  folderContents,
  moveFolder,
  moveNote,
  openNote,
  readFolderTree,
  readNotesIn,
  renameFolder,
  renameNote,
  resolveConflict,
  saveNote,
  setPinned,
  trashAttachment,
  trashFolder,
  trashNote,
} from "../src/main/vault-io.js";
import { FOLDER_ERROR, TRASH_FOLDER } from "../src/shared/vault-types.js";
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

  it("leaves an uncommitted note out of its own folder's count only", () => {
    const tree = readFolderTree(
      vault,
      "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md",
    );
    const inbox = tree.children.find((c) => c.name === "00 Inbox")!;
    const projects = tree.children.find((c) => c.name === "10 Projects")!;

    expect(inbox.noteCount).toBe(0);
    expect(projects.noteCount).toBe(0);
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

  it("merges frontmatter tags with inline ones, frontmatter first", () => {
    writeFileSync(
      join(vault, "00 Inbox", "2026-07-26 0900 Getagd.md"),
      `---
title: Getagd
type: quick
created: 2026-07-26T09:00:00+02:00
tags: [klantx, offerte]
---

#rapportage volgt nog, zie ook #klantx.
`,
    );

    const note = readNotesIn(vault, "00 Inbox").find((n) => n.title === "Getagd");

    // klantx appears in both and is listed once, in the frontmatter's casing.
    expect(note!.tags).toEqual(["klantx", "offerte", "rapportage"]);
  });

  it("has no tags when the note has none", () => {
    const [note] = readNotesIn(vault, "00 Inbox");
    expect(note!.tags).toEqual([]);
  });

  it("keeps a leading tag in the excerpt but still strips a heading marker", () => {
    writeFileSync(
      join(vault, "00 Inbox", "2026-07-26 1000 Excerpt.md"),
      `---
title: Excerpt
type: quick
created: 2026-07-26T10:00:00+02:00
---

## Besluiten

#klantx is akkoord.
`,
    );

    const note = readNotesIn(vault, "00 Inbox").find((n) => n.title === "Excerpt");
    expect(note!.excerpt).toBe("Besluiten");
  });

  it("starts the excerpt at the tag when the body opens with one", () => {
    writeFileSync(
      join(vault, "00 Inbox", "2026-07-26 1100 Tagfirst.md"),
      `---
title: Tagfirst
type: quick
created: 2026-07-26T11:00:00+02:00
---

#klantx is akkoord.
`,
    );

    const note = readNotesIn(vault, "00 Inbox").find((n) => n.title === "Tagfirst");
    expect(note!.excerpt).toBe("#klantx is akkoord.");
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

  it("keeps where and who when the note becomes a quick note (B20)", () => {
    // This asserted the opposite until B20. Deleting both on the way to `quick` is what
    // made the kind a destructive switch, and why the reader dared not offer it.
    const opened = openNote(vault, path)!;
    saveNote(vault, { ...opened, kind: "quick" });

    const contents = readFileSync(join(vault, path), "utf8");
    expect(contents).toContain("type: quick");
    expect(contents).toContain("location: Teams");
    expect(contents).toContain("attendees: [Jan de Vries, Els Bakker]");
  });

  it("clears a field that was emptied, on either kind", () => {
    // The fields are still editable-to-empty; what changed is that the *kind* no longer
    // decides for them.
    const opened = openNote(vault, path)!;
    saveNote(vault, { ...opened, location: "", attendees: [] });

    const contents = readFileSync(join(vault, path), "utf8");
    expect(contents).not.toContain("location:");
    expect(contents).not.toContain("attendees:");
  });

  it("promotes a quick note to a meeting by changing only type and modified", () => {
    const quick = "00 Inbox/2026-07-26 0900 Snel.md";
    writeFileSync(
      join(vault, quick),
      `---
title: Snel
type: quick
created: 2026-07-26T09:00:00+02:00
location: Bij de koffie
attendees: [Els Bakker]
---

Body die niet mag veranderen.

- Een punt
`,
    );

    const opened = openNote(vault, quick)!;
    saveNote(vault, { ...opened, kind: "meeting" });

    const after = readFileSync(join(vault, quick), "utf8");

    expect(after).toContain("type: meeting");
    expect(after).toContain("location: Bij de koffie");
    expect(after).toContain("attendees: [Els Bakker]");

    // B10: the smallest diff that expresses the change. Everything below the
    // frontmatter is untouched, byte for byte.
    const body = (text: string): string => text.split("---\n")[2]!;
    expect(body(after)).toBe("\nBody die niet mag veranderen.\n\n- Een punt\n");
  });

  it("keeps frontmatter tags through an edit", () => {
    // Nothing in the library can edit the tags field, so they survive only because
    // saveNote spreads the previous frontmatter. Losing them would silently strip a
    // note's tags the first time it was opened and typed in.
    const tagged = "00 Inbox/2026-07-26 0900 Getagd.md";
    writeFileSync(
      join(vault, tagged),
      `---
title: Getagd
type: quick
created: 2026-07-26T09:00:00+02:00
tags: [klantx, offerte]
---

Eerste regel.
`,
    );

    const opened = openNote(vault, tagged)!;
    saveNote(vault, { ...opened, doc: paragraphs("Heel iets anders.").toJSON() });

    const contents = readFileSync(join(vault, tagged), "utf8");
    expect(contents).toContain("tags: [klantx, offerte]");
    expect(contents).toContain("Heel iets anders.");
  });

  it("writes a changed attendee list and location from the reader", () => {
    const opened = openNote(vault, path)!;
    const result = saveNote(vault, {
      ...opened,
      location: "Kantoor Utrecht",
      attendees: ["Els Bakker", "Ruben Ockhuizen"],
    });

    expect(result.written).toBe(true);

    const contents = readFileSync(join(vault, path), "utf8");
    expect(contents).toContain("location: Kantoor Utrecht");
    expect(contents).toContain("attendees: [Els Bakker, Ruben Ockhuizen]");
    expect(contents).not.toContain("Jan de Vries");
  });

  it("writes tags edited in the reader, and removes the line when they are cleared", () => {
    const opened = openNote(vault, path)!;
    saveNote(vault, { ...opened, tags: ["#klantx", "offerte"] });

    let contents = readFileSync(join(vault, path), "utf8");
    // The hash is stripped the same way the capture field strips it.
    expect(contents).toContain("tags: [klantx, offerte]");

    const again = openNote(vault, path)!;
    expect(again.tags).toEqual(["klantx", "offerte"]);

    saveNote(vault, { ...again, tags: [] });
    contents = readFileSync(join(vault, path), "utf8");
    expect(contents).not.toContain("tags:");
  });

  it("still writes nothing when a tagged note is opened and closed untouched", () => {
    // B10 has to survive the header becoming editable: reading values into fields and
    // handing the same ones back must not count as a change.
    const tagged = "00 Inbox/2026-07-26 1200 Rust.md";
    writeFileSync(
      join(vault, tagged),
      `---
title: Rust
type: meeting
created: 2026-07-26T12:00:00+02:00
location: Teams
attendees: [Jan de Vries]
tags: [klantx, offerte]
---

Niets aan de hand.
`,
    );
    const before = readFileSync(join(vault, tagged), "utf8");

    const opened = openNote(vault, tagged)!;
    const result = saveNote(vault, { ...opened });

    expect(result.written).toBe(false);
    expect(readFileSync(join(vault, tagged), "utf8")).toBe(before);
  });

  it("hoists a body tag into the frontmatter and leaves the body byte-identical", () => {
    // B65, reversing B19's second half: the body's tags are written to `tags:` too, so
    // the header stops claiming a note has none. The body itself is untouched — and the
    // escape exception has to hold on the way out of the editor, or the note gains a
    // backslash the first time it is saved.
    const tagged = "00 Inbox/2026-07-26 1000 Inline.md";
    writeFileSync(
      join(vault, tagged),
      `---
title: Inline
type: quick
created: 2026-07-26T10:00:00+02:00
---

#klantx staat vooraan.
`,
    );

    const opened = openNote(vault, tagged)!;
    const result = saveNote(vault, { ...opened });

    expect(result.written).toBe(true);
    const contents = readFileSync(join(vault, tagged), "utf8");
    expect(contents).toContain("tags:");
    expect(contents).toContain("klantx");
    expect(contents).toContain("\n#klantx staat vooraan.\n");

    // And it settles: once hoisted, saving the same note again writes nothing, so the
    // hoist costs one write per note rather than one per save.
    expect(saveNote(vault, { ...openNote(vault, tagged)! }).written).toBe(false);
  });

  it("drops a hoisted tag again when the #tag leaves the body", () => {
    // The provenance rule earning its keep. `openNote` hands back the frontmatter's tags
    // *minus* the body's, so a tag that only ever came from a sentence is not in the set
    // the header field writes — and deleting that sentence deletes the tag. Without it a
    // hoisted tag can never be removed by any gesture at all.
    const tagged = "00 Inbox/2026-07-26 1300 Weg.md";
    writeFileSync(
      join(vault, tagged),
      `---
title: Weg
type: quick
created: 2026-07-26T13:00:00+02:00
tags: [handmatig, klantx]
---

#klantx is akkoord.
`,
    );

    const opened = openNote(vault, tagged)!;
    expect(opened.tags).toEqual(["handmatig"]);
    expect(opened.bodyTags).toEqual(["klantx"]);

    // The same note with the tag typed out of the sentence.
    saveNote(vault, { ...opened, doc: paragraphs("Het is akkoord.").toJSON() });

    const contents = readFileSync(join(vault, tagged), "utf8");
    expect(contents).toContain("handmatig");
    expect(contents).not.toContain("klantx");
  });

  it("keeps a tag that is only in the header when the body has none", () => {
    const tagged = "00 Inbox/2026-07-26 1400 Alleen.md";
    writeFileSync(
      join(vault, tagged),
      `---
title: Alleen
type: quick
created: 2026-07-26T14:00:00+02:00
tags: [offerte]
---

Geen tags in de tekst.
`,
    );

    const opened = openNote(vault, tagged)!;
    expect(opened.tags).toEqual(["offerte"]);
    expect(opened.bodyTags).toEqual([]);
    expect(saveNote(vault, { ...opened }).written).toBe(false);
  });
});

/**
 * B75's pin: one line in the frontmatter, and one thing that must *not* change with it.
 */
describe("pinning a note", () => {
  const NOTE_PATH = "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md";
  const read = (): string => readFileSync(join(vault, NOTE_PATH), "utf8");

  it("writes pinned: true as a boolean, not as a quoted string", () => {
    expect(setPinned(vault, NOTE_PATH, true)).toBe(true);
    expect(read()).toContain("\npinned: true\n");
    expect(read()).not.toContain('pinned: "true"');
  });

  it("reads back through the ordinary summary the list is built from", () => {
    setPinned(vault, NOTE_PATH, true);
    expect(readNotesIn(vault, "00 Inbox")[0]?.pinned).toBe(true);
  });

  it("removes the key on unpin rather than writing pinned: false", () => {
    // A note that has been pinned and unpinned is byte-identical to one that never was,
    // which is what keeps `pinned` out of every note in the vault.
    const before = read();
    setPinned(vault, NOTE_PATH, true);
    setPinned(vault, NOTE_PATH, false);

    expect(read()).not.toContain("pinned");
    expect(read()).toBe(before);
  });

  it("leaves modified exactly as it was", () => {
    // The one thing about this feature most likely to be undone by accident. A pin is not
    // an edit: bumping `modified` would reorder the very list the pin exists to fix, and
    // tell the other machine that something inside the note changed.
    const opened = openNote(vault, NOTE_PATH)!;
    saveNote(vault, { ...opened, doc: paragraphs("Iets anders.").toJSON() });
    const stamped = /^modified: (.+)$/m.exec(read())?.[1];
    expect(stamped).toBeDefined();

    setPinned(vault, NOTE_PATH, true);
    expect(/^modified: (.+)$/m.exec(read())?.[1]).toBe(stamped);
  });

  it("says so rather than throwing when the note is not there", () => {
    expect(setPinned(vault, "00 Inbox/weg.md", true)).toBe(false);
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

  it("duplicates a note beside itself, -copy appended to the title", () => {
    const duplicated = duplicateNote(vault, path);

    expect(duplicated).toBe(
      "00 Inbox/2026-07-25 1432 Kickoff project Alpha-copy.md",
    );
    // The source is untouched.
    expect(readFileSync(join(vault, path), "utf8")).toContain(
      "title: Kickoff project Alpha\n",
    );
    expect(readFileSync(join(vault, duplicated), "utf8")).toContain(
      "title: Kickoff project Alpha-copy",
    );
    expect(readNotesIn(vault, "00 Inbox")).toHaveLength(2);
  });

  it("never overwrites an existing copy — a second duplicate lands on uniquePath's ' (2)' form", () => {
    const first = duplicateNote(vault, path);
    const second = duplicateNote(vault, path);

    expect(first).toBe("00 Inbox/2026-07-25 1432 Kickoff project Alpha-copy.md");
    expect(second).toBe(
      "00 Inbox/2026-07-25 1432 Kickoff project Alpha-copy (2).md",
    );
    expect(readFileSync(join(vault, second), "utf8")).toContain(
      "title: Kickoff project Alpha-copy",
    );
    expect(readNotesIn(vault, "00 Inbox")).toHaveLength(3);
  });

  it("makes a folder", () => {
    const created = createFolder(vault, "10 Projects", "Klant Y");

    expect(created).toBe("10 Projects/Klant Y");
    expect(flattenFolders(readFolderTree(vault))).toContain("10 Projects/Klant Y");
  });

  it("keeps a folder name usable on Windows", () => {
    expect(createFolder(vault, "", 'Klant: Z*')).toBe("Klant- Z-");
  });

  it("refuses a folder name Windows reserves", () => {
    // Went through unchanged before `createFolder` shared the title rules.
    expect(createFolder(vault, "", "CON")).toBe("CON_");
  });
});

describe("renaming a folder", () => {
  it("renames in place, keeping it where it is in the tree", () => {
    const renamed = renameFolder(vault, "10 Projects/Klant X", "Klant Xerxes");

    expect(renamed).toBe("10 Projects/Klant Xerxes");
    const folders = flattenFolders(readFolderTree(vault));
    expect(folders).toContain("10 Projects/Klant Xerxes");
    expect(folders).not.toContain("10 Projects/Klant X");
  });

  it("brings the notes and the subfolders along", () => {
    writeFileSync(join(vault, "10 Projects", "Klant X", "2026-07-25 1432 Iets.md"), NOTE);

    const renamed = renameFolder(vault, "10 Projects/Klant X", "Klant Xerxes");

    expect(readNotesIn(vault, renamed)).toHaveLength(1);
    expect(flattenFolders(readFolderTree(vault))).toContain(
      "10 Projects/Klant Xerxes/Project Alpha",
    );
  });

  it("applies the same name rules as everything else", () => {
    expect(renameFolder(vault, "10 Projects/Klant X", "Klant: Y*")).toBe(
      "10 Projects/Klant- Y-",
    );
  });

  it("allows a change of case, which already 'exists' on macOS and Windows", () => {
    expect(renameFolder(vault, "10 Projects/Klant X", "KLANT X")).toBe(
      "10 Projects/KLANT X",
    );
  });

  it("does nothing, successfully, when the name has not changed", () => {
    expect(renameFolder(vault, "10 Projects/Klant X", "Klant X")).toBe(
      "10 Projects/Klant X",
    );
  });

  describe("refuses rather than corrects", () => {
    it("an existing name — never `uniquePath`, which would make a second folder", () => {
      createFolder(vault, "10 Projects", "Klant Y");

      expect(() => renameFolder(vault, "10 Projects/Klant X", "Klant Y")).toThrow(
        FOLDER_ERROR.exists,
      );
      // The point of refusing: the folder is still there, under its own name.
      expect(flattenFolders(readFolderTree(vault))).toContain("10 Projects/Klant X");
    });

    it("the vault root", () => {
      expect(() => renameFolder(vault, "", "Nieuw")).toThrow(FOLDER_ERROR.root);
    });

    it("the trash, and anything inside it", () => {
      mkdirSync(join(vault, TRASH_FOLDER, "Oud"), { recursive: true });

      expect(() => renameFolder(vault, TRASH_FOLDER, "Weg")).toThrow(FOLDER_ERROR.reserved);
      expect(() => renameFolder(vault, `${TRASH_FOLDER}/Oud`, "Weg")).toThrow(
        FOLDER_ERROR.reserved,
      );
    });

    it("a folder the app owns", () => {
      expect(() => renameFolder(vault, "_attachments", "Bijlagen")).toThrow(
        FOLDER_ERROR.reserved,
      );
    });

    it("renaming a folder *into* a name the app owns", () => {
      expect(() => renameFolder(vault, "10 Projects/Klant X", "_trash")).toThrow(
        FOLDER_ERROR.reserved,
      );
      expect(() => renameFolder(vault, "10 Projects/Klant X", "_attachments")).toThrow(
        FOLDER_ERROR.reserved,
      );
    });

    it("a name with nothing left in it", () => {
      expect(() => renameFolder(vault, "10 Projects/Klant X", "  ")).toThrow(
        FOLDER_ERROR.empty,
      );
    });

    it("a folder that is gone", () => {
      expect(() => renameFolder(vault, "10 Projects/Weg", "Terug")).toThrow(
        FOLDER_ERROR.missing,
      );
    });

    it("an escape attempt, twice over", () => {
      // Sanitising takes the separators out first, so there is no traversal left to
      // resolve; what remains begins with a dot, which is the app's own namespace and
      // refused on that count. Assert on where it did *not* go either way.
      expect(() => renameFolder(vault, "10 Projects/Klant X", "../../escaped")).toThrow(
        FOLDER_ERROR.reserved,
      );

      expect(existsSync(join(vault, "..", "escaped"))).toBe(false);
      expect(flattenFolders(readFolderTree(vault))).toContain("10 Projects/Klant X");
    });
  });
});

describe("counting what is inside a folder", () => {
  it("counts notes and nested subfolders, but not the app's own folders", () => {
    writeFileSync(
      join(vault, "10 Projects", "Klant X", "Project Alpha", "2026-07-25 1500 Iets.md"),
      NOTE,
    );

    // 10 Projects/Klant X and .../Klant X/Project Alpha — two folders, one note.
    expect(folderContents(vault, "10 Projects")).toEqual({ notes: 1, folders: 2 });
  });

  it("answers zero for an empty folder", () => {
    createFolder(vault, "10 Projects", "Klant Y");
    expect(folderContents(vault, "10 Projects/Klant Y")).toEqual({ notes: 0, folders: 0 });
  });

  it("counts the whole vault at the root", () => {
    // 00 Inbox, 10 Projects, Klant X, Project Alpha — _attachments is not counted, the
    // same rule readFolderTree follows.
    expect(folderContents(vault, "")).toEqual({ notes: 1, folders: 4 });
  });
});

describe("trashing a folder", () => {
  it("moves the folder, and everything inside it, into _trash", () => {
    writeFileSync(join(vault, "10 Projects", "Klant X", "2026-07-25 1432 Iets.md"), NOTE);

    const trashed = trashFolder(vault, "10 Projects/Klant X");

    expect(trashed).toBe(`${TRASH_FOLDER}/Klant X`);
    expect(existsSync(join(vault, "10 Projects", "Klant X"))).toBe(false);
    expect(readNotesIn(vault, trashed)).toHaveLength(1);
    expect(flattenFolders(readFolderTree(vault))).toContain(
      `${TRASH_FOLDER}/Klant X/Project Alpha`,
    );
  });

  it("uniquifies on a name collision, keeping the whole folder rather than a note's `.md` suffix", () => {
    mkdirSync(join(vault, TRASH_FOLDER, "Klant X"), { recursive: true });

    const trashed = trashFolder(vault, "10 Projects/Klant X");

    expect(trashed).toBe(`${TRASH_FOLDER}/Klant X (2)`);
    expect(existsSync(join(vault, TRASH_FOLDER, "Klant X (2)", "Project Alpha"))).toBe(true);
  });

  describe("refuses rather than corrects", () => {
    it("the vault root", () => {
      expect(() => trashFolder(vault, "")).toThrow(FOLDER_ERROR.root);
    });

    it("the trash itself, and anything inside it", () => {
      mkdirSync(join(vault, TRASH_FOLDER, "Oud"), { recursive: true });

      expect(() => trashFolder(vault, TRASH_FOLDER)).toThrow(FOLDER_ERROR.reserved);
      expect(() => trashFolder(vault, `${TRASH_FOLDER}/Oud`)).toThrow(FOLDER_ERROR.reserved);
    });

    it("a folder the app owns", () => {
      expect(() => trashFolder(vault, "_attachments")).toThrow(FOLDER_ERROR.reserved);
    });

    it("a folder that is gone", () => {
      expect(() => trashFolder(vault, "10 Projects/Weg")).toThrow(FOLDER_ERROR.missing);
      // The point of refusing: nothing on disk moved, not even the trash folder itself.
      expect(existsSync(join(vault, TRASH_FOLDER))).toBe(false);
    });
  });
});

describe("trashing an attachment", () => {
  it("moves the file into the vault's own trash", () => {
    writeFileSync(join(vault, "_attachments", "2026", "07", "foto.png"), "binary");

    const result = trashAttachment(vault, "_attachments/2026/07/foto.png");

    expect(result).toBe(`${TRASH_FOLDER}/foto.png`);
    expect(existsSync(join(vault, "_attachments", "2026", "07", "foto.png"))).toBe(false);
    expect(existsSync(join(vault, TRASH_FOLDER, "foto.png"))).toBe(true);
  });

  it("keeps the real extension on a collision, unlike a note's own uniquePath", () => {
    mkdirSync(join(vault, TRASH_FOLDER), { recursive: true });
    writeFileSync(join(vault, TRASH_FOLDER, "foto.png"), "ouder");
    writeFileSync(join(vault, "_attachments", "2026", "07", "foto.png"), "nieuw");

    const result = trashAttachment(vault, "_attachments/2026/07/foto.png");

    expect(result).toBe(`${TRASH_FOLDER}/foto (2).png`);
    expect(existsSync(join(vault, TRASH_FOLDER, "foto (2).png"))).toBe(true);
  });
});

describe("diffing a OneDrive conflict", () => {
  it("reads both files and diffs them line by line", () => {
    writeFileSync(join(vault, "00 Inbox", "Kickoff.md"), "een\ntwee\n");
    writeFileSync(join(vault, "00 Inbox", "Kickoff-LAPTOP-ABC123.md"), "een\ndrie\n");

    const lines = diffConflict(vault, {
      original: "00 Inbox/Kickoff.md",
      conflict: "00 Inbox/Kickoff-LAPTOP-ABC123.md",
    });

    expect(lines).toContainEqual({ kind: "same", text: "een" });
    expect(lines).toContainEqual({ kind: "removed", text: "twee" });
    expect(lines).toContainEqual({ kind: "added", text: "drie" });
  });
});

describe("resolving a OneDrive conflict", () => {
  const pair = {
    original: "00 Inbox/Kickoff.md",
    conflict: "00 Inbox/Kickoff-LAPTOP-ABC123.md",
  };

  beforeEach(() => {
    writeFileSync(join(vault, "00 Inbox", "Kickoff.md"), "origineel");
    writeFileSync(join(vault, "00 Inbox", "Kickoff-LAPTOP-ABC123.md"), "conflict");
  });

  it("keepOriginal trashes the conflict copy and leaves the original untouched", () => {
    resolveConflict(vault, pair, "keepOriginal");

    expect(readFileSync(join(vault, "00 Inbox", "Kickoff.md"), "utf8")).toBe("origineel");
    expect(existsSync(join(vault, "00 Inbox", "Kickoff-LAPTOP-ABC123.md"))).toBe(false);
    expect(existsSync(join(vault, TRASH_FOLDER, "Kickoff-LAPTOP-ABC123.md"))).toBe(true);
  });

  it("keepConflict trashes the original — not a permanent delete — and takes its place", () => {
    resolveConflict(vault, pair, "keepConflict");

    expect(readFileSync(join(vault, "00 Inbox", "Kickoff.md"), "utf8")).toBe("conflict");
    expect(existsSync(join(vault, "00 Inbox", "Kickoff-LAPTOP-ABC123.md"))).toBe(false);
    expect(existsSync(join(vault, TRASH_FOLDER, "Kickoff.md"))).toBe(true);
    expect(readFileSync(join(vault, TRASH_FOLDER, "Kickoff.md"), "utf8")).toBe("origineel");
  });
});

describe("emptying the trash", () => {
  it("removes every file and nested folder directly inside _trash", () => {
    trashNote(vault, "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md");
    mkdirSync(join(vault, TRASH_FOLDER, "Oud", "Nested"), { recursive: true });
    writeFileSync(join(vault, TRASH_FOLDER, "Oud", "Nested", "foto.png"), "binary");

    const emptied = emptyTrash(vault);

    expect(emptied).toEqual({ removed: 2, failed: 0 });
    expect(readdirSync(join(vault, TRASH_FOLDER))).toEqual([]);
    // The vault itself, and everything outside _trash, is untouched.
    expect(
      existsSync(join(vault, "00 Inbox", "2026-07-25 1432 Kickoff project Alpha.md")),
    ).toBe(false);
    expect(existsSync(join(vault, "00 Inbox"))).toBe(true);
  });

  it("does nothing and answers 0 when _trash does not exist yet", () => {
    expect(existsSync(join(vault, TRASH_FOLDER))).toBe(false);
    expect(emptyTrash(vault)).toEqual({ removed: 0, failed: 0 });
  });

  it("does nothing and answers 0 when _trash is already empty", () => {
    mkdirSync(join(vault, TRASH_FOLDER), { recursive: true });
    expect(emptyTrash(vault)).toEqual({ removed: 0, failed: 0 });
  });

  it("counts what would not go instead of stopping at it", () => {
    // Stand-in for the Windows case this exists for: a folder something else on the
    // machine has open, which `rmSync` refuses whatever the retry budget. Here it is a
    // read-only parent directory, which is the portable way to make one entry
    // unremovable while its neighbour is fine — the point being that the neighbour still
    // goes. Skipped on Windows, where `chmod` does not mean this, and as root, where
    // permissions are not enforced at all; the real Windows case is a manual test.
    if (process.platform === "win32") return;
    if (typeof process.getuid === "function" && process.getuid() === 0) return;

    mkdirSync(join(vault, TRASH_FOLDER, "Vast", "Binnenin"), { recursive: true });
    writeFileSync(join(vault, TRASH_FOLDER, "Vast", "Binnenin", "vast.md"), "vast");
    writeFileSync(join(vault, TRASH_FOLDER, "Los.md"), "los");
    chmodSync(join(vault, TRASH_FOLDER, "Vast"), 0o500);

    const emptied = emptyTrash(vault);

    expect(emptied.removed).toBe(1);
    expect(emptied.failed).toBe(1);
    // A count alone tells someone that something is wrong and nothing about what, which is
    // where the second report of this bug left everyone. The entry and the code travel
    // with it now, and the entry is the one that actually refused.
    expect(emptied.firstFailure?.code).toBe("EACCES");
    expect(emptied.firstFailure?.path).toBe("_trash/Vast/Binnenin");
    expect(existsSync(join(vault, TRASH_FOLDER, "Los.md"))).toBe(false);
    expect(existsSync(join(vault, TRASH_FOLDER, "Vast"))).toBe(true);

    chmodSync(join(vault, TRASH_FOLDER, "Vast"), 0o700);
  });

  it("refuses to follow a _trash that is a symlink outside the vault", () => {
    const outside = mkdtempSync(join(tmpdir(), "emqnote-outside-"));
    writeFileSync(join(outside, "secret.txt"), "not the vault's to delete");
    symlinkSync(outside, join(vault, TRASH_FOLDER));

    expect(() => emptyTrash(vault)).toThrow(
      "refusing to empty a path outside the vault's own trash folder",
    );
    expect(existsSync(join(outside, "secret.txt"))).toBe(true);

    rmSync(outside, { recursive: true, force: true });
  });
});

/**
 * The way back out of the trash, and the one refusal a rename cannot produce.
 *
 * A folder in `_trash` has nowhere to be *renamed* to — a rename never changes which
 * parent a folder hangs off — so Restore had to be a move, and this is the only
 * move-a-folder call in the app.
 */
describe("moving a folder", () => {
  it("moves it, and everything inside it, under another parent", () => {
    trashFolder(vault, "10 Projects/Klant X");

    const restored = moveFolder(vault, `${TRASH_FOLDER}/Klant X`, "10 Projects");

    expect(restored).toBe("10 Projects/Klant X");
    expect(existsSync(join(vault, TRASH_FOLDER, "Klant X"))).toBe(false);
    expect(flattenFolders(readFolderTree(vault))).toContain("10 Projects/Klant X/Project Alpha");
  });

  it("takes the vault root as an empty parent, the same spelling moveNote uses", () => {
    trashFolder(vault, "10 Projects/Klant X");

    expect(moveFolder(vault, `${TRASH_FOLDER}/Klant X`, "")).toBe("Klant X");
    expect(existsSync(join(vault, "Klant X", "Project Alpha"))).toBe(true);
  });

  it("survives a name collision rather than refusing one, unlike renameFolder", () => {
    // Nobody typed this name: the folder keeps the one it already had, so a destination
    // that happens to hold one of the same name is a collision to get past, not a
    // mistake to correct. `renameFolder`'s own comment argues the opposite case.
    trashFolder(vault, "10 Projects/Klant X");
    mkdirSync(join(vault, "10 Projects", "Klant X"), { recursive: true });

    expect(moveFolder(vault, `${TRASH_FOLDER}/Klant X`, "10 Projects")).toBe(
      "10 Projects/Klant X (2)",
    );
  });

  it("answers with the path unchanged when it is already there", () => {
    // Without this the collision suffix would turn "move it where it is" into a rename.
    expect(moveFolder(vault, "10 Projects/Klant X", "10 Projects")).toBe("10 Projects/Klant X");
    expect(existsSync(join(vault, "10 Projects", "Klant X", "Project Alpha"))).toBe(true);
  });

  describe("refuses rather than corrects", () => {
    it("the vault root, and the trash folder itself", () => {
      expect(() => moveFolder(vault, "", "10 Projects")).toThrow(FOLDER_ERROR.root);
      expect(() => moveFolder(vault, TRASH_FOLDER, "10 Projects")).toThrow(FOLDER_ERROR.reserved);
    });

    it("a folder the app owns, on either end", () => {
      expect(() => moveFolder(vault, "_attachments", "10 Projects")).toThrow(
        FOLDER_ERROR.reserved,
      );
      expect(() => moveFolder(vault, "10 Projects/Klant X", "_attachments")).toThrow(
        FOLDER_ERROR.reserved,
      );
    });

    it("the trash as a destination — trashFolder is that route, and two would drift", () => {
      expect(() => moveFolder(vault, "10 Projects/Klant X", TRASH_FOLDER)).toThrow(
        FOLDER_ERROR.reserved,
      );
    });

    it("a folder moved inside itself", () => {
      expect(() => moveFolder(vault, "10 Projects", "10 Projects/Klant X")).toThrow(
        FOLDER_ERROR.intoItself,
      );
    });

    it("a folder that is gone", () => {
      expect(() => moveFolder(vault, "10 Projects/Weg", "00 Inbox")).toThrow(
        FOLDER_ERROR.missing,
      );
    });
  });
});

/**
 * The second permanent delete in the app, and the first that names one thing (B24). It
 * shares `emptyTrash`'s guard exactly, which is what most of these are about: that guard
 * is the reason this is allowed to exist beside it at all.
 */
describe("deleting one thing out of the trash", () => {
  it("removes one trashed note and leaves the rest of the trash alone", () => {
    const gone = trashNote(vault, "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md");
    writeFileSync(join(vault, TRASH_FOLDER, "blijft.md"), "nog niet weg");

    deleteFromTrash(vault, gone);

    expect(existsSync(join(vault, gone))).toBe(false);
    expect(existsSync(join(vault, TRASH_FOLDER, "blijft.md"))).toBe(true);
  });

  it("removes a whole trashed folder, contents and all", () => {
    writeFileSync(join(vault, "10 Projects", "Klant X", "2026-07-25 1432 Iets.md"), NOTE);
    const gone = trashFolder(vault, "10 Projects/Klant X");

    deleteFromTrash(vault, gone);

    expect(existsSync(join(vault, gone))).toBe(false);
    expect(readdirSync(join(vault, TRASH_FOLDER))).toEqual([]);
  });

  it("does nothing at all for a path that is already gone", () => {
    mkdirSync(join(vault, TRASH_FOLDER), { recursive: true });
    expect(() => deleteFromTrash(vault, `${TRASH_FOLDER}/nooit-bestaan.md`)).not.toThrow();
  });

  it("refuses a path outside the trash, however ordinary it looks", () => {
    const live = "00 Inbox/2026-07-25 1432 Kickoff project Alpha.md";
    mkdirSync(join(vault, TRASH_FOLDER), { recursive: true });

    expect(() => deleteFromTrash(vault, live)).toThrow(
      "refusing to delete a path outside the vault's own trash folder",
    );
    expect(existsSync(join(vault, live))).toBe(true);
  });

  it("refuses the trash folder itself — emptying it is emptyTrash's job", () => {
    mkdirSync(join(vault, TRASH_FOLDER), { recursive: true });

    expect(() => deleteFromTrash(vault, TRASH_FOLDER)).toThrow(
      "refusing to delete a path outside the vault's own trash folder",
    );
    expect(existsSync(join(vault, TRASH_FOLDER))).toBe(true);
  });

  it("refuses to follow a _trash that is a symlink outside the vault", () => {
    // `resolve()` only normalises text; `realpathSync` is what actually asks the
    // filesystem, which is why `emptyTrash` uses it and why this does too.
    const outside = mkdtempSync(join(tmpdir(), "emqnote-outside-"));
    writeFileSync(join(outside, "secret.txt"), "not the vault's to delete");
    symlinkSync(outside, join(vault, TRASH_FOLDER));

    expect(() => deleteFromTrash(vault, `${TRASH_FOLDER}/secret.txt`)).toThrow(
      "refusing to delete inside a path outside the vault's own trash folder",
    );
    expect(existsSync(join(outside, "secret.txt"))).toBe(true);

    rmSync(outside, { recursive: true, force: true });
  });

  it("refuses a symlink inside the trash that points out of it", () => {
    // A link *in* `_trash` is as good a way out of it as a symlinked `_trash` is, which
    // is why the target is resolved as well as the folder it sits in.
    const outside = mkdtempSync(join(tmpdir(), "emqnote-outside-"));
    writeFileSync(join(outside, "secret.txt"), "not the vault's to delete");
    mkdirSync(join(vault, TRASH_FOLDER), { recursive: true });
    symlinkSync(join(outside, "secret.txt"), join(vault, TRASH_FOLDER, "ziet-er-weg-uit.txt"));

    expect(() => deleteFromTrash(vault, `${TRASH_FOLDER}/ziet-er-weg-uit.txt`)).toThrow(
      "refusing to delete a path outside the vault's own trash folder",
    );
    expect(existsSync(join(outside, "secret.txt"))).toBe(true);

    rmSync(outside, { recursive: true, force: true });
  });
});
