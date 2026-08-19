import { foldTag } from "../markdown/index.js";
import type {
  Facet,
  Facets,
  NoteSummary,
  ScanProgress,
  Selection,
  TaskCount,
  TaskItem,
} from "../shared/vault-types.js";
import { findConflictCopies, type ConflictPair } from "./conflicts.js";
import {
  allLinks,
  allNotes,
  getNote,
  openTaskCountsByFolder,
  openTaskCountsByPath,
  search,
  tasksIn,
  type IndexDb,
  type NoteMeta,
} from "./index-db.js";
import {
  buildLinkIndex,
  resolveInIndex,
  resolveWikiLinkTarget,
  type LinkResolution,
} from "./link-resolve.js";
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

/**
 * Which note a `[[…]]` target names — B35, the question `IPC.openWikiLink` asks after
 * `resolveAttachment` has already said the target is not a stored file.
 *
 * Scanned first, like every other cross-vault question here: a link clicked in a note the
 * user opened from a folder listing can point anywhere, and the folder listing itself
 * never waits on a scan, so this is the first moment the index is guaranteed to be needed.
 */
export async function resolveNoteLink(
  vault: string,
  db: IndexDb,
  target: string,
): Promise<LinkResolution> {
  await ensureScanned(vault, db);
  if (!available) return { kind: "none" };

  return resolveWikiLinkTarget(
    target,
    allNotes(db).map((note) => ({ path: note.path, title: note.title })),
  );
}

/** One note that links to another, and every spelling it uses to do so. */
export interface LinkingNote {
  path: string;
  title: string;
  /** The raw targets in that note which resolve to the note in question — what a rewrite has to replace. */
  targets: string[];
}

/**
 * Every note that links to `notePath`, with the exact target spellings it uses.
 *
 * Both halves are needed by the two callers together: the count is what the confirmation
 * before a move or a rename names ("3 notes link to this note"), and the spellings are
 * what `rewriteWikiLinks` matches on — a note may link to the same target by path in one
 * paragraph and by bare title in another, and only replacing the ones that actually
 * resolve here keeps a rewrite from touching a link that happens to share a word.
 *
 * The whole link table is resolved against one prepared index rather than each link being
 * resolved on its own: a move asks this question once per move, but it asks it about
 * every link in the vault, and building the three lookup tables per link would be
 * quadratic for no gain.
 */
