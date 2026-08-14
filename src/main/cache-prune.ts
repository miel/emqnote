import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * Keeping the newest files in a derived cache and deleting the rest, under a count cap and
 * a byte cap at once.
 *
 * This was `thumbnail-cache.ts`'s own loop until B50 gave `userData` a second cache to
 * bound the same way. Two copies of an eviction rule is how one of them quietly stops
 * matching the other, and this one carries a decision worth not re-deriving: **a single
 * file bigger than the whole byte budget is kept when it is the newest**, because deleting
 * the render that was just made means making it again on the very next draw, forever.
 *
 * A missing directory is not an error — nothing has been cached yet, which is exactly the
 * state a fresh `userData` folder starts in.
 */
export interface CacheEntry {
  path: string;
  name: string;
  mtime: number;
  size: number;
}

/** The cache's files, newest first, for a caller that wants to decide for itself. */
export function cacheEntries(dir: string, matches: (name: string) => boolean): CacheEntry[] {
  if (!existsSync(dir)) return [];

  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  return names
    .filter(matches)
    .map((name) => {
      const path = join(dir, name);
      try {
        const stats = statSync(path);
        return { path, name, mtime: stats.mtimeMs, size: stats.size };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is CacheEntry => entry !== null)
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Deletes everything past the first cap to be exceeded, and answers what survived — the
 * caller needs that to decide about sidecar files that follow an entry rather than being
 * counted against the caps themselves (`thumbnail-cache.ts`'s `.pages` numbers).
 */
export function pruneByRecency(
  dir: string,
  matches: (name: string) => boolean,
  maxCount: number,
  maxBytes = Infinity,
): CacheEntry[] {
  const files = cacheEntries(dir, matches);
  if (files.length <= maxCount && maxBytes === Infinity) return files;

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

  return files.slice(0, keep);
}
