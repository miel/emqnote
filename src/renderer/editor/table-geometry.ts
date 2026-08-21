import { Fragment, type Node as PMNode, type ResolvedPos } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { schema, type ColumnAlign } from "@emqnote/core/markdown/schema";

/**
 * Where the cells of a table are, and how to build a new one — the arithmetic B42's
 * commands and B49's selection both need, in one file so neither has to import the other.
 *
 * It was all inside `table-commands.ts` until a rectangle of cells became selectable:
 * `table-selection.ts` needs the same walk to know which cells a drag covers, and
 * `table-commands.ts` needs the selection to know which cells an operation is about. Two
 * modules importing each other is a cycle waiting to be tripped over by whichever one
 * happens to initialise first; a third holding what they share is not.
 *
 * Nothing here dispatches anything. Every function is a question about a document.
 */

export const tableType = schema.nodes.table!;
export const tableRowType = schema.nodes.tableRow!;
export const tableCellType = schema.nodes.tableCell!;

export interface TableContext {
  node: PMNode;
  /** The position immediately before the table node. */
  pos: number;
  row: number;
  cell: number;
}

/**
 * A band of rows and a band of columns, both inclusive — one cell when a caret is all
 * there is, a whole rectangle when a `CellSelection` is up (B49).
 *
 * Every table command reads one of these rather than a single row/column pair, which is
 * what lets "delete row" mean *the rows this touches* without a second code path for the
 * selected case.
 */
export interface TableRect {
  node: PMNode;
  /** The position immediately before the table node. */
  pos: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The one-cell rectangle a caret makes. */
export function rectOfContext(context: TableContext): TableRect {
  return {
    node: context.node,
    pos: context.pos,
    top: context.row,
    bottom: context.row,
    left: context.cell,
    right: context.cell,
  };
}

/**
 * The table one position is in, with which cell of it, or null when it is elsewhere.
 *
 * Split out from `findTable` because a selection has two ends and they are not always in
 * the same cell: `extendCellSelection` has to ask this of the anchor and of the head
 * separately, and `$from` — which is what `findTable` asks about — is the *head* of a
 * backwards selection, so it answers the wrong one half the time.
 */
export function tableContextAt($pos: ResolvedPos): TableContext | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type !== tableType) continue;
    return {
      node: $pos.node(depth),
      pos: $pos.before(depth),
      row: depth < $pos.depth ? $pos.index(depth) : 0,
      cell: depth + 1 < $pos.depth ? $pos.index(depth + 1) : 0,
    };
  }

  return null;
}

/** The table the caret is in, with which cell of it, or null when the caret is elsewhere. */
export function findTable(state: EditorState): TableContext | null {
  return tableContextAt(state.selection.$from);
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

export function emptyCell(): PMNode {
  return tableCellType.create();
}

export function matrixOf(node: PMNode): PMNode[][] {
  const width = columnCount(node);

  return Array.from({ length: node.childCount }, (_unused, r) => {
    const row = node.child(r);
    const cells = Array.from({ length: row.childCount }, (_ignored, c) => row.child(c));
    // Squared up here, once, so every caller below can index without checking.
    while (cells.length < width) cells.push(emptyCell());
    return cells;
  });
}

export function tableFrom(matrix: PMNode[][], align: ColumnAlign[]): PMNode {
  const rows = matrix.map((cells) => tableRowType.create(null, Fragment.from(cells)));
  return tableType.create({ align }, Fragment.from(rows));
}

export function alignOf(node: PMNode): ColumnAlign[] {
  const width = columnCount(node);
  const align = [...((node.attrs.align as ColumnAlign[] | undefined) ?? [])];
  while (align.length < width) align.push(null);
  return align.slice(0, width);
}

/**
 * The position of the cell at [row, column], given the table's own position — or null when
 * that row is too short to have one.
 *
 * Ragged rows are why this can answer null at all: nothing pads a parsed table, so a
 * rectangle drawn over a squared-up grid can cover a cell that does not exist. Every caller
 * either skips those or squares the table up first.
 */
export function cellPosAt(
  node: PMNode,
  tablePos: number,
  row: number,
  column: number,
): number | null {
  if (row < 0 || row >= node.childCount) return null;

  const rowNode = node.child(row);
  if (column < 0 || column >= rowNode.childCount) return null;

  let pos = tablePos + 1;
  for (let r = 0; r < row; r += 1) pos += node.child(r).nodeSize;

  pos += 1;
  for (let c = 0; c < column; c += 1) pos += rowNode.child(c).nodeSize;

  return pos;
}

/** Where the inline content of cell [row, cell] starts, given the table's own position. */
export function cellStart(node: PMNode, tablePos: number, row: number, cell: number): number {
  const pos = cellPosAt(node, tablePos, row, cell);
  if (pos === null) throw new RangeError(`no cell at [${row}, ${cell}]`);
  return pos + 1;
}

/** Every cell inside `rect`, in document order, skipping the ones a ragged row lacks. */
export function cellsInRect(rect: TableRect): { pos: number; node: PMNode; row: number; column: number }[] {
  const found: { pos: number; node: PMNode; row: number; column: number }[] = [];

  for (let row = rect.top; row <= rect.bottom; row += 1) {
    for (let column = rect.left; column <= rect.right; column += 1) {
      const pos = cellPosAt(rect.node, rect.pos, row, column);
      if (pos === null) continue;
      found.push({ pos, node: rect.node.child(row).child(column), row, column });
    }
  }

  return found;
}
