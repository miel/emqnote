// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode, NoteSummary, OpenedNote } from "../src/shared/vault-types.js";

/**
 * Where focus and the selection stand after a note has been moved out of the list.
 *
 * The report: "after moving a note the caret position/focus within the folder list is
 * lost — it takes multiple tabs to return to the folder list". What actually happens is
 * that the row holding focus is *unmounted*, because the note it draws is no longer in
 * this folder, and focus falls to `<body>` — from where Tab walks the whole window before
 * it reaches a pane again.
 *
 * `NoteList` already recovers its **roving row** on its own: `active` falls back to the
 * first note when the path it was on is no longer in the list. What it cannot recover is
 * focus, because nothing told it to take any. So the fix is the flag the Tasks and search
 * exits already use, plus a decision about which row to stand on — the one above the note
 * that left, since after taking something out of a list the eye is where the thing above
 * it is.
 *
 * Mounted through a real `Library`, like `reader-menu.test.ts` beside it: the move goes
 * through `moveNoteTo` → `askRelinkThen` → `performMove`, and a stand-in for any of those
 * would be testing the stand-in.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

const PATHS = [
  "00 Inbox/2026-08-06 0900 Eerste.md",
  "00 Inbox/2026-08-06 1000 Tweede.md",
  "00 Inbox/2026-08-06 1100 Derde.md",
];
const TITLES = ["Eerste", "Tweede", "Derde"];

function noteSummary(path: string, title: string): NoteSummary {
  return {
    path,
    fileName: path.split("/").pop() ?? path,
    title,
    kind: "quick",
    // Descending by modified is the default sort, so these are written oldest-first and
    // read back newest-first — which is why the fake sorts nothing itself.
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

interface Fake {
  emqnote: CaptureApi;
  moveNote: ReturnType<typeof vi.fn>;
}

/** The Inbox, holding three notes, and one other folder to move into. */
function buildFake(): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 3, children: [] },
      { path: "01 Werk", name: "01 Werk", noteCount: 0, children: [] },
    ],
  };

  // The list the window is shown, mutated by the move exactly as the vault would be.
  let inbox = [...PATHS];

  const moveNote = vi.fn(async (path: string, folder: string) => {
    inbox = inbox.filter((entry) => entry !== path);
    return { path: `${folder}/${path.split("/").pop()}` };
  });

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () =>
      inbox.map((path) => noteSummary(path, TITLES[PATHS.indexOf(path)] ?? path)),
    folderFiles: async () => [],
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => ({}),
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async (path) => {
      const index = PATHS.indexOf(path);
      return index === -1 ? null : openedNote(path, TITLES[index] ?? path);
    },
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote,
    renameNote: async (path) => ({ path }),
    duplicateNote: async (path) => ({ path }),
    trashNote: async () => true,
    trashContents: async () => ({ notes: 0, folders: 0, files: 0, openTasks: 0, linkedFiles: 0 }),
    trashItemTasks: async () => 0,
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
    // No links to any of these, so the move goes straight through rather than stopping to
    // ask about rewriting them — that question has its own tests.
    linkingNotes: async () => [],
    onOpenLink: () => () => {},
    onOpenTag: () => () => {},
    tasks: async () => [],
    toggleTask: async () => ({ toggled: true }),
    setPinned: async (_path: string, pinned: boolean) => ({ pinned }),
  };

  const emqnote: CaptureApi = {
    platform: "linux",
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
      platform: "linux",
      hotkey: "CommandOrControl+Shift+Space",
      libraryHotkey: "CommandOrControl+Shift+B",
      vaultPath: "/vault",
      libraryPaneWidths: null,
      librarySort: "modified",
      loadRemoteImages: true,
      keepPinnedInView: false,
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
    setKeepPinnedInView: async () => {},
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
    peopleSuggestions: async () => [],
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText: async () => {},
    library,
  };

  return { emqnote, moveNote };
}

async function flush(rounds = 14): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("moving a note out of the list it was selected in", () => {
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

  const rows = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(".notes-list .note"));

  const titles = (): (string | null)[] =>
    rows().map((row) => row.querySelector(".note-title")?.textContent ?? row.textContent);

  async function mount(fake: Fake): Promise<void> {
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  }

  /** Selects a row by its title, the way a click does — which is what opens it. */
  async function select(title: string): Promise<void> {
    const row = rows().find((node) => node.textContent?.includes(title));
    expect(row, `no row for ${title}`).not.toBeUndefined();
    await act(async () => {
      row!.focus();
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  /** Actions → Move → the named folder in the palette. */
  async function moveTo(folder: string): Promise<void> {
    const actions = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".reader-actions button"),
    ).find((node) => node.textContent === "Actions");
    await act(async () => {
      actions!.click();
    });
    await flush();

    const item = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".context-menu-item"),
    ).find((node) => node.querySelector(".context-menu-label")?.textContent === "Move");
    await act(async () => {
      item!.click();
    });
    await flush();

    const row = Array.from(container.querySelectorAll<HTMLElement>(".palette-list li")).find(
      (node) => node.textContent === folder,
    );
    expect(row, `no palette row for ${folder}`).not.toBeUndefined();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  it("leaves focus on a row in the note list rather than on the body", async () => {
    const fake = buildFake();
    await mount(fake);
    await select("Tweede");

    await moveTo("01 Werk");

    expect(fake.moveNote).toHaveBeenCalled();
    // The whole report, in one assertion: focus is somewhere a Tab can be counted from,
    // and not on `<body>`.
    expect(document.activeElement?.classList.contains("note")).toBe(true);
  });

  it("stands on the note that was above the one that left", async () => {
    const fake = buildFake();
    await mount(fake);
    await select("Tweede");

    await moveTo("01 Werk");

    expect(titles()).toEqual(["Eerste", "Derde"]);
    expect(document.activeElement?.textContent).toContain("Eerste");
    // Selected, not merely focused: the row that has focus is the row the reader is
    // showing, which is what "choose the note that was before it" means.
    expect(document.activeElement?.classList.contains("note-on")).toBe(true);
  });

  it("falls to the note below when the one that left was the first", async () => {
    const fake = buildFake();
    await mount(fake);
    await select("Eerste");

    await moveTo("01 Werk");

    expect(titles()).toEqual(["Tweede", "Derde"]);
    // The row, not the body: `<body>`'s own `textContent` contains every title on screen,
    // so a bare `toContain` here would pass with focus nowhere at all.
    expect(document.activeElement?.classList.contains("note")).toBe(true);
    expect(document.activeElement?.textContent).toContain("Tweede");
    expect(document.activeElement?.classList.contains("note-on")).toBe(true);
  });
});
