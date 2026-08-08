import Database from "better-sqlite3";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allLinks,
  allNotes,
  closeIndex,
  linksFrom,
  deleteNote,
  deleteNotesUnder,
  getNote,
  needsRefresh,
  openIndex,
  search,
  tasksIn,
  upsertNote,
  type IndexDb,
  type NoteRecord,
} from "../src/main/index-db.js";

function record(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    path: "00 Inbox/Kickoff project Alpha.md",
    fileName: "Kickoff project Alpha.md",
    title: "Kickoff project Alpha",
    type: "meeting",
    created: "2026-07-25T14:32:00+02:00",
    modified: "2026-07-25T14:32:00+02:00",
    location: "Teams",
    attendees: ["Jan de Vries"],
    tags: ["klantx"],
    excerpt: "Kickoff met de klant over project Alpha.",
    mtime: 1_000,
    size: 200,
    hash: "abc123",
    body: "Kickoff met de klant over project Alpha.",
    tasks: [],
    links: [],
    ...overrides,
  };
}

describe("the SQLite index", () => {
  let db: IndexDb;

  beforeEach(() => {
    db = openIndex(":memory:");
  });

  afterEach(() => {
    closeIndex(db);
  });

  it("returns null for a note that was never indexed", () => {
    expect(getNote(db, "nowhere.md")).toBeNull();
  });

  it("round-trips a note's metadata, including arrays", () => {
    upsertNote(db, record());

    expect(getNote(db, "00 Inbox/Kickoff project Alpha.md")).toEqual({
      path: "00 Inbox/Kickoff project Alpha.md",
      fileName: "Kickoff project Alpha.md",
      title: "Kickoff project Alpha",
      type: "meeting",
      created: "2026-07-25T14:32:00+02:00",
      modified: "2026-07-25T14:32:00+02:00",
      location: "Teams",
      attendees: ["Jan de Vries"],
      tags: ["klantx"],
      excerpt: "Kickoff met de klant over project Alpha.",
      mtime: 1_000,
      size: 200,
      hash: "abc123",
    });
  });

  it("does not return the indexed body from a metadata read", () => {
    upsertNote(db, record());
    const note = getNote(db, "00 Inbox/Kickoff project Alpha.md") as unknown as Record<
      string,
      unknown
    >;
    expect(note.body).toBeUndefined();
  });

  it("replaces a note on a second upsert rather than duplicating it", () => {
    upsertNote(db, record());
    upsertNote(db, record({ title: "Kickoff project Alpha (bijgewerkt)", mtime: 2_000 }));

    expect(allNotes(db)).toHaveLength(1);
    expect(getNote(db, "00 Inbox/Kickoff project Alpha.md")?.title).toBe(
      "Kickoff project Alpha (bijgewerkt)",
    );
  });

  it("removes a note from both metadata and search on delete", () => {
    upsertNote(db, record());
    deleteNote(db, "00 Inbox/Kickoff project Alpha.md");

    expect(getNote(db, "00 Inbox/Kickoff project Alpha.md")).toBeNull();
    expect(search(db, "kickoff")).toEqual([]);
  });

  it("lists every note, sorted by path", () => {
    upsertNote(db, record({ path: "00 Inbox/Twee.md", title: "Twee" }));
    upsertNote(db, record({ path: "00 Inbox/Een.md", title: "Een" }));

    expect(allNotes(db).map((note) => note.path)).toEqual([
      "00 Inbox/Een.md",
      "00 Inbox/Twee.md",
    ]);
  });

  describe("needsRefresh", () => {
    it("is true for a note that was never indexed", () => {
      expect(needsRefresh(db, "new.md", 1_000, 200)).toBe(true);
    });

    it("is false when mtime and size both match the stored row", () => {
      upsertNote(db, record());
      expect(needsRefresh(db, record().path, 1_000, 200)).toBe(false);
    });

    it("is true when either mtime or size has moved", () => {
      upsertNote(db, record());
      expect(needsRefresh(db, record().path, 1_001, 200)).toBe(true);
      expect(needsRefresh(db, record().path, 1_000, 201)).toBe(true);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      upsertNote(
        db,
        record({
          path: "00 Inbox/Kickoff.md",
          title: "Kickoff project Alpha",
          attendees: ["Jan de Vries"],
          tags: ["klantx"],
          body: "Kickoff met de klant over project Alpha.",
        }),
      );
      upsertNote(
        db,
        record({
          path: "00 Inbox/Offerte.md",
          title: "Offerte voor klant Bravo",
          attendees: ["Marieke"],
          tags: ["klanty"],
          body: "Concept-offerte, nog te versturen.",
        }),
      );
      upsertNote(
        db,
        record({
          path: "00 Inbox/Onderhoud.md",
          title: "Onderhoudsvenster",
          attendees: [],
          tags: [],
          body: "Geen enkele relatie tot de andere twee notities.",
        }),
      );
    });

    it("returns nothing for a blank query rather than every note", () => {
      expect(search(db, "")).toEqual([]);
      expect(search(db, "   ")).toEqual([]);
    });

    it("matches on a body word", () => {
      expect(search(db, "kickoff")).toEqual(["00 Inbox/Kickoff.md"]);
    });

    it("matches as a prefix, for results while typing", () => {
      expect(search(db, "offer")).toEqual(["00 Inbox/Offerte.md"]);
    });

    it("matches a tag or an attendee", () => {
      expect(search(db, "klantx")).toEqual(["00 Inbox/Kickoff.md"]);
      expect(search(db, "Marieke")).toEqual(["00 Inbox/Offerte.md"]);
    });

    it("requires every word, in any order — not a strict phrase", () => {
      // "klant" precedes "project" in Kickoff's body but follows "Alpha" in its title;
      // a query for both words must not depend on which of the two it happens to match.
      expect(search(db, "project klant")).toEqual(["00 Inbox/Kickoff.md"]);
      expect(search(db, "klant offerte")).toEqual(["00 Inbox/Offerte.md"]);
    });

    it("does not throw on FTS5 syntax characters typed into the box", () => {
      expect(() => search(db, 'quote " and * and AND -')).not.toThrow();
    });

    it("finds a literal quote character in the query", () => {
      upsertNote(
        db,
        record({
          path: "00 Inbox/Aanhaling.md",
          title: 'Een titel met "aanhalingstekens"',
          body: 'Tekst met "aanhalingstekens" erin.',
        }),
      );
      expect(search(db, '"aanhalingstekens"')).toEqual(["00 Inbox/Aanhaling.md"]);
    });
  });

  describe("note_tasks", () => {
    it("appears with an upsert and is readable through tasksIn", () => {
      upsertNote(
        db,
        record({
          tasks: [
            { ordinal: 0, checked: false, text: "Offerte versturen" },
            { ordinal: 1, checked: true, text: "Kickoff plannen" },
          ],
        }),
      );

      expect(tasksIn(db, "", false)).toEqual([
        {
          path: "00 Inbox/Kickoff project Alpha.md",
          title: "Kickoff project Alpha",
          ordinal: 0,
          checked: false,
          text: "Offerte versturen",
        },
        {
          path: "00 Inbox/Kickoff project Alpha.md",
          title: "Kickoff project Alpha",
          ordinal: 1,
          checked: true,
          text: "Kickoff plannen",
        },
      ]);
    });

    it("replaces the previous rows on a second upsert rather than appending to them", () => {
      upsertNote(db, record({ tasks: [{ ordinal: 0, checked: false, text: "Eerste versie" }] }));
      upsertNote(db, record({ tasks: [{ ordinal: 0, checked: false, text: "Tweede versie" }] }));

      const rows = tasksIn(db, "", false);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.text).toBe("Tweede versie");
    });

    it("drops every task row when a note loses them all", () => {
      upsertNote(db, record({ tasks: [{ ordinal: 0, checked: false, text: "Iets doen" }] }));
      upsertNote(db, record({ tasks: [] }));

      expect(tasksIn(db, "", false)).toEqual([]);
    });

    it("disappears on delete along with the note", () => {
      upsertNote(db, record({ tasks: [{ ordinal: 0, checked: false, text: "Iets doen" }] }));
      deleteNote(db, record().path);

      expect(tasksIn(db, "", false)).toEqual([]);
    });

    it("only shows open tasks when asked for open only", () => {
      upsertNote(
        db,
        record({
          tasks: [
            { ordinal: 0, checked: false, text: "Openstaand" },
            { ordinal: 1, checked: true, text: "Al gedaan" },
          ],
        }),
      );

      expect(tasksIn(db, "", true).map((row) => row.text)).toEqual(["Openstaand"]);
    });

    it("scopes to a folder and everything nested under it", () => {
      upsertNote(
        db,
        record({
          path: "10 Projects/Klant X/Kickoff.md",
          tasks: [{ ordinal: 0, checked: false, text: "Binnen de scope" }],
        }),
      );
      upsertNote(
        db,
        record({
          path: "20 Areas/Iets.md",
          tasks: [{ ordinal: 0, checked: false, text: "Buiten de scope" }],
        }),
      );

      expect(tasksIn(db, "10 Projects", false).map((row) => row.text)).toEqual([
        "Binnen de scope",
      ]);
    });

    it("treats an empty scope as the whole vault, same as the root case elsewhere", () => {
      upsertNote(
        db,
        record({
          path: "10 Projects/Klant X/Kickoff.md",
          tasks: [{ ordinal: 0, checked: false, text: "Overal" }],
        }),
      );

      expect(tasksIn(db, "", false)).toHaveLength(1);
    });
  });

  describe("note_links", () => {
    it("appears with an upsert and is readable back per note", () => {
      upsertNote(
        db,
        record({
          path: "00 Inbox/Kickoff.md",
          links: [
            { target: "01 Projecten/Rules", alias: "Rules" },
            { target: "Losse aantekening", alias: null },
          ],
        }),
      );

      expect(linksFrom(db, "00 Inbox/Kickoff.md")).toEqual([
        { fromPath: "00 Inbox/Kickoff.md", target: "01 Projecten/Rules", alias: "Rules" },
        { fromPath: "00 Inbox/Kickoff.md", target: "Losse aantekening", alias: null },
      ]);
    });

    it("keeps the same link twice, since a note may genuinely carry it twice", () => {
      upsertNote(
        db,
        record({
          path: "00 Inbox/Kickoff.md",
          links: [
            { target: "Rules", alias: null },
            { target: "Rules", alias: "de regels" },
          ],
        }),
      );

      expect(linksFrom(db, "00 Inbox/Kickoff.md")).toHaveLength(2);
    });

    it("replaces the whole set on a re-upsert, so a removed link leaves no row behind", () => {
      upsertNote(db, record({ path: "a.md", links: [{ target: "Rules", alias: null }] }));
      upsertNote(db, record({ path: "a.md", links: [] }));

      expect(linksFrom(db, "a.md")).toEqual([]);
      expect(allLinks(db)).toEqual([]);
    });

    it("goes away with the note", () => {
      upsertNote(db, record({ path: "a.md", links: [{ target: "Rules", alias: null }] }));
      deleteNote(db, "a.md");

      expect(allLinks(db)).toEqual([]);
    });

    it("reads the whole vault's links in one go, ordered by the note they sit in", () => {
      upsertNote(db, record({ path: "b.md", links: [{ target: "Rules", alias: null }] }));
      upsertNote(db, record({ path: "a.md", links: [{ target: "Kickoff", alias: null }] }));

      expect(allLinks(db).map((row) => row.fromPath)).toEqual(["a.md", "b.md"]);
    });
  });

  describe("deleteNotesUnder", () => {
    it("removes every note under a folder and everything nested beneath it", () => {
      upsertNote(db, record({ path: "10 Projects/a.md", title: "A" }));
      upsertNote(db, record({ path: "10 Projects/sub/b.md", title: "B" }));

      const removed = deleteNotesUnder(db, "10 Projects");

      expect(removed.sort()).toEqual(["10 Projects/a.md", "10 Projects/sub/b.md"]);
      expect(getNote(db, "10 Projects/a.md")).toBeNull();
      expect(getNote(db, "10 Projects/sub/b.md")).toBeNull();
    });

    // The exact case a `LIKE`/`GLOB` match would get wrong: "10 Projects Archive" and
    // "00 Inbox" both start with characters `LIKE`'s `_`/`GLOB`'s `[` could be talked
    // into matching, or that merely share a text prefix with "10 Projects" without
    // being inside it — neither should be touched by deleting "10 Projects".
    it("does not touch a folder that merely shares a name prefix, or an unrelated one", () => {
      upsertNote(db, record({ path: "10 Projects/a.md", title: "A" }));
      upsertNote(db, record({ path: "10 Projects Archive/c.md", title: "C" }));
      upsertNote(db, record({ path: "00 Inbox/d.md", title: "D" }));

      const removed = deleteNotesUnder(db, "10 Projects");

      expect(removed).toEqual(["10 Projects/a.md"]);
      expect(getNote(db, "10 Projects Archive/c.md")).not.toBeNull();
      expect(getNote(db, "00 Inbox/d.md")).not.toBeNull();
    });

    it("drops the FTS, note_tasks and note_links rows along with each note, not just the metadata", () => {
      upsertNote(
        db,
        record({
          path: "10 Projects/Kickoff.md",
          title: "Kickoff project Alpha",
          body: "Kickoff met de klant over project Alpha.",
          tasks: [{ ordinal: 0, checked: false, text: "Offerte versturen" }],
          links: [{ target: "Rules", alias: null }],
        }),
      );

      deleteNotesUnder(db, "10 Projects");

      expect(search(db, "kickoff")).toEqual([]);
      expect(tasksIn(db, "", false)).toEqual([]);
      expect(allLinks(db)).toEqual([]);
    });

    it("removes nothing for an empty prefix — that is not 'the whole vault' here", () => {
      upsertNote(db, record({ path: "00 Inbox/a.md" }));
      upsertNote(db, record({ path: "10 Projects/b.md" }));

      const removed = deleteNotesUnder(db, "");

      expect(removed).toEqual([]);
      expect(allNotes(db)).toHaveLength(2);
    });
  });

  describe("schema versioning", () => {
    it("rebuilds a database left at a stale schema version instead of reading it", () => {
      const path = join(mkdtempSync(join(tmpdir(), "emqnote-index-db-")), "index.db");

      // A database from before `note_tasks` existed: `user_version` still at its default
      // of 0, and a `notes` row already in it — the shape `openIndex` would have produced
      // before this feature landed.
      const stale = new Database(path);
      stale.exec(`
        CREATE TABLE notes (
          path TEXT PRIMARY KEY,
          fileName TEXT NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          created TEXT NOT NULL,
          modified TEXT NOT NULL,
          location TEXT NOT NULL,
          attendees TEXT NOT NULL,
          tags TEXT NOT NULL,
          excerpt TEXT NOT NULL,
          mtime REAL NOT NULL,
          size INTEGER NOT NULL,
          hash TEXT NOT NULL
        );
      `);
      stale
        .prepare(
          `INSERT INTO notes (path, fileName, title, type, created, modified, location, attendees, tags, excerpt, mtime, size, hash)
           VALUES ('oud.md', 'oud.md', 'Oud', 'quick', '', '', '', '[]', '[]', '', 1, 1, 'x')`,
        )
        .run();
      stale.close();

      const reopened = openIndex(path);
      try {
        // Dropped and rebuilt from nothing rather than read as-is — a stale index is a
        // derived cache (B9), so losing its old rows costs one rescan and nothing else,
        // and this proves it did not simply `ALTER TABLE` the old `notes` in place.
        expect(allNotes(reopened)).toEqual([]);
        expect(reopened.pragma("user_version", { simple: true })).toBeGreaterThan(0);

        // The rebuilt schema actually has `note_tasks` and `note_links` this time.
        upsertNote(
          reopened,
          record({
            tasks: [{ ordinal: 0, checked: false, text: "Nieuw" }],
            links: [{ target: "Rules", alias: null }],
          }),
        );
        expect(tasksIn(reopened, "", false)).toHaveLength(1);
        expect(allLinks(reopened)).toHaveLength(1);
      } finally {
        closeIndex(reopened);
        rmSync(path, { force: true });
        rmSync(`${path}-wal`, { force: true });
        rmSync(`${path}-shm`, { force: true });
      }
    });

    /**
     * The case B35 had to bump the version for. An index at version 1 has every note in
     * it and a correct `note_tasks`, so `needsRefresh` will re-read *nothing* on the next
     * scan — meaning it would carry no links at all, silently and permanently, and a move
     * would leave every link to the moved note pointing at where it used to be.
     */
    it("rebuilds an index left at version 1, which has notes but can never gain links", () => {
      const path = join(mkdtempSync(join(tmpdir(), "emqnote-index-db-")), "index.db");

      const first = openIndex(path);
      upsertNote(first, record({ links: [{ target: "Rules", alias: null }] }));
      // Wind it back to what an index built before `note_links` existed looked like.
      first.exec(`DROP TABLE note_links`);
      first.pragma("user_version = 1");
      closeIndex(first);

      const reopened = openIndex(path);
      try {
        expect(allNotes(reopened)).toEqual([]);
        expect(allLinks(reopened)).toEqual([]);

        upsertNote(reopened, record({ links: [{ target: "Rules", alias: null }] }));
        expect(allLinks(reopened)).toHaveLength(1);
      } finally {
        closeIndex(reopened);
        rmSync(path, { force: true });
        rmSync(`${path}-wal`, { force: true });
        rmSync(`${path}-shm`, { force: true });
      }
    });

    it("does not rebuild an index already at the current version", () => {
      const path = join(mkdtempSync(join(tmpdir(), "emqnote-index-db-")), "index.db");

      const first = openIndex(path);
      upsertNote(first, record());
      closeIndex(first);

      const second = openIndex(path);
      try {
        expect(allNotes(second)).toHaveLength(1);
      } finally {
        closeIndex(second);
        rmSync(path, { force: true });
        rmSync(`${path}-wal`, { force: true });
        rmSync(`${path}-shm`, { force: true });
      }
    });
  });
});
