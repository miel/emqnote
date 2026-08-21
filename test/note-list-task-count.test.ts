// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote, TaskCount } from "../src/shared/vault-types.js";

/**
 * The note list's own task count: `Tasks: 2`, and where on the row it sits.
 *
 * Mounted through a real `Library`, the way `test/note-list-menu.test.ts` does, because
 * the whole of what is being tested is the seam — the rows come off a `readdir` and the
 * counts come from behind the index scan, so they arrive separately and are merged in.
 * A test that rendered `NoteList` with the counts already in hand would assert the one
 * part that was never in doubt.
 *
 * Two things are pinned. **Only open tasks are drawn**, so a note whose boxes are all
 * ticked says nothing at all — which reverses B69's `0 of 5` and is why the finished note
 * below is asserted to be as silent as the note that never had a checkbox. The total is
 * not gone; it is in the `title`, and that is asserted too, or "the tooltip still says it"
 * would be a claim nothing checks.
 *
 * And **the count moves up a row when there is nobody to sit beside**: on `.note-middle`
 * with the excerpt for a note with no attendees, on `.note-bottom` beside them when there
 * are. That is one rule about People, and the placement is the whole of what was reported
 * — a line of every note in the vault spent on a single number.
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
    fetchRemoteImage: async () => null,
    onVaultFileChanged: () => () => {},
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

  async function mountWith(
    counts: Record<string, TaskCount>,
    attendees: string[] = [],
  ): Promise<void> {
    const fake = buildFake();
    fake.emqnote.library.notes = async () => [
      { ...noteSummary(WORKING, "Offerte"), attendees },
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

  function rowFor(path: string): HTMLElement {
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));
    const titles = [WORKING, FINISHED, PLAIN];
    const row = rows[titles.indexOf(path)];
    expect(row).toBeDefined();
    return row!;
  }

  function countOn(path: string): HTMLElement | null {
    return rowFor(path).querySelector<HTMLElement>(".note-tasks");
  }

  it("says how many tasks are still open, and keeps the total in the tooltip", async () => {
    await mountWith({
      [WORKING]: { open: 2, total: 5 },
      [FINISHED]: { open: 0, total: 3 },
    });

    const working = countOn(WORKING);
    expect(working?.textContent?.replace(/\s+/g, " ").trim()).toBe("Tasks: 2");
    // One class, because there is one state left to draw — see
    // test/styles-note-tasks.test.ts for why the stylesheet depends on that.
    expect(working?.className).toBe("note-tasks");
    // The total is not lost, it is a hover away. Asserted, or "it is still in the
    // tooltip" would be a claim nothing checks.
    expect(working?.title).toBe("Open tasks: 2 / 5");
  });

  it("says nothing for a note whose boxes are all ticked", async () => {
    await mountWith({
      [WORKING]: { open: 2, total: 5 },
      [FINISHED]: { open: 0, total: 3 },
    });

    // `0 of 3` until now. The badge is a call to action and a finished note has none —
    // which makes it as quiet as the note below that never had a checkbox.
    expect(countOn(FINISHED)).toBeNull();
  });

  it("draws nothing at all for a note that has no task items", async () => {
    await mountWith({
      [WORKING]: { open: 2, total: 5 },
      [FINISHED]: { open: 0, total: 3 },
    });

    expect(countOn(PLAIN)).toBeNull();
  });

  it("puts the count on the excerpt row when there is nobody to sit beside", async () => {
    await mountWith({ [WORKING]: { open: 2, total: 5 } });

    const row = rowFor(WORKING);
    expect(row.querySelector(".note-middle > .note-tasks")).not.toBeNull();
    // And the row that used to hold it is simply not there — which is the whole report:
    // a line of every note in the vault spent on one number.
    expect(row.querySelector(".note-bottom")).toBeNull();
  });

  it("keeps the count beside the People line when a note has one", async () => {
    await mountWith({ [WORKING]: { open: 2, total: 5 } }, ["Jan de Vries"]);

    const row = rowFor(WORKING);
    expect(row.querySelector(".note-bottom > .note-tasks")).not.toBeNull();
    expect(row.querySelector(".note-middle > .note-tasks")).toBeNull();
    expect(row.querySelector(".note-attendees")?.textContent).toBe("Jan de Vries");
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
