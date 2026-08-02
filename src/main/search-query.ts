/**
 * The search bar's own tiny query language — `02-technisch-ontwerp.md` §7.3:
 *
 *   offerte type:meeting attendee:"Jan de Vries" tag:klantx after:2026-01-01
 *
 * Pure string parsing, no database, no Electron — same reasoning as `filename.ts` and
 * `tags.ts`. What is left over after pulling the recognised `key:value` tokens out goes
 * to `index-db.ts`'s `search()` as free text; this module never touches FTS5 syntax
 * itself, which is exactly the split `search()`'s own comment on `toMatchQuery` points
 * back to.
 *
 * The design doc's example spells the date filters `na:`/`voor:` — Dutch, predating the
 * English-UI decision in commit `c24d82b` (see `CLAUDE.md`: code, tests and UI strings
 * are English, only the five design documents and the corpus stay Dutch on purpose).
 * What the user types into the search box is a UI string, so this implements the
 * English `after:`/`before:` instead of transcribing the doc literally — the same kind
 * of deliberate divergence B19 and others already model, not an oversight.
 */

export interface ParsedQuery {
  /** What is left after the recognised filter tokens are pulled out, joined back with single spaces. */
  text: string;
  type: "quick" | "meeting" | null;
  attendee: string | null;
  tag: string | null;
  /** Inclusive, compared against the *date* part of `created` only — see `vault-scan.ts`. */
  after: string | null;
  /** Inclusive, same as `after`. */
  before: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Applies one `key:value` pair to `result` if `key` is a filter this language knows and
 * `value` is valid for it. Returns whether it did — an unknown key (`foo:bar`) or an
 * invalid value (`type:nonsense`, `after:not-a-date`) is not an error, it just was not a
 * filter after all, and the caller folds it back into the free-text search instead. A
 * search box has no error state to show; falling back to "search for this literally" is
 * the only sensible response to something that merely looks like syntax.
 */
function applyFilter(result: ParsedQuery, key: string, value: string): boolean {
  switch (key.toLowerCase()) {
    case "type":
      if (value !== "quick" && value !== "meeting") return false;
      result.type = value;
      return true;
    case "tag":
      result.tag = value;
      return true;
    case "attendee":
      result.attendee = value;
      return true;
    case "after":
      if (!ISO_DATE.test(value)) return false;
      result.after = value;
      return true;
    case "before":
      if (!ISO_DATE.test(value)) return false;
      result.before = value;
      return true;
    default:
      return false;
  }
}

/**
 * Splits on whitespace, except that `key:"a quoted value"` is one token — the design
 * doc's own `attendee:"Jan de Vries"` needs exactly that. Only a `key:"…"` shape is
 * quote-aware; a bare quote elsewhere in the free text is just a character in a word,
 * same as it would be typed into any search box.
 */
const TOKEN = /([A-Za-z]+):"([^"]*)"|(\S+)/g;

export function parseSearchQuery(input: string): ParsedQuery {
  const result: ParsedQuery = {
    text: "",
    type: null,
    attendee: null,
    tag: null,
    after: null,
    before: null,
  };
  const words: string[] = [];

  for (const match of input.matchAll(TOKEN)) {
    const [, quotedKey, quotedValue, word] = match;

    if (quotedKey !== undefined) {
      if (!applyFilter(result, quotedKey, quotedValue ?? "")) {
        words.push(`${quotedKey}:"${quotedValue ?? ""}"`);
      }
      continue;
    }

    const colon = word!.indexOf(":");
    if (colon > 0 && applyFilter(result, word!.slice(0, colon), word!.slice(colon + 1))) {
      continue;
    }
    words.push(word!);
  }

  result.text = words.join(" ");
  return result;
}
