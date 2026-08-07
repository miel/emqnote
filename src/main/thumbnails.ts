import { app, nativeImage } from "electron";
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pruneThumbnails, thumbnailKey, THUMBNAIL_SIZE } from "./thumbnail-cache.js";

/**
 * The I/O half of the thumbnail cache (B30) — split from `thumbnail-cache.ts` for the
 * same reason `vault.ts` sits apart from `vault-io.ts`: this file touches `nativeImage`,
 * so it cannot be Electron-free, and everything that *can* be tested without a build
 * lives in the sibling module instead.
 */

/** Beyond this, the oldest cached PNGs are evicted as a new one is generated. */
const MAX_CACHED_THUMBNAILS = 200;

/**
 * A generation that failed once this session is not retried on every render of the same
 * note — a note with three PDF links currently means three NodeViews, so without this a
 * missing Linux thumbnail provider would be asked three times per note-open, forever.
 * In-memory only and bounded: a negative result belongs to this process's lifetime, not
 * to disk, since the next launch may run on a machine (or an OS update) where the
 * provider works, and nothing here should grow without bound over a long resident run.
 */
const failedThisSession = new Map<string, true>();
const MAX_FAILED_ENTRIES = 500;

function rememberFailure(key: string): void {
  if (failedThisSession.size >= MAX_FAILED_ENTRIES) {
    const oldest = failedThisSession.keys().next().value;
    if (oldest !== undefined) failedThisSession.delete(oldest);
  }
  failedThisSession.set(key, true);
}

/**
 * A OneDrive Files On-Demand placeholder reports a real size but occupies no blocks on
 * disk — generating a thumbnail for one would force-hydrate a file nobody has opened yet,
 * just to throw the result away 96px wide. This is the same test `vault.ts`'s
 * `checkFilesOnDemand` samples the vault with, applied here to the one file being asked
 * about; `darwin`-only for the same reason `index-scan.ts`'s `isDataless` is — `blocks`
 * only reliably means "not on disk" on that platform. A `statSync` failure counts as a
 * placeholder too: better to skip a thumbnail than force a read of a file mid-sync.
 */
function isPlaceholder(path: string): boolean {
  if (process.platform !== "darwin") return false;
  try {
    const stats = statSync(path);
    return stats.size > 0 && stats.blocks === 0;
  } catch {
    return true;
  }
}

async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
}

/** `<userData>/thumbnails` — a derived cache outside the vault, next to `index.sqlite` (B9). */
export function thumbnailCacheDir(): string {
  return join(app.getPath("userData"), "thumbnails");
}

/**
 * Returns the absolute path of a cached (or freshly generated) first-page thumbnail for
 * `realPath`, or `null` when none is available — a missing OS provider (Linux, always;
 * Windows without one registered), a genuinely broken file, or a not-yet-hydrated
 * OneDrive placeholder are all the same outcome from a caller's point of view: fall back
 * to the plain chip. Never throws.
 */
export async function ensureThumbnail(
  cacheDir: string,
  realPath: string,
): Promise<string | null> {
  try {
    const stats = statSync(realPath);
    const key = thumbnailKey(realPath, stats.mtimeMs, stats.size);
    const cachedFile = join(cacheDir, `${key}.png`);

    if (existsSync(cachedFile)) return cachedFile;
    if (failedThisSession.has(key)) return null;
    if (isPlaceholder(realPath)) {
      rememberFailure(key);
      return null;
    }

    // Not rejected on Linux — it resolves with an empty image, which `.isEmpty()` below
    // is what actually catches. Treated the same as a thrown error either way.
    const image = await nativeImage.createThumbnailFromPath(realPath, THUMBNAIL_SIZE);
    if (image.isEmpty()) {
      rememberFailure(key);
      return null;
    }

    await mkdir(cacheDir, { recursive: true });
    await writeAtomic(cachedFile, image.toPNG());
    pruneThumbnails(cacheDir, MAX_CACHED_THUMBNAILS);

    return cachedFile;
  } catch {
    return null;
  }
}
