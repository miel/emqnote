import { app, dialog, globalShortcut, ipcMain, Menu, shell } from "electron";
import { join } from "node:path";
import { IPC, type CapturePayload } from "../shared/ipc.js";
import { knownAttendees, rememberAttendees } from "./attendees.js";
import { CaptureWriter } from "./capture-store.js";
import {
  createCaptureWindow,
  getCaptureWindow,
  hideCaptureWindow,
  sendStatus,
  setBlurHandler,
  setHideHandler,
  showCaptureWindow,
} from "./capture-window.js";
import { completeMeasurement, LATENCY_BUDGET_MS } from "./latency.js";
import { notifyPainted, runSelfTest } from "./selftest.js";
import {
  captureLibraryWindow,
  getLibraryWindow,
  showLibraryWindow,
} from "./library-window.js";
import { readLaunchOptions } from "./launch-options.js";
import { loadSettings, saveSettings } from "./settings.js";
import { buildTrayMenu, createTray } from "./tray.js";
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
  moveNote,
  openNote,
  readFolderTree,
  readNotesIn,
  renameNote,
  saveNote,
  trashNote,
} from "./vault-io.js";
import type { SaveNoteRequest } from "../shared/vault-types.js";
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
// Windows. It runs on its own vault and exits when done.
if (launch.selfTestRounds === 0 && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (launch.selfTestRounds === 0) {
    app.on("second-instance", () => showCaptureWindow());
  }
  void main();
}

let lastLatency: number | null = null;
let lastSavedAs: string | null = null;

const writer = new CaptureWriter(
  () => loadSettings().vaultPath,
  (result) => {
    lastSavedAs = result.path;
    rememberAttendees(result.attendees);
    const library = getLibraryWindow();
    if (library !== null && !library.isDestroyed()) {
      library.webContents.send(IPC.libraryRefresh);
    }
    sendStatus({ lastLatencyMs: lastLatency, savedAs: lastSavedAs });
  },
);

async function main(): Promise<void> {
  await app.whenReady();

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
  });

  // Switching away is not closing: write what is there and leave the note open.
  setBlurHandler(() => {
    void writer.flush();
  });

  await prepareVault();

  if (launch.openLibrary || launch.screenshot !== null) showLibraryWindow();

  if (launch.screenshot !== null) {
    const file = launch.screenshot;
    setTimeout(() => {
      void captureLibraryWindow(file, flagNote(), flagButton()).then((ok) => {
        console.log(ok ? `screenshot written to ${file}` : "no library window to capture");
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
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
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
      },
    ]),
  );
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
    saveSettings({ vaultPath: chosen });
    buildTrayMenu();
  }

  const vault = loadSettings().vaultPath;
  if (vault === null) return;

  ensureVaultLayout(vault);
  await warnAboutFilesOnDemand(vault);
}

/**
 * Asks where the vault goes.
 *
 * With more than one business OneDrive — two employers, two tenants — there is no good
 * guess, because putting the vault on the wrong tenant means work content in the wrong
 * place. Better to ask once.
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
  if (loadSettings().filesOnDemandWarned) return;

  const state = await checkFilesOnDemand(vault);
  if (state !== "ondemand") return;

  await dialog.showMessageBox({
    type: "warning",
    title: "Make the vault always available",
    message: "Your vault is set to Files On-Demand.",
    detail: FILES_ON_DEMAND_INSTRUCTION,
  });

  saveSettings({ filesOnDemandWarned: true });
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

  ipcMain.handle(IPC.attendeesList, () => knownAttendees());

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
 * Each handler resolves the vault fresh rather than capturing it, so changing the vault
 * in settings takes effect without a restart. `withVault` also means a missing vault
 * answers with something empty instead of throwing across the IPC boundary.
 */
function registerLibraryIpc(): void {
  const vaultPath = (): string | null => loadSettings().vaultPath;

  const notifyLibrary = (): void => {
    const target = getLibraryWindow();
    if (target !== null && !target.isDestroyed()) {
      target.webContents.send(IPC.libraryRefresh);
    }
  };

  ipcMain.on(IPC.libraryOpen, () => showLibraryWindow());

  ipcMain.handle(IPC.libraryTree, () => {
    const vault = vaultPath();
    return vault === null
      ? { path: "", name: "Vault", children: [], noteCount: 0 }
      : readFolderTree(vault);
  });

  ipcMain.handle(IPC.libraryNotes, (_event, folder: string) => {
    const vault = vaultPath();
    return vault === null ? [] : readNotesIn(vault, folder);
  });

  ipcMain.handle(IPC.libraryOpenNote, (_event, path: string) => {
    const vault = vaultPath();
    return vault === null ? null : openNote(vault, path);
  });

  ipcMain.handle(IPC.librarySaveNote, (_event, request: SaveNoteRequest) => {
    const vault = vaultPath();
    if (vault === null) return { written: false, path: request.path };
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

  ipcMain.on(IPC.libraryRevealNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault !== null) shell.showItemInFolder(join(vault, path));
  });
}

app.on("window-all-closed", () => {
  // A resident app keeps running when its window is closed; that is the whole point.
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void writer.flush();
});
