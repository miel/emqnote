import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { facets, invalidate, notesMatching } from "../src/main/vault-scan.js";

let vault: string;

function note(
  folder: string,
  name: string,
  options: { tags?: string; attendees?: string; body?: string } = {},
): void {
  const front = [
    "---",
    `title: ${name}`,
    options.attendees === undefined ? "type: quick" : "type: meeting",
    "created: 2026-07-26T09:00:00+02:00",
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
  invalidate();
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

describe("gathering tags and people across the vault", () => {
  it("finds tags from the frontmatter and from the body", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });
    note("10 Projects", "Twee", { body: "Zie #offerte hiervoor." });

    const { tags } = await facets(vault);

    expect(tags.map((tag) => tag.name).sort()).toEqual(["klantx", "offerte"]);
  });

  it("counts a note once per tag, however often it says it", async () => {
    note("00 Inbox", "Een", { body: "#klantx en nog eens #klantx en #KLANTX." });
    note("00 Inbox", "Twee", { tags: "klantx" });

    const { tags } = await facets(vault);

    expect(tags).toEqual([{ name: "klantx", count: 2 }]);
  });

  it("puts the busiest tag first", async () => {
    note("00 Inbox", "Een", { tags: "veel" });
    note("00 Inbox", "Twee", { tags: "veel" });
    note("00 Inbox", "Drie", { tags: "weinig" });

    const { tags } = await facets(vault);

    expect(tags.map((tag) => tag.name)).toEqual(["veel", "weinig"]);
  });

  it("takes people from the attendee frontmatter", async () => {
    note("00 Inbox", "Overleg", { attendees: "Jan de Vries, Els Bakker" });
    note("00 Inbox", "Nog een", { attendees: "Jan de Vries" });

    const { people } = await facets(vault);

    expect(people).toEqual([
      { name: "Jan de Vries", count: 2 },
      { name: "Els Bakker", count: 1 },
    ]);
  });

  it("looks in every folder, however deep", async () => {
    note("10 Projects/Klant X/Project Alpha", "Diep", { tags: "diep" });

    const { tags } = await facets(vault);

    expect(tags.map((tag) => tag.name)).toContain("diep");
  });

  it("ignores the trash and the folders the app owns", async () => {
    note("_trash", "Weggegooid", { tags: "weg" });
    note("_templates", "Sjabloon", { tags: "sjabloon" });
    note("00 Inbox/_incoming", "Binnen", { tags: "binnen" });
    note("00 Inbox", "Gewoon", { tags: "gewoon" });

    const { tags } = await facets(vault);

    expect(tags.map((tag) => tag.name)).toEqual(["gewoon"]);
  });
});

describe("filtering the note list", () => {
  it("returns the notes carrying a tag, from anywhere in the vault", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });
    note("10 Projects", "Twee", { body: "#klantx staat vooraan." });
    note("20 Areas", "Drie", { tags: "iets anders" });

    const found = await notesMatching(vault, { kind: "tag", name: "klantx" });

    expect(found.map((n) => n.title).sort()).toEqual(["Een", "Twee"]);
  });

  it("matches a tag regardless of casing", async () => {
    note("00 Inbox", "Een", { body: "#KlantX hier." });

    const found = await notesMatching(vault, { kind: "tag", name: "klantx" });

    expect(found).toHaveLength(1);
  });

  it("returns the notes a person attended", async () => {
    note("00 Inbox", "Overleg", { attendees: "Jan de Vries, Els Bakker" });
    note("00 Inbox", "Ander", { attendees: "Els Bakker" });

    const found = await notesMatching(vault, { kind: "person", name: "Jan de Vries" });

    expect(found.map((n) => n.title)).toEqual(["Overleg"]);
  });

  it("still reads a folder straight from disk", async () => {
    note("00 Inbox", "Een");
    note("10 Projects", "Twee");

    const found = await notesMatching(vault, { kind: "folder", path: "00 Inbox" });

    expect(found.map((n) => n.title)).toEqual(["Een"]);
  });

  it("finds nothing for a tag nobody uses", async () => {
    note("00 Inbox", "Een", { tags: "klantx" });

    expect(await notesMatching(vault, { kind: "tag", name: "onbekend" })).toEqual([]);
  });
});

describe("keeping up with changes", () => {
  it("picks up a note added after the first scan", async () => {
    note("00 Inbox", "Een", { tags: "eerst" });
    expect((await facets(vault)).tags.map((t) => t.name)).toEqual(["eerst"]);

    note("00 Inbox", "Twee", { tags: "later" });

    expect((await facets(vault)).tags.map((t) => t.name).sort()).toEqual(["eerst", "later"]);
  });

  it("drops a note that was deleted", async () => {
    note("00 Inbox", "Een", { tags: "weg" });
    await facets(vault);

    rmSync(join(vault, "00 Inbox", "Een.md"));

    expect((await facets(vault)).tags).toEqual([]);
  });

  it("re-reads a note whose contents changed", async () => {
    note("00 Inbox", "Een", { tags: "oud" });
    await facets(vault);

    // Same path, new contents. The size differs, so the cache must not trust itself.
    note("00 Inbox", "Een", { tags: "gloednieuw" });

    expect((await facets(vault)).tags.map((t) => t.name)).toEqual(["gloednieuw"]);
  });
});
