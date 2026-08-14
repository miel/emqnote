import { Fragment, Slice, type Node as PMNode, type ResolvedPos } from "prosemirror-model";
import { Selection, SelectionRange, type EditorState } from "prosemirror-state";
import type { Mappable } from "prosemirror-transform";
import type { ColumnAlign } from "../../markdown/schema.js";
import {
  alignOf,
  cellPosAt,
  cellsInRect,
  emptyCell,
  findTable,
  rectOfContext,
  tableCellType,
  tableFrom,
  tableRowType,
  tableType,
  type TableRect,
} from "./table-geometry.js";

/**
 * A rectangle of table cells, selected (B49).
 *
 * Hand-rolled for the same reason B42 refused `prosemirror-tables` outright: that library's
 * `CellSelection` comes with its `TableMap`, its `tableRole`s, its separate header node and
 * its `colspan`/`rowspan` attributes — and this schema *is* the file format, where GFM
 * cannot express a merged cell at all. What is wanted is a rectangle over a matrix, and a
 * rectangle over a matrix is what this is. It follows `prosemirror-tables`' shape closely
 * where that shape is simply how a `Selection` subclass has to work (ranges per cell, the
 * head cell's range first, `map` degrading to a text selection when the cells are gone),
 * and departs from it everywhere the difference is this schema.
 *
 * Two properties are worth naming because they are easy to lose:
 *
 * - **`visible` is false.** The browser draws no native selection over the rectangle; the
 *   decoration in `table-align.ts` is the only thing that shows it. A native selection
 *   across an `isolating` boundary is what today's drag produces, and what makes Backspace
 *   there do nothing anyone wants.
 * - **A ragged row has no cell to select.** `from-mdast.ts` pads nothing, so a rectangle
 *   drawn over a squared-up grid can cover a cell that does not exist. Every walk here
 *   skips those rather than inventing one — inventing one would mean *selecting* a cell the
 *   file does not have, and then writing it back on the first edit.
 */

/** Whether this position sits immediately before a cell — the shape a cell pointer has. */
export function pointsAtCell($pos: ResolvedPos): boolean {
  return $pos.parent.type === tableRowType && $pos.nodeAfter?.type === tableCellType;
}

/** The position before the cell containing `$pos`, or null when it is not in one. */
export function cellAround($pos: ResolvedPos): ResolvedPos | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type === tableCellType) return $pos.doc.resolve($pos.before(depth));
  }
  return null;
}

/** Whether two cell pointers belong to the same table. */
export function inSameTable($a: ResolvedPos, $b: ResolvedPos): boolean {
  return $a.depth === $b.depth && $a.pos >= $b.start(-1) && $a.pos <= $b.end(-1);
}

function coordsOf($cell: ResolvedPos): { row: number; column: number } {
  return { row: $cell.index(-1), column: $cell.index() };
}

function rectBetween($anchorCell: ResolvedPos, $headCell: ResolvedPos): TableRect {
  const anchor = coordsOf($anchorCell);
  const head = coordsOf($headCell);

  return {
    node: $anchorCell.node(-1),
    pos: $anchorCell.before(-1),
    top: Math.min(anchor.row, head.row),
    bottom: Math.max(anchor.row, head.row),
    left: Math.min(anchor.column, head.column),
    right: Math.max(anchor.column, head.column),
  };
}

interface CellBookmarkJSON {
  anchor: number;
  head: number;
}

class CellBookmark {
  constructor(
    readonly anchor: number,
    readonly head: number,
  ) {}

  map(mapping: Mappable): CellBookmark {
    return new CellBookmark(mapping.map(this.anchor), mapping.map(this.head));
  }

  resolve(doc: PMNode): Selection {
    const $anchorCell = doc.resolve(this.anchor);
    const $headCell = doc.resolve(this.head);
    if (pointsAtCell($anchorCell) && pointsAtCell($headCell) && inSameTable($anchorCell, $headCell)) {
      return new CellSelection($anchorCell, $headCell);
    }
    return Selection.near($headCell, 1);
  }
}

export class CellSelection extends Selection {
  readonly $anchorCell: ResolvedPos;
  readonly $headCell: ResolvedPos;

  constructor($anchorCell: ResolvedPos, $headCell: ResolvedPos = $anchorCell) {
    const rect = rectBetween($anchorCell, $headCell);
    const doc = $anchorCell.doc;

    // The head cell's own range goes first, so ProseMirror treats it as the primary part
    // of the selection — that is what `$from`/`$to` end up describing, and what a command
    // reading `state.selection.$from` without knowing about cells sees.
    const cells = cellsInRect(rect);
    const ordered = [
      ...cells.filter((cell) => cell.pos === $headCell.pos),
      ...cells.filter((cell) => cell.pos !== $headCell.pos),
    ];
    const ranges = ordered.map(
      ({ pos, node }) =>
        new SelectionRange(doc.resolve(pos + 1), doc.resolve(pos + node.nodeSize - 1)),
    );

    super(ranges[0]!.$from, ranges[0]!.$to, ranges);

    this.$anchorCell = $anchorCell;
    this.$headCell = $headCell;
    // The browser draws no native selection over the rectangle — see the note at the top
    // of this file. `table-align.ts`'s decoration is the only thing that shows it.
    this.visible = false;
  }

