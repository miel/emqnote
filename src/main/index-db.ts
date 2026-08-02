import Database from "better-sqlite3";

/**
 * The SQLite index behind phase 5 search — `02-technisch-ontwerp.md` §7.1/§7.2.
 *
 * Deliberately free of Electron so it can be opened against a real file or `:memory:`
 * and tested directly, the same reasoning as `vault-io.ts` and `vault-scan.ts`. This
 * module only knows how to hold and query rows; walking the vault to fill it, watching
 * for changes, and the search bar's query syntax are separate, still to come.
 *
 * B9: this file lives in the local app-data folder, never in the vault. A SQLite
 * database that OneDrive tries to sync between two machines mid-write is a corrupted
 * database — the caller decides the path, this module never assumes one.
 */

export interface NoteRecord {
  path: string;
  title: string;
  type: string;
  created: string;
  modified: string;
  location: string;
  attendees: string[];
  tags: string[];
  /** `stat().mtimeMs`, for the cheap refresh check `02-technisch-ontwerp.md` §7.2 wants. */
  mtime: number;
  size: number;
  /** Content hash, so a mtime bump with unchanged bytes (a plain OneDrive touch) is not mistaken for a real edit. */
  hash: string;
  /** Plain text — see `src/markdown/plain-text.ts` — for FTS5 to index; not returned by queries. */
  body: string;
}

/** A stored row without `body`: what every read returns, since nothing reads the indexed text back out. */
export type NoteMeta = Omit<NoteRecord, "body">;

export type IndexDb = Database.Database;

/**
 * One search-only virtual table rather than the `content=''` "contentless" table
 * `02-technisch-ontwerp.md` sketches: a contentless FTS5 table cannot run a plain
 * `DELETE`/`UPDATE` by rowid — it needs the *old* column values supplied back to it to
 * unwind the index correctly, which means either keeping a second copy of them around
 * for exactly that purpose or reusing `notes`' own rowid space and keeping two tables'
 * rowids in lockstep by hand. Storing `path` itself as an `UNINDEXED` column and using
 * it as the join/lookup key sidesteps both: every write is a plain delete-then-insert
 * keyed by a value we already have, and disk cost is one extra small TEXT column,
 * irrelevant at a personal vault's scale. If that scale assumption stops holding this is
 * the first place to revisit, not before.
 */
function migrate(db: IndexDb): void {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      created TEXT NOT NULL,
      modified TEXT NOT NULL,
      location TEXT NOT NULL,
      attendees TEXT NOT NULL,
      tags TEXT NOT NULL,
      mtime REAL NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      path UNINDEXED,
      title,
      body,
      attendees,
      tags,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
}

export function openIndex(path: string): IndexDb {
  const db = new Database(path);
  migrate(db);
  return db;
}

export function closeIndex(db: IndexDb): void {
  db.close();
}

const upsertNoteStatements = (db: IndexDb) => ({
  note: db.prepare(`
    INSERT INTO notes (path, title, type, created, modified, location, attendees, tags, mtime, size, hash)
    VALUES (@path, @title, @type, @created, @modified, @location, @attendees, @tags, @mtime, @size, @hash)
    ON CONFLICT(path) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      created = excluded.created,
      modified = excluded.modified,
      location = excluded.location,
      attendees = excluded.attendees,
      tags = excluded.tags,
      mtime = excluded.mtime,
      size = excluded.size,
      hash = excluded.hash
  `),
  deleteFts: db.prepare(`DELETE FROM notes_fts WHERE path = ?`),
  insertFts: db.prepare(`
    INSERT INTO notes_fts (path, title, body, attendees, tags)
    VALUES (@path, @title, @body, @attendees, @tags)
  `),
});

/** Inserts or replaces one note. A single transaction, so a search never sees the metadata row without its FTS entry or the other way round. */
export function upsertNote(db: IndexDb, record: NoteRecord): void {
  const statements = upsertNoteStatements(db);
  const row = {
    path: record.path,
    title: record.title,
    type: record.type,
    created: record.created,
    modified: record.modified,
    location: record.location,
    attendees: JSON.stringify(record.attendees),
    tags: JSON.stringify(record.tags),
    mtime: record.mtime,
    size: record.size,
    hash: record.hash,
  };

  db.transaction(() => {
    statements.note.run(row);
    statements.deleteFts.run(record.path);
    statements.insertFts.run({ ...row, body: record.body });
  })();
}

export function deleteNote(db: IndexDb, path: string): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM notes WHERE path = ?`).run(path);
    db.prepare(`DELETE FROM notes_fts WHERE path = ?`).run(path);
  })();
}

interface StoredRow {
  path: string;
  title: string;
  type: string;
  created: string;
  modified: string;
  location: string;
  attendees: string;
  tags: string;
  mtime: number;
  size: number;
  hash: string;
}

function toMeta(row: StoredRow): NoteMeta {
  return {
    path: row.path,
    title: row.title,
    type: row.type,
    created: row.created,
    modified: row.modified,
    location: row.location,
    attendees: JSON.parse(row.attendees) as string[],
    tags: JSON.parse(row.tags) as string[],
    mtime: row.mtime,
    size: row.size,
    hash: row.hash,
  };
}

export function getNote(db: IndexDb, path: string): NoteMeta | null {
  const row = db.prepare(`SELECT * FROM notes WHERE path = ?`).get(path) as
    | StoredRow
    | undefined;
  return row === undefined ? null : toMeta(row);
}

export function allNotes(db: IndexDb): NoteMeta[] {
  const rows = db.prepare(`SELECT * FROM notes ORDER BY path`).all() as StoredRow[];
  return rows.map(toMeta);
}

/**
 * Whether a file on disk needs re-reading at all — the same cheap mtime+size compare
 * `vault-scan.ts` already does, so a warm scan costs one `stat` per file and nothing
 * else. `hash` is not consulted here: it exists for the caller to tell a real edit apart
 * from a bare touch *after* a mismatch here forces a re-read, not to avoid the re-read.
 */
export function needsRefresh(db: IndexDb, path: string, mtime: number, size: number): boolean {
  const known = getNote(db, path);
  return known === null || known.mtime !== mtime || known.size !== size;
}

/**
 * Quoting each word of the query is what keeps FTS5's own operator syntax (`AND`, `-`,
 * `:`, a bare `*` or `"`) from turning a note title typed back at it into a syntax
 * error — verified against a real FTS5 table, not assumed: a bareword query breaks on
 * exactly this once real titles have punctuation in them. Quoting *the whole query* as
 * one phrase was the first thing tried and is wrong for a different reason: `"klant
 * offerte"*` only matches when "offerte" immediately follows "klant", so word order in
 * the box would matter and it should not. Quoting word by word and joining on FTS5's
 * implicit `AND` matches every word, in any order, each with its own prefix search —
 * what a type-ahead box needs. This trades away FTS5's own boolean/column-filter syntax
 * entirely, which is deliberate: `02-technisch-ontwerp.md` §7.3 puts that parsing
 * (`type:`, `attendee:`, `tag:`, date range) in the search bar's own query parser, in
 * front of this, not inside the `MATCH` expression.
 */
function toMatchQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(" ");
}

/** Paths matching free text, best match first. Empty for blank input rather than every note. */
export function search(db: IndexDb, query: string): string[] {
  if (query.trim() === "") return [];

  const rows = db
    .prepare(`SELECT path FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank`)
    .all(toMatchQuery(query)) as { path: string }[];
  return rows.map((row) => row.path);
}
