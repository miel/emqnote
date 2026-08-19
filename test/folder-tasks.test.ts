import { describe, expect, it } from "vitest";
import { withOpenTasks } from "../src/renderer/library/folder-tasks.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * The folder tree's badge is `[# notes] / [# open tasks]`, and the two halves come from
 * two different places at two different speeds — `readFolderTree` off disk and
 * `note_tasks` behind the index scan. This is where they are joined.
 */
const TREE: FolderNode = {
  path: "",
  name: "Vault",
  noteCount: 1,
  children: [
    { path: "00 Inbox", name: "00 Inbox", noteCount: 3, children: [] },
    {
      path: "01 Projects",
      name: "01 Projects",
      noteCount: 0,
      children: [{ path: "01 Projects/Klant X", name: "Klant X", noteCount: 2, children: [] }],
    },
  ],
};

const find = (root: FolderNode, path: string): FolderNode | undefined => {
  if (root.path === path) return root;
  for (const child of root.children) {
    const hit = find(child, path);
    if (hit !== undefined) return hit;
  }
  return undefined;
};

describe("withOpenTasks", () => {
  it("puts a folder's open task count on the folder itself", () => {
    const merged = withOpenTasks(TREE, { "00 Inbox": 4, "01 Projects/Klant X": 1 });

    expect(find(merged, "00 Inbox")?.openTasks).toBe(4);
    expect(find(merged, "01 Projects/Klant X")?.openTasks).toBe(1);
  });

  it("gives a folder with notes but nothing open a plain zero", () => {
    const merged = withOpenTasks(TREE, { "01 Projects/Klant X": 1 });

    expect(find(merged, "00 Inbox")?.openTasks).toBe(0);
  });

  // The badge is drawn only for a folder that holds notes, so a folder holding none has
  // nothing for the task half to hang off — and the counts are deliberately not rolled
  // up, so a parent full of subfolders genuinely has no tasks of its own.
  it("leaves a folder with no notes of its own uncounted", () => {
    const merged = withOpenTasks(TREE, { "01 Projects/Klant X": 1 });

    expect(find(merged, "01 Projects")?.openTasks).toBeUndefined();
  });

  it("does not roll a subfolder's tasks up into its parent", () => {
    const merged = withOpenTasks(TREE, { "01 Projects/Klant X": 7 });

    expect(find(merged, "")?.openTasks).toBe(0);
    expect(find(merged, "01 Projects")?.openTasks).toBeUndefined();
  });

  // "Not counted yet" and "nothing open" have to stay apart, or every folder claims zero
  // open tasks in the moment between the tree arriving and the index answering.
  it("leaves every count absent while the index has not answered", () => {
    const merged = withOpenTasks(TREE, null);

    expect(find(merged, "00 Inbox")?.openTasks).toBeUndefined();
    expect(merged).toBe(TREE);
  });

  it("leaves the tree it was given alone", () => {
    withOpenTasks(TREE, { "00 Inbox": 4 });

    expect(TREE.children[0]?.openTasks).toBeUndefined();
  });
});
