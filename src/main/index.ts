import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { join } from "node:path";
import { IPC, type CapturePayload } from "../shared/ipc.js";
import { knownVaults, rememberVault } from "./remembered.js";
import { listVaults } from "./vaults.js";
import { CaptureWriter } from "./capture-store.js";
import {
  createCaptureWindow,
  focusCaptureWindow,
  getCaptureWindow,
  hideCaptureWindow,
  sendStatus,
  setBlurHandler,
  setHideHandler,
  setQuitting,
  showCaptureWindow,
} from "./capture-window.js";
import { completeMeasurement, LATENCY_BUDGET_MS } from "./latency.js";
import { notifyPainted, runSelfTest } from "./selftest.js";
import { dumpClipboard } from "./clipboard-dump.js";
import {
  captureWindowTo,
  getLibraryWindow,
  showLibraryWindow,
} from "./library-window.js";
import { readLaunchOptions } from "./launch-options.js";
import { loadSettings, saveSettings } from "./settings.js";
import { buildTrayMenu, createTray } from "./tray.js";
import { checkForUpdates, setBeforeInstall } from "./updater.js";
import {
  checkFilesOnDemand,
  ensureVaultLayout,
  FILES_ON_DEMAND_INSTRUCTION,
  findOneDriveCandidates,
  tenantLabel,
  VAULT_FOLDER_NAME,
} from "./vault.js";
import {
  createFolder,
  diffConflict,
  renameFolder,
  moveNote,
  openNote,
  readFolderTree,
  renameNote,
  resolveConflict,
  saveNote,
  trashAttachment,
  trashNote,
} from "./vault-io.js";
// No explicit invalidation on writes: the scan stats every file anyway, so a changed
// note is re-read and an unchanged one is not. A capture landing mid-session costs the
// stat walk, not another full read.
import { conflicts, facets, notesMatching, searchNotes } from "./vault-scan.js";
import { closeIndex, openIndex, type IndexDb } from "./index-db.js";
import { watchVault, type VaultWatcher } from "./index-watch.js";
import { parseSearchQuery } from "./search-query.js";
import { attachmentPreview, findOrphanedAttachments } from "./orphaned-attachments.js";
import type {
  ConflictChoice,
  ConflictPair,
  SaveNoteRequest,
  Selection,
} from "../shared/vault-types.js";
import type { Locale } from "../shared/i18n.js";

// Windows: Roaming AppData can be synchronised by a corporate profile, which is exactly
// what we do not want for an index and window state. Must happen before 'ready'.
if (process.platform === "win32" && process.env.LOCALAPPDATA !== undefined) {
  app.setPath("userData", join(process.env.LOCALAPPDATA, "emqnote"));
}

const launch = readLaunchOptions();

// One resident instance. A second launch simply opens the capture window.
//
// A self-test is the exception: it has to be able to run while the everyday instance
// is resident, otherwise it would quietly hand off to that instance and appear to do
// nothing at all — which is exactly what happened the first time it was tried on
// Windows. It runs on its own vault and exits when done. `--dump-clipboard` needs the
// same exception for the same reason: its whole point is running it alongside the
// resident instance, right after copying something from Outlook.
const bypassesSingleInstance = launch.selfTestRounds > 0 || launch.dumpClipboard !== null;
if (!bypassesSingleInstance && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (!bypassesSingleInstance) {
    app.on("second-instance", () => showCaptureWindow());
  }
  void main();
}

let lastLatency: number | null = null;
let lastSavedAs: string | null = null;
/**
 * The search index (`02-technisch-ontwerp.md` §7). Opened once in `main`, after
 * `app.whenReady`, since its path lives under `app.getPath("userData")` — B9, same
 * reasoning as `settings.ts`. Null only in the sliver of time before that, and in the
 * `--dump-clipboard` early exit, which never touches it; `will-quit` guards on it for
 * exactly that second case, since that handler is registered unconditionally and a
 * quit during the second-instance-lock check never reaches `main` at all.
 */
let indexDb: IndexDb | null = null;
/** Incremental reindexing after the initial full scan — §7.2. Started once a vault is known, closed on quit. */
let vaultWatcher: VaultWatcher | null = null;

