import { chmodSync, lstatSync, readdirSync, rmSync, rmdirSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { RemovalFailure } from "../shared/vault-types.js";

/**
 * Removing something from `_trash` for good, and saying exactly what stopped it when
 * something does.
 *
 * Split out of `vault-io.ts` because permanent deletion turned out to be the one file
 * operation in this app that keeps failing on Windows for reasons nothing here can see.
 * The first attempt at it (B57) removed the app's own suspect — chokidar's per-directory
 * `fs.watch` handle — and the report came back unchanged, which is how a diagnosis is
 * shown to have been incomplete rather than wrong. So this module stops asserting a cause
 * and starts reporting one: the `code` the operating system gave, and **which entry**
 * refused, since "the folder will not go" is almost always one file inside it.
 *
 * Nothing here is Electron-bound, so all of it is testable directly — the same reason
 * `vault-io.ts` and `remote-image.ts` are shaped this way.
 */

/**
 * `maxRetries` engages Node's Windows backoff for EBUSY, EPERM, EMFILE, ENFILE and
 * ENOTEMPTY, which is off entirely at the default of zero — `force` only suppresses
 * ENOENT. A second of retrying, no more: past that it is not transient, and the caller
 * has something to say.
 */
export const REMOVE_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
} as const;

export type { RemovalFailure };

export type RemovalOutcome = { removed: true } | { removed: false; failure: RemovalFailure };

function codeOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && code !== "" ? code : "UNKNOWN";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Clears the read-only attribute on everything under `target`, ignoring anything that
 * will not budge.
 *
 * This is a Windows fix wearing POSIX clothes: on `win32` Node maps `chmod` onto
 * `FILE_ATTRIBUTE_READONLY` and nothing else, and a read-only *file* makes `rmSync` throw
 * `EPERM` — which reads exactly like a lock held by another process and is not one. A
 * synced OneDrive folder is a place where files acquire that attribute without anyone
 * setting it deliberately. Node's own `rm` does retry EPERM, but retrying is no use
 * against an attribute: it is still read-only a second later.
 *
 * Deliberately best-effort. Every failure here is left for `rmSync` to report properly,
 * because *this* function failing is not itself the answer to anything.
 */
export function clearReadOnly(target: string): void {
  let stats;
  try {
    stats = lstatSync(target);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    let entries: string[] = [];
    try {
      entries = readdirSync(target);
    } catch {
      entries = [];
    }
    for (const entry of entries) clearReadOnly(join(target, entry));
  }

  // A symlink's own attributes are not what would block the unlink, and following one
  // out of the trash to chmod whatever it points at is precisely what `emptyTrash`'s
  // `realpathSync` guard exists to prevent.
  if (stats.isSymbolicLink()) return;

  // A *directory* is only touched on Windows, and the asymmetry is the point. There
  // `RemoveDirectory` refuses a directory carrying `FILE_ATTRIBUTE_READONLY`, and `chmod`
  // is the only way Node can clear it. On POSIX a directory's mode is a real permission
  // that this app has no business rewriting on its way past — and it is not what blocks a
  // delete there either: removing a *child* depends on the parent's write bit, which the
  // recursion above has already reached from the other side.
  if (stats.isDirectory() && process.platform !== "win32") return;

  try {
    chmodSync(target, stats.isDirectory() ? 0o700 : 0o600);
  } catch {
    // Left to `rmSync` to report.
  }
}

/**
 * Walks the tree bottom-up removing one entry at a time, and answers with the first one
 * that will not go.
 *
 * Only ever runs after `rmSync` has already failed, so it costs nothing on the path that
 * works. What it buys is the difference between "this folder could not be removed" and
 * "`_trash\Alpha\offerte.pdf` — EBUSY", which is the sentence that ends an investigation:
 * a named file points at whatever has it open (a viewer, a sync client, a scanner), where
 * a named folder points at nothing in particular.
 */
export function findRemovalCulprit(vault: string, target: string): RemovalFailure | null {
  let stats;
  try {
    stats = lstatSync(target);
  } catch {
    // Gone between the failure and this walk — not the culprit.
    return null;
  }

  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    let entries: string[] = [];
    try {
      entries = readdirSync(target);
    } catch (error) {
      return { path: toRelative(vault, target), code: codeOf(error), message: messageOf(error) };
    }

    for (const entry of entries) {
      const found = findRemovalCulprit(vault, join(target, entry));
      if (found !== null) return found;
    }
  }

  try {
    if (stats.isDirectory() && !stats.isSymbolicLink()) rmdirSync(target);
    else unlinkSync(target);
    return null;
  } catch (error) {
    return { path: toRelative(vault, target), code: codeOf(error), message: messageOf(error) };
  }
}

function toRelative(vault: string, target: string): string {
  return relative(vault, target).split(sep).join("/");
}

/**
 * Removes one path inside the trash, and reports precisely if it cannot.
 *
 * The caller has already checked — with `realpathSync`, on both sides — that this really
 * is inside `<vault>/_trash`. This function does the removing and nothing else, so that
 * the guard stays in one place (B24) and this stays testable without one.
 */
export function removeFromTrash(vault: string, target: string): RemovalOutcome {
  clearReadOnly(target);

  try {
    rmSync(target, REMOVE_OPTIONS);
    return { removed: true };
  } catch (error) {
    // The error `rmSync` throws for a tree names the *root* it was asked to remove, which
    // is the one path already known. The walk below names the file that actually refused.
    const culprit = findRemovalCulprit(vault, target);
    return {
      removed: false,
      failure: culprit ?? {
        path: toRelative(vault, target),
        code: codeOf(error),
        message: messageOf(error),
      },
    };
  }
}
