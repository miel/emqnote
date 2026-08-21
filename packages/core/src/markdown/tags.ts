/**
 * What counts as a tag in the body of a note.
 *
 * This lives in `@emqnote/core/markdown` on purpose: the grammar of a
 * `#tag` inside a `.md` file is a dialect question, the same kind of question as what
 * `==` means. The serializer needs it to decide whether to escape a `#` at the start of
 * a line, and the vault scanner needs it to find tags — and those two must agree, or the
 * app would show tags it then quietly corrupts on the next save.
 *
 * The grammar follows Obsidian's, because the vault has to stay readable there (B7).
 */

/** A tag body: letters, digits, underscore, slash and hyphen. */
const TAG_BODY = String.raw`[\p{L}\p{N}_/-]+`;

/** Anchored at the `#`, for the serializer asking "is this a tag?" about one position. */
const AT_START = new RegExp(String.raw`^#(${TAG_BODY})`, "u");

/**
 * A `#` only opens a tag at the start of a line or after whitespace, `(` or `[`. That is
 * what keeps `https://example.com/#anchor` and `pad#tag` out of it.
 */
const IN_TEXT = new RegExp(String.raw`(?:^|[\s(\[])#(${TAG_BODY})`, "gu");

const TRAILING_SLASH = /\/+$/;
const HAS_NON_DIGIT = /[^\p{N}]/u;

/** Everything a tag cannot hide inside. */
const INLINE_CODE = /`[^`]*`/g;
const LINK_DESTINATION = /\]\([^)]*\)/g;
const WIKI_LINK = /\[\[[^\]]*\]\]/g;
const URL = /\b(?:[a-z][a-z0-9+.-]*:\/\/|mailto:)\S+/gi;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * A tag name must contain something that is not a digit.
 *
 * Without that rule `#1` in "#1 prioriteit" and `#2026` would both be tags, and a list
 * that starts with a number would fill the tag panel with noise.
 */
function isTagName(body: string): boolean {
  const name = body.replace(TRAILING_SLASH, "");
  return name !== "" && HAS_NON_DIGIT.test(name);
}

/**
 * Does a tag start exactly here? `text` must begin at the `#`.
 *
 * Used by the serializer, which has already found a `#` at the start of a line and needs
 * to know whether leaving it unescaped is safe. It is: CommonMark only reads `#` as a
 * heading when a space, tab or line end follows, so `#klantx` at column 0 is a paragraph
 * either way.
 */
export function startsWithTag(text: string): boolean {
  const match = AT_START.exec(text);
  return match !== null && isTagName(match[1]!);
}

/** Tags are grouped case-insensitively, the same way attendee names are. */
export function foldTag(name: string): string {
  return name.toLowerCase();
}

/** Strips a leading `#` and the surrounding noise from something typed in a tag field. */
export function cleanTagInput(text: string): string {
  return text.trim().replace(/^#+/, "").replace(TRAILING_SLASH, "");
}

export interface FoundTag {
  name: string;
  /** Offset of the `#`, and one past the last character of the name. */
  start: number;
  end: number;
}

/**
 * Blanks a stretch of text without moving anything after it.
 *
 * Equal-length spaces rather than a single one, because the editor highlights tags by
 * offset: collapsing a code span to one space would shift every position after it and
 * the colour would land on the wrong words.
 */
function mask(line: string, pattern: RegExp): string {
  return line.replace(pattern, (found) => " ".repeat(found.length));
}

/**
 * Every tag on a single line, with where it sits.
 *
 * Code, links and wiki links are blanked first: a `#` in a URL fragment or in
 * `[[Notitie#Kop]]` is an anchor, not a tag, and a `#` inside a code span is whatever the
 * code says it is.
 *
 * One line at a time, because both callers work that way — the editor gets one text node
 * per block, and the scanner needs to track fenced code across lines itself.
 */
export function findTags(line: string): FoundTag[] {
  let scannable = mask(line, INLINE_CODE);
  scannable = mask(scannable, WIKI_LINK);
  scannable = mask(scannable, LINK_DESTINATION);
  scannable = mask(scannable, URL);

  const found: FoundTag[] = [];

  for (const match of scannable.matchAll(IN_TEXT)) {
    const name = match[1]!.replace(TRAILING_SLASH, "");
    if (!isTagName(name)) continue;

    // The match includes the boundary character before the `#`, except at line start.
    const hash = match.index + match[0]!.length - match[1]!.length - 1;
    found.push({ name, start: hash, end: hash + 1 + name.length });
  }

  return found;
}

/** Every tag in a note body, in the order they appear, first-seen casing kept. */
export function extractTags(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  let fence: string | null = null;

  for (const line of body.split("\n")) {
    const opener = FENCE.exec(line);
    if (opener !== null) {
      const marker = opener[1]![0]!;
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    for (const tag of findTags(line)) {
      const key = foldTag(tag.name);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(tag.name);
    }
  }

  return found;
}
