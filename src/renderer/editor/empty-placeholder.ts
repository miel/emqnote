import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";

/**
 * "Just type." under the caret of an empty note, since `contenteditable` has no
 * placeholder of its own.
 *
 * **This has to come from the view; CSS cannot do it.** The first attempt was a
 * stylesheet rule alone — `data-placeholder` written onto the contenteditable root by
 * `Editor.tsx`, read back by `.editor-content p:only-child:empty::before` with `attr()` —
 * and it drew nothing at all, for two independent reasons. `attr()` reads the attributes
 * of the element its pseudo-element hangs off and no others, so the paragraph was asked
 * for an attribute only its parent had, which yields the empty string rather than an
 * error. And `:empty` never matches a ProseMirror paragraph in the first place: an empty
 * textblock carries a trailing `<br>` so the caret has somewhere to sit, and an element
 * child is exactly what `:empty` excludes.
 *
 * Neither is fixable in the sheet. CSS cannot match on text content, so no selector can
 * tell an empty paragraph from one holding the word "a" — the emptiness has to be decided
 * where the document is, and carried out to the DOM. A decoration is how ProseMirror
 * carries anything out to the DOM without putting it in the document, which is the same
 * reason `tag-decoration.ts` is one: nothing here can reach the serializer, so no
 * placeholder can ever be written to a file.
 *
 * The text travels *in* the decoration rather than being looked up by the sheet, so the
 * attribute lands on the very element whose `::before` reads it.
 */

/**
 * A document nobody has typed in yet: one paragraph, holding nothing.
 *
 * Deliberately narrower than "the document has no text". A note whose last block is a
 * table has an empty paragraph appended after it by `trailing-paragraph.ts` for the
 * caret's benefit, and a note that opens on a picture has an empty paragraph of its own;
 * neither is an empty note, and prompting "Just type." underneath the content already
 * there would be nonsense. `childCount === 1` is what keeps them apart, and it is also
 * why this is O(1) — see the plugin below, which recomputes it on every draw.
 */
function isBlank(doc: PMNode): boolean {
  const first = doc.firstChild;
  return doc.childCount === 1 && first !== null && first.type === schema.nodes.paragraph
    && first.content.size === 0;
}

/**
 * `read` rather than a string, for the reason `Editor.tsx` holds its handlers in a ref:
 * the view is created once and lives as long as the window, so a placeholder captured at
 * mount would still be in the language the app started in after a locale change.
 *
 * No plugin state and no cache, unlike `tag-decoration.ts`, which walks the whole document
 * to build its set and so has to be told when to do it again. `isBlank` looks at one node
 * and answers in constant time, which is cheaper than the bookkeeping that would decide
 * whether to call it — and recomputing on every draw is what lets the text follow `read`
 * immediately instead of waiting for the next transaction to invalidate something.
 */
export function emptyPlaceholder(read: () => string | undefined): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => {
        if (!isBlank(state.doc)) return null;

        const text = read();
        if (text === undefined || text === "") return null;

        return DecorationSet.create(state.doc, [
          Decoration.node(0, state.doc.firstChild!.nodeSize, { "data-placeholder": text }),
        ]);
      },
    },
  });
}
