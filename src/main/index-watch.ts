import { watch } from "chokidar";
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { TRASH_FOLDER, type VaultFileEvent } from "../shared/vault-types.js";
import { buildRecord } from "./index-scan.js";
import { deleteNote, deleteNotesUnder, upsertNote, type IndexDb } from "./index-db.js";
import { isHidden } from "./vault-io.js";
import { isNoteFile } from "./note-files.js";

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

/**
 * How often the Windows poller looks. Slower than a native watch notices, and well
 * inside `04-bouwplan.md`'s "within 5 seconds of the OneDrive sync landing" — that
 * criterion is what sets the ceiling here, not comfort.
 */
export const POLL_INTERVAL_MS = 2000;

/**
 * On Windows the vault is watched by polling, and that is a trade made on purpose.
 *
 * chokidar's native handler calls `fs.watch` on every directory it watches, recursively.
 * On Windows that is an open `FILE_LIST_DIRECTORY` kernel handle on every folder in the
 * vault, held for as long as the app is resident — and this app is resident all day by
 * design (B2/B3). Two things follow, and both were reported from real use:
 *
 * - OneDrive could not update a folder renamed on the other machine, because this app
 *   was holding it. An app that blocks the sync tool its own vault lives on is worse
 *   than an app that polls.
 * - Permanently deleting a folder out of the trash failed. A handle follows the file
 *   object, not the path, so `trashFolder`'s rename carried the watcher's handles into
 *   `_trash` along with the folder — ignored by `isIgnoredPath` or not — and Windows
 *   refuses to remove a directory anything still has open. Files were never affected,
 *   because chokidar opens no handle on a file; that asymmetry is exactly what the two
 *   reports described.
 *
 * With `usePolling` chokidar uses `fs.watchFile` stat polling and `readdir` sweeps
 * instead, which hold nothing open. The cost is a periodic stat sweep of the vault for
 * as long as the app runs, which is a real cost on a large vault and is accepted: it is
 * paid on a background thread's schedule, while the alternative is paid by the sync.
 *
 * macOS keeps native watching, where a watch descriptor blocks nothing.
 * `awaitWriteFinish` applies in either mode, so the reason it is set — OneDrive writing
 * a synced file over several passes — is unaffected.
 */
export function pollingOptions(interval: number = POLL_INTERVAL_MS): {
  usePolling?: true;
  interval?: number;
  binaryInterval?: number;
} {
  if (process.platform !== "win32") return {};
  return { usePolling: true, interval, binaryInterval: interval };
}

export interface WatchOptions {
  /**
   * Overrides the 300 ms production default — only so tests are not stuck waiting
   * 300 ms per assertion. `04-bouwplan.md` §Tests wants the whole suite under about two
   * seconds.
   */
  stabilityThreshold?: number;
  /**
   * Overrides `POLL_INTERVAL_MS`, and exists for the same reason `stabilityThreshold`
   * does — on Windows, where this app watches by polling (see `pollingOptions`), a test
   * that writes a file and waits for the watcher to notice waits out a *whole poll*. At
   * the production interval that is two seconds per assertion, which is how the suite
   * came to spend 23 seconds in one file and then fail a release by running a four-second
   * wait right up against it. Ignored off Windows, where nothing polls.
   */
  watchInterval?: number;
  /**
   * Called after every reindex or removal (single note or whole subtree), so the caller
   * can refresh whatever is on screen and, separately, decide whether to tell an open
   * window about it. `own` says whether this app's own write produced the change (see
   * `own-writes.ts`) — deciding what to *do* with that is not this module's job: it
   * stays free of both the policy (`index.ts`'s `notifyFileEvent`) and a hard dependency
   * on the hash module, via `isOwnWrite` below.
   */
  onChange?: (event: VaultFileEvent & { own: boolean }) => void;
  /**
   * Tells this app's own write apart from a real external one. Injected rather than
   * imported directly, so this module needs no real file-write side effects to be
   * tested and carries no policy of its own about what an own write should mean.
   */
  isOwnWrite?(path: string, contents: string): boolean;
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
   *
   * That race is worse under polling than under a native backend, and it is measured
   * rather than assumed (`test/index-watch.test.ts`'s `startWatching` carries the
   * numbers). A poller finds a new file by re-reading a directory and diffing against the
   * entries it already knows, so a file that lands before that baseline is taken is *in*
   * the baseline and is never reported at all — permanently missed, not merely noticed a
   * poll later. On Windows, where this app polls (B57), the startup full scan running
   * beside the watcher is therefore not just a duplicate of it: for anything OneDrive
   * lands in the first moments after launch, it is the only thing that will see it.
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
    if (!isNoteFile(path)) return;

