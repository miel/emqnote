import { folderOf } from "../../shared/vault-types.js";

/**
 * Marking several notes in the list at once, so Move and Delete can act on all of them
 * (B94).
 *
 * Pure functions over the list of paths as it currently reads on screen, kept apart from
 * `NoteList.tsx` the way `panes.ts` and `drag.ts` are from theirs: every rule here is
 * about *which rows* a gesture means, and none of it needs a DOM to answer. `roving.ts`
 * next door is the other half of the same job — which row the keyboard is standing on —
 * and stays separate because a roving tab stop exists whether or not anything is marked.
 *
 * **Marked is not the same as selected, and the difference is the whole design.** The note
 * in the reader is what `selected` means, and there is exactly one of it: opening a note
 * is what a plain click does and what this app is for. A *marked* set is a second,
 * temporary thing — the rows a bulk action is about — and it is empty almost all of the
 * time. Nothing about the reader changes when rows are marked, so a mistaken Ctrl+click
 * costs nothing and undoes itself with a plain one.
 */

/**
 * The paths from `from` to `to` inclusive, in the order the list reads.
 *
 * Either end may be the earlier one — a range is dragged upwards as often as downwards —
 * and a path that is no longer in the list (a note moved out from under the anchor) means
 * there is no range to speak of, which answers as just the row that was clicked.
 */
export function rangeBetween(paths: string[], from: string, to: string): string[] {
  const start = paths.indexOf(from);
  const end = paths.indexOf(to);
  if (start === -1 || end === -1) return end === -1 ? [] : [to];
  return paths.slice(Math.min(start, end), Math.max(start, end) + 1);
}

/**
 * Ctrl/Cmd+click: adds a row to the marked set, or takes it back out.
 *
 * **`seed` is the note that is open**, and it is what the first Ctrl+click folds in. Without
 * it, Ctrl+clicking a second note would mark one row — the one just clicked — and the note
 * you were looking at, which is visibly selected, would silently not be part of what
 * happens next. Every file manager on both platforms behaves this way, and the failure
 * mode of getting it wrong is deleting one note fewer or one note more than the screen
 * said.
 *
 * The result keeps the list's own order rather than the order things were clicked in: it is
 * read back as "these rows", and a Move that reported them in click order would say
 * something the screen does not.
 */
export function toggleMarked(
  paths: string[],
  marked: string[],
  seed: string | null,
  path: string,
): string[] {
  const base = marked.length > 0 ? marked : seed === null ? [] : [seed];
  const next = base.includes(path)
    ? base.filter((one) => one !== path)
    : [...base, path];

  // One row left marked is not a multi-selection: it is the ordinary state of a list with
  // one note open, and leaving a lone mark behind would leave the pane in a mode nobody
  // can see they are in. The same rule empties the set when the last row is unmarked.
  if (next.length < 2) return [];
  return paths.filter((one) => next.includes(one));
}

/**
 * The one folder every marked note lives in, or `null` when they are spread across more
 * than one.
 *
 * What the Move dialog leaves out of its list. One shared folder is nothing to ask for and
 * is excluded as it always was; a set out of two folders excludes neither, because with
 * the set split every folder in the vault is a real destination for something in it.
 */
export function sharedFolder(paths: string[]): string | null {
  const folders = new Set(paths.map(folderOf));
  const [only] = folders;
  return folders.size === 1 && only !== undefined ? only : null;
}

/**
 * Which notes a menu item or a drag actually means.
 *
 * The marked set when the row the gesture started on is part of it, and that row alone
 * otherwise — right-clicking somewhere else is a gesture about somewhere else, and it must
 * not silently act on a set that is still marked further up the list.
 */
export function actOn(marked: string[], path: string): string[] {
  return marked.includes(path) ? marked : [path];
}
