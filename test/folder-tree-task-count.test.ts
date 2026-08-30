// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FolderTree } from "../src/renderer/library/FolderTree.js";
import { withOpenTasks } from "../src/renderer/library/folder-tasks.js";
import type { FolderNode, Selection } from "../src/shared/vault-types.js";

/**
 * A folder's badge reads `[# notes] / [# open tasks]`.
 *
 * Only for a folder that holds notes — a folder with none has no badge at all, which is
 * what it has always had — and neither half is rolled up out of the subfolders, so the
 * two numbers count the same notes.
 *
 * jsdom rather than `renderToStaticMarkup`, because half of what is asserted here is what
 * the tree looks like *before* the second number arrives: the tree comes off disk at once
 * and the counts come from the index behind a scan, and the gap between them must not
 * read as "no open tasks".
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT: FolderNode = {
  path: "",
  name: "Vault",
  noteCount: 0,
  children: [
    { path: "00 Inbox", name: "00 Inbox", noteCount: 3, children: [] },
    {
      path: "01 Projecten",
      name: "01 Projecten",
      noteCount: 0,
      children: [{ path: "01 Projecten/Klant X", name: "Klant X", noteCount: 2, children: [] }],
    },
  ],
};

const SELECTION: Selection = { kind: "folder", path: "00 Inbox" };

let container: HTMLDivElement;
let root: Root;

function render(tree: FolderNode): void {
  act(() => {
    root.render(
      createElement(FolderTree, {
        root: tree,
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
        lastFolder: "00 Inbox",
        canRenameFolder: true,
        canDeleteFolder: true,
        canCreateFolder: true,
        onOpenSettings: () => {},
        onOpenHelp: () => {},
        onOpenTasks: () => {},
        tasksSelected: false,
        onOpenUnlinked: () => {},
        unlinkedSelected: false,
        unlinkedCount: 3,
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
      }),
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function badgeOf(name: string): HTMLElement | null {
  const match = [...container.querySelectorAll(".branch-name")].find(
    (node) => node.textContent === name,
  );
  const row = match?.closest(".branch") as HTMLElement | undefined;
  return (row?.querySelector(".branch-count") as HTMLElement | null) ?? null;
}

describe("the folder tree's note/task badge", () => {
  it("draws the note count alone until the index has counted the tasks", () => {
    render(ROOT);

    expect(badgeOf("00 Inbox")?.textContent).toBe("3");
    expect(badgeOf("00 Inbox")?.querySelector(".branch-tasks")).toBeNull();
  });

  it("draws notes and open tasks once they are known", () => {
    render(withOpenTasks(ROOT, { "00 Inbox": 2 }));

    expect(badgeOf("00 Inbox")?.textContent).toBe("3 / 2");
  });

  // A folder that is genuinely clear must not read like one still being counted, which
  // is why the zero is drawn rather than left off.
  it("draws a zero for a folder whose tasks are all ticked", () => {
    render(withOpenTasks(ROOT, {}));

    expect(badgeOf("00 Inbox")?.textContent).toBe("3 / 0");
  });

  it("marks a folder with open tasks apart from one without", () => {
    render(withOpenTasks(ROOT, { "00 Inbox": 2 }));
    expect(badgeOf("00 Inbox")?.querySelector(".branch-tasks-open")).not.toBeNull();

    render(withOpenTasks(ROOT, {}));
    expect(badgeOf("00 Inbox")?.querySelector(".branch-tasks-open")).toBeNull();
  });

  // Only a folder with notes gets a badge — and the counts are not rolled up, so a
  // folder that only holds subfolders is not given one on its children's account either.
  // (`Klant X` itself is a depth-2 row and starts folded; `folder-tasks.test.ts` is where
  // its own count is asserted.)
  it("gives a folder holding no notes of its own no badge at all", () => {
    render(withOpenTasks(ROOT, { "01 Projecten/Klant X": 5 }));

    expect(badgeOf("01 Projecten")).toBeNull();
  });

  it("says what the two numbers are, since the badge itself is bare", () => {
    render(withOpenTasks(ROOT, { "00 Inbox": 2 }));

    expect(badgeOf("00 Inbox")?.title).toBe("Notes here: 3 · Open tasks: 2");
  });
});
