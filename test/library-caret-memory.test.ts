// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote } from "../src/shared/vault-types.js";

/**
 * Caret memory across note switches (B70) — `Library.tsx`'s half of it.
 *
 * The `Editor` is mocked out here, the way `test/library-task-focus.test.ts` mocks it:
 * what is under test is *when* the library asks for a caret and when it puts one back,
 * and the editor's own answer to those two questions is
 * `test/editor-selection.test.ts`'s job. A real view would only make it possible for a
 * ProseMirror detail to fail this file.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every selection the library put back, in the order it did so. */
const restored: { anchor: number; head: number }[] = [];
/** What the mocked editor will claim its caret is when the library asks. */
let caret: { anchor: number; head: number } | null = null;
const focusTaskCalls: number[] = [];

vi.mock("../src/renderer/editor/Editor.js", async () => {
  const react = await import("react");
  const Editor = react.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    react.useImperativeHandle(ref, () => ({
      focus: () => {},
      reset: () => {},
      getDoc: () => null,
      setDoc: () => {},
      beginLinkEdit: () => null,
      applyLink: () => {},
      insertAttachment: () => {},
      focusTask: (ordinal: number) => focusTaskCalls.push(ordinal),
      getSelection: () => caret,
      setSelection: (selection: { anchor: number; head: number }) => restored.push(selection),
    }));
    return react.createElement("div", { className: "editor" });
  });
  return { Editor };
});

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
    locationSuggestions: async () => [],
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

describe("caret memory across note switches", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  const A = "00 Inbox/2026-08-19 1000 Note A.md";
  const B = "00 Inbox/2026-08-19 1100 Note B.md";

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
  });

  beforeEach(() => {
    restored.length = 0;
    focusTaskCalls.length = 0;
    caret = null;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function mount(): Promise<void> {
    const fake = buildFake();
    fake.emqnote.library.notes = async () => [
      noteSummary(A, "Note A"),
      noteSummary(B, "Note B"),
    ];
    fake.emqnote.library.openNote = async (path: string) => openedNote(path, path === A ? "Note A" : "Note B");

    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  }

  async function clickRow(path: string): Promise<void> {
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));
    const row = rows[[A, B].indexOf(path)];
    expect(row).toBeDefined();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  it("puts the caret back where it was left in a note that is opened again", async () => {
    await mount();

    // Opening A the first time: nothing is remembered about it, so nothing is restored.
    await clickRow(A);
    expect(restored).toEqual([]);

    // The caret moved to the middle of A. Leaving for B is the moment it is noted.
    caret = { anchor: 42, head: 42 };
    await clickRow(B);

    // B has never been open either, so still nothing is put back — and crucially the
    // caret taken off A was not applied to B.
    expect(restored).toEqual([]);

    caret = { anchor: 7, head: 7 };
    await clickRow(A);
    expect(restored).toEqual([{ anchor: 42, head: 42 }]);
  });

  it("keeps a caret per note rather than one for the window", async () => {
    await mount();

    await clickRow(A);
    caret = { anchor: 42, head: 42 };
    await clickRow(B);
    caret = { anchor: 5, head: 5 };
    await clickRow(A);
    caret = { anchor: 42, head: 42 };
    await clickRow(B);

    expect(restored).toEqual([
      { anchor: 42, head: 42 },
      { anchor: 5, head: 5 },
    ]);
  });

  it("lets a task ordinal win over a remembered caret", async () => {
    // Reaching a note through the Tasks view names a destination inside it. A caret left
    // behind on a previous visit must not be able to overrule that — the two branches in
    // the `docToken` effect are ordered for exactly this.
    const fake = buildFake();
    fake.emqnote.library.notes = async () => [noteSummary(A, "Note A"), noteSummary(B, "Note B")];
    fake.emqnote.library.openNote = async (path: string) =>
      openedNote(path, path === A ? "Note A" : "Note B");
    fake.emqnote.library.tasks = async () => [
      { path: A, title: "Note A", ordinal: 0, checked: false, text: "Offerte versturen" },
    ];

    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    // Open A, leave it with the caret somewhere, so there is something to overrule.
    await clickRow(A);
    caret = { anchor: 42, head: 42 };
    await clickRow(B);
    restored.length = 0;
    focusTaskCalls.length = 0;

    const tasksRow = Array.from(container.querySelectorAll(".tree-settings")).find(
      (el) => el.querySelector(".branch-name")?.textContent === "Tasks",
    );
    expect(tasksRow).not.toBeUndefined();
    await act(async () => {
      tasksRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const taskRows = container.querySelectorAll(".task-row .task-row-text");
    expect(taskRows.length).toBe(1);
    await act(async () => {
      taskRows[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(focusTaskCalls).toEqual([0]);
    expect(restored).toEqual([]);
  });
});
