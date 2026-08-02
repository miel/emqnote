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
 * over ordinary use of the app's own disambiguation. The machine-name suffix carries no
 * such ambiguity: nothing in this app ever appends one, so seeing one is real evidence
 * something else — OneDrive — wrote that file.
 *
 * The heuristic is still a heuristic, not a certainty, and says so rather than
 * pretending otherwise: a genuinely hyphenated title (`Weekly Report-Draft.md`) sitting
 * next to its own unhyphenated prefix (`Weekly Report.md`) reads as a false positive by
 * exactly the same rule that finds a real conflict. That trade was the design doc's to
 * make, not a bug introduced here — see its own "de watcher *herkent* dat patroon"
 * (recognises the pattern), not "verifies" it.
 */

export interface ConflictPair {
  /** The note nothing renamed — where OneDrive's own sync considers the winner to live. */
  original: string;
  /** The machine-suffixed copy sitting next to it. */
  conflict: string;
}

/**
 * Candidate "original" names for a conflict copy's stem (filename without `.md`),
 * most-likely first: strip one trailing hyphen-separated segment, then two, and so on.
 * Trying the shortest removal first is what keeps a title like `Kickoff project
 * Alpha-LAPTOP-ABC123` from being over-stripped to `Kickoff` when
 * `Kickoff project Alpha` is sitting right there as a match — the caller stops at the
 * first hit, and the first hit here is always the smallest possible removal.
 */
function candidateOriginalStems(stem: string): string[] {
  const segments = stem.split("-");
  const candidates: string[] = [];

  for (let keep = segments.length - 1; keep >= 1; keep -= 1) {
    candidates.push(segments.slice(0, keep).join("-"));
  }

  return candidates;
}

function splitPath(path: string): { dir: string; stem: string } {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const fileName = slash === -1 ? path : path.slice(slash + 1);
  return { dir, stem: fileName.replace(/\.md$/, "") };
}

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

    for (const candidateStem of candidateOriginalStems(stem)) {
      const candidatePath = dir === "" ? `${candidateStem}.md` : `${dir}/${candidateStem}.md`;
      if (candidatePath === path) continue;

      if (known.has(candidatePath)) {
        pairs.push({ original: candidatePath, conflict: path });
        break;
      }
    }
  }

  return pairs;
}
