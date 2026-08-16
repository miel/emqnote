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

function renderFooter(
  tasksSelected = false,
  root: FolderNode = ROOT,
  orphansSelected = false,
): string {
  return renderToStaticMarkup(
    createElement(FolderTree, {
      root,
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
      tasksSelected,
      onOpenOrphans: () => {},
      orphansSelected,
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
      helpLabel: "Help label",
      settingsLabel: "Settings label",
      tasksLabel: "Tasks label",
      orphansLabel: "Orphans label",
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
  it("puts Tasks before Settings, then Help, Orphaned attachments and Trash", () => {
    const html = renderFooter();
    const tasksAt = html.indexOf("Tasks label");
    const settingsAt = html.indexOf("Settings label");
    const helpAt = html.indexOf("Help label");
    const orphansAt = html.indexOf("Orphans label");
    const trashAt = html.indexOf("Trash label");

    expect(tasksAt).toBeGreaterThan(-1);
    expect(settingsAt).toBeGreaterThan(-1);
    expect(helpAt).toBeGreaterThan(-1);
    expect(orphansAt).toBeGreaterThan(-1);
    expect(trashAt).toBeGreaterThan(-1);

    // Tags/People precede all five (unchanged) — checked via Tasks, the first of them,
    // since it is also the earliest of the swapped pair.
    expect(html.indexOf("Tags label")).toBeLessThan(tasksAt);
    expect(html.indexOf("People label")).toBeLessThan(tasksAt);

    // The swap itself: Tasks now comes before Settings/Help, and Trash comes after.
    // Orphaned attachments sits between Help and Trash — where it was asked for, and
    // beside the only two other rows down here that are not filters.
    expect(tasksAt).toBeLessThan(settingsAt);
    expect(settingsAt).toBeLessThan(helpAt);
    expect(helpAt).toBeLessThan(orphansAt);
    expect(orphansAt).toBeLessThan(trashAt);
  });

  it("still highlights the Tasks row when the Tasks view is selected", () => {
    const html = renderFooter(true);
    // The row carrying the Tasks label should be the one with `branch-on`.
    const tasksRowStart = html.lastIndexOf('<div class="branch', html.indexOf("Tasks label"));
    const tasksRow = html.slice(tasksRowStart, html.indexOf("Tasks label"));
    expect(tasksRow).toContain("branch-on");
  });
});

/**
 * `branch-trashed` dims and italicises a folder that has been thrown away, so it does not
 * read as a live one. It was set on the Trash branch itself as well as on everything
 * under it — and Trash is not a deleted folder, it is a destination in the sidebar
 * alongside Tags, People and Tasks. The one row you deliberately click looked like the
 * rows you had discarded.
 */
describe("only folders inside the trash are dimmed", () => {
  const WITH_TRASHED_FOLDER: FolderNode = {
    ...ROOT,
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
            children: [
              { path: "_trash/Klant X/Oud", name: "Oud", noteCount: 1, children: [] },
            ],
          },
        ],
      },
    ],
  };

  /** The `<div class="branch…">` opening tag of the row carrying `label`. */
  function rowOf(html: string, label: string): string {
    const at = html.indexOf(`>${label}<`);
    expect(at).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<div class=", at), at);
  }

  it("leaves the Trash row itself looking like every other footer row", () => {
    const html = renderFooter(false, WITH_TRASHED_FOLDER);
    expect(rowOf(html, "Trash label")).not.toContain("branch-trashed");
  });

  // The dimming *inside* the trash is asserted in `folder-tree-trash-collapsed.test.ts`
  // instead: the Trash branch now starts folded, so nothing under it is in a static
  // render's markup at all, and checking the propagation means unfolding it first.
  it("renders nothing from inside the trash until it is unfolded", () => {
    const html = renderFooter(false, WITH_TRASHED_FOLDER);
    expect(html).not.toContain("Klant X");
  });

  it("leaves a live folder alone", () => {
    const html = renderFooter(false, WITH_TRASHED_FOLDER);
    expect(rowOf(html, "00 Inbox")).not.toContain("branch-trashed");
  });
});

/**
 * The inverse of what this file used to assert, deliberately.
 *
 * Bug 7 (6 August 2026) moved orphaned attachments off this footer into a row inside
 * Settings, on the argument that it is an occasional action rather than an everyday
 * destination. It is back on 16 August 2026 as neither: a `Selection` of its own, whose
 * pane is B47's file list and whose reader is B47's preview — which makes it a place in
 * the vault, which is exactly what the sidebar is a list of.
 */
describe("Orphaned attachments is a footer row again", () => {
  it("renders a row carrying its label", () => {
    expect(renderFooter()).toContain("Orphans label");
  });

  it("highlights that row when its pane is what is showing", () => {
    const html = renderFooter(false, ROOT, true);
    const rowStart = html.lastIndexOf('<div class="branch', html.indexOf("Orphans label"));
    expect(html.slice(rowStart, html.indexOf("Orphans label"))).toContain("branch-on");
  });

  it("leaves it unhighlighted otherwise", () => {
    const html = renderFooter();
    const rowStart = html.lastIndexOf('<div class="branch', html.indexOf("Orphans label"));
    expect(html.slice(rowStart, html.indexOf("Orphans label"))).not.toContain("branch-on");
  });
});
