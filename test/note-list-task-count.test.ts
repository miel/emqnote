// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote, TaskCount } from "../src/shared/vault-types.js";

/**
 * The note list's own task count: `2 of 5` under the date, right-aligned against the
 * People line beside it.
 *
 * Mounted through a real `Library`, the way `test/note-list-menu.test.ts` does, because
 * the whole of what is being tested is the seam — the rows come off a `readdir` and the
 * counts come from behind the index scan, so they arrive separately and are merged in.
 * A test that rendered `NoteList` with the counts already in hand would assert the one
 * part that was never in doubt.
 *
 * Three states, and telling the second from the third is the point (B67's rule a level
 * down): a note with work left, a note whose boxes are all ticked, and a note with no
 * task items at all — which draws nothing, exactly as it does while the answer is still
 * on its way.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE_PATH = "00 Inbox/2026-08-06 1200 Test note.md";
const DUPLICATE_PATH = "00 Inbox/2026-08-06 1200 Test note-copy.md";
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
  revealNote: ReturnType<typeof vi.fn>;
  trashNote: ReturnType<typeof vi.fn>;
  duplicateNote: ReturnType<typeof vi.fn>;
}

/**
 * `listPath` is what the one row in the list claims to be. It is a parameter only so the
 * trashed-note case can hand over a `_trash/…` path — `notes()` here ignores the selection
 * anyway, so nothing else has to move for the list to be showing the trash.
 */
function buildFake(listPath: string = NOTE_PATH): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] }],
  };

  const note = openedNote(NOTE_PATH, "Test note");
  const duplicatedNote = openedNote(DUPLICATE_PATH, "Test note-copy");
  const openNoteMock = vi.fn(async (path: string): Promise<OpenedNote | null> => {
    if (path === NOTE_PATH) return note;
    if (path === DUPLICATE_PATH) return duplicatedNote;
    return null;
  });
  const revealNote = vi.fn();
  const trashNote = vi.fn(async () => true);
  const duplicateNote = vi.fn(async () => ({ path: DUPLICATE_PATH }));

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [noteSummary(listPath, "Test note")],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: openNoteMock,
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote: async (path) => ({ path }),
    renameNote: async (path) => ({ path }),
    duplicateNote,
    trashNote,
    emptyTrash: async () => ({ removed: 0, failed: 0 }),
    createFolder: async (parent) => parent,
    renameFolder: async (path) => path,
    folderContents: async () => ({ notes: 0, folders: 0 }),
    trashFolder: async () => ({ trashed: true }),
    moveFolder: async (path) => path,
    deleteFromTrash: async () => ({ deleted: true }),
    revealNote,
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
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
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
    reloadNote: async () => {},
    pickAttachment: async () => null,
    openWikiLink: async () => "none" as const,
    checkAttachments: async () => [],
    pdfPageCount: async () => null,
    linkCandidates: async () => [],
    tagSuggestions: async () => [],
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText: async () => {},
    library,
  };

  return { emqnote, openNoteMock, revealNote, trashNote, duplicateNote };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the note list's task count", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
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

  const WORKING = "00 Inbox/2026-08-19 1000 Offerte.md";
  const FINISHED = "00 Inbox/2026-08-19 1100 Afgerond.md";
  const PLAIN = "00 Inbox/2026-08-19 1200 Zonder taken.md";

  async function mountWith(counts: Record<string, TaskCount>): Promise<void> {
    const fake = buildFake();
    fake.emqnote.library.notes = async () => [
      noteSummary(WORKING, "Offerte"),
      noteSummary(FINISHED, "Afgerond"),
      noteSummary(PLAIN, "Zonder taken"),
    ];
    fake.emqnote.library.noteTaskCounts = async () => counts;

    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  }

  function countOn(path: string): HTMLElement | null {
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));
    const titles = [WORKING, FINISHED, PLAIN];
    const row = rows[titles.indexOf(path)];
    expect(row).toBeDefined();
    return row!.querySelector<HTMLElement>(".note-tasks");
  }

  it("says how many of a note's tasks are still open, and marks the ones with work left", async () => {
    await mountWith({
      [WORKING]: { open: 2, total: 5 },
      [FINISHED]: { open: 0, total: 3 },
    });

    const working = countOn(WORKING);
    expect(working?.textContent?.replace(/\s+/g, " ").trim()).toBe("2 of 5");
    // Both class names, never the modifier alone — see test/styles-note-tasks.test.ts
    // for why the CSS depends on it.
    expect(working?.className).toBe("note-tasks note-tasks-open");

    const finished = countOn(FINISHED);
    expect(finished?.textContent?.replace(/\s+/g, " ").trim()).toBe("0 of 3");
    expect(finished?.className).toBe("note-tasks");
  });

  it("draws nothing at all for a note that has no task items", async () => {
    await mountWith({
      [WORKING]: { open: 2, total: 5 },
      [FINISHED]: { open: 0, total: 3 },
    });

    // Not `0 of 0`: a note that never had a checkbox has nothing to report, and a zero
    // there would read as work finished.
    expect(countOn(PLAIN)).toBeNull();
  });

  it("says nothing for any note until the index has answered", async () => {
    // The map main sends is empty while the scan is still running, and that is the same
    // shape as "these notes have no tasks" — which is exactly why a row draws nothing in
    // both cases rather than claiming a note is clear.
    await mountWith({});

    expect(countOn(WORKING)).toBeNull();
    expect(countOn(FINISHED)).toBeNull();
    expect(countOn(PLAIN)).toBeNull();
  });
});
