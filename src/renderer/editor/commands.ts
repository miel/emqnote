import type { Node as PMNode, NodeType, ResolvedPos } from "prosemirror-model";
import {
  NodeSelection,
  Selection,
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
// Only the type travels back the other way (`CommandContext`), so this pair is not a
// runtime cycle — `import type` is erased.
import { openFind } from "./find-in-note.js";

type Dispatch = ((tr: Transaction) => void) | undefined;

const {
  bulletList,
  orderedList,
  listItem,
  paragraph,
  heading,
  hardBreak,
  blockquote,
  horizontalRule,
  wikiEmbed,
  wikiLink,
} = schema.nodes;

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
      // file. A star goes the same way and for the same reason (B72): in a numbered list
      // the number is the marker, so there is nowhere for one to stand, and `to-mdast.ts`
      // would drop it on the next save anyway — better it leave visibly, here, than
      // silently, there. Only this list's own items: a nested bullet list under one of
      // them stays a bullet list, and its tasks and stars stay as they are.
      if (target === orderedList) {
        let itemPos = position + 1;
        node.forEach((child) => {
          if (child.attrs.checked !== null || child.attrs.starred === true) {
            tr.setNodeMarkup(itemPos, undefined, {
              ...child.attrs,
              checked: null,
              starred: false,
            });
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
 * Whether the selection touches a heading at all.
 *
 * A heading is always a textblock, never an ancestor of one, so this asks the plain
 * question and stops on the first hit.
 */
function selectionHasHeading(state: EditorState): boolean {
  const { from, to } = state.selection;
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.type === heading) found = true;
    return !found;
  });
  return found;
}

/**
 * Runs a command that cannot see a heading, having first turned the headings in the
 * selection into paragraphs — in **one** transaction.
 *
 * This is the fix for a silent refusal. `listItem`'s content is `paragraph block*`
 * (`schema.ts`), so a `heading` can never be a list item's *first* child, which means
 * `wrapInList` finds no wrapping for one and returns false — and a `Command` returning
 * false is a key press that does nothing and says nothing. Pressing "bullet list" on a
 * heading therefore appeared broken, with the shape of the file format as the cause and
 * nothing on screen to suggest it. Turning the line into a paragraph first is what the
 * user meant anyway: a bulleted heading is not a thing this dialect can write
 * (`test/limitations.test.ts` pins that, and it still holds — this route *avoids* that
 * shape rather than relaxing it).
 *
 * **One transaction, not two.** `withList` above dispatches twice and gets away with it
 * because both halves are list edits that read as one change either way. Here the two
 * halves are "stop being a heading" and "become a list", and undone separately the first
 * Ctrl+Z would leave a paragraph where a heading used to be — the state the user never
 * asked for and cannot name. So the second command is run against the intermediate state
 * and its steps are replayed onto the first transaction, which is sound precisely because
 * `state.apply(tr).doc` *is* `tr.doc`: the steps are already expressed in the coordinates
 * they are being added to.
 *
 * The command is asked whether it would do anything *before* anything is dispatched, so a
 * genuine refusal stays a refusal instead of flattening the heading on its way to doing
 * nothing.
 */
function overParagraphs(command: Command): Command {
  return (state, dispatch, view) => {
    if (!selectionHasHeading(state)) return command(state, dispatch, view);

    const { from, to } = state.selection;
    const tr = state.tr;
    tr.setBlockType(from, to, paragraph!);
    const lifted = state.apply(tr);

    if (!command(lifted, undefined, view)) return false;
    if (dispatch === undefined) return true;

    command(
      lifted,
      (second) => {
        for (const step of second.steps) tr.step(step);
        // `tr.doc` and `second.doc` are the same document, so the selection is carried
        // across by re-resolving it rather than by mapping through anything.
        tr.setSelection(Selection.fromJSON(tr.doc, second.selection.toJSON()));
      },
      view,
    );

    dispatch(tr.scrollIntoView());
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
const toggleTaskInPlace: Command = (state, dispatch) => {
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
        // A box stands where the star would (B72), so gaining one gives the star up.
        // `toggleStar` says the same sentence from the other end; enforcing it at both
        // doors is what keeps a state the serializer would refuse from ever existing.
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
  return toggleTaskInPlace(after, dispatch);
}

/**
 * The exported form: a heading becomes a paragraph on the way in (see `overParagraphs`).
 *
 * Wrapped from outside rather than handled inside, so `withList`'s recursion — which runs
 * against a state that already holds a list — never asks the question a second time.
 */
export const toggleTask: Command = overParagraphs(toggleTaskInPlace);

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
 * Flags a bullet for attention, and unflags it (B72).
 *
 * `toggleTask`'s shape throughout, because it is the same kind of thing: an attribute on
 * `listItem`, so it works at any depth without knowing anything about depth, and a mixed
 * selection resolves one way for all of it rather than flipping each item separately.
 *
 * Two differences, both deliberate. **It starts nothing**: `toggleTask` outside a list
 * wraps the paragraph in one, because a checkbox is a way of writing a list, while a star
 * is a remark about a bullet that already exists — there is nothing to say about a
 * sentence. And **it declines a numbered list** rather than converting it, because the
 * number is that list's marker: converting would silently rewrite the shape of a list the
 * user chose in order to decorate one line of it.
 *
 * Taking the box off is the same sentence `toggleTask` says from its own end — a task's
 * checkbox stands exactly where the star would, so the two cannot both be drawn, and
 * `star-items.ts` and `to-mdast.ts` refuse the pair on disk as well.
 */
export const toggleStar: Command = (state, dispatch) => {
  const list = findList(state.selection.$from);
  if (list === null || list.type === orderedList) return false;

  const items = itemsInSelection(state);
  if (items.length === 0) return false;

  if (dispatch) {
    const flag = items.some((item) => item.node.attrs.starred !== true);
    const tr = state.tr;
    for (const { pos, node } of items) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        starred: flag,
        checked: flag ? null : (node.attrs.checked as boolean | null),
      });
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
 * A quote, asked for by name rather than as a side effect of indenting.
 *
 * `indent` above has always been able to make one, but only where there was no list to
 * sink into — which is fine as a fallback and useless as a menu item, since the same item
 * would mean two different things depending on where the caret was. B51's `/` menu is the
 * first thing in the app that offers "quote" as itself, so this is the command it names.
 */
export const wrapInBlockquote: Command = (state, dispatch) =>
  wrapIn(blockquote!)(state, dispatch);

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

/**
 * A textblock that draws as blank.
 *
 * `content.size === 0` is the obvious test and it is the one that let the bug through.
 * Type a word on a bullet, change your mind, hold Backspace until the bullet *looks*
 * empty — and stop one press early, because the trailing space is invisible. The item is
 * then blank on screen and not empty in the document, so Enter fell through to
 * `splitListItem` and produced a second empty bullet. That is the reported "sometimes it
 * works and sometimes it does not": the two cases look identical and differ by one space.
 * Same reading as `list-marker-style.ts`, which already ignores whitespace outside the
 * run for exactly this class of reason.
 *
 * A `hardBreak` is deliberately *not* blank, and neither is an inline atom: an empty
 * second line is something Shift+Enter was pressed on purpose to make, and an item
 * holding only a picture has content even though it has no text.
 */
function drawsBlank(node: PMNode): boolean {
  if (!node.isTextblock) return false;

  let blank = true;
  node.forEach((child) => {
    if (!child.isText || child.text!.trim() !== "") blank = false;
  });
  return blank;
}

/**
 * Is the caret on a blank block that is *directly* inside a list item?
 *
 * The direct-child part is measured rather than assumed. A blank paragraph deeper inside
 * an item — inside a quote in a bullet, say — must not end the list, and it does not need
 * to be handled here at all: `baseKeymap.Enter`'s own `liftEmptyBlock` takes it out of the
 * quote and leaves it in the item, which is the useful reading and the one a reader
 * expects from every other editor.
 */
function onEmptyListItem(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  if (!empty || !drawsBlank($from.parent)) return false;

  const itemDepth = $from.depth - 1;
  return itemDepth >= 1 && $from.node(itemDepth).type === listItem;
}

/** The outermost list around a position — the one leaving the list has to escape. */
function outermostListDepth($pos: ResolvedPos): number | null {
  let found: number | null = null;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const type = $pos.node(depth).type;
    if (type === bulletList || type === orderedList) found = depth;
  }
  return found;
}

/**
 * Is there anything below this item that leaving the list in one go would flatten?
 *
 * `exitList` escapes by lifting repeatedly, and every lift splits the list it climbs out
 * of — so whatever follows the item *at a nested level* is carried up with it and arrives
 * at the top, one list per level. Measured on
 * `- A / - B / - C, ▮, - D / - E`: pressing Enter left `- A`, `- B`, `- C`, the empty
 * line, and then `- D` and `- E` both at the top level as two separate lists. The text
 * survives and the outline does not, which is the one thing a note in this app is for.
 *
 * A following item at the *outermost* level is not counted: it is already where the lift
 * would leave it, so nothing about it moves. That is why one press still ends the list in
 * the common shape — an empty item at the bottom of an outline — and why the doc comment
 * on `exitList` still holds wherever it can.
 */
function nothingIsFlattened($from: ResolvedPos): boolean {
  const outermost = outermostListDepth($from);
  if (outermost === null) return true;

  // Down to the outermost list's own items, exclusive: their siblings do not move.
  for (let depth = $from.depth; depth >= outermost + 2; depth -= 1) {
    if ($from.index(depth - 1) !== $from.node(depth - 1).childCount - 1) return false;
  }
  return true;
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
 *
 * Repeated only while there is nothing below to flatten (`nothingIsFlattened`). With
 * items still to come at a nested level, climbing all the way out would drag them to the
 * top with it, so it climbs one level per press instead — Shift+Tab's step, and the only
 * answer that keeps the outline, since the levels the tail belongs to cannot be rebuilt
 * once they are left behind.
 */
export const exitList: Command = (state, dispatch) => {
  if (!isInList(state) || !onEmptyListItem(state)) return false;

  // Asked before anything is dispatched. A lift that would decline has to leave the key
  // to `splitListItem` rather than swallow it: returning `true` on the strength of having
  // *tried* is how Enter came to do nothing at all in a shape nobody has pinned down.
  if (!liftListItem(listItem!)(state, undefined)) return false;
  if (dispatch === undefined) return true;

  let current = state;
  const dispatchInto = (tr: Transaction): void => {
    current = current.apply(tr);
    dispatch(tr);
  };

  // The invisible whitespace `drawsBlank` forgives is still in the document, and the caret
  // would land after it — an "empty" line that is not empty and is not at its own start.
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

/**
 * Enter. Inside a list this splits the item; on an empty item it ends the list.
 *
 * The new item inherits the *shape* of the one it came from but never its tick: Enter
 * after a finished task starts the next task, not a second one already crossed off.
 * The attrs have to be chosen per press rather than passed always, because
 * `splitListItem`'s `itemAttrs` is static and would stamp `checked: false` — a
 * checkbox — onto every ordinary bullet. Passing nothing is not the neutral option it
 * looks like: `splitListItem` then splits the node as it stands, attrs and all.
 *
 * B72's star is not inherited either, and for a plainer reason than the tick: a star says
 * *this one* needs attention. Carrying it onto the next line would mean the flag spread by
 * pressing Enter, which is the opposite of what flagging is for. What takes its place is
 * not a bullet by default but whatever the list was using before the star —
 * `markerBeforeStar`.
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

/**
 * The marker a starred item interrupted, for Enter to carry on with.
 *
 * A star stands *where the bullet stood* (B72) rather than beside it, so it replaces a
 * marker instead of adding one — and the line after it should go back to the marker the
 * list is made of. Starring one line of a checklist and pressing Enter handed back a plain
 * bullet, which ends the checklist at the flagged item: the box is the point of that list,
 * and the star was only ever meant to sit on one of them for a while.
 *
 * Read off the items before it rather than remembered on the node, so nothing new reaches
 * the file (B6) and a star that arrived from Obsidian, from a paste or from an undo answers
 * the same as one that was just typed. Starred siblings are skipped, so several flagged
 * lines in a row still know what they interrupted, and with nothing before it the bullet
 * the request names as the default is what `checked: null` already means. A numbered list
 * never reaches here — `toggleStar` declines one and `to-mdast.ts` would drop the star
 * anyway, the number being the marker already.
 */
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

/** The depth of the nearest list item around a position, if there is one. */
function itemDepthOf($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type === listItem) return depth;
  }
  return null;
}

/** The nearest list item around a position, if there is one. */
function enclosingItem($pos: ResolvedPos): PMNode | null {
  const depth = itemDepthOf($pos);
  return depth === null ? null : $pos.node(depth);
}

/**
 * Rejoins two lists of the same kind that have ended up directly against each other.
 *
 * Markdown cannot write that shape: `mdast-util-to-markdown` alternates the bullet
 * character to keep them apart, so `- one` is followed by `* two` — which reads back as
 * two lists again, drawn with a gap between them. Every list here is one list unless the
 * user put something between them, so wherever an edit removes the thing that was in
 * between, the two halves belong back together.
 */
function joinAdjacentLists(tr: Transaction, pos: number): void {
  if (pos <= 0 || pos >= tr.doc.content.size) return;

  const $pos = tr.doc.resolve(pos);
  const before = $pos.nodeBefore;
  const after = $pos.nodeAfter;

  if (before === null || after === null || before.type !== after.type) return;
  if (before.type !== bulletList && before.type !== orderedList) return;

  tr.join(pos);
}

/**
 * Backspace on an empty item with items on both sides of it: remove the item, leave the
 * list whole.
 *
 * `liftListItem` — what Backspace does to a list item everywhere else — takes the item
 * out to the top level, and from the middle of a list that means splitting it in two with
 * an empty paragraph wedged between. That is how "press Enter for a new task, change your
 * mind, press Backspace" turned one task list into two with a gap down the middle. The
 * gesture means "undo the item I just made", and there is nothing structural to undo.
 *
 * Only for an item that has an item before *and* after it. At the end of a list there is
 * nothing to split and lifting out is the useful reading — that is where you leave the
 * list — and at the start there is no previous item to put the caret in.
 */
function deleteEmptyItemBetweenSiblings(state: EditorState, dispatch: Dispatch): boolean {
  const { $from } = state.selection;
  const itemDepth = $from.depth - 1;
  if (itemDepth < 1) return false;

  const item = $from.node(itemDepth);
  if (item.type !== listItem) return false;
  if (item.childCount !== 1 || item.firstChild!.content.size !== 0) return false;

  const index = $from.index(itemDepth - 1);
  if (index === 0 || index === $from.node(itemDepth - 1).childCount - 1) return false;

  if (dispatch) {
    const at = $from.before(itemDepth);
    const tr = state.tr.delete(at, at + item.nodeSize);
    // The end of the previous item's deepest textblock, wherever that is: the item may
    // end in a nested list or a table rather than a paragraph.
    tr.setSelection(Selection.near(tr.doc.resolve(at), -1));
    dispatch(tr.scrollIntoView());
  }

  return true;
}

/**
 * Merges a top-level paragraph that sits directly after a list into that list's last
 * item, joining any text it holds onto the end of the last item's deepest textblock.
 *
 * This is the second half of "leave a list, then Backspace again". `joinBackward`'s
 * `deleteBarrier` cannot do this itself: `bulletList.contentMatchAt(childCount)` finds
 * a *wrapping* for the paragraph (`[listItem]`, since `listItem` carries no `group` and
 * so is never a valid `block`) before it ever considers joining, and takes that branch
 * instead — which is exactly what re-creates the bullet the first Backspace removed.
 *
 * The join target is resolved with `Selection.near(..., -1)` rather than the fixed
 * `- 2` `indentIntoPrecedingList` uses, because that arithmetic only lands inside a
 * paragraph when the last item's own last child *is* one. `listItem` is
 * `paragraph block*`, so the last item can end in a nested list or a table instead —
 * `Selection.near` walks past those closing tags to the actual deepest textblock,
 * wherever it is.
 */
function joinIntoPrecedingList(
  state: EditorState,
  paragraphPos: number,
  paragraphNode: PMNode,
  dispatch: Dispatch,
): boolean {
  if (dispatch) {
    const tr = state.tr;
    const target = Selection.near(state.doc.resolve(paragraphPos - 1), -1);

    // The paragraph itself is removed first; the target position sits earlier in the
    // document, so it is unaffected by that deletion and needs no mapping before use.
    tr.delete(paragraphPos, paragraphPos + paragraphNode.nodeSize);
    if (paragraphNode.content.size > 0) {
      tr.insert(target.from, paragraphNode.content);
    }

    // `-1` bias: the position sits between the old content and whatever was just
    // inserted after it, and the caret belongs on the near side of that boundary — "the
    // last character of the previous item" the bug report asked for, not past the text
    // that got glued on.
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(target.from, -1)));

    // That paragraph may have been the only thing holding two halves of one list apart —
    // it is exactly what `liftListItem` leaves behind when an item is taken out of the
    // middle of a list. With it gone the two halves are adjacent, and adjacent is not a
    // shape the file format has.
    joinAdjacentLists(tr, tr.mapping.map(paragraphPos));
    dispatch(tr.scrollIntoView());
  }

  return true;
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

  // A top-level paragraph immediately after a list: this is where the first Backspace
  // (or Enter-Enter) left the caret on leaving the list. See `joinIntoPrecedingList`
  // for why the default keymap gets this one wrong.
  if ($from.depth === 1 && $from.parent.type === paragraph) {
    const paragraphPos = $from.before(1);
    const before = paragraphPos > 0 ? state.doc.resolve(paragraphPos).nodeBefore : null;
    if (before !== null && (before.type === bulletList || before.type === orderedList)) {
      return joinIntoPrecedingList(state, paragraphPos, $from.parent, dispatch);
    }
  }

  const itemDepth = $from.depth - 1;
  if (itemDepth < 1 || $from.node(itemDepth).type !== listItem) return false;

  // Only the first block of the item; further down, Backspace is ordinary joining.
  if ($from.index(itemDepth) !== 0) return false;

  // Before the lift, because from the middle of a list a lift is what splits it.
  if (deleteEmptyItemBetweenSiblings(state, dispatch)) return true;

  return liftListItem(listItem!)(state, dispatch);
};

/**
 * Arrow-key movement past an inline atom (`wikiEmbed` or `wikiLink`).
 *
 * Both nodes are `atom: true`, and ProseMirror's default arrow handling prefers turning
 * an atom into a `NodeSelection` over moving the text caret past it — which is invisible,
 * since nothing in `styles.css` used to style `.ProseMirror-selectednode`. A valid text
 * caret position already exists on either side of the node (it is inline, not a gap that
 * needs a `prosemirror-gapcursor`), so the fix is only to make an ordinary arrow press
 * prefer that position over the node selection ProseMirror reaches for first.
 *
 * Only engages on a plain caret: a non-empty selection (including one Shift is in the
 * middle of extending) is left alone, and so is every other case where the adjacent slot
 * is not one of these two node types — a textblock boundary among them, since
 * `nodeBefore`/`nodeAfter` are `null` there rather than reaching into a neighbouring
 * block.
 */
export function moveOverAtom(direction: "left" | "right"): Command {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty) return false;

    const node = direction === "right" ? $from.nodeAfter : $from.nodeBefore;
    if (node === null || (node.type !== wikiEmbed && node.type !== wikiLink)) return false;

    const target = direction === "right" ? $from.pos + node.nodeSize : $from.pos - node.nodeSize;

    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
    }

    return true;
  };
}

