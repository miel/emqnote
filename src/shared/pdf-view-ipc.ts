/**
 * The viewer window's own two channels (B40), deliberately kept out of `ipc.ts` for the
 * same reason `pdf-thumb-ipc.ts` is: a PDF is untrusted input, and the window that parses
 * one gets a bridge with exactly what it needs on it and nothing else the app can do.
 *
 * Note what is *not* here: a path. `openExternally` carries no argument at all — main
 * already knows which attachment this window was told to show, so the renderer never gets
 * to name a file for `shell.openPath` to open. A viewer that could ask for an arbitrary
 * path would hand a malicious PDF the one capability worth having.
 */

/** main → viewer: show this attachment. Also sent to retarget an already-open window. */
export const PDF_VIEW_OPEN = "pdf-view:open";

/** viewer → main: hand whatever is on screen to the OS viewer. */
export const PDF_VIEW_OPEN_EXTERNALLY = "pdf-view:open-externally";

export interface PdfViewTarget {
  /** The attachment name, exactly as the `[[…]]` target spelled it. */
  name: string;
}
