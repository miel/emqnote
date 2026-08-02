import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFolder,
  diffConflict,
  flattenFolders,
  moveNote,
  openNote,
  readFolderTree,
  readNotesIn,
  renameFolder,
  renameNote,
  resolveConflict,
  saveNote,
  trashAttachment,
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

  it("keeps an inline tag in the body byte-identical through an edit", () => {
    // The escape exception has to hold on the way out of the editor too, or a note
    // gains a backslash the first time it is touched.
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

    expect(result.written).toBe(false);
    expect(readFileSync(join(vault, tagged), "utf8")).toContain("\n#klantx staat vooraan.\n");
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
