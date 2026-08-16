// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderTree } from "../src/renderer/library/FolderTree.js";
import type { FolderNode, Selection } from "../src/shared/vault-types.js";

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
      // A deleted folder sitting in the trash: the one row whose menu is not the ordinary
      // four-with-everything-disabled.
      children: [{ path: "_trash/Klant X", name: "Klant X", noteCount: 2, children: [] }],
    },
  ],
};

const SELECTION: Selection = { kind: "folder", path: "00 Inbox" };

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

function mount(
  overrides: {
    onCreateFolder?: () => void;
    onRestoreFolder?: (path: string) => void;
    onDeleteFolderPermanently?: (path: string) => void;
  } = {},
): void {
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
        onCreateFolder: overrides.onCreateFolder ?? (() => {}),
        onNewFolder: () => {},
        onRenameFolder: () => {},
        onDeleteFolder: () => {},
        onRevealFolder: () => {},
        onRestoreFolder: overrides.onRestoreFolder ?? (() => {}),
        onDeleteFolderPermanently: overrides.onDeleteFolderPermanently ?? (() => {}),
        onNewNoteIn: () => {},
        lastFolder: "00 Inbox",
        canRenameFolder: true,
        canDeleteFolder: true,
        canCreateFolder: true,
        onOpenSettings: () => {},
        onOpenHelp: () => {},
        onOpenTasks: () => {},
        tasksSelected: false,
        onOpenOrphans: () => {},
        orphansSelected: false,
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
        orphansLabel: "Orphaned attachments",
        trashLabel: "Trash",
        tagsLabel: "Tags",
        peopleLabel: "People",
        emptyLabel: "Nothing found",
        unavailableLabel: "Unavailable",
        filterLabel: "Filter",
      }),
    );
  });
}

/** The `.branch-name` text is what `--click-button` matches rows on — see
 * `library-window.ts` — so tests find rows the same way it does. */
function branchByName(name: string): HTMLElement {
  const names = Array.from(container.querySelectorAll(".branch-name"));
  const match = names.find((node) => node.textContent === name);
  if (match === undefined) throw new Error(`no branch named ${name}`);
  return match.closest(".branch") as HTMLElement;
}

function rightClick(node: HTMLElement): void {
  act(() => {
    node.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );
  });
}

function menuItemLabels(): string[] {
  return Array.from(container.querySelectorAll(".context-menu-item")).map(
    (node) => node.querySelector(".context-menu-label")!.textContent ?? "",
  );
}

function menuItemDisabled(label: string): boolean {
  const button = Array.from(container.querySelectorAll(".context-menu-item")).find((node) =>
    node.querySelector(".context-menu-label")?.textContent === label,
  );
  if (button === undefined) throw new Error(`no menu item labelled ${label}`);
  return (button as HTMLButtonElement).disabled;
}

/** The Trash branch starts collapsed, so what is inside it has to be asked for first. */
function unfoldTrash(): void {
  const twisty = branchByName("Trash").querySelector("button.twisty") as HTMLButtonElement;
  act(() => {
    twisty.click();
  });
}

describe("FolderTree's right-click menu", () => {
  it("renders New folder, Rename folder, Delete folder, New note and Reveal on an ordinary row", () => {
    mount();
    rightClick(branchByName("00 Inbox"));
    expect(menuItemLabels()).toEqual([
      "New folder",
      "Rename folder",
      "Delete folder",
      "New note",
      "Reveal",
    ]);
  });

  it("keeps Reveal enabled everywhere, including the root and the trash", () => {
    mount();
    // `shell.showItemInFolder` on a joined path assumes nothing about what is at the end
    // of it, and opening a file manager is the one entry here that changes nothing.
    rightClick(branchByName("Vault"));
    expect(menuItemDisabled("Reveal")).toBe(false);

    rightClick(branchByName("Trash"));
    expect(menuItemDisabled("Reveal")).toBe(false);
  });

  it("does not replace the old right-click-creates-a-folder gesture with an immediate action", () => {
    const onCreateFolder = vi.fn();
    mount({ onCreateFolder });
    rightClick(branchByName("00 Inbox"));
    // The menu is open, not an immediate folder creation.
    expect(onCreateFolder).not.toHaveBeenCalled();
    expect(container.querySelector(".context-menu")).not.toBeNull();
  });

  it("disables Rename folder and Delete folder on the vault root", () => {
    mount();
    rightClick(branchByName("Vault"));
    expect(menuItemDisabled("Rename folder")).toBe(true);
    expect(menuItemDisabled("Delete folder")).toBe(true);
    // The root is still a legitimate place to create a folder or file a note.
    expect(menuItemDisabled("New folder")).toBe(false);
    expect(menuItemDisabled("New note")).toBe(false);
  });

  it("disables all four items on the trash", () => {
    mount();
    rightClick(branchByName("Trash"));
    expect(menuItemDisabled("New folder")).toBe(true);
    expect(menuItemDisabled("Rename folder")).toBe(true);
    expect(menuItemDisabled("Delete folder")).toBe(true);
    expect(menuItemDisabled("New note")).toBe(true);
  });

  it("keeps Rename folder and Delete folder enabled on an ordinary folder", () => {
    mount();
    rightClick(branchByName("00 Inbox"));
    expect(menuItemDisabled("Rename folder")).toBe(false);
    expect(menuItemDisabled("Delete folder")).toBe(false);
  });

  it("offers Restore and Delete permanently on a folder inside the trash", () => {
    // Every ordinary entry refuses a trashed path, so the menu that opened on a deleted
    // folder used to say nothing about the only two things anyone does with one.
    mount();
    unfoldTrash();
    rightClick(branchByName("Klant X"));

    expect(menuItemLabels()).toEqual(["Restore", "Delete permanently"]);
    expect(menuItemDisabled("Restore")).toBe(false);
    expect(menuItemDisabled("Delete permanently")).toBe(false);
  });

  it("calls back with the row's own path, not the folder the toolbar last acted on", () => {
    const onRestoreFolder = vi.fn();
    const onDeleteFolderPermanently = vi.fn();
    mount({ onRestoreFolder, onDeleteFolderPermanently });
    unfoldTrash();
    rightClick(branchByName("Klant X"));

    const restore = [...container.querySelectorAll(".context-menu-item")].find(
      (node) => node.querySelector(".context-menu-label")?.textContent === "Restore",
    ) as HTMLButtonElement;
    act(() => {
      restore.click();
    });

    expect(onRestoreFolder).toHaveBeenCalledWith("_trash/Klant X");
    expect(onDeleteFolderPermanently).not.toHaveBeenCalled();
  });

  it("leaves the Trash row itself on the ordinary menu", () => {
    // It is a place you go to, not a folder that was thrown away — Restore and Delete
    // permanently are both meaningless on it, and Clear trash is what empties it.
    mount();
    rightClick(branchByName("Trash"));
    expect(menuItemLabels()).not.toContain("Restore");
  });
});
