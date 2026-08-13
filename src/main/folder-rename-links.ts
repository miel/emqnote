import { linkTargetFor } from "./link-resolve.js";

/**
 * What has to be rewritten when a folder is renamed — B44.
 *
 * `renameFolder` (`vault-io.ts`) used to carry the line *"Nothing inside needs rewriting:
 * wikilinks and embeds carry bare names, not paths"*. That was true when it was written
 * and stopped being true at B35: a link this app writes is `[[01 Projecten/2026-08-05 1030
 * Rules|Rules]]`, a path, and B41's picker made that the only spelling the app ever
 * produces. So renaming the folder moved every note inside it and left every link into it
 * pointing at a path that no longer exists — silently, since a broken note link is
 * deliberately understated until it is clicked (B35's own reasoning, and the right call
 * for a link to a note not yet written; the wrong one for a link this app just broke).
 *
 * Electron-free and database-free, like `link-resolve.ts` and `attachment-route.ts`
 * beside it: what the rewrite *is* is worth pinning in a test, and the handler that
 * carries it out — one `renameSync` and a loop over `rewriteWikiLinks` — is not reachable
 * from one.
 *
 * Two things here are easy to get wrong and are the reason this is a module rather than
 * four lines in the handler:
 *
 * - **A referring note may itself be inside the folder.** A note in `Klant A` linking to
 *   its neighbour in `Klant A` has to be rewritten *at its new path*, because by the time
 *   the write happens the file is no longer where the index said it was. Missing this
 *   writes to a path that no longer exists, which `rewriteWikiLinks` skips in silence.
 * - **The new target is composed, never re-resolved.** Asking the index again after the
 *   rename would mean re-scanning first, and the answer is arithmetic: the same path with
 *   one prefix swapped for another.
 */

/** One note that links into the renamed folder, and the target spellings it uses. */
export interface Referrer {
  path: string;
  targets: string[];
}

/** One rewrite: the notes to touch, and the target spelling they should end up with. */
export interface FolderLinkRewrite {
  references: Referrer[];
  newTarget: string;
}

/** `a/b` under `a` is `true`; `a` itself and `ab/c` are not. */
export function isUnder(path: string, folder: string): boolean {
  if (folder === "") return true;
  return path.startsWith(`${folder}/`);
}

/** The path a file inside `from` takes when `from` is renamed to `to`. */
export function movedPath(path: string, from: string, to: string): string {
  if (!isUnder(path, from)) return path;
  return from === "" ? `${to}/${path}` : `${to}${path.slice(from.length)}`;
}

/**
 * Turns "these notes link to these notes, and this folder is about to move" into the list
 * of writes to make afterwards.
 *
 * `linking` is keyed by the *moving* note's path as the index knows it now — exactly what
 * `linkingNotesUnder` answers — and every path in it, on both sides, is pre-rename.
 * Everything this returns is post-rename, which is the whole of the translation.
 *
 * A note that links only to itself is already dropped by `linkingNotes`; a folder whose
 * name did not actually change produces no writes, since the target would be identical
 * and `rewriteWikiLinks` would rewrite each link to the spelling it already has —
 * harmlessly, but touching a file for nothing is exactly what B10 is about.
 */
export function folderRenameRewrites(
  from: string,
  to: string,
  linking: Map<string, Referrer[]>,
): FolderLinkRewrite[] {
  if (from === to) return [];

  const rewrites: FolderLinkRewrite[] = [];

  for (const [notePath, referrers] of linking) {
    if (referrers.length === 0) continue;

    rewrites.push({
      references: referrers.map((referrer) => ({
        path: movedPath(referrer.path, from, to),
        targets: referrer.targets,
      })),
      newTarget: linkTargetFor(movedPath(notePath, from, to)),
    });
  }

  return rewrites;
}
