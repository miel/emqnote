// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote } from "../src/shared/vault-types.js";

/**
 * The reader toolbar's "Actions" overflow menu — Rename/Move/Duplicate/Reveal/Delete, collapsed
 * out of five always-on buttons that used to squeeze the title. Mounted through a real
 * `Library`, the same way `test/note-list-menu.test.ts` drives the note list's own
 * right-click menu: every item here reuses a handler that already lives on `Library.tsx`,
 * so the point is reaching the *real* one through the new button, not a stand-in.
 *
 * Unlike the note-list menu, this one opens from a plain button click, not a right-click —
 * see CLAUDE.md's context-menu constraint for why that has to stay true for
 * `--click-button="Actions>Rename"` to keep working, which is a packaged-build concern this
 * suite cannot exercise directly. What it can check is that the button opens the same
 * `ContextMenu` component with `.context-menu-label` spans, which is what that selector
 * depends on.
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
    doc: EMPTY_DOC,
    editable: true,
  };
}

interface Fake {
  emqnote: CaptureApi;
  revealNote: ReturnType<typeof vi.fn>;
  trashNote: ReturnType<typeof vi.fn>;
  duplicateNote: ReturnType<typeof vi.fn>;
}

function buildFake(): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] }],
  };

  const note = openedNote(NOTE_PATH, "Test note");
  const duplicatedNote = openedNote(DUPLICATE_PATH, "Test note-copy");
  const revealNote = vi.fn();
  const trashNote = vi.fn(async () => true);
  const duplicateNote = vi.fn(async () => ({ path: DUPLICATE_PATH }));

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [noteSummary(NOTE_PATH, "Test note")],
    folderFiles: async () => [],
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async (path) => {
      if (path === NOTE_PATH) return note;
      if (path === DUPLICATE_PATH) return duplicatedNote;
      return null;
    },
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote: async (path) => ({ path }),
    renameNote: async (path) => ({ path }),
    duplicateNote,
    trashNote,
    emptyTrash: async () => 0,
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
    orphanedAttachments: async () => [],
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
      vaultPath: "/vault",
      libraryPaneWidths: null,
      librarySort: "modified",
      loadRemoteImages: true,
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
    setHotkey: async () => true,
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
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText: async () => {},
    library,
  };

  return { emqnote, revealNote, trashNote, duplicateNote };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the reader toolbar's overflow menu", () => {
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

  async function mountWithNoteOpen(fake: Fake): Promise<void> {
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const row = container.querySelector(".notes-list .note");
    expect(row).not.toBeNull();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  function openOverflowMenu(): void {
    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".reader-actions button"),
    ).find((node) => node.textContent === "Actions");
    expect(button).not.toBeUndefined();
    act(() => {
      button!.click();
    });
  }

  function menuItem(label: string): HTMLButtonElement {
    const found = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".context-menu-item"),
    ).find((node) => node.querySelector(".context-menu-label")?.textContent === label);
    expect(found).not.toBeUndefined();
    return found!;
  }

  it("opens with Rename, Move, Duplicate, Reveal, Delete, in that order", async () => {
    const fake = buildFake();
    await mountWithNoteOpen(fake);

    openOverflowMenu();
    await flush();

    const labels = Array.from(container.querySelectorAll(".context-menu-item")).map(
      (node) => node.querySelector(".context-menu-label")!.textContent,
    );
    expect(labels).toEqual(["Rename", "Move", "Duplicate", "Reveal", "Delete"]);
  });

  it("Rename opens the click-to-edit title field, pre-filled with the open note's title", async () => {
    const fake = buildFake();
    await mountWithNoteOpen(fake);

    openOverflowMenu();
    await flush();
    await act(async () => {
      menuItem("Rename").click();
    });
    await flush();

    const input = container.querySelector<HTMLInputElement>(".reader-title-input");
    expect(input).not.toBeNull();
    expect(input!.value).toBe("Test note");
  });

  it("Move opens the existing Move dialog", async () => {
    const fake = buildFake();
    await mountWithNoteOpen(fake);

    openOverflowMenu();
    await flush();
    await act(async () => {
      menuItem("Move").click();
    });
    await flush();

    expect(container.querySelector(".palette")).not.toBeNull();
  });

  it("Duplicate calls duplicateNote on the open note and opens the copy", async () => {
    const fake = buildFake();
    await mountWithNoteOpen(fake);

    openOverflowMenu();
    await flush();
    await act(async () => {
      menuItem("Duplicate").click();
    });
    await flush();

    expect(fake.duplicateNote).toHaveBeenCalledWith(NOTE_PATH);
    const title = container.querySelector(".reader-header h1");
    expect(title?.textContent).toBe("Test note-copy");
  });

  it("Reveal calls revealNote with the open note's path", async () => {
    const fake = buildFake();
    await mountWithNoteOpen(fake);

    openOverflowMenu();
    await flush();
    await act(async () => {
      menuItem("Reveal").click();
    });
    await flush();

    expect(fake.revealNote).toHaveBeenCalledWith(NOTE_PATH);
  });

  it("Delete opens the existing delete confirmation, naming the open note", async () => {
    const fake = buildFake();
    await mountWithNoteOpen(fake);

    openOverflowMenu();
    await flush();
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

  /**
   * The Insert menu, which replaced 🖼 🔗 ▦ 📎 in this same toolbar. Same arrangement as
   * the overflow menu above and for the same reason — what is worth pinning is that a
   * plain button opens the real `ContextMenu` with `.context-menu-label` spans, since
   * that is what `--click-button="Insert>Table…"` walks.
   */
  describe("the Insert menu", () => {
    function openInsertMenu(): void {
      const button = Array.from(
        container.querySelectorAll<HTMLButtonElement>(".reader-actions button"),
      ).find((node) => node.textContent === "Insert");
      expect(button).not.toBeUndefined();
      act(() => {
        button!.click();
      });
    }

    it("offers image, file, note link, table and a divider", async () => {
      const fake = buildFake();
      await mountWithNoteOpen(fake);

      openInsertMenu();
      await flush();

      const labels = Array.from(container.querySelectorAll(".context-menu-item")).map(
        (node) => node.querySelector(".context-menu-label")!.textContent,
      );
      // The first four are the buttons it replaced; the divider joined them on
      // 14 August 2026, the one insert item with no picker and no shortcut behind it.
      expect(labels).toEqual([
        "Insert image",
        "Insert file",
        "Link to note…",
        "Table…",
        "Divider",
      ]);
    });

    it("reaches the same note picker a typed [[ opens", async () => {
      const fake = buildFake();
      await mountWithNoteOpen(fake);

      openInsertMenu();
      await flush();
      await act(async () => {
        menuItem("Link to note…").click();
      });
      await flush();

      // The picker's own filter box, on the palette surface — the one `NotePicker` draws.
      expect(container.querySelector(".palette input")).not.toBeNull();
    });

    it("opens the table size grid, at the caret rather than at the button", async () => {
      const fake = buildFake();
      await mountWithNoteOpen(fake);

      openInsertMenu();
      await flush();
      await act(async () => {
        menuItem("Table…").click();
      });
      await flush();

      expect(container.querySelector(".table-grid")).not.toBeNull();
    });
  });
});
