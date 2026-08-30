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
  /** Fires the "open this tag" message main sends, so a tag can be selected without the tree. */
  openTag: (name: string) => void;
}

function buildFake(
  sortKey: SortKey,
  answer: { pinned: boolean; locked?: boolean; limit?: number } = { pinned: true },
  keepPinnedInView = false,
): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 3, children: [] }],
  };

  const setPinned = vi.fn(async () => answer);

  // The one message that reaches a tag's list without unfolding the sidebar's filter
  // sections first. Held so a test can fire it; the real sender is main, on a click in a
  // note's own tag chip.
  let openTagHandler: (payload: { name: string }) => void = () => {};

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => NOTES,
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    // The same three notes a folder answers with, so a search and a folder differ in
    // exactly one thing: whether the pin is allowed to order them.
    search: async () => NOTES,
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
    onOpenTag: (handler) => {
      openTagHandler = handler;
      return () => {};
    },
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
      keepPinnedInView,
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
  } as unknown as CaptureApi;

  return { emqnote, setPinned, openTag: (name) => openTagHandler({ name }) };
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

  /**
   * B76: the same three notes, in the same order, with the shelf switched on and off.
   *
   * What is worth testing here is not that the pinned note is first — the tests above
   * already own that, and it is first either way — but that turning the shelf on changes
   * *only* where the row is drawn. So each of these asserts against the flat run of
   * `.notes-list .note`, which is a descendant query and therefore reads straight through
   * the wrapper: order, count and the arrow walk all have to come out identical.
   */
  describe("with the pinned rows kept in view", () => {
    it("draws no shelf at all while the setting is off", async () => {
      await mount(buildFake("modified"));

      expect(container.querySelector(".notes-pinned")).toBeNull();
      expect(container.querySelectorAll(".notes-list > .note")).toHaveLength(3);
    });

    it("lifts the pinned row onto a shelf, and only the pinned row", async () => {
      await mount(buildFake("modified", { pinned: true }, true));

      const shelf = container.querySelector(".notes-pinned");
      expect(shelf).not.toBeNull();

      const shelved = Array.from(shelf!.querySelectorAll(".note-title")).map(
        (node) => node.textContent,
      );
      expect(shelved).toEqual(["Vastgeprikt"]);
      // The rest stay where they were, as direct children of the list itself.
      expect(container.querySelectorAll(".notes-list > .note")).toHaveLength(2);
    });

    it("leaves the reading order of the list exactly as it was", async () => {
      await mount(buildFake("modified", { pinned: true }, true));
      expect(titles()).toEqual(["Vastgeprikt", "Nieuwste", "Middelste"]);
    });

    it("names the wrapper so a listbox may hold it", async () => {
      // An `li` carrying its own implicit role would be a list item inside a listbox,
      // which is not a shape ARIA has; a group is the one wrapper it allows around
      // options. Cheap to assert and cheap to lose in a refactor.
      await mount(buildFake("modified", { pinned: true }, true));

      const shelf = container.querySelector(".notes-pinned")!;
      expect(shelf.getAttribute("role")).toBe("presentation");
      expect(shelf.querySelector("ul")?.getAttribute("role")).toBe("group");
    });

    it("keeps ArrowDown walking across the shelf's edge", async () => {
      // The one thing the wrapper could plausibly break: `roveArrowKey` collects rows with
      // `querySelectorAll` from the `.notes-list`, so a row nested one level deeper has to
      // still come back in document order — otherwise the walk stops dead at the last
      // pinned row, which is precisely where the boundary is.
      await mount(buildFake("modified", { pinned: true }, true));

      const rows = Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));
      expect(rows).toHaveLength(3);

      act(() => rows[0]!.focus());
      act(() => {
        rows[0]!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
        );
      });

      expect(document.activeElement).toBe(rows[1]);
      expect(rows[1]!.querySelector(".note-title")?.textContent).toBe("Nieuwste");
    });
  });

  /**
   * The pin itself takes the pin off.
   *
   * It was a `<span>` — the row said "this one is pinned" and gave no way to say the
   * opposite back. Unpinning lived in the right-click menu and on a chord, both of which
   * are the wrong distance from a mark that is already under the pointer, and neither of
   * which is where anyone looks. It goes through the same `setPinned` those two do, which
   * is what makes main's two refusals and the list reload one behaviour rather than three.
   */
  describe("clicking the pin", () => {
    it("asks main to take the pin off that note", async () => {
      const fake = buildFake("modified", { pinned: false });
      await mount(fake);

      const pin = container.querySelector<HTMLButtonElement>(".notes-list .note-pin")!;
      act(() => pin.click());
      await flush();

      expect(fake.setPinned).toHaveBeenCalledWith("00 Inbox/Vastgeprikt.md", false);
    });

    it("does not open the note it is drawn on", async () => {
      // The row's own `onClick` selects and its `onDoubleClick` opens in the capture
      // window. Both are stopped at the button, or taking a pin off would also be a
      // navigation nobody asked for.
      const fake = buildFake("modified", { pinned: false });
      const openNote = vi.fn(async () => null);
      (fake.emqnote.library as unknown as { openNote: unknown }).openNote = openNote;
      await mount(fake);

      const pin = container.querySelector<HTMLButtonElement>(".notes-list .note-pin")!;
      act(() => pin.click());
      await flush();

      expect(openNote).not.toHaveBeenCalled();
    });

    it("is a button, named for what pressing it does", async () => {
      // Not "Pin to top", which is what the mark used to be titled: once it is pressable,
      // the label has to name the verb it carries out and not the state it reports.
      await mount(buildFake("modified"));

      const pin = container.querySelector<HTMLElement>(".notes-list .note-pin")!;
      expect(pin.tagName).toBe("BUTTON");
      expect(pin.getAttribute("aria-label")).toBe("Unpin");
      // The row is the roving tab stop; a second one inside it would put a stop in the
      // middle of the list that `roveArrowKey` knows nothing about.
      expect(pin.getAttribute("tabindex")).toBe("-1");
    });
  });

  /**
   * B77: a pin orders a folder, and nothing else.
   *
   * The limit became three *per folder*, which is what makes this necessary rather than
   * tidy: three pins in each of eight folders is one tag click away from a list whose top
   * two dozen rows are pinned — and with the shelf on, a sticky slab covering the pane.
   * So a list whose rows come from everywhere ignores the flag entirely.
   *
   * Both routes out of a folder are driven here, because they are two different states
   * and only one of them changes `selection`: opening a tag replaces it, while a search
   * leaves the tree saying "folder" and quietly overrides it (`loadNotes`). A predicate
   * that only looked at the selection would pass the first of these and fail the second.
   */
  describe("outside a folder's own list", () => {
    async function search(query: string): Promise<void> {
      // The box lives in the note list's heading and is mounted only while a search is
      // open, so this starts where a hand does: on the magnifier.
      if (container.querySelector(".notes-search input") === null) {
        await act(async () => {
          container.querySelector<HTMLButtonElement>(".search-toggle")!.click();
        });
      }
      const input = container.querySelector<HTMLInputElement>(".notes-search input")!;
      await act(async () => {
        // Through the native setter, or React's own value tracker sees no change and the
        // `onChange` handler never runs — the house spelling, see
        // `library-folder-files.test.ts`.
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
          input,
          query,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      // The list itself is 150 ms behind on a debounce; the order is not, since the query
      // decides it the moment it is typed. Waited out anyway so the rows on screen are the
      // ones the search answered with rather than the folder's, which is the state the
      // assertion is about.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      await flush();
    }

    it("leaves the pinned note where the sort put it, in a tag's list", async () => {
      const fake = buildFake("modified");
      await mount(fake);
      expect(titles()).toEqual(["Vastgeprikt", "Nieuwste", "Middelste"]);

      await act(async () => fake.openTag("klantx"));
      await flush();

      // Straight modified order now: the pinned note is the oldest of the three, so it
      // goes last — which is exactly the assertion a pin still being honoured would fail.
      expect(titles()).toEqual(["Nieuwste", "Middelste", "Vastgeprikt"]);
    });

    it("leaves the pinned note where the sort put it, while a search is running", async () => {
      const fake = buildFake("modified");
      await mount(fake);

      await search("notitie");
      expect(titles()).toEqual(["Nieuwste", "Middelste", "Vastgeprikt"]);
    });

    it("puts it back the moment the query is cleared", async () => {
      const fake = buildFake("modified");
      await mount(fake);

      await search("notitie");
      await search("");
      expect(titles()).toEqual(["Vastgeprikt", "Nieuwste", "Middelste"]);
    });

    it("draws no shelf, even with the setting on", async () => {
      const fake = buildFake("modified", { pinned: true }, true);
      await mount(fake);
      expect(container.querySelector(".notes-pinned")).not.toBeNull();

      await act(async () => fake.openTag("klantx"));
      await flush();

      // The shelf has to go with the ordering, not merely shrink: a slab pinning the
      // *last* row of a tag's list to the top edge would be the app claiming an order it
      // did not apply.
      expect(container.querySelector(".notes-pinned")).toBeNull();
      expect(container.querySelectorAll(".notes-list > .note")).toHaveLength(3);
    });

    it("still marks the row, because the note is still pinned", async () => {
      // The flag is a fact about the note and stays visible wherever the note is drawn;
      // only the *order* is a fact about the folder. Hiding the mark here would leave the
      // row and the tick in its own Pin menu item disagreeing with each other.
      const fake = buildFake("modified");
      await mount(fake);

      await act(async () => fake.openTag("klantx"));
      await flush();

      const rows = Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));
      const marked = rows.filter((row) => row.querySelector(".note-pin") !== null);
      expect(marked).toHaveLength(1);
      expect(marked[0]?.querySelector(".note-title")?.textContent).toBe("Vastgeprikt");
    });
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
