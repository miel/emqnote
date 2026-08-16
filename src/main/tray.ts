import {
  app,
  dialog,
  Menu,
  nativeImage,
  shell,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";
import { writeFile } from "node:fs/promises";
import { arch, release } from "node:os";
import { drawGlyph, rgbaToBgra } from "../shared/glyph.js";
import type { VaultLocation } from "../shared/vault-types.js";
import { stats } from "./latency.js";
import { clearProfiling, profilingReport, profilingSummary } from "./profiling.js";
import { loadSettings, saveSettings } from "./settings.js";
import { showCaptureWindow } from "./capture-window.js";
import { showLibraryWindow } from "./library-window.js";
import { checkForUpdates } from "./updater.js";
import { vaultMenuEntries } from "./vault-menu.js";

let tray: Tray | null = null;

/**
 * What the tray needs from `index.ts` to open another vault, handed in rather than
 * imported: `askForVault` and `switchVaultTo` live there, and there is where the tray
 * itself is created — importing back would be a cycle. Three functions, all of which
 * already existed for the settings panel.
 */
export interface VaultActions {
  /** Every vault this machine knows about, current one first. */
  list: () => VaultLocation[];
  /** The folder picker, with the tenant question in front of it where that applies. */
  choose: () => Promise<string | null>;
  /** Flushes everything in flight, points the app at `path` and restarts (B21). */
  switchTo: (path: string) => Promise<void>;
}

let vaultActions: VaultActions | null = null;

function summaryText(): string {
  const summary = profilingSummary(stats());
  const duration = `${Math.round(summary.activeDurationMs / 1000)} s`;
  const loop = summary.eventLoopDelay === null ? "not sampled yet" : `p50 ${summary.eventLoopDelay.p50} ms, p95 ${summary.eventLoopDelay.p95} ms, max ${summary.eventLoopDelay.max} ms`;
  const memory = summary.resource === null ? "not sampled yet" : `CPU ${summary.resource.cpuPercent}%, memory ${Math.round(summary.resource.rssBytes / 1024 / 1024)} MB`;
  const capture = summary.captureLatency.count ? `p50 ${summary.captureLatency.p50.toFixed(0)} ms, p95 ${summary.captureLatency.p95.toFixed(0)} ms, max ${summary.captureLatency.max.toFixed(0)} ms` : "not measured";
  const slow = summary.slowest.map((item) => `${item.operation}: ${item.max.toFixed(0)} ms (${item.count}x)`).join("\n") || "none";
  return `Recording: ${summary.enabled ? "on" : "paused"}\nActive duration: ${duration}\nEvent-loop delay: ${loop}\n${memory}\nCapture latency: ${capture}\nEvents: ${summary.retainedEvents} retained, ${summary.droppedEvents} dropped\nRecent failures: ${summary.recentFailures.length}\n\nSlowest operations:\n${slow}`;
}

async function showProfilingInformation(): Promise<void> {
  const choice = await dialog.showMessageBox({ type: "info", title: "Profiling / debug information", message: "Session-only local diagnostics", detail: summaryText(), buttons: ["Export JSON…", "Clear data", "Close"], defaultId: 2, cancelId: 2 });
  if (choice.response === 1) { clearProfiling(); buildTrayMenu(); return; }
  if (choice.response !== 0) return;
  const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
  const save = await dialog.showSaveDialog({ title: "Export profiling information", defaultPath: `emqnote-profiling-${stamp}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (save.canceled || !save.filePath) return;
  try {
    const report = profilingReport({ app: { version: app.getVersion(), electron: process.versions.electron ?? "unknown", node: process.versions.node }, system: { platform: process.platform, release: release(), arch: arch() } }, stats());
    await writeFile(save.filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch (error) {
    await dialog.showMessageBox({ type: "error", title: "Could not export profiling information", message: error instanceof Error ? error.message : "Unknown write error" });
  }
}

/**
 * The tray icon is computed rather than loaded from a file. See `src/shared/glyph.ts`
 * for why: one shape that stays crisp at 16, 22 and 32 pixels and adapts to a light or
 * dark menu bar on macOS is easier to compute than to maintain.
 */
function trayIcon(): NativeImage {
  const template = process.platform === "darwin";
  const size = template ? 22 : 16;
  const color = template ? { r: 0, g: 0, b: 0 } : { r: 235, g: 236, b: 240 };

  const image = nativeImage.createFromBitmap(rgbaToBgra(drawGlyph(size * 2, color)), {
    width: size * 2,
    height: size * 2,
    scaleFactor: 2,
  });

  if (template) image.setTemplateImage(true);
  return image;
}

/**
 * Confirms, then restarts into the chosen vault.
 *
 * The settings panel asks too (`Settings.tsx`'s `confirming` step) and this asks for a
 * stronger reason: that one is reached by opening Settings and picking a row, this one by
 * a single click two items down a menu whose neighbours are harmless. The restart is not
 * optional — see `switchVaultTo` — so it has to be said out loud before it happens.
 */
async function confirmAndSwitch(path: string): Promise<void> {
  if (vaultActions === null) return;

  const answer = await dialog.showMessageBox({
    type: "question",
    title: "Open another vault",
    message: "emqnote restarts to open another vault.",
    detail: `Everything is saved first.\n\n${path}`,
    buttons: ["Restart", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });

  if (answer.response === 0) await vaultActions.switchTo(path);
}

/**
 * The vault item, which is a submenu since 14 August 2026.
 *
 * What it *contains* is `vault-menu.ts`, which knows no Electron and so can be checked by
 * a test; this hangs a click on each row and nothing else. The rows come from the same
 * `listVaults` the settings panel lists, so the two routes can never come to know about
 * different vaults.
 */
function vaultSubmenu(vault: string | null): MenuItemConstructorOptions[] {
  const known = vaultActions === null ? [] : vaultActions.list();

  return vaultMenuEntries(vault, known).map((entry): MenuItemConstructorOptions => {
    switch (entry.kind) {
      case "separator":
        return { type: "separator" };
      case "reveal":
        return {
          label: entry.label,
          enabled: entry.enabled,
          click: () => {
            if (vault !== null) void shell.openPath(vault);
          },
        };
      case "vault":
        return {
          label: entry.label,
          type: "radio",
          checked: entry.current,
          enabled: entry.enabled,
          click: () => void confirmAndSwitch(entry.path),
        };
      case "choose":
        return {
          label: entry.label,
          click: () => {
            void vaultActions?.choose().then((picked) => {
              if (picked !== null && picked !== vault) void confirmAndSwitch(picked);
            });
          },
        };
    }
  });
}

export function buildTrayMenu(): void {
  if (tray === null) return;

  const settings = loadSettings();
  const vault = settings.vaultPath;

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "New note",
        accelerator: settings.hotkey,
        click: () => showCaptureWindow(),
      },
      {
        // No accelerator here. An accelerator in a tray menu is drawn but never
        // registered, so the menu promised a Cmd+Shift+E that did nothing — and making
        // it real would have claimed a machine-wide shortcut for a once-in-a-while
        // action. Browsing is reachable from here and from Mod+O in the capture window.
        label: "Browse notes…",
        click: () => showLibraryWindow(),
      },
      { type: "separator" },
      {
        label: vault === null ? "No vault found" : `Vault: ${vault}`,
        submenu: vaultSubmenu(vault),
      },
      {
        label: "Start at login",
        type: "checkbox",
        checked: settings.openAtLogin,
        click: (item) => {
          saveSettings({ openAtLogin: item.checked });
          app.setLoginItemSettings({ openAtLogin: item.checked });
          buildTrayMenu();
        },
      },
      {
        label: "Check for updates…",
        click: () => void checkForUpdates("manual"),
      },
      { type: "separator" },
      {
        label: "Profiling / debug information…",
        click: () => void showProfilingInformation(),
      },
      { type: "separator" },
      { label: `emqnote ${app.getVersion()}`, enabled: false },
      { label: "Quit emqnote", click: () => app.quit() },
    ]),
  );
}

export function createTray(actions: VaultActions): Tray {
  vaultActions = actions;
  tray = new Tray(trayIcon());
  tray.setToolTip("emqnote");
  buildTrayMenu();

  // On Windows, left-clicking a tray icon is the expected way to open something; on
  // macOS a left click opens the menu, so not there.
  if (process.platform === "win32") {
    tray.on("click", () => showCaptureWindow());
  }

  return tray;
}
