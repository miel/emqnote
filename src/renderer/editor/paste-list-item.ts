import { Fragment, Slice, type Node as PMNode, type ResolvedPos } from "prosemirror-model";
import { canSplit } from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";
import { schema } from "../../markdown/schema.js";

/**
 * Pasting a task item into a list of tasks whose neighbour's box differs (B34).
 *
 * `listItem` is `defining: true` (`schema.ts:130`) — that is what lets a paragraph or
 * a nested list hang under a bullet without ProseMirror trying to merge unrelated
 * structure across it. `prosemirror-transform`'s `replaceRange`, which
 * `EditorState#tr.replaceSelection` uses whenever a pasted slice does not fit
 * trivially, reads that flag to decide when to back up and rebuild the surrounding
 * boundary instead of doing a plain insert. `checked` is only an attribute, but the
 * backup logic compares whole node markup (`sameMarkup`), so a pasted item whose box
 * differs from the item it lands in trips the same path a genuinely different block
 * type would. The rebuild it performs reuses one node identity for both the untouched
 * half of the target item and the freshly pasted one, so the pasted item's own box is
 * lost and the target's leaks across — the checkbox that flips is never the one the
 * user pasted.
 *
 * This does not try to out-think that generic algorithm for one attribute. When a
 * paste is unambiguously "one or more whole task items, landing inside another list
 * item, with at least one box that disagrees" — exactly the shape reported — it claims
 * the paste and does the insertion by hand instead: split the target item at the caret
 * (which, unlike the generic path, keeps the *same* node identity — and so the *same*
 * `checked` — on both halves, exactly as pressing Enter would) and insert the pasted
 * items, completely untouched, at the seam it just opened. Every other paste,
 * including a real text selection being replaced by pasted content, is left to the
 * default path, which already gets that case right — see the parity coverage in
 * `test/paste-task-list.test.ts`.
 */

/**
 * The slice's top-level `listItem`s, unwrapping a single `bulletList`/`orderedList`
 * if that is all the slice holds — `DOMParser` always wraps a pasted `<li>` in its
 * list, same-app clipboard round trips included. `null` for anything that is not
 * purely a run of list items, so mixed content (a heading, a table, plain text) is
 * left to the default path untouched.
 */
function listItemsIn(slice: Slice): PMNode[] | null {
  const top: PMNode[] = [];
  slice.content.forEach((node) => top.push(node));

  const isSoleList =
    top.length === 1 &&
    (top[0]!.type === schema.nodes.bulletList || top[0]!.type === schema.nodes.orderedList);

  const nodes = isSoleList
    ? (() => {
        const inner: PMNode[] = [];
        top[0]!.forEach((child) => inner.push(child));
        return inner;
      })()
    : top;

  if (nodes.length === 0) return null;
  return nodes.every((node) => node.type === schema.nodes.listItem) ? nodes : null;
}

/**
 * Whether `$pos` sits at the very first (`fromStart`) or very last content position
 * anywhere inside its depth-`itemDepth` ancestor, descending through every
 * intermediate level. Splitting right at either edge would only ever produce one real
 * half and one entirely empty one, so `handleListItemPaste` inserts directly instead —
 * the "before this item" / "after this item" case, not "the middle of it".
 */
function isAtItemEdge(
  $pos: ResolvedPos,
  itemDepth: number,
  fromStart: boolean,
): boolean {
  for (let depth = itemDepth + 1; depth <= $pos.depth; depth += 1) {
    const index = $pos.index(depth - 1);
    const atEdge = fromStart ? index === 0 : index === $pos.node(depth - 1).childCount - 1;
    if (!atEdge) return false;
  }
  return $pos.pos === (fromStart ? $pos.start($pos.depth) : $pos.end($pos.depth));
}

/**
 * `handlePaste` for the `EditorView`, composed alongside `handleAttachmentPaste` in
 * `Editor.tsx`. Declines (returns `false`) on anything that is not this one narrow
 * shape, so the ordinary text/HTML paste path — and the deferred Outlook `mso-list`
 * work that owns it — is untouched.
 */
export function handleListItemPaste(
  view: EditorView,
  _event: ClipboardEvent,
  slice: Slice,
): boolean {
  const { selection } = view.state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  let itemDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === schema.nodes.listItem) {
      itemDepth = depth;
      break;
    }
  }
  if (itemDepth === -1) return false;

  const items = listItemsIn(slice);
  if (items === null) return false;

  const targetChecked = $from.node(itemDepth).attrs.checked as boolean | null;
  if (!items.some((item) => item.attrs.checked !== targetChecked)) return false;

  const fragment = Fragment.from(items);
  const tr = view.state.tr;

  if (isAtItemEdge($from, itemDepth, true)) {
    // Caret at the very start of the item's own content: no split needed, the pasted
    // items simply land immediately before it.
    tr.insert($from.before(itemDepth), fragment);
  } else if (isAtItemEdge($from, itemDepth, false)) {
    // Symmetric case, at the end.
    tr.insert($from.after(itemDepth), fragment);
  } else {
    const splitDepth = $from.depth - itemDepth + 1;
    if (!canSplit(view.state.doc, $from.pos, splitDepth)) return false;

    const at = $from.pos;
    tr.split(at, splitDepth);

    // `tr.split` leaves the mapped position sitting *inside* the new second half — the
    // right place to continue typing (which is all `splitListItem`/Enter ever need),
    // but several levels too deep to insert whole `listItem`s into. `.before(itemDepth)`
    // walks that back out to the seam between the two split items, the actual
    // list-level gap.
    const seam = tr.doc.resolve(tr.mapping.map(at)).before(itemDepth);
    tr.insert(seam, fragment);
  }

  view.dispatch(tr.scrollIntoView().setMeta("paste", true));
  return true;
}
