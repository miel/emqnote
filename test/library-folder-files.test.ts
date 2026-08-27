// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FileSummary, FolderNode, NoteSummary } from "../src/shared/vault-types.js";

/**
 * A folder's non-note files, listed and previewed (B47).
 *
 * Driven through a real `Library`, the same plumbing `library-sort-persist.test.ts` uses,
 * because the interesting questions are all about what the DOM ends up showing: whether
 * the second section appears at all, whether picking a file puts the note down, and
 * whether the picture is drawn off `emqnote-attachment://` rather than through IPC.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FILES: FileSummary[] = [
  {
    path: "99 - Attachments/foto.png",
    name: "foto.png",
    extension: ".png",
    modified: "2026-08-01T10:00:00+02:00",
    size: 2048,
  },
  {
    path: "99 - Attachments/offerte.pdf",
    name: "offerte.pdf",
    extension: ".pdf",
    modified: "2026-08-02T10:00:00+02:00",
    size: 1048576,
  },
  {
    path: "99 - Attachments/contract.docx",
    name: "contract.docx",
    extension: ".docx",
    modified: "2026-08-03T10:00:00+02:00",
    size: 500,
  },
];

const NOTE: NoteSummary = {
  path: "99 - Attachments/Leesmij.md",
  fileName: "Leesmij.md",
  title: "Leesmij",
  kind: "quick",
  created: "2026-08-01T09:00:00+02:00",
  modified: "2026-08-01T09:00:00+02:00",
  attendees: [],
  tags: [],
  excerpt: "Wat hier staat",
  pinned: false,
};

interface Fake {
  emqnote: CaptureApi;
  folderFiles: ReturnType<typeof vi.fn>;
  openWikiLink: ReturnType<typeof vi.fn>;
  revealNote: ReturnType<typeof vi.fn>;
}

function buildFake(files = FILES, notes: NoteSummary[] = []): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "99 - Attachments", name: "99 - Attachments", noteCount: 0, children: [] },
    ],
  };

  const folderFiles = vi.fn(async () => files);
  const openWikiLink = vi.fn(async () => "attachment" as const);
  const revealNote = vi.fn();

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => notes,
    folderFiles,
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
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
    openWikiLink,
    checkAttachments: async () => [],
    pdfPageCount: async () => 7,
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

  return { emqnote, folderFiles, openWikiLink, revealNote };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("a folder's files in the library", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
    // The PDF preview fetches its page through the custom scheme; jsdom has no fetch that
    // would answer one, and no test here is about the picture that comes back.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
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

  const fileRows = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(".files-list .file-row"));

  async function click(element: Element): Promise<void> {
    await act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  it("lists the files in the folder, with their type and size", async () => {
    await mount(buildFake());

    expect(fileRows().map((row) => row.querySelector(".note-title")!.textContent)).toEqual([
      "foto.png",
      "offerte.pdf",
      "contract.docx",
    ]);
    expect(fileRows()[1]!.querySelector(".note-excerpt")!.textContent).toBe("PDF · 1.0 MB");
    expect(container.querySelector(".files-header")!.textContent).toContain("3 files");
  });

  it("says nothing at all when the folder holds only notes", async () => {
    await mount(buildFake([], [NOTE]));

    expect(container.querySelector(".files-list")).toBeNull();
    expect(container.querySelector(".files-header")).toBeNull();
  });

  it("draws a picture over the attachment protocol, not through IPC", async () => {
    // B28's whole point, and the reason the unlinked-attachment screen's base64 previews went away in
    // the same batch: a note's pictures are served, never copied over the bridge.
    await mount(buildFake());
    await click(fileRows()[0]!);

    const image = container.querySelector<HTMLImageElement>(".file-preview-image");
    expect(image).not.toBeNull();
    expect(image!.getAttribute("src")).toBe("emqnote-attachment://vault/99%20-%20Attachments%2Ffoto.png");
  });

  it("pages a PDF through the same request the inline embed makes", async () => {
    await mount(buildFake());
    await click(fileRows()[1]!);

    expect(container.querySelector(".file-preview-counter")!.textContent).toBe("1 / 7");
    expect(fetch).toHaveBeenLastCalledWith(
      "emqnote-thumb://vault/99%20-%20Attachments%2Fofferte.pdf?size=page",
    );

    const [previous, next] = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".file-preview-pages button"),
    );
    expect(previous!.disabled).toBe(true);

    await click(next!);
    expect(container.querySelector(".file-preview-counter")!.textContent).toBe("2 / 7");
    // Page 1 is spelled without the parameter and every other page with it — the cache
    // key rule B46 leans on.
    expect(fetch).toHaveBeenLastCalledWith(
      "emqnote-thumb://vault/99%20-%20Attachments%2Fofferte.pdf?size=page&page=2",
    );
  });

  it("offers the system viewer for a format it cannot draw, rather than an apology", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(fileRows()[2]!);

    expect(container.querySelector(".file-preview-none")).not.toBeNull();
    expect(container.querySelector(".file-preview-image")).toBeNull();

    const open = Array.from(container.querySelectorAll<HTMLButtonElement>(".file-preview-bar button"));
    await click(open[0]!);
    // Straight through `openWikiLink`, which already routes a `.pdf` to the viewer window
    // and everything else to the OS (`attachment-route.ts`).
    expect(fake.openWikiLink).toHaveBeenCalledWith("99 - Attachments/contract.docx");

    await click(open[1]!);
    expect(fake.revealNote).toHaveBeenCalledWith("99 - Attachments/contract.docx");
  });

  it("asks for the folder's files only for a folder, never for a search", async () => {
    const fake = buildFake();
    await mount(fake);

    fake.folderFiles.mockClear();
    const search = container.querySelector<HTMLInputElement>(".notes-search input")!;
    await act(async () => {
      // Through the native setter, or React's own value tracker sees no change and the
      // `onChange` handler never runs.
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!.call(search, "kickoff");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    await flush();

    // A search draws from everywhere, so "which files are here" has no answer — the
    // section goes away rather than showing the last folder's files beside results from
    // somewhere else.
    expect(fake.folderFiles).not.toHaveBeenCalled();
    expect(container.querySelector(".files-list")).toBeNull();
  });
});