    try {
      const stats = statSync(path);
      const contents = readFileSync(path, "utf8");
      const own = options.isOwnWrite?.(path, contents) ?? false;
      upsertNote(db, buildRecord(vault, path, contents, stats));
      options.onChange?.({ path: toPosix(relative(vault, path)), kind: "changed", own });
    } catch {
      // Gone, or unreadable, by the time this ran — a rename mid-flight, most likely.
      // The `unlink` event chokidar sends for a real deletion is what reconciles that;
      // nothing needs doing here beyond not indexing bytes that were never settled, and
      // there is no meaningful event to report either — the eventual `unlink`/`add`
      // pair for whatever this really was reports on its own.
    }
  };

  const forget = (path: string): void => {
    if (!isNoteFile(path)) return;

    // Not a defence against this app's own writes — a rename-over-an-existing-path
    // reports as a `change` event on all three platforms, never a delete. This is
    // specifically for OneDrive's own delete-then-recreate dance during sync, and for
    // ordinary rename transients: if the file exists again by the time this runs, it
    // was never really gone, so reindex it instead of reporting a removal that did not
    // happen.
    if (existsSync(path)) {
      reindex(path);
      return;
    }

    const relativePath = toPosix(relative(vault, path));
    deleteNote(db, relativePath);
    options.onChange?.({ path: relativePath, kind: "removed", own: false });
  };

  /**
   * A whole folder deleted outside the app: chokidar does not guarantee a per-file
   * `unlink` for everything that was inside it — that varies by platform and can
   * legitimately collapse into a single directory-level event — so without this a
   * folder deleted in Explorer/Finder would leave every note under it still fully
   * indexed.
   */
  const forgetDir = (path: string): void => {
    const resolvedVault = resolve(vault);
    const resolvedPath = resolve(path);
    // Defensive, even though chokidar should never hand this a path outside the vault
    // or the vault root itself — the same reasoning `trashFolder`/`renameFolder` apply
    // to a typed folder path, just against a filesystem event instead of user input.
    if (resolvedPath === resolvedVault) return;
    if (!resolvedPath.startsWith(resolvedVault + sep)) return;
    if (path.includes("..")) return;

    // Same rename-transient reasoning as `forget`: if the folder exists again by the
    // time this runs, nothing was really deleted.
    if (existsSync(path)) return;

    const prefix = toPosix(relative(vault, path));
    const removed = deleteNotesUnder(db, prefix);
    for (const removedPath of removed) {
      options.onChange?.({ path: removedPath, kind: "removed", own: false });
    }
  };

  const watcher = watch(vault, {
    ignoreInitial: true,
    ignored: (path: string) => isIgnoredPath(vault, path),
    awaitWriteFinish: { stabilityThreshold, pollInterval: 20 },
    // Windows only — see `pollingOptions` for why an app that watches natively there
    // stops OneDrive from doing its job.
    ...pollingOptions(options.watchInterval),
  });

  watcher.on("add", reindex);
  watcher.on("change", reindex);
  watcher.on("unlink", forget);
  watcher.on("unlinkDir", forgetDir);

  const ready = new Promise<void>((resolveReady) => watcher.once("ready", resolveReady));

  return {
    close: () => watcher.close(),
    ready: () => ready,
  };
}
