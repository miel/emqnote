import type { Node as PMNode, NodeType, ResolvedPos } from "prosemirror-model";
import {
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { setBlockType, toggleMark, wrapIn, lift } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import { schema } from "../../markdown/schema.js";

type Dispatch = ((tr: Transaction) => void) | undefined;

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
      const tr = state.tr.setNodeMarkup(position, target, attrs);

      // Numbered task lists are not part of the dialect, so numbering a list of tasks
      // takes the boxes off rather than producing a shape that cannot be written to a
      // file. Only this list's own items: a nested bullet list under one of them stays
      // a bullet list, and its tasks stay tasks.
      if (target === orderedList) {
        let itemPos = position + 1;
        node.forEach((child) => {
          if (child.attrs.checked !== null) {
            tr.setNodeMarkup(itemPos, undefined, { ...child.attrs, checked: null });
          }
          itemPos += child.nodeSize;
        });
      }

      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

/**
 * The list items the selection actually sits in, innermost only.
 *
 * Walking `nodesBetween` for `listItem` nodes is the obvious version and it is wrong:
 * inside an item nested three deep, all three ancestors span the caret, so a toggle
 * would put a checkbox on the two parents as well. Going by the textblocks in range and
 * taking each one's immediate parent gives the items being *edited*, once each even
 * when an item holds several paragraphs.
 */
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

/**
 * Turns list items into tasks, or back into plain items.
 *
 * Deliberately an attribute on `listItem` and not a fourth list node: `checked` is how
 * both the file format and the editor schema already model this, and a third list type
 * would be a second definition of something markdown expresses one way. Because it only
 * touches item attributes it works at any depth without knowing anything about depth.
 *
 * Outside a list it starts one, and inside a numbered list it turns that list into
 * bullets first — numbered task lists are not admitted.
 *
 * A mixed selection resolves one way for all of it rather than flipping each item
 * separately, the way `toggleMark` does: half the selection ticking and the other half
 * clearing is not a gesture anyone means.
 */
export const toggleTask: Command = (state, dispatch) => {
  const list = findList(state.selection.$from);

  if (list === null) {
    return withList(wrapInList(bulletList!), state, dispatch);
  }
  if (list.type === orderedList) {
    return withList(toggleList(bulletList!), state, dispatch);
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

/**
 * Ticks and unticks. Returns false on anything that is not a task, so the key falls
 * through to whatever else wants it rather than silently doing nothing.
 */
export const toggleChecked: Command = (state, dispatch) => {
  const items = itemsInSelection(state).filter((item) => item.node.attrs.checked !== null);
  if (items.length === 0) return false;

  if (dispatch) {
    const tick = items.some((item) => item.node.attrs.checked === false);
    const tr = state.tr;
    for (const { pos, node } of items) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: tick });
    }
    dispatch(tr.scrollIntoView());
  }

  return true;
};

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
 * Moves an empty paragraph that sits directly after a list into that list's last item.
 *
 * This is what Tab on a fresh line is for. You finish a bullet, press Enter twice to
 * leave the list, and now want a paragraph that belongs *under* that bullet — the
 * "paragraph indented beneath a bullet" shape the design document calls out as the
 * ordinary way work notes are written. Markdown can express it; there was simply no
 * key for it.
 */
function indentIntoPrecedingList(state: EditorState, dispatch?: Dispatch): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== paragraph || $from.parent.content.size !== 0) {
    return false;
  }

  // Only for a top-level paragraph; inside a list item Tab already means something.
  if ($from.depth !== 1) return false;

  const paragraphPos = $from.before(1);
  const before = paragraphPos > 0 ? state.doc.resolve(paragraphPos).nodeBefore : null;
  if (before === null || (before.type !== bulletList && before.type !== orderedList)) {
    return false;
  }

  // The list ends where the paragraph begins. Its last two tokens are the closing
  // </li> and </ul>, so the final position *inside* the last item is two back from
  // there — that is where the paragraph has to land.
  const insertAt = paragraphPos - 2;
  if (insertAt <= paragraphPos - before.nodeSize) return false;

  if (dispatch) {
    const tr = state.tr;
    tr.delete(paragraphPos, paragraphPos + $from.parent.nodeSize);
    tr.insert(insertAt, paragraph!.create());
    tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
    dispatch(tr.scrollIntoView());
  }

  return true;
}

/**
 * Tab inside the editor never moves focus.
 *
 * That is not a nicety: pressing Tab twice used to walk the caret out of the note and
 * into the header fields, because a failed indent fell through to the browser. Inside
 * a list the key is always consumed, whether or not there was anywhere to indent to.
 */
export const tabIndent: Command = (state, dispatch) => {
  if (isInList(state)) {
    sinkListItem(listItem!)(state, dispatch);
    return true;
  }

  if (indentIntoPrecedingList(state, dispatch)) return true;

  return true;
};

export const tabOutdent: Command = (state, dispatch) => {
  if (isInList(state)) {
    liftListItem(listItem!)(state, dispatch);
    return true;
  }
  return true;
};

/** Is the caret on an empty block that is directly inside a list item? */
function onEmptyListItem(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.content.size !== 0) return false;

  const itemDepth = $from.depth - 1;
  return itemDepth >= 1 && $from.node(itemDepth).type === listItem;
}

/**
 * Leaves the list entirely and starts an ordinary paragraph.
 *
 * `splitListItem` promotes an empty item one level instead, so escaping a list nested
 * three deep took three presses of Enter and felt like the list refusing to end. One
 * press now ends it from any depth. Nothing is lost: Shift+Tab still promotes a level
 * at a time, and that is the key for it.
 *
 * Implemented as repeated lifts rather than one hand-built step: lifting a list item
 * correctly — closing the list, rejoining what is left, moving the children — is
 * exactly the fiddly work `liftListItem` already does well.
 */
