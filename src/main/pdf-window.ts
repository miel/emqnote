import { BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDF_VIEW_OPEN, PDF_VIEW_OPEN_EXTERNALLY } from "../shared/pdf-view-ipc.js";
import { resolveAttachment } from "./attachments.js";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * The PDF viewer window (B40). One window, reused: a second PDF retargets the one that is
 * already open rather than tiling the desktop with viewers, which is the same call the
 * library window makes and for the same reason — this is a resident app with one user.
 *
 * Unlike `pdf-thumb.ts`'s hidden window this one is visible, so it is *not* destroyed on
 * an idle timer; it lives until the user closes it. What the two do share is the shape:
 * created lazily, `current` cleared by the window's own `closed` handler, so a crash
 * costs the next open a fresh window rather than failing forever.
 *
 * `currentName` and `currentVault` are the reason `openExternally` can be argument-less.
 * The renderer never names a file — main resolves whatever it last told this window to
 * show, through the same `resolveAttachment` guard the protocol handlers use, so a
 * malicious PDF cannot turn the escape hatch into "open any path on this machine".
 */

let current: BrowserWindow | null = null;
let currentName: string | null = null;
let currentVault: string | null = null;

ipcMain.on(PDF_VIEW_OPEN_EXTERNALLY, (event) => {
  if (current === null || current.isDestroyed()) return;
  if (event.sender !== current.webContents) return;
  if (currentVault === null || currentName === null) return;

  const resolved = resolveAttachment(currentVault, currentName);
  if (resolved !== null) void shell.openPath(resolved);
});

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 1000,
    show: false,
    // Framed, so on Windows it would otherwise draw the application menu's "Edit" strip
    // above the page — the same bug the library window has. See `library-window.ts`'s
    // copy of this comment and `installMinimalMenu` for why the menu stays at all.
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "../preload/pdfview.cjs"),
      // A PDF is untrusted input — B36's reasoning for the hidden render window applies
      // at least as strongly to the one that renders a whole document interactively.
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (current === win) {
      current = null;
      currentName = null;
      currentVault = null;
    }
  });

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) void win.loadURL(`${devServer}/pdfview.html`);
  else void win.loadFile(join(here, "../renderer/pdfview.html"));

  return win;
}

/**
 * Shows `name` — an attachment target, exactly as the `[[…]]` link spelled it — in the
 * viewer, raising and retargeting the existing window if there is one.
 *
 * A window that has only just been created is still loading, so the message would arrive
 * before anything is listening for it; waiting for `did-finish-load` is what makes the
 * *first* click work rather than only the second. That is the same trap `IPC.openWikiLink`
 * already documents for the library window.
 */
export function openPdfViewer(vault: string, name: string): void {
  currentVault = vault;
  currentName = name;

  if (current === null || current.isDestroyed()) {
    current = createWindow();
  } else {
    if (current.isMinimized()) current.restore();
    current.focus();
  }

  const win = current;
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send(PDF_VIEW_OPEN, { name });
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

/** `will-quit` — the viewer is not something to keep alive past the app. */
export function shutdownPdfViewer(): void {
  if (current !== null && !current.isDestroyed()) current.destroy();
  current = null;
  currentName = null;
  currentVault = null;
}
