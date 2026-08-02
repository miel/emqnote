import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import { foldTag } from "../markdown/index.js";
import type { Facet, Facets, NoteSummary, Selection } from "../shared/vault-types.js";
import { TRASH_FOLDER } from "../shared/vault-types.js";
import { isHidden, readNotesIn, summarise } from "./vault-io.js";
import { checkFilesOnDemand } from "./vault.js";

/**
 * Reading the whole vault, for the views that cut across folders.
 *
 * Browsing a folder needs one `readdir`; filtering by tag or by person needs every note.
 * There is no index yet — that is phase 5 — so this is a cache in front of the
 * filesystem, deliberately shaped like the `notes` table that phase 5 will build: same
 * fields, same mtime-and-size refresh. When SQLite arrives it replaces the Map, not the
 * interface. It stays free of Electron so it can move into a worker unchanged.
 *
 * Nothing here is persisted. A second on-disk format would be a second thing to migrate
 * away from, and a cold scan is cheap enough not to need one: measured over three
 * thousand meeting-sized notes it costs 279 ms cold and 15 ms warm, the warm case being
 * a `stat` per file and nothing else. That is still far over the 80 ms hotkey budget,
 * which is why the scan yields every hundred files and never runs at startup.
 */

interface Entry {
  mtimeMs: number;
  size: number;
  note: NoteSummary;
}

const YIELD_EVERY = 100;

let cache = new Map<string, Entry>();
let cachedVault: string | null = null;
let available = true;
let running: Promise<void> | null = null;

/** Frees the event loop so a hotkey press is not stuck behind a full scan. */
function breathe(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/** Every `.md` in the vault, skipping the folders the app owns and the trash. */
function collectFiles(vault: string): string[] {
  const files: string[] = [];

  const walk = (absolute: string, depth: number): void => {
    if (depth > 12) return;

    let entries: Dirent[];
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) {
        // Deleted notes must not resurface under their tags.
        if (isHidden(entry.name) || entry.name === TRASH_FOLDER) continue;
        walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path);
      }
    }
  };

  walk(vault, 0);
  return files;
}

/**
 * A file that OneDrive has evicted reports a size but occupies no blocks.
 *
 * Reading one forces a download. On macOS that is detectable per file; on Windows it is
 * not, which is why there is also the up-front check in `scan`.
 */
function isDataless(stats: { size: number; blocks: number }): boolean {
  return process.platform === "darwin" && stats.size > 0 && stats.blocks === 0;
}

async function scan(vault: string): Promise<void> {
  if (vault !== cachedVault) {
    cache = new Map();
    cachedVault = vault;
  }

  // Reading a few thousand placeholder files would trigger a few thousand blocking
  // downloads — exactly what the warning on startup exists to prevent. "unknown" is a
  // valid answer and must never hold anything up.
  if ((await checkFilesOnDemand(vault)) === "ondemand") {
    available = false;
    cache = new Map();
    return;
  }
  available = true;

  const files = collectFiles(vault);
  const next = new Map<string, Entry>();
  let since = 0;

  for (const file of files) {
    let stats;
    try {
      stats = statSync(file);
    } catch {
      continue;
    }

    const key = toPosix(relative(vault, file));
    const known = cache.get(key);

    if (known !== undefined && known.mtimeMs === stats.mtimeMs && known.size === stats.size) {
      next.set(key, known);
      continue;
    }

    if (isDataless(stats)) continue;

    try {
      next.set(key, {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        note: summarise(vault, file, readFileSync(file, "utf8"), stats.mtime),
      });
    } catch {
      continue;
    }

    since += 1;
    if (since >= YIELD_EVERY) {
      since = 0;
      await breathe();
    }
  }

  cache = next;
}

/**
 * Brings the cache up to date, collapsing concurrent callers onto one scan.
 *
 * Without the collapse, opening the library while a capture is being written would start
 * a second walk on top of the first, on the one thread the hotkey also runs on.
 */
async function ensureScanned(vault: string): Promise<void> {
  if (running !== null) {
    await running;
    return;
  }

  running = scan(vault).finally(() => {
    running = null;
  });
  await running;
}

/** Drops one note from the cache, or all of them. The next scan re-reads what is gone. */
export function invalidate(path?: string): void {
  if (path === undefined) cache = new Map();
  else cache.delete(path);
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

export async function facets(vault: string, excludePath?: string): Promise<Facets> {
  await ensureScanned(vault);
  if (!available) return { tags: [], people: [], available: false };

  const notes = [...cache.values()]
    .map((entry) => entry.note)
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
  selection: Selection,
  excludePath?: string,
): Promise<NoteSummary[]> {
  const notes = await notesFor(vault, selection);
  return excludePath === undefined ? notes : notes.filter((note) => note.path !== excludePath);
}

async function notesFor(vault: string, selection: Selection): Promise<NoteSummary[]> {
  if (selection.kind === "folder") return readNotesIn(vault, selection.path);

  await ensureScanned(vault);
  if (!available) return [];

  const wanted = foldTag(selection.name);
  const field = selection.kind === "tag" ? "tags" : "attendees";

  return [...cache.values()]
    .map((entry) => entry.note)
    .filter((note) => note[field].some((value) => foldTag(value) === wanted));
}
