// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote } from "../src/shared/vault-types.js";

/**
 * Bug 2: clicking the note title in the reader turns it into an input, in place, rather
 * than opening the old separate Rename dialog. This exercises the whole path end to
 * end — a real `Library` mounted with a stubbed `window.emqnote`, real DOM events, and
 * a real ProseMirror `EditorView` underneath (jsdom can mount one; confirmed separately
 * before writing this) — because the interesting bugs here are about state timing
 * (closures over `editingTitle`, the Escape-then-blur double-fire) that a shallow
 * render would not catch.
 *
 * `window.emqnote.platform` is read at module scope by `useBootstrap.ts`, so it has to
 * exist *before* `Library.js` is first imported — hence the dynamic import inside
 * `beforeAll` rather than a static one at the top of the file.
 */

// Tells React this jsdom environment is a testing one, so `act(...)` batches updates
// synchronously instead of warning that nothing is configured to flush them.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE_PATH = "00 Inbox/2026-08-06 1200 Test note.md";
const RENAMED_PATH = "00 Inbox/2026-08-06 1200 Renamed note.md";

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

function openedNote(path: string, title: string, editable: boolean): OpenedNote {
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
    editable,
  };
}

interface Fake {
  emqnote: CaptureApi;
  renameNote: ReturnType<typeof vi.fn>;
  openNoteMock: ReturnType<typeof vi.fn>;
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

  const renameNote = vi.fn(
    async (): Promise<{ path: string; locked?: boolean }> => ({ path: initial.path }),
  );

  const openNoteMock = vi.fn(async (path: string): Promise<OpenedNote | null> => {
    return notesByPath.get(path) ?? null;
  });

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
    renameNote,
    duplicateNote: async (path) => ({ path }),
    trashNote: async () => true,
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
    minimise: () => {},
    toggleMaximise: () => {},
    openLibrary: () => {},
    bootstrap: async () => ({
      locale: "en-US",
      platform: "darwin",
      hotkey: "CommandOrControl+Shift+Space",
      libraryHotkey: "CommandOrControl+Shift+B",
      vaultPath: "/vault",
      libraryPaneWidths: null,
      librarySort: "modified",
      loadRemoteImages: true,
      keepPinnedInView: false,
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
    setKeepPinnedInView: async () => {},
    setHotkey: async () => true,
    setLibraryHotkey: async () => true,
    setPaneWidths: () => {},
    setSort: () => {},
    listVaults: async () => [],
    chooseVault: async () => null,
    switchVault: async () => {},
    saveAttachment: async () => null,
    pickAttachment: async () => null,
    openWikiLink: async () => "none" as const,
    checkAttachments: async () => [],
    pdfPageCount: async () => null,
    linkCandidates: async () => [],
    tagSuggestions: async () => [],
    locationSuggestions: async () => [],
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText: async () => {},
    fetchRemoteImage: async () => null,
    onVaultFileChanged: () => () => {},
    reloadNote: async () => {},
    library,
  };

  // Lets a rename "land": once `renameNote` is told to answer with `RENAMED_PATH`, a
  // follow-up `openNote(RENAMED_PATH)` needs to find a note there.
  notesByPath.set(RENAMED_PATH, openedNote(RENAMED_PATH, "Renamed note", true));

  return { emqnote, renameNote, openNoteMock };
}

/** Flushes the microtask queue a generous number of times, each inside `act`, so chains
 * of `await mockFn()` calls (rename → save → renameNote → openNote → openNote) settle
 * into their final state before an assertion runs. Nothing here uses a real timer. */
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

function keydown(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("clicking the reader title edits it in place (bug 2)", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    // Only needs to exist by import time; each test below replaces it with its own
    // fully-configured fake before mounting.
    (window as unknown as { emqnote: unknown }).emqnote = buildFake(
      openedNote(NOTE_PATH, "Test note", true),
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

  it("shows an input in place of the h1, focused and fully selected", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note", true));
    await mount(fake);
    await openTheNote();

    const h1 = container.querySelector(".reader-header h1")!;
    await act(async () => {
      h1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".reader-header h1")).toBeNull();
    const input = container.querySelector<HTMLInputElement>(".reader-title-input");
    expect(input).not.toBeNull();
    expect(input!.value).toBe("Test note");
    expect(document.activeElement).toBe(input);
    expect(input!.selectionStart).toBe(0);
    expect(input!.selectionEnd).toBe("Test note".length);
  });

  it("does not enter edit mode when the note is not editable", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note", false));
    await mount(fake);
    await openTheNote();

    const h1 = container.querySelector(".reader-header h1")!;
    await act(async () => {
      h1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".reader-title-input")).toBeNull();
    expect(container.querySelector(".reader-header h1")).not.toBeNull();
  });

  it("Enter commits the rename through the existing rename() path", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note", true));
    fake.renameNote.mockResolvedValueOnce({ path: RENAMED_PATH });
    await mount(fake);
    await openTheNote();

    const h1 = container.querySelector(".reader-header h1")!;
    await act(async () => {
      h1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(".reader-title-input")!;
    act(() => {
      setInputValue(input, "Renamed note");
    });
    act(() => {
      keydown(input, "Enter");
    });
    await flush();

    // The third argument is B35's "should the links follow": false here, because
    // nothing in this fake vault links to the note, so nothing was asked.
    expect(fake.renameNote).toHaveBeenCalledWith(NOTE_PATH, "Renamed note", false);
    expect(fake.openNoteMock).toHaveBeenCalledWith(RENAMED_PATH);
    expect(container.querySelector(".reader-title-input")).toBeNull();
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Renamed note");
  });

  it("Escape cancels without renaming", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note", true));
    await mount(fake);
    await openTheNote();

    const h1 = container.querySelector(".reader-header h1")!;
    await act(async () => {
      h1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(".reader-title-input")!;
    act(() => {
      setInputValue(input, "Renamed note");
    });
    act(() => {
      keydown(input, "Escape");
    });
    await flush();

    expect(fake.renameNote).not.toHaveBeenCalled();
    expect(container.querySelector(".reader-title-input")).toBeNull();
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Test note");
  });

  it("cancels rather than renaming to a blank title", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note", true));
    await mount(fake);
    await openTheNote();

    const h1 = container.querySelector(".reader-header h1")!;
    await act(async () => {
      h1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(".reader-title-input")!;
    act(() => {
      setInputValue(input, "   ");
    });
    act(() => {
      keydown(input, "Enter");
    });
    await flush();

    expect(fake.renameNote).not.toHaveBeenCalled();
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Test note");
  });

  it("shows the locked message and keeps the old title when the capture window has claimed the note", async () => {
    const fake = buildFake(openedNote(NOTE_PATH, "Test note", true));
    fake.renameNote.mockResolvedValueOnce({ path: NOTE_PATH, locked: true });
    await mount(fake);
    await openTheNote();

    const h1 = container.querySelector(".reader-header h1")!;
    await act(async () => {
      h1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(".reader-title-input")!;
    act(() => {
      setInputValue(input, "Renamed note");
    });
    act(() => {
      keydown(input, "Enter");
    });
    await flush();

    // The third argument is B35's "should the links follow": false here, because
    // nothing in this fake vault links to the note, so nothing was asked.
    expect(fake.renameNote).toHaveBeenCalledWith(NOTE_PATH, "Renamed note", false);
    expect(fake.openNoteMock).not.toHaveBeenCalledWith(RENAMED_PATH);
    expect(container.textContent).toContain(
      "This note is open in the note window. Close it there first, then it can be renamed.",
    );
    expect(container.querySelector(".reader-header h1")?.textContent).toBe("Test note");
  });
});
