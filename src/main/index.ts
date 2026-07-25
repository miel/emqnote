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

// Windows: Roaming AppData kan door een bedrijfsprofiel worden gesynchroniseerd, en
// dat is precies wat we niet willen voor een index en vensterstaat. Moet vóór 'ready'.
if (process.platform === "win32" && process.env.LOCALAPPDATA !== undefined) {
  app.setPath("userData", join(process.env.LOCALAPPDATA, "emqnote"));
}

// Eén residente instantie. Een tweede aanroep opent gewoon het capture-venster.
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

  // Menubalk-app: geen dock-pictogram, geen vensterschakelaar. Het hoofdvenster van
  // fase 4 zet dit tijdelijk terug wanneer het geopend wordt.
  if (process.platform === "darwin") app.setActivationPolicy("accessory");

  const selfTestRounds = Number(process.env.EMQNOTE_SELFTEST ?? "0");
  const settings = loadSettings();

  // Een meetsessie hoort geen opstartitem achter te laten op de machine waarop hij draait.
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
      title: "Sneltoets niet beschikbaar",
      message: `De sneltoets ${hotkey} is al door een ander programma bezet.`,
      detail:
        "emqnote draait wel, maar je kunt het venster alleen via het tray-icoon " +
        "openen. Kies een andere sneltoets in settings.json.",
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
 * Vraagt waar de vault komt.
 *
 * Zijn er meerdere zakelijke OneDrives — twee werkgevers, twee tenants — dan is er
 * geen goede gok, want de vault op de verkeerde tenant zetten betekent werkinhoud op
 * de verkeerde plek. Dan liever één keer vragen.
 */
async function askForVault(): Promise<string | null> {
  const candidates = findOneDriveCandidates();

  if (candidates.length > 1) {
    const labels = candidates.map(tenantLabel);
    const answer = await dialog.showMessageBox({
      type: "question",
      title: "Op welke OneDrive komt je vault?",
      message: "Er staan meerdere zakelijke OneDrives op deze machine.",
      detail:
        "Kies de tenant waar je werknotities horen. De vault komt in een map " +
        `'${VAULT_FOLDER_NAME}' daarbinnen.`,
      buttons: [...labels, "Andere map kiezen…"],
      cancelId: labels.length,
      defaultId: 0,
    });

    const picked = candidates[answer.response];
    if (picked !== undefined) return join(picked, VAULT_FOLDER_NAME);
  }

  const choice = await dialog.showOpenDialog({
    title: "Waar komt je vault?",
    message: "Kies de map waarin je notities moeten komen.",
    defaultPath: candidates[0],
    properties: ["openDirectory", "createDirectory"],
  });

  return choice.canceled ? null : (choice.filePaths[0] ?? null);
}

/**
 * OneDrive's Files On-Demand laat bestanden als lege plaatshouder achter. Een controle
 * vooraf is goedkoper dan een zoekfunctie die er stilletjes naast zit — maar het blijft
 * een beste inschatting, dus `unknown` is een geldige uitkomst en houdt niets tegen.
 */
async function warnAboutFilesOnDemand(vault: string): Promise<void> {
  if (loadSettings().filesOnDemandWarned) return;

  const state = await checkFilesOnDemand(vault);
  if (state !== "ondemand") return;

  await dialog.showMessageBox({
    type: "warning",
    title: "Zet de vault op altijd beschikbaar",
    message: "Je vault staat op Files On-Demand.",
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
        `[latency] ${elapsed.toFixed(1)} ms — boven het budget van ${LATENCY_BUDGET_MS} ms`,
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
  // Een residente app blijft draaien als het venster dicht is; dat ís de opzet.
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void writer.flush();
});
