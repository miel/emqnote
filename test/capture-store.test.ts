import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beginSession,
  loadSession,
  newNoteFolder,
  writeSession,
} from "../src/main/capture-store.js";
import { parseNote } from "../src/markdown/index.js";
import { INBOX } from "../src/main/vault.js";
import { openNote } from "../src/main/vault-io.js";
import { paragraphs, payload } from "./helpers/doc.js";

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-test-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("saving a capture", () => {
  it("writes to the Inbox with the timestamp in the name", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Kickoff project Alpha", "Els zit voor."));

    const result = await writeSession(session, vault);

    expect(result.written).toBe(true);
    expect(result.path!).toContain(join(vault, INBOX));
    expect(basename(result.path!)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{4} Kickoff project Alpha\.md$/,
    );
  });

  it("produces a note our own parser recognises", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Overleg", "Eerste punt."));

    const { path } = await writeSession(session, vault);
    const note = parseNote(readFileSync(path!, "utf8"));

    expect(note.frontmatter.title).toBe("Overleg");
    expect(note.frontmatter.type).toBe("quick");
    expect(note.frontmatter.source).toBe("manual");
    expect(note.frontmatter.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]/);
    expect(note.doc.textContent).toContain("Eerste punt.");
  });

  it("prefers the subject over the first line", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Just a first line"), {
      subject: "Stuurgroep Alpha",
    });

    const { path } = await writeSession(session, vault);

    expect(basename(path!)).toContain("Stuurgroep Alpha");
    expect(readFileSync(path!, "utf8")).toContain("title: Stuurgroep Alpha");
  });

  it("records location and attendees for a meeting", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Besluit genomen."), {
      kind: "meeting",
      subject: "Stuurgroep",
      location: "Teams",
      attendees: ["Jan de Vries", "Els Bakker"],
    });

    const result = await writeSession(session, vault);
    const note = parseNote(readFileSync(result.path!, "utf8"));

    expect(note.frontmatter.type).toBe("meeting");
    expect(note.frontmatter.location).toBe("Teams");
    expect(note.frontmatter.attendees).toEqual(["Jan de Vries", "Els Bakker"]);
    expect(result.attendees).toEqual(["Jan de Vries", "Els Bakker"]);
  });

  it("records where and who on a quick note too (B20)", async () => {
    // The reverse of what this asserted until B20. Both fields used to be written only
    // inside `if (kind === "meeting")`, so a quick note that had them typed in threw
    // them away on the way to disk — which is also why the reader could not offer the
    // kind toggle at all.
    const session = beginSession();
    session.payload = payload(paragraphs("Snelle gedachte"), {
      location: "Teams",
      attendees: ["Iemand"],
    });

    const { path } = await writeSession(session, vault);
    const contents = readFileSync(path!, "utf8");

    expect(contents).toContain("type: quick");
    expect(contents).toContain("location: Teams");
    expect(contents).toContain("attendees: [Iemand]");
  });

  it("still writes nothing for a field that was left empty", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Snelle gedachte"));

    const { path } = await writeSession(session, vault);
    const contents = readFileSync(path!, "utf8");

    expect(contents).not.toContain("location:");
    expect(contents).not.toContain("attendees:");
  });

  it("records tags on a quick note, not only on a meeting", async () => {
    // The whole point of putting the field in row one: a quick note is the common case.
    const session = beginSession();
    session.payload = payload(paragraphs("Snelle gedachte"), {
      subject: "Idee",
      tags: ["klantx", "offerte"],
    });

    const result = await writeSession(session, vault);
    const note = parseNote(readFileSync(result.path!, "utf8"));

    expect(note.frontmatter.type).toBe("quick");
    expect(note.frontmatter.tags).toEqual(["klantx", "offerte"]);
    expect(result.tags).toEqual(["klantx", "offerte"]);
  });

  it("accepts a tag typed with its hash and stores it without", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Tekst"), {
      subject: "Idee",
      tags: ["#klantx", "  ", "#klant/"],
    });

    const { path } = await writeSession(session, vault);

    expect(parseNote(readFileSync(path!, "utf8")).frontmatter.tags).toEqual([
      "klantx",
      "klant",
    ]);
  });

  it("leaves the tags line out when none were typed", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Tekst"), { subject: "Idee" });

    const { path } = await writeSession(session, vault);

    expect(readFileSync(path!, "utf8")).not.toContain("tags:");
  });

  it("keeps an inline tag in the body and out of the frontmatter", async () => {
    // B19: the two sources stay separate. Copying body tags into the frontmatter would
    // mean editing one sentence rewrites the header.
    const session = beginSession();
    session.payload = payload(paragraphs("#klantx is akkoord."), { subject: "Idee" });

    const { path } = await writeSession(session, vault);
    const contents = readFileSync(path!, "utf8");

    expect(contents).not.toContain("tags:");
    expect(contents).toContain("#klantx is akkoord.");
  });

  it("writes nothing when there is no title and no text", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("", "   "));

    const result = await writeSession(session, vault);

    expect(result.written).toBe(false);
    expect(result.path).toBeNull();
  });

  it("does not touch the file when the content has not changed", async () => {
    // Decision B10: by far the most OneDrive conflict copies come from an app
    // rewriting files the user never changed.
    const session = beginSession();
    session.payload = payload(paragraphs("Niets veranderd"));

    const first = await writeSession(session, vault);
    const before = statSync(first.path!).mtimeMs;

    await sleep(20);
    const second = await writeSession(session, vault);

    expect(second.written).toBe(false);
    expect(statSync(first.path!).mtimeMs).toBe(before);
  });

  it("keeps writing to the same file when the title changes", async () => {
    // Renaming while you type would leave a trail of half-finished files; renaming is
    // work for the main window in phase 4.
    const session = beginSession();
    session.payload = payload(paragraphs("Eerste poging"));
    const first = await writeSession(session, vault);

    session.payload = payload(paragraphs("Toch een andere titel"));
    const second = await writeSession(session, vault);

    expect(second.path).toBe(first.path);
    expect(second.written).toBe(true);
    expect(readFileSync(first.path!, "utf8")).toContain("title: Toch een andere titel");
  });

  it("does not collide with an existing note from the same minute", async () => {
    const one = beginSession();
    one.payload = payload(paragraphs("Zelfde titel"));
    const two = beginSession();
    two.payload = payload(paragraphs("Zelfde titel"));
    two.createdAt = one.createdAt;

    const first = await writeSession(one, vault);
    const second = await writeSession(two, vault);

    expect(second.path).not.toBe(first.path);
    expect(basename(second.path!)).toMatch(/ \(2\)\.md$/);
  });
});