export const exitList: Command = (state, dispatch) => {
  if (!isInList(state) || !onEmptyListItem(state)) return false;
  if (dispatch === undefined) return true;

  let current = state;
  for (let guard = 0; guard < 12 && isInList(current); guard += 1) {
    let next: EditorState | null = null;
    const lifted = liftListItem(listItem!)(current, (tr) => {
      next = current.apply(tr);
      dispatch(tr);
    });
    if (!lifted || next === null) break;
    current = next;
  }

  return true;
};

/**
 * Enter. Inside a list this splits the item; on an empty item it ends the list.
 *
 * The new item inherits the *shape* of the one it came from but never its tick: Enter
 * after a finished task starts the next task, not a second one already crossed off.
 * The attrs have to be chosen per press rather than passed always, because
 * `splitListItem`'s `itemAttrs` is static and would stamp `checked: false` — a
 * checkbox — onto every ordinary bullet.
 */
export const enter: Command = (state, dispatch) => {
  if (exitList(state, dispatch)) return true;
  if (!isInList(state)) return false;

  const item = enclosingItem(state.selection.$from);

  return item !== null && item.attrs.checked !== null
    ? splitListItem(listItem!, { checked: false })(state, dispatch)
    : splitListItem(listItem!)(state, dispatch);
};

/** The nearest list item around a position, if there is one. */
function enclosingItem($pos: ResolvedPos): PMNode | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type === listItem) return $pos.node(depth);
  }
  return null;
}

/**
 * Backspace at the very start of a list item promotes it, and at the top level takes
 * it out of the list.
 *
 * The default was `joinBackward`, which merged the item into the *previous item* as a
 * second paragraph: the text stayed indented, the bullet disappeared and the caret
 * ended up somewhere that belonged to neither item. Backspace at the start of a line
 * should undo structure, not quietly restructure two of them.
 */
export const backspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;

  const itemDepth = $from.depth - 1;
  if (itemDepth < 1 || $from.node(itemDepth).type !== listItem) return false;

  // Only the first block of the item; further down, Backspace is ordinary joining.
  if ($from.index(itemDepth) !== 0) return false;

  return liftListItem(listItem!)(state, dispatch);
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

export interface LinkTarget {
  href: string;
  from: number;
  to: number;
}

/**
 * The link at the caret, if there is one.
 *
 * Ctrl+K used to require a selection, which meant clicking inside an existing link and
 * pressing it did nothing at all — and selecting the link text opened an empty box
 * rather than the address already there. Both are the same missing piece: nobody was
 * looking for the mark under the caret.
 */
export function linkAt(state: EditorState): LinkTarget | null {
  const linkType = schema.marks.link!;
  const { $from } = state.selection;

  const marks = $from.marks();
  const mark =
    marks.find((candidate) => candidate.type === linkType) ??
    $from.nodeAfter?.marks.find((candidate) => candidate.type === linkType) ??
    null;

  if (mark === null) return null;

  // Walk out to both ends of the run carrying this exact link.
  const parentStart = $from.start();
  let from = $from.pos;
  let to = $from.pos;

  const carries = (pos: number): boolean => {
    const node = state.doc.resolve(pos).nodeAfter;
    return node !== null && node !== undefined && mark.isInSet(node.marks) !== undefined;
  };

  while (from > parentStart && carries(from - 1)) from -= 1;
  const parentEnd = $from.end();
  while (to < parentEnd && carries(to)) to += 1;

  return { href: mark.attrs.href as string, from, to };
}

/** Selects the whole link under the caret, so the dialog acts on all of it. */
export function selectLink(target: LinkTarget): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(
        state.tr.setSelection(TextSelection.create(state.doc, target.from, target.to)),
      );
    }
    return true;
  };
}

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

/** What a command needs from the window around it. Most need nothing. */
export interface CommandContext {
  openLinkPrompt: () => void;
}

/**
 * Every editor command, by the id the shortcut registry knows it under.
 *
 * The pairing lives here and the keys live in `src/shared/shortcuts.ts`; `outlookKeymap`
 * is what joins them. Uniformly a factory, even for the commands that ignore the
 * context, so that the lookup has one shape — the alternative is special-casing `link`,
 * which is the sort of exception that grows a second one.
 */
export const COMMANDS: Record<string, (context: CommandContext) => Command> = {
  strong: () => toggleStrong,
  em: () => toggleEm,
  underline: () => toggleUnderline,
  strike: () => toggleStrike,
  highlight: () => toggleHighlight,
  code: () => toggleCode,
  link: (context) => () => {
    context.openLinkPrompt();
    return true;
  },

  bulletList: () => toggleBulletList,
  orderedList: () => toggleOrderedList,
  task: () => toggleTask,
  tick: () => toggleChecked,
  indent: () => indent,
  outdent: () => outdent,

  heading1: () => setHeading(1),
  heading2: () => setHeading(2),
  heading3: () => setHeading(3),
  heading4: () => setHeading(4),
  heading5: () => setHeading(5),
  heading6: () => setHeading(6),
  paragraph: () => setParagraph,
  softBreak: () => softBreak,
  undo: () => undo,
  redo: () => redo,
};

export function isMarkActive(state: EditorState, markName: string): boolean {
  const type = schema.marks[markName];
  if (type === undefined) return false;

  const { from, $from, to, empty } = state.selection;
  return empty
    ? type.isInSet(state.storedMarks ?? $from.marks()) !== undefined
    : state.doc.rangeHasMark(from, to, type);
}
