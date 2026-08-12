import { contextBridge, ipcRenderer } from "electron";
import {
  PDF_VIEW_OPEN,
  PDF_VIEW_OPEN_EXTERNALLY,
  type PdfViewTarget,
} from "../shared/pdf-view-ipc.js";

/**
 * The viewer window's bridge (B40) — the third preload, and deliberately not the
 * `emqnote` one. Same reasoning as `thumb.ts`: this window's whole job is to parse bytes
 * nobody has vetted, so it gets two channels and no way to read a note, write a file or
 * name a path.
 *
 * `openExternally` takes no argument on purpose. Main tracks which attachment this window
 * was told to show and resolves it through `resolveAttachment` itself, so the worst a
 * compromised page can do here is ask the OS to open the very file it is already looking
 * at.
 *
 * Bundled to CJS by `electron.vite.config.ts`, same as the other two.
 */
contextBridge.exposeInMainWorld("emqnotePdfView", {
  onOpen: (handler: (target: PdfViewTarget) => void) => {
    const listener = (_event: unknown, payload: PdfViewTarget): void => handler(payload);
    ipcRenderer.on(PDF_VIEW_OPEN, listener);
    return () => ipcRenderer.off(PDF_VIEW_OPEN, listener);
  },
  openExternally: () => ipcRenderer.send(PDF_VIEW_OPEN_EXTERNALLY),
});
