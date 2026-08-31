// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote, VaultFileEvent } from "../src/shared/vault-types.js";

/**
 * Package C: the library reader's reaction to a note changing or disappearing on disk
 * from outside the app. A real `Library` mounted with a stubbed `window.emqnote`, the
 * same pattern `test/library-title-edit.test.ts` uses, and for the same reason — the
 * interesting bugs here are about state timing (is `dirty` read at the right instant,
 * does the bar apply to the right note) that a shallow render would not catch.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE_PATH = "00 Inbox/2026-08-06 1200 Test note.md";
const OTHER_PATH = "00 Inbox/2026-08-06 1300 Other note.md";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function noteSummary(path: string, title: string): NoteSummary {
  return {
    path,
    fileName: path.split("/").pop() ?? path,
    title,
    kind: "quick",
    created: "2026-08-06T12:00:00+02:00",
    modified: "2026-08-06T12:00:00+02:00",
    attendees: [],
    tags: [],
    excerpt: "",
    pinned: false,
  };
}

function openedNote(path: string, title: string): OpenedNote {
  return {
    path,
    title,
    kind: "quick",
    created: "2026-08-06T12:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    bodyTags: [],
    doc: EMPTY_DOC,
    editable: true,
  };
}

interface Fake {
  emqnote: CaptureApi;
  openNoteMock: ReturnType<typeof vi.fn>;
  /** Simulates main pushing an event, the way `IPC.vaultFileChanged` really arrives. */
  fireFileChanged: (event: VaultFileEvent) => void;
}

/** A `CaptureApi` with just enough behind each method to get `Library` painted. */
function buildFake(initial: OpenedNote): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] }],
  };

  const notesByPath = new Map<string, OpenedNote>([[initial.path, initial]]);

  const openNoteMock = vi.fn(async (path: string): Promise<OpenedNote | null> => {
    return notesByPath.get(path) ?? null;
  });

  let fileChangedHandler: ((event: VaultFileEvent) => void) | null = null;

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [noteSummary(initial.path, initial.title)],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: openNoteMock,
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
    linkingNotes: async () => [],
    onOpenLink: () => () => {},
    onOpenTag: () => () => {},
    tasks: async () => [],
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
    dragWindow: () => {},
    setSort: () => {},
    listVaults: async () => [],
    chooseVault: async () => null,
    switchVault: async () => {},
    saveAttachment: async () => null,
    fetchRemoteImage: async () => null,
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
    onSettingsChanged: () => () => {},
    onVaultFileChanged: (handler) => {
      fileChangedHandler = handler;
      return () => {
        fileChangedHandler = null;
      };
    },
    reloadNote: async () => {},
    library,
  };

  notesByPath.set(OTHER_PATH, openedNote(OTHER_PATH, "Other note"));

  return {
    emqnote,
    openNoteMock,
    fireFileChanged: (event) => fileChangedHandler?.(event),
  };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the library reacts to a note changing on disk (Package C)", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake(
      openedNote(NOTE_PATH, "Test note"),
    ).emqnote;
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

  async function mount(fake: Fake): Promise<void> {
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  }

  async function openTheNote(): Promise<void> {
    const row = container.querySelector(".notes-list .note");
    expect(row).not.toBeNull();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Test note");
  }

  /** Dirties the open note without touching ProseMirror: the header's plain `location`
   *  input already runs through `onHeaderChange`, which is all `dirty` needs. */
  function makeDirty(): void {
    const location = container.querySelector<HTMLInputElement>(".header input.location")!;
    setInputValue(location, "Somewhere");
  }

  it("reloads automatically for a clean note, with no bar shown", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote();
    fake.openNoteMock.mockClear();

    act(() => {
      fake.fireFileChanged({ path: NOTE_PATH, kind: "changed" });
    });
    await flush();

    expect(fake.openNoteMock).toHaveBeenCalledWith(NOTE_PATH);
    expect(container.querySelector(".disk-change-bar")).toBeNull();
  });

  it("shows Reload/Keep mine for a dirty note, and Reload reloads it", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote();
    act(() => makeDirty());
    await flush();
    fake.openNoteMock.mockClear();

    act(() => {
      fake.fireFileChanged({ path: NOTE_PATH, kind: "changed" });
    });
    await flush();

    // Not auto-reloaded — there is something of the user's own on screen.
    expect(fake.openNoteMock).not.toHaveBeenCalled();
    const bar = container.querySelector(".disk-change-bar");
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain("changed outside emqnote");

    const buttons = Array.from(bar!.querySelectorAll("button"));
    const reload = buttons.find((button) => button.textContent === "Reload")!;
    await act(async () => {
      reload.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(fake.openNoteMock).toHaveBeenCalledWith(NOTE_PATH);
    expect(container.querySelector(".disk-change-bar")).toBeNull();
  });

  it("'Keep mine' dismisses the bar without reloading", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote();
    act(() => makeDirty());
    await flush();
    fake.openNoteMock.mockClear();

    act(() => {
      fake.fireFileChanged({ path: NOTE_PATH, kind: "changed" });
    });
    await flush();

    const bar = container.querySelector(".disk-change-bar")!;
    const buttons = Array.from(bar.querySelectorAll("button"));
    const keepMine = buttons.find((button) => button.textContent === "Keep mine")!;
    await act(async () => {
      keepMine.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(fake.openNoteMock).not.toHaveBeenCalled();
    expect(container.querySelector(".disk-change-bar")).toBeNull();
    // The note stays open and dirty — "keep mine" touched nothing.
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Test note");
  });

  it("shows Close/Keep mine for a removed note, and Close clears the reader", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote();

    act(() => {
      fake.fireFileChanged({ path: NOTE_PATH, kind: "removed" });
    });
    await flush();

    const bar = container.querySelector(".disk-change-bar");
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain("deleted outside emqnote");

    const buttons = Array.from(bar!.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["Close", "Keep mine"]);

    const close = buttons.find((button) => button.textContent === "Close")!;
    await act(async () => {
      close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".reader-empty")).not.toBeNull();
    expect(container.querySelector(".disk-change-bar")).toBeNull();
  });

  it("a 'removed' event never auto-closes a clean note on its own", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote();

    act(() => {
      fake.fireFileChanged({ path: NOTE_PATH, kind: "removed" });
    });
    await flush();

    // The bar is offered, but nothing closed itself.
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Test note");
  });

  it("does nothing for an event about a note that is not the one open", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote();

    act(() => {
      fake.fireFileChanged({ path: OTHER_PATH, kind: "changed" });
    });
    await flush();

    expect(fake.openNoteMock).not.toHaveBeenCalledWith(OTHER_PATH);
    expect(container.querySelector(".disk-change-bar")).toBeNull();
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Test note");
  });
});
