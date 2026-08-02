import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeIndex, openIndex, type IndexDb } from "../src/main/index-db.js";
import { parseSearchQuery } from "../src/main/search-query.js";
import { conflicts, facets, notesMatching, searchNotes } from "../src/main/vault-scan.js";

let vault: string;
let db: IndexDb;

function note(
  folder: string,
  name: string,
  options: { tags?: string; attendees?: string; body?: string; created?: string } = {},
): void {
  const front = [
    "---",
    `title: ${name}`,
    options.attendees === undefined ? "type: quick" : "type: meeting",
    `created: ${options.created ?? "2026-07-26T09:00:00+02:00"}`,
    ...(options.attendees === undefined ? [] : [`attendees: [${options.attendees}]`]),
    ...(options.tags === undefined ? [] : [`tags: [${options.tags}]`]),
    "---",
    "",
  ].join("\n");

  mkdirSync(join(vault, folder), { recursive: true });
  writeFileSync(join(vault, folder, `${name}.md`), `${front}${options.body ?? "Tekst."}\n`);
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-scan-"));
  db = openIndex(":memory:");
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  closeIndex(db);
});

describe("gathering tags and people across the vault", () => {
  it("finds tags from the frontmatter and from the body", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });
    note("10 Projects", "Twee", { body: "Zie #offerte hiervoor." });

    const { tags } = await facets(vault, db);

    expect(tags.map((tag) => tag.name).sort()).toEqual(["klantx", "offerte"]);
  });

  it("counts a note once per tag, however often it says it", async () => {
    note("00 Inbox", "Een", { body: "#klantx en nog eens #klantx en #KLANTX." });
    note("00 Inbox", "Twee", { tags: "klantx" });

    const { tags } = await facets(vault, db);

    expect(tags).toEqual([{ name: "klantx", count: 2 }]);
  });

  it("puts the busiest tag first", async () => {
    note("00 Inbox", "Een", { tags: "veel" });
    note("00 Inbox", "Twee", { tags: "veel" });
    note("00 Inbox", "Drie", { tags: "weinig" });

    const { tags } = await facets(vault, db);

    expect(tags.map((tag) => tag.name)).toEqual(["veel", "weinig"]);
  });

  it("takes people from the attendee frontmatter", async () => {
    note("00 Inbox", "Overleg", { attendees: "Jan de Vries, Els Bakker" });
    note("00 Inbox", "Nog een", { attendees: "Jan de Vries" });

    const { people } = await facets(vault, db);

    expect(people).toEqual([
      { name: "Jan de Vries", count: 2 },
      { name: "Els Bakker", count: 1 },
    ]);
  });

  it("looks in every folder, however deep", async () => {
    note("10 Projects/Klant X/Project Alpha", "Diep", { tags: "diep" });

    const { tags } = await facets(vault, db);

    expect(tags.map((tag) => tag.name)).toContain("diep");
  });

  it("ignores the trash and the folders the app owns", async () => {
    note("_trash", "Weggegooid", { tags: "weg" });
    note("_templates", "Sjabloon", { tags: "sjabloon" });
    note("00 Inbox/_incoming", "Binnen", { tags: "binnen" });
    note("00 Inbox", "Gewoon", { tags: "gewoon" });

    const { tags } = await facets(vault, db);

    expect(tags.map((tag) => tag.name)).toEqual(["gewoon"]);
  });
});

