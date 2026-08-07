import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAttachment } from "./attachments.js";
import { isPreviewable, thumbnailKey } from "./thumbnail-cache.js";

/**
 * The decision half of `--thumbnail-probe=<name>` (see `thumbnails.ts` for the flag
 * itself and `index.ts` for where it is parsed and wired up) — split out the same way
 * `thumbnail-cache.ts` sits apart from `thumbnails.ts`: everything up to the point of
 * actually asking the OS for a thumbnail needs no Electron module, so none of it needs
 * a build to test. `runThumbnailProbe` in `thumbnails.ts` is the other half: it calls
 * `decideThumbnailProbe`, and for the one outcome that reaches this far
 * (`"ready"`) it is the one that calls `nativeImage.createThumbnailFromPath` and
 * prints the result.
 *
 * This exists because "PDF preview is not showing" was, until now, un-diagnosable
 * without adding `console.log`s to a build and re-packaging it: nothing told the four
 * different reasons a thumbnail fails to appear apart from one another, and
 * `failedThisSession` (see `thumbnails.ts`) meant a transient failure during ordinary
 * use silently blocked every retry for the rest of the session, including one a human
 * runs the probe to investigate. This function mirrors `ensureThumbnail`'s own
 * decisions up to the `nativeImage` call, but never consults or writes
 * `failedThisSession` — a probe run must always re-examine the file fresh.
 */
export type ThumbnailProbeDecision =
  | { step: "not-previewable" }
  | { step: "not-resolved" }
  | { step: "stat-failed"; error: string }
  | { step: "ready"; resolved: string; cachedFile: string; alreadyCached: boolean };

/**
 * Walks the same gates `ensureThumbnail` does, in the same order, stopping at the first
 * one that does not pass — everything up to (but not including) the actual
 * `nativeImage.createThumbnailFromPath` call, which needs Electron and so lives in
 * `thumbnails.ts`'s `runThumbnailProbe` instead.
 */
export function decideThumbnailProbe(
  vault: string,
  name: string,
  cacheDir: string,
): ThumbnailProbeDecision {
  if (!isPreviewable(name)) return { step: "not-previewable" };

  const resolved = resolveAttachment(vault, name);
  if (resolved === null) return { step: "not-resolved" };

  try {
    const stats = statSync(resolved);
    const key = thumbnailKey(resolved, stats.mtimeMs, stats.size);
    const cachedFile = join(cacheDir, `${key}.png`);
    return { step: "ready", resolved, cachedFile, alreadyCached: existsSync(cachedFile) };
  } catch (error) {
    return { step: "stat-failed", error: error instanceof Error ? error.message : String(error) };
  }
}