/** Shift+Enter: a soft break inside the same paragraph or list item. */
export const softBreak: Command = (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(hardBreak!.create()).scrollIntoView());
  }
  return true;
};

/**
 * A dividing line across the note.
 *
 * The node, its parsing and its serialization have been in place since the dialect was
 * written — `---` in a file has always come back as a rule and gone out as one again, and
 * `.editor-content hr` has always drawn it. There was simply no way to *make* one, which
 * is what imported notes made visible: they arrive full of dividers nobody here could add.
 *
 * Nothing is needed below it: `horizontalRule` is in `trailing-paragraph.ts`'s
 * `NEEDS_A_LINE_BELOW`, so a rule at the end of a note gets its line to type on from the
 * same invariant a table does.
 *
 * **The caret is moved onto that line, and it has to be.** `replaceSelectionWith` leaves a
 * `NodeSelection` on the rule itself — a rule is a selectable leaf — so the very next
 * character typed *replaces the rule that was just inserted*. Found by running it (B51's
 * `/divider`, which is now much the easiest way to reach this command, and typing on): the
 * divider appeared, the next word swallowed it, and nothing about the code read as wrong.
 * The line below is created here rather than waited for, because `trailingParagraph`'s
 * `appendTransaction` runs after this transaction is applied and there has to be somewhere
 * to put the caret now.
 */
