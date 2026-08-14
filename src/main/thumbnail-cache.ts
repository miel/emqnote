import { unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { cacheEntries, pruneByRecency } from "./cache-prune.js";

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
  page = 1,
): string {
  // Page 1 is spelled as the bare variant, so every key that existed before the inline
  // embed could turn a page is byte-for-byte the key it was. A cache full of first pages
  // survived this change untouched, which is the difference between one re-render per
  // file and none at all.
  const suffix = page > 1 ? `${variant}#${page}` : variant;
  return createHash("sha256")
    .update(`${realPath}\0${mtimeMs}\0${size}\0${suffix}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * Where the page *count* of a document is kept: `<page-1 key>.pages`, a file holding one
 * number.
 *
 * pdf.js knows how many pages a document has for free while it is rendering one, and
 * nothing else can learn it without parsing the whole file again. The count has to outlive
 * the render, because the PNG cache does: after a restart, page 1 of a PDF is a cache hit
 * with no render behind it to ask, and "Page 1 of 7" would have nothing to say. So it sits
 * beside the page-1 PNG, under that PNG's own key — which means it inherits the same
 * staleness rule (`mtime`+`size` are in the key, so an edited file simply has a different
 * one) and the same eviction, since `pruneThumbnails` drops a `.pages` file when the PNG
 * it belongs to goes.
 */
export function pageCountKey(realPath: string, mtimeMs: number, size: number): string {
  return thumbnailKey(realPath, mtimeMs, size, "page");
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
  // Newest first, keeping whatever fits inside *both* caps — see `cache-prune.ts`, which
  // is where that loop lives now that B50's remote-image cache is bounded the same way.
  const kept = pruneByRecency(cacheDir, (name) => name.endsWith(".png"), maxCount, maxBytes);

  // The page-count sidecars (`pageCountKey`) follow their PNG rather than being counted
  // against either cap: each is a handful of bytes, and one that outlived its page would
  // be a number nothing can check — the PNG's key is the only thing that ties it to a
  // file and an mtime. Kept exactly while the page-1 render it was written beside is.
  const surviving = new Set(kept.map(({ name }) => basename(name, ".png")));
  for (const entry of cacheEntries(cacheDir, (name) => name.endsWith(".pages"))) {
    if (surviving.has(basename(entry.name, ".pages"))) continue;
    try {
      unlinkSync(entry.path);
    } catch {
      // Already gone, or a transient lock on Windows/OneDrive — the next prune retries.
    }
  }
}
