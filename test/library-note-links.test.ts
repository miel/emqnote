// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type {
  FolderNode,
  LinkCandidateSummary,
  NoteSummary,
  OpenedNote,
} from "../src/shared/vault-types.js";

/**
 * The two things B35 puts on screen: the question before a move or a rename ("3 notes
 * link to this one — update them to follow?"), and the picker for a link that names two
 * notes at once.
 *
 * A real `Library` with a stubbed `window.emqnote`, the same arrangement as
 * `library-title-edit.test.ts`, for the same reason: what is worth testing here is the
 * sequencing — a dialog that has to appear *before* the IPC call, and a cancel that still
 * carries the action out — and none of that is visible from a shallow render.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE_PATH = "00 Inbox/2026-08-08 0900 Spelregels.md";
const MOVED_PATH = "01 Projecten/2026-08-08 0900 Spelregels.md";

// What `linkTargetFor` answers for each: the path with its note extension taken off,
// which is the spelling `NotePicker` writes into a document (B41).
const NOTE_TARGET = NOTE_PATH.replace(/\.md$/, "");
const MOVED_TARGET = MOVED_PATH.replace(/\.md$/, "");

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function noteSummary(path: string, title: string): NoteSummary {
  return {
    path,
    fileName: path.split("/").pop() ?? path,
    title,
    kind: "quick",
    created: "2026-08-08T09:00:00+02:00",
    modified: "2026-08-08T09:00:00+02:00",
    attendees: [],
    tags: [],
    excerpt: "",
  };
}

function openedNote(path: string, title: string): OpenedNote {
  return {
    path,
    title,
    kind: "quick",
    created: "2026-08-08T09:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    doc: EMPTY_DOC,
    editable: true,
  };
}

interface Fake {
  emqnote: CaptureApi;
  moveNote: ReturnType<typeof vi.fn>;
  renameNote: ReturnType<typeof vi.fn>;
  linkingNotes: ReturnType<typeof vi.fn>;
  openNoteMock: ReturnType<typeof vi.fn>;
  /** Fires the `library:open-link` push the way main does when a `[[…]]` chip is clicked. */
  pushOpenLink: (event: { target: string; candidates: LinkCandidateSummary[] }) => void;
}

