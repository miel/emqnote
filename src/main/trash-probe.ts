import { closeSync, existsSync, lstatSync, openSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { TRASH_FOLDER } from "../shared/vault-types.js";

/**
 * `--trash-probe=<path>`: why something in `_trash` will not go.
 *
 * The same reason `--thumbnail-probe` exists. "Permanently deleting a folder does not
 * work" was reported, diagnosed as this app's own watcher holding a directory handle,
 * fixed (B57) — and reported again, word for word, on the build that fixed it. At that
 * point guessing has had its turn: this walks the tree the delete would walk and says,
 * per entry, what is true of it right now.
 *
 * **It deletes nothing.** The question is which entry refuses and why, and answering it by
 * destroying the evidence would be a poor trade on the one operation in this app that
 * cannot be undone (B24). The liveness test is `open(path, "r+")` instead: on Windows that
 * fails with EBUSY or EPERM exactly when another process holds the file without sharing
 * write access, which is the condition that also stops the file — and so its whole folder
 * — from being removed.
 *
 * Runs alongside the resident instance, like the other probes, because the interesting
 * case is precisely the everyday app being up: if quitting emqnote first makes the delete
 * work, the app is the holder, and that is worth knowing too.
 *
 * Electron-free on purpose, so all of it is testable without a build.
 */

export interface ProbedEntry {
  /** Vault-relative, `/`-separated, as everything that crosses IPC in this app is. */
  path: string;
  kind: "file" | "directory" | "symlink" | "other";
  /** Windows' `FILE_ATTRIBUTE_READONLY`, which is all `chmod` means there. */
  readOnly: boolean;
  /** `null` when the file opened for writing — nothing holds it. Otherwise the code. */
  heldBy: string | null;
}

export type TrashProbe =
  | { step: "no-vault" }
  | { step: "not-in-trash"; realPath: string }
  | { step: "missing"; target: string }
  | { step: "walked"; target: string; entries: ProbedEntry[] };

function codeOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && code !== "" ? code : "UNKNOWN";
}

function toPosix(vault: string, target: string): string {
  return relative(vault, target).split(sep).join("/");
}

/**
 * Whether anything else has this file open in a way that would stop it being removed.
 *
 * Two things this cannot see, and both belong in the output rather than in a footnote.
 * **A directory is never asked**, because a directory cannot be opened for writing on any
 * platform — so a handle held on one is invisible here, which is precisely what B57 was
 * about. And **on POSIX this says almost nothing**: locking there is advisory, so a file
 * another process has open still opens for writing perfectly happily. It is a Windows
 * signal, which is where the bug is.
 *
 * Never asked of a read-only file either. That fails with EACCES for a reason that has
 * nothing to do with holders, and reporting it as one would be this probe making up
 * exactly the sort of confident wrong answer it exists to replace.
 */
function heldBy(target: string): string | null {
  try {
    const handle = openSync(target, "r+");
    closeSync(handle);
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

function probeEntry(vault: string, target: string): ProbedEntry {
  const stats = lstatSync(target);
  const kind = stats.isSymbolicLink()
    ? "symlink"
    : stats.isDirectory()
      ? "directory"
      : stats.isFile()
        ? "file"
        : "other";

  // The owner-write bit is the only one Windows maps, so it is the only one asked about.
  const readOnly = (stats.mode & 0o200) === 0;

  return {
    path: toPosix(vault, target),
    kind,
    readOnly,
    heldBy: kind === "file" && !readOnly ? heldBy(target) : null,
  };
}

function walk(vault: string, target: string, into: ProbedEntry[]): void {
  let entry: ProbedEntry;
  try {
    entry = probeEntry(vault, target);
  } catch (error) {
    into.push({
      path: toPosix(vault, target),
      kind: "other",
      readOnly: false,
      heldBy: codeOf(error),
    });
    return;
  }

  into.push(entry);
  if (entry.kind !== "directory") return;

  try {
    for (const child of readdirSync(target)) walk(vault, join(target, child), into);
  } catch {
    // Already reported as an entry above; a directory that cannot be listed is itself the
    // finding, and there is nothing below it to say anything about.
  }
}

/**
 * Walks what a permanent delete of `path` would walk, reporting on every entry.
 *
 * The guard is `deleteFromTrash`'s, deliberately repeated rather than shared: this runs
 * against a path typed on a command line, so it has to refuse the same things for the same
 * reasons — and being a separate copy is what stops a future relaxation here from quietly
 * relaxing the real delete too.
 */
export function probeTrashPath(vault: string | null, path: string): TrashProbe {
  if (vault === null) return { step: "no-vault" };

  const target = join(vault, path);
  if (!existsSync(target)) return { step: "missing", target };

  const realTrash = join(realpathSync(vault), TRASH_FOLDER);
  const realTarget = realpathSync(target);
  if (!realTarget.startsWith(realTrash + sep)) {
    return { step: "not-in-trash", realPath: realTarget };
  }

  const entries: ProbedEntry[] = [];
  walk(vault, target, entries);
  return { step: "walked", target, entries };
}

/** Prints the probe and answers a process exit code: 0 when nothing looks wrong. */
export function reportTrashProbe(probe: TrashProbe): number {
  switch (probe.step) {
    case "no-vault":
      console.log("no vault is configured, so there is no trash to look in");
      return 2;

    case "missing":
      console.log(`nothing at ${probe.target} — already gone, or the path is wrong`);
      return 2;

    case "not-in-trash":
      console.log(
        `${probe.realPath} is not inside the vault's own _trash folder, so the app would ` +
          `refuse to delete it whatever else is true`,
      );
      return 2;

    case "walked": {
      const held = probe.entries.filter((entry) => entry.heldBy !== null);
      const readOnly = probe.entries.filter((entry) => entry.readOnly);

      console.log(`${probe.target}\n${probe.entries.length} entries\n`);
      for (const entry of probe.entries) {
        const notes = [
          entry.kind,
          entry.readOnly ? "read-only" : null,
          entry.heldBy === null ? null : `held (${entry.heldBy})`,
        ].filter((note) => note !== null);
        console.log(`  ${entry.path} — ${notes.join(", ")}`);
      }

      console.log("");
      if (process.platform !== "win32") {
        console.log(
          "note: locking is advisory here, so the held check is a Windows signal and " +
            "means little on this platform. Read-only is reported everywhere.",
        );
      }
      if (held.length === 0 && readOnly.length === 0) {
        console.log(
          "nothing here is read-only and no file is held by another process. If the " +
            "delete still fails, the handle is on a directory rather than a file — which " +
            "this probe cannot see — so try again with emqnote quit: if it works then, " +
            "the app is the holder.",
        );
        return 0;
      }
      if (readOnly.length > 0) {
        console.log(
          `${readOnly.length} entries are read-only. The app clears that attribute before ` +
            `deleting (see trash-delete.ts), so this is a finding about the files rather ` +
            `than about the delete.`,
        );
      }
      if (held.length > 0) {
        console.log(
          `${held.length} entries are open in another process. That is what stops the ` +
            `folder around them being removed — a PDF left open in a viewer, OneDrive ` +
            `mid-sync, or a virus scanner reading it.`,
        );
      }
      return 1;
    }
  }
}
