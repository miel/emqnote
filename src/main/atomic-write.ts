import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { clearReadOnly } from "./trash-delete.js";

/**
 * Writing a note file, and saying what happened when it will not go.
 *
 * Split out of `vault-io.ts` and `capture-store.ts`, which each had their own private
 * `writeAtomic` doing `.tmp` + `rename()`. The two agreed on the mechanism and on
 * nothing else, and what neither of them had is the reason this module exists.
 *
 * **A note write that fails must not fail silently, must not fail permanently, and must
 * not lose the text it was carrying.** All three were violated at once on 31 August 2026:
 * OneDrive held a just-created note in `00 Inbox` open, `rename()` came back `EPERM`, and
 * the note stopped being saved from that moment on — for the rest of the day, with
 * nothing on screen saying so. The two thirds the user typed after that point had been
 * in the editor the whole time and were never written anywhere. See `HISTORY.md`.
 *
 * So, in order:
 *
 * - **Retry.** `trash-delete.ts` already knew that `EPERM` from a synced OneDrive folder
 *   is usually transient (the sync client holding the file for its upload) or an
 *   attribute (`FILE_ATTRIBUTE_READONLY`, which a synced folder hands out without anyone
 *   asking). It retries for that reason. The path that *deletes* did; the path that
 *   *writes* did not, which is the wrong way round — a delete that fails is an annoyance,
 *   a write that fails is lost work.
 * - **Clear the read-only attribute between attempts,** because retrying is no use
 *   against an attribute: it is still read-only a second later. Same argument, same
 *   helper, as `removeFromTrash`.
 * - **A unique temporary name.** The old fixed `${file}.tmp` meant a failed write's copy
 *   was overwritten by the next write of the same note — so the one surviving copy of the
 *   text was destroyed by the app's own next save, which is exactly what happened when
 *   the app was restarted after the incident and the truncated note was opened again.
 * - **A recovery copy outside the vault** when every attempt has failed. This is the one
 *   that would have saved the note: the full text was in the renderer's document the
 *   whole time and the app had nowhere it was willing to put it. It goes to `userData`,
 *   deliberately *not* to the vault — the vault is the thing that is refusing writes, and
 *   a recovery copy that lands next to the file it is recovering from is no recovery.
 *
 * Electron-free, like `vault-io.ts`, `vault-scan.ts` and `trash-delete.ts` beside it, so
 * the rules can be tested directly rather than behind a mocked runtime. That is why the
 * recovery directory is *set* (`setRecoveryDirectory`) rather than read from
 * `app.getPath("userData")` here.
 */

/**
 * Where a write that could not land leaves its copy. Null until `index.ts` sets it, and
 * null in a test that has not asked for one — in which case the temporary file is left
 * where it is instead, since something on disk beats nothing.
 */
let recoveryDirectory: string | null = null;

export function setRecoveryDirectory(directory: string | null): void {
  recoveryDirectory = directory;
}

export function getRecoveryDirectory(): string | null {
  return recoveryDirectory;
}

/**
 * Codes worth a second attempt.
 *
 * `EPERM` and `EACCES` are what Windows answers when the destination is held open or
 * carries the read-only attribute; `EBUSY` is the same story under a different name.
 * `EMFILE`/`ENFILE` are descriptor exhaustion, transient by definition. Everything else —
 * `ENOSPC`, `EROFS`, `ENOENT` — is a standing condition that a delay does not change, and
 * retrying it only delays the report.
 */
const RETRYABLE = new Set(["EPERM", "EACCES", "EBUSY", "EMFILE", "ENFILE"]);

/**
 * Waits between attempts, in milliseconds — five attempts, ~750 ms in the worst case.
 * Deliberately shorter than `trash-delete.ts`'s ten-times-100 ms: a note that cannot be
 * written in three quarters of a second is a note whose author should be told rather than
 * made to wait.
 */
const RETRY_DELAYS_MS = [50, 100, 200, 400] as const;

/**
 * And a shorter budget for the synchronous variant, because there the wait is paid by the
 * whole main process (see `sleepSync`).
 *
 * Three attempts, 150 ms. The asymmetry is deliberate rather than a compromise: a note the
 * capture window is composing goes through `writeAtomicAsync` and gets the full budget for
 * nothing, while the sync callers — the reader's save, `toggleTask`, `setPinned` — would
 * otherwise stall every IPC reply in the app for three quarters of a second *per keystroke
 * batch* while a note stays unwritable. Retrying is worth a hitch; it is not worth that.
 * A failure the short budget gives up on is still reported, and the next debounced write
 * tries again anyway.
 */
const SYNC_RETRY_DELAYS_MS = [50, 100] as const;

function codeOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && code !== "" ? code : "UNKNOWN";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Thrown when every attempt has failed. Carries the OS's own `code` and — when one could
 * be written — where the text ended up, because "could not save" without "and here is
 * what you typed" is only half an answer.
 */
export class AtomicWriteError extends Error {
  readonly code: string;
  readonly recoveryPath: string | null;

