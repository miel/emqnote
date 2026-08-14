import { BrowserWindow, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PDF_THUMB_RENDER,
  PDF_THUMB_RESULT,
  type PdfThumbResult,
} from "../shared/pdf-thumb-ipc.js";
import { boxFor, type ThumbVariant } from "./thumbnail-cache.js";
import { PdfThumbQueue } from "./pdf-thumb-queue.js";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * Owns the hidden window that draws a PDF's first page (B36) — the replacement for
 * `nativeImage.createThumbnailFromPath`, which was never observed to produce anything on
 * the hardware that reported "PDF preview is not showing" (see `thumbnails.ts`'s own
 * history of that report). pdf.js needs a real `CanvasRenderingContext2D`; Chromium's own
 * renderer process already has one, so a hidden `BrowserWindow` draws the page in its
 * *own* process rather than pulling in a native canvas binding (`@napi-rs/canvas`, which
 * would mean a new `package.json` `dependencies` entry, a `check:bundle` allowlist entry,
 * and native-module packaging risk on two platforms — see `CLAUDE.md`'s note on why that
 * list stays minimal). The 80 ms hotkey budget on the main thread is untouched either
 * way: this window does its work entirely off that thread, in a process of its own.
 *
 * Created lazily on first request and destroyed after `PdfThumbQueue`'s idle timeout —
 * a resident app that never opens a note with a PDF in it should never carry the memory
 * of a renderer process for one. "Respawn on unexpected close" is not special-cased
 * logic: `ensureWindow` recreates whenever `current` is null or destroyed, and the
 * window's own `closed` handler is what clears `current`, so the very next request after
 * a crash just pays the cost of a fresh window instead of failing forever.
 */

interface ThumbWindow {
  window: BrowserWindow;
  /** Resolves once the page has loaded and its `onRender` listener is live. */
  ready: Promise<void>;
}

let current: ThumbWindow | null = null;
let nextRequestId = 1;

/** One page, plus how many the document turned out to have. See `pdf-thumb-ipc.ts`. */
export interface RenderedPage {
  png: Buffer;
  pages: number;
}

interface Pending {
  id: number;
  resolve: (page: RenderedPage) => void;
  reject: (error: Error) => void;
}

let pending: Pending | null = null;

function settlePending(fn: (entry: Pending) => void): void {
  if (pending === null) return;
  const entry = pending;
  pending = null;
  fn(entry);
}

// Registered once, not per-window: `current` always points at whichever window is live,
// so a listener left over from a destroyed-and-respawned window is never mistaken for
// the current one — the `event.sender` check below is what makes that safe.
ipcMain.on(PDF_THUMB_RESULT, (event, result: PdfThumbResult) => {
  if (current === null || event.sender !== current.window.webContents) return;
  if (pending === null || pending.id !== result.id) return; // stale — already timed out

  settlePending((entry) => {
    if (result.ok) entry.resolve({ png: Buffer.from(result.png), pages: result.pages });
    else entry.reject(new Error(result.error));
  });
});

function createWindow(): ThumbWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 500,
    show: false,
    webPreferences: {
      preload: join(here, "../preload/thumb.cjs"),
      // A PDF is untrusted input, the same threat class as a pasted page's HTML — no
      // node integration, sandbox and context isolation both stay on, same as every
      // other window in this app.
      contextIsolation: true,
      sandbox: true,
    },
  });

  const ready = new Promise<void>((resolve) => {
    win.webContents.once("did-finish-load", () => resolve());
  });

  win.on("closed", () => {
    if (current?.window === win) current = null;
    settlePending((entry) => entry.reject(new Error("the PDF render window closed unexpectedly")));
  });

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) void win.loadURL(`${devServer}/thumb.html`);
  else void win.loadFile(join(here, "../renderer/thumb.html"));

  return { window: win, ready };
}

function ensureWindow(): ThumbWindow {
  if (current !== null && !current.window.isDestroyed()) return current;
  current = createWindow();
  return current;
}

async function renderOnce(request: {
  bytes: Uint8Array;
  variant: ThumbVariant;
  page: number;
}): Promise<RenderedPage> {
  const thumb = ensureWindow();
  await thumb.ready;

  const id = nextRequestId;
  nextRequestId += 1;
  const box = boxFor(request.variant);

  return new Promise<RenderedPage>((resolve, reject) => {
    pending = { id, resolve, reject };
    thumb.window.webContents.send(PDF_THUMB_RENDER, {
      id,
      bytes: request.bytes,
      maxWidth: box.width,
      maxHeight: box.height,
      // Only the inline page (B43) fills its box — see `PdfThumbRenderRequest`.
      allowUpscale: request.variant === "page",
      page: request.page,
    });
  });
}

/** `PdfThumbQueue`'s `onIdle` — nothing has asked for a render in a while, so let it go. */
function destroyIdleWindow(): void {
  if (current === null) return;
  const { window: win } = current;
  current = null;
  if (!win.isDestroyed()) win.destroy();
}

const queue = new PdfThumbQueue(renderOnce, destroyIdleWindow);

/**
 * Reads `realPath` and renders page `page` (1-based, the first by default) as a PNG sized
 * to fit the box `variant` names (`thumbnail-cache.ts`'s `THUMBNAIL_SIZE` for a chip, `PAGE_SIZE` for B43's inline
 * embed), preserving aspect ratio. The queue is shared between the two on purpose: one
 * render window, one slot, so opening a note full of PDFs cannot fan out into a dozen
 * simultaneous renders whichever size they are. Rejects rather
 * than returning null, so `ensureThumbnail` can tell "nothing to preview" (the file
 * itself could not even be read) apart from "resolved, but pdf.js could not draw a page
 * from it" and answer 404 vs 422 accordingly.
 */
export async function renderPdfThumbnail(
  realPath: string,
  variant: ThumbVariant = "chip",
  page = 1,
): Promise<RenderedPage> {
  const bytes = await readFile(realPath);
  return queue.request({ bytes, variant, page });
}

/** `will-quit` — nothing left to render once the app is on its way out. */
export function shutdownPdfThumb(): void {
  settlePending((entry) => entry.reject(new Error("app is quitting")));
  if (current !== null && !current.window.isDestroyed()) current.window.destroy();
  current = null;
}
