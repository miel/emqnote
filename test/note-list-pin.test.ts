// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, SortKey } from "../src/shared/vault-types.js";

/**
 * B75's pin, from the list's side: where a pinned note is drawn, and what the two refusals
 * look like.
 *
 * Mounted through a real `Library`, the same plumbing `test/library-sort-persist.test.ts`
 * and `test/note-list-menu.test.ts` use — the interesting questions here are what order the
 * DOM ends up in and which dialog is on screen afterwards, and a shallow render answers
 * neither.
 *
 * The limit itself is deliberately *not* tested here. It is enforced in main against the
 * index, precisely because the renderer only ever knows the list on screen; what this file
 * pins is that the renderer relays the refusal rather than second-guessing it.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function note(title: string, modified: string, pinned = false): NoteSummary {
  return {
    path: `00 Inbox/${title}.md`,
    fileName: `${title}.md`,
    title,
    kind: "quick",
    created: "2026-08-01T09:00:00+02:00",
    modified,
    attendees: [],
    tags: [],
    excerpt: "",
    pinned,
  };
}

const NOTES = [
  note("Nieuwste", "2026-08-20T12:00:00+02:00"),
  note("Vastgeprikt", "2026-08-02T12:00:00+02:00", true),
  note("Middelste", "2026-08-10T12:00:00+02:00"),
];

interface Fake {
  emqnote: CaptureApi;
  setPinned: ReturnType<typeof vi.fn>;
}

function buildFake(
  sortKey: SortKey,
  answer: { pinned: boolean; locked?: boolean; limit?: number } = { pinned: true },
): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 3, children: [] }],
  };

  const setPinned = vi.fn(async () => answer);

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => NOTES,
    folderFiles: async () => [],
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
    tasks: async () => [],
    toggleTask: async () => ({ toggled: true }),
    setPinned,
  };

  const emqnote = {
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
      librarySort: sortKey,
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
    locationSuggestions: async () => [],
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText: async () => {},
    library,
  } as unknown as CaptureApi;

  return { emqnote, setPinned };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("a pinned note in the list", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake("modified").emqnote;
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

  function titles(): (string | null)[] {
    return Array.from(container.querySelectorAll(".notes-list .note-title")).map(
      (node) => node.textContent,
    );
  }

  for (const sortKey of ["modified", "created", "title"] as SortKey[]) {
    it(`puts the pinned note first when sorting by ${sortKey}`, async () => {
      // Every sort key, because the pin is a wrapper around the comparator rather than a
      // clause inside one of them: a fourth key would inherit it too.
      await mount(buildFake(sortKey));
      expect(titles()[0]).toBe("Vastgeprikt");
    });
  }

  it("keeps the chosen order among the notes that are not pinned", async () => {
    await mount(buildFake("modified"));
    expect(titles()).toEqual(["Vastgeprikt", "Nieuwste", "Middelste"]);
  });

  it("marks the pinned row and only that row", async () => {
    await mount(buildFake("modified"));
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));
    const marked = rows.filter((row) => row.querySelector(".note-pin") !== null);

    expect(marked).toHaveLength(1);
    expect(marked[0]?.querySelector(".note-title")?.textContent).toBe("Vastgeprikt");
  });

  it("says why when the vault already holds three pinned notes", async () => {
    const fake = buildFake("modified", { pinned: false, limit: 3 });
    await mount(fake);

    const row = container.querySelectorAll<HTMLElement>(".notes-list .note")[1]!;
    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }));
    });

    const pin = Array.from(container.querySelectorAll<HTMLElement>(".context-menu-item")).find(
      (item) => item.querySelector(".context-menu-label")?.textContent === "Pin to top",
    )!;
    act(() => pin.click());
    await flush();

    // The number in the message is main's, not a constant repeated in the renderer.
    expect(container.textContent).toContain("3");
    expect(container.querySelector(".overlay")).not.toBeNull();
  });

  it("says why when the capture window has the note claimed", async () => {
    const fake = buildFake("modified", { pinned: false, locked: true });
    await mount(fake);

    const row = container.querySelectorAll<HTMLElement>(".notes-list .note")[1]!;
    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }));
    });

    const pin = Array.from(container.querySelectorAll<HTMLElement>(".context-menu-item")).find(
      (item) => item.querySelector(".context-menu-label")?.textContent === "Pin to top",
    )!;
    act(() => pin.click());
    await flush();

    expect(container.textContent).toContain("open in the note window");
  });

  it("shows a tick beside Pin for a note that already carries one", async () => {
    await mount(buildFake("modified"));

    const row = container.querySelectorAll<HTMLElement>(".notes-list .note")[0]!;
    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }));
    });

    const pin = Array.from(container.querySelectorAll<HTMLElement>(".context-menu-item")).find(
      (item) => item.querySelector(".context-menu-label")?.textContent === "Pin to top",
    )!;
    expect(pin.getAttribute("aria-checked")).toBe("true");
  });
});