export async function linkingNotes(
  vault: string,
  db: IndexDb,
  notePath: string,
): Promise<LinkingNote[]> {
  await ensureScanned(vault, db);
  if (!available) return [];

  const notes = allNotes(db);
  const index = buildLinkIndex(notes.map((note) => ({ path: note.path, title: note.title })));
  const titles = new Map(notes.map((note) => [note.path, note.title]));

  const found = new Map<string, Set<string>>();
  for (const link of allLinks(db)) {
    // Links only, never embeds. `note_links` holds both since B45, and this question is
    // B35's: which *notes* point at this note, so that moving it can offer to bring them
    // along. An embed names a file, resolves through `resolveAttachment` rather than the
    // index, and would only ever inflate the count in the confirmation.
    if (link.kind !== "link") continue;

    // A note linking to itself is not something a rename has to repair: the link is
    // already inside the file being rewritten, and `rewriteWikiLinks` would be writing
    // over a move it has itself just performed.
    if (link.fromPath === notePath) continue;

    const resolved = resolveInIndex(index, link.target);
    if (resolved.kind !== "unique" || resolved.path !== notePath) continue;

    const targets = found.get(link.fromPath);
    if (targets === undefined) found.set(link.fromPath, new Set([link.target]));
    else targets.add(link.target);
  }

  return [...found.entries()]
    .map(([path, targets]) => ({
      path,
      title: titles.get(path) ?? path,
      targets: [...targets],
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The same question as `linkingNotes`, asked about every note inside a folder at once —
 * what a folder rename needs (B44), keyed by the note that is about to move.
 *
 * One index and one pass over the link table, not one of each per note. `linkingNotes`
 * already refuses to resolve links one at a time for being quadratic; calling it once per
 * note in a folder would rebuild its three lookup tables per note and reach the same shape
 * from the other direction — a folder of fifty notes would walk the whole vault's links
 * fifty times.
 *
 * Self-links are dropped for the reason `linkingNotes` gives, and so is any referrer that
 * would be rewritten to the spelling it already has: a note *inside* the renamed folder
 * moves with it, so a link from one of its neighbours keeps resolving either way. It is
 * still rewritten, because the target path it names changes with the folder — but a
 * referrer outside the folder and one inside it are told apart afterwards, by
 * `folder-rename-links.ts`, not here.
 */
export async function linkingNotesUnder(
  vault: string,
  db: IndexDb,
  folderPath: string,
): Promise<Map<string, LinkingNote[]>> {
  await ensureScanned(vault, db);
  if (!available) return new Map();

  const notes = allNotes(db);
  const index = buildLinkIndex(notes.map((note) => ({ path: note.path, title: note.title })));
  const titles = new Map(notes.map((note) => [note.path, note.title]));

  const prefix = `${folderPath}/`;
  const inside = new Set(notes.filter((note) => note.path.startsWith(prefix)).map((n) => n.path));
  if (inside.size === 0) return new Map();

  const found = new Map<string, Map<string, Set<string>>>();
  for (const link of allLinks(db)) {
    if (link.kind !== "link") continue; // links only, same reason as `linkingNotes` above

    const resolved = resolveInIndex(index, link.target);
    if (resolved.kind !== "unique" || !inside.has(resolved.path)) continue;
    if (link.fromPath === resolved.path) continue;

    let referrers = found.get(resolved.path);
    if (referrers === undefined) {
      referrers = new Map();
      found.set(resolved.path, referrers);
    }

    const targets = referrers.get(link.fromPath);
    if (targets === undefined) referrers.set(link.fromPath, new Set([link.target]));
    else targets.add(link.target);
  }

  return new Map(
    [...found.entries()].map(([notePath, referrers]) => [
      notePath,
      [...referrers.entries()]
        .map(([path, targets]) => ({ path, title: titles.get(path) ?? path, targets: [...targets] }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    ]),
  );
}

/**
 * Every note carrying a `[[…]]` or `![[…]]` target whose **path** lies inside `folderPath`,
 * with those exact spellings — what a folder rename has to repair for attachments (B45).
 *
 * Deliberately nothing to do with resolution, and that is the whole difference from
 * `linkingNotesUnder` beside it. That one asks "which notes point at this *note*", which
 * needs `link-resolve.ts`'s three stages; this asks "which targets name something inside
 * this folder", which is a question about the string. An attachment target never resolves
 * to a note at all — that is exactly why the first version of B44's repair silently did
 * nothing for a folder full of pictures — and `resolveAttachment` is path-based, so a
 * target that carries a path breaks the moment that path changes.
 *
 * Embeds *and* links, because `[[99 - Attachments/offerte.pdf|Open: …]]` is as much a
 * reference to a file in that folder as `![[99 - Attachments/foto.png]]` is. A path-form
 * target that happens to name a note is caught here too and rewritten to exactly what
 * `linkingNotesUnder`'s repair would have written, so the two passes agree; a bare
 * `[[Rules]]` carries no path and is only ever the other pass's business.
 */
/**
 * Every `[[…]]` and `![[…]]` target in the vault, as spellings and nothing more.
 *
 * The unlinked-attachment scan's whole question: an attachment is referenced when some
 * note names it, and B45 put embeds in `note_links` beside the links. Before this that
 * scan rebuilt the set by reading and parsing every note in the vault on the main thread,
 * inside the IPC call, which is what left the screen saying "Looking…" for as long as
 * OneDrive took to hydrate them.
 *
 * `null` when the index could not be scanned — the caller falls back to reading the notes,
 * rather than treating "no answer" as "nothing is referenced" and offering to delete
 * every attachment in the vault.
 */
export async function referencedTargets(vault: string, db: IndexDb): Promise<string[] | null> {
  await ensureScanned(vault, db);
  if (!available) return null;

  return allLinks(db).map((link) => link.target);
}

export async function targetsUnder(
  vault: string,
  db: IndexDb,
  folderPath: string,
): Promise<{ path: string; targets: string[] }[]> {
  await ensureScanned(vault, db);
  if (!available || folderPath === "") return [];

  const prefix = `${folderPath}/`;
  const found = new Map<string, Set<string>>();

  for (const link of allLinks(db)) {
    if (!link.target.startsWith(prefix)) continue;

    const targets = found.get(link.fromPath);
    if (targets === undefined) found.set(link.fromPath, new Set([link.target]));
    else targets.add(link.target);
  }

  return [...found.entries()]
    .map(([path, targets]) => ({ path, targets: [...targets] }))
    .sort((a, b) => a.path.localeCompare(b.path));
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
  // The Tasks view has its own list, read through `tasks()` below rather than this one —
  // it shows task rows, not notes, and a "tasks" selection never reaches `notesMatching`
  // from the renderer. This exists only so the union stays exhaustive here.
  if (selection.kind === "tasks") return [];
  // Same again for the unlinked-attachment pane: it lists files, not notes, and is
  // answered by `IPC.libraryUnlinkedAttachments`. The renderer never asks this one about
  // it either; the branch is here so the union stays exhaustive.
  if (selection.kind === "unlinked") return [];

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

/**
 * Open task items per folder, for the folder tree's badge.
 *
 * Reads `note_tasks` like `tasks` does, and for the same reason (B26): the alternative
 * is walking the vault and parsing every note to answer a number drawn beside a folder
 * name, which is the main-thread stall the scan was moved into a worker to be rid of.
 *
 * It waits on `ensureScanned` — so the tree draws with its note counts first and this
 * arrives after, which is exactly the split `IPC.libraryFolderTaskCounts` exists for.
 */
export async function folderTaskCounts(
  vault: string,
  db: IndexDb,
): Promise<Record<string, number>> {
  await ensureScanned(vault, db);
  if (!available) return {};

  return openTaskCountsByFolder(db);
}

/**
 * Open and total task items per note, for the note list's own count.
 *
 * The folder badge's sibling in every respect — same table, same `ensureScanned`, same
 * "arrives after the list is already drawn" split — and out of the same query, so a
 * folder saying two are open and the rows inside it saying none cannot happen.
 *
 * It cannot come off `NoteSummary` instead: `summarise` reads the frontmatter and the
 * first lines of a file without ever building a document, deliberately (a note costs
 * 0.09 ms rather than 1.51 ms that way), so it cannot see a task item at all. And
 * folder browsing goes straight to disk with no `ensureScanned` in front of it, which is
 * the rule this would have to break to arrive with the rows.
 */
export async function noteTaskCounts(
  vault: string,
  db: IndexDb,
): Promise<Record<string, TaskCount>> {
  await ensureScanned(vault, db);
  if (!available) return {};

  return openTaskCountsByPath(db);
}
