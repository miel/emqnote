import type { Node as PMNode } from "prosemirror-model";
import { serializeBody } from "./note.js";
import { extractTags, foldTag } from "./tags.js";

/**
 * Where the two tag stores meet.
 *
 * A note carries tags in two places — `tags:` in the frontmatter, typed in the header
 * field, and `#tag` in the body (B19). They used to be kept strictly apart on disk, and
 * B65 reverses half of that: the body's tags are now hoisted into the frontmatter when a
 * note is saved, so the header stops claiming a note has no tags while the list beside it
 * shows three.
 *
 * Everything that has to answer "which tags does this body carry?" goes through
 * `bodyTagsOf` — the two frontmatter builders that write the file, `openNote` deciding
 * which of a note's tags are the header's own, and both windows drawing the chips beside
 * the field. It is deliberately one function over the *serialized* markdown rather than a
 * walk of the ProseMirror document: `summarise()` reads tags off the bytes on disk, and a
 * second reading of the same syntax is how two answers to one question come to differ.
 *
 * A separate module rather than three more lines in `tags.ts`: `pipeline.ts` imports that
 * one, and reaching `note.ts` from it would close a cycle.
 */

/**
 * The `#tags` a document's body carries, in the order they appear, first-seen casing kept.
 *
 * Serializing the body to get at them costs a stringify, so this is never called per
 * keystroke — the two writers call it on an already debounced save, and the two windows
 * call it on load and on their own existing debounce.
 */
export function bodyTagsOf(doc: PMNode): string[] {
  return extractTags(serializeBody(doc));
}

/**
 * Frontmatter tags first, then whatever the body adds that is not already there.
 *
 * Folded when compared and unfolded when kept, the same rule `foldTag` states everywhere
 * else: `#KlantX` in a sentence and `klantx` in the header are one tag, and which of the
 * two spellings survives is decided by which was written down first.
 */
export function mergeTags(declared: string[], body: string[]): string[] {
  const seen = new Set(declared.map(foldTag));
  const merged = [...declared];

  for (const tag of body) {
    const key = foldTag(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }

  return merged;
}

/**
 * The tags the header field owns: what the frontmatter declares, minus what the body
 * already says.
 *
 * This is the whole of B65's provenance rule, and without it a hoisted tag can never be
 * removed. After one save the frontmatter holds the manual tags and the hoisted ones
 * indistinguishably, so a field showing all of them would keep writing `klantx` back long
 * after the `#klantx` that put it there was deleted from the note. Treating a tag that
 * appears in both places as the body's own makes deleting it in the note — the place it
 * is actually written — the way to remove it.
 */
export function manualTags(declared: string[], body: string[]): string[] {
  const fromBody = new Set(body.map(foldTag));
  return declared.filter((tag) => !fromBody.has(foldTag(tag)));
}
