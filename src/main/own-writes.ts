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
 * Moves what was remembered for one path to another, because a rename does not change
 * the bytes and must not change the answer.
 *
 * The map is keyed by path, so before this a renamed file simply lost its identity: the
 * watcher saw an `add` at a path nothing had ever been written to, answered `own: false`,
 * and the capture window put "This note changed outside emqnote in the meantime." on
 * screen for a rename this app had just performed itself. It stuck, too — the contents
 * are unchanged, so the next debounced write is a no-op and no hash is ever registered
 * for the new path.
 *
 * The entry is *moved* rather than re-remembered from the contents: neither rename site
 * has the bytes in scope, and re-reading the file to hash it would be asking the disk a
 * question this map already knows the answer to.
 *
 * A rename onto a path this app had also written to (`uniquePath` makes that rare but
 * not impossible) simply overwrites the older entry, which is correct: the file that
 * used to be there is gone.
 */
export function renameOwnWrite(from: string, to: string): void {
  const fromKey = keyFor(from);
  const stored = hashes.get(fromKey);
  if (stored === undefined) return;

  hashes.delete(fromKey);
  const toKey = keyFor(to);
  // Same delete-before-set as `rememberOwnWrite`, and for the same reason: the entry
  // belongs at the newest end of the iteration order, not wherever the old key sat.
  hashes.delete(toKey);
  hashes.set(toKey, stored);
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

/**
 * The same question for a file this app *moved*, which the hashes above cannot answer.
 *
 * A move is an `unlink` at one path and an `add` at another, and a content hash has
 * nothing to say about either: there are no bytes at a path that no longer exists, and the
 * bytes at the new one were never written by this app — `moveNote` renames a file it has
 * very often never touched, so `renameOwnWrite` finds nothing to carry over. So
 * `index-watch.ts` reported every note this app filed into another folder as having been
 * "deleted outside emqnote", and the destination as having changed outside it. Moving a
 * marked set is where that became visible, because the reader ends up standing on one of
 * the paths the app itself has just vacated (B95).
 *
 * Two sets rather than one map with a direction, because the two questions are asked by
 * two different handlers about two different paths and neither needs to know the other
 * half. Path-keyed, not time-keyed: this says "this app moved that file", which stays true
 * however long the watcher takes to notice — B31's objection is to a *timer*, not to
 * remembering what we did.
 *
 * Non-consuming, for `wasOwnWrite`'s reason, and bounded the same way. The cost of not
 * consuming is a narrow one: a path this app moved away from, recreated by hand, and then
 * deleted from outside would have that deletion suppressed until `MAX_ENTRIES` other moves
 * had pushed it out. The cost of consuming would be an `add`-then-`change` pair whose
 * second half is reported as an external edit, which is the same bug in a different place.
 */
const removals = new Set<string>();
const arrivals = new Set<string>();

/** Oldest-first eviction, the way `hashes` above does it — insertion order, no second
 *  structure to keep in step. */
function remember(set: Set<string>, path: string): void {
  const key = keyFor(path);
  set.delete(key);
  set.add(key);

  while (set.size > MAX_ENTRIES) {
    const oldest = set.values().next().value;
    if (oldest === undefined) break;
    set.delete(oldest);
  }
}

/**
 * Records that this app renamed `from` to `to` — a file filed into another folder, renamed
 * in place, or moved into `_trash`. All three are the same event to a watcher.
 */
export function rememberOwnMove(from: string, to: string): void {
  remember(removals, from);
  remember(arrivals, to);
}

/** Did this app move a file away from here? Answers the watcher's `unlink`. */
export function wasOwnRemoval(absolutePath: string): boolean {
  return removals.has(keyFor(absolutePath));
}

/** Did this app move a file *to* here? Answers the watcher's `add`, after the hash has
 *  declined — the hash is the better answer where it has one, since it compares bytes. */
export function wasOwnArrival(absolutePath: string): boolean {
  return arrivals.has(keyFor(absolutePath));
}
