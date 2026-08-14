/**
 * The tiny main ↔ hidden-render-window contract for B36's PDF thumbnails.
 *
 * Deliberately not part of `ipc.ts`: that file is the capture/library windows' contract,
 * and `src/preload/thumb.ts` must expose nothing beyond what these two channels need — a
 * PDF is untrusted input, the same threat class the paste/SSRF pipeline is already
 * careful about, so the smaller this bridge the smaller the surface it hands back.
 */

/** main → thumb renderer: here are the bytes, draw a page. */
export const PDF_THUMB_RENDER = "pdf-thumb:render";
/** thumb renderer → main: here is the PNG, or here is why there isn't one. */
export const PDF_THUMB_RESULT = "pdf-thumb:result";

export interface PdfThumbRenderRequest {
  /** Ties a result back to the request that asked for it — see `pdf-thumb.ts`. */
  id: number;
  bytes: Uint8Array;
  /**
   * The box to fit the first page inside, preserving aspect ratio — `THUMBNAIL_SIZE` for a
   * chip, `PAGE_SIZE` for B43's inline embed (`thumbnail-cache.ts`).
   */
  maxWidth: number;
  maxHeight: number;
  /**
   * Whether a page smaller than the box may be drawn larger to fill it.
   *
   * False for a thumbnail, for the reason `pdf-fit.ts` gives: a small page blown up is a
   * blurry lie about the document. True for the inline page, where the box is a rendering
   * resolution rather than a display size — pdf.js re-renders vector content at whatever
   * scale it is given, so asking for more pixels there means a sharper page, not a
   * magnified one.
   */
  allowUpscale?: boolean;
  /**
   * Which page to draw, 1-based. Absent means the first, which is what every caller asked
   * for before the inline embed could turn a page.
   *
   * A page past the end of the document is not checked here or in main: pdf.js is the only
   * thing that knows how many there are, so asking for one is a render failure like any
   * other and comes back through `ok: false`. The one caller that can turn a page is told
   * the count by the render below, so in practice it never asks.
   */
  page?: number;
}

export type PdfThumbResult =
  /**
   * `pages` is how many the document has — free at render time (pdf.js has just parsed
   * the file) and otherwise expensive to learn, since it would mean parsing it again.
   * `thumbnails.ts` keeps it beside the cached PNG so a page turn after a restart does
   * not have to.
   */
  | { id: number; ok: true; png: Uint8Array; pages: number }
  | { id: number; ok: false; error: string };
