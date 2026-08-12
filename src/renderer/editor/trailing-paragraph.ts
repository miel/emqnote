import { Plugin } from "prosemirror-state";
import { schema } from "../../markdown/schema.js";

/**
 * There is always somewhere to type below the last block (B42).
 *
 * `doc` is `block+`, so a document may legitimately end in a table, a code block, a raw
 * HTML block or a rule — and when it does there is no text position after it. A table
 * inserted at the end of a note is therefore a note you cannot add a sentence to, short of
 * putting the caret back above the table and pushing it down. The user asked for this in
 * as many words, and it applies to all four block types for the same reason, so all four
 * get it.
 *
 * **This changes no file.** `withoutTrailingBlanks` in `to-mdast.ts` already strips
 * trailing empty paragraphs on the way out, which is what makes the invariant free: the
 * paragraph exists for the caret's benefit and never reaches disk. `roundtrip.test.ts`
 * stays byte-identical because of it, not in spite of it.
 *
 * `appendTransaction` is the right home, unlike `paste-images.ts`'s downloads, which its
 * own comment explains have to live in `view.update`. The distinction is that this is a
 * document invariant — a pure function of the doc, restored in the same dispatch cycle
 * that broke it — rather than a side effect with a network call behind it.
 */
const NEEDS_A_LINE_BELOW = new Set(["table", "codeBlock", "htmlBlock", "horizontalRule"]);

export function trailingParagraph(): Plugin {
  const paragraph = schema.nodes.paragraph!;

  return new Plugin({
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;

      const last = newState.doc.lastChild;
      if (last === null || !NEEDS_A_LINE_BELOW.has(last.type.name)) return null;

      return newState.tr.insert(newState.doc.content.size, paragraph.create());
    },
  });
}
