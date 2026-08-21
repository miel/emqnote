import { TextSelection, type Command } from "prosemirror-state";

/** Characters that can make `word#tag` fail the Markdown tag boundary rule. */
const WORD_CHARACTER = /[\p{L}\p{N}_/-]/u;

/**
 * Inserts the Tag button's `#` at the current body selection.
 *
 * Focus and remembered-caret restoration belong to the editor view; this command owns
 * only the document change and final selection, so iPhone and desktop can test and use
 * the same text rules.
 */
export const insertTagPrefix: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;

  if (!empty) {
    const selected = state.doc.textBetween(from, to, "\n", "\n").trim();
    const replacement = selected === "" ? "#" : `#${selected}`;
    if (dispatch) {
      const tr = state.tr.insertText(replacement, from, to);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, from + replacement.length)));
    }
    return true;
  }

  const previous = from > 0 ? state.doc.textBetween(from - 1, from, "", "") : "";
  if (previous === "#") return true;

  const replacement = WORD_CHARACTER.test(previous) ? " #" : "#";
  if (dispatch) {
    const tr = state.tr.insertText(replacement, from);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, from + replacement.length)));
  }
  return true;
};
