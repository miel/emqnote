// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * What the two *ordinary* delete questions say — Delete folder in the tree's menu, and
 * Delete on a note — about the open tasks going with what is deleted.
 *
 * The Empty-trash question has counted them since B86 (`trash-dialog.test.ts`), and so has
 * "Delete permanently" per item (`note-list-menu.test.ts`). These two had not, on the
 * unstated reasoning that a trip to `_trash` is reversible so the question matters less.
 * It is the same fact either way: the moment a note is trashed it leaves the Tasks view
 * and every folder badge, and a folder being deleted takes every task under it at once —
 * which is exactly what a folder's *name* says least about. Restore is the difference, and
 * it is a difference in the buttons, not in the count.
 *
 * `openTasksAt` answers both, which is why it is no longer called `trashItemTasks`: the
 * walk was never about the trash, and a name that says otherwise is the kind that makes
 * the second caller write a second copy of it.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Contents {
  notes: number;
  folders: number;
  files: number;
  openTasks: number;
  linkedFiles: number;
}

function buildFake(contents: Contents): CaptureApi {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 0, children: [] },
      { path: "01 Werk", name: "01 Werk", noteCount: 3, children: [] },
    ],
  };

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async () => null,
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNotes: async (paths: string[]) => ({
      moved: paths.map((path) => ({ from: path, to: path })),
      locked: [],
    }),
    renameNote: async (path) => ({ path }),
    duplicateNote: async (path) => ({ path }),
    trashNote: async () => true,
    trashContents: async () => contents,
    openTasksAt: async () => contents.openTasks,
    emptyTrash: async () => ({ removed: 0, failed: 0 }),
    createFolder: async (parent) => parent,
    renameFolder: async (path) => path,
    folderContents: async () => ({ notes: contents.notes, folders: contents.folders }),
    trashFolder: async () => ({ trashed: true }),
    moveFolder: async (path) => path,
    deleteFromTrash: async () => ({ deleted: true }),
    revealNote: () => {},
    noteEditable: async () => true,
    openInCapture: async () => true,
    newNote: () => {},
    onRefresh: () => () => {},
    onCyclePanes: () => () => {},
    scanState: async () => null,
    onScanProgress: () => () => {},
    onFlushSaves: () => () => {},
    conflicts: async () => [],
    conflictDiff: async () => [],
    resolveConflict: async () => {},
    unlinkedAttachments: async () => [],
    trashAttachment: async () => "",
    linkingNotes: async () => [],
    onOpenLink: () => () => {},
    onOpenTag: () => () => {},
    tasks: async () => [],
    toggleTask: async () => ({ toggled: true }),
    setPinned: async (_path: string, pinned: boolean) => ({ pinned }),
  };

  return {
    platform: "linux",
    onShow: () => () => {},
    onReset: () => () => {},
    onStatus: () => () => {},
    onLoad: () => () => {},
    onEditorCommand: () => () => {},
    painted: () => {},
    change: () => {},
    close: () => {},
    discard: () => {},
    openLibrary: () => {},
    bootstrap: async () => ({
      locale: "en-US",
      platform: "linux",
      hotkey: "CommandOrControl+Shift+Space",
      libraryHotkey: "CommandOrControl+Shift+B",
      vaultPath: "/vault",
      libraryPaneWidths: null,
      librarySort: "modified",
      librarySortDirection: "desc",
      loadRemoteImages: true,
      keepPinnedInView: false,
      editorFontSize: 16,
      theme: "system" as const,
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
    setKeepPinnedInView: async () => {},
    setEditorFontSize: async () => {},
    setTheme: async () => {},
    checkForUpdates: async () => {},
    setHotkey: async () => true,
    setLibraryHotkey: async () => true,
    setPaneWidths: () => {},
    dragWindow: () => {},
    setSort: () => {},
    listVaults: async () => [],
    chooseVault: async () => null,
    switchVault: async () => {},
    saveAttachment: async () => null,
    fetchRemoteImage: async () => null,
    onVaultFileChanged: () => () => {},
    onSettingsChanged: () => () => {},
    reloadNote: async () => {},
    pickAttachment: async () => null,
    openWikiLink: async () => "none" as const,
    checkAttachments: async () => [],
    pdfPageCount: async () => null,
    linkCandidates: async () => [],
    tagSuggestions: async () => [],
    locationSuggestions: async () => [],
    peopleSuggestions: async () => [],
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText: async () => {},
    library,
  };
}

async function flush(rounds = 14): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the Delete folder question", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake({
      notes: 0,
      folders: 0,
      files: 0,
      openTasks: 0,
      linkedFiles: 0,
    });
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
  });

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

  /** Mounts, right-clicks "01 Werk" in the tree, picks Delete folder, returns the question. */
  async function ask(contents: Contents): Promise<string> {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake(contents);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const folderRow = Array.from(container.querySelectorAll<HTMLElement>(".branch")).find(
      (node) => node.querySelector(".branch-name")?.textContent === "01 Werk",
    );
    expect(folderRow, "no 01 Werk row in the tree").not.toBeUndefined();
    await act(async () => {
      folderRow!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );
    });
    await flush();

    const item = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".context-menu-item"),
    ).find((node) => node.querySelector(".context-menu-label")?.textContent === "Delete folder");
    expect(item, "no Delete folder item in the menu").not.toBeUndefined();
    await act(async () => {
      item!.click();
    });
    await flush();

    const dialog = container.querySelector(".ask");
    expect(dialog).not.toBeNull();
    return dialog!.textContent ?? "";
  }

  it("counts the open tasks under the folder, after what is in it", async () => {
    // Third in the same bracketed list the notes and subfolders were already in, because
    // it is one more thing that is inside this folder — not a second sentence, which is
    // what the Empty-trash question reserves for the files it does *not* delete.
    const text = await ask({ notes: 4, folders: 2, files: 0, openTasks: 5, linkedFiles: 0 });
    expect(text).toContain("4 notes, 2 folders, 5 open tasks");
  });

  it("says nothing about tasks when there are none", async () => {
    const text = await ask({ notes: 4, folders: 2, files: 0, openTasks: 0, linkedFiles: 0 });
    expect(text).toContain("4 notes, 2 folders)");
    expect(text).not.toContain("open task");
  });

  it("brackets nothing at all for an empty folder with no tasks", async () => {
    // An empty folder is the one case with nothing to warn about, and a "(0 notes, 0
    // folders)" in front of it is a fact nobody asked for.
    const text = await ask({ notes: 0, folders: 0, files: 0, openTasks: 0, linkedFiles: 0 });
    expect(text).not.toContain("(");
  });

  it("brackets the tasks alone when an otherwise empty-looking folder has some", async () => {
    // `folderContents` counts notes directly in the folder and `openTasksAt` walks the
    // whole subtree, so the two can disagree — and when they do, the number that says
    // something is still to be done is the one that must survive.
    const text = await ask({ notes: 0, folders: 0, files: 0, openTasks: 2, linkedFiles: 0 });
    expect(text).toContain("(2 open tasks)");
  });

  it("asks before anything moves", async () => {
    const text = await ask({ notes: 1, folders: 0, files: 0, openTasks: 1, linkedFiles: 0 });
    expect(text).toContain("01 Werk");
  });
});
