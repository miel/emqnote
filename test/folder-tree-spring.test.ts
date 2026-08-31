// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderTree } from "../src/renderer/library/FolderTree.js";
import { SPRING_MS } from "../src/renderer/library/drag.js";
import type { FolderNode, Selection } from "../src/shared/vault-types.js";

/**
 * A note held over a collapsed folder unfolds it — "spring-loading", the gesture every
 * file manager on both platforms has.
 *
 * Without it, filing by drag reached only what was already on screen: a destination one
 * level down meant dropping the note somewhere else, unfolding by hand and dragging it a
 * second time. "Move to…" stays the way to a folder four levels deep; this is the way to
 * one that is *nearly* in front of you.
 *
 * The case worth having a test for is the third one below. The row that has to unfold is
 * very often a folder the drop itself would refuse — the note's own parent, on the way to
 * a sibling underneath it — so the countdown deliberately starts *before* `canDropNote` is
 * consulted. Gating it on `accepts`, which is the obvious reading of the handler, would
 * leave exactly the folders a drag most needs to pass through unable to open.
 *
 * jsdom rather than the state level: `dragover`/`dragleave` and a timer that outlives one
 * of them is the whole mechanism, and there is no non-DOM half of it to test.
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
      noteCount: 1,
      children: [
        { path: "01 Projecten/Klant X", name: "Klant X", noteCount: 2, children: [] },
      ],
    },
  ],
};

const SELECTION: Selection = { kind: "folder", path: "00 Inbox" };

/** A note in the Inbox: every folder in the tree is a legal destination for it. */
const FROM_INBOX = "00 Inbox/Vergadering.md";
/** A note that already lives in `01 Projecten`, which `canDropNote` therefore refuses. */
const FROM_PROJECTS = "01 Projecten/Offerte.md";

let container: HTMLDivElement;
let root: Root;

function render(dragging: string | null): void {
  act(() => {
    root.render(
      createElement(FolderTree, {
        root: ROOT,
        selected: SELECTION,
        facets: { tags: [], people: [], available: true },
        dragging,
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
      }),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

function rowNamed(name: string): HTMLElement {
  const match = [...container.querySelectorAll(".branch-name")].find(
    (node) => node.textContent === name,
  );
  const row = (match?.closest(".branch") as HTMLElement | undefined) ?? null;
  if (row === null) throw new Error(`no row named ${name}`);
  return row;
}

/**
 * jsdom has no `DragEvent`, so the handler is handed a plain event carrying the one
 * property it reads. `dropEffect` is written to, never read back — what the pointer looks
 * like belongs to a real display.
 */
function dragOver(row: HTMLElement): void {
  const event = new Event("dragover", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { dropEffect: "" } });
  act(() => {
    row.dispatchEvent(event);
  });
}

/** A `MouseEvent`, for its `relatedTarget` — the handler asks whether the pointer went into a child. */
function dragLeave(row: HTMLElement): void {
  act(() => {
    row.dispatchEvent(new MouseEvent("dragleave", { bubbles: true, relatedTarget: null }));
  });
}

function tick(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function expanded(name: string): string | null {
  return rowNamed(name).getAttribute("aria-expanded");
}

describe("holding a dragged note over a collapsed folder", () => {
  it("unfolds it once the dwell is up, and not a moment before", () => {
    render(FROM_INBOX);
    // Depth 1, so it starts folded even though it has a child.
    expect(expanded("01 Projecten")).toBe("false");

    dragOver(rowNamed("01 Projecten"));
    tick(SPRING_MS - 100);
    expect(expanded("01 Projecten")).toBe("false");

    tick(100);
    expect(expanded("01 Projecten")).toBe("true");
    expect(rowNamed("Klant X")).toBeTruthy();
  });

  it("keeps it open after the drag has gone", () => {
    // Explorer's behaviour, chosen over Finder's: what unfolded during the drag is where
    // the note now is, and folding it again would hide the answer.
    render(FROM_INBOX);
    dragOver(rowNamed("01 Projecten"));
    tick(SPRING_MS);
    render(null);

    expect(expanded("01 Projecten")).toBe("true");
  });

  it("springs a folder the drop itself would refuse", () => {
    // `canDropNote` says no — the note already lives here — but the row is still the way
    // down to `Klant X`, and unfolding is not dropping.
    render(FROM_PROJECTS);

    dragOver(rowNamed("01 Projecten"));
    tick(SPRING_MS);

    expect(expanded("01 Projecten")).toBe("true");
  });

  it("cancels when the pointer leaves before the dwell is up", () => {
    render(FROM_INBOX);

    dragOver(rowNamed("01 Projecten"));
    tick(SPRING_MS - 100);
    dragLeave(rowNamed("01 Projecten"));
    tick(SPRING_MS);

    expect(expanded("01 Projecten")).toBe("false");
  });

  it("cancels when the drag ends elsewhere before the dwell is up", () => {
    // Dropped on another row, or abandoned with Escape: neither fires `dragleave` here,
    // so the only signal is `dragging` going null.
    render(FROM_INBOX);

    dragOver(rowNamed("01 Projecten"));
    tick(SPRING_MS - 100);
    render(null);
    tick(SPRING_MS);

    expect(expanded("01 Projecten")).toBe("false");
  });

  it("does nothing over a folder with no subfolders", () => {
    render(FROM_PROJECTS);

    dragOver(rowNamed("00 Inbox"));
    tick(SPRING_MS);

    // A leaf carries no `aria-expanded` at all, and must not gain one.
    expect(expanded("00 Inbox")).toBeNull();
  });

  it("does nothing when nothing is being dragged", () => {
    render(null);

    dragOver(rowNamed("01 Projecten"));
    tick(SPRING_MS);

    expect(expanded("01 Projecten")).toBe("false");
  });
});