  constructor(file: string, cause: unknown, recoveryPath: string | null) {
    super(`Could not write ${file}: ${messageOf(cause)}`);
    this.name = "AtomicWriteError";
    this.code = codeOf(cause);
    this.recoveryPath = recoveryPath;
  }
}

/**
 * Blocks the calling thread. Only ever reached between two failed attempts on the
 * synchronous path, which is why it is acceptable at all: `writeAtomicSync` is what the
 * library reader's save, `toggleTask` and `setPinned` go through, and those are already
 * synchronous main-process work. `Atomics.wait` rather than a spin, so the wait costs no
 * CPU.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * A temporary name no other write can be holding.
 *
 * The counter is what makes it unique *within* a process — two writes to one note a
 * millisecond apart would otherwise share a name — and the pid is what makes it unique
 * across them, since a second emqnote (`--selftest`, `--dump-clipboard`) can be pointed
 * at the same vault. The `.tmp` suffix stays last so `isNoteFile` still says no: a
 * half-written note must never be listed as a note.
 */
let counter = 0;
function temporaryNameFor(file: string): string {
  counter += 1;
  return `${file}.${process.pid}-${counter}.tmp`;
}

/** `2026-08-31T09-14-22` — a filename, so no colons, and sortable. */
function stampNow(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "").replace(/:/g, "-");
}

function recoveryPathFor(file: string): string | null {
  if (recoveryDirectory === null) return null;
  return join(recoveryDirectory, `${stampNow()}-${basename(file)}`);
}

/**
 * Last resort: put the text somewhere it can be read back by hand.
 *
 * Best-effort by construction — it runs only when the real write has already failed, and
 * a failure *here* must not replace the failure the caller actually needs to hear about.
 * Answers the path when it worked, null when it did not, and that null is what makes
 * `AtomicWriteError.recoveryPath` honest rather than hopeful.
 */
function writeRecoverySync(file: string, contents: string): string | null {
  const target = recoveryPathFor(file);
  if (target === null) return null;
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
    return target;
  } catch {
    return null;
  }
}

async function writeRecovery(file: string, contents: string): Promise<string | null> {
  const target = recoveryPathFor(file);
  if (target === null) return null;
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
    return target;
  } catch {
    return null;
  }
}

/**
 * Clears the destination's read-only attribute before a retry, on Windows only.
 *
 * The guard is not caution, it is correctness. On Windows `chmod` maps onto
 * `FILE_ATTRIBUTE_READONLY` and nothing else, so clearing it is exactly the repair
 * needed and costs the file nothing. On POSIX the same call rewrites a real permission
 * on a user's own note — and it is not what would be blocking the write there anyway,
 * where `EPERM` on a rename means something a mode bit will not fix.
 */
function prepareRetry(file: string): void {
  if (process.platform !== "win32") return;
  clearReadOnly(file);
}

/**
 * What happens after every attempt has failed, shared by both variants: leave the text
 * somewhere, and clean up after the attempt that did not land.
 *
 * The temporary file is removed *only* when a recovery copy was written. Without a
 * recovery directory it is the only surviving copy of the text, and deleting the sole
 * copy of the user's work to keep the folder tidy is the precise mistake this whole
 * module exists because of.
 */
function settleFailureSync(
  file: string,
  temporary: string,
  contents: string,
  cause: unknown,
): never {
  const recovery = writeRecoverySync(file, contents);
  if (recovery !== null) {
    try {
      unlinkSync(temporary);
    } catch {
      // The recovery copy is written; a temporary left behind is untidy, not lost work.
    }
  }
  throw new AtomicWriteError(file, cause, recovery);
}

/**
 * Writes `contents` to `file`, atomically, retrying what is worth retrying.
 *
 * Synchronous, for the callers in `vault-io.ts` that already are: the library reader's
 * save, `toggleTask`, `setPinned`, `renameNote`, `rewriteWikiLinks`. Throws
 * `AtomicWriteError` when it cannot, never a bare `ENOENT`-shaped surprise.
 */
export function writeAtomicSync(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = temporaryNameFor(file);
  writeFileSync(temporary, contents, "utf8");

  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(temporary, file);
      return;
    } catch (error) {
      const delay = SYNC_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !RETRYABLE.has(codeOf(error))) {
        settleFailureSync(file, temporary, contents, error);
      }
      sleepSync(delay);
      prepareRetry(file);
    }
  }
}

/**
 * `writeAtomicSync`'s asynchronous twin, for `capture-store.ts` — the per-keystroke
 * write path, which must not block the main process while the capture window is being
 * typed into.
 */
export async function writeAtomicAsync(file: string, contents: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = temporaryNameFor(file);
  await writeFile(temporary, contents, "utf8");

  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, file);
      return;
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !RETRYABLE.has(codeOf(error))) {
        const recovery = await writeRecovery(file, contents);
        if (recovery !== null) {
          try {
            await unlink(temporary);
          } catch {
            // See `settleFailureSync`.
          }
        }
        throw new AtomicWriteError(file, error, recovery);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      prepareRetry(file);
    }
  }
}
