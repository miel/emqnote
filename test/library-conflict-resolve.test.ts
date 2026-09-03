// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type {
  ConflictPair,
  FolderNode,
  NoteSummary,
  OpenedNote,
  VaultFileEvent,
} from "../src/shared/vault-types.js";

/**
 * What the reader shows after a OneDrive conflict has been resolved (B101).
 *
 * `resolveConflict` was fired from inside `ConflictBanner`, and main answers it with
 * `notifyLibrary()` — which reloads the tree, the list, the facets and the conflict list,
 * and never the note actually on screen. So "Keep that one" replaced the original's bytes
 * on disk and the reader went on showing the losing version until something else happened
 * to reopen it.
 *
 * Deliberately not left to the watcher, which does raise an `unlink`/`add` pair for the
 * trash-and-rename underneath: whether that arrives as one event or two, and in which
 * order, is chokidar's business, and the reader agreeing with the disk after a button the
 * user just pressed is not a thing to leave to a race.
 *
 * A real `Library` with a stubbed `window.emqnote`, the same pattern
 * `library-disk-change.test.ts` uses next door and for its reason: the question is which
 * path the reader reopens, which a shallow render cannot answer.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE_PATH = "00 Inbox/2026-08-06 1200 Test note.md";
const OTHER_PATH = "00 Inbox/2026-08-06 1300 Other note.md";
const CONFLICT_PATH = "00 Inbox/2026-08-06 1200 Test note-LAPTOP-ABC123.md";
const PAIR: ConflictPair = { original: NOTE_PATH, conflict: CONFLICT_PATH };

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
  saveNoteMock: ReturnType<typeof vi.fn>;
  resolveConflictMock: ReturnType<typeof vi.fn>;
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

  const resolveConflictMock = vi.fn(async () => {});
  const saveNoteMock = vi.fn(async (request: { path: string }) => ({

    written: true,

    path: request.path,

  }));

  const openNoteMock = vi.fn(async (path: string): Promise<OpenedNote | null> => {
    return notesByPath.get(path) ?? null;
  });

  let fileChangedHandler: ((event: VaultFileEvent) => void) | null = null;

  const library: LibraryApi = {
    tree: async () => tree,
    // All three rows: the note, the conflict copy beside it (a row like any other, which
    // is how the reader can be standing on the losing file), and one unrelated note.
    notes: async () => [
      noteSummary(NOTE_PATH, "Test note"),
      noteSummary(CONFLICT_PATH, "Test note"),
      noteSummary(OTHER_PATH, "Other note"),
    ],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: openNoteMock,
    saveNote: saveNoteMock,
    moveNotes: async (paths: string[]) => ({
      moved: paths.map((path) => ({ from: path, to: path })),
      locked: [],
    }),
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
    conflicts: async () => [PAIR],
    conflictDiff: async () => [],
    resolveConflict: resolveConflictMock,
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
      openAtLogin: true,
      appVersion: "0.0.0-test",
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
    setKeepPinnedInView: async () => {},
    setEditorFontSize: async () => {},
    setTheme: async () => {},
    setOpenAtLogin: async () => {},
    checkForUpdates: async () => {},
    onUpdateCheckState: () => () => {},
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
  notesByPath.set(CONFLICT_PATH, openedNote(CONFLICT_PATH, "Test note"));

  return {
    emqnote,
    openNoteMock,
    saveNoteMock,
    resolveConflictMock,
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

describe("resolving a conflict, and what the reader shows afterwards", () => {
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
    act(() => root.unmount());
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

  /** Opens the note by clicking its row, the way a hand would. */
  async function openTheNote(path: string): Promise<void> {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note")).find(
      (node) => node.getAttribute("data-path") === path,
    )!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  /** The banner, then the choice inside its dialog. */
  async function resolve(label: string): Promise<void> {
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".conflict-banner")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".conflict-dialog button"),
    ).find((node) => node.textContent === label)!;
    expect(button, `no ${label} button in the conflict dialog`).not.toBeUndefined();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  it("reopens the note it was reading after 'Keep that one' rewrites it", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote(NOTE_PATH);
    fake.openNoteMock.mockClear();

    await resolve("Keep that one");

    expect(fake.resolveConflictMock).toHaveBeenCalledTimes(1);
    // The whole report: the bytes at this path changed, so the reader has to read them.
    expect(fake.openNoteMock).toHaveBeenCalledWith(NOTE_PATH);
  });

  it("follows the conflict copy onto the original it was renamed over", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    // Standing on the losing copy rather than the original — it is a row in the list like
    // any other, and "Keep that one" renames it over the original's path.
    await openTheNote(CONFLICT_PATH);
    fake.openNoteMock.mockClear();

    await resolve("Keep that one");

    expect(fake.openNoteMock).toHaveBeenCalledWith(NOTE_PATH);
  });

  it("puts the reader away when the copy it was reading is the one that goes", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote(CONFLICT_PATH);
    fake.openNoteMock.mockClear();

    await resolve("Keep this one");

    // The file is in the trash; there is nothing left at that path to show.
    expect(fake.openNoteMock).not.toHaveBeenCalled();
    expect(container.querySelector(".reader-empty")).not.toBeNull();
  });

  it("leaves a note that has nothing to do with the conflict alone", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note"));
    await mount(fake);
    await openTheNote(OTHER_PATH);
    fake.openNoteMock.mockClear();

    await resolve("Keep that one");

    expect(fake.resolveConflictMock).toHaveBeenCalledTimes(1);
    // Reopening it would throw away a caret the user had put somewhere, over a decision
    // about two other files.
    expect(fake.openNoteMock).not.toHaveBeenCalled();
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Other note");
  });
});
