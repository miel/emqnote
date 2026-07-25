import type { NodeType, ResolvedPos } from "prosemirror-model";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import { setBlockType, toggleMark, wrapIn, lift } from "prosemirror-commands";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import { schema } from "../../markdown/schema.js";

const { bulletList, orderedList, listItem, paragraph, heading, hardBreak, blockquote } =
  schema.nodes;

/**
 * The editing commands behind the Outlook shortcuts.
 *
 * Two of these are the whole reason this project exists, so they get the attention:
 * `toggleList` can change the type of a list that already exists — that is what makes
 * bullets and numbering mixable across levels — and `indent`/`outdent` work wherever
 * the caret happens to sit inside the item, not only at its start.
 */

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

/**
 * Turns the list on, off, or into the other kind.
 *
 * The third case is the interesting one. Pressing "numbered list" inside an existing
 * bulleted list does not nest a new list and does not unwrap first — it retypes the
 * list node in place, so the items and their children stay exactly where they are.
 * Without that, a mixed outline is impossible to type.
 */
export function toggleList(target: NodeType): Command {
  return (state, dispatch) => {
    const current = findList(state.selection.$from);

    if (current === null) {
      return wrapInList(target)(state, dispatch);
    }

    if (current.type === target) {
      return liftListItem(listItem!)(state, dispatch);
    }

    if (dispatch) {
      const $from = state.selection.$from;
      const position = $from.before(current.depth);
      const node = state.doc.nodeAt(position)!;
      const attrs = target === orderedList ? { start: 1 } : null;
      dispatch(state.tr.setNodeMarkup(position, target, attrs).scrollIntoView());
    }

    return true;
  };
}

/**
 * Indent. Inside a list this sinks the item one level; outside one it falls back to a
 * blockquote, which is the only indentation markdown can express.
 */
export const indent: Command = (state, dispatch) => {
  if (isInList(state)) return sinkListItem(listItem!)(state, dispatch);
  return wrapIn(blockquote!)(state, dispatch);
};

export const outdent: Command = (state, dispatch) => {
  if (isInList(state)) return liftListItem(listItem!)(state, dispatch);
  return lift(state, dispatch);
};

/**
 * Tab inside the editor never moves focus.
 *
 * Outside a list there is nothing sensible to indent — the dialect has no paragraph
 * indentation — so the key is swallowed rather than handed to the browser, which would
 * otherwise tab away to the next control and lose the caret.
 */
export const tabIndent: Command = (state, dispatch) => {
  if (isInList(state)) return sinkListItem(listItem!)(state, dispatch);
  return true;
};

export const tabOutdent: Command = (state, dispatch) => {
  if (isInList(state)) return liftListItem(listItem!)(state, dispatch);
  return true;
};

/**
 * Enter. Inside a list this splits the item; on an empty item `splitListItem` lifts it
 * one level instead, and at the top level that leaves the list altogether — exactly
 * the behaviour Word and Outlook have.
 */
export const enter: Command = (state, dispatch) => {
  if (isInList(state)) return splitListItem(listItem!)(state, dispatch);
  return false;
};

/** Shift+Enter: a soft break inside the same paragraph or list item. */
export const softBreak: Command = (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(hardBreak!.create()).scrollIntoView());
  }
  return true;
};

export function setHeading(level: number): Command {
  return setBlockType(heading!, { level });
}

export const setParagraph: Command = setBlockType(paragraph!);

export const toggleStrong = toggleMark(schema.marks.strong!);
export const toggleEm = toggleMark(schema.marks.em!);
export const toggleUnderline = toggleMark(schema.marks.underline!);
export const toggleStrike = toggleMark(schema.marks.strike!);
export const toggleHighlight = toggleMark(schema.marks.highlight!);
export const toggleCode = toggleMark(schema.marks.code!);

export const toggleBulletList = toggleList(bulletList!);
export const toggleOrderedList = toggleList(orderedList!);

/** Applies a link to the selection, or removes it when `href` is empty. */
export function applyLink(href: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;

    if (dispatch) {
      const tr: Transaction = state.tr.removeMark(from, to, schema.marks.link!);
      if (href !== "") {
        tr.addMark(from, to, schema.marks.link!.create({ href, title: null }));
      }
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function isMarkActive(state: EditorState, markName: string): boolean {
  const type = schema.marks[markName];
  if (type === undefined) return false;

  const { from, $from, to, empty } = state.selection;
  return empty
    ? type.isInSet(state.storedMarks ?? $from.marks()) !== undefined
    : state.doc.rangeHasMark(from, to, type);
}
