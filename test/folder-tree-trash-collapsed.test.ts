// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FolderTree } from "../src/renderer/library/FolderTree.js";
import type { FolderNode, Selection } from "../src/shared/vault-types.js";

/**
 * The Trash row starts folded.
 *
 * It is rendered at depth 0, the depth `Branch` unfolds by default so that the vault's own
 * top-level folders are visible without a click — which meant every folder ever deleted
 * unfolded with it, at the bottom of the sidebar, permanently. The exception is the row
 * itself only: `trashRoot` is not passed down, so a folder opened *inside* the trash
 * behaves like any other folder there.
 *
 * jsdom rather than `renderToStaticMarkup` (which the rest of the tree's tests use)
 * because the interesting half is what happens when the twisty is clicked, and a static
 * render cannot click.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT: FolderNode = {
  path: "",
  name: "Vault",
  noteCount: 0,
  children: [
    { path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] },
    {
      path: "_trash",
      name: "_trash",
      noteCount: 0,
      children: [
        {
          path: "_trash/Klant X",
          name: "Klant X",
          noteCount: 2,
          children: [{ path: "_trash/Klant X/Oud", name: "Oud", noteCount: 1, children: [] }],
        },
      ],
    },
  ],
};

const SELECTION: Selection = { kind: "folder", path: "00 Inbox" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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
        lastFolder: "00 Inbox",
        canRenameFolder: true,
        canDeleteFolder: true,
        canCreateFolder: true,
        onOpenSettings: () => {},
        onOpenHelp: () => {},
        onOpenTasks: () => {},
        tasksSelected: false,
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
        newNoteLabel: "New note",
        helpLabel: "Help",
        settingsLabel: "Settings",
        tasksLabel: "Tasks",
        trashLabel: "Trash",
        tagsLabel: "Tags",
        peopleLabel: "People",
        emptyLabel: "Nothing found",
        unavailableLabel: "Unavailable",
        filterLabel: "Filter",
      }),
    );
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** The row whose own name is exactly `name`, or null when it is not on screen. */
function rowNamed(name: string): HTMLElement | null {
  const match = [...container.querySelectorAll(".branch-name")].find(
    (node) => node.textContent === name,
  );
  return (match?.closest(".branch") as HTMLElement | undefined) ?? null;
}

describe("the Trash branch starts collapsed", () => {
  it("shows the Trash row but none of the folders inside it", () => {
    expect(rowNamed("Trash")).not.toBeNull();
    expect(rowNamed("Klant X")).toBeNull();
  });

  it("unfolds on the twisty, and what appears is dimmed as thrown away", () => {
    const twisty = rowNamed("Trash")!.querySelector("button.twisty") as HTMLButtonElement;
    act(() => {
      twisty.click();
    });

    const inside = rowNamed("Klant X");
    expect(inside).not.toBeNull();
    // `branch-trashed` propagates from `trashRoot`, and the Trash row itself never wears
    // it — the point of the two being separate props.
    expect(inside!.className).toContain("branch-trashed");
    expect(rowNamed("Trash")!.className).not.toContain("branch-trashed");
  });

  it("leaves the vault's own top-level folders unfolded, as before", () => {
    expect(rowNamed("00 Inbox")).not.toBeNull();
  });
});
