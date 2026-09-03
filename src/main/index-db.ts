import Database from "better-sqlite3";
import { folderOf, type TaskCount } from "../shared/vault-types.js";

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

/** One `[[…]]`/`![[…]]` reference as `buildRecord` extracts it — see `collectWikiLinkTargets` in `src/markdown/wiki-targets.ts`. */
export interface LinkExtract {
  target: string;
  alias: string | null;
  kind: "link" | "embed";
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
  /** B75's `pinned: true`, so the limit of three can be counted across the whole vault. */
  pinned: boolean;
  /** Plain text — see `src/markdown/plain-text.ts` — for FTS5 to index; not returned by queries. */
  body: string;
  /** Every task item in the note, in document order — fills `note_tasks`, not the `notes` table itself. */
  tasks: TaskExtract[];
  /** Every `[[…]]` link and `![[…]]` embed the note carries, in document order — fills `note_links`, same arrangement as `tasks`. */
  links: LinkExtract[];
}

/**
 * A stored row without `body` or `tasks`: what every metadata read returns. `body` is
 * never read back out — it only ever feeds FTS5. `tasks` lives in its own table with its
 * own query (`tasksIn`), not attached to every note row the way `title` or `tags` are,
 * since nothing that reads `NoteMeta` today needs it.
 */
export type NoteMeta = Omit<NoteRecord, "body" | "tasks" | "links">;

export type IndexDb = Database.Database;

/**
 * Bumped whenever a change means an index built before it exists cannot simply gain the
 * new data on its own. `note_tasks` was the first such change: `needsRefresh` only forces
 * a re-read when a file's `mtime` or `size` moved, and neither does merely by this table
 * existing, so an index scanned before that day would carry every note *except* its tasks,
 * silently, forever. `migrate` drops and rebuilds below that version instead of trying to
 * migrate forward in place — the index is a derived cache in the app-data folder (B9),
 * never in the vault, so rebuilding it from scratch costs one scan and destroys nothing.
 *
 * Version 2 is `note_links` (B35), for exactly the same reason: an existing index would
 * otherwise report that nothing in the vault links to anything, and a move would quietly
 * leave every link to the moved note pointing at where it used to be.
 *
 * Version 3 adds `kind` to that table and starts storing `![[…]]` embeds in it as well as
 * `[[…]]` links (B45). Same reason a third time: an index built before this holds no embed
 * rows at all, so a folder rename would go on quietly leaving every picture in that folder
 * pointing at the old name — which is exactly the bug that was reported.
 *
 * Version 4 is `pinned` (B75), and the reason is the oldest one on this list: the column
 * is filled from a note's frontmatter, and `needsRefresh` only re-reads a file whose
 * `mtime` or `size` has moved — neither of which this column existing does to anything. An
 * index built before today would report every note in the vault as unpinned, for good, and
 * the limit of three would be counted against nothing.
 *
 * Version 5 is the day an empty `- [ ]` stopped being a task (`isBlankTask`). It is the
 * first entry on this list that removes rows rather than adding a column: every index
 * built before it holds a `note_tasks` row for every blank box in the vault, and
 * `needsRefresh` will not re-read a single one of those files, because nothing about them
 * moved. The badges and the Tasks view would go on counting exactly what this change is
 * about until each note was next edited.
 */
