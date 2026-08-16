// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureApi, LibraryApi } from "../src/shared/ipc.js";
import type { FolderNode } from "../src/shared/vault-types.js";

/**
 * `openTasks()` (`Library.tsx`) used to hardcode `scope: ""` — vault-wide, however deep
 * into a project folder the tree happened to be standing. `tasksIn` (`index-db.ts`)
 * already matches a whole subtree with `startsWith`, so a folder scope is never narrower
 * than "this folder and everything under it": the fix is passing `lastFolder` instead.
 * `lastFolder` starts on `"00 Inbox"`, the same default the tree selection does, so even
 * the very first click on Tasks — with no folder explicitly chosen yet — is scoped rather
 * than vault-wide.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildFake(): { emqnote: CaptureApi; tasks: ReturnType<typeof vi.fn> } {
  const tree: FolderNode = {
    path: "",
    name: "Vault",
    noteCount: 0,
    children: [
      { path: "00 Inbox", name: "00 Inbox", noteCount: 0, children: [] },
      { path: "01 Projects", name: "01 Projects", noteCount: 0, children: [] },
    ],
  };

  const tasks = vi.fn(async () => []);

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
    tasks,
    linkingNotes: async () => [],
    onOpenLink: () => () => {},
    onOpenTag: () => () => {},
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
    openWikiLink: async () => "none" as const,
    checkAttachments: async () => [],
    pdfPageCount: async () => null,
    linkCandidates: async () => [],
    openExternal: async () => {},
    openTag: async () => {},
    library,
  };

  return { emqnote, tasks };
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function clickTasksRow(container: HTMLDivElement): void {
  const tasksRow = Array.from(container.querySelectorAll(".tree-settings")).find(
    (el) => el.querySelector(".branch-name")?.textContent === "Tasks",
  );
  expect(tasksRow).not.toBeUndefined();
  act(() => {
    tasksRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("the Tasks view defaults to the current folder", () => {
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

  it("scopes the very first click to the Inbox, not the whole vault", async () => {
    const fake = buildFake();
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    clickTasksRow(container);
    await flush();

    expect(fake.tasks).toHaveBeenCalledWith("00 Inbox", true);
  });

  it("follows the tree to whichever folder was last selected", async () => {
    const fake = buildFake();
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const projectRow = Array.from(container.querySelectorAll('[role="treeitem"]')).find(
      (el) => el.querySelector(".branch-name")?.textContent === "01 Projects",
    );
    expect(projectRow).not.toBeUndefined();
    await act(async () => {
      projectRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    clickTasksRow(container);
    await flush();

    expect(fake.tasks).toHaveBeenCalledWith("01 Projects", true);
  });
});