/**
 * Where a brand-new note lands.
 *
 * The Inbox unless the library said otherwise. It is the library that knows which folder
 * you are standing in — the hotkey and the tray do not, and deliberately keep the Inbox —
 * and the vault root in particular was a folder the tree could select and browse but no
 * code had a way to write to.
 *
 * `newNoteFolder` is the guard on the way in. The tree only ever offers real folders, so
 * this is not about the honest case: it is about a string that arrived over IPC deciding
 * where the main process puts a file.
 */
describe("choosing the folder for a new note", () => {
  it("files into the folder the library named", async () => {
    const session = beginSession();
    session.folder = newNoteFolder("01 Projecten/Alpha");
    session.payload = payload(paragraphs("Kickoff"));

    const { path } = await writeSession(session, vault);

    expect(path!).toBe(join(vault, "01 Projecten", "Alpha", basename(path!)));
    expect(statSync(path!).isFile()).toBe(true);
  });

  it("files into the vault root itself, which nothing could reach before", async () => {
    const session = beginSession();
    session.folder = newNoteFolder("");
    session.payload = payload(paragraphs("Losse notitie"));

    const { path } = await writeSession(session, vault);

    expect(path!).toBe(join(vault, basename(path!)));
  });

  it("still uses the Inbox when nobody said otherwise", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Kickoff"));

    const { path } = await writeSession(session, vault);

    expect(path!).toContain(join(vault, INBOX));
  });

  it("falls back to the Inbox rather than climbing out of the vault", () => {
    expect(newNoteFolder("../../elders")).toBe(INBOX);
    expect(newNoteFolder("01 Projecten/../../elders")).toBe(INBOX);
    expect(newNoteFolder("/etc")).toBe(INBOX);
    expect(newNoteFolder("\\\\server\\share")).toBe(INBOX);
    expect(newNoteFolder("C:\\Windows")).toBe(INBOX);
  });

  it("refuses the trash, which is where notes go to be deleted", () => {
    expect(newNoteFolder("_trash")).toBe(INBOX);
    expect(newNoteFolder("_trash/oud")).toBe(INBOX);
  });

  it("normalises separators, since the tree speaks POSIX and Windows does not", () => {
    expect(newNoteFolder("01 Projecten\\Alpha")).toBe("01 Projecten/Alpha");
    expect(newNoteFolder("01 Projecten/")).toBe("01 Projecten");
  });
});