export const insertHorizontalRule: Command = (state, dispatch) => {
  if (dispatch === undefined) return true;

  const tr = state.tr.replaceSelectionWith(horizontalRule!.create());

  // Only when the rule really is what ended up selected. Anywhere else the caret is
  // already somewhere sensible and moving it would be this command overreaching.
  if (tr.selection instanceof NodeSelection && tr.selection.node.type === horizontalRule) {
    const after = tr.selection.to;
    const next = tr.doc.resolve(after).nodeAfter;
    if (next === null || !next.isTextblock) tr.insert(after, paragraph!.create());
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  }

  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Whether every textblock the selection touches is already a heading of this exact level.
 *
 * Asked over the whole range rather than from `$from.parent` alone: a selection spanning
 * an H1 and a paragraph is not "already H1", and toggling it off from its first line
 * would be the command reading one line and acting on five.
 */
function isEntirelyHeading(state: EditorState, level: number): boolean {
  const { from, to } = state.selection;
  let seen = 0;
  let all = true;

  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isTextblock) return true;
    seen += 1;
    if (node.type !== heading || node.attrs.level !== level) all = false;
    return false;
  });

  return seen > 0 && all;
}

/**
 * Sets the heading level — and pressing the same one again takes it off.
 *
 * It was a plain `setBlockType`, which is one-way: `Mod+1` on a line that was already an
 * H1 re-applied H1 and there was no gesture that undid it except knowing about `Mod+0`.
 * That chord is real, it is in the help sheet and it is in the `/` panel, but "press the
 * thing again" is what every editor with a heading button has taught, and a formatting
 * command that cannot be pressed off reads as a line that is stuck.
 *
 * `Mod+2` on an H1 still simply sets H2 — only the *same* level toggles, so walking the
 * levels never drops through the paragraph on the way.
 */
