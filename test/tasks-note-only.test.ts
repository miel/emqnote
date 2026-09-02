// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, OpenedNote, TaskItem } from "../src/shared/vault-types.js";

/**
 * The Tasks view's third filter, and where the way out of the view lives.
 *
 * **"This note only" overrides the scope rather than narrowing it.** The note being read
 * can be filed anywhere — you can be standing in one folder, reading a note from another,
 * and press Mod+T — so a filter that only ever cut the rows already fetched would answer
 * "no tasks" for a note that plainly has some. It queries the note's own folder instead
 * and keeps the one note's rows, which is why the calls to `library.tasks` are asserted
 * here and not merely what ends up on screen.
 *
 * **"Exit tasks" sits in the footer**, in the seat the note list's own Tasks button
 * occupies, because that is the button this one undoes. It has moved three times; what has
 * never changed is that it is a word — `--click-button="Exit tasks"` is how the packaged
 * self-test leaves this view, and `library-window.ts` matches a control by its text.
 *
 * `Editor` is mocked for `library-task-focus.test.ts`'s reason: opening a note is a step
 * on the way to the thing under test here, not the thing itself.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
      focusTask: () => {},
      getSelection: () => null,
      setSelection: () => {},
    }));
    return react.createElement("div", { className: "editor" });
  });
  return { Editor };
});

const INBOX_NOTE = "00 Inbox/plan.md";
const PROJECT_NOTE = "01 Projects/klant.md";

/** Two notes in two folders, so a scope and an open note can disagree with each other. */
const ALL_TASKS: TaskItem[] = [
  { path: INBOX_NOTE, title: "plan", ordinal: 0, checked: false, text: "Inbox one" },
  { path: PROJECT_NOTE, title: "klant", ordinal: 0, checked: false, text: "Project one" },
  { path: PROJECT_NOTE, title: "klant", ordinal: 1, checked: false, text: "Project two" },
];

const NOTE_COUNTS: Record<string, { open: number; total: number }> = {
  [INBOX_NOTE]: { open: 1, total: 1 },
  [PROJECT_NOTE]: { open: 2, total: 2 },
};

function openedNote(path: string): OpenedNote {
  return {
    path,
    title: path.slice(path.lastIndexOf("/") + 1, -3),
    kind: "quick",
    created: "2026-09-02T12:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    bodyTags: [],
    doc: { type: "doc", content: [{ type: "paragraph" }] },
    editable: true,
  };
}

function buildFake(): { emqnote: CaptureApi; tasks: ReturnType<typeof vi.fn> } {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] },
      { path: "01 Projects", name: "01 Projects", noteCount: 1, children: [] },
    ],
  };

  // The real rule `tasksIn` applies (`index-db.ts`): a path *prefix*, so a scope is never
  // narrower than "this folder and everything under it".
  const tasks = vi.fn(async (scope: string, _openOnly: boolean) =>
    scope === "" ? ALL_TASKS : ALL_TASKS.filter((item) => item.path.startsWith(`${scope}/`)),
  );

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => NOTE_COUNTS,
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async (path: string) => openedNote(path),
    saveNote: async (request) => ({ written: false, path: request.path }),
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
    conflicts: async () => [],
    conflictDiff: async () => [],
    resolveConflict: async () => {},
    unlinkedAttachments: async () => [],
    trashAttachment: async () => "",
    tasks,
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

  return { emqnote, tasks };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the Tasks view's 'this note only' filter, and where its way out lives", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;
  let tasks: ReturnType<typeof vi.fn>;

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

  /** Mounts and opens the Tasks view through the sidebar row — scoped to `00 Inbox`. */
  async function openTasks(): Promise<void> {
    const fake = buildFake();
    tasks = fake.tasks;
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const row = Array.from(container.querySelectorAll(".tree-settings")).find(
      (el) => el.querySelector(".branch-name")?.textContent === "Tasks",
    );
    expect(row).not.toBeUndefined();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  const noteOnlyBox = (): HTMLInputElement =>
    container.querySelector<HTMLInputElement>(".task-note-only input")!;

  const rowTexts = (): string[] =>
    Array.from(container.querySelectorAll(".task-row-title")).map((node) => node.textContent ?? "");

  /** Opens the Inbox note by clicking its one task row. */
  async function openInboxNote(): Promise<void> {
    const first = container.querySelector(".task-row .task-row-text");
    expect(first).not.toBeNull();
    await act(async () => {
      first!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  /** Picks a folder in the view's own scope chooser. */
  async function chooseScope(folder: string): Promise<void> {
    const select = container.querySelector<HTMLSelectElement>(".task-scope")!;
    await act(async () => {
      select.value = folder;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
  }

  it("leaves the view from a button in the footer, not the header", async () => {
    await openTasks();

    // The seat matters: this is where the note list's own Tasks button sits, and the two
    // are the same control pressed twice.
    expect(container.querySelector(".task-list .pane-header .task-exit")).toBeNull();
    const exit = container.querySelector<HTMLButtonElement>(".task-list .pane-footer .task-exit")!;
    expect(exit).not.toBeNull();
    // A word rather than a glyph — `library-window.ts` matches on `textContent`.
    expect(exit.textContent).toBe("Exit tasks");

    await act(async () => {
      exit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".task-list")).toBeNull();
  });

  it("offers the filter in the header, refused while no note is open", async () => {
    await openTasks();

    const box = noteOnlyBox();
    expect(box).not.toBeNull();
    expect(container.querySelector(".task-list .pane-header .task-note-only")).not.toBeNull();
    // The view is reachable from the sidebar with the reader empty, so this is a real
    // state rather than a defensive one.
    expect(box.disabled).toBe(true);
  });

  it("narrows to the open note, asking its own folder rather than the scope", async () => {
    await openTasks();
    await openInboxNote();

    // Standing somewhere else entirely: the scope says one folder, the reader holds a note
    // from another. This is the case a filter over the fetched rows would answer wrongly.
    await chooseScope("01 Projects");
    expect(rowTexts()).toEqual(["Project one", "Project two"]);

    const box = noteOnlyBox();
    expect(box.disabled).toBe(false);
    await act(async () => {
      box.click();
    });
    await flush();

    expect(tasks).toHaveBeenLastCalledWith("00 Inbox", true);
    expect(rowTexts()).toEqual(["Inbox one"]);
    // The chooser no longer decides anything, and says so rather than offering to narrow
    // a list it is not narrowing.
    expect(container.querySelector<HTMLSelectElement>(".task-scope")!.disabled).toBe(true);
  });

  it("gives the scope back, unchanged, when the tick goes", async () => {
    await openTasks();
    await openInboxNote();
    await chooseScope("01 Projects");

    await act(async () => {
      noteOnlyBox().click();
    });
    await flush();
    await act(async () => {
      noteOnlyBox().click();
    });
    await flush();

    expect(tasks).toHaveBeenLastCalledWith("01 Projects", true);
    expect(rowTexts()).toEqual(["Project one", "Project two"]);
    const select = container.querySelector<HTMLSelectElement>(".task-scope")!;
    expect(select.disabled).toBe(false);
    expect(select.value).toBe("01 Projects");
  });
});
