import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FolderTree } from "../src/renderer/library/FolderTree.js";
import type { FolderNode, Selection } from "../src/shared/vault-types.js";

/**
 * The footer of the folder tree — Tags, People, Trash, Settings, Help, Tasks, Orphaned
 * attachments — used to be laid out in that order. Bug 6 swaps Trash and Tasks; bug 7
 * moves Orphaned attachments into Settings entirely. Both are pure layout/prop changes,
 * so `renderToStaticMarkup` is enough: no interaction is exercised here, just what ends
 * up in the tree and in what order.
 *
 * No `@vitest-environment jsdom` needed — `renderToStaticMarkup` runs without a DOM.
 */

const ROOT: FolderNode = {
  path: "",
  name: "Vault",
  noteCount: 0,
  children: [
    { path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] },
    { path: "_trash", name: "_trash", noteCount: 0, children: [] },
  ],
};

const SELECTION: Selection = { kind: "folder", path: "00 Inbox" };

function renderFooter(tasksSelected = false): string {
  return renderToStaticMarkup(
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
      onNewNoteIn: () => {},
      lastFolder: "00 Inbox",
      canRenameFolder: true,
      canDeleteFolder: true,
      canCreateFolder: true,
      onOpenSettings: () => {},
      onOpenHelp: () => {},
      onOpenTasks: () => {},
      tasksSelected,
      isMac: false,
      newFolderLabel: "New folder",
      renameFolderLabel: "Rename folder",
      deleteFolderLabel: "Delete folder",
      newNoteLabel: "New note",
      helpLabel: "Help label",
      settingsLabel: "Settings label",
      tasksLabel: "Tasks label",
      trashLabel: "Trash label",
      tagsLabel: "Tags label",
      peopleLabel: "People label",
      emptyLabel: "Nothing found",
      unavailableLabel: "Unavailable",
      filterLabel: "Filter",
    }),
  );
}

describe("FolderTree footer order (bug 6)", () => {
  it("puts Tasks before Settings and Trash after Help", () => {
    const html = renderFooter();
    const tasksAt = html.indexOf("Tasks label");
    const settingsAt = html.indexOf("Settings label");
    const helpAt = html.indexOf("Help label");
    const trashAt = html.indexOf("Trash label");

    expect(tasksAt).toBeGreaterThan(-1);
    expect(settingsAt).toBeGreaterThan(-1);
    expect(helpAt).toBeGreaterThan(-1);
    expect(trashAt).toBeGreaterThan(-1);

    // Tags/People precede all four (unchanged) — checked via Tasks, the first of the
    // four, since it is also the earliest of the swapped pair.
    expect(html.indexOf("Tags label")).toBeLessThan(tasksAt);
    expect(html.indexOf("People label")).toBeLessThan(tasksAt);

    // The swap itself: Tasks now comes before Settings/Help, and Trash comes after.
    expect(tasksAt).toBeLessThan(settingsAt);
    expect(settingsAt).toBeLessThan(helpAt);
    expect(helpAt).toBeLessThan(trashAt);
  });

  it("still highlights the Tasks row when the Tasks view is selected", () => {
    const html = renderFooter(true);
    // The row carrying the Tasks label should be the one with `branch-on`.
    const tasksRowStart = html.lastIndexOf('<div class="branch', html.indexOf("Tasks label"));
    const tasksRow = html.slice(tasksRowStart, html.indexOf("Tasks label"));
    expect(tasksRow).toContain("branch-on");
  });
});

describe("Orphaned attachments removed from the tree footer (bug 7)", () => {
  // `FolderTree`'s `Props` no longer declares `onOpenOrphanedAttachments` or
  // `orphanedAttachmentsLabel` at all — passing either from a caller (as `Library.tsx`
  // used to) is a compile-time error now, which `npm run typecheck` guards. What is
  // left to check at runtime is that the row itself is gone.
  it("renders no orphaned-attachments row or label at all", () => {
    const html = renderFooter();
    expect(html).not.toContain("orphan");
    expect(html).not.toContain("Orphan");
  });
});
