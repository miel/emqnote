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
 * The inline embed's box (B43) — an A4 page at roughly 150 dpi.
 *
 * Wide enough that the drawn page is still sharp when CSS scales it down to a note column
 * on a HiDPI panel, and small enough that a cached page render stays a few hundred KB
 * rather than a few MB. Unlike the chip this render *upscales* when it has to: pdf.js draws
 * vector content at whatever scale it is given, so a bigger box is a sharper page and not
 * the magnified blur `fitScale`'s own comment refuses for a thumbnail.
 */
export const PAGE_SIZE = { width: 1240, height: 1754 };

/** Which of the two renders a request means. See `attachment-url.ts`'s `ThumbSize`. */
export type ThumbVariant = "chip" | "page";

export function boxFor(variant: ThumbVariant): { width: number; height: number } {
  return variant === "page" ? PAGE_SIZE : THUMBNAIL_SIZE;
}

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
 *
 * The variant (B43) is part of the key too, so the chip and the full-width page render of
 * one file are two cache entries rather than one answering for both. It is appended rather
 * than woven in, and `"chip"` is still the default — which does mean every key changed
 * shape when this was added, orphaning whatever was already cached. That costs one
 * re-render per file and nothing else: this is a derived cache outside the vault (B9), and
 * `pruneThumbnails` clears the orphans out as new ones are written.
 */
export function thumbnailKey(
  realPath: string,
  mtimeMs: number,
  size: number,
  variant: ThumbVariant = "chip",
): string {
  return createHash("sha256")
    .update(`${realPath}\0${mtimeMs}\0${size}\0${variant}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * Keeps the newest cached PNGs by mtime and deletes the rest. Called only from inside
 * `thumbnails.ts`'s generation path, right after a new one is written — never at startup,
 * so a vault nobody has opened in months does not cost a directory walk it gets no benefit
 * from. A missing directory is not an error: nothing has ever been cached yet, which is
 * exactly the state a fresh `userData` folder starts in.
 *
 * Two caps, and the second is B43's. A count alone was a fine bound while every entry was
 * a 256×320 chip of a few KB; a full-width page render is a few hundred KB, so 200 of
 * those is a cache measured in hundreds of megabytes sitting in `userData` — a size worth
 * bounding by what it actually is rather than by how many files it happens to be. The
 * `stat` each file needs was already being made for its mtime, so the byte cap costs
 * nothing extra.
 */
export function pruneThumbnails(cacheDir: string, maxCount: number, maxBytes = Infinity): void {
  if (!existsSync(cacheDir)) return;

  let names: string[];
  try {
    names = readdirSync(cacheDir).filter((name) => name.endsWith(".png"));
  } catch {
    return;
  }
  if (names.length <= maxCount && maxBytes === Infinity) return;

  const files = names
    .map((name) => {
      const path = join(cacheDir, name);
      try {
        const stats = statSync(path);
        return { path, mtime: stats.mtimeMs, size: stats.size };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { path: string; mtime: number; size: number } => entry !== null)
    .sort((a, b) => b.mtime - a.mtime);

  // Newest first, keeping whatever fits inside *both* caps; everything past the first one
  // to be exceeded goes. A single file larger than the whole budget is kept if it is the
  // newest — deleting the render that was just made would mean rendering it again on the
  // very next draw, forever.
  let bytes = 0;
  let keep = 0;
  for (const file of files) {
    if (keep >= maxCount) break;
    if (keep > 0 && bytes + file.size > maxBytes) break;
    bytes += file.size;
    keep += 1;
  }

  for (const { path } of files.slice(keep)) {
    try {
      unlinkSync(path);
    } catch {
      // Already gone, or a transient lock on Windows/OneDrive — the next prune retries.
    }
  }
}
