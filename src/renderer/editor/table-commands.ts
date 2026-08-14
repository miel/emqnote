import { type Node as PMNode } from "prosemirror-model";
import { TextSelection, type Command } from "prosemirror-state";
import { schema, type ColumnAlign } from "../../markdown/schema.js";
import {
  alignOf,
  cellPosAt,
  cellStart,
  cellsInRect,
  columnCount,
  emptyCell,
  findTable,
  matrixOf,
  rectOfContext,
  tableFrom,
  tableType,
  type TableContext,
  type TableRect,
} from "./table-geometry.js";
import { CellSelection, isCellSelection, selectedRect } from "./table-selection.js";

/**
 * Everything the editor can do to a table (B42, extended to a rectangle by B49).
 *
 * Hand-rolled rather than `prosemirror-tables`, and the reason is the schema: here it is
 * *also* the file format. `prosemirror-tables` requires its own shape — a `tableRole` on
 * every node, a separate `table_header` type, `colspan`/`rowspan`/`colwidth` attrs on
 * every cell — and GFM cannot express a merged cell at all (`03-markdown-dialect.md` §3.5
 * keeps those as raw HTML). Adopting it would mean the editor could build tables the
 * serializer must refuse, which is B6 approached from the wrong side. What is actually
 * wanted here is a dozen operations over a rectangle, and that is what this is.
 *
 * Every operation **rebuilds the table node and replaces it whole**, rather than splicing
 * rows and cells at computed positions. A column insert touches every row, so the
 * position-splicing version has to track how much each earlier edit shifted the ones after
 * it — arithmetic that is correct right up until a ragged row makes it not. Rebuilding
 * costs one `replaceWith` on a node that is, by nature, small.
 *
 * Every operation also reads **`selectedRect`**, never a single row and column. A caret
 * makes a one-cell rectangle and a `CellSelection` makes a bigger one, so "delete row"
 * means *the rows this touches* in both cases through one code path — which is what let
 * B49 reach all of these without rewriting any of them.
 */

export type { ColumnAlign };
export type { TableContext, TableRect };
// Re-exported because `table-align.ts`, `editor-menu.ts` and the tests have always asked
// this module for them; only where they are *written* moved (see `table-geometry.ts`).
export { columnCount, findTable };

/**
 * Replaces `rect`'s table with a rebuilt one and selects the whole of cell [row, cell] —
 * selecting rather than collapsing because every caller here has just moved the caret
 * somewhere the user did not click, and a selected cell is one that can be overtyped,
 * which is what Word does on Tab.
 */
function replaceTable(
  rect: TableRect,
  matrix: PMNode[][],
  align: ColumnAlign[],
  caret: { row: number; cell: number },
): Command {
  return (state, dispatch) => {
    if (matrix.length === 0 || matrix[0]!.length === 0) return false;
    if (dispatch === undefined) return true;

    const rebuilt = tableFrom(matrix, align);
    const tr = state.tr.replaceWith(rect.pos, rect.pos + rect.node.nodeSize, rebuilt);

    const row = Math.min(caret.row, rebuilt.childCount - 1);
    const cell = Math.min(caret.cell, rebuilt.child(row).childCount - 1);
    const start = cellStart(rebuilt, rect.pos, row, cell);
    const size = rebuilt.child(row).child(cell).content.size;

    dispatch(tr.setSelection(TextSelection.create(tr.doc, start, start + size)).scrollIntoView());
    return true;
  };
}

/**
 * Inserts an empty table and puts the caret in its first cell.
 *
 * Declines inside a table: `tableCell` is `inline*`, so a nested table is not something
 * the schema can hold, and GFM could not write one down if it were.
 */
export function insertTable(rows: number, columns: number): Command {
  return (state, dispatch) => {
    if (rows < 1 || columns < 1) return false;
    if (findTable(state) !== null) return false;

    const matrix = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => emptyCell()),
    );
    const node = tableFrom(matrix, Array.from({ length: columns }, (): ColumnAlign => null));

    if (dispatch === undefined) return true;

    const at = state.selection.from;
    // `replaceSelectionWith` is what decides *where* a block lands — splitting the
    // paragraph when the caret is mid-sentence, replacing it when it is empty, and
    // finding the right depth inside a list item. Reimplementing that placement is the
    // one part of this file worth not doing by hand.
    const tr = state.tr.replaceSelectionWith(node, false);

    // Which is why the table has to be found again afterwards rather than assumed: only
    // the transaction knows where it actually put it.
    const mapped = tr.mapping.map(at, -1);
    let placed: number | null = null;
    tr.doc.nodesBetween(
      Math.max(0, mapped - 1),
      Math.min(tr.doc.content.size, mapped + node.nodeSize + 2),
      (child, pos) => {
        if (placed === null && child.type === tableType) placed = pos;
      },
    );

    if (placed !== null) {
      tr.setSelection(TextSelection.create(tr.doc, cellStart(node, placed, 0, 0)));
    }

    dispatch(tr.scrollIntoView());
    return true;
  };
}

