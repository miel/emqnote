import { app, Menu, nativeImage, shell, Tray, type NativeImage } from "electron";
import { drawGlyph, rgbaToBgra } from "../shared/glyph.js";
import { describeStats } from "./latency.js";
import { loadSettings, saveSettings } from "./settings.js";
import { showCaptureWindow } from "./capture-window.js";
import { showLibraryWindow } from "./library-window.js";

let tray: Tray | null = null;

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
        enabled: vault !== null,
        click: () => {
          if (vault !== null) void shell.openPath(vault);
        },
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
      { type: "separator" },
      { label: describeStats(), enabled: false },
      {
        label: "Open latency log",
        click: () => void shell.openPath(app.getPath("userData")),
      },
      { type: "separator" },
      { label: "Quit emqnote", click: () => app.quit() },
    ]),
  );
}

export function createTray(): Tray {
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
