import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, type Dirent, type Stats } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Node as PMNode } from "prosemirror-model";
import {
  collectWikiLinkTargets,
  parseNote,
  plainText,
  taskItemsIn,
  taskItemText,
} from "../markdown/index.js";
import { TRASH_FOLDER, type ScanProgress } from "../shared/vault-types.js";
import {
  allNotes,
  deleteNote,
  needsRefresh,
  upsertNote,
  type IndexDb,
  type NoteRecord,
  type TaskExtract,
} from "./index-db.js";
import { isHidden, summarise } from "./vault-io.js";
import { checkFilesOnDemand } from "./vault.js";
import { isNoteFile } from "./note-files.js";

/**
 * Building the SQLite index from what is actually on disk — `02-technisch-ontwerp.md`
 * §7.2's "eerste start: volledige scan met voortgangsbalk, in een worker". Being
 * Electron-free was what let this move into that worker unchanged, and is now what keeps
 * it there: `scan-worker.ts` runs this file on a thread where Electron's modules do not
 * exist, so an import of one here would break the scan rather than merely widen a bundle.
 * `check:bundle` fails on that, and `scan-host.ts` falls back to the main thread if it
 * ever happens anyway. It still runs in-process too — that fallback, and every test.
 *
 * `collectFiles`/`isDataless` used to live in `vault-scan.ts` and be shared from there,
 * back when that module did its own walk over an in-memory Map. Now that `vault-scan.ts`
 * is a query layer over this index instead (see its own comment), this is their only
 * caller and their one home. What they encode is still exactly the two rules that must
 * not drift regardless of which module owns them: which folders never count as vault
 * content, and how a OneDrive placeholder is told apart from a real file.
 *
 * On that second rule, this scan diverges from what the old Map did with a dataless
 * file: a note whose file has gone dataless (evicted from local disk by OneDrive Files
 * On-Demand) still belongs in a *persistent* index. The Map was rebuilt from nothing on
 * every scan, so skipping a placeholder there just meant "not shown until it hydrates"
 * — there was no old copy to lose. Dropping it from SQLite would mean a note the user
 * can search for on Monday silently stops matching on Tuesday because OneDrive decided
 * to evict a file nobody touched. So a dataless file keeps its last-indexed row and is
 * simply not re-read.
 */

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
      } else if (entry.isFile() && isNoteFile(entry.name)) {
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
 * not, which is why there is also the up-front check in `fullScan`.
 */
function isDataless(stats: { size: number; blocks: number }): boolean {
  return process.platform === "darwin" && stats.size > 0 && stats.blocks === 0;
}

export type ScanResult = "ok" | "ondemand";

function hashOf(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/**
 * Every task item in a parsed document, in document order — what fills `note_tasks`.
 *
 * `taskItemsIn` is the one place that decides what counts as a task item and in what
 * order; `toggleTask` in `vault-io.ts` walks the same way when it re-parses a file to
 * flip one, so "ordinal 3" names the same `listItem` on both sides of the index/file
 * boundary without the two ever having to coordinate directly.
 */
export function extractTasks(doc: PMNode): TaskExtract[] {
  return taskItemsIn(doc).map(({ node }, ordinal) => ({
    ordinal,
    checked: node.attrs.checked === true,
    text: taskItemText(node),
  }));
}

/** Shared with `index-watch.ts`, so an incremental reindex builds a note the same way a full scan does. */
export function buildRecord(vault: string, file: string, raw: string, stats: Stats): NoteRecord {
  const summary = summarise(vault, file, raw, stats.mtime);
  const { frontmatter, doc } = parseNote(raw);

  return {
    path: summary.path,
    fileName: summary.fileName,
    title: summary.title,
    type: summary.kind,
    created: summary.created,
    modified: summary.modified,
    location: frontmatter.location ?? "",
    attendees: summary.attendees,
    tags: summary.tags,
    excerpt: summary.excerpt,
    mtime: stats.mtimeMs,
    size: stats.size,
    hash: hashOf(raw),
    body: plainText(doc),
    tasks: extractTasks(doc),
    // Same arrangement as `tasks`, and shared with the watcher for the same reason: the
    // one place a note becomes a row is also the one place its links become rows, so an
    // incremental reindex can never leave `note_links` describing an older version of a
    // note than `notes` does.
    links: collectWikiLinkTargets(doc),
  };
}

/**
 * A hundred files is roughly half a second of work, so this never was the thing keeping
 * the main thread's stalls inside the hotkey's 80 ms budget — measured at 470–535 ms
 * worst case before the scan moved off it (see `TODO.md`). What it does buy, on the
 * worker's own thread, is that progress messages can actually leave while the walk runs.
 */
const YIELD_EVERY = 100;

function breathe(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

/**
 * Walks the whole vault and brings the index up to date: every file that is new,
 * changed (by `mtime`+`size`, the same cheap check `index-db.ts`'s `needsRefresh` does),
 * or gone gets reflected. A file that has not changed costs one `stat` and nothing else.
 *
 * Returns `"ondemand"` without touching the index at all when the vault looks like an
 * un-hydrated OneDrive folder — reading a few thousand placeholders would each force a
 * blocking download, exactly what `checkFilesOnDemand` exists to head off.
 */
export async function fullScan(
  vault: string,
  db: IndexDb,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  if ((await checkFilesOnDemand(vault)) === "ondemand") return "ondemand";

  const files = collectFiles(vault);
  const seen = new Set<string>();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;

    let stats: Stats;
    try {
      stats = statSync(file);
    } catch {
      // Gone between the directory listing and here; not in `seen`, so the
      // reconciliation pass below removes it from the index same as a real deletion.
      continue;
    }

    const path = toPosix(relative(vault, file));
    seen.add(path);

    if (!isDataless(stats) && needsRefresh(db, path, stats.mtimeMs, stats.size)) {
      try {
        upsertNote(db, buildRecord(vault, file, readFileSync(file, "utf8"), stats));
      } catch {
        // Unreadable right now (a transient OneDrive hiccup, a permissions error).
        // Whatever was indexed before stays as it was; the next scan tries again.
      }
    }

    onProgress?.({ done: index + 1, total: files.length });
    if ((index + 1) % YIELD_EVERY === 0) await breathe();
  }

  for (const indexed of allNotes(db)) {
    if (!seen.has(indexed.path)) deleteNote(db, indexed.path);
  }

  return "ok";
}