/**
 * Tells the library to reload. Used for the vault changing underneath it, and also for
 * the capture window claiming or releasing a note — the library's `editable` flag on
 * whatever it has open is only ever as fresh as the last of these.
 */
function notifyLibrary(): void {
  const library = getLibraryWindow();
  if (library !== null && !library.isDestroyed()) {
    library.webContents.send(IPC.libraryRefresh);
  }
}

const writer = new CaptureWriter(
  () => loadSettings().vaultPath,
  (result) => {
    lastSavedAs = result.path;
    // A note still awaiting Ctrl+Enter/close has nothing worth telling the library about
    // yet: it stays filtered out of every listing (see `uncommittedNewPath`), so pushing a
    // refresh here would only make it rescan for no visible change, every 800ms while the
    // user keeps typing.
    if (writer.uncommittedNewPath() === null) notifyLibrary();
    sendStatus({ lastLatencyMs: lastLatency, savedAs: lastSavedAs });
  },
);

async function main(): Promise<void> {
  await app.whenReady();

  if (launch.dumpClipboard !== null) {
    dumpClipboard(launch.dumpClipboard);
    app.exit(0);
    return;
  }

  indexDb = openIndex(join(app.getPath("userData"), "index.sqlite"));

  // Menu bar app: no dock icon, no app switcher entry. The main window in phase 4 will
  // temporarily restore this when it opens.
  if (process.platform === "darwin") app.setActivationPolicy("accessory");

  const selfTestRounds = launch.selfTestRounds;
  const settings = loadSettings();

  installMinimalMenu();
  registerIpc();
  createCaptureWindow();

  // A measurement run leaves the machine as it found it: no login item, no second tray
  // icon next to the one already there, and no fight over the global shortcut with the
  // instance that is already running.
  if (selfTestRounds === 0) {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
    createTray();
    registerHotkey();
  }

  setHideHandler(() => {
    writer.finish();
    lastSavedAs = null;
    // Whether or not there was anything to write, the window has released whatever
    // note it had — including a note it never wrote a byte to, which `writer.finish`'s
    // own refresh (guarded on `written`) would otherwise miss entirely.
    notifyLibrary();
  });

  // Switching away is not closing: write what is there and leave the note open.
  setBlurHandler(() => {
    void writer.flush();
  });

  setBeforeInstall(async () => {
    await writer.flush();
    writer.finish();
  });

  await prepareVault();

  // A measurement run must never touch the network or show a dialog — same reasoning
  // as skipping the tray and hotkey above. The watcher joins that list for a different
  // reason: background fs polling is exactly the kind of unaccounted-for noise the
  // hotkey→caret numbers in `CLAUDE.md` cannot afford to quietly pick up.
  const watchedVault = loadSettings().vaultPath;
  if (selfTestRounds === 0 && watchedVault !== null && indexDb !== null) {
    vaultWatcher = watchVault(watchedVault, indexDb, { onChange: notifyLibrary });
  }

  if (selfTestRounds === 0) maybeCheckForUpdatesOnStartup();

  if (launch.openLibrary) showLibraryWindow();

  if (launch.screenshot !== null) {
    const file = launch.screenshot;
    // Without --library it is the capture window that gets photographed, which is the
    // one whose layout is easiest to break and hardest to notice.
    if (launch.openLibrary) showLibraryWindow();
    else showCaptureWindow();

    setTimeout(() => {
      const target = launch.openLibrary ? getLibraryWindow() : getCaptureWindow();
      void captureWindowTo(target, file, flagNote(), flagButton()).then((ok) => {
        console.log(ok ? `screenshot written to ${file}` : "no window to capture");
        app.exit(ok ? 0 : 1);
      });
    }, 2500);
  }
  if (selfTestRounds > 0) await runSelfTest(selfTestRounds);
}

/**
 * Replaces Electron's default application menu with only the clipboard roles.
 *
 * That default menu is invisible on a frameless window but its accelerators are not:
 * it binds Ctrl+M to Minimise, which is why indenting inside a list minimised the
 * whole window. It also claims Ctrl+R for reload and Ctrl+Shift+I for developer tools.
 * The Edit roles have to stay, because on macOS the menu is what makes Cmd+C and
 * Cmd+V work at all.
 */
