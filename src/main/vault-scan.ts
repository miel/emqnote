import { foldTag } from "../markdown/index.js";
import type {
  Facet,
  Facets,
  NoteSummary,
  ScanProgress,
  Selection,
  TaskItem,
} from "../shared/vault-types.js";
import { findConflictCopies, type ConflictPair } from "./conflicts.js";
import { allNotes, getNote, search, tasksIn, type IndexDb, type NoteMeta } from "./index-db.js";
import { fullScan, type ScanResult } from "./index-scan.js";
import type { ParsedQuery } from "./search-query.js";
import { readNotesIn } from "./vault-io.js";

/**
 * Reading the whole vault, for the views that cut across folders.
 *
 * Browsing a folder needs one `readdir`; filtering by tag or by person needs every note.
 * This used to be an in-memory Map, deliberately shaped like the `notes` table so that
 * table could replace it without changing this module's interface — `index-db.ts` +
 * `index-scan.ts` are that table now, and this module is a thin query layer in front of
 * it: `ensureScanned` brings the index up to date (still collapsing concurrent callers
 * onto one running scan, the same reason it always did — opening the library while a
 * capture is being written must not start a second walk on top of the first) and
 * `facets`/`notesMatching` read from it. Nothing here touches Electron.
 *
 * *Where* the walk runs is not this module's business: `setScanRunner` swaps in the
 * worker (`scan-host.ts`) and the default is the plain in-process `fullScan`. The
 * collapse has to sit on this side of that seam either way — two workers walking the
 * same vault into the same database would be worse than two in-process walks, not
 * better.
 */

let available = true;
let running: Promise<void> | null = null;

/**
 * What actually walks the vault. `fullScan`'s own signature, so the in-process default is
 * simply `fullScan` itself.
 */
export type ScanRunner = (
  vault: string,
  db: IndexDb,
  onProgress?: (progress: ScanProgress) => void,
) => Promise<ScanResult>;

let runner: ScanRunner = fullScan;

/**
 * Chooses where scanning happens. `null` restores the in-process default.
 *
 * `index.ts` installs the worker runner once the index path is known. Tests leave it
 * alone and get the direct walk, which is what makes everything below testable without
 * a build step: the worker is a built file next to `index.js`, and there is no such file
 * when the suite runs from source.
 */
export function setScanRunner(next: ScanRunner | null): void {
  runner = next ?? fullScan;
}

async function scan(
  vault: string,
  db: IndexDb,
  onProgress?: (progress: ScanProgress) => void,
): Promise<void> {
  available = (await runner(vault, db, onProgress)) === "ok";
}

/** Brings the index up to date, collapsing concurrent callers onto one scan. */
async function ensureScanned(vault: string, db: IndexDb): Promise<void> {
  await begin(vault, db);
}

/**
 * Starts the first scan at launch instead of leaving it for whatever asks the index a
 * question first.
 *
 * That used to be the library's own conflict check, which runs eagerly on mount — so
 * opening the library for the first time after a cold start sat there walking the whole
 * vault before it drew anything, with nothing on screen to say why. Nothing about the
 * work changes; only when it happens, and that someone is watching.
 *
 * Goes through the same collapse as everything else, so a library opened halfway
 * through joins the scan already running rather than starting a second walk beside it.
 * `onProgress` therefore belongs to whoever got here first — a caller that merely wants
 * the index current uses `ensureScanned` and passes none.
 */
export function startScan(
  vault: string,
  db: IndexDb,
  onProgress?: (progress: ScanProgress) => void,
): Promise<void> {
  return begin(vault, db, onProgress);
}

function begin(
  vault: string,
  db: IndexDb,
  onProgress?: (progress: ScanProgress) => void,
): Promise<void> {
  if (running !== null) return running;

  running = scan(vault, db, onProgress).finally(() => {
    running = null;
  });
  return running;
}

function toSummary(note: NoteMeta): NoteSummary {
  return {
    path: note.path,
    fileName: note.fileName,
    title: note.title,
    kind: note.type as NoteSummary["kind"],
    created: note.created,
    modified: note.modified,
    attendees: note.attendees,
    tags: note.tags,
    excerpt: note.excerpt,
  };
}

function tally(values: string[][], seen: Map<string, Facet>): void {
  for (const list of values) {
    // A note counts once per name, however often it says it.
    const counted = new Set<string>();
    for (const raw of list) {
      const key = foldTag(raw);
      if (counted.has(key)) continue;
      counted.add(key);

      const existing = seen.get(key);
      if (existing === undefined) seen.set(key, { name: raw, count: 1 });
      else existing.count += 1;
    }
  }
}

