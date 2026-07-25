import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC, type ShowPayload, type StatusPayload } from "../shared/ipc.js";
import { beginMeasurement } from "./latency.js";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * The capture window is created and rendered at startup, then kept hidden rather than
 * destroyed.
 *
 * That is the whole trick behind "near-instant": the hotkey does nothing but `show()`
 * and `focus()`. Nothing is loaded, nothing is built, nothing is scanned. It is what
 * Outlook effectively does too — that window is only fast because the program is
 * already running.
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
      // Chromium puts hidden windows to sleep. That is exactly wrong for a window
      // whose only purpose is to appear instantly.
      backgroundThrottling: false,
    },
  });

  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Clicking outside the window means the same as closing it: save and get out of the way.
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
 * Shows the window and starts the measurement.
 *
 * The order is deliberate: window to the front first, only then the message to the
 * renderer. On Windows a background process may not simply take the foreground;
 * because the call originates from a global shortcut the OS usually permits it, and
 * `moveTop` covers the cases where it still resists.
 */
export function showCaptureWindow(): void {
  const target = window;
  if (target === null || target.isDestroyed()) return;

  const token = beginMeasurement();

  if (process.platform === "darwin") {
    // A menu bar app has no dock icon and therefore does not receive keyboard focus
    // on its own.
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
