import { foldTag } from "../markdown/tags.js";
import type { Facet } from "../shared/vault-types.js";
import { score } from "./library/fuzzy.js";
import { MAX_SUGGESTIONS } from "./tag-typeahead.js";

/**
 * The matching half of the Who field's completion (B81), as plain functions.
 *
 * The third module in this family, and it sits between the other two. Like
 * `tag-typeahead.ts` it works on the one token the caret is in, because the field holds a
 * *list*; like `location-typeahead.ts` a single entry is a value with spaces in it that
 * must survive being completed. So the token maths is the tag module's with one
 * difference, and that difference is the whole reason this is not another export there:
 * **whitespace does not separate here**. "Jan de Vries" is one name, and a separator set
 * that included spaces would offer completions for "de".
 *
 * `,` and `;` is exactly what `HeaderBlock`'s own `parseAttendees` splits on — Outlook
 * uses semicolons and fingers expect it — and completion must not disagree with commit.
 *
 * `MAX_SUGGESTIONS` is imported rather than restated, for the reason
 * `location-typeahead.ts` states: panels of different heights in one header, two fields
 * apart, would be a decision nobody made.
 */
export { MAX_SUGGESTIONS };

/** The separators the Who field parses on — and deliberately not whitespace. */
const SEPARATOR = /[,;]/;

export interface Token {
  start: number;
  end: number;
  /** The raw slice, surrounding spaces and all — `rankPeople` is what trims it. */
  value: string;
}

/** The name the caret sits in, or the empty one it would start. */
export function tokenAt(text: string, caret: number): Token {
  const at = Math.max(0, Math.min(caret, text.length));

  let start = at;
  while (start > 0 && !SEPARATOR.test(text[start - 1]!)) start -= 1;

  let end = at;
  while (end < text.length && !SEPARATOR.test(text[end]!)) end += 1;

  return { start, end, value: text.slice(start, end) };
}

/**
 * Replaces the name the caret is in with a chosen one, and leaves the caret past a
 * separator, ready for the next.
 *
 * `tag-typeahead.ts`'s `applySuggestion` with one addition. The trailing `", "` is there
 * for its reason exactly — accepting is nearly always followed by typing another name,
 * and without a separator the next character would extend the name just completed — and
 * is only added when a separator does not already follow, or completing in the middle of
 * a list leaves a stray comma the field then parses into an empty name.
 *
 * What is new is the **leading** space. A token here starts immediately after the comma,
 * so it usually opens with the space the previous accept left behind; dropping it would
 * write "Jan,Pieter Jansen", which parses fine and reads as a typo nobody made. It is
 * taken from what is actually there rather than always inserted, so a name completed at
 * the very start of the field does not begin with one.
 */
export function applySuggestion(
  text: string,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const token = tokenAt(text, caret);
  const lead = /^\s+/.exec(token.value)?.[0] ?? (token.start > 0 ? " " : "");
  const followed = SEPARATOR.test(text[token.end] ?? "");
  const inserted = followed ? `${lead}${name}` : `${lead}${name}, `;

  return {
    text: text.slice(0, token.start) + inserted + text.slice(token.end),
    caret: token.start + inserted.length + (followed ? 1 : 0),
  };
}

/**
 * What to offer for the name the caret is in.
 *
 * `rankTags`' ranking and its exclusion rule, on trimmed names instead of tags: with
 * nothing typed the vault's own order, which `facets()` already returns most-used first,
 * and with something typed the fuzzy score with the count breaking ties. `score` splits
 * its query on whitespace and matches the terms in order, so "jan vr" finds
 * "Jan de Vries" — which is the behaviour a field of full names wants and is why the
 * spaces inside a token are no trouble here.
 *
 * `applied` is what the field already holds, so a name is not offered twice. The token
 * being completed is itself in that list while it is being typed, so it is excluded from
 * the check rather than filtered out with the rest — otherwise a fully typed name
 * disappears from its own list.
 *
 * `applied` must come from the **live text of the field**, never from the committed
 * array: that is what B66's Tags field got wrong (a name deleted from the field went on
 * being filtered out of its own vault list until a blur), and doing it right from the
 * start here is cheaper than reporting it twice.
 *
 * The comparison folds case through `foldTag` — which is only `toLowerCase` — because
 * that is what `tally` already keys people on in `vault-scan.ts`, so the vault's list and
 * this filter agree on what counts as the same person.
 */
export function rankPeople(candidates: Facet[], token: string, applied: string[]): Facet[] {
  const query = token.trim();
  const taken = new Set(applied.map((name) => foldTag(name.trim())));
  taken.delete(foldTag(query));

  const eligible = candidates.filter((facet) => !taken.has(foldTag(facet.name.trim())));

  if (query === "") return eligible.slice(0, MAX_SUGGESTIONS);

  return eligible
    .map((facet) => ({ facet, rank: score(facet.name, query) }))
    .filter((entry): entry is { facet: Facet; rank: number } => entry.rank !== null)
    .sort((a, b) => b.rank - a.rank || b.facet.count - a.facet.count)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.facet);
}
