// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FolderTree } from "../src/renderer/library/FolderTree.js";
import type { FolderNode, Selection } from "../src/shared/vault-types.js";

/**
 * Double-clicking a folder row folds and unfolds it.
 *
 * Before this the only mouse route was the 16px twisty, which is a small target for the
 * one thing a folder tree is mostly used for. The row's own `onClick` still selects, so a
 * double-click selects an already-selected folder twice and then toggles — harmless, and
 * the reason nothing had to be taken away to add this.
 *
 * jsdom rather than `renderToStaticMarkup`, for the same reason
 * `folder-tree-trash-collapsed.test.ts` uses it: the interesting half is a gesture.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT: FolderNode = {
  path: "",
  name: "Vault",
  noteCount: 0,
  children: [
    { path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] },
    {
      path: "01 Projecten",
      name: "01 Projecten",
      noteCount: 0,
      children: [
        {
          path: "01 Projecten/Klant X",
          name: "Klant X",
          noteCount: 2,
          children: [
            { path: "01 Projecten/Klant X/Oud", name: "Oud", noteCount: 1, children: [] },
          ],
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
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function rowNamed(name: string): HTMLElement | null {
  const match = [...container.querySelectorAll(".branch-name")].find(
    (node) => node.textContent === name,
  );
  return (match?.closest(".branch") as HTMLElement | undefined) ?? null;
}

/** What `element.click()` is for `click`: jsdom has no double-click helper. */
function doubleClick(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
}

describe("double-clicking a folder row", () => {
  it("folds a folder that is open, and its children go with it", () => {
    // The vault root is rendered at depth 0, the one depth `Branch` unfolds by default.
    expect(rowNamed("01 Projecten")).not.toBeNull();
    expect(rowNamed("Vault")!.getAttribute("aria-expanded")).toBe("true");

    doubleClick(rowNamed("Vault")!);

    expect(rowNamed("Vault")!.getAttribute("aria-expanded")).toBe("false");
    expect(rowNamed("01 Projecten")).toBeNull();
  });

  it("unfolds one that is closed", () => {
    // `01 Projecten` is at depth 1, so it starts folded even though it has a child.
    expect(rowNamed("Klant X")).toBeNull();

    doubleClick(rowNamed("01 Projecten")!);

    expect(rowNamed("Klant X")).not.toBeNull();
    expect(rowNamed("01 Projecten")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("does nothing to a folder with no subfolders", () => {
    const leaf = rowNamed("00 Inbox")!;
    // A leaf carries no `aria-expanded` at all, and must not gain one.
    expect(leaf.getAttribute("aria-expanded")).toBeNull();

    doubleClick(leaf);

    expect(rowNamed("00 Inbox")!.getAttribute("aria-expanded")).toBeNull();
    expect(rowNamed("00 Inbox")!.querySelector("button.twisty")!.textContent).toBe("");
  });

  it("leaves the state alone when the double-click lands on the twisty itself", () => {
    // The two `click`s toggle it there and back; the `dblclick` must not bubble to the row
    // and toggle a third time, which would end in the opposite of where it started.
    const twisty = rowNamed("01 Projecten")!.querySelector("button.twisty") as HTMLButtonElement;

    // One `act` each: two clicks in a single batch would both read the same `open` and
    // the pair would not undo itself, which is not what two real clicks do.
    act(() => {
      twisty.click();
    });
    act(() => {
      twisty.click();
    });
    doubleClick(twisty);

    expect(rowNamed("01 Projecten")!.getAttribute("aria-expanded")).toBe("false");
    expect(rowNamed("Klant X")).toBeNull();
  });
});
