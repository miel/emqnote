import { createHash } from "node:crypto";
import { readFileSync, statSync, type Stats } from "node:fs";
import { relative, sep } from "node:path";
import { parseNote, plainText } from "../markdown/index.js";
import { allNotes, deleteNote, needsRefresh, upsertNote, type IndexDb, type NoteRecord } from "./index-db.js";
import { summarise } from "./vault-io.js";
import { collectFiles, isDataless } from "./vault-scan.js";
import { checkFilesOnDemand } from "./vault.js";

/**
 * Building the SQLite index from what is actually on disk — `02-technisch-ontwerp.md`
 * §7.2's "eerste start: volledige scan met voortgangsbalk, in een worker". The worker
 * part is not here yet; this is written to be Electron-free like `vault-scan.ts` so it
 * can move into one unchanged, same as that module already does.
 *
 * `vault-scan.ts`'s Map and this rebuild the file walk the same way on purpose —
 * `collectFiles`/`isDataless` are shared, not reimplemented — but they diverge on one
 * thing the Map does not need to care about: a note whose file has gone dataless (a
 * OneDrive Files On-Demand placeholder, evicted from local disk) still belongs in a
 * *persistent* index. The Map is rebuilt from nothing on every scan, so dropping a
 * placeholder from it just means "not shown until it hydrates" — there is no old copy to
 * lose. Dropping it from SQLite would mean a note the user can search for on Monday
 * silently stops matching on Tuesday because OneDrive decided to evict a file nobody
 * touched. So a dataless file keeps its last-indexed row untouched instead.
 */

export interface ScanProgress {
  done: number;
  total: number;
}

export type ScanResult = "ok" | "ondemand";

function hashOf(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function buildRecord(vault: string, file: string, raw: string, stats: Stats): NoteRecord {
  const summary = summarise(vault, file, raw, stats.mtime);
  const { frontmatter, doc } = parseNote(raw);

  return {
    path: summary.path,
    title: summary.title,
    type: summary.kind,
    created: summary.created,
    modified: summary.modified,
    location: frontmatter.location ?? "",
    attendees: summary.attendees,
    tags: summary.tags,
    mtime: stats.mtimeMs,
    size: stats.size,
    hash: hashOf(raw),
    body: plainText(doc),
  };
}

const YIELD_EVERY = 100;

function breathe(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

/**
 * Walks the whole vault and brings the index up to date: every file that is new,
 * changed (by `mtime`+`size`, the same cheap check `vault-scan.ts` already uses), or
 * gone gets reflected. A file that has not changed costs one `stat` and nothing else.
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