const SCHEMA_VERSION = 5;

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
      DROP TABLE IF EXISTS note_links;
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
      hash TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0
    );

    -- Three rows at most, asked for on every pin: worth an index only because the
    -- alternative is a full scan of the notes table to answer "are there already three".
    CREATE INDEX IF NOT EXISTS notes_pinned ON notes(pinned) WHERE pinned = 1;

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

    -- No primary key on (path, ordinal) the way note_tasks has: a note can legitimately
    -- carry the same link twice, and there is nothing to address an individual one by.
    -- Every read of this table is either "all links from this note" or "every link in the
    -- vault", so fromPath is the only index worth having. (No backticks in this comment:
    -- it lives inside a template literal.)
    CREATE TABLE IF NOT EXISTS note_links (
      fromPath TEXT NOT NULL,
      target TEXT NOT NULL,
      alias TEXT,
      -- 'link' for [[...]], 'embed' for ![[...]] (B45). The two are asked about
      -- separately: B35's move/rename question is about links only, since that is what
      -- resolves to a note, while a folder rename is about the path inside any target.
      kind TEXT NOT NULL DEFAULT 'link'
    );

    CREATE INDEX IF NOT EXISTS note_links_from ON note_links(fromPath);
  `);
}

/**
 * A page freed inside this file is not a byte given back to the disk (B101).
 *
 * SQLite keeps freed pages on an internal free list and re-uses them; it only returns
 * them to the filesystem on an explicit `VACUUM`, which this app never ran. So an index
 * that once covered far more than it covers now — a larger folder chosen as the vault, a
 * corpus since trimmed — stays at its high-water mark for ever. Measured on a 3000-note
 * vault cut down to 60: 18.3 MB, still 14.1 MB afterwards with 89% of its pages free, and
 * 1.6 MB after a `VACUUM`. That is the shape of the 25 MB index that rebuilt to 550 KB
 * when it was deleted by hand, and the reason to delete it by hand is what this removes.
 *
 * Three things keep it from being a cost anywhere it is not a gain. It runs **only when
 * most of the file is genuinely waste** — a quarter of the pages free *and* enough of them
 * to be worth the rewrite, so an index in ordinary daily use never qualifies: churn alone
 * reaches a steady state and stays there (120 rounds of rewriting every note in a vault
 * moved a 4.59 MB index by 0.03 MB). It runs **only in the main process**, never in the
 * scan worker, which opens this same file a second time — two `VACUUM`s racing over one
 * database is a lock fight over work only one of them needs to do. And it **never
 * propagates a failure**: reclaiming disk space is a courtesy, and an index that could not
 * be compacted is an index that still answers every question correctly.
 */
function reclaimFreeSpace(db: IndexDb): void {
  try {
    const free = db.pragma("freelist_count", { simple: true }) as number;
    const total = db.pragma("page_count", { simple: true }) as number;
    if (total < MIN_PAGES_TO_RECLAIM) return;
    if (free / total < RECLAIM_AT_FREE_FRACTION) return;
    db.exec("VACUUM");
  } catch {
    // Locked by the other connection, out of temp space, read-only volume. None of them
    // is a reason to fail opening the index.
  }
}

/** Below this the whole file is small enough that neither the waste nor the rewrite is
 *  worth thinking about: 512 pages of 4 KB is about 2 MB, and compacting 2 MB costs
 *  milliseconds. **The fraction below is the gate, not this.** A floor high enough to be a
 *  second opinion about whether a file is bloated would exclude exactly the middling cases
 *  this is for — an index that grew to 8 MB and is now 90% holes is as worth reclaiming as
 *  one that grew to 25 MB. */
const MIN_PAGES_TO_RECLAIM = 512;
/** A quarter free is well past anything ordinary use produces, and well short of the 89%
 *  the measurement above found. */
const RECLAIM_AT_FREE_FRACTION = 0.25;

/**
 * `reclaim` is the main process saying it is the one connection allowed to compact this
 * file. `scan-worker.ts` opens the same database and passes nothing, for the reason
 * `reclaimFreeSpace` gives.
 */
export function openIndex(path: string, options: { reclaim?: boolean } = {}): IndexDb {
  const db = new Database(path);
  migrate(db);
  if (options.reclaim === true) reclaimFreeSpace(db);
  return db;
}

export function closeIndex(db: IndexDb): void {
  db.close();
}

const upsertNoteStatements = (db: IndexDb) => ({
  note: db.prepare(`
    INSERT INTO notes (path, fileName, title, type, created, modified, location, attendees, tags, excerpt, mtime, size, hash, pinned)
    VALUES (@path, @fileName, @title, @type, @created, @modified, @location, @attendees, @tags, @excerpt, @mtime, @size, @hash, @pinned)
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
      hash = excluded.hash,
      pinned = excluded.pinned
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
  deleteLinks: db.prepare(`DELETE FROM note_links WHERE fromPath = ?`),
  insertLink: db.prepare(`
    INSERT INTO note_links (fromPath, target, alias, kind)
    VALUES (@fromPath, @target, @alias, @kind)
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
    pinned: record.pinned ? 1 : 0,
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
    // Same delete-then-insert, same reason as the two above: a link that was removed from
    // the note has no counterpart row to update.
    statements.deleteLinks.run(record.path);
    for (const link of record.links) {
      statements.insertLink.run({
        fromPath: record.path,
        target: link.target,
        alias: link.alias,
        kind: link.kind,
      });
    }
  })();
}

export function deleteNote(db: IndexDb, path: string): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM notes WHERE path = ?`).run(path);
    db.prepare(`DELETE FROM notes_fts WHERE path = ?`).run(path);
    db.prepare(`DELETE FROM note_tasks WHERE path = ?`).run(path);
    db.prepare(`DELETE FROM note_links WHERE fromPath = ?`).run(path);
  })();
}

