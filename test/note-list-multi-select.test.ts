// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote } from "../src/shared/vault-types.js";

/**
 * Marking several notes in the list, and the two things that can then be done with them
 * (B94): Move and Delete, by menu and by drag.
 *
 * Mounted through a real `Library`, like `note-list-menu.test.ts` beside it and for that
 * file's reason: the menu items reach handlers that live on `Library.tsx`, and a
 * stand-alone `NoteList` would prove that the props are called and nothing about what
 * happens next. The pure rules — which rows a range covers, what a Ctrl+click adds — are
 * `multi-select.test.ts`'s, which needs no DOM at all.
 *
 * **Marked is not selected.** One note is open in the reader at all times and marking rows
 * does not change which; what these tests watch for is that the *set* is what the menu
 * acts on, and that a plain click puts the pane back to one open note and no marks.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PATHS = [
  "00 Inbox/Alfa.md",
  "00 Inbox/Beta.md",
  "00 Inbox/Gamma.md",
  "01 Projecten/Delta.md",
];
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function noteSummary(path: string, title: string, index: number): NoteSummary {
  return {
    path,
    fileName: path.split("/").pop() ?? path,
    title,
    kind: "quick",
    created: "2026-08-06T12:00:00+02:00",
    // Descending, so the default `modified` sort leaves them in the order `PATHS` is
    // written in — which is the order every range in this file is measured against.
    modified: `2026-08-0${6 - index}T12:00:00+02:00`,
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
  trashNote: ReturnType<typeof vi.fn>;
  moveNotes: ReturnType<typeof vi.fn>;
  openNoteMock: ReturnType<typeof vi.fn>;
}

function buildFake(): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 3, children: [] },
      { path: "01 Projecten", name: "01 Projecten", noteCount: 1, children: [] },
    ],
  };

  const openNoteMock = vi.fn(async (path: string): Promise<OpenedNote | null> =>
    PATHS.includes(path) ? openedNote(path, path.split("/").pop()!.replace(".md", "")) : null,
  );
  const trashNote = vi.fn(async () => true);
  const moveNotes = vi.fn(async (paths: string[]) => ({
    moved: paths.map((path) => ({ from: path, to: path })),
    locked: [],
  }));

  const library: LibraryApi = {
    tree: async () => tree,
    // The order the list reads in is the order a range is measured against, so this is
    // fixed rather than sorted: `Library.tsx` sorts by `modified`, and these four are
    // dated to come out in the order they are written here.
    notes: async () =>
      PATHS.map((path, index) =>
        noteSummary(path, path.split("/").pop()!.replace(".md", ""), index),
      ),
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: openNoteMock,
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNotes,
    renameNote: async (path) => ({ path }),
    duplicateNote: async (path) => ({ path }),
    trashNote,
    trashContents: async () => ({ notes: 0, folders: 0, files: 0, openTasks: 0, linkedFiles: 0 }),
    openTasksAt: async () => 0,
    emptyTrash: async () => ({ removed: 0, failed: 0 }),
    createFolder: async (parent) => parent,
    renameFolder: async (path) => path,
    folderContents: async () => ({ notes: 0, folders: 0 }),
    contentsAt: async () => ({ notes: 0, folders: 0, files: 0 }),
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

  return { emqnote, trashNote, moveNotes, openNoteMock };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("marking several notes in the list", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;
  let fake: Fake;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
  });

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    fake = buildFake();
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function rows(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));
  }

  function markedPaths(): (string | null)[] {
    return rows()
      .filter((row) => row.classList.contains("note-marked"))
      .map((row) => row.getAttribute("data-path"));
  }

  async function click(
    index: number,
    modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
  ): Promise<void> {
    await act(async () => {
      rows()[index]!.dispatchEvent(new MouseEvent("click", { bubbles: true, ...modifiers }));
    });
    await flush();
  }

  async function rightClick(index: number): Promise<void> {
    await act(async () => {
      rows()[index]!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );
    });
    await flush();
  }

  function menuLabels(): (string | null)[] {
    return Array.from(container.querySelectorAll(".context-menu-label")).map(
      (node) => node.textContent,
    );
  }

  function menuItem(label: string): HTMLButtonElement {
    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".context-menu-item"),
    ).find((node) => node.querySelector(".context-menu-label")?.textContent === label);
    expect(button, `no menu item called ${label}`).not.toBeUndefined();
    return button!;
  }

  it("starts with nothing marked, which is the ordinary state of the list", async () => {
    await click(0);
    expect(markedPaths()).toEqual([]);
  });

  it("Ctrl+click folds in the open note as well as the row clicked", async () => {
    await click(0);
    await click(1, { ctrlKey: true });

    // Both, not just the second: the note in the reader is visibly selected, and a set
    // that silently left it out would move or delete one note fewer than the screen said.
    expect(markedPaths()).toEqual([PATHS[0], PATHS[1]]);
  });

  it("Ctrl+click again takes a row back out, and one row left is no set at all", async () => {
    await click(0);
    await click(1, { ctrlKey: true });
    await click(1, { ctrlKey: true });

    // Not "just Alfa": a lone mark is the ordinary state of a list with one note open,
    // and leaving one behind would leave the pane in a mode nobody can see they are in.
    expect(markedPaths()).toEqual([]);
  });

  it("Shift+click takes everything back to the anchor", async () => {
    await click(0);
    await click(2, { shiftKey: true });

    expect(markedPaths()).toEqual([PATHS[0], PATHS[1], PATHS[2]]);
  });

  it("keeps the reader on the note that was open, not on the row being marked", async () => {
    await click(0);
    fake.openNoteMock.mockClear();
    await click(2, { shiftKey: true });
    await click(1, { ctrlKey: true });

    // Marking is not opening. Nothing about the reader changes, which is what makes a
    // mistaken Ctrl+click cost nothing.
    expect(fake.openNoteMock).not.toHaveBeenCalled();
  });

  it("a plain click puts the list back to one open note", async () => {
    await click(0);
    await click(2, { shiftKey: true });
    await click(3);

    expect(markedPaths()).toEqual([]);
    expect(fake.openNoteMock).toHaveBeenLastCalledWith(PATHS[3]);
  });

  it("Escape clears the marks before it means anything else", async () => {
    await click(0);
    await click(2, { shiftKey: true });

    await act(async () => {
      rows()[0]!.focus();
      rows()[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flush();

    expect(markedPaths()).toEqual([]);
  });

  it("Shift+ArrowDown extends the set from the keyboard, from the same anchor", async () => {
    await click(0);
    await act(async () => {
      rows()[0]!.focus();
      rows()[0]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }),
      );
    });
    await flush();

    expect(markedPaths()).toEqual([PATHS[0], PATHS[1]]);
  });

  it("offers a menu about the set, and only what can mean several notes", async () => {
    await click(0);
    await click(1, { ctrlKey: true });
    await rightClick(1);

    expect(menuLabels()).toEqual(["Move — 2 notes", "Delete — 2 notes"]);
  });

  it("keeps the set when the right-click lands inside it", async () => {
    await click(0);
    await click(1, { ctrlKey: true });
    await rightClick(0);

    expect(markedPaths()).toEqual([PATHS[0], PATHS[1]]);
  });

  it("drops the set when the right-click lands outside it", async () => {
    await click(0);
    await click(1, { ctrlKey: true });
    await rightClick(3);

    // A gesture somewhere else is about somewhere else; the ordinary one-note menu is
    // what comes up, and it must not act on a set still marked further up the list.
    expect(markedPaths()).toEqual([]);
    expect(menuLabels()).toContain("Rename");
  });

  it("deletes every note in the set, after one question naming how many", async () => {
    await click(0);
    await click(1, { ctrlKey: true });
    await rightClick(0);

    await act(async () => {
      menuItem("Delete — 2 notes").click();
    });
    await flush();

    // The question says how many rather than naming them: two titles in quotes would read
    // as the whole answer where there are six, and the rows are lit up behind it.
    expect(container.querySelector(".ask-title")?.textContent).toContain("2 notes");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".ask-buttons .danger")!.click();
    });
    await flush();

    expect(fake.trashNote.mock.calls.map((call) => call[0])).toEqual([PATHS[0], PATHS[1]]);
    expect(markedPaths()).toEqual([]);
  });

  it("moves every note in the set through the one dialog", async () => {
    await click(0);
    await click(1, { ctrlKey: true });
    await rightClick(0);

    await act(async () => {
      menuItem("Move — 2 notes").click();
    });
    await flush();

    const destination = Array.from(
      container.querySelectorAll<HTMLElement>(".move-dialog .palette-row, .palette li"),
    ).find((row) => row.textContent?.includes("01 Projecten"));
    expect(destination, "the move dialog offers no 01 Projecten").not.toBeUndefined();
    await act(async () => {
      destination!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    // **One call carrying the set**, not a call per note (B95): the loop that used to be
    // here cost a walk of the index, a broadcast and a full reload for every row in it.
    expect(fake.moveNotes).toHaveBeenCalledTimes(1);
    expect(fake.moveNotes.mock.calls[0]![0]).toEqual([PATHS[0], PATHS[1]]);
  });

  /**
   * B95's second report — "This note was deleted outside emqnote", raised by moving
   * several notes — read from this end.
   *
   * The open note is normally *in* the marked set (`toggleMarked` seeds the set with it)
   * and a marked set is usually contiguous, so the row next to the note that left was
   * another note on its way out. The reader was handed that path, the very next move
   * vacated it, and when the watcher's `unlink` for it arrived the window announced a
   * deletion it had performed itself.
   */
  it("leaves the reader on a note that is not itself moving", async () => {
    await click(0);
    await click(1, { ctrlKey: true });
    await rightClick(0);

    await act(async () => {
      menuItem("Move — 2 notes").click();
    });
    await flush();

    fake.openNoteMock.mockClear();
    const destination = Array.from(
      container.querySelectorAll<HTMLElement>(".move-dialog .palette-row, .palette li"),
    ).find((row) => row.textContent?.includes("01 Projecten"));
    await act(async () => {
      destination!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    // The row below the two that left, never the one between them: `Beta` is in the set.
    expect(fake.openNoteMock).toHaveBeenCalledWith(PATHS[2]);
    expect(fake.openNoteMock).not.toHaveBeenCalledWith(PATHS[1]);
  });

  it("carries the whole set in a drag started from inside it", async () => {
    await click(0);
    await click(1, { ctrlKey: true });

    const data = new Map<string, string>();
    const event = new Event("dragstart", { bubbles: true }) as Event & {
      dataTransfer: unknown;
    };
    Object.defineProperty(event, "dataTransfer", {
      value: {
        setData: (type: string, value: string) => data.set(type, value),
        effectAllowed: "",
      },
    });
    await act(async () => {
      rows()[0]!.dispatchEvent(event);
    });

    // One path per line — `drag.ts`'s encoding, which the tree decodes on the drop.
    expect(data.get("application/x-emqnote-path")).toBe(`${PATHS[0]}\n${PATHS[1]}`);
  });

  it("carries one note when the drag starts outside the set", async () => {
    await click(0);
    await click(1, { ctrlKey: true });

    const data = new Map<string, string>();
    const event = new Event("dragstart", { bubbles: true }) as Event;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        setData: (type: string, value: string) => data.set(type, value),
        effectAllowed: "",
      },
    });
    await act(async () => {
      rows()[3]!.dispatchEvent(event);
    });

    expect(data.get("application/x-emqnote-path")).toBe(PATHS[3]);
  });
});
