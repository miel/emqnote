import { app, dialog, globalShortcut, ipcMain } from "electron";
import { join } from "node:path";
import { IPC } from "../shared/ipc.js";
import { CaptureWriter } from "./capture-store.js";
import {
  createCaptureWindow,
  hideCaptureWindow,
  sendStatus,
  setHideHandler,
  showCaptureWindow,
} from "./capture-window.js";
import { completeMeasurement, LATENCY_BUDGET_MS } from "./latency.js";
import { notifyPainted, runSelfTest } from "./selftest.js";
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

// Windows: Roaming AppData can be synchronised by a corporate profile, which is exactly
// what we do not want for an index and window state. Must happen before 'ready'.
if (process.platform === "win32" && process.env.LOCALAPPDATA !== undefined) {
  app.setPath("userData", join(process.env.LOCALAPPDATA, "emqnote"));
}

// One resident instance. A second launch simply opens the capture window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showCaptureWindow());
  void main();
}

let lastLatency: number | null = null;
let lastSavedAs: string | null = null;

const writer = new CaptureWriter(
  () => loadSettings().vaultPath,
  (result) => {
    lastSavedAs = result.path;
    sendStatus({ lastLatencyMs: lastLatency, savedAs: lastSavedAs });
  },
);

async function main(): Promise<void> {
  await app.whenReady();

  // Menu bar app: no dock icon, no app switcher entry. The main window in phase 4 will
  // temporarily restore this when it opens.
  if (process.platform === "darwin") app.setActivationPolicy("accessory");

  const selfTestRounds = Number(process.env.EMQNOTE_SELFTEST ?? "0");
  const settings = loadSettings();

  // A measurement run has no business leaving a login item on the machine it runs on.
  if (selfTestRounds === 0) {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
  }

  registerIpc();
  createCaptureWindow();
  createTray();
  registerHotkey();

  setHideHandler(() => {
    void writer.flush().then(() => {
      writer.reset();
      lastSavedAs = null;
    });
  });

  await prepareVault();

  if (selfTestRounds > 0) await runSelfTest(selfTestRounds);
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

  ipcMain.on(IPC.captureChange, (_event, text: string) => {
    writer.update(text);
  });

  ipcMain.on(IPC.captureClose, () => {
    hideCaptureWindow();
  });
}

app.on("window-all-closed", () => {
  // A resident app keeps running when its window is closed; that is the whole point.
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void writer.flush();
});
