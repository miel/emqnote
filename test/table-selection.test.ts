import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "@emqnote/core/markdown/schema";
import { serializeBody } from "@emqnote/core/markdown";
import {
  CellSelection,
  isCellSelection,
  cellPointerAt,
  selectedRect,
} from "../src/renderer/editor/table-selection.js";
import {
  addColumn,
  addRow,
  clearCells,
  deleteColumn,
  deleteRow,
  extendCellSelection,
  setColumnAlign,
} from "../src/renderer/editor/table-commands.js";
import { clipboardText } from "../src/renderer/editor/clipboard-text.js";
import { docFromMarkdown, markdownOf, run } from "./helpers/editing.js";

/**
 * A rectangle of table cells (B49), against `EditorState` and expressed in markdown at
 * both ends — the same house style `table-commands.test.ts` follows, and it earns its keep
 * the same way: an operation that built a shape the serializer cannot write fails on the
 * markdown assertion rather than passing on a document-shape one.
 *
 * The pointer half is not here. `posAtCoords` needs a laid-out document and there is none
 * under vitest, which is exactly why `table-drag.ts` is a coordinates-to-position wrapper
 * over `cellPointerAt`/`CellSelection.between` — both of which are functions over a
 * document, and both of which are tested directly below.
 */

const THREE_BY_THREE =
  "| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n| g | h | i |\n";

/** The position *before* the cell whose text is `needle`. */
function cellPos(doc: PMNode, needle: string): number {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type === schema.nodes.tableCell && node.textContent === needle) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`no cell holding ${needle}`);
  return found;
}

/** A state with the rectangle between the two named cells selected. */
function selecting(markdown: string, anchor: string, head: string): EditorState {
  const doc = docFromMarkdown(markdown);
  const selection = CellSelection.between(doc, cellPos(doc, anchor), cellPos(doc, head));
  if (selection === null) throw new Error("those two cells do not make a rectangle");
  return EditorState.create({ schema, doc, selection });
}

/** A caret inside the cell whose text is `needle`. */
function caretIn(markdown: string, needle: string): EditorState {
  const doc = docFromMarkdown(markdown);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, cellPos(doc, needle) + 1),
  });
}

describe("CellSelection", () => {
  it("covers the rectangle between two cells, whichever corner it started from", () => {
    const forwards = selecting(THREE_BY_THREE, "b", "f").selection as CellSelection;
    const backwards = selecting(THREE_BY_THREE, "f", "b").selection as CellSelection;

    expect(forwards.rect()).toMatchObject({ top: 0, bottom: 1, left: 1, right: 2 });
    expect(backwards.rect()).toMatchObject({ top: 0, bottom: 1, left: 1, right: 2 });
  });

  it("refuses two cells that are not in the same table", () => {
    const doc = docFromMarkdown(`${THREE_BY_THREE}\nTussen.\n\n| x |\n| --- |\n`);
    expect(CellSelection.between(doc, cellPos(doc, "a"), cellPos(doc, "x"))).toBeNull();
  });

  it("refuses a position that is not a cell pointer", () => {
    const doc = docFromMarkdown(THREE_BY_THREE);
    expect(CellSelection.between(doc, cellPos(doc, "a"), cellPos(doc, "a") + 1)).toBeNull();
  });

  it("is invisible, so the browser paints nothing over the decoration", () => {
    expect(selecting(THREE_BY_THREE, "a", "e").selection.visible).toBe(false);
  });

  it("carries one range per selected cell, the head cell's first", () => {
    const selection = selecting(THREE_BY_THREE, "a", "e").selection as CellSelection;

    expect(selection.ranges).toHaveLength(4);
    expect(selection.$from.parent.textContent).toBe("e");
  });

  it("survives an edit elsewhere in the document", () => {
    const state = selecting(THREE_BY_THREE, "a", "e");
    const after = state.apply(state.tr.insertText("!", cellPos(state.doc, "i") + 1));

    expect(isCellSelection(after.selection)).toBe(true);
    expect((after.selection as CellSelection).rect()).toMatchObject({
      top: 0,
      bottom: 1,
      left: 0,
      right: 1,
    });
  });

  it("degrades to a caret when the cells it named are gone", () => {
    const state = selecting(THREE_BY_THREE, "a", "e");
    const after = state.apply(state.tr.delete(0, state.doc.content.size));

    expect(isCellSelection(after.selection)).toBe(false);
  });

  it("round-trips through JSON, so undo history can restore it", () => {
    const state = selecting(THREE_BY_THREE, "b", "f");
    const restored = EditorState.fromJSON(
      { schema },
      JSON.parse(JSON.stringify(state.toJSON())) as Parameters<typeof EditorState.fromJSON>[1],
    );

    expect(isCellSelection(restored.selection)).toBe(true);
    expect(restored.selection.eq(state.selection)).toBe(true);
  });
});

