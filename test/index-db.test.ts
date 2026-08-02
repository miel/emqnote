import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  allNotes,
  closeIndex,
  deleteNote,
  getNote,
  needsRefresh,
  openIndex,
  search,
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
});
