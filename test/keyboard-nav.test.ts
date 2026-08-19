// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote, Selection } from "../src/shared/vault-types.js";

/**
 * The roving-tabIndex keyboard navigation across the three library panes — the tree, the
 * note list and the editor — mounted through a real `Library`, the same way
 * `test/library-title-edit.test.ts` and `test/note-list-menu.test.ts` do: the interesting
 * bugs here are about which DOM element actually has focus after a real `KeyboardEvent`,
 * which a shallow render cannot see.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The pane cycle's own handler, as the window registers it.
 *
 * Ctrl-Tab is claimed in main (`library-window.ts`'s `before-input-event`) and forwarded
 * over `IPC.libraryCyclePanes`, so a `keydown` carrying the chord is no longer a thing
 * that happens — dispatching one here would test a route the app does not have. Firing
 * this is the renderer's half of the real one.
 */
let cyclePanes: ((event: { backward: boolean }) => void) | null = null;

/** Every folder `library.newNote` was asked to file into, so Mod-N can be checked. */
let newNoteCalls: string[] = [];

const NOTE_PATH = "00 Inbox/2026-08-06 1200 Test note.md";
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

function buildFake(): CaptureApi {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] },
      { path: "01 Projects", name: "01 Projects", noteCount: 0, children: [] },
    ],
  };

  const note = openedNote(NOTE_PATH, "Test note");

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async (selection: Selection) =>
      selection.kind === "folder" && selection.path === "00 Inbox"
        ? [noteSummary(NOTE_PATH, "Test note")]
        : [],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async (path) => (path === NOTE_PATH ? note : null),
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote: async (path) => ({ path }),
    renameNote: async (path) => ({ path }),
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
    newNote: (folder?: string) => {
      newNoteCalls.push(folder ?? "");
    },
    onRefresh: () => () => {},
    onCyclePanes: (handler) => {
      cyclePanes = handler;
      return () => {
        cyclePanes = null;
      };
    },
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
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** One step around the ring, as main asks for it. `backward` is Shift. */
function cycle(backward: boolean): void {
  act(() => {
    cyclePanes?.({ backward });
  });
}

function keydown(
  target: Element,
  key: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }),
    );
  });
}

