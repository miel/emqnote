// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote } from "../src/shared/vault-types.js";

/**
 * The note list's right-click menu — Open, Move, Rename, Duplicate, Reveal, Delete — mounted
 * through a real `Library` the same way `test/library-title-edit.test.ts` does, because
 * every one of the five items reuses a handler that already lives on `Library.tsx` and
 * the point of this test is that the menu reaches the *real* one, not a stand-in.
 *
 * "Right-clicking a row selects it first" is checked by watching `openNote` — the only
 * definition "selected" has in this codebase today (see `Library.tsx`'s `open` state,
 * tied to `open?.path`); `library-title-edit.test.ts`'s own mount/flush plumbing is
 * reused for the same reason it exists there.
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

describe("the note list's right-click menu", () => {
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

  async function mount(fake: Fake): Promise<void> {
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  }

  function row(): Element {
    const found = container.querySelector(".notes-list .note");
    expect(found).not.toBeNull();
    return found!;
  }

  async function rightClickRow(): Promise<void> {
    await act(async () => {
      row().dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );
    });
    await flush();
  }

  function menuItem(label: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>(".context-menu-item")).find(
      (node) => node.querySelector(".context-menu-label")?.textContent === label,
    );
    expect(button).not.toBeUndefined();
    return button!;
  }

  it("selects the row (opens it) before the menu offers anything to act on", async () => {
    const fake = buildFake();
    await mount(fake);
    expect(fake.openNoteMock).not.toHaveBeenCalled();

    await rightClickRow();

    expect(fake.openNoteMock).toHaveBeenCalledWith(NOTE_PATH);
    expect(container.querySelector(".context-menu")).not.toBeNull();
  });

  it("shows Open, Move, Rename, Duplicate, Reveal, Delete, in that order", async () => {
    const fake = buildFake();
    await mount(fake);
    await rightClickRow();

    const labels = Array.from(container.querySelectorAll(".context-menu-item")).map(
      (node) => node.querySelector(".context-menu-label")!.textContent,
    );
    expect(labels).toEqual(["Open", "Move", "Rename", "Duplicate", "Reveal", "Delete"]);
  });

  it("shows Restore and Delete permanently instead, for a note in the trash", async () => {
    // Move, Rename and Duplicate all *work* on a trashed note — nothing in main refuses
    // one — which is precisely why they must not be offered: they are ways of tidying a
    // vault, on a row that is no longer in it. Read off the path, so no extra state has
    // to travel with the row.
    const fake = buildFake("_trash/2026-08-06 1200 Test note.md");
    await mount(fake);
    await rightClickRow();

    const labels = Array.from(container.querySelectorAll(".context-menu-item")).map(
      (node) => node.querySelector(".context-menu-label")!.textContent,
    );
    expect(labels).toEqual(["Restore", "Delete permanently"]);
  });

  it("Restore asks which folder, through the same palette Move uses", async () => {
    const fake = buildFake("_trash/2026-08-06 1200 Test note.md");
    await mount(fake);
    await rightClickRow();

    await act(async () => {
      menuItem("Restore").click();
    });
    await flush();

    // The trash remembers nothing about where a note came from, so where it goes is a
    // question — and `MoveDialog` is what asks it, here as everywhere else.
    expect(container.querySelector(".palette")).not.toBeNull();
  });

  it("Delete permanently asks first, naming the note and saying it cannot be undone", async () => {
    const fake = buildFake("_trash/2026-08-06 1200 Test note.md");
    await mount(fake);
    await rightClickRow();

    await act(async () => {
      menuItem("Delete permanently").click();
    });
    await flush();

    const ask = container.querySelector(".ask");
    expect(ask).not.toBeNull();
    expect(ask!.textContent).toContain("Test note");
    expect(ask!.textContent).toContain("cannot be undone");
  });

  it("Open re-opens the note through the same openNote path", async () => {
    const fake = buildFake();
    await mount(fake);
    await rightClickRow();
    fake.openNoteMock.mockClear();

    await act(async () => {
      menuItem("Open").click();
    });
    await flush();

    expect(fake.openNoteMock).toHaveBeenCalledWith(NOTE_PATH);
  });

  it("Move opens the existing Move dialog", async () => {
    const fake = buildFake();
    await mount(fake);
    await rightClickRow();

    await act(async () => {
      menuItem("Move").click();
    });
    await flush();

    expect(container.querySelector(".palette")).not.toBeNull();
  });

  it("Rename opens the existing click-to-edit title field, pre-filled with the note's title", async () => {
    const fake = buildFake();
    await mount(fake);
    await rightClickRow();

    await act(async () => {
      menuItem("Rename").click();
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(".reader-title-input");
    expect(input).not.toBeNull();
    expect(input!.value).toBe("Test note");
  });

  it("Duplicate calls duplicateNote and opens the copy", async () => {
    const fake = buildFake();
    await mount(fake);
    await rightClickRow();

    await act(async () => {
      menuItem("Duplicate").click();
    });
    await flush();

    expect(fake.duplicateNote).toHaveBeenCalledWith(NOTE_PATH);
    expect(fake.openNoteMock).toHaveBeenCalledWith(DUPLICATE_PATH);
  });

  it("Reveal calls the existing revealNote IPC call", async () => {
    const fake = buildFake();
    await mount(fake);
    await rightClickRow();

    await act(async () => {
      menuItem("Reveal").click();
    });
    await flush();

    expect(fake.revealNote).toHaveBeenCalledWith(NOTE_PATH);
  });

  it("Delete opens the existing delete confirmation, naming the note", async () => {
    const fake = buildFake();
    await mount(fake);
    await rightClickRow();

    await act(async () => {
      menuItem("Delete").click();
    });
    await flush();

    const dialog = container.querySelector(".ask");
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("Test note");
    expect(fake.trashNote).not.toHaveBeenCalled();

    const confirm = Array.from(dialog!.querySelectorAll<HTMLButtonElement>("button")).find(
      (node) => node.textContent === "Delete" && node.className.includes("danger"),
    );
    expect(confirm).not.toBeUndefined();

    await act(async () => {
      confirm!.click();
    });
    await flush();

    expect(fake.trashNote).toHaveBeenCalledWith(NOTE_PATH);
  });
});
