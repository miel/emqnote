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
 *
 * There are two ways in now: the sidebar's own row, and a button in the note list's header
 * beside + New note. The second exists because the first is three panes away from the bar
 * you are already looking at — and it is given `openTasks` itself rather than a copy of
 * what it does, which is what the last test here holds onto. Two gestures that mean the
 * same thing have to *be* the same thing, or the day one of them learns about a new scope
 * the other will not.
 *
 * The other half of a scope is what can be *chosen* as one, and the three tests at the top
 * are about that: the chooser is filtered by `foldersWithTasks`, whose own unit tests live
 * in `tasks-folder-options.test.ts`. These mount the real window because what was wrong
 * was not that function but the question being put to it — it was asked about `total`
 * while the view it feeds opens on `open`, so a folder whose tasks were all finished could
 * be selected and showed nothing. That mismatch is invisible from either side alone.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** `noteCounts` is what the index says per note path, which is what the scope chooser reads. */
function buildFake(
  noteCounts: Record<string, { open: number; total: number }> = {},
): { emqnote: CaptureApi; tasks: ReturnType<typeof vi.fn> } {
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
    folderTaskCounts: async () => ({}),
    noteTaskCounts: async () => noteCounts,
    search: async () => [],
    facets: async () => ({ tags: [], people: [], available: true }),
    openNote: async () => null,
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
    tasks,
    linkingNotes: async () => [],
    onOpenLink: () => () => {},
    onOpenTag: () => () => {},
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

function clickTasksButton(container: HTMLDivElement): void {
  // The header's own button, not the sidebar row: `.notes-actions` is what tells the two
  // apart, since both carry the same word — deliberately, they open the same view.
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>(".notes .pane-actions button"),
  ).find((el) => el.textContent === "Tasks");
  expect(button).not.toBeUndefined();
  act(() => {
    button!.click();
  });
}

describe("the Tasks view's scope, and what can be chosen as one", () => {
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

  /** Mounts and opens the Tasks view through the sidebar row. */
  async function openTasks(
    noteCounts: Record<string, { open: number; total: number }> = {},
  ): Promise<void> {
    (window as unknown as { emqnote: unknown }).emqnote = buildFake(noteCounts).emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();
    clickTasksRow(container);
    await flush();
  }

  const scopeOptions = (): string[] =>
    Array.from(container.querySelectorAll<HTMLOptionElement>(".task-scope option")).map(
      (option) => option.value,
    );

  it("offers no folder whose tasks are all finished while 'open only' is ticked", async () => {
    // Reported twice. The chooser asked `total` so that ticking the box could not rebuild
    // it — but the view *opens* with the box ticked, so a folder whose every task is done
    // stood in the list offering a pane with nothing in it. The tick and the list now ask
    // the same question.
    await openTasks({
      "01 Projects/afgerond.md": { total: 3, open: 0 },
      "00 Inbox/plan.md": { total: 2, open: 1 },
    });

    expect(scopeOptions()).not.toContain("01 Projects");
    expect(scopeOptions()).toContain("00 Inbox");
  });

  it("offers it again the moment the box is unticked", async () => {
    // The other half: with the tick off the view shows finished tasks, so a folder that
    // holds only those has something to show and belongs in the chooser again.
    await openTasks({ "01 Projects/afgerond.md": { total: 3, open: 0 } });
    expect(scopeOptions()).not.toContain("01 Projects");

    const box = container.querySelector<HTMLInputElement>(".task-open-only input");
    expect(box).not.toBeNull();
    await act(async () => {
      box!.click();
    });
    await flush();

    expect(scopeOptions()).toContain("01 Projects");
  });

  it("keeps the folder being stood in, even when the tick empties it", async () => {
    // The rebuild the old rule was avoiding, met head-on: the first click scopes to
    // "00 Inbox", and a `<select>` whose value is not among its options renders blank.
    await openTasks({ "00 Inbox/afgerond.md": { total: 1, open: 0 } });

    expect(scopeOptions()).toContain("00 Inbox");
    expect(container.querySelector<HTMLSelectElement>(".task-scope")!.value).toBe("00 Inbox");
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

  it("opens the same view from the note list's own button", async () => {
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
    await act(async () => {
      projectRow!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    clickTasksButton(container);
    await flush();

    // The scope, and not merely "a tasks view opened": it is the scope that would drift if
    // the button ever grew a handler of its own.
    expect(fake.tasks).toHaveBeenCalledWith("01 Projects", true);
    // And the header goes with the list it belongs to, so the button that opened this is
    // no longer on screen — the view it opened has replaced the note list entirely.
    expect(container.querySelector(".notes-actions")).toBeNull();
  });

  /**
   * B95. `Mod+T` opened the view and had no way of closing it: a second press re-set the
   * same selection and nothing on screen moved.
   *
   * The chord is the only route that can toggle, and the assertion above is why — the note
   * list is unmounted while the view is showing, so the button that opened it is not there
   * to be pressed again. The way out is `exitTasks`, the same function Escape and the
   * view's own Exit tasks button call, which is why there is still exactly one of them.
   */
  it("closes the Tasks view on a second Mod+T, having opened it on the first", async () => {
    const fake = buildFake();
    (window as unknown as { emqnote: unknown }).emqnote = fake.emqnote;
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(LibraryComponent));
    });
    await flush();

    const press = async (): Promise<void> => {
      await act(async () => {
        window.dispatchEvent(
          // `Mod` is Cmd here: this fake reports `platform: "darwin"`, and `matches` is
          // asked which one that means rather than accepting either.
          new KeyboardEvent("keydown", { key: "t", metaKey: true, bubbles: true, cancelable: true }),
        );
      });
      await flush();
    };

    await press();
    expect(container.querySelector(".task-list")).not.toBeNull();
    expect(fake.tasks).toHaveBeenCalledWith("00 Inbox", true);

    await press();
    expect(container.querySelector(".task-list")).toBeNull();
    // Back on the folder the tree was standing on when it opened, with its note list —
    // which is `exitTasks`' whole job, and the reason the chord does not spell one of
    // its own.
    expect(container.querySelector(".notes-list")).not.toBeNull();
  });
});
