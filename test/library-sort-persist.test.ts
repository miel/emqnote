// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary } from "../src/shared/vault-types.js";

/**
 * The note list's sort order round-trips through `settings.json`, the same way the two
 * pane widths already do: `Library.tsx` seeds `sort` from `app.librarySort` once the
 * `bootstrap()` round trip resolves, and persists a choice made in the sort chooser
 * through `window.emqnote.setSort` (`IPC.setSort`, `settings.ts`'s `librarySort`). Mounted
 * through a real `Library`, the same plumbing `test/keyboard-nav.test.ts` and
 * `test/note-list-menu.test.ts` use — the interesting question is what the DOM shows
 * after a real bootstrap round trip, which a shallow render cannot answer.
 *
 * The three sort labels are one chooser now, so the persistence question is asked two
 * clicks deep: the trigger *is* the answer (it reads the current field), and the
 * alternatives only exist while its menu is open. Both halves are worth holding onto —
 * a trigger that seeds from the wrong place and a menu whose tick disagrees with it are
 * two different bugs, and the second one is invisible until you go looking.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Fake {
  emqnote: CaptureApi;
  setSort: ReturnType<typeof vi.fn>;
}

function note(title: string, modified: string): NoteSummary {
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
    pinned: false,
  };
}

const NOTES: NoteSummary[] = [
  note("Beta", "2026-08-20T12:00:00+02:00"),
  note("Alfa", "2026-08-02T12:00:00+02:00"),
  note("Gamma", "2026-08-10T12:00:00+02:00"),
];

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
    // Three notes with titles that sort differently from their dates, so a list read off
    // the screen says which key *and* which way round is in force (B94).
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
      // The persisted value, deliberately not "modified" — the default `useState` in
      // `Library.tsx` starts on — so seeding from the wrong place would go unnoticed.
      librarySort: "title",
      librarySortDirection: "asc",
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
    setHotkey: async () => true,
    setLibraryHotkey: async () => true,
    setPaneWidths: () => {},
    setSort,
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

  /** The chooser itself — the one control the header draws for the sort. */
  function trigger(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(".notes .sort-choose");
    expect(button).not.toBeNull();
    return button!;
  }

  /** The rows of the open menu, by their own label element — the trigger is not one. */
  function menuRows(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>(".context-menu-item"));
  }

  async function openMenu(): Promise<void> {
    await act(async () => {
      trigger().click();
    });
    await flush();
  }

  it("seeds the chooser from the persisted value once bootstrap resolves", async () => {
    const fake = buildFake();
    await mount(fake);

    // `textContent` and not a child lookup: the glyph is an inline SVG with no text in
    // it, so the button's own text is the field name and nothing else.
    expect(trigger().textContent).toBe("Title");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("offers all three fields with the current one ticked", async () => {
    const fake = buildFake();
    await mount(fake);
    await openMenu();

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const labels = menuRows().map(
      (row) => row.querySelector(".context-menu-label")?.textContent,
    );
    expect(labels).toEqual(["Modified", "Created", "Title"]);

    const ticked = menuRows()
      .filter((row) => row.querySelector(".context-menu-check")?.textContent === "✓")
      .map((row) => row.querySelector(".context-menu-label")?.textContent);
    expect(ticked).toEqual(["Title"]);
  });

  it("persists a new sort choice through setSort, and collapses", async () => {
    const fake = buildFake();
    await mount(fake);
    await openMenu();

    const created = menuRows().find(
      (row) => row.querySelector(".context-menu-label")?.textContent === "Created",
    );
    expect(created).not.toBeUndefined();

    await act(async () => {
      created!.click();
    });
    await flush();

    // Two arguments now: picking a key puts the direction back to that key's own, so a
    // message carrying only the key would leave the stored direction describing the sort
    // before last.
    expect(fake.setSort).toHaveBeenCalledWith("created", "desc");
    expect(trigger().textContent).toBe("Created");
    // The asked-for collapse: choosing is what closes it, not a second click somewhere.
    expect(menuRows()).toHaveLength(0);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  /** The arrow button, which is the other half of the split chooser. */
  function direction(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(".notes .sort-direction");
    expect(button).not.toBeNull();
    return button!;
  }

  /** The list as it reads on screen, top to bottom. */
  function titles(): (string | null)[] {
    return Array.from(container.querySelectorAll(".notes-list .note-title")).map(
      (node) => node.textContent,
    );
  }

  it("seeds the direction from the persisted value too", async () => {
    const fake = buildFake();
    await mount(fake);

    // "title" / "asc" in this fake's bootstrap, deliberately not the `useState` default.
    expect(titles()).toEqual(["Alfa", "Beta", "Gamma"]);
  });

  it("turns the list over when the arrows are pressed, and persists that", async () => {
    const fake = buildFake();
    await mount(fake);

    await act(async () => {
      direction().click();
    });
    await flush();

    expect(titles()).toEqual(["Gamma", "Beta", "Alfa"]);
    expect(fake.setSort).toHaveBeenCalledWith("title", "desc");
  });

  it("puts the direction back to the key's own when a different key is chosen", async () => {
    const fake = buildFake();
    await mount(fake);

    // Reversed by hand first, so what is under test is the reset and not the default.
    await act(async () => {
      direction().click();
    });
    await flush();
    await openMenu();
    await act(async () => {
      menuRows()
        .find((row) => row.querySelector(".context-menu-label")?.textContent === "Modified")!
        .click();
    });
    await flush();

    // Newest first, which is what "Modified" means — not Z–A carried over from the title.
    expect(titles()).toEqual(["Beta", "Gamma", "Alfa"]);
    expect(fake.setSort).toHaveBeenLastCalledWith("modified", "desc");
  });

  it("leaves the direction alone when the key already in force is chosen again", async () => {
    const fake = buildFake();
    await mount(fake);

    await act(async () => {
      direction().click();
    });
    await flush();
    await openMenu();
    await act(async () => {
      menuRows()
        .find((row) => row.querySelector(".context-menu-label")?.textContent === "Title")!
        .click();
    });
    await flush();

    // Choosing "Title" from a menu that already says Title is not a request to undo the
    // arrows you just pressed.
    expect(titles()).toEqual(["Gamma", "Beta", "Alfa"]);
    expect(fake.setSort).toHaveBeenLastCalledWith("title", "desc");
  });

  it("keeps the two halves apart: the arrows are not the chooser", async () => {
    const fake = buildFake();
    await mount(fake);

    await act(async () => {
      direction().click();
    });
    await flush();

    // No menu, and the name of the key is untouched — the report this split answers is
    // that there was no way to ask for the other end of the list at all.
    expect(menuRows()).toHaveLength(0);
    expect(trigger().textContent).toBe("Title");
  });

  it("closes again on a second click of the chooser, choosing nothing", async () => {
    const fake = buildFake();
    await mount(fake);
    await openMenu();
    await openMenu();

    expect(menuRows()).toHaveLength(0);
    expect(fake.setSort).not.toHaveBeenCalled();
    expect(trigger().textContent).toBe("Title");
  });
});
