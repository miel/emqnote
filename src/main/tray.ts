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
import { drawGlyph, rgbaToBgra } from "../shared/glyph.js";
import type { VaultLocation } from "../shared/vault-types.js";
import { describeStats } from "./latency.js";
import { loadSettings, saveSettings } from "./settings.js";
import { showCaptureWindow } from "./capture-window.js";
import { showLibraryWindow } from "./library-window.js";
import { checkForUpdates } from "./updater.js";
import { applyLoginItem } from "./login-item.js";
import { vaultMenuEntries } from "./vault-menu.js";

let tray: Tray | null = null;

/**
 * What the tray needs from `index.ts` to open another vault, handed in rather than
 * imported: `askForVault` and `switchVaultTo` live there, and there is where the tray
 * itself is created — importing back would be a cycle. The first three already existed
 * for the settings panel.
 */
export interface TrayActions {
  /** Every vault this machine knows about, current one first. */
  list: () => VaultLocation[];
  /** The folder picker, with the tenant question in front of it where that applies. */
  choose: () => Promise<string | null>;
  /** Flushes everything in flight, points the app at `path` and restarts (B21). */
  switchTo: (path: string) => Promise<void>;
  /**
   * `notifySettingsChanged` from `index.ts` — raised when the tray changes a value a
   * window is drawing (B100).
   *
   * "Start at login" is in the Settings panel now as well as here, and the two are showing
   * one value. Without this the tray's click saved it, applied it and redrew its own
   * checkbox while an open panel went on showing the old answer until it was closed and
   * reopened.
   */
  notifyChanged: () => void;
}

let vaultActions: TrayActions | null = null;

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
        // The accelerator is drawn here and registered elsewhere — `registerGlobalHotkeys`
        // in `index.ts`, exactly as the row above. This row deliberately carried none for
        // a long time, on the argument that a machine-wide claim was too much for a
        // once-in-a-while action; B60 reverses that, since from any window other than the
        // capture one there was no way to reach the library at all.
        label: "Browse notes…",
        accelerator: settings.libraryHotkey,
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
          // Through `applyLoginItem`, never `setLoginItemSettings` directly: the entry
          // carries `--login`, and that is the only thing telling a sign-in start apart
          // from a double-click (B61).
          applyLoginItem(item.checked);
          buildTrayMenu();
          // The Settings panel shows this too now (B100), and it is one value.
          vaultActions?.notifyChanged();
        },
      },
      {
        label: "Check for updates…",
        click: () => void checkForUpdates("manual"),
      },
      { type: "separator" },
      { label: describeStats(), enabled: false },
      {
        label: "Open latency log",
        click: () => void shell.openPath(app.getPath("userData")),
      },
      { type: "separator" },
      { label: `emqnote ${app.getVersion()}`, enabled: false },
      { label: "Quit emqnote", click: () => app.quit() },
    ]),
  );
}

export function createTray(actions: TrayActions): Tray {
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
