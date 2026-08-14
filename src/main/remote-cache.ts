import { createHash } from "node:crypto";
import { join } from "node:path";
import { cacheEntries, pruneByRecency } from "./cache-prune.js";

/**
 * The naming and eviction rules for the remote-image cache (B50) — split from
 * `remote-images.ts` the same way `thumbnail-cache.ts` is split from `thumbnails.ts`:
 * none of this needs Electron or a network, so none of it needs a build to test.
 *
 * A note written elsewhere can hold `![Name](https://…)`, and B50's answer is that **main**
 * fetches it once and keeps the bytes here, outside the vault (B9). Not in `_attachments/`:
 * that would mean opening a note wrote a file into the vault and, sooner or later, changed
 * the note that named it — B10 from the wrong side. This is a derived cache, so losing it
 * costs one download and nothing else.
 */

/** Beyond either of these, the oldest cached images are evicted as a new one is written. */
export const MAX_CACHED_IMAGES = 400;
/**
 * A ceiling on what this can occupy in `userData`. Each image is capped at 20 MB by
 * `remote-image.ts` on the way in, so the count alone is not a bound worth trusting —
 * the same reasoning B43 applied to the page-render cache next door.
 */
export const MAX_CACHED_BYTES = 200 * 1024 * 1024;

/**
 * `sha256(url)`, truncated to 32 hex characters, plus the extension the bytes turned out
 * to deserve.
 *
 * The **whole URL** is the key, query string and all: two images on one host differing only
 * in a `?size=` are two different pictures, and a key that collapsed them would draw one
 * where the other belongs. Hex-only output is filesystem-safe on all three platforms
 * without a second check — no `/`, no `\`, no Windows reserved character ever appears in a
 * digest, which matters more here than for a thumbnail because the input is attacker-shaped
 * text off a web page.
 *
 * There is deliberately no expiry. A cached picture that the remote host has since changed
 * or removed goes on being drawn, and that is the useful behaviour: the note is readable
 * offline and on the other machine's first sync, which is the whole reason the bytes are
 * kept rather than re-fetched.
 */
export function remoteImageKey(url: string): string {
  return createHash("sha256").update(url, "utf8").digest("hex").slice(0, 32);
}

/** Where `url`'s bytes live once they have been fetched. */
export function remoteImageFile(cacheDir: string, url: string, extension: string): string {
  return join(cacheDir, `${remoteImageKey(url)}${extension}`);
}

/** Whether a filename belongs to this cache — the guard both prune and lookup share. */
export function isRemoteImageFile(name: string): boolean {
  return /^[0-9a-f]{32}\.[a-z0-9]+$/.test(name);
}

/**
 * The cached file for `url` whatever extension it was stored under, or null.
 *
 * Looked up by prefix rather than remembered in a map: the cache has to survive a restart,
 * and a second index of it in `userData` would be one more thing to keep in step with the
 * directory it describes.
 */
export function findCachedImage(cacheDir: string, url: string): string | null {
  const key = remoteImageKey(url);
  const match = cacheEntries(cacheDir, isRemoteImageFile).find((entry) =>
    entry.name.startsWith(`${key}.`),
  );
  return match?.path ?? null;
}

export function pruneRemoteImages(
  cacheDir: string,
  maxCount = MAX_CACHED_IMAGES,
  maxBytes = MAX_CACHED_BYTES,
): void {
  pruneByRecency(cacheDir, isRemoteImageFile, maxCount, maxBytes);
}
