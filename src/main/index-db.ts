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

/** One task item as `buildRecord` extracts it — see `taskItemsIn` in `src/markdown/schema.ts`. */
export interface TaskExtract {
  ordinal: number;
  checked: boolean;
  text: string;
}

export interface NoteRecord {
  path: string;
  fileName: string;
  title: string;
  type: string;
  created: string;
  modified: string;
  location: string;
  attendees: string[];
  tags: string[];
  /** First line or so of the body — `NoteSummary.excerpt`, stored rather than re-read per query. */
  excerpt: string;
  /** `stat().mtimeMs`, for the cheap refresh check `02-technisch-ontwerp.md` §7.2 wants. */
  mtime: number;
  size: number;
  /** Content hash, so a mtime bump with unchanged bytes (a plain OneDrive touch) is not mistaken for a real edit. */
  hash: string;
  /** Plain text — see `src/markdown/plain-text.ts` — for FTS5 to index; not returned by queries. */
  body: string;
  /** Every task item in the note, in document order — fills `note_tasks`, not the `notes` table itself. */
  tasks: TaskExtract[];
}

/**
 * A stored row without `body` or `tasks`: what every metadata read returns. `body` is
 * never read back out — it only ever feeds FTS5. `tasks` lives in its own table with its
 * own query (`tasksIn`), not attached to every note row the way `title` or `tags` are,
 * since nothing that reads `NoteMeta` today needs it.
 */
export type NoteMeta = Omit<NoteRecord, "body" | "tasks">;

export type IndexDb = Database.Database;

/**
 * Bumped whenever a change means an index built before it exists cannot simply gain the
 * new data on its own. `note_tasks` is the first such change: `needsRefresh` only forces
 * a re-read when a file's `mtime` or `size` moved, and neither does merely by this table
 * existing, so an index scanned before today would carry every note *except* its tasks,
 * silently, forever. `migrate` drops and rebuilds below that version instead of trying to
 * migrate forward in place — the index is a derived cache in the app-data folder (B9),
 * never in the vault, so rebuilding it from scratch costs one scan and destroys nothing.
 */
const SCHEMA_VERSION = 1;

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
  // Two connections write to this file: the main thread (the watcher's incremental
  // reindex) and the scan worker (`scan-worker.ts`), which opens it a second time because
  // a better-sqlite3 handle cannot cross a thread. WAL already means a reader never
  // waits on a writer, which is the case that matters — every library question is a read.
  // Two *writers* still take the lock in turn, and without a timeout the loser throws
  // SQLITE_BUSY on the spot and drops the update instead of waiting the sub-millisecond
  // it takes for one note's transaction to commit.
  db.pragma("busy_timeout = 5000");

  // See `SCHEMA_VERSION`'s own comment. `user_version` defaults to 0 on a database that
  // has never set it — every index built before this table existed — so this also covers
  // a completely fresh `:memory:` or file database, where the `DROP TABLE IF EXISTS`s
  // below are simply no-ops.
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version < SCHEMA_VERSION) {
    db.exec(`
      DROP TABLE IF EXISTS notes_fts;
      DROP TABLE IF EXISTS note_tasks;
      DROP TABLE IF EXISTS notes;
    `);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
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

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      path UNINDEXED,
      title,
      body,
      attendees,
      tags,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE IF NOT EXISTS note_tasks (
      path TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      checked INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (path, ordinal)
    );

    CREATE INDEX IF NOT EXISTS note_tasks_open ON note_tasks(checked, path);
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
    INSERT INTO notes (path, fileName, title, type, created, modified, location, attendees, tags, excerpt, mtime, size, hash)
    VALUES (@path, @fileName, @title, @type, @created, @modified, @location, @attendees, @tags, @excerpt, @mtime, @size, @hash)
    ON CONFLICT(path) DO UPDATE SET
      fileName = excluded.fileName,
      title = excluded.title,
      type = excluded.type,
      created = excluded.created,
      modified = excluded.modified,
      location = excluded.location,
      attendees = excluded.attendees,
      tags = excluded.tags,
      excerpt = excluded.excerpt,
      mtime = excluded.mtime,
      size = excluded.size,
      hash = excluded.hash
  `),
  deleteFts: db.prepare(`DELETE FROM notes_fts WHERE path = ?`),
  insertFts: db.prepare(`
    INSERT INTO notes_fts (path, title, body, attendees, tags)
    VALUES (@path, @title, @body, @attendees, @tags)
  `),
  deleteTasks: db.prepare(`DELETE FROM note_tasks WHERE path = ?`),
  insertTask: db.prepare(`
    INSERT INTO note_tasks (path, ordinal, checked, text)
    VALUES (@path, @ordinal, @checked, @text)
  `),
});

/**
 * Inserts or replaces one note, including its tasks. A single transaction, so a search
 * or a Tasks-view read never sees the metadata row without its FTS entry, or with a
 * `note_tasks` set that belongs to the note's previous contents rather than these.
 */
export function upsertNote(db: IndexDb, record: NoteRecord): void {
  const statements = upsertNoteStatements(db);
  const row = {
    path: record.path,
    fileName: record.fileName,
    title: record.title,
    type: record.type,
    created: record.created,
    modified: record.modified,
    location: record.location,
    attendees: JSON.stringify(record.attendees),
    tags: JSON.stringify(record.tags),
    excerpt: record.excerpt,
    mtime: record.mtime,
    size: record.size,
    hash: record.hash,
  };

  db.transaction(() => {
    statements.note.run(row);
    statements.deleteFts.run(record.path);
    statements.insertFts.run({ ...row, body: record.body });
    // Delete-then-insert, the same shape as the FTS row above and for the same reason:
    // a note can lose a task entirely (the line was deleted), and there is no `excluded.`
    // trick for "this row from last time has no counterpart this time" the way `ON
    // CONFLICT` has for a row that persists.
    statements.deleteTasks.run(record.path);
    for (const task of record.tasks) {
      statements.insertTask.run({
        path: record.path,
        ordinal: task.ordinal,
        checked: task.checked ? 1 : 0,
        text: task.text,
      });
    }
  })();
}

