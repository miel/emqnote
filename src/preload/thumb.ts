import { contextBridge, ipcRenderer } from "electron";
import {
  PDF_THUMB_RENDER,
  PDF_THUMB_RESULT,
  type PdfThumbRenderRequest,
  type PdfThumbResult,
} from "../shared/pdf-thumb-ipc.js";

/**
 * The hidden PDF-render window's own preload (B36) — deliberately separate from
 * `src/preload/index.ts`, the capture/library bridge. This window's only job is to turn
 * bytes nobody has vetted into a PNG, so the smaller its bridge the smaller the surface a
 * malicious PDF has to work with even indirectly: exactly the two channels
 * `pdf-thumb.ts` needs, and nothing else the app can do. `contextIsolation` and the
 * sandbox stay on, same reasoning as every other window.
 *
 * Bundled to CJS by `electron.vite.config.ts` like `src/preload/index.ts` — written as
 * ESM here for the same reason that one is: a sandboxed preload cannot *load* ESM, but
 * the source can still be written that way and transpiled.
 */
contextBridge.exposeInMainWorld("emqnoteThumb", {
  onRender: (handler: (request: PdfThumbRenderRequest) => void) => {
    const listener = (_event: unknown, payload: PdfThumbRenderRequest): void => handler(payload);
    ipcRenderer.on(PDF_THUMB_RENDER, listener);
    return () => ipcRenderer.off(PDF_THUMB_RENDER, listener);
  },
  sendResult: (payload: PdfThumbResult) => ipcRenderer.send(PDF_THUMB_RESULT, payload),
});
