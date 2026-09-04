// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FolderTree } from "../src/renderer/library/FolderTree.js";
import type { FolderNode, Selection } from "../src/shared/vault-types.js";

/**
 * Unfolding the tree to a folder that has to be seen.
 *
 * Reported at the end of a Windows pass (§57): creating a folder gave no sign that
 * anything had happened. It had — the folder was made, and the row for it was inside a
 * branch that was still folded, since everything below the first level starts closed on
 * purpose. So the one gesture whose whole result is a new row in this pane showed no new
 * row, and the only way to tell an accepted name from a refused one was Explorer.
 *
 * Fold state stays per-row `useState`: lifting the whole of it into `Library.tsx` to
 * answer one question would make every twisty a round trip through the window's state.
 * The *question* travels down instead, and each row on the way opens itself for it —
 * which is what the second test here is really about, since a folder three levels down
 * needs all three ancestors open and only the recursion knows who they are.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT: FolderNode = {
  path: "",
  name: "Vault",
  noteCount: 0,
  children: [
    {
      path: "10 Projects",
      name: "10 Projects",
      noteCount: 0,
      children: [
        {
          path: "10 Projects/Klant X",
          name: "Klant X",
          noteCount: 2,
          children: [{ path: "10 Projects/Klant X/2026", name: "2026", noteCount: 0, children: [] }],
        },
      ],
    },
  ],
};

const SELECTION: Selection = { kind: "folder", path: "" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(revealPath: string | null): void {
  act(() => {
    root.render(
      createElement(FolderTree, {
        root: ROOT,
        selected: SELECTION,
        facets: { tags: [], people: [], available: true },
        dragging: null,
        onDropNote: () => {},
        onSelect: () => {},
        onExpandFilters: () => {},
        onCreateFolder: () => {},
        onNewFolder: () => {},
        onRenameFolder: () => {},
        onDeleteFolder: () => {},
        onRevealFolder: () => {},
        onRestoreFolder: () => {},
        onDeleteFolderPermanently: () => {},
        onNewNoteIn: () => {},
        lastFolder: "",
        canRenameFolder: true,
        canDeleteFolder: true,
        canCreateFolder: true,
        onOpenSettings: () => {},
        onOpenHelp: () => {},
        onOpenTasks: () => {},
        tasksSelected: false,
        onOpenUnlinked: () => {},
        unlinkedSelected: false,
        unlinkedCount: 0,
        isMac: false,
        newFolderLabel: "New folder",
        renameFolderLabel: "Rename folder",
        deleteFolderLabel: "Delete folder",
        revealLabel: "Reveal",
        restoreLabel: "Restore",
        deletePermanentlyLabel: "Delete permanently",
        newLabel: "New",
        renameLabel: "Rename",
        deleteLabel: "Delete",
        allFoldersLabel: "All folders",
        newNoteLabel: "New note",
        helpLabel: "Help",
        settingsLabel: "Settings",
        tasksLabel: "Tasks",
        unlinkedLabel: "Unlinked attachments",
        trashLabel: "Trash",
        tagsLabel: "Tags",
        peopleLabel: "People",
        emptyLabel: "Nothing found",
        unavailableLabel: "Unavailable",
        filterLabel: "Filter",
        notesHereLabel: "Notes here",
        openTasksLabel: "Open tasks",
        revealPath,
      }),
    );
  });
}

function names(): string[] {
  return Array.from(container.querySelectorAll(".branch-name")).map(
    (node) => node.textContent ?? "",
  );
}

describe("the folder tree's reveal path", () => {
  it("leaves the tree folded when nothing has to be shown", () => {
    root = createRoot(container);
    render(null);

    // Only the root is open by default (`depth < 1`); below that a project tree several
    // levels deep would be unreadable if it all unfolded at once.
    expect(names()).toContain("10 Projects");
    expect(names()).not.toContain("Klant X");
  });

  it("opens every ancestor of the folder it is given", () => {
    root = createRoot(container);
    render(null);
    expect(names()).not.toContain("Klant X");

    render("10 Projects/Klant X/2026");

    // Both of them: the row asked for is two branches down, and neither ancestor was
    // open. This is the half a single row's own state cannot do.
    expect(names()).toContain("Klant X");
    expect(names()).toContain("2026");
  });

  it("opens for a folder that does not exist yet without a row of its own", () => {
    // Which is the real case: `createFolderIn` sets this to the path it was just given
    // back, and the tree it will appear in is reloaded in the same breath. The ancestors
    // are what this has to get right — the new row arrives with the reload.
    root = createRoot(container);
    render(null);

    render("10 Projects/Klant X/2026/Q3");

    expect(names()).toContain("2026");
  });

  it("does not fold a row back when the path changes to something else", () => {
    root = createRoot(container);
    render("10 Projects/Klant X/2026");
    expect(names()).toContain("2026");

    render("10 Projects");

    // Only ever opens. A row the user has opened is theirs, and nothing here closes one.
    expect(names()).toContain("2026");
  });
});
