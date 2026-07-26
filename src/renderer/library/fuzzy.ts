/**
 * Scores a candidate against what has been typed.
 *
 * Loose subsequence matching across the whole string, so `alph rap` finds
 * `10 Projects/Klant X/Project Alpha/Rapportage` — the point being that reaching
 * something four levels deep should cost a few keystrokes, not a walk through a tree.
 *
 * Shared by the move palette and the tag and people lists, which want exactly the same
 * behaviour: a long list you narrow by typing fragments in any order.
 *
 * Returns null when the candidate does not match at all.
 */
export function score(candidate: string, query: string): number | null {
  if (query === "") return 0;

  const haystack = candidate.toLowerCase();
  let position = 0;
  let hits = 0;

  for (const term of query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== "")) {
    const found = haystack.indexOf(term, position);
    if (found === -1) return null;
    // Earlier matches and matches at a word boundary rank higher.
    hits += found === 0 || /[\s/]/.test(haystack[found - 1] ?? "") ? 2 : 1;
    position = found + term.length;
  }

  // Shorter candidates win ties: the more specific one is usually the shorter one you
  // typed enough of, not the long one that happens to contain the letters.
  return hits * 1000 - candidate.length;
}