/**
 * A row above or below the selection. As many rows as the selection is tall, so that
 * "Row ↓" on three selected rows adds three — the Word behaviour, and the only reading of
 * the button that does not make a rectangle mean less than a caret.
 */
export function addRow(where: "before" | "after"): Command {
  return (state, dispatch) => {
    const rect = selectedRect(state);
    if (rect === null) return false;

    const matrix = matrixOf(rect.node);
    const at = where === "before" ? rect.top : rect.bottom + 1;
    const added = rect.bottom - rect.top + 1;
    matrix.splice(at, 0, ...Array.from({ length: added }, () => matrix[0]!.map(() => emptyCell())));

    return replaceTable(rect, matrix, alignOf(rect.node), { row: at, cell: rect.left })(
      state,
      dispatch,
    );
  };
}

export function addColumn(where: "before" | "after"): Command {
  return (state, dispatch) => {
    const rect = selectedRect(state);
    if (rect === null) return false;

    const at = where === "before" ? rect.left : rect.right + 1;
    const added = rect.right - rect.left + 1;
    const matrix = matrixOf(rect.node).map((cells) => {
      const next = [...cells];
      next.splice(at, 0, ...Array.from({ length: added }, () => emptyCell()));
      return next;
    });

    // The alignment array is per column, so it has to move in step or every column past
    // the edit inherits its neighbour's alignment.
    const align = alignOf(rect.node);
    align.splice(at, 0, ...Array.from({ length: added }, (): ColumnAlign => null));

    return replaceTable(rect, matrix, align, { row: rect.top, cell: at })(state, dispatch);
  };
}

/**
 * Removes every row the selection touches — or the whole table, when that is all of them.
 * A table with no rows is not a thing the schema allows (`tableRow+`), and an empty husk
 * would be worse than the deletion the user clearly meant.
 */
export function deleteRow(): Command {
  return (state, dispatch) => {
    const rect = selectedRect(state);
    if (rect === null) return false;

    const removed = rect.bottom - rect.top + 1;
    if (removed >= rect.node.childCount) return deleteTable()(state, dispatch);

    const matrix = matrixOf(rect.node);
    matrix.splice(rect.top, removed);

    return replaceTable(rect, matrix, alignOf(rect.node), {
      row: Math.max(0, rect.top - 1),
      cell: rect.left,
    })(state, dispatch);
  };
}

/** The column counterpart, with the same "the last one takes the table with it" rule. */
export function deleteColumn(): Command {
  return (state, dispatch) => {
    const rect = selectedRect(state);
    if (rect === null) return false;

    const removed = rect.right - rect.left + 1;
    if (removed >= columnCount(rect.node)) return deleteTable()(state, dispatch);

    const matrix = matrixOf(rect.node).map((cells) => {
      const next = [...cells];
      next.splice(rect.left, removed);
      return next;
    });

    const align = alignOf(rect.node);
    align.splice(rect.left, removed);

    return replaceTable(rect, matrix, align, {
      row: rect.top,
      cell: Math.max(0, rect.left - 1),
    })(state, dispatch);
  };
}

export function deleteTable(): Command {
  return (state, dispatch) => {
    const rect = selectedRect(state);
    if (rect === null) return false;
    if (dispatch === undefined) return true;

    dispatch(state.tr.delete(rect.pos, rect.pos + rect.node.nodeSize).scrollIntoView());
    return true;
  };
}

/** Sets the alignment of every column the selection covers — the `:---`/`:---:`/`---:` the file already carries. */
export function setColumnAlign(align: ColumnAlign): Command {
  return (state, dispatch) => {
    const rect = selectedRect(state);
    if (rect === null) return false;
    if (dispatch === undefined) return true;

    const next = alignOf(rect.node);
    for (let column = rect.left; column <= rect.right; column += 1) next[column] = align;

    // `setNodeMarkup` and not a rebuild: nothing about the cells changed, and rebuilding
    // would throw away a cell selection standing over them for a change to one attribute.
    dispatch(state.tr.setNodeMarkup(rect.pos, undefined, { align: next }));
    return true;
  };
}

/**
 * Empties every selected cell, leaving the table's shape alone.
 *
 * What Backspace over a rectangle has to mean. A `TextSelection` spanning cells cannot do
 * it: `tableCell` is `isolating`, so a single replace step across the boundary is refused
 * and the keystroke does nothing at all — which is the bug B49 exists to fix. One replace
 * per cell, inside that cell's own bounds, never crosses a boundary.
 *
 * Walked back to front so each position is still valid when its turn comes; the caret is
 * then put in the first cell of the rectangle, which is where typing should continue.
 *
 * It succeeds whenever a rectangle is selected, even one that is already empty — the
 * collapse to a caret is the useful half there, and it is what lets `handleTextInput`
 * treat "cleared" as "there is now a caret to type at" without a second case.
 */
export function clearCells(): Command {
  return (state, dispatch) => {
    if (!isCellSelection(state.selection)) return false;

    const rect = state.selection.rect();
    const cells = cellsInRect(rect).filter((cell) => cell.node.content.size > 0);
    if (dispatch === undefined) return true;

    const tr = state.tr;
    for (const cell of [...cells].reverse()) {
      tr.delete(cell.pos + 1, cell.pos + cell.node.nodeSize - 1);
    }

    const table = tr.doc.nodeAt(rect.pos);
    const anchor = table === null ? null : cellPosAt(table, rect.pos, rect.top, rect.left);
    if (anchor !== null) tr.setSelection(TextSelection.create(tr.doc, anchor + 1));

    dispatch(tr.scrollIntoView());
    return true;
  };
}

