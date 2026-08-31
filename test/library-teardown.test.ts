// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * The library window's two debounces are cancelled when its tree goes away.
 *
 * `capture-teardown.test.ts`'s bug, in the other window. Nothing here can fire in the app
 * — the library's tree is not unmounted while it is running — but in jsdom it is
 * unmounted between every test, and a timer armed by the last keystroke of one test fires
 * into an environment that has been torn down: `window` is gone, and the throw is charged
 * to whichever test is running by then rather than to the one that armed it.
 *
 * That is what failed the `v0.11.0` release on the Windows runner, from `Capture.tsx`.
 * This window had not reported it, which is not the same as being safe: it is the
 * identical construction, `library-*.test.ts` mounts and unmounts it a dozen times a run,
 * and **both** of its timers reach `window.emqnote` when they fire — the search one 150 ms
 * out, the save one behind `SAVE_DEBOUNCE_MS`.
 *
 * Real timers, deliberately: `vi.useFakeTimers()` replaces `setTimeout` from the moment it
 * is called, so a timer armed before that is never reached and a test written that way
 * passes with the fix ripped out. Confirmed red against a disabled cleanup.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildFake(): { emqnote: CaptureApi; search: ReturnType<typeof vi.fn> } {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 0, children: [] },
      { path: "01 Projects", name: "01 Projects", noteCount: 0, children: [] },
    ],
  };

  const search = vi.fn(async () => []);

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search,
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async () => null,
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote: async (path) => ({ path }),
    renameNote: async (path) => ({ path }),
    duplicateNote: async (path) => ({ path }),
    trashNote: async () => true,
    trashContents: async () => ({ notes: 0, folders: 0, files: 0, openTasks: 0, linkedFiles: 0 }),
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
    tasks: async () => [],
    linkingNotes: async () => [],
    onOpenLink: () => () => {},
    onOpenTag: () => () => {},
    toggleTask: async () => ({ toggled: true }),
    setPinned: async (_path: string, pinned: boolean) => ({ pinned }),
  };

  const emqnote: CaptureApi = {
    platform: "darwin",
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
      platform: "darwin",
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

  return { emqnote, search };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}


/** Past the 150 ms search debounce by a wide margin, and expressed against it. */
const SEARCH_DEBOUNCE_MS = 150;
const WELL_PAST_THE_DEBOUNCE = SEARCH_DEBOUNCE_MS * 8;

describe("the library window's debounces and teardown", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
  });

  it("does not run a queued search after the tree has been unmounted", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const fake = buildFake();
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;

    const root: Root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
    fake.search.mockClear();

    // Arms the debounce and does not wait it out — that ordering is the test.
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".search-toggle")!.click();
    });
    const box = container.querySelector<HTMLInputElement>(".notes-search input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        box,
        "kickoff",
      );
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      root.unmount();
    });
    container.remove();

    await new Promise((done) => setTimeout(done, WELL_PAST_THE_DEBOUNCE));

    // Without the cleanup the timer lands here and reaches `window.emqnote`. In a real
    // run that `window` is gone and the throw is charged to another test entirely.
    expect(fake.search).not.toHaveBeenCalled();
  });
});
