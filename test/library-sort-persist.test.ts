// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * The note list's sort order round-trips through `settings.json`, the same way the two
 * pane widths already do: `Library.tsx` seeds `sort` from `app.librarySort` once the
 * `bootstrap()` round trip resolves, and persists a click on one of the sort buttons
 * through `window.emqnote.setSort` (`IPC.setSort`, `settings.ts`'s `librarySort`). Mounted
 * through a real `Library`, the same plumbing `test/keyboard-nav.test.ts` and
 * `test/note-list-menu.test.ts` use — the interesting question is what the DOM shows
 * after a real bootstrap round trip, which a shallow render cannot answer.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Fake {
  emqnote: CaptureApi;
  setSort: ReturnType<typeof vi.fn>;
}

function buildFake(): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 0, children: [] }],
  };

  const setSort = vi.fn();

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [],
    folderFiles: async () => [],
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async () => null,
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote: async (path) => ({ path }),
    renameNote: async (path) => ({ path }),
    duplicateNote: async (path) => ({ path }),
    trashNote: async () => true,
    emptyTrash: async () => 0,
    createFolder: async (parent) => parent,
    renameFolder: async (path) => path,
    folderContents: async () => ({ notes: 0, folders: 0 }),
    trashFolder: async () => ({ trashed: true }),
    revealNote: () => {},
    noteEditable: async () => true,
    openInCapture: async () => true,
    newNote: () => {},
    onRefresh: () => () => {},
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
      // The persisted value, deliberately not "modified" — the default `useState` in
      // `Library.tsx` starts on — so seeding from the wrong place would go unnoticed.
      librarySort: "title",
      loadRemoteImages: true,
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
    setHotkey: async () => true,
    setPaneWidths: () => {},
    setSort,
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

  return { emqnote, setSort };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the note list's sort order persists across a relaunch", () => {
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

  it("seeds the sort buttons from the persisted value once bootstrap resolves", async () => {
    const fake = buildFake();
    await mount(fake);

    const active = container.querySelector(".notes-sort .sort-on");
    expect(active).not.toBeNull();
    expect(active!.textContent).toBe("Title");
  });

  it("persists a new sort choice through setSort", async () => {
    const fake = buildFake();
    await mount(fake);

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".notes-sort button"),
    );
    const created = buttons.find((button) => button.textContent === "Created");
    expect(created).not.toBeUndefined();

    await act(async () => {
      created!.click();
    });
    await flush();

    expect(fake.setSort).toHaveBeenCalledWith("created");
    const active = container.querySelector(".notes-sort .sort-on");
    expect(active!.textContent).toBe("Created");
  });
});