describe("saving a session loaded from an existing note", () => {
  const NOTE = `---
title: Kickoff project Alpha
type: quick
created: 2026-07-25T14:32:00+02:00
source: email
---

Eerste versie.
`;

  const relativePath = join(INBOX, "2026-07-25 1432 Kickoff project Alpha.md");

  /** A note already on disk, as if written by something other than this session. */
  function writeFixture(): string {
    const absolute = join(vault, relativePath);
    mkdirSync(join(vault, INBOX), { recursive: true });
    writeFileSync(absolute, NOTE);
    return absolute;
  }

  it("writes back through the note's own path, unrelated frontmatter untouched", async () => {
    const absolute = writeFixture();

    const opened = openNote(vault, relativePath)!;
    const session = loadSession(opened);
    session.payload = payload(paragraphs("Eerste versie.", "Tweede regel."), {
      created: opened.created,
    });

    const result = await writeSession(session, vault);
    expect(result.written).toBe(true);
    expect(result.path).toBe(relativePath);

    const saved = parseNote(readFileSync(absolute, "utf8"));
    expect(saved.frontmatter.title).toBe("Kickoff project Alpha");
    // `source: email` is not one of the fields the header carries, so it only survives
    // if the write goes through `saveNote`'s `...previous` spread rather than building
    // frontmatter from scratch the way a brand new note does.
    expect(saved.frontmatter.source).toBe("email");
    expect(saved.doc.textContent).toContain("Tweede regel.");
  });

  it("keeps the title pinned even if a stray subject was carried along", async () => {
    // The header hides the subject field for a loaded note (variant="reader"), but the
    // write path pins the title from the session regardless of what the field holds —
    // the same guarantee the library reader has, and for the same reason (B20).
    const absolute = writeFixture();

    const opened = openNote(vault, relativePath)!;
    const session = loadSession(opened);
    session.payload = payload(paragraphs("Bijgewerkt."), {
      subject: "Iets heel anders",
      created: opened.created,
    });

    await writeSession(session, vault);

    const saved = parseNote(readFileSync(absolute, "utf8"));
    expect(saved.frontmatter.title).toBe("Kickoff project Alpha");
  });

  it("touches nothing until an edit actually arrives", async () => {
    const absolute = writeFixture();
    const before = statSync(absolute).mtimeMs;

    const opened = openNote(vault, relativePath)!;
    const session = loadSession(opened);

    const result = await writeSession(session, vault);

    expect(result.written).toBe(false);
    expect(statSync(absolute).mtimeMs).toBe(before);
  });
});
