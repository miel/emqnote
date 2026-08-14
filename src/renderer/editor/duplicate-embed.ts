import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 * Obsidian writes a PDF twice, and the note should not read that way (B48).
 *
 * Inserting an attachment there produces both spellings of the same target — the embed
 * `![[99 - Attachments/offerte.pdf]]` and, beside it, the plain link
 * `[[99 - Attachments/offerte.pdf]]`. Read here that is a full page followed by a chip
 * pointing at the page directly above it, on every such note in an imported vault.
 *
 * **The file keeps both.** This is a `DecorationSet` and nothing else, so there is no
 * question of B10 or B6 to answer: nothing is rewritten, nothing is dropped on save, and
 * a vault shared with Obsidian goes on saying exactly what Obsidian expects. Hiding is
 * also the reversible half of the choice — the node is still a real inline atom sitting
 * in the document, so Backspace over it removes it for good if that is what was wanted.
 *
 * **Adjacent only.** A link and an embed at opposite ends of a long note are two
 * deliberate mentions of one file, and silently swallowing the second would be this
 * plugin deciding something it cannot know. The pair Obsidian writes is always
 * neighbours, so that is the whole of what is matched: same paragraph, nothing between
 * them but whitespace or a line break, in either order.
 */
export const DUPLICATE_LINK_CLASS = "wiki-link-duplicated";

/** Exported so a test can read the set back without mounting a view. */
export const duplicateEmbedKey = new PluginKey<DecorationSet>("duplicateEmbed");

/** Text that may sit between the pair without making them non-adjacent. */
function isGap(node: PMNode): boolean {
  if (node.type.name === "hardBreak") return true;
  return node.isText && node.text !== undefined && node.text.trim() === "";
}

/**
 * The positions of every `wikiLink` that stands next to a `wikiEmbed` of the same target.
 *
 * One pass per textblock, comparing each link against its nearest non-gap neighbour on
 * each side. Deliberately not a document-wide map of targets: that is the "anywhere in
 * the note" rule this decided against, and it would also make the answer depend on text
 * the reader cannot see from where the chip is.
 */
function duplicatedLinks(doc: PMNode): Decoration[] {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    const children: { node: PMNode; pos: number }[] = [];
    node.forEach((child, offset) => children.push({ node: child, pos: pos + 1 + offset }));

    /** The next entry either side that is not whitespace — the actual neighbour. */
    const neighbour = (index: number, step: number): PMNode | null => {
      for (let at = index + step; at >= 0 && at < children.length; at += step) {
        const candidate = children[at]!.node;
        if (!isGap(candidate)) return candidate;
      }
      return null;
    };

    children.forEach((child, index) => {
      if (child.node.type.name !== "wikiLink") return;
      const target = child.node.attrs.target as string;

      const embedded = [neighbour(index, -1), neighbour(index, 1)].some(
        (side) => side !== null && side.type.name === "wikiEmbed" && side.attrs.target === target,
      );
      if (!embedded) return;

      decorations.push(
        Decoration.node(child.pos, child.pos + child.node.nodeSize, {
          class: DUPLICATE_LINK_CLASS,
        }),
      );
    });

    return false;
  });

  return decorations;
}

export function duplicateEmbedLinks(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: duplicateEmbedKey,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, duplicatedLinks(state.doc)),
      // Recomputed rather than mapped: a decoration that merely moves with the text would
      // outlive the pairing it stands for — deleting the embed has to bring its link back,
      // and mapping cannot tell that from the chip having shifted along a line.
      apply: (tr, decorations) =>
        tr.docChanged ? DecorationSet.create(tr.doc, duplicatedLinks(tr.doc)) : decorations,
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
