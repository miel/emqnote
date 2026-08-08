/**
 * The tiny main ↔ hidden-render-window contract for B36's PDF thumbnails.
 *
 * Deliberately not part of `ipc.ts`: that file is the capture/library windows' contract,
 * and `src/preload/thumb.ts` must expose nothing beyond what these two channels need — a
 * PDF is untrusted input, the same threat class the paste/SSRF pipeline is already
 * careful about, so the smaller this bridge the smaller the surface it hands back.
 */

/** main → thumb renderer: here are the bytes, draw the first page. */
export const PDF_THUMB_RENDER = "pdf-thumb:render";
/** thumb renderer → main: here is the PNG, or here is why there isn't one. */
export const PDF_THUMB_RESULT = "pdf-thumb:result";

export interface PdfThumbRenderRequest {
  /** Ties a result back to the request that asked for it — see `pdf-thumb.ts`. */
  id: number;
  bytes: Uint8Array;
  /** The box to fit the first page inside, preserving aspect ratio — `THUMBNAIL_SIZE`. */
  maxWidth: number;
  maxHeight: number;
}

export type PdfThumbResult =
  | { id: number; ok: true; png: Uint8Array }
  | { id: number; ok: false; error: string };
