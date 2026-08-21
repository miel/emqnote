import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "@emqnote/core/markdown/schema";

/**
 * Shows a link's address as a hover tooltip (B33) — the only thing on screen telling
 * you what Mod+click would open before you click it.
 *
 * A decoration, deliberately, and not `schema.ts`'s own `toDOM`: that `toDOM` is also
 * what `_serializeForClipboard` uses to build the HTML a copy puts on the clipboard,
 * so writing the href into `title` there would mean copying a link with no title and
 * pasting it back (same app, same document even) hands the mark a title it never had —
 * a real, saved corruption the next time the note writes, not just a display artefact.
 * Decorations live beside the document (`tag-decoration.ts` makes the same argument for
 * `#tag` colouring) and are never part of what gets copied or serialized.
 *
 * `href` wins when the link carries its own `[text](url "title")` title already — this
 * only fills the gap for the far more common case of a bare link.
 */

const key = new PluginKey<DecorationSet>("linkTitle");

function build(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  const linkType = schema.marks.link!;

  doc.descendants((node, pos) => {
    if (!node.isText) return true;

    const link = node.marks.find((mark) => mark.type === linkType);
    if (link === undefined) return true;
    if (link.attrs.title !== null && link.attrs.title !== "") return true;

    decorations.push(
      Decoration.inline(pos, pos + node.nodeSize, { title: link.attrs.href as string }),
    );

    return true;
  });

  return DecorationSet.create(doc, decorations);
}

/** Rebuilt on every change, same reasoning and the same measured cost as `tagHighlight`. */
export function linkTitleHint(): Plugin {
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
