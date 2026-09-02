// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * The search box looks at the folder you are standing in, and the whole vault is a choice
 * (B83).
 *
 * `searchNotes` has carried a `scope` option since it was written — its own comment said
 * "nothing calls this with one yet" — so every search was a vault-wide search, and there
 * was no way to ask "in this project". The default is now the tree's folder *and
 * everything under it*, because the option filters on a path prefix rather than on one
 * directory.
 *
 * Four things decide whether this is right and each has a test below. The default is the
 * folder. The switch widens it. A selection that is not a folder has no folder to mean,
 * so it searches the vault and is not offered a switch. And the widening does not
 * outlive the search that asked for it — it is reset on the way out and on any move in
 * the tree, so "this folder" is reliably what you get rather than whatever was last set.
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


/** The scope `search()` was last called with — `undefined` when it has not been called. */
function lastScope(search: ReturnType<typeof vi.fn>): string | undefined {
  const call = search.mock.calls.at(-1);
  return call?.[1] as string | undefined;
}

/**
 * Unfolds the search field. It lives in the note list's heading now and is only mounted
 * while a search is open, so reaching for the box starts with the magnifier — which is
 * what a hand does too.
 */
async function openSearch(container: HTMLDivElement): Promise<void> {
  if (container.querySelector(".notes-search input") !== null) return;
  await act(async () => {
    container.querySelector<HTMLButtonElement>(".search-toggle")!.click();
  });
}

async function type(container: HTMLDivElement, query: string): Promise<void> {
  await openSearch(container);
  const box = container.querySelector<HTMLInputElement>(".notes-search input")!;
  await act(async () => {
    box.focus();
    // React reads the value off the node, so it has to be set through the native setter
    // rather than by assignment, which React's own value tracker would swallow.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, query);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function scopeButton(container: HTMLDivElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(".search-scope");
}

function pickFolder(container: HTMLDivElement, name: string): void {
  const row = Array.from(container.querySelectorAll('[role="treeitem"] .branch-name')).find(
    (el) => el.textContent === name,
  );
  expect(row, `no folder row called ${name}`).not.toBeUndefined();
  act(() => {
    row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("what the search box is looking at", () => {
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /** Typing is debounced by 150 ms; nothing is searched until that lands. */
  async function settle(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
  }

  it("searches the folder in the tree, and everything under it", async () => {
    // `00 Inbox` is where the tree starts. The scope is a path prefix on the main side,
    // so this is a subtree rather than one directory — which is the whole reason a folder
    // is a usable default at all.
    await type(container, "kickoff");
    await settle();

    expect(search).toHaveBeenCalled();
    expect(lastScope(search)).toBe("00 Inbox");
  });

  it("follows the tree when another folder is picked", async () => {
    pickFolder(container, "01 Projects");
    await flush();
    await type(container, "kickoff");
    await settle();

    expect(lastScope(search)).toBe("01 Projects");
  });

  it("widens to the whole vault when the switch is pressed", async () => {
    await type(container, "kickoff");
    await settle();
    expect(lastScope(search)).toBe("00 Inbox");

    await act(async () => {
      scopeButton(container)!.click();
    });
    await flush();

    // `""` is "no restriction" to `searchNotes`, which is the same thing an absent scope
    // means — the two must not come to differ.
    expect(lastScope(search)).toBe("");
  });

  it("runs the widened search at once rather than waiting out the debounce", async () => {
    // The 150 ms is about not searching on every keystroke of a word. This is one
    // deliberate press with the query already typed, and making it wait would read as the
    // button not working.
    await type(container, "kickoff");
    await settle();
    const before = search.mock.calls.length;

    await act(async () => {
      scopeButton(container)!.click();
    });
    await flush();

    expect(search.mock.calls.length).toBeGreaterThan(before);
  });

  it("names the folder it is confined to, not the one it would switch to", async () => {
    await openSearch(container);

    // A button reading "All notes" while the search is confined to one folder reads as a
    // state, not as an offer — which is the wrong way round for a control you glance at.
    //
    // It says the folder's own name rather than "This folder" because the field it sits
    // in has taken the heading's seat: the heading is what used to say which folder you
    // were standing in, so while it is gone the switch is the only thing that can.
    expect(scopeButton(container)!.textContent).toBe("00 Inbox");
    expect(scopeButton(container)!.getAttribute("aria-pressed")).toBe("false");

    // Widened, it goes back to naming the scope rather than a folder — there is no one
    // folder to name any more, which is the whole of what the widened state means.
    await act(async () => {
      scopeButton(container)!.click();
    });
    expect(scopeButton(container)!.textContent).toBe("All notes");
    expect(scopeButton(container)!.getAttribute("aria-pressed")).toBe("true");
  });

  it("puts the scope back to the folder when the search is left", async () => {
    await type(container, "kickoff");
    await settle();
    await act(async () => {
      scopeButton(container)!.click();
    });
    await flush();
    expect(lastScope(search)).toBe("");

    // The × — the same `exitSearch` Escape and a row's Escape both call.
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".search-clear")!.click();
    });
    await flush();

    await type(container, "kickoff");
    await settle();
    expect(lastScope(search)).toBe("00 Inbox");
  });

  it("puts the scope back when the tree moves, without a search to clear", async () => {
    // Widening is asked for per search. Carried to the next folder it would be a mode
    // nobody set for that folder — and one nothing on screen would explain.
    await type(container, "kickoff");
    await settle();
    await act(async () => {
      scopeButton(container)!.click();
    });
    await flush();

    pickFolder(container, "01 Projects");
    await flush();
    await type(container, "kickoff");
    await settle();

    expect(lastScope(search)).toBe("01 Projects");
  });
});