export function deleteNote(db: IndexDb, path: string): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM notes WHERE path = ?`).run(path);
    db.prepare(`DELETE FROM notes_fts WHERE path = ?`).run(path);
    db.prepare(`DELETE FROM note_tasks WHERE path = ?`).run(path);
  })();
}

interface StoredRow {
  path: string;
  fileName: string;
  title: string;
  type: string;
  created: string;
  modified: string;
  location: string;
  attendees: string;
  tags: string;
  excerpt: string;
  mtime: number;
  size: number;
  hash: string;
}

function toMeta(row: StoredRow): NoteMeta {
  return {
    path: row.path,
    fileName: row.fileName,
    title: row.title,
    type: row.type,
    created: row.created,
    modified: row.modified,
    location: row.location,
    attendees: JSON.parse(row.attendees) as string[],
    tags: JSON.parse(row.tags) as string[],
    excerpt: row.excerpt,
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

/** One task item for the aggregated Tasks view: `note_tasks`, joined with the note it lives in for the title the row shows beside it. */
export interface TaskRow {
  path: string;
  title: string;
  ordinal: number;
  checked: boolean;
  text: string;
}

interface StoredTaskRow {
  path: string;
  title: string;
  ordinal: number;
  checked: number;
  text: string;
}

/**
 * Every task item under a folder scope and everything nested beneath it — `""` is the
 * vault root, meaning no restriction, the same rule `searchNotes` uses in
 * `vault-scan.ts` for its own `scope` option. Filtered in JS against the join's own rows
 * rather than with a SQL `LIKE ${scope}/%`: a folder name that happens to contain a `%`
 * or a `_` (both wildcards to `LIKE`) would otherwise match more, or less, than the
 * folder actually named that, and nothing else in this file needs to escape a `LIKE`
 * pattern to get this rule right.
 */
export function tasksIn(db: IndexDb, folderPrefix: string, openOnly: boolean): TaskRow[] {
  const rows = db
    .prepare(
      `
      SELECT note_tasks.path AS path, notes.title AS title, note_tasks.ordinal AS ordinal,
             note_tasks.checked AS checked, note_tasks.text AS text
      FROM note_tasks
      JOIN notes ON notes.path = note_tasks.path
      ${openOnly ? "WHERE note_tasks.checked = 0" : ""}
      ORDER BY notes.path, note_tasks.ordinal
      `,
    )
    .all() as StoredTaskRow[];

  const scoped =
    folderPrefix === "" ? rows : rows.filter((row) => row.path.startsWith(`${folderPrefix}/`));

  return scoped.map((row) => ({
    path: row.path,
    title: row.title,
    ordinal: row.ordinal,
    checked: row.checked === 1,
    text: row.text,
  }));
}
