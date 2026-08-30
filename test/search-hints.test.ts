// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * The query syntax has a panel of its own, and you can read it while typing (B84).
 *
 * It used to be the search box's placeholder — the whole of
 * `type:meeting tag:klantx attendee:"Jan de Vries" after:2026-01-01` in a field a few
 * centimetres wide, unreadable at that width and gone the moment you typed a character.
 * A hint that disappears exactly when it is needed is not a hint.
 *
 * Deliberately not a modal, which is B51's argument for the `/` menu one field over: a
 * picker with focus of its own takes away the thing you opened it to do. The caret stays
 * in the box, so the panel opens on the box's *focus* — and that is one mechanism serving
 * both ways in, since clicking the box focuses it and `Mod-F` already focused and
 * selected it. The shortcut needed no change at all.
 *
 * The one thing that had to be decided rather than inherited is Escape, which already
 * meant "leave the search". It is panel-first: one press undoes one thing, which is the
 * rule leaving a search from a hit already follows.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildFake(): { emqnote: CaptureApi; search: ReturnType<typeof vi.fn> } {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 0, children: [] },
      { path: "01 Projects", name: "01 Projects", noteCount: 0, children: [] },
    ],
  };

  const search = vi.fn(async () => []);

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [],
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search,
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async () => null,
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote: async (path) => ({ path }),
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
    tasks: async () => [],
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

  return { emqnote, search };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}


function box(container: HTMLDivElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".notes-search input")!;
}

function hints(container: HTMLDivElement): Element | null {
  return container.querySelector(".search-hints");
}

/**
 * Unfolds the search field before reaching for it.
 *
 * The box lives in the note list's heading now and is only mounted while a search is
 * open, so every test that reaches for it starts by pressing the magnifier — which is
 * what a hand does too. Idempotent, so a test may call it twice without closing it again.
 */
async function openSearch(container: HTMLDivElement): Promise<void> {
  if (container.querySelector(".notes-search input") !== null) return;
  await act(async () => {
    container.querySelector<HTMLButtonElement>(".search-toggle")!.click();
  });
}

async function focusBox(container: HTMLDivElement): Promise<void> {
  await openSearch(container);
  await act(async () => {
    box(container).focus();
  });
}

async function press(node: Element, key: string): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("the search box's syntax panel", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;
  let search: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
  });

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const fake = buildFake();
    search = fake.search;
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

  it("is not up until the box is reached for", () => {
    expect(hints(container)).toBeNull();
  });

  it("opens when the box takes focus, which is what a click does", async () => {
    await focusBox(container);
    expect(hints(container)).not.toBeNull();
  });

  it("opens on Mod-F, through the focus the shortcut already gave the box", async () => {
    // `searchVault` focuses and selects the box and always has. The panel hangs off that
    // rather than off a second branch in the key handler, so the two gestures cannot come
    // to disagree about when it appears.
    await act(async () => {
      // `metaKey`, because the fake bootstrap says darwin and `matches()` reads Mod as ⌘
      // there. The chord has one spelling and it is `shortcuts.ts`'s.
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true }),
      );
    });
    await flush();

    expect(document.activeElement).toBe(box(container));
    expect(hints(container)).not.toBeNull();
  });

  it("names the tokens the parser actually understands", async () => {
    await focusBox(container);
    const text = hints(container)!.textContent ?? "";
    for (const token of ["type:", "tag:", "attendee:", "after:", "before:"]) {
      expect(text).toContain(token);
    }
    // The example carries the quoting rule, which nothing else in the window states.
    expect(text).toContain('attendee:"Jan de Vries"');
  });

  it("leaves the caret in the box, so the syntax can be read while it is typed", async () => {
    await focusBox(container);
    expect(document.activeElement).toBe(box(container));
  });

  it("holds nothing that can be tabbed to or clicked", async () => {
    // Examples to copy, not rows to choose. A row that could be chosen would owe the
    // caret an insertion at a position this panel does not track.
    await focusBox(container);
    const panel = hints(container)!;
    expect(panel.querySelectorAll("button")).toHaveLength(0);
    expect(panel.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("gets out of the way on the first keystroke", async () => {
    await focusBox(container);
    expect(hints(container)).not.toBeNull();

    await act(async () => {
      const node = box(container);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, "k");
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(hints(container)).toBeNull();
  });

  it("closes on Escape without leaving the search", async () => {
    await focusBox(container);
    await press(box(container), "Escape");

    expect(hints(container)).toBeNull();
    // Still in the box: the first press was about the panel, not about the search.
    expect(document.activeElement).toBe(box(container));
  });

  it("leaves the search on the second Escape", async () => {
    await focusBox(container);
    await act(async () => {
      const node = box(container);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        node,
        "kickoff",
      );
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    // The keystroke already closed the panel, so this press falls straight through to
    // `exitSearch` — one press, one thing, whichever is on top.
    await press(box(container), "Escape");
    await flush();

    // The field folds back into the heading rather than sitting there emptied, which is
    // what leaving a search now looks like: the box is gone and the folder's own name is
    // back in the seat it was borrowing.
    expect(box(container)).toBeNull();
    expect(container.querySelector(".notes .pane-title")?.textContent).toBe("00 Inbox");
  });

  it("keeps the placeholder to the word the box is for", async () => {
    await openSearch(container);
    // The syntax lived here and could not be read. What is left has to stay short enough
    // to be, or this moved the problem rather than fixing it.
    expect(box(container).placeholder).toBe("Search…");
    expect(search).not.toHaveBeenCalled();
  });
});
