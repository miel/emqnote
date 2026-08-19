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