/** Busiest first, then alphabetical — the long tail is what the filter box is for. */
function ranked(seen: Map<string, Facet>): Facet[] {
  return [...seen.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/** Every OneDrive conflict pair currently in the vault, from the same index the note list already reads. */
export async function conflicts(vault: string, db: IndexDb): Promise<ConflictPair[]> {
  await ensureScanned(vault, db);
  if (!available) return [];

  return findConflictCopies(allNotes(db).map((note) => note.path));
}

export async function facets(vault: string, db: IndexDb, excludePath?: string): Promise<Facets> {
  await ensureScanned(vault, db);
  if (!available) return { tags: [], people: [], available: false };

  const notes = allNotes(db)
    .map(toSummary)
    .filter((note) => note.path !== excludePath);
  const tags = new Map<string, Facet>();
  const people = new Map<string, Facet>();

  tally(
    notes.map((note) => note.tags),
    tags,
  );
  tally(
    notes.map((note) => note.attendees),
    people,
  );

  return { tags: ranked(tags), people: ranked(people), available: true };
}

/**
 * The notes a selection stands for.
 *
 * A folder still goes straight to the filesystem: browsing one folder must not wait on a
 * scan of the whole vault, and it is the common case by a wide margin.
 */
export async function notesMatching(
  vault: string,
  db: IndexDb,
  selection: Selection,
  excludePath?: string,
): Promise<NoteSummary[]> {
  const notes = await notesFor(vault, db, selection);
  return excludePath === undefined ? notes : notes.filter((note) => note.path !== excludePath);
}

async function notesFor(vault: string, db: IndexDb, selection: Selection): Promise<NoteSummary[]> {
  if (selection.kind === "folder") return readNotesIn(vault, selection.path);

  await ensureScanned(vault, db);
  if (!available) return [];

  const wanted = foldTag(selection.name);
  const field = selection.kind === "tag" ? "tags" : "attendees";

  return allNotes(db)
    .map(toSummary)
    .filter((note) => note[field].some((value) => foldTag(value) === wanted));
}

/**
 * Runs a parsed search-bar query (`search-query.ts`) against the index.
 *
 * Free text goes through `search()`'s FTS5 ranking and that order is kept; a query with
 * only filters and no free text (`tag:klantx` on its own) has no relevance signal to
 * rank by, so it falls back to `allNotes`' alphabetical order instead of an arbitrary
 * one. A completely blank query — no text, no filters — inherits "everything" from that
 * same fallback rather than being special-cased to return nothing: the alternative would
 * make clearing the last filter jump straight from "some notes" to zero instead of to
 * "all notes", which is the wrong direction for a box that is otherwise always narrowing.
 * `after`/`before` compare against the *date* portion of `created` only — `created`
 * itself carries a time and a UTC offset (never bare `Z`, see `CLAUDE.md`), and comparing
 * that string against a bare `YYYY-MM-DD` bound directly is not the same comparison a
 * human means by "after this date": a note created at `2026-01-01T09:00:00+02:00` reads
 * as lexicographically *greater than* the bound `"2026-01-01"` only because it is a
 * longer string with the same prefix, not because of anything about actual dates — the
 * comparison has to happen on equal-length date strings to mean what it looks like it
 * means.
 *
 * `scope`, when given, restricts to a folder and everything nested under it — the
 * "current folder only" switch `02-technisch-ontwerp.md` §7.3 describes; nothing calls
 * this with one yet, since the search bar itself has not been built.
 */
export async function searchNotes(
  vault: string,
  db: IndexDb,
  query: ParsedQuery,
  options: { scope?: string; excludePath?: string } = {},
): Promise<NoteSummary[]> {
  await ensureScanned(vault, db);
  if (!available) return [];

  const candidates: NoteMeta[] =
    query.text === ""
      ? allNotes(db)
      : search(db, query.text)
          .map((path) => getNote(db, path))
          .filter((note): note is NoteMeta => note !== null);

  const wantedTag = query.tag === null ? null : foldTag(query.tag);
  const wantedAttendee = query.attendee === null ? null : foldTag(query.attendee);

  const filtered = candidates.filter((note) => {
    if (query.type !== null && note.type !== query.type) return false;
    if (wantedTag !== null && !note.tags.some((tag) => foldTag(tag) === wantedTag)) return false;
    if (
      wantedAttendee !== null &&
      !note.attendees.some((attendee) => foldTag(attendee) === wantedAttendee)
    ) {
      return false;
    }

    const createdDate = note.created.slice(0, 10);
    if (query.after !== null && createdDate < query.after) return false;
    if (query.before !== null && createdDate > query.before) return false;

    // "" is the vault root, i.e. no restriction — a note's path never starts with "/",
    // so without this check every note would fail the prefix test below instead.
    if (
      options.scope !== undefined &&
      options.scope !== "" &&
      !note.path.startsWith(`${options.scope}/`)
    ) {
      return false;
    }
    if (note.path === options.excludePath) return false;

    return true;
  });

  return filtered.map(toSummary);
}

/**
 * Every task item under a folder scope, for the aggregated Tasks view.
 *
 * Reads `note_tasks`, filled by `buildRecord` during a scan or a watcher reindex —
 * never by walking the vault itself here. Re-parsing a folder's worth of notes on
 * demand was measured at 470–535 ms of main-thread stall on a 4000-note vault before
 * the scan moved to a worker (`index-scan.ts`'s own comment); asking the index instead
 * costs a join over rows that are already there.
 */
export async function tasks(
  vault: string,
  db: IndexDb,
  scope: string,
  openOnly: boolean,
): Promise<TaskItem[]> {
  await ensureScanned(vault, db);
  if (!available) return [];

  return tasksIn(db, scope, openOnly);
}
