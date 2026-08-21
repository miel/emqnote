import { Fragment, Slice, type Node as PMNode } from "prosemirror-model";
import { schema } from "@emqnote/core/markdown/schema";
import { matchWikiSyntax } from "@emqnote/core/markdown/normalize-phrasing";

/**
 * A pasted `![[foto.png]]` or `[[01 Projecten/Alpha.md|Alpha]]` becomes the node it names,
 * at the moment it is pasted.
 *
 * Before this it stayed literal text. Nothing in the editor claimed a plain-text paste, so
 * ProseMirror's stock parser put the characters in as characters — and they only turned
 * into a picture or a chip on the way back *off disk*, where `normalize-phrasing.ts` reads
 * the same syntax when a file is parsed. Which is why the app's own **Copy link** appeared
 * to do nothing until the note was closed and opened again: the file was right all along,
 * the screen was a save and a reload behind it.
 *
 * This is deliberately not a markdown parse on paste. `state.ts`'s `autoformat` refuses
 * markdown spellings on principle — `**bold**` pastes as five characters and two asterisks,
 * and still does. The `[[…]]` family is the exception for two reasons: it is the syntax this
 * app itself puts on the clipboard, and it is the only one where the literal text is not a
 * plainer rendering of the same thing but a broken one — a picture that is not there.
 *
 * The syntax itself is not spelled out here. `matchWikiSyntax` is the parser's own matcher,
 * exported for exactly this: two spellings of one syntax is how a paste and a reopen come to
 * disagree about the same characters.
 */

/**
 * Splits one text node around every wiki match in it, or answers `null` when there is
 * nothing to split — so an untouched node stays the very same object.
 */
function splitText(node: PMNode): PMNode[] | null {
  const value = node.text ?? "";
  let match = matchWikiSyntax(value);
  if (match === null) return null;

  const pieces: PMNode[] = [];
  let index = 0;

  while (match !== null) {
    if (match.index > index) {
      pieces.push(schema.text(value.slice(index, match.index), node.marks));
    }

    // Marks carried over, the same as `from-mdast.ts` does when it builds these two out
    // of a parsed file: a link inside a bold run stays inside it.
    pieces.push(
      match.embed
        ? schema.nodes.wikiEmbed!.create(
            { target: match.target, ...match.field },
            null,
            node.marks,
          )
        : schema.nodes.wikiLink!.create(
            { target: match.target, alias: match.alias },
            null,
            node.marks,
          ),
    );

    index = match.index + match.length;
    match = matchWikiSyntax(value, index);
  }

  if (index < value.length) pieces.push(schema.text(value.slice(index), node.marks));
  return pieces;
}

function mapFragment(fragment: Fragment, insideCode: boolean): Fragment {
  const children: PMNode[] = [];
  let changed = false;

  fragment.forEach((child) => {
    if (child.isText && !insideCode) {
      const pieces = splitText(child);
      if (pieces !== null) {
        children.push(...pieces);
        changed = true;
        return;
      }
    }

    if (child.content.size === 0) {
      children.push(child);
      return;
    }

    // `spec.code` is what tells a code block from a paragraph, and inside one these are
    // not nodes at all — the whole point of a fenced block is that its contents are the
    // characters that are in it. A table cell is `inline*` and holds them happily.
    const mapped = mapFragment(child.content, insideCode || child.type.spec.code === true);
    if (mapped === child.content) {
      children.push(child);
      return;
    }

    children.push(child.copy(mapped));
    changed = true;
  });

  return changed ? Fragment.fromArray(children) : fragment;
}

/**
 * `transformPasted`, composed with `transformPastedImages` — see `Editor.tsx`.
 *
 * The open depths are carried over untouched: every replacement swaps inline content for
 * inline content inside the node that already held it, so the slice's shape is unchanged.
 */
export function transformPastedWikiSyntax(slice: Slice): Slice {
  const content = mapFragment(slice.content, false);
  return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
}
