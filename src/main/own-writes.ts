import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * Remembers the exact bytes this app last wrote to each note, so the watcher can tell
 * its own echo from a real external change apart from one that genuinely came from
 * outside — the other machine, a text editor, OneDrive's own conflict-resolution
 * shuffle.
 *
 * A content hash rather than a "ignore writes for N ms after our own save" timer,
 * deliberately: a TTL turns a correctness property into a timing property, and the one
 * clock this app cannot trust is OneDrive's — it re-materialises/re-touches a file on
 * its own schedule, not one this app controls, so a fixed window is either too short
 * (a late echo slips through and gets reported as a real external change) or too long
 * (a real edit landing inside the window gets silently swallowed). Comparing bytes has
 * neither failure mode: it answers "did this app write exactly this", not "was it
 * recently".
 *
 * Keyed by the resolved absolute path — lowercased specifically on Windows, where two
 * spellings of the same path (drive-letter casing, in particular) are the same file but
 * would otherwise miss each other as map keys. `CLAUDE.md`'s own test-suite note is the
 * reason for the platform guard: every path comparison in this codebase meets a
 * case-sensitivity difference for the first time on Windows, and this one is no
 * exception.
 */

/** Oldest-first eviction once the map holds more than this many notes. A personal vault
 *  touches a handful of notes in any given stretch of use — this only exists so a vault
 *  browsed end to end over weeks does not grow this map without bound. */
const MAX_ENTRIES = 64;

/** Insertion order is what a `Map` already gives for free, and re-inserting a key (see
 *  `rememberOwnWrite`) moves it to the newest end — exactly LRU behaviour, with no
 *  second data structure to keep in step. */
const hashes = new Map<string, string>();

function keyFor(path: string): string {
  const normalised = resolve(path);
  return process.platform === "win32" ? normalised.toLowerCase() : normalised;
}

function hashOf(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

export function rememberOwnWrite(absolutePath: string, contents: string): void {
  const key = keyFor(absolutePath);
  // Delete first so the re-insert below lands at the newest end of the map's iteration
  // order even when this path was already known — otherwise a note edited over and over
  // would keep its *original* position and look like the next thing to evict.
  hashes.delete(key);
  hashes.set(key, hashOf(contents));

  while (hashes.size > MAX_ENTRIES) {
    const oldest = hashes.keys().next().value;
    if (oldest === undefined) break;
    hashes.delete(oldest);
  }
}

/**
 * Non-consuming on purpose: chokidar can fire `add` then `change` for a single logical
 * write on some platforms/filesystems, and both need to see the same answer, not just
 * the first to ask.
 */
export function wasOwnWrite(absolutePath: string, contents: string): boolean {
  const stored = hashes.get(keyFor(absolutePath));
  return stored !== undefined && stored === hashOf(contents);
}
