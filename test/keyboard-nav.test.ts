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
    pinned: false,
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
      // Lifted out of the tree and drawn at the bottom of the sidebar by `FolderTree`,
      // which is why arrowing has to pass the whole footer to reach it.
      { path: "_trash", name: "_trash", noteCount: 0, children: [] },
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
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async (path) => (path === NOTE_PATH ? note : null),
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
    contentsAt: async () => ({ notes: 0, folders: 0, files: 0 }),
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
    setPinned: async (_path: string, pinned: boolean) => ({ pinned }),
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
    expect(names).toEqual(expect.arrayContaining(["All folders", "00 Inbox", "01 Projects"]));

    const first = rows.find((node) => node.tabIndex === 0)!;
    first.focus();
    expect(document.activeElement).toBe(first);

    keydown(first, "ArrowDown");

    const nowZeroed = treeRows().filter((node) => node.tabIndex === 0);
    expect(nowZeroed).toHaveLength(1);
    expect(nowZeroed[0]).not.toBe(first);
    expect(document.activeElement).toBe(nowZeroed[0]);
  });

  /**
   * The sidebar's walk covers the footer, not only the folders and Trash.
   *
   * Trash was reachable and everything between it and the last folder was not, which is
   * the report: the rover's container is the whole `<nav class="tree">`, so it skipped
   * straight past Tags, People, Tasks, Settings and Help to the one row down there that
   * happened to be a `role="treeitem"`.
   */
  function sidebarRows(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll('.tree [role="treeitem"], .tree .tree-footer .branch'),
    );
  }

  function nameOf(row: HTMLElement | null | undefined): string | undefined {
    return row?.querySelector(".branch-name")?.textContent ?? undefined;
  }

  it("walks the arrow keys through the footer rows, not only the folders", async () => {
    await mount();
    const names = sidebarRows().map((row) => nameOf(row));
    expect(names).toEqual(expect.arrayContaining(["Tags", "People", "Tasks", "Settings"]));

    // From the last folder, straight down through everything to the bottom.
    let current = sidebarRows().find((row) => row.tabIndex === 0)!;
    act(() => current.focus());

    const visited: (string | undefined)[] = [nameOf(current)];
    for (let step = 0; step < sidebarRows().length + 2; step += 1) {
      keydown(current, "ArrowDown");
      const next = document.activeElement as HTMLElement;
      if (next === current) break;
      current = next;
      visited.push(nameOf(current));
    }

    for (const label of ["Tags", "People", "Tasks", "Settings", "Trash"]) {
      expect(visited).toContain(label);
    }
  });

  it("keeps exactly one tab stop across the whole sidebar, footer included", async () => {
    await mount();
    const footer = sidebarRows().find((row) => nameOf(row) === "Tasks")!;
    act(() => footer.focus());

    expect(document.activeElement).toBe(footer);
    expect(sidebarRows().filter((row) => row.tabIndex === 0)).toEqual([footer]);
  });

  it("comes back up out of the footer to the folders above it", async () => {
    await mount();
    const settings = sidebarRows().find((row) => nameOf(row) === "Settings")!;
    act(() => settings.focus());

    keydown(settings, "ArrowUp");
    expect(nameOf(document.activeElement as HTMLElement)).toBe("Tasks");
  });

  it("Home from the footer goes to the top of the tree, End to the bottom", async () => {
    await mount();
    const tasks = sidebarRows().find((row) => nameOf(row) === "Tasks")!;
    act(() => tasks.focus());

    keydown(tasks, "Home");
    expect(document.activeElement).toBe(sidebarRows()[0]);

    keydown(document.activeElement as HTMLElement, "End");
    expect(document.activeElement).toBe(sidebarRows()[sidebarRows().length - 1]);
  });

  it("Tab out of a footer row still leaves the sidebar, so the pane cycle knows where it is", async () => {
    // `paneOf` recognises rows by selector; a focusable row it cannot classify would make
    // Tab treat the sidebar as no pane at all.
    await mount();
    const tasks = sidebarRows().find((row) => nameOf(row) === "Tasks")!;
    act(() => tasks.focus());

    keydown(tasks, "Tab");
    expect(noteRows()).toContain(document.activeElement);
  });

  it("Tab moves focus from the tree's active row into the note list", async () => {
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, "Tab");

    const activeNote = noteRows().find((node) => node.tabIndex === 0)!;
    expect(document.activeElement).toBe(activeNote);
  });

  /** Opens the note the list is standing on, which is what mounts the editor. */
  async function openTheNote(): Promise<HTMLElement> {
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    await act(async () => {
      noteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    return noteRow;
  }

  it("Tab moves focus from the note list's active row into the note's text", async () => {
    await mount();
    // The editor is only mounted once a note is open (`Library.tsx` renders it inside
    // the `open !== null` branch) — the same as clicking the row would, or Enter on it.
    const noteRow = await openTheNote();

    act(() => {
      noteRow.focus();
    });
    keydown(noteRow, "Tab");
    await flush();

    // The note, not its title (B98). B94's reading order put the title here and the note
    // five presses further on, and daily use answered that: the note is where the press
    // was going every time. The title keeps the chord instead — see the Ctrl-Tab case
    // below — and the four fields keep `focusFields` and a Tab on from the title.
    expect(document.activeElement?.className).toContain("editor-content");
  });

  it("Ctrl-Tab moves focus from the note list onto the note's title", async () => {
    await mount();
    const noteRow = await openTheNote();

    act(() => {
      noteRow.focus();
    });
    cycle(false);
    await flush();

    // The other half of B98's swap. Plain Tab and the chord traded places rather than the
    // ring growing a stop: the title was reachable before, and this is which key reaches it.
    expect(document.activeElement?.className).toContain("pane-title");
  });

  it("leaves Tab alone in the note list when there is no note to move into", async () => {
    await mount();
    const noteRow = noteRows().find((node) => node.tabIndex === 0)!;
    act(() => {
      noteRow.focus();
    });

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      noteRow.dispatchEvent(event);
      // Nothing to move to — no note open means no `Editor` mounted at all — so the press
      // stays the browser's: the walk does not swallow it and leave focus sitting on the
      // row. This is `focusPane("editor")` answering `false`, which it did not use to do
      // (B98); it always claimed the move, and the lie only showed once Tab aimed here.
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("Ctrl-Shift-Tab out of the tree reaches the open note's text", async () => {
    await mount();
    await openTheNote();

    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    act(() => {
      treeRow.focus();
    });
    cycle(true);
    await flush();

    // The backward ring used to stop dead here — the tree was its first stop and going
    // back from the first stop was `null` (B98).
    expect(document.activeElement?.className).toContain("editor-content");
  });

  it("and does nothing at all from the tree when no note is open", async () => {
    await mount();

    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    act(() => {
      treeRow.focus();
    });
    cycle(true);
    await flush();

    // **A step with nowhere to land does nothing** (B98). Skipping on to the next stop in
    // the ring would answer a question the press did not ask, and this is the rule that
    // makes "do nothing if no note is active" one rule rather than a branch of its own.
    expect(document.activeElement).toBe(treeRow);
  });

  it("Enter on the title starts the rename, so it is a control and not just a heading", async () => {
    await mount();
    await openTheNote();

    const title = container.querySelector<HTMLElement>(".reader-header .pane-title")!;
    expect(title.tabIndex).toBe(0);
    act(() => title.focus());
    keydown(title, "Enter");
    await flush();

    expect(container.querySelector(".reader-title-input")).not.toBeNull();
  });

  it("keeps the note list's footer and the splitters out of the tab order", async () => {
    // The other half of B94's trade: both footer buttons gained a chord in the same
    // change, and a Tab walk that reads folders → notes → title → fields → note cannot
    // also stop on two grab strips and a sort chooser on the way. They keep their names,
    // so `--click-button` and a screen reader still reach them.
    await mount();
    for (const node of container.querySelectorAll<HTMLElement>(
      ".notes .pane-footer button, .pane-splitter",
    )) {
      expect(node.tabIndex).toBe(-1);
    }
    expect(container.querySelectorAll(".pane-splitter").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".notes .pane-footer button").length).toBeGreaterThan(0);
  });

  it("Ctrl-Tab out of the header block reaches the note's text", async () => {
    await mount();
    await openTheNote();

    const when = container.querySelector<HTMLElement>(".header-reader .created")!;
    when.focus();

    // The chord and not a plain Tab, deliberately: inside the block a plain Tab belongs
    // to the browser, walking When → Tags → Where → Who, and only the fourth of those
    // leaves for the note. The chord is how you get out from any of them.
    cycle(false);
    await flush();

    expect(document.activeElement?.className).toContain("editor-content");
  });

  it("Ctrl-Shift-Tab out of the editor lands on the note list, one stop back", async () => {
    await mount();
    await openTheNote();

    const editorContent = container.querySelector<HTMLElement>(".editor-content")!;
    editorContent.focus();

    cycle(true);
    await flush();

    // Backward is three stops (B98) — the title is a forward stop only, because going
    // back out of the note means going back to the list you came from. The header block
    // was a stop in both directions for one release and every press that had nothing to
    // do with those fields paid for it; `focusFields` reaches them in one chord instead.
    const activeNote = noteRows().find((node) => node.tabIndex === 0)!;
    expect(document.activeElement).toBe(activeNote);
  });

  it("still passes through the header block rather than jumping across the window", async () => {
    await mount();
    await openTheNote();

    // Not a stop is not the same as not recognised: a press made from inside the block
    // goes where the ring would have put you had you been in the pane on either side of
    // it. Without that it falls into the "focus is on nothing" branch and lands at the far
    // end of the window.
    const who = container.querySelector<HTMLElement>(".header-reader .attendees")!;
    who.focus();
    cycle(true);
    await flush();

    const activeNote = noteRows().find((node) => node.tabIndex === 0)!;
    expect(document.activeElement).toBe(activeNote);
  });

  it("passes through the title the same way", async () => {
    await mount();
    await openTheNote();

    const title = container.querySelector<HTMLElement>(".reader-header .pane-title")!;
    act(() => title.focus());
    cycle(false);
    await flush();

    expect(document.activeElement?.className).toContain("editor-content");
  });

  it("keeps plain Shift-Tab walking the header's own fields", async () => {
    await mount();
    await openTheNote();

    const who = container.querySelector<HTMLElement>(".header-reader .attendees")!;
    who.focus();
    keydown(who, "Tab", { shiftKey: true });
    await flush();

    // The whole reason `paneOf` stays blind to these fields: claim them there and this
    // press cycles the pane instead of moving one field. Nothing of ours handles it, so
    // the browser's own order is what runs — which jsdom does not implement, so what is
    // asserted is that focus was *not* thrown out of the block.
    expect(document.activeElement).toBe(who);
  });

  it("Mod-Shift-W puts the caret in When, from inside the note", async () => {
    await mount();
    await openTheNote();

    const editorContent = container.querySelector<HTMLElement>(".editor-content")!;
    editorContent.focus();
    keydown(editorContent, "w", { metaKey: true, shiftKey: true });
    await flush();

    // The chord that replaced the ring's fourth stop (B94). It lands on the *first* field
    // and Tab walks on to the other three, which is what makes one chord enough.
    expect(document.activeElement?.className).toContain("created");
  });

  it("Mod-Shift-W stays unclaimed when there is no note open to have fields", async () => {
    await mount();
    expect(container.querySelector(".header-reader")).toBeNull();

    const event = new KeyboardEvent("keydown", {
      key: "w",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
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
    openSearch();
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

  it("Mod-, opens Settings, which had no keyboard route at all", async () => {
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, ",", { metaKey: true });
    await flush();

    expect(container.querySelector(".settings")).not.toBeNull();
  });

  it("Mod-, stands aside while a modal owns the keyboard, unlike Mod-/", async () => {
    // Not the same rule as `help`, which toggles from outside the overlay guard so a
    // second press closes the sheet. The Settings panel records global accelerators, and
    // a `HotkeyRow` armed inside it owns every key precisely so this chord can be recorded
    // as one — a toggle above the guard would close the panel out from under it.
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, "/", { metaKey: true });
    await flush();
    expect(container.querySelector(".help")).not.toBeNull();

    keydown(container.querySelector<HTMLElement>(".help")!, ",", { metaKey: true });
    await flush();

    expect(container.querySelector(".settings")).toBeNull();
    expect(container.querySelector(".help")).not.toBeNull();
  });

  it("Mod-F puts the caret in the search box when the caret is not in a note", async () => {
    await mount();
    const treeRow = treeRows().find((node) => node.tabIndex === 0)!;
    treeRow.focus();

    keydown(treeRow, "f", { metaKey: true });
    await flush();

    expect(document.activeElement).toBe(container.querySelector(".notes-search input"));
  });

  /**
   * Leaving a mode, which is the half the library had never had.
   *
   * Tasks and a search are both states you could enter from the sidebar and only leave by
   * asking for something else — clicking a folder, a tag, anything at all. That is a way of
   * going somewhere, not a way of coming back, and neither had a key.
   *
   * Both exits end the same way, and it is the end that these pin: focus on the roving row
   * of the list that replaces what was on screen. It cannot be done on the spot — the
   * reload is a round trip, so the rows under `focusPane` at that moment are the ones about
   * to be unmounted — which is why `focusNotesOnNextList` waits for the new list instead.
   */
  /**
   * Unfolds the search field. It is only mounted while a search is open now — it lives in
   * the note list's heading rather than in a strip of its own — so reaching for the box
   * starts with the magnifier, which is what a hand does too.
   */
  function openSearch(): void {
    if (container.querySelector(".notes-search input") !== null) return;
    act(() => {
      container.querySelector<HTMLButtonElement>(".search-toggle")!.click();
    });
  }

  function setSearch(value: string): void {
    openSearch();
    const input = container.querySelector<HTMLInputElement>(".notes-search input")!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const searchBox = (): HTMLInputElement =>
    container.querySelector<HTMLInputElement>(".notes-search input")!;

  it("Escape in the search box leaves the search and focuses the note list", async () => {
    await mount();
    setSearch("klant");
    await flush();
    expect(searchBox().value).toBe("klant");

    keydown(searchBox(), "Escape");
    await flush();

    // The field folds back into the heading rather than sitting there emptied — leaving
    // a search puts the folder's own name back in the seat the box was borrowing.
    expect(container.querySelector(".notes-search input")).toBeNull();
    expect(document.activeElement).toBe(noteRows().find((node) => node.tabIndex === 0));
  });

  it("Escape on a note row while a search is live leaves the search too", async () => {
    // The search box is not a `.note[role="option"]`, so the window listener's `paneOf`
    // reads `null` for it and the box carries its own handler; this is the other branch,
    // which asks where the press came from before deciding what Escape means.
    await mount();
    setSearch("klant");
    await flush();

    const row = noteRows().find((node) => node.tabIndex === 0)!;
    row.focus();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      row.dispatchEvent(event);
    });
    await flush();

    // The cleared box and the consumed press, rather than where focus ended up: focus was
    // already on the roving row here, so asserting it lands there proves nothing — it
    // would hold just as well if this branch did not exist at all. The row above it is
    // where the focus hand-off is actually pinned.
    expect(container.querySelector(".notes-search input")).toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Escape on a note row does nothing at all when there is no search", async () => {
    // The branch above must not swallow the key otherwise: with no query, Escape in the
    // notes pane has never meant anything and still should not.
    await mount();
    const row = noteRows().find((node) => node.tabIndex === 0)!;
    row.focus();

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      row.dispatchEvent(event);
    });
    await flush();

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(row);
  });

  it("Mod-T opens the Tasks view, which had two routes and both were the mouse", async () => {
    await mount();
    expect(container.querySelector(".task-list")).toBeNull();

    const row = noteRows().find((node) => node.tabIndex === 0)!;
    row.focus();
    keydown(row, "t", { metaKey: true });
    await flush();

    expect(container.querySelector(".task-list")).not.toBeNull();
  });

  it("Mod-S opens the sort chooser, by pressing the button rather than copying it", async () => {
    // The menu is the note list's own state, positioned against that button's rectangle.
    // The chord finds the control and clicks it, which is what `--click-button` does from
    // main — so the key and the mouse cannot come to open two different menus.
    await mount();
    expect(container.querySelector(".context-menu")).toBeNull();

    const row = noteRows().find((node) => node.tabIndex === 0)!;
    row.focus();
    keydown(row, "s", { metaKey: true });
    await flush();

    const items = [...container.querySelectorAll(".context-menu-item")].map(
      (item) => item.textContent,
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("the Tasks view has a way out, by button and by Escape", async () => {
    await mount();

    const openTasks = (): void => {
      const row = Array.from(container.querySelectorAll(".tree-settings")).find(
        (el) => el.querySelector(".branch-name")?.textContent === "Tasks",
      )!;
      act(() => {
        row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    };

    openTasks();
    await flush();
    expect(container.querySelector(".task-list")).not.toBeNull();

    // The button first. It is labelled rather than an ×, because `--click-button` matches
    // a control by its text and a glyph gives it nothing to match.
    const exit = container.querySelector<HTMLButtonElement>(".task-exit")!;
    expect(exit.textContent).toBe("Exit tasks");
    act(() => {
      exit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(container.querySelector(".task-list")).toBeNull();
    expect(document.activeElement).toBe(noteRows().find((node) => node.tabIndex === 0));

    // Then the key. Pressed on `document.body`, which is exactly where focus sits after
    // arriving by the sidebar row or clicking the empty space under the last task — the
    // two cases a handler on the pane itself did nothing for, found by driving it rather
    // than by reading it. The window is the only listener that sees all of them.
    openTasks();
    await flush();
    keydown(document.body, "Escape");
    await flush();

    expect(container.querySelector(".task-list")).toBeNull();
    expect(document.activeElement).toBe(noteRows().find((node) => node.tabIndex === 0));
  });

  it("Escape from a task row leaves the view as well", async () => {
    await mount();
    const row = Array.from(container.querySelectorAll(".tree-settings")).find(
      (el) => el.querySelector(".branch-name")?.textContent === "Tasks",
    )!;
    act(() => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    keydown(container.querySelector(".task-list")!, "Escape");
    await flush();

    expect(container.querySelector(".task-list")).toBeNull();
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