describe("keyboard navigation across the library's panes", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake();
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

  async function mount(): Promise<void> {
    newNoteCalls = [];
    (window as unknown as { emqnote: unknown }).emqnote = buildFake();
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  }

  function treeRows(): HTMLElement[] {
    return Array.from(container.querySelectorAll('.tree [role="treeitem"]'));
  }

  function noteRows(): HTMLElement[] {
    return Array.from(container.querySelectorAll(".notes-list .note"));
  }

  it("has exactly one tree row with tabIndex 0", async () => {
    await mount();
    const zeroed = treeRows().filter((node) => node.tabIndex === 0);
    expect(zeroed).toHaveLength(1);
  });

  it("has exactly one note row with tabIndex 0", async () => {
    await mount();
    const zeroed = noteRows().filter((node) => node.tabIndex === 0);
    expect(zeroed).toHaveLength(1);
  });

  it("moves the tree's tabIndex with ArrowDown, and focuses the row it moved to", async () => {
    await mount();
    const rows = treeRows();
    const names = rows.map((node) => node.querySelector(".branch-name")?.textContent);
    expect(names).toEqual(expect.arrayContaining(["Vault", "00 Inbox", "01 Projects"]));

    const first = rows.find((node) => node.tabIndex === 0)!;
    first.focus();
    expect(document.activeElement).toBe(first);

    keydown(first, "ArrowDown");

    const nowZeroed = treeRows().filter((node) => node.tabIndex === 0);
    expect(nowZeroed).toHaveLength(1);
    expect(nowZeroed[0]).not.toBe(first);
    expect(document.activeElement).toBe(nowZeroed[0]);
  });

  it("Tab moves focus from the tree's active row into the note list", async () => {
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, "Tab");

    const activeNote = noteRows().find((node) => node.tabIndex === 0)!;
    expect(document.activeElement).toBe(activeNote);
  });

  it("Tab moves focus from the note list's active row into the editor", async () => {
    await mount();
    // The editor is only mounted once a note is open (`Library.tsx` renders it inside
    // the `open !== null` branch) — the same as clicking the row would, or Enter on it.
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    await act(async () => {
      noteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    act(() => {
      noteRow.focus();
    });
    keydown(noteRow, "Tab");
    await flush();

    expect(document.activeElement?.className).toContain("editor-content");
  });

  it("Ctrl-Tab completes the cycle back to the tree from inside the editor", async () => {
    await mount();
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    await act(async () => {
      noteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const editorContent = container.querySelector<HTMLElement>(".editor-content")!;
    editorContent.focus();
    expect(document.activeElement).toBe(editorContent);

    cycle(false);

    const activeTreeRow = treeRows().find((node) => node.tabIndex === 0)!;
    expect(document.activeElement).toBe(activeTreeRow);
  });

  it("Ctrl-Tab enters the tree from a cold click that lands on no pane at all", async () => {
    await mount();
    // The ordinary state after clicking anywhere that isn't a row — `paneOf` recognises
    // only a tree row, a note row, a task row or `.editor-content`, so focus sits on
    // `document.body` (nothing having been focused at all, here) and there is no pane to
    // step *from*. The chord enters the first one rather than doing nothing, which is the
    // one case where it and a plain Tab deliberately differ: a plain Tab has a browser
    // default worth keeping there, and the chord has none.
    expect(document.activeElement === document.body || document.activeElement === null).toBe(
      true,
    );

    cycle(false);

    const activeTreeRow = treeRows().find((node) => node.tabIndex === 0)!;
    expect(document.activeElement).toBe(activeTreeRow);
  });

  it("Ctrl-Shift-Tab enters the editor from a cold click, the reverse direction", async () => {
    await mount();
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    await act(async () => {
      noteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    // The note-list search box: a real control inside the notes pane that `paneOf` does
    // not recognise as belonging to it (only `.note[role="option"]` counts), so this is
    // another "cold" spot exactly like the one above, but with a note already open — the
    // reverse chord has an editor to land in this time.
    const searchInput = container.querySelector<HTMLInputElement>(".notes-search input")!;
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    cycle(true);
    await flush();

    expect(document.activeElement?.className).toContain("editor-content");
  });

  it("Mod-Shift-M inside the editor opens the note panel's context menu at the caret", async () => {
    await mount();
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    await act(async () => {
      noteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const editorContent = container.querySelector<HTMLElement>(".editor-content")!;
    editorContent.focus();
    expect(container.querySelector(".context-menu")).toBeNull();

    // The tree and note-list rows already answer `isContextMenuKey` in their own
    // `onKeyDown`; the note panel only wired the mouse-driven `contextmenu` event before
    // this, so Mod-Shift-M — `Mod` is `metaKey` on the `darwin` platform this fake
    // reports — went nowhere from inside it.
    act(() => {
      editorContent.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "m",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    expect(container.querySelector(".context-menu")).not.toBeNull();
  });

  it("Escape while focus is in the editor returns focus to the note list", async () => {
    await mount();
    // Open the note first, the same way clicking the row or Enter on it would — the
    // editor otherwise has nothing loaded to focus into meaningfully, though the
    // element itself is present and focusable either way.
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    await act(async () => {
      noteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const editorContent = container.querySelector<HTMLElement>(".editor-content")!;
    editorContent.focus();
    expect(document.activeElement).toBe(editorContent);

    keydown(editorContent, "Escape");

    const activeNote = noteRows().find((node) => node.tabIndex === 0)!;
    expect(document.activeElement).toBe(activeNote);
  });

  /**
   * One Escape must do one thing.
   *
   * An overlay handles its own Escape and, on the way out, gives focus back to whatever
   * opened it. The window listener above then saw the editor focused and read the same
   * still-bubbling key as "leave the editor", so closing a menu or the help sheet from
   * inside a note also threw focus into the note list — while `Mod-/` a second time,
   * which is not Escape, did not. That asymmetry is exactly what was reported.
   *
   * Both halves of the fix are asserted here because either alone would pass this: the
   * overlays stop the key at their own panel, and the listener asks the *event* where it
   * happened rather than asking where focus ended up.
   *
   * **Only the context-menu case pins the bug in jsdom**, and that is worth saying rather
   * than assuming. Checked by reverting both halves: the menu test fails, and the help
   * test does not — `ContextMenu` restores focus synchronously inside its own `close()`,
   * while `Help` restores it from an unmount cleanup that jsdom runs after the event has
   * finished bubbling, so the ordering that produces the bug in a real window does not
   * occur here. The help test stays because it still asserts the end state a person cares
   * about; the ordering itself is a `TEST-PROTOCOL.md` item.
   */
  async function openNote(): Promise<HTMLElement> {
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    await act(async () => {
      noteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    return container.querySelector<HTMLElement>(".editor-content")!;
  }

  it("Escape out of the note panel's context menu stays in the editor", async () => {
    await mount();
    const editorContent = await openNote();
    editorContent.focus();

    act(() => {
      editorContent.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "m",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();

    const menu = container.querySelector<HTMLElement>(".context-menu")!;
    expect(menu).not.toBeNull();

    act(() => {
      menu.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    await flush();

    expect(container.querySelector(".context-menu")).toBeNull();
    expect(document.activeElement).toBe(editorContent);
  });

  it("Escape out of the help sheet opened from the editor stays in the editor", async () => {
    await mount();
    const editorContent = await openNote();
    editorContent.focus();

    keydown(editorContent, "/", { metaKey: true });
    await flush();

    const sheet = container.querySelector<HTMLElement>(".help")!;
    expect(sheet).not.toBeNull();

    act(() => {
      sheet.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    await flush();

    expect(container.querySelector(".help")).toBeNull();
    expect(document.activeElement).toBe(editorContent);
  });

  it("Mod-N files a new note where the tree is standing", async () => {
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, "n", { metaKey: true });
    await flush();

    // `lastFolder`'s default, which is the same value the "+ New note" button passes —
    // one expression, so the chord and the button cannot file into two places (B29).
    expect(newNoteCalls).toEqual(["00 Inbox"]);
  });

  it("Mod-N does nothing while a modal owns the keyboard", async () => {
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, "/", { metaKey: true });
    await flush();
    expect(container.querySelector(".help")).not.toBeNull();

    keydown(container.querySelector<HTMLElement>(".help")!, "n", { metaKey: true });
    await flush();

    expect(newNoteCalls).toEqual([]);
  });

  it("Mod-F puts the caret in the search box when the caret is not in a note", async () => {
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, "f", { metaKey: true });
    await flush();

    expect(document.activeElement).toBe(container.querySelector(".notes-search input"));
  });

  it("Mod-Shift-R starts editing the open note's title", async () => {
    await mount();
    const editorContent = await openNote();
    editorContent.focus();
    expect(container.querySelector(".reader-title-input")).toBeNull();

    keydown(editorContent, "r", { metaKey: true, shiftKey: true });
    await flush();

    const input = container.querySelector<HTMLInputElement>(".reader-title-input")!;
    expect(input).not.toBeNull();
    expect(input.value).toBe("Test note");
    expect(document.activeElement).toBe(input);
  });
});
