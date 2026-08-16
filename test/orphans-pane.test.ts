// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FileSummary, FolderNode } from "../src/shared/vault-types.js";

/**
 * §6.5's orphaned attachments as a place in the sidebar rather than a modal.
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
  orphanedAttachments: ReturnType<typeof vi.fn>;
  trashAttachment: ReturnType<typeof vi.fn>;
  revealNote: ReturnType<typeof vi.fn>;
  copyText: ReturnType<typeof vi.fn>;
}

function buildFake(answer: () => Promise<FileSummary[]> = async () => ORPHANS): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [{ path: "00 Inbox", name: "00 Inbox", noteCount: 0, children: [] }],
  };

  const orphanedAttachments = vi.fn(answer);
  const trashAttachment = vi.fn(async () => "_trash/afbeelding-1.png");
  const revealNote = vi.fn();
  const copyText = vi.fn(async () => {});

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
    orphanedAttachments,
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
      librarySort: "modified",
      loadRemoteImages: true,
    }),
    setLocale: async () => {},
    setLoadRemoteImages: async () => {},
    setHotkey: async () => true,
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
    openExternal: async () => {},
    openTag: async () => {},
    openInSystemViewer: async () => {},
    copyText,
    library,
  };

  return { emqnote, orphanedAttachments, trashAttachment, revealNote, copyText };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the orphaned-attachments pane", () => {
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

  /** The footer row, found by its own label exactly as `--click-button` would find it. */
  function orphansRow(): HTMLElement {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".branch")).find(
      (candidate) =>
        candidate.querySelector(".branch-name")?.textContent === "Orphaned attachments",
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

  it("lists the orphans as file rows once the row is picked", async () => {
    const fake = buildFake();
    await mount(fake);

    // Not asked until it is asked for: the scan reads the whole index, and a library
    // opening on a folder has no business paying for it.
    expect(fake.orphanedAttachments).not.toHaveBeenCalled();

    await click(orphansRow());

    expect(fake.orphanedAttachments).toHaveBeenCalledTimes(1);
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
    await click(orphansRow());

    expect(container.textContent).toContain("Looking…");

    await act(async () => {
      release(ORPHANS);
    });
    await flush();

    expect(container.textContent).not.toContain("Looking…");
    expect(fileRows()).toHaveLength(2);
  });

  it("says so when the scan fails, rather than looking forever", async () => {
    // The exact bug the modal shipped with: no `.catch`, so a rejected `invoke` left the
    // one loading state set for the rest of the session.
    const fake = buildFake(() => Promise.reject(new Error("no index")));
    await mount(fake);
    await click(orphansRow());

    expect(container.textContent).toContain("The search did not finish");
    expect(container.textContent).not.toContain("Looking…");
  });

  it("retries when the row is picked again, which is what the failure message offers", async () => {
    let attempt = 0;
    const fake = buildFake(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("no index");
      return ORPHANS;
    });
    await mount(fake);
    await click(orphansRow());
    expect(container.textContent).toContain("The search did not finish");

    // Worth its own test because it does not come for free: `selectionKey` answers
    // `"orphans"` whatever object is set, so the effect keyed on it never fires a second
    // time and the reload has to be asked for by hand.
    await click(orphansRow());

    expect(fake.orphanedAttachments).toHaveBeenCalledTimes(2);
    expect(fileRows()).toHaveLength(2);
    expect(container.textContent).not.toContain("The search did not finish");
  });

  it("says when there are none, which is the good outcome", async () => {
    const fake = buildFake(async () => []);
    await mount(fake);
    await click(orphansRow());

    expect(container.textContent).toContain("No orphaned attachments found.");
  });

  it("offers Copy link, Reveal and Delete on a row, in that order", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(orphansRow());
    await openRowMenu(fileRows()[0]!);

    expect(menuLabels()).toEqual(["Copy link", "Reveal", "Delete"]);
  });

  it("copies the spelling insertion writes — `![[…]]` for a picture, `[[…]]` otherwise", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(orphansRow());

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
    await click(orphansRow());
    await openRowMenu(fileRows()[0]!);
    await click(container.querySelectorAll(".context-menu .context-menu-item")[1]!);

    expect(fake.revealNote).toHaveBeenCalledWith("_attachments/2026/07/afbeelding-1.png");
  });

  it("deletes through the existing trashAttachment and asks the list again", async () => {
    const fake = buildFake();
    await mount(fake);
    await click(orphansRow());
    fake.orphanedAttachments.mockClear();

    await openRowMenu(fileRows()[0]!);
    await click(container.querySelectorAll(".context-menu .context-menu-item")[2]!);

    expect(fake.trashAttachment).toHaveBeenCalledWith("_attachments/2026/07/afbeelding-1.png");
    // The list is a search, not a local array to splice: re-asking is what keeps it
    // honest when the same file was referenced by a note in between.
    expect(fake.orphanedAttachments).toHaveBeenCalledTimes(1);
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