/**
 * Shift+arrow across a cell boundary selects cells (B49).
 *
 * With a rectangle already up it moves the head cell, so the selection grows and shrinks
 * the way every other Shift+arrow does. Without one it starts a rectangle — but only when
 * the caret is at the edge of its cell in that direction, so Shift+Left inside a word still
 * selects text. Up and down have no such edge to test for: a cell holds inline content, so
 * there is no line above to extend to, and extending to the cell above is the only reading
 * left.
 *
 * Declines at the edge of the table and outside one, so nothing else about arrow keys or
 * text selection changes.
 */
export function extendCellSelection(direction: "left" | "right" | "up" | "down"): Command {
  return (state, dispatch) => {
    const selection = state.selection;
    const doc = state.doc;

    let $anchorCell;
    let headRow: number;
    let headColumn: number;
    let table: PMNode;
    let tablePos: number;

    if (isCellSelection(selection)) {
      $anchorCell = selection.$anchorCell;
      headRow = selection.$headCell.index(-1);
      headColumn = selection.$headCell.index();
      table = selection.$headCell.node(-1);
      tablePos = selection.$headCell.before(-1);
    } else {
      const context = findTable(state);
      if (context === null) return false;
      if (!selection.empty) return false;

      const { $from } = selection;
      const atStart = $from.parentOffset === 0;
      const atEnd = $from.parentOffset === $from.parent.content.size;
      if (direction === "left" && !atStart) return false;
      if (direction === "right" && !atEnd) return false;

      const pos = cellPosAt(context.node, context.pos, context.row, context.cell);
      if (pos === null) return false;

      $anchorCell = doc.resolve(pos);
      headRow = context.row;
      headColumn = context.cell;
      table = context.node;
      tablePos = context.pos;
    }

    const wantedRow = headRow + (direction === "up" ? -1 : direction === "down" ? 1 : 0);
    const wantedColumn = headColumn + (direction === "left" ? -1 : direction === "right" ? 1 : 0);

    const headPos = cellPosAt(table, tablePos, wantedRow, wantedColumn);
    if (headPos === null) return false;
    if (dispatch === undefined) return true;

    dispatch(
      state.tr.setSelection(new CellSelection($anchorCell, doc.resolve(headPos))).scrollIntoView(),
    );
    return true;
  };
}

/**
 * Tab and Shift-Tab inside a table.
 *
 * Forward off the last cell **appends a row and lands in it** — the one behaviour that
 * makes a table typeable rather than something you build first and fill in second.
 * Backward off the first cell declines, so Shift-Tab there falls through to the list
 * logic behind it rather than swallowing the key on nothing.
 *
 * Both decline outright when the caret is not in a table, which is what lets
 * `keymap.ts` chain them *in front of* `tabIndent`/`tabOutdent` without changing what Tab
 * does anywhere else — those two always return true, so ordering is the whole mechanism.
 */
export function goToCell(direction: "next" | "previous"): Command {
  return (state, dispatch) => {
    const context = findTable(state);
    if (context === null) return false;

    const width = columnCount(context.node);
    const flat = context.row * width + context.cell;
    const target = direction === "next" ? flat + 1 : flat - 1;

    if (target < 0) return false;

    if (target >= context.node.childCount * width) {
      const matrix = matrixOf(context.node);
      matrix.push(matrix[0]!.map(() => emptyCell()));
      return replaceTable(rectOfContext(context), matrix, alignOf(context.node), {
        row: matrix.length - 1,
        cell: 0,
      })(state, dispatch);
    }

    if (dispatch === undefined) return true;

    const row = Math.floor(target / width);
    const cell = target % width;
    // No rebuild: nothing about the table changed, only where the caret is. Squaring the
    // matrix up would rewrite the document for a keystroke that moved a selection.
    const rowNode = context.node.child(row);
    if (cell >= rowNode.childCount) return false;

    const start = cellStart(context.node, context.pos, row, cell);
    const size = rowNode.child(cell).content.size;
    dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, start, start + size)).scrollIntoView(),
    );
    return true;
  };
}

/**
 * Enter inside a cell inserts a line break rather than trying to split it.
 *
 * `tableCell` is `inline*`, so there is no paragraph to split and `baseKeymap.Enter`
 * simply fails — leaving Enter dead inside a table, which reads as the editor being
 * broken. A `hardBreak` is also exactly what the format has for this: the dialect writes a
 * soft break in a cell as `<br>` (§3.5) and `normalize-phrasing.ts` reads it back.
 */
export const cellBreak: Command = (state, dispatch) => {
  if (findTable(state) === null) return false;

  const hardBreak = schema.nodes.hardBreak;
  if (hardBreak === undefined) return false;
  if (dispatch === undefined) return true;

  dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  return true;
};
