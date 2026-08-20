/**
 * The one place the meaning of an embed's pipe field is spelled (B74).
 *
 * `![[foto.png|…]]` has a single slot after the pipe, and Obsidian reads it three ways by
 * pattern-matching the string in it:
 *
 * | In the file | Read as |
 * |---|---|
 * | `\|250` | a width in pixels; the height follows the picture |
 * | `\|250x180` | an explicit width and height in pixels |
 * | anything else | alt text |
 *
 * That is the whole rule, and this app follows it exactly rather than inventing a spelling
 * of its own — B7: the vault stays readable in Obsidian, and Obsidian already does this.
 * A remote picture carries the same suffix on its alt text (`![Het logo|320](url)`), which
 * is why `splitSizeSuffix` exists beside the reader: the two hosts differ in *where* the
 * field sits, never in what it means. Two spellings of one syntax is how a paste and a
 * reopen come to disagree about the same characters (B58).
 *
 * **Nothing in that slot is ever discarded.** A width and a height are drawn; alt text is
 * stored and — for now, deliberately — not shown anywhere, not on the `<img>`, not in the
 * excerpt, not in the search index. It exists so that a note written in Obsidian survives
 * being edited here, which it did not before: every non-numeric suffix was silently
 * dropped on the first save, from the very first markdown commit until this.
 *
 * **The slot holds one thing at a time**, so a picture cannot carry both a size and alt
 * text — that is the format's limit, not a choice made here, and it is why resizing a
 * picture that has alt text replaces it. `test/limitations.test.ts` pins that.
 */

/** The widest or tallest a stored dimension may be, so a stray value cannot fill a screen. */
const MAX_PIXELS = 10000;

/** The smallest. Below this there is nothing to see, and nothing to grab a handle on. */
const MIN_PIXELS = 8;

/** What an embed's pipe field turned out to mean. At most one of the two is ever set. */
export interface EmbedField {
  width: number | null;
  height: number | null;
  /**
   * The text in the slot when it was not a size — Obsidian's alt text.
   *
   * `""` is a real value and not the same as `null`: `![[foto.png|]]` is a slot that is
   * there and empty, and writing it back without the pipe would change bytes this app was
   * only passing through.
   */
  alt: string | null;
}

const EMPTY: EmbedField = { width: null, height: null, alt: null };

function inBounds(value: number): number | null {
  return value < MIN_PIXELS || value > MAX_PIXELS ? null : value;
}

/**
 * Reads the half after the pipe. `undefined` is "there was no pipe".
 *
 * A number outside the bounds falls through to alt text rather than being clamped or
 * dropped — `![[foto.png|4]]` comes back out as `|4`, which is the point: refusing to
 * *understand* something must never mean refusing to *keep* it.
 *
 * Only a lower-case `x` joins a pair, and that agrees with Obsidian rather than merely
 * being safe: **checked there, `![[foto.png|250X180]]` does not resize** — the picture
 * draws at its own size, so the capital form is not a size to Obsidian either. Both apps
 * therefore show the same thing, which is what B7 is about; keeping the string verbatim
 * instead of canonicalising it to `250x180` is then free, and avoids rewriting a
 * character nobody asked this app to touch.
 *
 * Written down because the first version of this comment asserted the opposite — that
 * Obsidian was looser and this was a deliberate divergence from it — without anyone
 * having looked. It is the same shape as B71: a claim about somebody else's software is
 * a measurement, not a deduction.
 */
export function readEmbedField(suffix: string | undefined): EmbedField {
  if (suffix === undefined) return { ...EMPTY };

  const value = suffix.trim();

  const bare = /^([0-9]+)$/.exec(value);
  if (bare !== null) {
    const width = inBounds(Number(bare[1]));
    if (width !== null) return { width, height: null, alt: null };
  }

  const pair = /^([0-9]+)x([0-9]+)$/.exec(value);
  if (pair !== null) {
    const width = inBounds(Number(pair[1]));
    const height = inBounds(Number(pair[2]));
    if (width !== null && height !== null) return { width, height, alt: null };
  }

  return { width: null, height: null, alt: value };
}

/**
 * The other direction: what to put after the pipe, or `null` for no pipe at all.
 *
 * A size wins over alt text when both are somehow set, because the two are mutually
 * exclusive by construction and a size is the half this app can actually have produced.
 * `""` comes back as `""`, which the caller must tell apart from `null` — see `alt`.
 */
export function writeEmbedField(field: EmbedField): string | null {
  if (field.width !== null) {
    return field.height === null ? String(field.width) : `${field.width}x${field.height}`;
  }
  return field.alt;
}

/**
 * The same field, but living on the end of a remote picture's alt text.
 *
 * `![Het logo|320](url)` — so unlike an embed there is no "the whole slot is alt text"
 * case to consider: the alt is the *head*, and only a tail that reads as a size is taken
 * off. `![Grafiek|kwartaal](url)` is therefore an alt text that happens to contain a pipe
 * and is left completely alone.
 *
 * The split is on the **last** pipe, an alt being allowed to contain several.
 */
export function splitSizeSuffix(value: string): {
  text: string;
  width: number | null;
  height: number | null;
} {
  const cut = value.lastIndexOf("|");
  if (cut === -1) return { text: value, width: null, height: null };

  const field = readEmbedField(value.slice(cut + 1));
  if (field.width === null) return { text: value, width: null, height: null };

  return { text: value.slice(0, cut).trimEnd(), width: field.width, height: field.height };
}

/** `Het logo` and `320` back into `Het logo|320`. */
export function withSizeSuffix(
  text: string,
  width: number | null,
  height: number | null,
): string {
  const suffix = writeEmbedField({ width, height, alt: null });
  return suffix === null ? text : `${text}|${suffix}`;
}

/**
 * A dimension as it may be stored: a whole number inside the bounds, or `null`.
 *
 * The editor decides one from a drag and the parser reads one off a file, and neither is
 * trusted to have got it right — a `setNodeMarkup` carrying a `NaN` would put an
 * unserialisable attribute in the document, and the schema validates nothing of its own.
 */
export function normaliseDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return inBounds(Math.round(value));
}