/**
 * Drops every note under a folder, and answers which paths went — a folder deleted
 * outside the app arrives as one `unlinkDir` event, not as an `unlink` per file, so
 * nothing else in this codebase would ever otherwise remove them from the index.
 *
 * Matched with `substr(path, 1, N) = prefix` rather than `LIKE`/`GLOB`: `LIKE`'s `_`
 * matches any single character, so a real folder literally named `_incoming` would also
 * match something like `Xincoming/…`; `GLOB`'s `[` is a metacharacter that real folder
 * names in this vault can legitimately contain. A plain prefix compare has no
 * metacharacters to escape and matches exactly the folder asked for.
 *
 * `""` matches nothing rather than every note — an empty prefix is not "the whole
 * vault" here, unlike the `scope` convention `tasksIn`/`searchNotes` use elsewhere,
 * because there is no code path that ever wants to drop the entire index this way.
 */
export function deleteNotesUnder(db: IndexDb, folderPrefix: string): string[] {
  if (folderPrefix === "") return [];

  const prefix = `${folderPrefix}/`;
  const rows = db
    .prepare(`SELECT path FROM notes WHERE path = ? OR substr(path, 1, ?) = ?`)
    .all(folderPrefix, prefix.length, prefix) as { path: string }[];
  const paths = rows.map((row) => row.path);

  db.transaction(() => {
    for (const path of paths) deleteNote(db, path);
  })();

  return paths;
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
  pinned: number;
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
    pinned: row.pinned === 1,
  };
}

export function getNote(db: IndexDb, path: string): NoteMeta | null {
  const row = db.prepare(`SELECT * FROM notes WHERE path = ?`).get(path) as
    | StoredRow
    | undefined;
  return row === undefined ? null : toMeta(row);
}

/**
 * Every pinned note's path, anywhere in the vault.
 *
 * Asked in main rather than in the renderer, which only ever knows the list currently on
 * screen. That was the whole argument when the limit was vault-wide, and it survives the
 * limit becoming per-folder unchanged: the folder being counted is very often *not* the
 * one the tree is standing in — a note can be pinned from a tag's list, or from a search
 * result — so the renderer has no way to count the right rows even in principle.
 */
export function pinnedNotes(db: IndexDb): string[] {
  const rows = db.prepare(`SELECT path FROM notes WHERE pinned = 1 ORDER BY path`).all() as {
    path: string;
  }[];
  return rows.map((row) => row.path);
}

/**
 * The pinned notes in one folder — what the limit is actually counted against.
 *
 * The *immediate* folder, not the subtree: `folderOf` takes the last segment off, so
 * `01 Projects/Klant X` and `01 Projects` are two different places with an allowance
 * each. Rolling subfolders up would make the same note count against several folders at
 * once, and then the answer would depend on which of them you happened to be looking at
 * when you pinned it.
 *
 * Filtered in JS rather than in SQL because there is no `folder` column and adding one
 * would mean a `SCHEMA_VERSION` bump for a query that reads at most a handful of rows:
 * `notes_pinned` is a partial index over `pinned = 1`, so this never touches the rest of
 * the table.
 */
