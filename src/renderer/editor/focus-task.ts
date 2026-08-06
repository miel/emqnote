import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { taskItemsIn } from "../../markdown/schema.js";

/**
 * Moves the caret to the end of the `ordinal`-th task item's text — the same ordinal
 * `taskItemsIn` assigns everywhere else it is used (the index build, `toggleTask`), so
 * a row clicked in the Tasks view lands on the item it actually named.
 *
 * Never calls `view.focus()`: the Tasks view stays open beside the reader and keeps
 * whatever focus it already has, so this only moves the selection and scrolls it into
 * view, leaving the decision of whether to focus the editor to the caller.
 */
export function focusTaskAt(view: EditorView, ordinal: number): void {
  const item = taskItemsIn(view.state.doc)[ordinal];
  if (item === undefined) return;

  const paragraph = item.node.firstChild;
  if (paragraph === null) return;

  const pos = item.pos + 2 + paragraph.content.size;
  const selection = TextSelection.create(view.state.doc, pos);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
}
