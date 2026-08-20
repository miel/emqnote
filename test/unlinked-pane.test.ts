// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FileSummary, FolderNode } from "../src/shared/vault-types.js";

/**
 * §6.5's unlinked attachments as a place in the sidebar rather than a modal.
 *
 * This file used to check the opposite. Bug 7 (6 August 2026) moved the entry point off
 * the folder tree's footer into a row inside Settings, arguing it was an occasional
 * action rather than an everyday destination; it is back in the footer now as neither —
 * a `Selection` of its own, whose note pane is B47's file list and whose reader is B47's
 * preview. So the thing worth testing moved with it: not "is there a button in Settings"
 * but "does picking that row list the files, and does the list say something useful while
 * it cannot".
 *
 * The loading and failure states are the point rather than trimming. The screen this
 * replaces shipped with no `.catch` at all, so a rejected `invoke` left "Looking…" on
 * screen for the rest of the session with nothing to explain it — and this is still the
 * one file list that is a *search* over the whole index rather than one `readdir`.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORPHANS: FileSummary[] = [
  {
    path: "_attachments/2026/07/afbeelding-1.png",
    name: "afbeelding-1.png",
    extension: ".png",
    modified: "2026-07-01T10:00:00+02:00",
    size: 2048,
  },
  {
    path: "_attachments/2026/07/contract.docx",
    name: "contract.docx",
    extension: ".docx",
    modified: "2026-07-02T10:00:00+02:00",
    size: 500,
  },
];

interface Fake {
  emqnote: CaptureApi;
  unlinkedAttachments: ReturnType<typeof vi.fn>;
  trashAttachment: ReturnType<typeof vi.fn>;
  revealNote: ReturnType<typeof vi.fn>;
  copyText: ReturnType<typeof vi.fn>;
  /** Fires `library:refresh`, which main sends twice for every debounced autosave. */
  refresh: () => void;
}

