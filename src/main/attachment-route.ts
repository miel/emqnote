import { isPreviewable } from "./thumbnail-cache.js";

/**
 * Where a click on a resolved attachment goes (B40).
 *
 * Electron-free on purpose, like `link-resolve.ts` and `remote-image.ts`: the rule is a
 * decision worth pinning in a test, and `openPdfViewer` and `shell.openPath` are both
 * unreachable from one.
 *
 * The split is deliberately the same set `isPreviewable` already draws — a `.pdf` is
 * exactly what this app can render for itself, and offering to "view" a `.docx` it cannot
 * draw would be a worse answer than handing it to Word. If that set ever grows, both the
 * thumbnail and the viewer follow it in step, which is the point of asking one function.
 */
export type AttachmentRoute = "viewer" | "system";

export function attachmentRoute(name: string): AttachmentRoute {
  return isPreviewable(name) ? "viewer" : "system";
}
