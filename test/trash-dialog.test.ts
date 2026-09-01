// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * What the Empty-trash question says before the one action in this app with no way back.
 *
 * It counted the note *rows on screen*, which `trashContents` replaced with a recursive
 * count of notes, folders and files. Two things are added to that here, and neither is a
 * count of something in the trash:
 *
 *  - **the open tasks** written in those notes, because what someone wants to know before
 *    emptying the trash is not how many notes it is but whether anything still to be
 *    *done* goes with them;
 *  - **the linked files**, which are not in the trash and are not deleted at all: they are
 *    attachments that only a trashed note still refers to, so emptying it leaves them
 *    unreachable from any note — §6.5's unlinked attachments. See
 *    `attachmentsOrphanedByTrash` for why that number is exact rather than a guess.
 *
 * And the button says "Empty trash". Clearing is what a filter or a search box does, and
 * both of those are one click away in this window.
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
      { path: "_trash", name: "_trash", noteCount: contents.notes, children: [] },
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
    openTasksAt: async () => 0,
    emptyTrash: async () => ({ removed: 0, failed: 0 }),
    createFolder: async (parent) => parent,
    renameFolder: async (path) => path,
    folderContents: async () => ({ notes: 0, folders: 0 }),
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

describe("the Empty-trash question", () => {
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

  /** Mounts, selects the Trash row in the tree, and opens the question. */
  async function ask(contents: Contents): Promise<string> {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake(contents);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const trashRow = Array.from(container.querySelectorAll<HTMLElement>(".branch")).find(
      (node) => node.querySelector(".branch-name")?.textContent === "Trash",
    );
    expect(trashRow, "no Trash row in the tree").not.toBeUndefined();
    await act(async () => {
      trashRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".notes .pane-actions button"),
    ).find((node) => node.textContent === "Empty trash");
    expect(button, "no Empty trash button").not.toBeUndefined();
    await act(async () => {
      button!.click();
    });
    await flush();

    const dialog = container.querySelector(".ask");
    expect(dialog).not.toBeNull();
    return dialog!.textContent ?? "";
  }

  it("is opened by a button called Empty trash", async () => {
    // Renamed from "Clear trash". Clearing is what a filter and a search box do, and both
    // are one click away in this window; this is the one control that destroys something.
    const text = await ask({ notes: 2, folders: 0, files: 0, openTasks: 0, linkedFiles: 0 });
    expect(text).toContain("2 notes");
  });

  it("counts the open tasks in the notes about to go", async () => {
    const text = await ask({ notes: 6, folders: 2, files: 3, openTasks: 4, linkedFiles: 0 });
    expect(text).toContain("6 notes, 2 folders, 3 files, 4 open tasks");
    expect(text).toContain("cannot be undone");
  });

  it("says which files will be left behind as unlinked attachments", async () => {
    // A second sentence rather than a fourth item in the list, because these files are not
    // in the trash and are not deleted: emptying it takes away the last note that named
    // them.
    const text = await ask({ notes: 1, folders: 0, files: 0, openTasks: 0, linkedFiles: 2 });
    expect(text).toContain("2 linked files become unlinked attachments");
  });

  it("leaves out every number it does not have", async () => {
    // A trash holding six notes and nothing else says "6 notes". The zeroes are noise in
    // the common case, and this question has enough to say without them.
    const text = await ask({ notes: 6, folders: 0, files: 0, openTasks: 0, linkedFiles: 0 });
    expect(text).toContain("6 notes —");
    expect(text).not.toContain("folders");
    expect(text).not.toContain("open task");
    expect(text).not.toContain("linked file");
  });
});
