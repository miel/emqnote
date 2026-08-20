import { foldTag } from "../markdown/tags.js";
import type { Facet } from "../shared/vault-types.js";
import { score } from "./library/fuzzy.js";
import { MAX_SUGGESTIONS } from "./tag-typeahead.js";

/**
 * The matching half of the Where field's completion (B73).
 *
 * `tag-typeahead.ts`'s reason for existing, applied to the other completing field: the half
 * that can be tested without a DOM is, and `HeaderBlock` is left drawing a list somebody
 * else ranked.
 *
 * **The whole field, never a token.** That is the one real difference from the tag side and
 * it is why this is a sibling module rather than another export there. A Tags field holds a
 * *list*, so `tokenAt`/`applySuggestion` exist to work on the one entry the caret is in; a
 * location is a single value that legitimately contains spaces — "Kantoor Amsterdam", "Bij
 * de klant op kantoor" — so tokenising it would offer completions for the word under the
 * caret and complete the field to a fragment of its own contents. Accepting is therefore a
 * plain replacement, with no separator and no caret arithmetic, and there is nothing here
 * that needs to be told where the caret is.
 *
 * `MAX_SUGGESTIONS` is imported rather than restated: two panels of different heights in
 * one header, four fields apart, would be a decision nobody made.
 */
export { MAX_SUGGESTIONS };

/**
 * The locations worth offering for what has been typed so far.
 *
 * `rankTags`' ranking exactly — with nothing typed the vault's own order, which
 * `locationFacets` already returns most-used first, and with something typed the fuzzy
 * score with the count breaking ties. What differs is what is filtered out: a tag field
 * hides the tags the note already carries because it can hold several, while a location is
 * one value, so `current` hides only the exact thing already in the field. Completing to
 * what is already written would be an offer to do nothing.
 *
 * The comparison folds case, so a vault holding "Teams" does not offer it again to someone
 * who has typed "teams" — the value stays what they typed, which is `HeaderBlock`'s to
 * decide and not this module's.
 */
export function rankLocations(candidates: Facet[], typed: string): Facet[] {
  const query = typed.trim();
  const current = foldTag(query);

  const eligible = candidates.filter((facet) => foldTag(facet.name) !== current);

  if (query === "") return eligible.slice(0, MAX_SUGGESTIONS);

  return eligible
    .map((facet) => ({ facet, rank: score(facet.name, query) }))
    .filter((entry): entry is { facet: Facet; rank: number } => entry.rank !== null)
    .sort((a, b) => b.rank - a.rank || b.facet.count - a.facet.count)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.facet);
}