function buildFake(answer: () => Promise<FileSummary[]> = async () => ORPHANS): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 0, children: [] }],
  };

  const unlinkedAttachments = vi.fn(answer);
  let refreshListener: (() => void) | null = null;
  const trashAttachment = vi.fn(async () => "_trash/afbeelding-1.png");
  const revealNote = vi.fn();
  const copyText = vi.fn(async () => {});

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [],
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
    revealNote,
    noteEditable: async () => true,
    openInCapture: async () => true,
    newNote: () => {},
    onRefresh: (listener) => {
      refreshListener = listener;
      return () => {
        refreshListener = null;
      };
    },
    onCyclePanes: () => () => {},
    scanState: async () => null,
    onScanProgress: () => () => {},
    onFlushSaves: () => () => {},
    conflicts: async () => [],
    conflictDiff: async () => [],
    resolveConflict: async () => {},
    unlinkedAttachments,
    trashAttachment,
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
    openWikiLink: async () => "attachment" as const,
    checkAttachments: async () => [],
    pdfPageCount: async () => 1,
    linkCandidates: async () => [],
    tagSuggestions: async () => [],
    locationSuggestions: async () => [],
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText,
    library,
  };

  return {
    emqnote,
    unlinkedAttachments,
    trashAttachment,
    revealNote,
    copyText,
    refresh: () => refreshListener?.(),
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

describe("the unlinked-attachments pane", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
    // Nothing here is about the picture that comes back; jsdom has no fetch that would
    // answer a custom scheme anyway.
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

  /** Every sidebar row's own label — for asking whether one is there at all. */
  const rowLabels = (): string[] =>
    Array.from(container.querySelectorAll<HTMLElement>(".branch .branch-name")).map(
      (name) => name.textContent ?? "",
    );

  /** The footer row, found by its own label exactly as `--click-button` would find it. */
  function unlinkedRow(): HTMLElement {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".branch")).find(
      (candidate) =>
        candidate.querySelector(".branch-name")?.textContent === "Unlinked attachments",
    );
    expect(row).toBeDefined();
    return row!;
  }

  async function click(element: Element): Promise<void> {
    await act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  const fileRows = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(".files-list .file-row"));

  const menuLabels = (): string[] =>
    Array.from(container.querySelectorAll(".context-menu .context-menu-label")).map(
      (label) => label.textContent ?? "",
    );

  async function openRowMenu(row: HTMLElement): Promise<void> {
    await act(async () => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    await flush();
  }

  it("lists the unlinked files as file rows once the row is picked", async () => {
    const fake = buildFake();
    await mount(fake);

    // Asked once at mount, which it was not before: the footer row is hidden when there
    // is nothing to clean up, and that answer has to be in hand before the sidebar draws.
    // The reply is kept, so picking the row lists its files without a second wait.
    expect(fake.unlinkedAttachments).toHaveBeenCalledTimes(1);

    await click(unlinkedRow());

    expect(fake.unlinkedAttachments).toHaveBeenCalledTimes(2);
    expect(fileRows().map((row) => row.querySelector(".note-title")!.textContent)).toEqual([
      "afbeelding-1.png",
      "contract.docx",
    ]);
    // The whole pane, since there is no note list above to protect (B47's `files-only`).
    expect(container.querySelector(".files-list")!.className).toContain("files-only");
    // And no note half at all — nothing to count, sort or file a new note into.
    expect(container.querySelector(".notes-header")).toBeNull();
    expect(container.querySelector(".notes-list")).toBeNull();
  });

  it("says it is looking while the scan is still running", async () => {
    let release: (files: FileSummary[]) => void = () => {};
    const fake = buildFake(
      () =>
        new Promise<FileSummary[]>((resolve) => {
          release = resolve;
        }),
    );
    await mount(fake);
    await click(unlinkedRow());

    expect(container.textContent).toContain("Looking…");

    await act(async () => {
      release(ORPHANS);
    });
    await flush();

    expect(container.textContent).not.toContain("Looking…");
    expect(fileRows()).toHaveLength(2);
  });

  it("keeps the rows on screen while a refresh re-scans", async () => {
    // The reported flicker. Main sends `library:refresh` twice for every debounced
    // autosave — once from the writer, once from the watcher seeing that same write — so
    // typing in the capture window re-ran this scan twice a second, and each run blanked
    // the list to "Looking…" before asking.
    let release: (files: FileSummary[]) => void = () => {};
    let answered = 0;
    const fake = buildFake(() => {
      answered += 1;
      // The mount's own count and the click's scan; the refresh's is the one left hanging.
      if (answered <= 2) return Promise.resolve(ORPHANS);
      return new Promise<FileSummary[]>((resolve) => {
        release = resolve;
      });
    });
    await mount(fake);
    await click(unlinkedRow());
    expect(fileRows()).toHaveLength(2);

    await act(async () => {
      fake.refresh();
    });
    await flush();

    // Mid-scan: the rows that are already right are still the rows on screen.
    expect(fake.unlinkedAttachments).toHaveBeenCalledTimes(3);
    expect(container.textContent).not.toContain("Looking…");
    expect(fileRows()).toHaveLength(2);

    await act(async () => {
      release([ORPHANS[0]!]);
    });
    await flush();

    expect(fileRows()).toHaveLength(1);
  });

  it("says so when the scan fails, rather than looking forever", async () => {
    // The exact bug the modal shipped with: no `.catch`, so a rejected `invoke` left the
    // one loading state set for the rest of the session.
    const fake = buildFake(() => Promise.reject(new Error("no index")));
    await mount(fake);
    await click(unlinkedRow());

    expect(container.textContent).toContain("The search did not finish");
    expect(container.textContent).not.toContain("Looking…");
  });

  it("retries when the row is picked again, which is what the failure message offers", async () => {
    let attempt = 0;
    const fake = buildFake(async () => {
      attempt += 1;
      // The mount's count fails too, which is why the row is still there to pick: a
      // failed count is not evidence of an empty vault, so it leaves the count unknown.
      if (attempt <= 2) throw new Error("no index");
      return ORPHANS;
    });
    await mount(fake);
    await click(unlinkedRow());
    expect(container.textContent).toContain("The search did not finish");

    // Worth its own test because it does not come for free: `selectionKey` answers
    // `"unlinked"` whatever object is set, so the effect keyed on it never fires a second
    // time and the reload has to be asked for by hand.
    await click(unlinkedRow());

    expect(fake.unlinkedAttachments).toHaveBeenCalledTimes(3);
    expect(fileRows()).toHaveLength(2);
    expect(container.textContent).not.toContain("The search did not finish");
  });

  it("takes the footer row away when there is nothing to clean up", async () => {
    // The good outcome used to be a screen saying so, which is a place you open once to
    // be told there is nothing there. The row is simply gone now.
    const fake = buildFake(async () => []);
    await mount(fake);

    expect(rowLabels()).not.toContain("Unlinked attachments");
  });

  it("keeps the row, and says so in the pane, when the last file goes while it is open", async () => {
    // The one case the empty state still has to exist for: the row cannot be taken away
    // from under its own open pane, or the library is left on a screen with nothing to
    // click to get back out of.
    let answered = 0;
    const fake = buildFake(async () => (++answered <= 2 ? ORPHANS : []));
    await mount(fake);
    await click(unlinkedRow());
    expect(fileRows()).toHaveLength(2);

    await act(async () => {
      fake.refresh();
    });
    await flush();

    expect(rowLabels()).toContain("Unlinked attachments");
    expect(container.textContent).toContain("No unlinked attachments found.");
  });

  it("offers Copy link, Reveal and Delete on a row, in that order", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(unlinkedRow());
    await openRowMenu(fileRows()[0]!);

    expect(menuLabels()).toEqual(["Copy link", "Reveal", "Delete"]);
  });

  it("copies the spelling insertion writes — `![[…]]` for a picture, `[[…]]` otherwise", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(unlinkedRow());

    await openRowMenu(fileRows()[0]!);
    await click(container.querySelectorAll(".context-menu .context-menu-item")[0]!);
    expect(fake.copyText).toHaveBeenLastCalledWith(
      "![[_attachments/2026/07/afbeelding-1.png]]",
    );

    // A `.docx` draws no page and is a chip that opens, so it is written as a plain link
    // — the same answer `isEmbeddableAttachment` gives the editor.
    await openRowMenu(fileRows()[1]!);
    await click(container.querySelectorAll(".context-menu .context-menu-item")[0]!);
    expect(fake.copyText).toHaveBeenLastCalledWith("[[_attachments/2026/07/contract.docx]]");
  });

  it("reveals the file the row names", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(unlinkedRow());
    await openRowMenu(fileRows()[0]!);
    await click(container.querySelectorAll(".context-menu .context-menu-item")[1]!);

    expect(fake.revealNote).toHaveBeenCalledWith("_attachments/2026/07/afbeelding-1.png");
  });

  it("deletes through the existing trashAttachment and asks the list again", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(unlinkedRow());
    fake.unlinkedAttachments.mockClear();

    await openRowMenu(fileRows()[0]!);
    await click(container.querySelectorAll(".context-menu .context-menu-item")[2]!);

    expect(fake.trashAttachment).toHaveBeenCalledWith("_attachments/2026/07/afbeelding-1.png");
    // The list is a search, not a local array to splice: re-asking is what keeps it
    // honest when the same file was referenced by a note in between.
    expect(fake.unlinkedAttachments).toHaveBeenCalledTimes(1);
  });

  it("offers no Delete on a file row outside this pane", async () => {
    // B47's reasoning: a file row answering half a note's menu reads worse than one that
    // plainly is not a note — and a permanently disabled Delete on every picture in a
    // folder is noise. It belongs to the one pane whose whole point is throwing files
    // away.
    const fake = buildFake();
    (fake.emqnote.library as unknown as { folderFiles: () => Promise<FileSummary[]> }).folderFiles =
      async () => ORPHANS;
    await mount(fake);

    const inbox = Array.from(container.querySelectorAll<HTMLElement>(".branch")).find(
      (row) => row.querySelector(".branch-name")?.textContent === "00 Inbox",
    );
    await click(inbox!);
    await openRowMenu(fileRows()[0]!);

    expect(menuLabels()).toEqual(["Copy link", "Reveal"]);
  });
});
