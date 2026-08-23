// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, OpenedNote, TaskItem } from "../src/shared/vault-types.js";

/**
 * Bug: clicking a second task in the Tasks view, when it lives in the same note as the
 * task already selected, left the caret on the first task. `Editor` is mocked here
 * rather than mounted for real: `focusTaskAt`'s own selection dispatch never touches the
 * browser's DOM Selection unless the view already has focus (prosemirror-view's
 * `editorOwnsSelection` gates on `view.hasFocus()`), which `focusTask` deliberately never
 * calls — so a real mount has nothing observable in jsdom to assert on. Recording calls
 * to the imperative handle instead tests the actual thing in question: does `Library`
 * ask the editor to move the caret every time a task is clicked, even to a note already
 * open.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const focusTaskCalls: number[] = [];
const setDocCalls: unknown[] = [];

vi.mock("../src/renderer/editor/Editor.js", async () => {
  const react = await import("react");
  const Editor = react.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    react.useImperativeHandle(ref, () => ({
      focus: () => {},
      reset: () => {},
      getDoc: () => null,
      setDoc: (doc: unknown) => setDocCalls.push(doc),
      beginLinkEdit: () => null,
      applyLink: () => {},
      insertAttachment: () => {},
      focusTask: (ordinal: number) => focusTaskCalls.push(ordinal),
      // B70's caret memory. Nothing here is about it — `test/library-caret-memory.test.ts`
      // is — but `Library.tsx` asks every note it leaves for its caret, so a stub without
      // these throws on the way out of the first note and takes this file down with it.
      getSelection: () => null,
      setSelection: () => {},
    }));
    return react.createElement("div", { className: "editor" });
  });
  return { Editor };
});

const NOTE_PATH = "00 Inbox/2026-08-06 1200 Test note.md";

const TWO_TASKS_DOC = {
  type: "doc",
  content: [
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Een" }] }],
        },
        {
          type: "listItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Twee" }] }],
        },
      ],
    },
  ],
};

function openedNote(): OpenedNote {
  return {
    path: NOTE_PATH,
    title: "Test note",
    kind: "quick",
    created: "2026-08-06T12:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    bodyTags: [],
    doc: TWO_TASKS_DOC,
    editable: true,
  };
}

function taskItem(ordinal: number, text: string): TaskItem {
  return { path: NOTE_PATH, title: "Test note", ordinal, checked: false, text };
}

/**
 * A fake whose `openNote` never resolves on its own — the test decides the order, in
 * which one, so it can reproduce a slower first click's IPC round trip completing
 * *after* a faster second one's, which is the failure mode `openNoteRequest` guards
 * against. `opens[n]` resolves the n-th call to `openNote`, in whatever order the test
 * calls them.
 */
function buildControllableFake(): { emqnote: CaptureApi; opens: Array<() => void> } {
  const opens: Array<() => void> = [];

  const fake = buildFake();
  fake.library.openNote = (): Promise<OpenedNote | null> =>
    new Promise((resolve) => {
      opens.push(() => resolve(openedNote()));
    });

  return { emqnote: fake, opens };
}

function buildFake(): CaptureApi {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] }],
  };

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async () => openedNote(),
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote: async (path) => ({ path }),
    renameNote: async (path) => ({ path }),
    duplicateNote: async (path) => ({ path }),
    trashNote: async () => true,
    trashContents: async () => ({ notes: 0, folders: 0, files: 0 }),
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
    tasks: async () => [taskItem(0, "Een"), taskItem(1, "Twee")],
    toggleTask: async () => ({ toggled: true }),
    setPinned: async (_path: string, pinned: boolean) => ({ pinned }),
  };

  return {
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
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("clicking a task moves the caret, including a second task in the same note", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake();
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
  });

  beforeEach(() => {
    focusTaskCalls.length = 0;
    setDocCalls.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("moves the caret to the second task even though it is in the note already open", async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake();
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const tasksRow = Array.from(container.querySelectorAll(".tree-settings")).find(
      (el) => el.querySelector(".branch-name")?.textContent === "Tasks",
    );
    expect(tasksRow).not.toBeUndefined();
    await act(async () => {
      tasksRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const rows = container.querySelectorAll(".task-row .task-row-text");
    expect(rows.length).toBe(2);

    await act(async () => {
      rows[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(focusTaskCalls).toEqual([0]);

    await act(async () => {
      rows[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(focusTaskCalls).toEqual([0, 1]);
  });

  it("does not let a slow first click clobber a faster second one", async () => {
    const { emqnote, opens } = buildControllableFake();
    (window as unknown as { emqnote: unknown }).emqnote = emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const tasksRow = Array.from(container.querySelectorAll(".tree-settings")).find(
      (el) => el.querySelector(".branch-name")?.textContent === "Tasks",
    );
    await act(async () => {
      tasksRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const rows = container.querySelectorAll(".task-row .task-row-text");
    expect(rows.length).toBe(2);

    // Click task 0, then task 1, without letting either's `openNote` IPC call resolve
    // yet — exactly a user clicking a second task before the first's round trip has
    // come back, which two tasks sitting right next to each other in the list makes
    // easy to do.
    act(() => {
      rows[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      rows[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(focusTaskCalls).toEqual([]);
    expect(opens).toHaveLength(2);

    // The *second* click's round trip lands first; the first click's — now stale —
    // lands after. The most recently clicked task must still win.
    await act(async () => {
      opens[1]!();
    });
    await flush();
    await act(async () => {
      opens[0]!();
    });
    await flush();

    expect(focusTaskCalls).toEqual([1]);
  });
});