describe("CellSelection.content", () => {
  it("copies the rectangle as a table of its own", () => {
    const selection = selecting(THREE_BY_THREE, "b", "f").selection as CellSelection;
    const table = selection.content().content.firstChild!;

    expect(serializeBody(schema.nodes.doc!.create(null, [table]))).toBe(
      "| b | c |\n| --- | --- |\n| e | f |\n",
    );
  });

  it("takes the alignment of the columns it actually holds", () => {
    const aligned = "| a | b | c |\n| :--- | ---: | :---: |\n| d | e | f |\n";
    const selection = selecting(aligned, "b", "f").selection as CellSelection;
    const table = selection.content().content.firstChild!;

    expect(serializeBody(schema.nodes.doc!.create(null, [table]))).toBe(
      "| b | c |\n| ---: | :---: |\n| e | f |\n",
    );
  });

  it("squares up a ragged row rather than copying a hole", () => {
    const ragged = "| a | b | c |\n| --- | --- | --- |\n| d |\n";
    const selection = selecting(ragged, "a", "d").selection as CellSelection;
    const table = selection.content().content.firstChild!;

    expect(serializeBody(schema.nodes.doc!.create(null, [table]))).toBe(
      "| a |\n| --- |\n| d |\n",
    );
  });

  it("puts pipes on the plain-text clipboard, not one line per cell", () => {
    const selection = selecting(THREE_BY_THREE, "a", "e").selection as CellSelection;
    expect(clipboardText(selection.content())).toBe("| a | b |\n| d | e |");
  });
});

describe("selectedRect", () => {
  it("is one cell for a caret", () => {
    expect(selectedRect(caretIn(THREE_BY_THREE, "e"))).toMatchObject({
      top: 1,
      bottom: 1,
      left: 1,
      right: 1,
    });
  });

  it("is the whole rectangle for a cell selection", () => {
    expect(selectedRect(selecting(THREE_BY_THREE, "a", "i"))).toMatchObject({
      top: 0,
      bottom: 2,
      left: 0,
      right: 2,
    });
  });

  it("is null outside a table", () => {
    const doc = docFromMarkdown("Gewoon een zin.\n");
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1) });
    expect(selectedRect(state)).toBeNull();
  });
});

describe("commands over a rectangle", () => {
  it("clears every selected cell and leaves the shape alone", () => {
    const after = run(selecting(THREE_BY_THREE, "b", "f"), clearCells());

    expect(markdownOf(after)).toBe("| a |  |  |\n| --- | --- | --- |\n| d |  |  |\n| g | h | i |\n");
  });

  it("puts the caret in the first cell of the rectangle after clearing", () => {
    const after = run(selecting(THREE_BY_THREE, "b", "f"), clearCells());

    expect(isCellSelection(after.selection)).toBe(false);
    expect(after.selection.$from.parent.type).toBe(schema.nodes.tableCell);
    expect(after.selection.empty).toBe(true);
  });

  it("declines when there is no rectangle, so Backspace is untouched elsewhere", () => {
    expect(clearCells()(caretIn(THREE_BY_THREE, "e"), undefined)).toBe(false);
  });

  it("deletes every row the selection touches", () => {
    const after = run(selecting(THREE_BY_THREE, "a", "e"), deleteRow());
    expect(markdownOf(after)).toBe("| g | h | i |\n| --- | --- | --- |\n");
  });

  it("deletes every column the selection touches", () => {
    const after = run(selecting(THREE_BY_THREE, "a", "e"), deleteColumn());
    expect(markdownOf(after)).toBe("| c |\n| --- |\n| f |\n| i |\n");
  });

  it("takes the whole table when the selection covers every row", () => {
    const after = run(selecting(THREE_BY_THREE, "a", "i"), deleteRow());
    expect(markdownOf(after)).toBe("");
  });

  it("adds as many rows as the selection is tall", () => {
    const after = run(selecting(THREE_BY_THREE, "a", "e"), addRow("after"));

    expect(markdownOf(after)).toBe(
      "| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n|  |  |  |\n|  |  |  |\n| g | h | i |\n",
    );
  });

  it("adds as many columns as the selection is wide", () => {
    const after = run(selecting(THREE_BY_THREE, "a", "e"), addColumn("before"));

    expect(markdownOf(after)).toBe(
      "|  |  | a | b | c |\n| --- | --- | --- | --- | --- |\n|  |  | d | e | f |\n|  |  | g | h | i |\n",
    );
  });

  it("aligns every column the selection covers", () => {
    const after = run(selecting(THREE_BY_THREE, "a", "e"), setColumnAlign("center"));

    expect(markdownOf(after)).toBe(
      "| a | b | c |\n| :---: | :---: | --- |\n| d | e | f |\n| g | h | i |\n",
    );
  });

  it("keeps the rectangle selected after an alignment change", () => {
    const after = run(selecting(THREE_BY_THREE, "a", "e"), setColumnAlign("right"));
    expect(isCellSelection(after.selection)).toBe(true);
  });
});