  /** The rectangle, in the coordinates every table command already speaks. */
  rect(): TableRect {
    return rectBetween(this.$anchorCell, this.$headCell);
  }

  override map(doc: PMNode, mapping: Mappable): Selection {
    const $anchorCell = doc.resolve(mapping.map(this.$anchorCell.pos));
    const $headCell = doc.resolve(mapping.map(this.$headCell.pos));

    // The cells can be gone — the row deleted, the whole table replaced. A selection that
    // insisted on still being a cell selection there would throw inside `apply`, which is
    // the worst place in ProseMirror to throw; degrading to a caret is what every other
    // selection type does when its ground moves out from under it.
    if (pointsAtCell($anchorCell) && pointsAtCell($headCell) && inSameTable($anchorCell, $headCell)) {
      return new CellSelection($anchorCell, $headCell);
    }
    return Selection.near($headCell, 1);
  }

  /**
   * The rectangle as a table of its own, so copying one puts a real table on the clipboard.
   *
   * The per-column `align` array is sliced to the selected columns, or the copy would carry
   * the alignment of columns it does not contain — the same "splice in step" rule
   * `addColumn` follows, read from the other end.
   */
  override content(): Slice {
    const rect = this.rect();
    const rows: PMNode[][] = [];

    for (let row = rect.top; row <= rect.bottom; row += 1) {
      const cells: PMNode[] = [];
      for (let column = rect.left; column <= rect.right; column += 1) {
        const pos = cellPosAt(rect.node, rect.pos, row, column);
        // A ragged row is squared up *here* and only here: what is being built is a new
        // table, and a table with a hole in it is not something the schema or GFM can hold.
        cells.push(pos === null ? emptyCell() : rect.node.child(row).child(column));
      }
      rows.push(cells);
    }

    const align: ColumnAlign[] = alignOf(rect.node).slice(rect.left, rect.right + 1);
    return new Slice(Fragment.from(tableFrom(rows, align)), 1, 1);
  }

  override eq(other: Selection): boolean {
    return (
      other instanceof CellSelection &&
      other.$anchorCell.pos === this.$anchorCell.pos &&
      other.$headCell.pos === this.$headCell.pos
    );
  }

  override toJSON(): CellBookmarkJSON & { type: string } {
    return { type: "cell", anchor: this.$anchorCell.pos, head: this.$headCell.pos };
  }

  override getBookmark(): CellBookmark {
    return new CellBookmark(this.$anchorCell.pos, this.$headCell.pos);
  }

  static override fromJSON(doc: PMNode, json: CellBookmarkJSON): CellSelection {
    return new CellSelection(doc.resolve(json.anchor), doc.resolve(json.head));
  }

  /** A cell selection between two *cell pointers*, or null when they are not that. */
  static between(doc: PMNode, anchorCellPos: number, headCellPos: number): CellSelection | null {
    if (anchorCellPos < 0 || headCellPos < 0) return null;
    if (anchorCellPos > doc.content.size || headCellPos > doc.content.size) return null;

    const $anchorCell = doc.resolve(anchorCellPos);
    const $headCell = doc.resolve(headCellPos);
    if (!pointsAtCell($anchorCell) || !pointsAtCell($headCell)) return null;
    if (!inSameTable($anchorCell, $headCell)) return null;

    return new CellSelection($anchorCell, $headCell);
  }
}

Selection.jsonID("cell", CellSelection);

export function isCellSelection(selection: Selection): selection is CellSelection {
  return selection instanceof CellSelection;
}

/**
 * The rectangle a table operation is about: the selected cells when a rectangle is up, the
 * caret's own cell otherwise.
 *
 * One function, so "delete row" means *the rows this touches* without a second code path —
 * which is the whole of how B49 reaches B42's dozen commands without rewriting them.
 */
export function selectedRect(state: EditorState): TableRect | null {
  const selection = state.selection;
  if (isCellSelection(selection)) return selection.rect();

  const context = findTable(state);
  return context === null ? null : rectOfContext(context);
}

/**
 * The cell pointer for a document position — what a click or a drag reports, turned into
 * the coordinate this file speaks.
 *
 * Split out so the pointer handling in `table-align.ts` is a coordinates-to-position
 * wrapper and nothing else: `posAtCoords` needs a laid-out document, which is exactly what
 * the test environment does not have.
 */
export function cellPointerAt(doc: PMNode, pos: number): number | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $cell = cellAround(doc.resolve(pos));
  return $cell === null ? null : $cell.pos;
}

/** Whether a position sits inside `table`, for a drag that may have left it. */
export function isInTable(doc: PMNode, pos: number, tablePos: number): boolean {
  const table = doc.nodeAt(tablePos);
  if (table === null || table.type !== tableType) return false;
  return pos > tablePos && pos < tablePos + table.nodeSize;
}