export function pinnedNotesIn(db: IndexDb, folder: string): string[] {
  return pinnedNotes(db).filter((path) => folderOf(path) === folder);
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

/** One stored `[[…]]` link: which note it sits in, and exactly how it spells its target. */
export interface LinkRow {
  fromPath: string;
  target: string;
  alias: string | null;
  /** `[[…]]` or `![[…]]` — see the column's own comment in `migrate` (B45). */
  kind: "link" | "embed";
}

/**
 * Every link in the vault. Read whole rather than filtered in SQL, because the question
 * that asks it — "which notes link to *this* one" — cannot be expressed as a `WHERE` on
 * `target`: a target is a spelling, not a path, and three separate rules (path, title,
 * filename stem, all in `link-resolve.ts`) decide which note it names. Resolving in JS
 * against one prepared index is both correct and, at a personal vault's scale, cheaper
 * than teaching SQLite the same three rules.
 */
export function allLinks(db: IndexDb): LinkRow[] {
  return db
    .prepare(`SELECT fromPath, target, alias, kind FROM note_links ORDER BY fromPath`)
    .all() as LinkRow[];
}

/**
 * How many task items are still open, per folder — what the tree's badge counts.
 *
 * One count per note out of `openTaskCountsByPath`, folded onto its folder here rather
 * than in SQL: SQLite has no `dirname`, and doing it with `instr`/`substr` on a path
 * would be a second spelling of the rule the rest of this app states once. Folders with
 * nothing open are simply absent.
 *
 * The fold reads the per-note answer rather than asking its own question, so the folder
 * badge and the note rows inside that folder cannot come to disagree about the same
 * notes — see `openTaskCountsByPath` for the rest of that reasoning.
 *
 * Not rolled up: a parent's count is about the notes in the parent itself.
 */
export function openTaskCountsByFolder(db: IndexDb): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [path, count] of Object.entries(openTaskCountsByPath(db))) {
    if (count.open === 0) continue;
    const cut = path.lastIndexOf("/");
    const folder = cut === -1 ? "" : path.slice(0, cut);
    counts[folder] = (counts[folder] ?? 0) + count.open;
  }
  return counts;
}

/**
 * The same question B67 asks of a folder, asked of one note — and the source both answers
 * come from, since `openTaskCountsByFolder` is now the fold over this rather than a
 * second query. A folder badge and the rows inside that folder disagreeing about the same
 * notes is the failure worth designing out, and one query is how.
 *
 * Two numbers rather than one, because the list says `2 of 5`: a note whose work is done
 * reads differently from a note that never had any, and only `total` can tell those apart.
 * A note with no task items at all is simply absent — `note_tasks` has no row for it — so
 * a missing key means "nothing to say", exactly as it does for folders.
 *
 * The `JOIN notes` carries B67's reason unchanged: a row whose note has left the index
 * must not make the list promise tasks the Tasks view does not list.
 */
export function openTaskCountsByPath(db: IndexDb): Record<string, TaskCount> {
  const rows = db
    .prepare(
      `
      SELECT note_tasks.path AS path,
             COUNT(*) AS total,
             SUM(CASE WHEN note_tasks.checked = 0 THEN 1 ELSE 0 END) AS open
      FROM note_tasks
      JOIN notes ON notes.path = note_tasks.path
      GROUP BY note_tasks.path
      `,
    )
    .all() as { path: string; total: number; open: number }[];

  const counts: Record<string, TaskCount> = {};
  for (const row of rows) {
    counts[row.path] = { open: row.open, total: row.total };
  }
  return counts;
}

/** The links one note carries, for the rare case of asking about a single note. */
export function linksFrom(db: IndexDb, path: string): LinkRow[] {
  return db
    .prepare(`SELECT fromPath, target, alias, kind FROM note_links WHERE fromPath = ?`)
    .all(path) as LinkRow[];
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