describe("filtering the note list", () => {
  it("returns the notes carrying a tag, from anywhere in the vault", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });
    note("10 Projects", "Twee", { body: "#klantx staat vooraan." });
    note("20 Areas", "Drie", { tags: "iets anders" });

    const found = await notesMatching(vault, db, { kind: "tag", name: "klantx" });

    expect(found.map((n) => n.title).sort()).toEqual(["Een", "Twee"]);
  });

  it("matches a tag regardless of casing", async () => {
    note("00 Inbox", "Een", { body: "#KlantX hier." });

    const found = await notesMatching(vault, db, { kind: "tag", name: "klantx" });

    expect(found).toHaveLength(1);
  });

  it("returns the notes a person attended", async () => {
    note("00 Inbox", "Overleg", { attendees: "Jan de Vries, Els Bakker" });
    note("00 Inbox", "Ander", { attendees: "Els Bakker" });

    const found = await notesMatching(vault, db, { kind: "person", name: "Jan de Vries" });

    expect(found.map((n) => n.title)).toEqual(["Overleg"]);
  });

  it("still reads a folder straight from disk", async () => {
    note("00 Inbox", "Een");
    note("10 Projects", "Twee");

    const found = await notesMatching(vault, db, { kind: "folder", path: "00 Inbox" });

    expect(found.map((n) => n.title)).toEqual(["Een"]);
  });

  it("finds nothing for a tag nobody uses", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });

    expect(await notesMatching(vault, db, { kind: "tag", name: "onbekend" })).toEqual([]);
  });
});

describe("excluding a not-yet-committed note", () => {
  it("leaves it out of a folder listing", async () => {
    note("00 Inbox", "Een");
    note("00 Inbox", "Twee");

    const found = await notesMatching(
      vault,
      db,
      { kind: "folder", path: "00 Inbox" },
      "00 Inbox/Twee.md",
    );

    expect(found.map((n) => n.title)).toEqual(["Een"]);
  });

  it("leaves it out of a tag/person listing", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });
    note("00 Inbox", "Twee", { tags: "klantx" });

    const found = await notesMatching(
      vault,
      db,
      { kind: "tag", name: "klantx" },
      "00 Inbox/Twee.md",
    );

    expect(found.map((n) => n.title)).toEqual(["Een"]);
  });

  it("leaves its tags and people out of the facet counts", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });
    note("00 Inbox", "Twee", { tags: "klantx" });

    const { tags } = await facets(vault, db, "00 Inbox/Twee.md");

    expect(tags).toEqual([{ name: "klantx", count: 1 }]);
  });
});

describe("keeping up with changes", () => {
  it("picks up a note added after the first scan", async () => {
    note("00 Inbox", "Een", { tags: "eerst" });
    expect((await facets(vault, db)).tags.map((t) => t.name)).toEqual(["eerst"]);

    note("00 Inbox", "Twee", { tags: "later" });

    expect((await facets(vault, db)).tags.map((t) => t.name).sort()).toEqual([
      "eerst",
      "later",
    ]);
  });

  it("drops a note that was deleted", async () => {
    note("00 Inbox", "Een", { tags: "weg" });
    await facets(vault, db);

    rmSync(join(vault, "00 Inbox", "Een.md"));

    expect((await facets(vault, db)).tags).toEqual([]);
  });

  it("re-reads a note whose contents changed", async () => {
    note("00 Inbox", "Een", { tags: "oud" });
    await facets(vault, db);

    // Same path, new contents. The size differs, so the cache must not trust itself.
    note("00 Inbox", "Een", { tags: "gloednieuw" });

    expect((await facets(vault, db)).tags.map((t) => t.name)).toEqual(["gloednieuw"]);
  });
});