function buildFake(): Fake {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 1, children: [] },
      { path: "01 Projecten", name: "01 Projecten", noteCount: 0, children: [] },
    ],
  };

  const notesByPath = new Map<string, OpenedNote>([
    [NOTE_PATH, openedNote(NOTE_PATH, "Spelregels")],
    [MOVED_PATH, openedNote(MOVED_PATH, "Spelregels")],
    ["02 Klanten/Spelregels.md", openedNote("02 Klanten/Spelregels.md", "Spelregels")],
  ]);

  const moveNote = vi.fn(async (path: string) => ({ path }));
  const renameNote = vi.fn(async (path: string) => ({ path }));
  const linkingNotes = vi.fn(async () => [] as { path: string; title: string }[]);
  const openNoteMock = vi.fn(async (path: string) => notesByPath.get(path) ?? null);

  let openLinkHandler:
    | ((event: { target: string; candidates: LinkCandidateSummary[] }) => void)
    | null = null;

  const library: LibraryApi = {
    tree: async () => tree,
    notes: async () => [noteSummary(NOTE_PATH, "Spelregels")],
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: openNoteMock,
    saveNote: async (request) => ({ written: false, path: request.path }),
    moveNote,
    renameNote,
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
    conflicts: async () => [],
    conflictDiff: async () => [],
    resolveConflict: async () => {},
    orphanedAttachments: async () => [],
    attachmentPreview: async () => null,
    trashAttachment: async () => "",
    linkingNotes,
    onOpenLink: (handler) => {
      openLinkHandler = handler;
      return () => {
        openLinkHandler = null;
      };
    },
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
    }),
    setLocale: async () => {},
    setHotkey: async () => true,
    setPaneWidths: () => {},
    setSort: () => {},
    listVaults: async () => [],
    chooseVault: async () => null,
    switchVault: async () => {},
    saveAttachment: async () => null,
    pickAttachment: async () => null,
    openWikiLink: async () => "none" as const,
    checkAttachments: async () => [],
    linkCandidates: async () => [],
    openExternal: async () => {},
    fetchRemoteImage: async () => null,
    onVaultFileChanged: () => () => {},
    reloadNote: async () => {},
    library,
  };

  return {
    emqnote,
    moveNote,
    renameNote,
    linkingNotes,
    openNoteMock,
    pushOpenLink: (event) => openLinkHandler?.(event),
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

function buttonLabelled(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  expect(found, `no button labelled "${label}"`).toBeDefined();
  return found as HTMLButtonElement;
}

describe("internal note links in the library (B35)", () => {
  let LibraryComponent: typeof import("../src/renderer/library/Library.js").Library;
  let container: HTMLDivElement;
  let root: Root;
  let fake: Fake;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake().emqnote;
    ({ Library: LibraryComponent } = await import("../src/renderer/library/Library.js"));
  });

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    fake = buildFake();
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function openTheNote(): Promise<void> {
    const row = container.querySelector(".notes-list .note")!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  async function moveIt(): Promise<void> {
    await openTheNote();
    const menu = buttonLabelled(container, "⋯");
    await act(async () => {
      menu.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const move = buttonLabelled(container.querySelector(".context-menu")!, "Move");
    await act(async () => {
      move.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const folder = [...container.querySelectorAll(".palette-list li")].find(
      (row) => row.textContent?.trim() === "01 Projecten",
    )!;
    await act(async () => {
      folder.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
  }

  it("moves without asking anything when nothing links to the note", async () => {
    await moveIt();

    expect(container.querySelector(".ask")).toBeNull();
    expect(fake.moveNote).toHaveBeenCalledWith(NOTE_PATH, "01 Projecten", false);
  });

  it("asks before the move when notes link to it, and counts them", async () => {
    fake.linkingNotes.mockResolvedValue([
      { path: "00 Inbox/Een.md", title: "Een" },
      { path: "00 Inbox/Twee.md", title: "Twee" },
      { path: "00 Inbox/Drie.md", title: "Drie" },
    ]);

    await moveIt();

    // Asked *before* anything moved: the targets resolve against where the note is now,
    // so after the move there would be nothing left for main to find.
    expect(fake.moveNote).not.toHaveBeenCalled();
    expect(container.querySelector(".ask")?.textContent).toContain("3 notes link to this one");
  });

  it("brings the links along when the question is confirmed", async () => {
    fake.linkingNotes.mockResolvedValue([{ path: "00 Inbox/Een.md", title: "Een" }]);
    await moveIt();

    await act(async () => {
      buttonLabelled(container, "Update").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flush();

    expect(fake.moveNote).toHaveBeenCalledWith(NOTE_PATH, "01 Projecten", true);
  });

  /**
   * The asymmetry worth pinning: dismissing this question is "move it without touching
   * the links", never "forget I asked to move it". The move is what was clicked; a
   * question about a side effect must not be able to undo the thing it is a side effect
   * of.
   */
  it("still moves, without rewriting, when the question is dismissed", async () => {
    fake.linkingNotes.mockResolvedValue([{ path: "00 Inbox/Een.md", title: "Een" }]);
    await moveIt();

    await act(async () => {
      buttonLabelled(container, "Leave them").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flush();

    expect(fake.moveNote).toHaveBeenCalledWith(NOTE_PATH, "01 Projecten", false);
  });

  it("opens the note straight away when a clicked link names exactly one", async () => {
    await act(async () => {
      fake.pushOpenLink({
        target: "Spelregels",
        candidates: [
          { path: MOVED_PATH, title: "Spelregels", folder: "01 Projecten", target: MOVED_TARGET },
        ],
      });
    });
    await flush();

    expect(container.querySelector(".palette-title")).toBeNull();
    expect(fake.openNoteMock).toHaveBeenCalledWith(MOVED_PATH);
  });

  it("raises the picker when a clicked link names two, and opens the one chosen", async () => {
    await act(async () => {
      fake.pushOpenLink({
        target: "Spelregels",
        candidates: [
          { path: NOTE_PATH, title: "Spelregels", folder: "00 Inbox", target: NOTE_TARGET },
          {
            path: "02 Klanten/Spelregels.md",
            title: "Spelregels",
            folder: "02 Klanten",
            target: "02 Klanten/Spelregels",
          },
        ],
      });
    });
    await flush();

    const rows = [...container.querySelectorAll(".palette-list li")];
    expect(rows).toHaveLength(2);
    // The folder is the only thing telling the two apart, so it has to be on screen.
    expect(rows.map((row) => row.textContent)).toEqual([
      "Spelregels00 Inbox",
      "Spelregels02 Klanten",
    ]);

    await act(async () => {
      rows[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(fake.openNoteMock).toHaveBeenCalledWith("02 Klanten/Spelregels.md");
    expect(container.querySelector(".palette-title")).toBeNull();
  });
});