function installMinimalMenu(): void {
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === "darwin") {
    template.push({
      label: "emqnote",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          // Deliberately not `role: "quit"`. Cmd+Q is window-scoped here, not an app
          // quit — a user decision, not a platform oversight: from the library window
          // it closes that window (already clean, see `library-window.ts`'s "closed"
          // handler); from the note window it commits and hides it, the same
          // save-and-put-away contract the traffic light and `IPC.captureClose` follow.
          // The resident app keeps running either way — the tray's "Quit emqnote" stays
          // the only true exit. The label matches that tray item on purpose, for muscle
          // memory, even though this one does not quit the process.
          label: "Quit emqnote",
          accelerator: "Command+Q",
          click: () => {
            const focused = BrowserWindow.getFocusedWindow();
            if (focused === getCaptureWindow()) hideCaptureWindow();
            else focused?.close();
          },
        },
      ],
    });
  }

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "selectAll" },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Optional `--open-note=<part of a title>` so a screenshot can show a real note. */
function flagNote(): string | undefined {
  const match = process.argv.find((argument) => argument.startsWith("--open-note="));
  return match?.slice("--open-note=".length);
}

/** Optional `--click-button=<label>` so a dialog can be photographed open. */
function flagButton(): string | undefined {
  const match = process.argv.find((argument) => argument.startsWith("--click-button="));
  return match?.slice("--click-button=".length);
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * At most once a day, well clear of the hotkey → caret budget: this runs after
 * `prepareVault()`, not in the startup path a latency measurement cares about.
 */
function maybeCheckForUpdatesOnStartup(): void {
  const { updateLastCheckedAt } = loadSettings();
  const stale =
    updateLastCheckedAt === null ||
    Date.now() - updateLastCheckedAt > UPDATE_CHECK_INTERVAL_MS;
  if (!stale) return;

  saveSettings({ updateLastCheckedAt: Date.now() });
  void checkForUpdates("startup");
}

function registerHotkey(): void {
  const { hotkey } = loadSettings();

  globalShortcut.unregisterAll();
  const registered = globalShortcut.register(hotkey, () => showCaptureWindow());

  if (!registered) {
    dialog.showMessageBox({
      type: "warning",
      title: "Shortcut unavailable",
      message: `The shortcut ${hotkey} is already taken by another program.`,
      detail:
        "emqnote is running, but you can only open the window from the tray icon. " +
        "Pick a different shortcut in settings.json.",
    });
  }
}

async function prepareVault(): Promise<void> {
  if (loadSettings().vaultPath === null) {
    const chosen = await askForVault();
    if (chosen === null) return;
    adoptVault(chosen);
    buildTrayMenu();
  }

  const vault = loadSettings().vaultPath;
  if (vault === null) return;

  ensureVaultLayout(vault);
  await warnAboutFilesOnDemand(vault);
}

/**
 * Records a deliberately chosen vault.
 *
 * Only from an explicit choice — first run, or the chooser in settings. Never from
 * `loadSettings`, which applies `launch.vaultOverride` *after* the merge, so a
 * `--vault=` run or a self-test would otherwise drop its temporary folder into the
 * remembered list and offer it back as somewhere to keep notes.
 */
function adoptVault(path: string): void {
  saveSettings({ vaultPath: path });
  rememberVault(path);
}

/**
 * Asks where the vault goes.
 *
 * With more than one business OneDrive — two employers, two tenants — there is no good
 * guess, because putting the vault on the wrong tenant means work content in the wrong
 * place. Better to ask once.
 *
 * The one place that knows this wording, for both the people who reach it: first run,
 * and "Choose another folder…" in settings. Two dialogs asking the same question in
 * different words would be two chances to describe the tenant choice badly.
 */
async function askForVault(): Promise<string | null> {
  const candidates = findOneDriveCandidates();

  if (candidates.length > 1) {
    const labels = candidates.map(tenantLabel);
    const answer = await dialog.showMessageBox({
      type: "question",
      title: "Which OneDrive should hold your vault?",
      message: "There is more than one business OneDrive on this machine.",
      detail:
        "Pick the tenant your work notes belong to. The vault goes into a " +
        `'${VAULT_FOLDER_NAME}' folder inside it.`,
      buttons: [...labels, "Choose another folder…"],
      cancelId: labels.length,
      defaultId: 0,
    });

    const picked = candidates[answer.response];
    if (picked !== undefined) return join(picked, VAULT_FOLDER_NAME);
  }

  const choice = await dialog.showOpenDialog({
    title: "Where should your vault go?",
    message: "Pick the folder your notes should live in.",
    defaultPath: candidates[0],
    properties: ["openDirectory", "createDirectory"],
  });

  return choice.canceled ? null : (choice.filePaths[0] ?? null);
}

/**
 * OneDrive's Files On-Demand leaves files behind as empty placeholders. Checking up
 * front is cheaper than a search function that is quietly wrong — but it stays a best
 * guess, so `unknown` is a valid outcome and holds nothing up.
 */
async function warnAboutFilesOnDemand(vault: string): Promise<void> {
  const warned = loadSettings().filesOnDemandWarned;
  if (warned.includes(vault)) return;

  const state = await checkFilesOnDemand(vault);
  if (state !== "ondemand") return;

  await dialog.showMessageBox({
    type: "warning",
    title: "Make the vault always available",
    message: "Your vault is set to Files On-Demand.",
    detail: FILES_ON_DEMAND_INSTRUCTION,
  });

  saveSettings({ filesOnDemandWarned: [...warned, vault] });
}

function registerIpc(): void {
  ipcMain.on(IPC.capturePainted, (_event, token: number) => {
    const elapsed = completeMeasurement(token);
    notifyPainted();
    if (elapsed === null) return;

    lastLatency = elapsed;
    sendStatus({ lastLatencyMs: elapsed, savedAs: lastSavedAs });
    buildTrayMenu();

    if (elapsed > LATENCY_BUDGET_MS) {
      console.warn(
        `[latency] ${elapsed.toFixed(1)} ms — over the ${LATENCY_BUDGET_MS} ms budget`,
      );
    }
  });

  ipcMain.on(IPC.captureChange, (_event, payload: CapturePayload) => {
    writer.update(payload);
  });

  ipcMain.on(IPC.captureClose, () => {
    hideCaptureWindow();
  });

  ipcMain.on(IPC.windowMinimise, () => getCaptureWindow()?.minimize());

  ipcMain.on(IPC.windowToggleMaximise, () => {
    const target = getCaptureWindow();
    if (target === undefined || target === null) return;
    if (target.isMaximized()) target.unmaximize();
    else target.maximize();
  });

  registerLibraryIpc();
  registerAppIpc();
}

/** What a window needs before it can draw: language, platform and the shortcut. */
function registerAppIpc(): void {
  ipcMain.handle(IPC.bootstrap, () => {
    const settings = loadSettings();
    return {
      locale: settings.locale,
      platform: process.platform,
      hotkey: settings.hotkey,
      vaultPath: settings.vaultPath,
    };
  });

  ipcMain.handle(IPC.setLocale, (_event, locale: Locale) => {
    saveSettings({ locale });
    buildTrayMenu();
    for (const target of [getCaptureWindow(), getLibraryWindow()]) {
      if (target !== null && !target.isDestroyed()) {
        target.webContents.send(IPC.libraryRefresh);
      }
    }
  });

  ipcMain.handle(IPC.setHotkey, (_event, hotkey: string) => {
    globalShortcut.unregisterAll();
    const registered = globalShortcut.register(hotkey, () => showCaptureWindow());

    if (!registered) {
      // Put the old one back rather than leaving the app with no shortcut at all.
      globalShortcut.register(loadSettings().hotkey, () => showCaptureWindow());
      return false;
    }

    saveSettings({ hotkey });
    buildTrayMenu();
    return true;
  });
}

/**
 * Everything the library window asks for.
 *
 * Each handler resolves the vault fresh rather than capturing it, so a vault that only
 * became known after startup — first run, where it is chosen while the app is already
 * up — is picked up without special handling. `withVault` also means a missing vault
 * answers with something empty instead of throwing across the IPC boundary.
 *
 * That per-call resolution is *not* a promise that the vault can be changed while the
 * app runs. It cannot: `CaptureWriter`'s session path, `ensureScanned`'s shared promise
 * and the renderer's pending save are all decided once and never revisited. Switching
 * restarts the app, deliberately — B21 has the full list.
 */
function registerLibraryIpc(): void {
  const vaultPath = (): string | null => loadSettings().vaultPath;

  ipcMain.on(IPC.libraryOpen, () => showLibraryWindow());
  ipcMain.on(IPC.captureNew, () => focusCaptureWindow());

  ipcMain.handle(IPC.libraryTree, () => {
    const vault = vaultPath();
    return vault === null
      ? { path: "", name: "Vault", children: [], noteCount: 0 }
      : readFolderTree(vault, writer.uncommittedNewPath() ?? undefined);
  });

  ipcMain.handle(IPC.libraryNotes, async (_event, selection: Selection) => {
    const vault = vaultPath();
    // `indexDb` is only ever null in the sliver of startup before `main` opens it, and
    // in the `--dump-clipboard` exit, which never shows a library window at all.
    return vault === null || indexDb === null
      ? []
      : await notesMatching(vault, indexDb, selection, writer.uncommittedNewPath() ?? undefined);
  });

  ipcMain.handle(IPC.librarySearch, async (_event, query: string) => {
    const vault = vaultPath();
    return vault === null || indexDb === null
      ? []
      : await searchNotes(vault, indexDb, parseSearchQuery(query), {
          excludePath: writer.uncommittedNewPath() ?? undefined,
        });
  });

  ipcMain.handle(IPC.libraryFacets, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null
      ? { tags: [], people: [], available: false }
      : await facets(vault, indexDb, writer.uncommittedNewPath() ?? undefined);
  });

  ipcMain.handle(IPC.libraryConflicts, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null ? [] : await conflicts(vault, indexDb);
  });

  ipcMain.handle(IPC.libraryConflictDiff, (_event, pair: ConflictPair) => {
    const vault = vaultPath();
    return vault === null ? [] : diffConflict(vault, pair);
  });

  ipcMain.handle(
    IPC.libraryResolveConflict,
    (_event, pair: ConflictPair, choice: ConflictChoice) => {
      const vault = vaultPath();
      if (vault === null) return;
      resolveConflict(vault, pair, choice);
      notifyLibrary();
    },
  );

  ipcMain.handle(IPC.libraryOrphanedAttachments, () => {
    const vault = vaultPath();
    return vault === null ? [] : findOrphanedAttachments(vault);
  });

  ipcMain.handle(IPC.libraryAttachmentPreview, (_event, path: string) => {
    const vault = vaultPath();
    return vault === null ? null : attachmentPreview(vault, path);
  });

  ipcMain.handle(IPC.libraryTrashAttachment, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    const trashed = trashAttachment(vault, path);
    notifyLibrary();
    return trashed;
  });

  ipcMain.handle(IPC.libraryOpenNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return null;
    const note = openNote(vault, path);
    // Read-only if the capture window has this exact note claimed — two windows open
    // on one note is fine, two windows writing the same file underneath OneDrive is the
    // failure B10 exists to prevent.
    return note === null ? null : { ...note, editable: writer.activePath() !== path };
  });

  ipcMain.handle(IPC.libraryNoteEditable, (_event, path: string) => {
    return writer.activePath() !== path;
  });

  /**
   * Hands a note to the capture window and brings it to the front.
   *
   * Mirrors `finish()`'s ordering inside `writer.load`: whatever capture was composing
   * is flushed and closed first, so a half-typed note is never abandoned mid-session.
   */
  ipcMain.handle(IPC.captureLoad, async (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return false;
    // A destroyed or missing window cannot be shown, so do not claim the note before
    // finding that out: `writer.load` below marks it as being edited, and until this
    // window is dismissed nothing else — including a retry from the library — can write
    // to it. Claiming it here and then failing to reveal the window would leave the
    // note permanently reported as locked, for real this time, rather than a window that
    // recovers on its own next appearance.
    const target = getCaptureWindow();
    if (target === null || target.isDestroyed()) return false;
    const note = openNote(vault, path);
    if (note === null) return false;

    await writer.load(note);
    focusCaptureWindow();
    getCaptureWindow()?.webContents.send(IPC.captureLoadNote, note);
    notifyLibrary();
    return true;
  });

  ipcMain.handle(IPC.librarySaveNote, (_event, request: SaveNoteRequest) => {
    const vault = vaultPath();
    if (vault === null) return { written: false, path: request.path };
    // The renderer's own `editable` flag is only ever as fresh as the last
    // `library:refresh` round trip (see `notifyLibrary`) — this is the check that
    // actually holds regardless of that staleness: never write under the capture
    // window's own note.
    if (writer.activePath() === request.path)
      return { written: false, path: request.path, locked: true };
    return saveNote(vault, request);
  });

  ipcMain.handle(IPC.libraryMoveNote, (_event, path: string, folder: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    const moved = moveNote(vault, path, folder);
    notifyLibrary();
    return moved;
  });

  ipcMain.handle(IPC.libraryRenameNote, (_event, path: string, title: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    const renamed = renameNote(vault, path, title);
    notifyLibrary();
    return renamed;
  });

  ipcMain.handle(IPC.libraryTrashNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return false;
    // The vault's own _trash folder, not the system one: a OneDrive file sent to the
    // Windows recycle bin is not synced, so it would be gone from the other machine
    // with no way back. _trash travels with the vault.
    trashNote(vault, path);
    notifyLibrary();
    return true;
  });

  ipcMain.handle(IPC.libraryCreateFolder, (_event, parent: string, name: string) => {
    const vault = vaultPath();
    if (vault === null) return parent;
    const created = createFolder(vault, parent, name);
    notifyLibrary();
    return created;
  });

  ipcMain.handle(IPC.listVaults, () =>
    listVaults(knownVaults(), findOneDriveCandidates(), loadSettings().vaultPath),
  );

  ipcMain.handle(IPC.chooseVault, () => askForVault());

  /**
   * Points the app at another vault and restarts it.
   *
   * A restart and not a live switch, and that is B21 rather than laziness — four
   * separate pieces of state are decided once and never revisited:
   *
   *  - `CaptureWriter.session.path` is fixed on the first write, so a half-typed note
   *    would keep landing in the old vault.
   *  - `ensureScanned` collapses concurrent callers onto one `running` promise *without
   *    checking which vault it is for*, so a `facets()` straight after a switch can
   *    await the old vault's scan and read its cache. `invalidate()` exists and has no
   *    callers.
   *  - A pending `saveTimer` in the renderer would write the old note's bytes into the
   *    new vault at the same relative path, with `writeAtomic`'s `mkdirSync` creating
   *    the folder to hold it. Silently.
   *  - `filesOnDemandWarned` — now per vault, precisely so the restart does not land in
   *    a new OneDrive folder with the warning already suppressed.
   *
   * Everything in flight is flushed first. The renderer flushes its own pending save
   * before it calls this.
   */
  ipcMain.handle(IPC.switchVault, async (_event, path: string) => {
    await writer.flush();
    writer.finish();

    adoptVault(path);

    app.relaunch();
    app.quit();
  });

  ipcMain.handle(IPC.libraryRenameFolder, (_event, path: string, name: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    const renamed = renameFolder(vault, path, name);
    notifyLibrary();
    return renamed;
  });

  ipcMain.on(IPC.libraryRevealNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault !== null) shell.showItemInFolder(join(vault, path));
  });
}

app.on("window-all-closed", () => {
  // A resident app keeps running when its window is closed; that is the whole point.
});

// The capture window's own `close` handler now calls `preventDefault()` so the
// traffic-light/Alt+F4 close commits the note and hides the window instead of
// destroying it (see `capture-window.ts`). That would make a real quit — the tray's
// "Quit emqnote", or the OS shutting the app down — hang forever waiting for a close
// that never happens, unless something tells that handler to stand down first.
// `before-quit` fires before Electron starts closing windows, so it is the one place
// early enough to flip the flag before any window's `close` event is even dispatched.
app.on("before-quit", () => {
  setQuitting(true);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void writer.flush();
  // Registered unconditionally, so this can fire before `main` ever opened either of
  // these — the second-instance-lock check quits without calling `main` at all in that
  // path. The watcher closes first, same fire-and-forget style `writer.flush()` above
  // already uses, so it is not still reindexing into a database that just closed under
  // it — not a hard guarantee, just narrowing the race rather than ignoring it.
  if (vaultWatcher !== null) void vaultWatcher.close();
  if (indexDb !== null) closeIndex(indexDb);
});
