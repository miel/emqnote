import { cleanTagInput, foldTag } from "../markdown/tags.js";
import type { Facet } from "../shared/vault-types.js";
import { score } from "./library/fuzzy.js";

/**
 * The matching half of the Tags field's completion (B66), as plain functions.
 *
 * Separate from the control that draws it for the reason `editorKeyIntent` and
 * `link-resolve.ts` are separate from what carries them out: the half that can be tested
 * without a DOM is, and the half that cannot is left as thin as it can be made.
 *
 * The field holds a *list* — `#klantx #offerte` — so every question here is about the one
 * token the caret is in, never about the whole value. Completing the field as a whole was
 * the obvious first version and is wrong the moment a second tag is typed.
 */

/** Enough to pick from without the panel covering the note underneath it. */
export const MAX_SUGGESTIONS = 8;

export interface Token {
  start: number;
  end: number;
  /** As typed, `#` and all — `rankTags` is what strips it. */
  value: string;
}

/**
 * The separators the field already parses on, kept in step with `HeaderBlock`'s own
 * `parseTags`: comma, semicolon and whitespace. Nobody types commas between hashtags,
 * but the field has always accepted them and completion must not disagree with commit.
 */
const SEPARATOR = /[,;\s]/;

/** The tag token the caret sits in, or the empty one it would start. */
export function tokenAt(text: string, caret: number): Token {
  const at = Math.max(0, Math.min(caret, text.length));

  let start = at;
  while (start > 0 && !SEPARATOR.test(text[start - 1]!)) start -= 1;

  let end = at;
  while (end < text.length && !SEPARATOR.test(text[end]!)) end += 1;

  return { start, end, value: text.slice(start, end) };
}

/**
 * Replaces the token the caret is in with a chosen tag, and leaves the caret past a
 * separator, ready for the next one.
 *
 * The trailing space is deliberate — accepting a suggestion is nearly always followed by
 * typing another tag, and without one the next character would extend the tag just
 * completed. It is only *added* when there is not one there already: completing a tag in
 * the middle of a list otherwise leaves a double space behind, which the field then
 * parses fine and reads as a typo nobody made.
 */
export function applySuggestion(
  text: string,
  caret: number,
  tag: string,
): { text: string; caret: number } {
  const token = tokenAt(text, caret);
  const followed = SEPARATOR.test(text[token.end] ?? "");
  const inserted = followed ? `#${tag}` : `#${tag} `;

  return {
    text: text.slice(0, token.start) + inserted + text.slice(token.end),
    caret: token.start + inserted.length + (followed ? 1 : 0),
  };
}

/**
 * What to offer for the token the caret is in.
 *
 * `applied` is every tag the note already carries — the field's own *and* the body's.
 * Both are dropped, and the body half is worth writing down because it looks like an
 * omission: since B65 hoists the body's tags into the frontmatter on save, a `#klantx` in
 * the sentence above is already on the note, so completing the field to it would write
 * exactly nothing. It is drawn as a chip an inch to the left at the same moment. The
 * first version of this offered them and it was the same tag twice on one row.
 *
 * The token being completed is itself in `applied` while it is being typed, so it is
 * excluded from that check rather than filtered out with the rest — otherwise a fully
 * typed tag disappears from its own list.
 *
 * Ranking: with nothing typed, the vault's own order — most-used first, which is what
 * `facets()` already returns. With something typed, the fuzzy score decides and the
 * count breaks ties, so `#kl` offers the tag on twenty notes ahead of the one on one.
 */
export function rankTags(candidates: Facet[], token: string, applied: string[]): Facet[] {
  const query = cleanTagInput(token);
  const taken = new Set(applied.map(foldTag));
  taken.delete(foldTag(query));

  const eligible = candidates.filter((facet) => !taken.has(foldTag(facet.name)));

  if (query === "") return eligible.slice(0, MAX_SUGGESTIONS);

  return eligible
    .map((facet) => ({ facet, rank: score(facet.name, query) }))
    .filter((entry): entry is { facet: Facet; rank: number } => entry.rank !== null)
    .sort((a, b) => b.rank - a.rank || b.facet.count - a.facet.count)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.facet);
}
