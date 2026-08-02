import { watch } from "chokidar";
import { readFileSync, statSync } from "node:fs";
import { relative, sep } from "node:path";
import { TRASH_FOLDER } from "../shared/vault-types.js";
import { buildRecord } from "./index-scan.js";
import { deleteNote, upsertNote, type IndexDb } from "./index-db.js";
import { isHidden } from "./vault-io.js";

/**
 * Keeps the index in step with the vault after the initial full scan — `02-technisch-
 * ontwerp.md` §7.2: chokidar, 300 ms debounce, reindex the one file that changed. This
 * is what makes a change made on the other machine show up without waiting for
 * something else (opening the library, say) to trigger a rescan; the acceptance
 * criterion in `04-bouwplan.md` is that it does so within 5 seconds of the OneDrive
 * sync landing.
 *
 * The 300 ms debounce is chokidar's own `awaitWriteFinish` — it polls a file's size and
 * only fires once that has stopped changing for the threshold — rather than a
 * hand-rolled timer on top of a plain fs watch. That distinction matters here
 * specifically: OneDrive can write a synced file over several separate writes, and a
 * plain "fire on first change event" watch would index a half-written file partway
 * through. `awaitWriteFinish` is built to survive exactly that.
 *
 * `ignoreInitial: true` is what keeps this purely incremental: the full scan already
 * covers everything that exists when the app starts, so a watcher that also fired
 * `add` for every one of those files on startup would just double the same work.
 */

export interface WatchOptions {
  /**
   * Overrides the 300 ms production default — only so tests are not stuck waiting
   * 300 ms per assertion. `04-bouwplan.md` §Tests wants the whole suite under about two
   * seconds.
   */
  stabilityThreshold?: number;
  /** Called after every reindex or removal, so the caller can refresh whatever is on screen. */
  onChange?: () => void;
}

export interface VaultWatcher {
  close(): Promise<void>;
  /**
   * Resolves once the initial crawl chokidar does before it starts actually watching
   * has finished. `ignoreInitial` only suppresses the `add` events that crawl would
   * otherwise fire for every existing file — it does not make the watcher attach any
   * faster, so a write immediately after `watchVault` returns can race it and be
   * missed. Nothing in the app needs to await this today (the full scan already covers
   * startup state), but a caller that does need the guarantee — a test, first of all —
   * has it available rather than reaching for an arbitrary delay.
   */
  ready(): Promise<void>;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/** Same rule `collectFiles` walks by: skip the folders the app owns and the trash, at any depth. */
function isIgnoredPath(vault: string, path: string): boolean {
  const rel = relative(vault, path);
  if (rel === "") return false;
  return rel.split(sep).some((part) => isHidden(part) || part === TRASH_FOLDER);
}

export function watchVault(vault: string, db: IndexDb, options: WatchOptions = {}): VaultWatcher {
  const stabilityThreshold = options.stabilityThreshold ?? 300;

  const reindex = (path: string): void => {
    if (!path.endsWith(".md")) return;

    try {
      const stats = statSync(path);
      upsertNote(db, buildRecord(vault, path, readFileSync(path, "utf8"), stats));
    } catch {
      // Gone, or unreadable, by the time this ran — a rename mid-flight, most likely.
      // The `unlink` event chokidar sends for a real deletion is what reconciles that;
      // nothing needs doing here beyond not indexing bytes that were never settled.
    }
    options.onChange?.();
  };

  const forget = (path: string): void => {
    if (!path.endsWith(".md")) return;
    deleteNote(db, toPosix(relative(vault, path)));
    options.onChange?.();
  };

  const watcher = watch(vault, {
    ignoreInitial: true,
    ignored: (path: string) => isIgnoredPath(vault, path),
    awaitWriteFinish: { stabilityThreshold, pollInterval: 20 },
  });

  watcher.on("add", reindex);
  watcher.on("change", reindex);
  watcher.on("unlink", forget);

  const ready = new Promise<void>((resolve) => watcher.once("ready", resolve));

  return {
    close: () => watcher.close(),
    ready: () => ready,
  };
}