describe("extendCellSelection", () => {
  it("starts a rectangle from a caret at the end of its cell", () => {
    const doc = docFromMarkdown(THREE_BY_THREE);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, cellPos(doc, "a") + 2),
    });

    const after = run(state, extendCellSelection("right"));
    expect(selectedRect(after)).toMatchObject({ top: 0, bottom: 0, left: 0, right: 1 });
  });

  it("leaves an ordinary text selection alone in the middle of a cell", () => {
    const long = "| hallo | b |\n| --- | --- |\n| c | d |\n";
    const doc = docFromMarkdown(long);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, cellPos(doc, "hallo") + 2),
    });

    expect(extendCellSelection("right")(state, undefined)).toBe(false);
  });

  it("grows and shrinks an existing rectangle", () => {
    const grown = run(selecting(THREE_BY_THREE, "a", "b"), extendCellSelection("down"));
    expect(selectedRect(grown)).toMatchObject({ top: 0, bottom: 1, left: 0, right: 1 });

    const shrunk = run(grown, extendCellSelection("left"));
    expect(selectedRect(shrunk)).toMatchObject({ top: 0, bottom: 1, left: 0, right: 0 });
  });

  it("declines at the edge of the table", () => {
    expect(extendCellSelection("up")(selecting(THREE_BY_THREE, "a", "b"), undefined)).toBe(false);
  });

  it("declines outside a table", () => {
    const doc = docFromMarkdown("Gewoon een zin.\n");
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1) });
    expect(extendCellSelection("down")(state, undefined)).toBe(false);
  });

  /**
   * The half that was missing, and the reason Shift+arrow behaved unlike the mouse.
   *
   * Shift+Right inside a word grows an ordinary text selection — the case above — and the
   * press that reaches the end of the cell has to escalate to a rectangle. It did not: the
   * command bailed on any selection that was not a caret, `prosemirror-view` extended a
   * `TextSelection` across the `isolating` boundary instead, and Backspace over the result
   * did nothing because `clearCells` rightly refuses that state.
   */
  it("escalates a text selection that has grown to the end of its cell", () => {
    const long = "| hallo | b |\n| --- | --- |\n| c | d |\n";
    const doc = docFromMarkdown(long);
    const start = cellPos(doc, "hallo") + 1;
    const state = EditorState.create({
      schema,
      doc,
      // "hallo" selected from its first character to its last: not a caret, and at the edge.
      selection: TextSelection.create(doc, start, start + 5),
    });

    const after = run(state, extendCellSelection("right"));
    expect(isCellSelection(after.selection)).toBe(true);
    expect(selectedRect(after)).toMatchObject({ top: 0, bottom: 0, left: 0, right: 1 });
  });

  it("escalates downwards from a part-selected cell, since a cell has no line below", () => {
    const long = "| hallo | b |\n| --- | --- |\n| c | d |\n";
    const doc = docFromMarkdown(long);
    const start = cellPos(doc, "hallo") + 1;
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, start, start + 2),
    });

    const after = run(state, extendCellSelection("down"));
    expect(selectedRect(after)).toMatchObject({ top: 0, bottom: 1, left: 0, right: 0 });
  });

  /** `$from` is the end that is *not* moving in a backwards selection, so it cannot be asked. */
  it("reads the edge off the head, not the start, of a backwards selection", () => {
    const long = "| a | hallo |\n| --- | --- |\n| c | d |\n";
    const doc = docFromMarkdown(long);
    const start = cellPos(doc, "hallo") + 1;
    const state = EditorState.create({
      schema,
      // Anchor at the end of the word, head at its start: Shift+Left again leaves the cell.
      doc,
      selection: TextSelection.create(doc, start + 5, start),
    });

    const after = run(state, extendCellSelection("left"));
    expect(selectedRect(after)).toMatchObject({ top: 0, bottom: 0, left: 0, right: 1 });
  });

  it("repairs a text selection that already spans two cells", () => {
    const doc = docFromMarkdown(THREE_BY_THREE);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, cellPos(doc, "a") + 1, cellPos(doc, "b") + 1),
    });

    const after = run(state, extendCellSelection("right"));
    expect(isCellSelection(after.selection)).toBe(true);
    expect(selectedRect(after)).toMatchObject({ top: 0, bottom: 0, left: 0, right: 2 });
  });

  it("declines past the last column, whether or not text is selected", () => {
    const doc = docFromMarkdown(THREE_BY_THREE);
    const start = cellPos(doc, "c") + 1;
    const caret = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, start + 1),
    });
    const selected = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, start, start + 1),
    });

    expect(extendCellSelection("right")(caret, undefined)).toBe(false);
    expect(extendCellSelection("right")(selected, undefined)).toBe(false);
  });
});

describe("cellPointerAt", () => {
  it("finds the cell a position sits inside", () => {
    const doc = docFromMarkdown(THREE_BY_THREE);
    expect(cellPointerAt(doc, cellPos(doc, "e") + 1)).toBe(cellPos(doc, "e"));
  });

  it("answers null outside a table", () => {
    const doc = docFromMarkdown("Gewoon een zin.\n");
    expect(cellPointerAt(doc, 1)).toBeNull();
  });
});
