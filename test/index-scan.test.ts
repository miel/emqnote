import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allNotes, closeIndex, getNote, openIndex, search, upsertNote, type IndexDb } from "../src/main/index-db.js";
import { fullScan } from "../src/main/index-scan.js";

let vault: string;
let db: IndexDb;

function note(
  folder: string,
  name: string,
  options: {
    tags?: string;
    attendees?: string;
    location?: string;
    body?: string;
  } = {},
): void {
  const front = [
    "---",
    `title: ${name}`,
    options.attendees === undefined ? "type: quick" : "type: meeting",
    "created: 2026-07-26T09:00:00+02:00",
    ...(options.location === undefined ? [] : [`location: ${options.location}`]),
    ...(options.attendees === undefined ? [] : [`attendees: [${options.attendees}]`]),
    ...(options.tags === undefined ? [] : [`tags: [${options.tags}]`]),
    "---",
    "",
  ].join("\n");

  mkdirSync(join(vault, folder), { recursive: true });
  writeFileSync(join(vault, folder, `${name}.md`), `${front}${options.body ?? "Tekst."}\n`);
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-index-scan-"));
  db = openIndex(":memory:");
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  closeIndex(db);
});

describe("the full scan", () => {
  it("indexes every note it finds, with its metadata", async () => {
    note("00 Inbox", "Overleg", {
      attendees: "Jan de Vries",
      tags: "klantx",
      location: "Teams",
      body: "Notulen van het overleg.",
    });

    const result = await fullScan(vault, db);

    expect(result).toBe("ok");
    expect(getNote(db, "00 Inbox/Overleg.md")).toMatchObject({
      title: "Overleg",
      type: "meeting",
      created: "2026-07-26T09:00:00+02:00",
      location: "Teams",
      attendees: ["Jan de Vries"],
      tags: ["klantx"],
    });
  });

  it("makes the body searchable, markdown syntax stripped", async () => {
    note("00 Inbox", "Kickoff", { body: "# Kickoff\n\nEen **belangrijke** afspraak." });

    await fullScan(vault, db);

    expect(search(db, "belangrijke")).toEqual(["00 Inbox/Kickoff.md"]);
  });

  it("looks in every folder, however deep", async () => {
    note("10 Projects/Klant X/Project Alpha", "Diep", { tags: "diep" });

    await fullScan(vault, db);

    expect(allNotes(db).map((n) => n.path)).toEqual(["10 Projects/Klant X/Project Alpha/Diep.md"]);
  });

  it("ignores the trash and the folders the app owns", async () => {
    note("_trash", "Weggegooid");
    note("_templates", "Sjabloon");
    note("00 Inbox/_incoming", "Binnen");
    note("00 Inbox", "Gewoon");

    await fullScan(vault, db);

    expect(allNotes(db).map((n) => n.path)).toEqual(["00 Inbox/Gewoon.md"]);
  });

  it("removes a note from the index once its file is gone", async () => {
    note("00 Inbox", "Een");
    note("00 Inbox", "Twee");
    await fullScan(vault, db);
    expect(allNotes(db)).toHaveLength(2);

    rmSync(join(vault, "00 Inbox", "Twee.md"));
    await fullScan(vault, db);

    expect(allNotes(db).map((n) => n.path)).toEqual(["00 Inbox/Een.md"]);
  });

  it("re-indexes a note whose contents changed", async () => {
    note("00 Inbox", "Een", { tags: "oud" });
    await fullScan(vault, db);

    // Same path, new contents — the size differs, so mtime+size can't be trusted alone.
    note("00 Inbox", "Een", { tags: "gloednieuw" });
    await fullScan(vault, db);

    expect(getNote(db, "00 Inbox/Een.md")?.tags).toEqual(["gloednieuw"]);
  });

  it("does not re-read a file whose mtime and size have not changed", async () => {
    note("00 Inbox", "Een", { tags: "origineel" });
    await fullScan(vault, db);

    // Tamper with the indexed row directly, the way a real content change would show up,
    // but *without* touching the file on disk. If the scan skips the read because
    // mtime+size still match, this tampered value survives a second scan untouched.
    const indexed = getNote(db, "00 Inbox/Een.md")!;
    upsertNote(db, {
      ...indexed,
      tags: ["getampered"],
      hash: "not-the-real-hash",
      body: "",
      tasks: [],
    });

    await fullScan(vault, db);

    expect(getNote(db, "00 Inbox/Een.md")?.tags).toEqual(["getampered"]);
  });

  it("reports progress across the files it walks", async () => {
    note("00 Inbox", "Een");
    note("00 Inbox", "Twee");
    note("00 Inbox", "Drie");

    const seen: { done: number; total: number }[] = [];
    await fullScan(vault, db, (progress) => seen.push({ ...progress }));

    expect(seen).toHaveLength(3);
    expect(seen.every((p) => p.total === 3)).toBe(true);
    expect(seen.map((p) => p.done)).toEqual([1, 2, 3]);
  });

  it("reindexes cleanly on repeated scans of an unchanged vault", async () => {
    note("00 Inbox", "Een", { tags: "stabiel" });
    await fullScan(vault, db);
    await fullScan(vault, db);
    await fullScan(vault, db);

    expect(allNotes(db)).toHaveLength(1);
    expect(getNote(db, "00 Inbox/Een.md")?.tags).toEqual(["stabiel"]);
  });
});
