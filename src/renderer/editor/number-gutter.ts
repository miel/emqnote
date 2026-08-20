import { Plugin } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";

/**
 * The numbered list's gutter grows to fit the widest number in the note.
 *
 * An `ol` marker box is right-aligned against the content edge, so a wider number grows
 * *leftwards*, out of the list's own `padding-left` and into whatever is to its left. At
 * the top level that is the editor's own 18px of padding, and past it is the window edge:
 * `1000.` was being cut in half. Measured at four times size, how far left of the text
 * column a marker's ink starts:
 *
 * | digits | 1 | 2 | 3 | 4 | 5 |
 * |---|---|---|---|---|---|
 * | reach | 1.90em | 2.54em | 3.16em | 3.80em | 4.40em |
 *
 * — one `ch` per digit plus two, near enough to write as a formula.
 *
 * **The floor stays 1.6em and the gutter grows only when the number would be clipped,**
 * rather than whenever the marker outgrows the gutter. It outgrows it immediately: even a
 * single digit reaches 1.90em into a 1.6em gutter, and every numbered list in the vault
 * has always leaned that little way into the padding beside it with nothing to show for
 * it. Sizing the gutter to contain the marker outright would have been the tidier rule
 * and would have moved the text of every numbered list already written — two digits by
 * fifteen pixels — to fix something no one can see. What is fixed here is the thing that
 * *is* visible: ink disappearing off the left of the window.
 *
 * Per note rather than per list, as asked: one gutter for every `ol` in the document, so
 * numbered text lines up on one column throughout.
 *
 * This reports a digit count and nothing else. The arithmetic is in `styles.css`, where
 * `1ch` is the width of a digit in whatever font is actually being used and `1.6em` is
 * already written down — a number computed here in pixels would be a second, staler copy
 * of both. Presentation only: nothing reaches the serializer and nothing reaches disk, so
 * there is no B6 or B10 question to answer, exactly as for `list-marker-style.ts`.
 */
export function widestNumberDigits(doc: PMNode): number {
  let widest = 1;

  doc.descendants((node) => {
    if (node.type !== schema.nodes.orderedList) return true;

    // The last item's number, which is the widest one the list will draw. `start` is an
    // attribute a note can carry (`3.` as the first line of a list is a legal thing to
    // write), so counting the items is not enough on its own.
    const start = typeof node.attrs.start === "number" ? node.attrs.start : 1;
    const last = start + node.childCount - 1;
    widest = Math.max(widest, String(Math.max(last, 1)).length);
    return true;
  });

  return widest;
}

export function numberGutter(): Plugin {
  return new Plugin({
    view: (view) => {
      const apply = (doc: PMNode): void => {
        view.dom.style.setProperty("--number-digits", String(widestNumberDigits(doc)));
      };

      apply(view.state.doc);
      return {
        update: (updated, previous) => {
          // A custom property on the editor's own element rather than a decoration: the
          // value is one number for the whole document, and a node decoration would put
          // the same string on every `ol` and rebuild them all on every keystroke.
          if (!updated.state.doc.eq(previous.doc)) apply(updated.state.doc);
        },
      };
    },
  });
}
