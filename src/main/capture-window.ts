import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC, type ShowPayload, type StatusPayload } from "../shared/ipc.js";
import { beginMeasurement } from "./latency.js";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * Het capture-venster wordt bij het starten aangemaakt en gerenderd, en daarna
 * verborgen gehouden in plaats van vernietigd.
 *
 * Dat is de hele truc achter "near-instant": de hotkey doet niets anders dan `show()`
 * en `focus()`. Er wordt niets geladen, niets opgebouwd, niets gescand. Precies wat
 * Outlook feitelijk ook doet — dat venster is er alleen maar snel omdat het programma
 * al draait.
 */

let window: BrowserWindow | null = null;

export function createCaptureWindow(): BrowserWindow {
  const created = new BrowserWindow({
    width: 720,
    height: 440,
    show: false,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "emqnote",
    backgroundColor: "#1e1f22",
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      // Chromium zet verborgen vensters in slaapstand. Dat is precies verkeerd voor
      // een venster dat alleen bestaat om onmiddellijk te kunnen verschijnen.
      backgroundThrottling: false,
    },
  });

  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Klikken buiten het venster is hetzelfde als sluiten: opslaan en wegwezen.
  created.on("blur", () => {
    if (created.isVisible()) hideCaptureWindow();
  });

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) {
    void created.loadURL(devServer);
  } else {
    void created.loadFile(join(here, "../renderer/index.html"));
  }

  window = created;
  return created;
}

export function getCaptureWindow(): BrowserWindow | null {
  return window;
}

type HideHandler = () => void;
let onHide: HideHandler = () => {};

export function setHideHandler(handler: HideHandler): void {
  onHide = handler;
}

/**
 * Toont het venster en start de meting.
 *
 * De volgorde is bewust: eerst het venster naar voren, dan pas het bericht naar de
 * renderer. Op Windows mag een achtergrondproces de voorgrond niet zomaar overnemen;
 * omdat de aanroep uit een global shortcut komt staat het OS het meestal wel toe, en
 * `moveTop` dekt de gevallen waarin het toch tegenstribbelt af.
 */
export function showCaptureWindow(): void {
  const target = window;
  if (target === null || target.isDestroyed()) return;

  const token = beginMeasurement();

  if (process.platform === "darwin") {
    // Een menubalk-app heeft geen dock-pictogram en krijgt daardoor niet vanzelf
    // toetsenbordfocus.
    app.focus({ steal: true });
  }

  target.show();
  target.moveTop();
  target.focus();

  target.webContents.send(IPC.captureShow, { token } satisfies ShowPayload);
}

export function hideCaptureWindow(): void {
  const target = window;
  if (target === null || target.isDestroyed() || !target.isVisible()) return;

  target.hide();
  onHide();
  target.webContents.send(IPC.captureReset);
}

export function sendStatus(status: StatusPayload): void {
  const target = window;
  if (target === null || target.isDestroyed()) return;
  target.webContents.send(IPC.captureStatus, status);
}
