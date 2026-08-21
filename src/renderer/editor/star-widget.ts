import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "@emqnote/core/markdown/schema";
import { markerAnchor } from "./marker-widget.js";

/**
 * B72's star, drawn into the marker slot.
 *
 * A widget rather than the `::before` B72 shipped, and the reason is `markerAnchor`'s:
 * `listItem` is `paragraph block*`, so an inline pseudo-element on the `li` is wrapped in
 * an anonymous block of its own and cannot join the paragraph's first line box — which is
 * why it had to be absolutely positioned against the item, and why it stayed at the top of
 * the item when a pasted picture took the bullet and the text down to the bottom of the
 * line. A widget goes inside the paragraph, where the line box is.
 *
 * **Nothing about the file format moves with it.** The star is still the `starred`
 * attribute and still reaches disk as a `⭐ ` prefix through `pipeline.ts`; a widget is not
 * content, so Backspace, Home, select-all, `clipboard-text.ts`, `plainText()`, the excerpt
 * and the Tasks view all go on treating a starred item as the ordinary bullet it is,
 * exactly as B72 requires. What was a display decision stays a display decision.
 *
 * Not merged into `checkbox.ts`'s pass even though the two never appear on the same item
 * (`toggleStar` clears `checked`, `toggleTask` and `toggleList` clear `starred`): that
 * file is about a control — hit testing, `aria-checked`, a click that dispatches — and
 * this is a glyph. They share the anchor, which is the part that has to agree.
 */

const key = new PluginKey<DecorationSet>("starMarkers");

function render(): HTMLElement {
  const star = document.createElement("span");
  star.className = "star-mark";
  star.setAttribute("aria-hidden", "true");
  star.textContent = "⭐";
  return markerAnchor(star);
}

function build(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.listItem) return true;
    if (node.attrs.starred !== true) return true;

    decorations.push(
      // Into the paragraph, not into the item — see `checkbox.ts` for the difference the
      // extra step makes.
      Decoration.widget(pos + 2, render, {
        side: -1,
        stopEvent: () => true,
        ignoreSelection: true,
        key: "star",
      }),
    );

    return true;
  });

  return DecorationSet.create(doc, decorations);
}

export function starMarkers(): Plugin {
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