export function setHeading(level: number): Command {
  return (state, dispatch, view) =>
    isEntirelyHeading(state, level)
      ? setParagraph(state, dispatch, view)
      : setBlockType(heading!, { level })(state, dispatch, view);
}

export const setParagraph: Command = setBlockType(paragraph!);

export const toggleStrong = toggleMark(schema.marks.strong!);
export const toggleEm = toggleMark(schema.marks.em!);
export const toggleUnderline = toggleMark(schema.marks.underline!);
export const toggleStrike = toggleMark(schema.marks.strike!);
export const toggleHighlight = toggleMark(schema.marks.highlight!);
export const toggleCode = toggleMark(schema.marks.code!);

export const toggleBulletList = overParagraphs(toggleList(bulletList!));
export const toggleOrderedList = overParagraphs(toggleList(orderedList!));

export interface LinkTarget {
  href: string;
  from: number;
  to: number;
}

/**
 * The link mark at document position `pos`, if there is one — the shared logic behind
 * `linkAt` (the caret) and `link-click.ts`'s `linkHrefAt` (a click, which has not yet
 * moved the selection when `handleClick` runs, so it cannot resolve through
 * `state.selection`).
 *
 * **Both sides of the position are asked, and the trailing one is not optional.** The
 * `link` mark is `inclusive: false` (see `schema.ts`), which is what stops typing past
 * the end of a link from extending it — and it also means `$pos.marks()` comes back empty
 * at the *trailing* boundary of a run, where the text after carries no link. That
 * boundary is the right-hand half of a link's last character, which is exactly where a
 * pointer aimed at a short link lands. Without the `nodeBefore` fallback a Mod+click
 * there resolved nothing, ProseMirror fell through to selecting the node instead, and the
 * link opened only on the second or third try a little further left. Ctrl+K had the same
 * hole from the keyboard side, with the caret parked at the end of a link.
 *
 * `nodeAfter` is still asked first: at a position between two different links, the one
 * being pointed *into* is the one meant.
 */