describe("running a search-bar query", () => {
  it("matches free text against the body", async () => {
    note("00 Inbox", "Kickoff", { body: "Een belangrijke afspraak met de klant." });
    note("00 Inbox", "Onderhoud", { body: "Niets bijzonders." });

    const found = await searchNotes(vault, db, parseSearchQuery("belangrijke"));

    expect(found.map((n) => n.title)).toEqual(["Kickoff"]);
  });

  it("combines free text with a tag filter", async () => {
    note("00 Inbox", "Een", { tags: "klantx", body: "Kickoff voor het project." });
    note("00 Inbox", "Twee", { tags: "klanty", body: "Kickoff voor iets anders." });

    const found = await searchNotes(vault, db, parseSearchQuery("kickoff tag:klantx"));

    expect(found.map((n) => n.title)).toEqual(["Een"]);
  });

  it("filters by type alone, with no free text to rank by", async () => {
    note("00 Inbox", "Snel", {});
    note("00 Inbox", "Overleg", { attendees: "Jan de Vries" });

    const found = await searchNotes(vault, db, parseSearchQuery("type:meeting"));

    expect(found.map((n) => n.title)).toEqual(["Overleg"]);
  });

  it("filters by attendee, case- and accent-insensitively", async () => {
    note("00 Inbox", "Een", { attendees: "Jan de Vries" });
    note("00 Inbox", "Twee", { attendees: "Marieke" });

    const found = await searchNotes(vault, db, parseSearchQuery('attendee:"jan de vries"'));

    expect(found.map((n) => n.title)).toEqual(["Een"]);
  });

  it("filters by a date range on the created date, inclusive of both ends", async () => {
    note("00 Inbox", "Te vroeg", { created: "2025-12-31T09:00:00+02:00" });
    note("00 Inbox", "Op de grens vroeg", { created: "2026-01-01T09:00:00+02:00" });
    note("00 Inbox", "Ertussenin", { created: "2026-06-15T09:00:00+02:00" });
    note("00 Inbox", "Op de grens laat", { created: "2026-12-31T09:00:00+02:00" });
    note("00 Inbox", "Te laat", { created: "2027-01-01T09:00:00+02:00" });

    const found = await searchNotes(
      vault,
      db,
      parseSearchQuery("after:2026-01-01 before:2026-12-31"),
    );

    expect(found.map((n) => n.title).sort()).toEqual([
      "Ertussenin",
      "Op de grens laat",
      "Op de grens vroeg",
    ]);
  });

  it("restricts to a folder scope and its subfolders when given one", async () => {
    note("00 Inbox", "Binnen");
    note("10 Projects/Klant X", "Ook binnen");
    note("20 Areas", "Buiten");

    const found = await searchNotes(vault, db, parseSearchQuery(""), { scope: "10 Projects" });

    expect(found.map((n) => n.title).sort()).toEqual(["Ook binnen"]);
  });

  it("excludes a given path, same as facets and notesMatching do", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });
    note("00 Inbox", "Twee", { tags: "klantx" });

    const found = await searchNotes(vault, db, parseSearchQuery("tag:klantx"), {
      excludePath: "00 Inbox/Twee.md",
    });

    expect(found.map((n) => n.title)).toEqual(["Een"]);
  });

  it("returns every note for a completely blank query, same rule as a filter with no free text", async () => {
    // Not a special case: "no free text" always falls back to the full note set for
    // filters to narrow, so an entirely blank query (no text, no filters) inherits
    // "everything" from the same rule the type/tag/attendee-only tests above rely on,
    // rather than a separate "blank means nothing" carve-out that would make clearing
    // the last filter jump straight from "some notes" to zero instead of to "all notes".
    note("00 Inbox", "Een");
    note("00 Inbox", "Twee");

    const found = await searchNotes(vault, db, parseSearchQuery(""));

    expect(found.map((n) => n.title).sort()).toEqual(["Een", "Twee"]);
  });
});

describe("finding OneDrive conflicts from the index", () => {
  it("pairs a machine-suffixed copy with its original", async () => {
    note("00 Inbox", "Kickoff");
    note("00 Inbox", "Kickoff-LAPTOP-ABC123");

    const found = await conflicts(vault, db);

    expect(found).toEqual([
      {
        original: "00 Inbox/Kickoff.md",
        conflict: "00 Inbox/Kickoff-LAPTOP-ABC123.md",
      },
    ]);
  });

  it("finds nothing when there is no conflict", async () => {
    note("00 Inbox", "Een");
    note("00 Inbox", "Twee");

    expect(await conflicts(vault, db)).toEqual([]);
  });
});
