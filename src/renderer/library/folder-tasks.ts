import type { FolderNode } from "../../shared/vault-types.js";

/**
 * Puts the index's open-task counts onto the tree read off disk.
 *
 * The two halves of a folder's badge come from different places — `readFolderTree` walks
 * the filesystem and answers at once, `IPC.libraryFolderTaskCounts` reads `note_tasks`
 * behind `ensureScanned` — so they are fetched separately and joined here, on the path
 * each side already agrees on.
 *
 * `counts === null` means "not counted yet" and leaves `openTasks` absent, which is what
 * keeps a folder from claiming zero open tasks in the moment before the scan answers. A
 * folder missing from a map that *has* arrived genuinely has none, so it gets `0`: the
 * badge shows both numbers or neither, never a half-answer that reads as a defect.
 *
 * Only folders that hold notes are given a count at all. A folder with no notes of its
 * own has no badge (`FolderTree` draws none for `noteCount === 0`), and there is nothing
 * for a task count to hang off — the counts are not rolled up, so a parent that only
 * holds subfolders is genuinely a folder with no tasks in it.
 */
export function withOpenTasks(
  root: FolderNode,
  counts: Record<string, number> | null,
): FolderNode {
  if (counts === null) return root;

  const walk = (node: FolderNode): FolderNode => ({
    ...node,
    openTasks: node.noteCount > 0 ? (counts[node.path] ?? 0) : undefined,
    children: node.children.map(walk),
  });

  return walk(root);
}

/**
 * The folders the Tasks view's scope chooser should offer.
 *
 * It offered every folder in the vault, which is a list where most entries answer "no
 * tasks" — a chooser whose commonest outcome is an empty pane. So it is narrowed to the
 * folders that have something to show.
 *
 * Three things decide whether this is right, and each of them is a way it could be
 * subtly wrong.
 *
 * **It rolls up.** `tasksIn` scopes by path *prefix*, so choosing a folder shows the
 * tasks under it as well as in it — which means a folder qualifies when anything beneath
 * it does. `IPC.libraryFolderTaskCounts` cannot answer that: `openTaskCountsByFolder`
 * counts notes directly in a folder and deliberately does not roll up, because the
 * sidebar badge is about the folder itself. The per-note counts are the ones that fold.
 *
 * **It asks `total`, not `open`.** The view has an "open only" checkbox, and keying this
 * off it would rebuild the list under the user's hands every time they ticked it — with
 * the folder they were standing in able to vanish from a chooser still claiming to be set
 * to it. A folder with three finished tasks is a folder the view has something to say
 * about.
 *
 * **The vault root and the current scope are always in.** `""` is "no restriction" and is
 * never a lie; `scope` has to stay because a `<select>` whose value is not among its
 * options renders blank, and the scope can outlive the tasks it was chosen for — untick a
 * box, delete the last task, and the chooser would empty itself of the thing it is set to.
 *
 * `counts === null` means the index has not answered yet, and everything is offered: a
 * chooser that is briefly empty reads as a defect, which is the same call `withOpenTasks`
 * makes above for the badge.
 */
export function foldersWithTasks(
  folders: string[],
  counts: Record<string, { total: number }> | null,
  scope: string,
): string[] {
  if (counts === null) return folders;

  const withTasks = Object.entries(counts)
    .filter(([, count]) => count.total > 0)
    .map(([path]) => path);

  return folders.filter(
    (folder) =>
      folder === "" ||
      folder === scope ||
      withTasks.some((path) => path.startsWith(`${folder}/`)),
  );
}
