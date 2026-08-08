import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * The naming, gating and pruning rules for the PDF/Office first-page thumbnail cache
 * (B30) — split out from `thumbnails.ts` the same way `vault-io.ts`/`vault-scan.ts` are
 * kept Electron-free from `vault.ts`: none of this needs `nativeImage`, so none of it
 * needs a build to test. `thumbnails.ts` is the other half, the one that actually calls
 * `nativeImage.createThumbnailFromPath` and writes the PNG this module only names.
 */

/**
 * What `wikiLinkNodeView` will ask for a preview of. Not "isn't an image" — a `wikiLink`
 * is also used for a plain `[[Some Note]]` note-to-note link, which has no file behind
 * it at all, and a bare bullet-point name should never turn into an IPC-adjacent request
 * over a custom protocol.
 *
 * PDF only (B36). Office formats (`.docx`/`.xlsx`/`.pptx`) used to be here too, back when
 * this asked the OS thumbnail provider for an image — `nativeImage.createThumbnailFromPath`
 * can open all four. It was replaced with an in-house pdf.js render (`pdf-thumb.ts`)
 * after that provider was never observed to produce anything on the hardware that
 * reported "PDF preview is not showing" (see `thumbnails.ts`'s own history of that
 * report), and pdf.js only reads PDFs — Office documents lose inline preview entirely
 * and go back to being a plain chip, same as before B30 ever existed for them.
 */
export const PREVIEWABLE_EXTENSIONS = new Set([".pdf"]);

/** Case-insensitive, and `false` for a name with no extension at all (a note link). */
export function isPreviewable(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return PREVIEWABLE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/**
 * The size asked of the OS thumbnail provider — deliberately larger than the ~96×124 CSS
 * displays it at, so the image stays sharp rather than upscaled on a Retina/HiDPI panel.
 */
export const THUMBNAIL_SIZE = { width: 256, height: 320 };

/**
 * `sha256(realPath + "\0" + mtimeMs + "\0" + size)`, truncated to 32 hex characters.
 *
 * The **real, resolved** path is part of the key on purpose: two different vaults (or a
 * vault and its own `_trash`) can each hold an attachment with the same bare filename,
 * and the cache must not hand one vault's PDF back for the other's request. `mtime`+
 * `size` is the same staleness pair `index-db.ts`'s `needsRefresh` already trusts for
 * "has this file changed" — a changed file produces a different key by construction, so
 * there is no separate invalidation path to keep in sync with this one.
 *
 * Hex-only output is filesystem-safe on all three platforms without a second check: no
 * `/`, no `\`, no reserved Windows character ever appears in a hash digest.
 */
export function thumbnailKey(realPath: string, mtimeMs: number, size: number): string {
  return createHash("sha256")
    .update(`${realPath}\0${mtimeMs}\0${size}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * Keeps the newest `maxCount` cached PNGs by mtime and deletes the rest. Called only
 * from inside `thumbnails.ts`'s generation path, right after a new one is written —
 * never at startup, so a vault nobody has opened in months does not cost a directory
 * walk it gets no benefit from. A missing directory is not an error: nothing has ever
 * been cached yet, which is exactly the state a fresh `userData` folder starts in.
 */
export function pruneThumbnails(cacheDir: string, maxCount: number): void {
  if (!existsSync(cacheDir)) return;

  let names: string[];
  try {
    names = readdirSync(cacheDir).filter((name) => name.endsWith(".png"));
  } catch {
    return;
  }
  if (names.length <= maxCount) return;

  const files = names
    .map((name) => {
      const path = join(cacheDir, name);
      try {
        return { path, mtime: statSync(path).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { path: string; mtime: number } => entry !== null)
    .sort((a, b) => b.mtime - a.mtime);

  for (const { path } of files.slice(maxCount)) {
    try {
      unlinkSync(path);
    } catch {
      // Already gone, or a transient lock on Windows/OneDrive — the next prune retries.
    }
  }
}
