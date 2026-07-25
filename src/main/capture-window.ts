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
    // The note window belongs in Alt+Tab. It stays open until dismissed, so treating
    // it as a transient popup that cannot be switched back to was simply wrong.
    skipTaskbar: false,
    // Not always on top. The window stays open until you dismiss it, so pinning it
    // above everything else would mean it permanently covers whatever you switch to.
    alwaysOnTop: false,
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

  // Switching away saves, it does not close.
  //
  // The first version hid the window on blur, and that was wrong: you alt-tab to look
  // something up during a meeting and your notes vanish. A note window stays open
  // until you say otherwise — Outlook's new-message window works exactly this way, and
  // that window is the thing being replaced.
  created.on("blur", () => {
    if (created.isVisible()) onBlur();
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

type Handler = () => void;

let onHide: Handler = () => {};
let onBlur: Handler = () => {};

export function setHideHandler(handler: Handler): void {
  onHide = handler;
}

/** Called when the window loses focus: save what is there, keep the note open. */
export function setBlurHandler(handler: Handler): void {
  onBlur = handler;
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

  // Windows will not let a background process take the foreground on request. Raising
  // the window as always-on-top wins that argument; the flag is dropped again as soon
  // as the window actually has focus, so it does not stay pinned above everything.
  //
  // This used to be cleared on a 250 ms timer, which was worse than it looked: the
  // window is shown far more often than every 250 ms, so a timer from one appearance
  // would fire during the next and fight it. That is the most likely explanation for
  // the one 814 ms outlier in an otherwise flat run of fifty. An event beats a guess.
  if (!target.isVisible()) {
    target.setAlwaysOnTop(true);
    target.once("focus", () => {
      if (!target.isDestroyed()) target.setAlwaysOnTop(false);
    });
    target.show();
    target.moveTop();
  }

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
