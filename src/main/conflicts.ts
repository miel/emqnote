import type { ConflictPair } from "../shared/vault-types.js";

export type { ConflictPair };

/**
 * Recognising a OneDrive sync conflict from filenames alone —
 * `02-technisch-ontwerp.md` §5.2.
 *
 * On a real collision OneDrive renames the *losing* copy with the machine name folded
 * in: `Kickoff project Alpha.md` stays put, and `Kickoff project Alpha-LAPTOP-ABC123.md`
 * appears next to it. Recognising this from a plain list of paths — not opening or
 * hashing anything, just names — is what lets a full scan flag a conflict cheaply.
 *
 * Deliberately narrower than the design doc's own aside about a ` (1)`-style suffix:
 * `filename.ts`'s `uniquePath` already produces exactly that shape for a completely
 * ordinary reason — two notes independently created with the same title in the same
 * minute — and that is not a conflict, it is two different notes. Treating a bare
 * `(N)` suffix as conflict evidence would raise a false "edited on two machines" banner
 * over ordinary use of the app's own disambiguation. `duplicateNote`'s `-copy` suffix
 * (`vault-io.ts`) gets the same carve-out below, for the same reason.
 *
 * **The stripped suffix must additionally look like a machine name** (`looksLikeMachineSuffix`
 * below), which is what turned a real false positive into a fixed one: a note titled
 * `Weekly Report.md` sitting next to `Weekly Report-Draft.md` — a genuinely hyphenated
 * title, not a OneDrive copy — used to raise a conflict banner over nothing, and clicking
 * "keep this" or "keep that" on it would have trashed a note the user actually wrote. The
 * rule now requires every stripped segment to be a bare alphanumeric token, and at least
 * one of them to be short and all-uppercase-or-digit with a letter in it — `LAPTOP-4KJ8Q1`
 * and `DESKTOP-ABC` both pass; `herzien`, `Draft2` and `review` do not, because that is
 * exactly the shape of an ordinary word or a version tag, not a computer name.
 *
 * This is deliberately asymmetric, and the cost is accepted with eyes open: a Mac whose
 * computer name is mixed-case with no digits — `Emiels-MacBook-Pro`, the macOS default
 * shape — produces a real conflict copy this rule will now miss. That is the right way
 * round to be wrong. A missed banner still leaves both files sitting in the note list
 * where the user can find and merge them by hand; a false banner offers a one-click way to
 * discard a note nobody actually lost.
 */

/**
 * Whether a run of hyphen-separated segments stripped off the end of a stem reads as a
 * machine name rather than as an ordinary hyphenated title. Every segment must be a bare
 * alphanumeric token — nothing else this app or a Windows/macOS computer name ever puts
 * inside one is a space or punctuation — and at least one segment must be short,
 * all-uppercase-or-digit, and contain a letter: `LAPTOP`, `4KJ8Q1` and `ABC123` all
 * qualify, `herzien`, `Draft2` and `review` do not. See the module comment above for the
 * cost this accepts.
 */
function looksLikeMachineSuffix(segments: string[]): boolean {
  if (segments.length === 0) return false;
  if (!segments.every((segment) => /^[A-Za-z0-9]+$/.test(segment))) return false;
  return segments.some((segment) => /^[A-Z0-9]{2,}$/.test(segment) && /[A-Z]/.test(segment));
}

function splitPath(path: string): { dir: string; stem: string } {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const fileName = slash === -1 ? path : path.slice(slash + 1);
  return { dir, stem: fileName.replace(/\.md$/, "") };
}

/**
 * `duplicateNote` (`vault-io.ts`) appends `-copy` to a duplicated note's title, and a
 * second duplicate of the same note lands on `uniquePath`'s ` (2)` on top of that — both
 * entirely this app's own doing, never OneDrive's. Left unguarded, a duplicate would
 * read as its own conflict copy the instant it was created: stripping the trailing
 * `-copy` segment recovers exactly the original's file name, which is precisely the
 * shape this module otherwise treats as real evidence of a machine-name suffix. Same
 * reasoning as the bare `(N)` exclusion above, extended to the one other suffix this
 * app itself is now known to append.
 */
const OWN_DUPLICATE_SUFFIX = /-copy(?: \(\d+\))?$/;

/**
 * Pairs each conflict-shaped path in `paths` with the original it names a machine
 * variant of. `paths` should be vault-relative note paths, same shape as
 * `NoteSummary.path` — a pair only ever forms within the same folder, since that is the
 * only place OneDrive ever puts a conflict copy.
 */
export function findConflictCopies(paths: string[]): ConflictPair[] {
  const known = new Set(paths);
  const pairs: ConflictPair[] = [];

  for (const path of paths) {
    if (!path.endsWith(".md")) continue;

    const { dir, stem } = splitPath(path);
    if (!stem.includes("-")) continue;
    if (OWN_DUPLICATE_SUFFIX.test(stem)) continue;

    // Strip one trailing hyphen-separated segment, then two, and so on — trying the
    // shortest removal first is what keeps a title like `Kickoff project
    // Alpha-LAPTOP-ABC123` from being over-stripped to `Kickoff` when `Kickoff project
    // Alpha` is sitting right there as a match. The loop stops at the first stem found in
    // `known`, whether or not the segments removed to reach it look machine-like — a
    // larger removal is never a better answer than a smaller one that already matched.
    const segments = stem.split("-");
    for (let keep = segments.length - 1; keep >= 1; keep -= 1) {
      const candidateStem = segments.slice(0, keep).join("-");
      const candidatePath = dir === "" ? `${candidateStem}.md` : `${dir}/${candidateStem}.md`;
      if (candidatePath === path) continue;

      if (known.has(candidatePath)) {
        if (looksLikeMachineSuffix(segments.slice(keep))) {
          pairs.push({ original: candidatePath, conflict: path });
        }
        break;
      }
    }
  }

  return pairs;
}
