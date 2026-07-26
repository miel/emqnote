import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginSession, writeSession } from "../src/main/capture-store.js";
import { parseNote } from "../src/markdown/index.js";
import { INBOX } from "../src/main/vault.js";
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

  it("leaves meeting fields out of a quick note", async () => {
    const session = beginSession();
    session.payload = payload(paragraphs("Snelle gedachte"), {
      location: "Teams",
      attendees: ["Iemand"],
    });

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
