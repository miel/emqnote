/**
 * How a PDF page is fitted into a box, in the one place both callers can reach.
 *
 * The thumbnail (B36) and the viewer window (B40) ask the same question of the same
 * library and must not answer it two ways — a preview that disagrees with the page it
 * previews is exactly the kind of drift `03-markdown-dialect.md`'s one-serializer rule
 * exists to prevent, one layer down.
 *
 * `allowUpscale` is the one thing they genuinely differ on. A thumbnail never magnifies:
 * a small page blown up to fill a 256×320 box is a blurry lie about the document. A
 * viewer's "fit page" must, or a passport-sized PDF would sit as a postage stamp in the
 * middle of a maximised window.
 */
export function fitScale(
  unscaledWidth: number,
  unscaledHeight: number,
  maxWidth: number,
  maxHeight: number,
  options: { allowUpscale?: boolean } = {},
): number {
  const scale = Math.min(maxWidth / unscaledWidth, maxHeight / unscaledHeight);
  return options.allowUpscale === true ? scale : Math.min(1, scale);
}
