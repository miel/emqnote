/**
 * What counts as a note file, in one place.
 *
 * The app writes `.md` and only `.md` — `filename.ts`'s `noteFileName` is unchanged and
 * every note it creates ends in it. This module exists for the other direction: a vault
 * is a folder of plain files on a OneDrive, and files arrive in it that this app did not
 * write. `.markdown` is the same format under a longer name, understood by Obsidian and
 * by every editor the user might have written the file in, and refusing to list it made
 * the note invisible in the one app that is supposed to be a window onto that folder.
 *
 * **A file keeps the extension it arrived with.** Editing, renaming or moving a
 * `.markdown` note leaves it `.markdown`; nothing here silently renames a user's file
 * to suit the app's own preference. That is why `noteStem` returns the stem *and*
 * nothing else — the callers that rebuild a filename (`renameNote`, `uniquePath`,
 * `capture-store.ts`'s `renameSessionFile`) re-attach `noteExtension` of the original
 * rather than assuming.
 *
 * Electron-free, like `filename.ts` and `conflicts.ts` beside it, so the rules can be
 * tested directly.
 */

/**
 * Longest first: `noteExtension` matches in this order, and `.md` would otherwise claim
 * nothing that `.markdown` should — they do not overlap as written, but the ordering is
 * what keeps that true if a `.mdown`-style alias is ever added.
 */
export const NOTE_EXTENSIONS = [".markdown", ".md"] as const;

/** The extension new notes are written with. `.markdown` is read, never authored. */
export const DEFAULT_NOTE_EXTENSION = ".md";

/** Whether `name` (a filename or a path) is a note this app will read. */
export function isNoteFile(name: string): boolean {
  const lower = name.toLowerCase();
  return NOTE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * The note extension `name` ends with, spelled as it is on disk, or `""` when it is not
 * a note file. Case is preserved deliberately: a file called `Aantekening.MD` keeps its
 * capitals through a rename, because the alternative is renaming a file the user did
 * not ask to have renamed.
 */
export function noteExtension(name: string): string {
  const lower = name.toLowerCase();
  for (const extension of NOTE_EXTENSIONS) {
    if (lower.endsWith(extension)) return name.slice(name.length - extension.length);
  }
  return "";
}

/** `name` without its note extension. Anything that is not a note file comes back whole. */
export function noteStem(name: string): string {
  const extension = noteExtension(name);
  return extension === "" ? name : name.slice(0, name.length - extension.length);
}
