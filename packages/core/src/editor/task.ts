import type { Node as PMNode, NodeType, ResolvedPos } from "prosemirror-model";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import { liftListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { schema } from "../markdown/schema.js";

type Dispatch = ((tr: Transaction) => void) | undefined;

const { bulletList, orderedList, listItem } = schema.nodes;

/** Walks up from the caret to the nearest list, returning its depth and node. */
function findList($pos: ResolvedPos): { depth: number; type: NodeType } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type === bulletList || node.type === orderedList) {
      return { depth, type: node.type };
    }
  }
  return null;
}

function isInList(state: EditorState): boolean {
  return findList(state.selection.$from) !== null;
}

/** The innermost list items touched by the selection, once each. */
function itemsInSelection(state: EditorState): { pos: number; node: PMNode }[] {
  const { from, to } = state.selection;
  const found = new Map<number, PMNode>();

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const $pos = state.doc.resolve(pos);
    if ($pos.depth >= 1 && $pos.parent.type === listItem) {
      found.set($pos.before($pos.depth), $pos.parent);
    }
    return true;
  });

  return [...found].map(([pos, node]) => ({ pos, node }));
}

/** Converts the nearest ordered list to bullets without changing its contents. */
const convertToBulletList: Command = (state, dispatch) => {
  const current = findList(state.selection.$from);
  if (current === null || current.type !== orderedList) return false;

  if (dispatch) {
    const position = state.selection.$from.before(current.depth);
    dispatch(state.tr.setNodeMarkup(position, bulletList, null).scrollIntoView());
  }
  return true;
};

/**
 * Turns selected list items into tasks, or back into plain items.
 *
 * Outside a list it starts one. Inside an ordered list it first converts that list to
 * bullets, because numbered task lists are not part of the emqnote dialect.
 */
export const toggleTask: Command = (state, dispatch) => {
  const list = findList(state.selection.$from);

  if (list === null) {
    return withList(wrapInList(bulletList!), state, dispatch);
  }
  if (list.type === orderedList) {
    return withList(convertToBulletList, state, dispatch);
  }

  const items = itemsInSelection(state);
  if (items.length === 0) return false;

  if (dispatch) {
    const becomeTasks = items.some((item) => item.node.attrs.checked === null);
    const tr = state.tr;
    for (const { pos, node } of items) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: becomeTasks ? false : null,
        // A checkbox and a star occupy the same marker position in the dialect.
        starred: becomeTasks ? false : (node.attrs.starred as boolean),
      });
    }
    dispatch(tr.scrollIntoView());
  }

  return true;
};

/** Runs `first`, then puts boxes on whatever list it left behind. */
function withList(first: Command, state: EditorState, dispatch: Dispatch): boolean {
  if (dispatch === undefined) return first(state, undefined);

  let after: EditorState | null = null;
  const ok = first(state, (tr) => {
    after = state.apply(tr);
    dispatch(tr);
  });

  if (!ok || after === null) return ok;
  return toggleTask(after, dispatch);
}

/** A textblock that is visually blank, including one containing only whitespace. */
function drawsBlank(node: PMNode): boolean {
  if (!node.isTextblock) return false;

  let blank = true;
  node.forEach((child) => {
    if (!child.isText || child.text!.trim() !== "") blank = false;
  });
  return blank;
}

/** Is the caret on a blank block directly inside a list item? */
function onEmptyListItem(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  if (!empty || !drawsBlank($from.parent)) return false;

  const itemDepth = $from.depth - 1;
  return itemDepth >= 1 && $from.node(itemDepth).type === listItem;
}

/** The outermost list around a position. */
function outermostListDepth($pos: ResolvedPos): number | null {
  let found: number | null = null;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const type = $pos.node(depth).type;
    if (type === bulletList || type === orderedList) found = depth;
  }
  return found;
}

/** Whether lifting the current item all the way out would preserve the nested tail. */
function nothingIsFlattened($from: ResolvedPos): boolean {
  const outermost = outermostListDepth($from);
  if (outermost === null) return true;

  for (let depth = $from.depth; depth >= outermost + 2; depth -= 1) {
    if ($from.index(depth - 1) !== $from.node(depth - 1).childCount - 1) return false;
  }
  return true;
}

/**
 * Leaves a list from a blank item. It climbs out in one press when that is structurally
 * safe, or one level at a time when a nested tail would otherwise be flattened.
 */
export const exitList: Command = (state, dispatch) => {
  if (!isInList(state) || !onEmptyListItem(state)) return false;
  if (!liftListItem(listItem!)(state, undefined)) return false;
  if (dispatch === undefined) return true;

  let current = state;
  const dispatchInto = (tr: Transaction): void => {
    current = current.apply(tr);
    dispatch(tr);
  };

  if (current.selection.$from.parent.content.size !== 0) {
    const { $from } = current.selection;
    dispatchInto(current.tr.delete($from.start(), $from.end()));
  }

  const climbOut = nothingIsFlattened(current.selection.$from);
  for (let guard = 0; guard < 12 && isInList(current); guard += 1) {
    const before = current;
    liftListItem(listItem!)(current, dispatchInto);
    if (current === before || !climbOut) break;
  }

  return true;
};

/** The depth of the nearest list item around a position. */
function itemDepthOf($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type === listItem) return depth;
  }
  return null;
}

function enclosingItem($pos: ResolvedPos): PMNode | null {
  const depth = itemDepthOf($pos);
  return depth === null ? null : $pos.node(depth);
}

/** The marker a starred item interrupted, for Enter to carry on with. */
function markerBeforeStar($from: ResolvedPos): boolean | null {
  const depth = itemDepthOf($from);
  if (depth === null) return null;

  const list = $from.node(depth - 1);
  for (let index = $from.index(depth - 1) - 1; index >= 0; index -= 1) {
    const sibling = list.child(index);
    if (sibling.attrs.starred === true) continue;
    return sibling.attrs.checked === null ? null : false;
  }
  return null;
}

/**
 * List-aware Enter behavior shared by desktop and mobile.
 *
 * A task creates another unchecked task. A visually blank item exits the list. Stars do
 * not spread to the next row, which resumes the marker that the star interrupted.
 */
export const enter: Command = (state, dispatch) => {
  if (exitList(state, dispatch)) return true;
  if (!isInList(state)) return false;

  const item = enclosingItem(state.selection.$from);
  if (item === null) return splitListItem(listItem!)(state, dispatch);
  if (item.attrs.checked !== null) {
    return splitListItem(listItem!, { checked: false })(state, dispatch);
  }
  if (item.attrs.starred === true) {
    const checked = markerBeforeStar(state.selection.$from);
    return splitListItem(listItem!, { checked, starred: false })(state, dispatch);
  }
  return splitListItem(listItem!)(state, dispatch);
};
