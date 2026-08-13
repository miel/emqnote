import * as pdfjsLib from "pdfjs-dist";
// Vite's `?url` suffix resolves to the built, hashed URL of this file rather than
// inlining it — pdf.js's parsing runs on a real Worker, not the hidden window's own main
// thread, and a Worker needs a URL to construct itself from. Same-origin under this
// page's `default-src 'self'` CSP: the worker file lands in the same output directory as
// this bundle, and `worker-src` falls back to `default-src` when it is not set
// separately, so no CSP change is needed beyond the one line in `thumb.html`.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { fitScale } from "../shared/pdf-fit.js";

/**
 * The renderer half of B36's PDF-thumbnail pipeline. `pdf-thumb.ts` owns the window and
 * the IPC plumbing; this script is the one thing that actually needs a browser: pdf.js
 * requires a real `CanvasRenderingContext2D` to draw into, which is the entire reason
 * this runs in a hidden `BrowserWindow` instead of on the main process.
 *
 * One request in flight at a time is `PdfThumbQueue`'s guarantee, not this file's — it
 * just answers whatever `onRender` hands it, in order, and trusts the queue not to
 * overlap two.
 */

declare global {
  interface Window {
    emqnoteThumb: {
      onRender: (handler: (request: PdfThumbRenderRequest) => void) => () => void;
      sendResult: (payload: PdfThumbResult) => void;
    };
  }
}

interface PdfThumbRenderRequest {
  id: number;
  bytes: Uint8Array;
  maxWidth: number;
  maxHeight: number;
  /** B43: the inline page render fills its box, a chip never magnifies. See `pdf-fit.ts`. */
  allowUpscale?: boolean;
}

type PdfThumbResult =
  | { id: number; ok: true; png: Uint8Array }
  | { id: number; ok: false; error: string };

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function renderFirstPage(request: PdfThumbRenderRequest): Promise<Uint8Array> {
  // No standard-font or CMap data bundled — this is a small preview image, not a
  // faithful render, and a PDF using only the 14 standard fonts (the common case for an
  // exported document) still renders legibly without them. Worth revisiting if a
  // real-world PDF turns up that needs it.
  const loadingTask = pdfjsLib.getDocument({ data: request.bytes });

  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    try {
      const unscaled = page.getViewport({ scale: 1 });
      const scale = fitScale(unscaled.width, unscaled.height, request.maxWidth, request.maxHeight, {
        allowUpscale: request.allowUpscale === true,
      });
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("could not create a 2D canvas context");

      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob === null) throw new Error("canvas.toBlob produced no image");

      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      page.cleanup();
    }
  } finally {
    // `destroy()` lives on the loading task, not the resolved `PDFDocumentProxy` — this
    // is what actually releases the worker-side document, so it has to run even when
    // `loadingTask.promise` itself rejected (a corrupt file never reaching `pdf` at all).
    void loadingTask.destroy();
  }
}

window.emqnoteThumb.onRender((request) => {
  void renderFirstPage(request)
    .then((png) => {
      window.emqnoteThumb.sendResult({ id: request.id, ok: true, png });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      window.emqnoteThumb.sendResult({ id: request.id, ok: false, error: message });
    });
});
