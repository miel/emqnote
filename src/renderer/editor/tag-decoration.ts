import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import { findTags } from "../../markdown/tags.js";

/**
 * Colours `#tag` in the body while you type.
 *
 * Decorations, deliberately, and not a mark or a node: a tag is a property of ordinary
 * text and must stay ordinary text. Decorations live beside the document and never enter
 * it, so nothing here can reach the serializer or the round trip — see B19.
 *
 * That also means there is nothing to maintain when text is edited: the tag stops being
 * one the moment the character that made it disappears, with no stale mark left behind.
 */

const key = new PluginKey<DecorationSet>("tagHighlight");

function build(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    // Code blocks and raw HTML blocks: a `#` in there belongs to the code.
    if (node.type.spec.code === true) return false;
    if (!node.isText) return true;
    if (node.marks.some((mark) => mark.type === schema.marks.code)) return true;

    for (const tag of findTags(node.text ?? "")) {
      decorations.push(Decoration.inline(pos + tag.start, pos + tag.end, { class: "tag" }));
    }

    return true;
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * Rebuilds the whole set on every change rather than mapping and patching ranges.
 *
 * Measured at 0.027 ms on the largest note in the corpus (3.3 kB), against a 16 ms
 * keystroke-to-glyph budget, and it scales linearly with the text — a 100 kB note would
 * still cost well under a millisecond. The incremental version has to map step ranges
 * through the remaining maps to reach final coordinates, which is exactly the kind of
 * code that silently leaves one tag uncoloured. Not worth it at note size.
 */
export function tagHighlight(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, set) => (tr.docChanged ? build(tr.doc) : set),
    },
    props: {
      decorations: (state) => key.getState(state),
    },
  });
}