function linkRangeAt(doc: PMNode, pos: number): LinkTarget | null {
  const linkType = schema.marks.link!;
  const $pos = doc.resolve(pos);

  const marks = $pos.marks();
  const mark =
    marks.find((candidate) => candidate.type === linkType) ??
    $pos.nodeAfter?.marks.find((candidate) => candidate.type === linkType) ??
    $pos.nodeBefore?.marks.find((candidate) => candidate.type === linkType) ??
    null;

  if (mark === null) return null;

  // Walk out to both ends of the run carrying this exact link.
  const parentStart = $pos.start();
  let from = pos;
  let to = pos;

  const carries = (at: number): boolean => {
    const node = doc.resolve(at).nodeAfter;
    return node !== null && node !== undefined && mark.isInSet(node.marks) !== undefined;
  };

  while (from > parentStart && carries(from - 1)) from -= 1;
  const parentEnd = $pos.end();
  while (to < parentEnd && carries(to)) to += 1;

  return { href: mark.attrs.href as string, from, to };
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
  return linkRangeAt(state.doc, state.selection.$from.pos);
}

/** The href of the link at document position `pos`, if there is one. Mod+click's own lookup — see `link-click.ts`. */
export function linkHrefAt(state: EditorState, pos: number): string | null {
  return linkRangeAt(state.doc, pos)?.href ?? null;
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
  /** Opens the image-filtered picker and inserts whatever comes back. */
  requestImage: () => void;
  /** Opens the unfiltered picker and inserts whatever comes back. */
  requestFile: () => void;
  /**
   * Opens the note picker and inserts a `[[…]]` link to whatever comes back (B41).
   * `prefix` is what the user already typed to get here — `"[["` from the input rule,
   * nothing from the shortcut, the toolbar or the menu — and is swallowed on insertion.
   */
  requestNoteLink: (prefix: string) => void;
  /** Opens the size grid and inserts a table of whatever comes back (B42). */
  requestTable: () => void;
  /**
   * The window's own translator, for the one plugin that draws words rather than
   * decorating text: `table-toolbar.ts`'s buttons.
   *
   * Optional, and the only optional field here, because a `CommandContext` is built by
   * hand in half a dozen tests that have nothing to do with labels — the toolbar falls
   * back to English (`translate("en-US", …)`) rather than making every one of them carry
   * a translator they do not use.
   */
  t?: (key: string) => string;
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
  insertImage: (context) => () => {
    context.requestImage();
    return true;
  },
  insertFile: (context) => () => {
    context.requestFile();
    return true;
  },
  insertNoteLink: (context) => () => {
    // No prefix: nothing was typed to get here. The `[[` route does not come through the
    // keymap at all — it is an input rule, which calls the same context method itself.
    context.requestNoteLink("");
    return true;
  },
  insertTable: (context) => () => {
    context.requestTable();
    return true;
  },

  bulletList: () => toggleBulletList,
  orderedList: () => toggleOrderedList,
  task: () => toggleTask,
  tick: () => toggleChecked,
  star: () => toggleStar,
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

  // The one entry whose command lives with its plugin rather than in this file: opening
  // the find bar is a meta on `findKey` and nothing else, and splitting it from the
  // `Meta` union it has to spell would be two definitions of one message (B63).
  find: () => openFind,
};

export function isMarkActive(state: EditorState, markName: string): boolean {
  const type = schema.marks[markName];
  if (type === undefined) return false;

  const { from, $from, to, empty } = state.selection;
  return empty
    ? type.isInSet(state.storedMarks ?? $from.marks()) !== undefined
    : state.doc.rangeHasMark(from, to, type);
}
