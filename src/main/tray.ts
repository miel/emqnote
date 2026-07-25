import { app, Menu, nativeImage, shell, Tray, type NativeImage } from "electron";
import { drawGlyph, rgbaToBgra } from "../shared/glyph.js";
import { describeStats } from "./latency.js";
import { loadSettings, saveSettings } from "./settings.js";
import { showCaptureWindow } from "./capture-window.js";

let tray: Tray | null = null;

/**
 * Het tray-icoon wordt berekend in plaats van uit een bestand geladen. Zie
 * `src/shared/glyph.ts` voor waarom: één vorm die op 16, 22 en 32 pixels scherp is en
 * op macOS meekleurt met de menubalk, is eenvoudiger te berekenen dan te beheren.
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
        label: "Nieuwe notitie",
        accelerator: settings.hotkey,
        click: () => showCaptureWindow(),
      },
      { type: "separator" },
      {
        label: vault === null ? "Geen vault gevonden" : `Vault: ${vault}`,
        enabled: vault !== null,
        click: () => {
          if (vault !== null) void shell.openPath(vault);
        },
      },
      {
        label: "Starten bij inloggen",
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
        label: "Latency-log openen",
        click: () => void shell.openPath(app.getPath("userData")),
      },
      { type: "separator" },
      { label: "emqnote afsluiten", click: () => app.quit() },
    ]),
  );
}

export function createTray(): Tray {
  tray = new Tray(trayIcon());
  tray.setToolTip("emqnote");
  buildTrayMenu();

  // Op Windows is links klikken op een tray-icoon de verwachte manier om iets te
  // openen; op macOS opent links klikken het menu, dus daar niet.
  if (process.platform === "win32") {
    tray.on("click", () => showCaptureWindow());
  }

  return tray;
}
