import { Fragment, type Node as PMNode } from "prosemirror-model";
import { TextSelection, type Command, type EditorState } from "prosemirror-state";
import { schema, type ColumnAlign } from "../../markdown/schema.js";

/**
 * Everything the editor can do to a table (B42).
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
 */

export type { ColumnAlign };

const tableType = schema.nodes.table!;
const tableRowType = schema.nodes.tableRow!;
const tableCellType = schema.nodes.tableCell!;

export interface TableContext {
  node: PMNode;
  /** The position immediately before the table node. */
  pos: number;
  row: number;
  cell: number;
}

/** The table the caret is in, with which cell of it, or null when the caret is elsewhere. */
export function findTable(state: EditorState): TableContext | null {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type !== tableType) continue;
    return {
      node: $from.node(depth),
      pos: $from.before(depth),
      row: depth < $from.depth ? $from.index(depth) : 0,
      cell: depth + 1 < $from.depth ? $from.index(depth + 1) : 0,
    };
  }

  return null;
}

/**
 * The widest row.
 *
 * Rows genuinely can differ: `from-mdast.ts` builds a row per source line without padding
 * to a common width, so a hand-written file with a short row parses to a short row. Every
 * column operation squares the table up first rather than assuming it already is one.
 */
export function columnCount(node: PMNode): number {
  let widest = 0;
  for (let row = 0; row < node.childCount; row += 1) {
    widest = Math.max(widest, node.child(row).childCount);
  }
  return widest;
}

function emptyCell(): PMNode {
  return tableCellType.create();
}

function matrixOf(node: PMNode): PMNode[][] {
  const width = columnCount(node);

  return Array.from({ length: node.childCount }, (_unused, r) => {
    const row = node.child(r);
    const cells = Array.from({ length: row.childCount }, (_ignored, c) => row.child(c));
    // Squared up here, once, so every caller below can index without checking.
    while (cells.length < width) cells.push(emptyCell());
    return cells;
  });
}

function tableFrom(matrix: PMNode[][], align: ColumnAlign[]): PMNode {
  const rows = matrix.map((cells) => tableRowType.create(null, Fragment.from(cells)));
  return tableType.create({ align }, Fragment.from(rows));
}

function alignOf(node: PMNode): ColumnAlign[] {
  const width = columnCount(node);
  const align = [...((node.attrs.align as ColumnAlign[] | undefined) ?? [])];
  while (align.length < width) align.push(null);
  return align.slice(0, width);
}

/** Where the inline content of cell [row, cell] starts, given the table's own position. */
function cellStart(node: PMNode, tablePos: number, row: number, cell: number): number {
  let pos = tablePos + 1;
  for (let r = 0; r < row; r += 1) pos += node.child(r).nodeSize;

  const rowNode = node.child(row);
  pos += 1;
  for (let c = 0; c < cell; c += 1) pos += rowNode.child(c).nodeSize;

  return pos + 1;
}

/**
 * Replaces `context`'s table with a rebuilt one and selects the whole of cell
 * [row, cell] — selecting rather than collapsing because every caller here has just moved
 * the caret somewhere the user did not click, and a selected cell is one that can be
 * overtyped, which is what Word does on Tab.
 */
function replaceTable(
  context: TableContext,
  matrix: PMNode[][],
  align: ColumnAlign[],
  caret: { row: number; cell: number },
): Command {
  return (state, dispatch) => {
    if (matrix.length === 0 || matrix[0]!.length === 0) return false;
    if (dispatch === undefined) return true;

    const rebuilt = tableFrom(matrix, align);
    const tr = state.tr.replaceWith(context.pos, context.pos + context.node.nodeSize, rebuilt);

    const row = Math.min(caret.row, rebuilt.childCount - 1);
    const cell = Math.min(caret.cell, rebuilt.child(row).childCount - 1);
    const start = cellStart(rebuilt, context.pos, row, cell);
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

export function addRow(where: "before" | "after"): Command {
  return (state, dispatch) => {
    const context = findTable(state);
    if (context === null) return false;

    const matrix = matrixOf(context.node);
    const at = where === "before" ? context.row : context.row + 1;
    matrix.splice(at, 0, matrix[0]!.map(() => emptyCell()));

    return replaceTable(context, matrix, alignOf(context.node), { row: at, cell: context.cell })(
      state,
      dispatch,
    );
  };
}

export function addColumn(where: "before" | "after"): Command {
  return (state, dispatch) => {
    const context = findTable(state);
    if (context === null) return false;

    const at = where === "before" ? context.cell : context.cell + 1;
    const matrix = matrixOf(context.node).map((cells) => {
      const next = [...cells];
      next.splice(at, 0, emptyCell());
      return next;
    });

    // The alignment array is per column, so it has to move in step or every column past
    // the edit inherits its neighbour's alignment.
    const align = alignOf(context.node);
    align.splice(at, 0, null);

    return replaceTable(context, matrix, align, { row: context.row, cell: at })(state, dispatch);
  };
}

/**
 * Removes the row the caret is in — or the whole table, when it was the only row. A table
 * with no rows is not a thing the schema allows (`tableRow+`), and an empty husk would be
 * worse than the deletion the user clearly meant.
 */
export function deleteRow(): Command {
  return (state, dispatch) => {
    const context = findTable(state);
    if (context === null) return false;
    if (context.node.childCount <= 1) return deleteTable()(state, dispatch);

    const matrix = matrixOf(context.node);
    matrix.splice(context.row, 1);

    return replaceTable(context, matrix, alignOf(context.node), {
      row: Math.max(0, context.row - 1),
      cell: context.cell,
    })(state, dispatch);
  };
}

/** The column counterpart, with the same "last one takes the table with it" rule. */
export function deleteColumn(): Command {
  return (state, dispatch) => {
    const context = findTable(state);
    if (context === null) return false;
    if (columnCount(context.node) <= 1) return deleteTable()(state, dispatch);

    const matrix = matrixOf(context.node).map((cells) => {
      const next = [...cells];
      next.splice(context.cell, 1);
      return next;
    });

    const align = alignOf(context.node);
    align.splice(context.cell, 1);

    return replaceTable(context, matrix, align, {
      row: context.row,
      cell: Math.max(0, context.cell - 1),
    })(state, dispatch);
  };
}

export function deleteTable(): Command {
  return (state, dispatch) => {
    const context = findTable(state);
    if (context === null) return false;
    if (dispatch === undefined) return true;

    dispatch(
      state.tr.delete(context.pos, context.pos + context.node.nodeSize).scrollIntoView(),
    );
    return true;
  };
}

/** Sets the alignment of the column the caret is in — the `:---`/`:---:`/`---:` the file already carries. */
export function setColumnAlign(align: ColumnAlign): Command {
  return (state, dispatch) => {
    const context = findTable(state);
    if (context === null) return false;
    if (dispatch === undefined) return true;

    const next = alignOf(context.node);
    next[context.cell] = align;

    dispatch(state.tr.setNodeMarkup(context.pos, undefined, { align: next }));
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
      return replaceTable(context, matrix, alignOf(context.node), {
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
      state.tr
        .setSelection(TextSelection.create(state.doc, start, start + size))
        .scrollIntoView(),
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
