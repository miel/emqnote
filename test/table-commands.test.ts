import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { chainCommands } from "prosemirror-commands";
import { schema } from "@emqnote/core/markdown/schema";
import { serializeBody } from "@emqnote/core/markdown";
import {
  addColumn,
  addRow,
  cellBreak,
  columnCount,
  deleteColumn,
  deleteRow,
  deleteTable,
  findTable,
  goToCell,
  insertTable,
  setColumnAlign,
} from "../src/renderer/editor/table-commands.js";
import { tabIndent, tabOutdent } from "../src/renderer/editor/commands.js";
import { docFromMarkdown, markdownOf, run, stateAt, type } from "./helpers/editing.js";

/**
 * Table editing (B42), against `EditorState` and expressed in markdown at both ends — the
 * house style for a command suite, and here it earns its keep twice over: a command that
 * built a shape the serializer cannot write would fail on the markdown assertion rather
 * than pass on a document-shape one.
 */

/** Caret inside the cell whose text is `needle`, in the table in `markdown`. */
function inCell(markdown: string, needle: string): EditorState {
  return stateAt(markdown, needle);
}

/** Caret in the first cell of the (only) table in `markdown`, which may be empty. */
function inFirstCell(markdown: string): EditorState {
  const doc = docFromMarkdown(markdown);
  let at: number | null = null;
  doc.descendants((node, pos) => {
    if (at === null && node.type === schema.nodes.tableCell) at = pos + 1;
    return at === null;
  });
  if (at === null) throw new Error("no table cell in the document");
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, at) });
}

const THREE_BY_TWO = "| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n";

describe("insertTable", () => {
  it("writes a plain GFM table the serializer already knows how to spell", () => {
    const after = run(stateAt("Notes.\n", "Notes."), insertTable(2, 3));

    // Three dashes, no cell padding, one delimiter row — `03-markdown-dialect.md` §3.5,
    // and unchanged from what the corpus fixtures already pin.
    expect(markdownOf(after)).toContain("|  |  |  |\n| --- | --- | --- |\n|  |  |  |");
  });

  it("puts the caret in the first cell, ready to type", () => {
    const after = run(stateAt("Notes.\n", "Notes."), insertTable(2, 2));
    const context = findTable(after);

    expect(context).not.toBeNull();
    expect(context!.row).toBe(0);
    expect(context!.cell).toBe(0);
    expect(markdownOf(type(after, "Klant"))).toContain("| Klant |  |");
  });

  it("refuses to nest a table inside a table, which GFM could not write down", () => {
    expect(insertTable(2, 2)(inCell(THREE_BY_TWO, "b"), undefined)).toBe(false);
  });

  it("refuses a degenerate size rather than building an empty husk", () => {
    expect(insertTable(0, 3)(stateAt("Notes.\n", "Notes."), undefined)).toBe(false);
    expect(insertTable(3, 0)(stateAt("Notes.\n", "Notes."), undefined)).toBe(false);
  });
});

describe("rows", () => {
  it("inserts above and below the caret's own row", () => {
    expect(markdownOf(run(inCell(THREE_BY_TWO, "e"), addRow("before")))).toBe(
      "| a | b | c |\n| --- | --- | --- |\n|  |  |  |\n| d | e | f |\n",
    );
    expect(markdownOf(run(inCell(THREE_BY_TWO, "e"), addRow("after")))).toBe(
      "| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n|  |  |  |\n",
    );
  });

  it("deletes the caret's row", () => {
    expect(markdownOf(run(inCell(THREE_BY_TWO, "e"), deleteRow()))).toBe(
      "| a | b | c |\n| --- | --- | --- |\n",
    );
  });

  it("takes the whole table with the last row, rather than leaving a husk", () => {
    // `tableRow+` means a table with no rows is not a document the schema allows, and an
    // empty one would be worse than the deletion the user clearly meant.
    const single = "| a | b |\n| --- | --- |\n";
    expect(markdownOf(run(inCell(single, "a"), deleteRow())).trim()).toBe("");
  });
});

describe("columns", () => {
  it("inserts left and right of the caret's own column", () => {
    expect(markdownOf(run(inCell(THREE_BY_TWO, "b"), addColumn("before")))).toBe(
      "| a |  | b | c |\n| --- | --- | --- | --- |\n| d |  | e | f |\n",
    );
    expect(markdownOf(run(inCell(THREE_BY_TWO, "b"), addColumn("after")))).toBe(
      "| a | b |  | c |\n| --- | --- | --- | --- |\n| d | e |  | f |\n",
    );
  });

  it("deletes the caret's column across every row", () => {
    expect(markdownOf(run(inCell(THREE_BY_TWO, "b"), deleteColumn()))).toBe(
      "| a | c |\n| --- | --- |\n| d | f |\n",
    );
  });

  it("takes the whole table with the last column", () => {
    const single = "| a |\n| --- |\n| b |\n";
    expect(markdownOf(run(inCell(single, "a"), deleteColumn())).trim()).toBe("");
  });

  it("moves the alignment array in step, so no column inherits its neighbour's", () => {
    // Without the splice, inserting a column before the middle one would leave `center`
    // sitting on the new empty column and shift every alignment one place right.
    const aligned = "| l | c | r |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n";
    const after = run(inCell(aligned, "c"), addColumn("before"));

    expect(markdownOf(after)).toBe(
      "| l |  | c | r |\n| :--- | --- | :---: | ---: |\n| 1 |  | 2 | 3 |\n",
    );
  });

  it("keeps the alignments lined up when a column is removed", () => {
    const aligned = "| l | c | r |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n";

    expect(markdownOf(run(inCell(aligned, "c"), deleteColumn()))).toBe(
      "| l | r |\n| :--- | ---: |\n| 1 | 3 |\n",
    );
  });
});

describe("ragged rows", () => {
  // `from-mdast.ts` copies whatever the file had without padding, so a hand-written table
  // with a short row really does parse to a short row. Every column operation has to
  // square it up first rather than index past the end of one.
  const ragged = "| a | b | c |\n| --- | --- | --- |\n| d |\n";

  it("is a real shape, not a hypothetical one", () => {
    const doc = docFromMarkdown(ragged);
    let table: ReturnType<typeof docFromMarkdown> | null = null;
    doc.descendants((node) => {
      if (node.type === schema.nodes.table) table = node;
      return table === null;
    });

    expect(table!.child(0).childCount).toBe(3);
    expect(table!.child(1).childCount).toBe(1);
    expect(columnCount(table!)).toBe(3);
  });

  it("squares up before adding a column, instead of indexing past the short row", () => {
    expect(markdownOf(run(inCell(ragged, "b"), addColumn("after")))).toBe(
      "| a | b |  | c |\n| --- | --- | --- | --- |\n| d |  |  |  |\n",
    );
  });

  it("tolerates a short row when deleting a column", () => {
    expect(markdownOf(run(inCell(ragged, "c"), deleteColumn()))).toBe(
      "| a | b |\n| --- | --- |\n| d |  |\n",
    );
  });
});

describe("Tab", () => {
  // Exactly as `keymap.ts` chains them — the ordering *is* the mechanism, since
  // `tabIndent`/`tabOutdent` return true unconditionally and would swallow the key.
  const pressTab = chainCommands(goToCell("next"), tabIndent);
  const pressShiftTab = chainCommands(goToCell("previous"), tabOutdent);

  it("moves to the next cell and selects it, so it can be overtyped", () => {
    const after = run(inCell(THREE_BY_TWO, "a"), pressTab);
    const context = findTable(after);

    expect(context!.cell).toBe(1);
    expect(after.doc.textBetween(after.selection.from, after.selection.to)).toBe("b");
  });

  it("wraps onto the next row at the end of one", () => {
    const after = run(inCell(THREE_BY_TWO, "c"), pressTab);
    const context = findTable(after);

    expect(context!.row).toBe(1);
    expect(context!.cell).toBe(0);
  });

  it("appends a row off the last cell and lands in it — the whole point of Tab here", () => {
    const after = run(inCell(THREE_BY_TWO, "f"), pressTab);

    expect(markdownOf(after)).toBe(
      "| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n|  |  |  |\n",
    );
    const context = findTable(after);
    expect(context!.row).toBe(2);
    expect(context!.cell).toBe(0);
  });

  it("goes back a cell on Shift-Tab", () => {
    const after = run(inCell(THREE_BY_TWO, "e"), pressShiftTab);
    expect(findTable(after)!.cell).toBe(0);
  });

  it("does not add a row off the *first* cell going backwards", () => {
    const before = inCell(THREE_BY_TWO, "a");
    const after = run(before, pressShiftTab);
    expect(markdownOf(after)).toBe(markdownOf(before));
  });

  it("leaves Tab in a list exactly as it was", () => {
    // The regression that would follow from chaining these the other way round: the
    // table pair must decline outside a table, and the list pair must still run.
    const list = stateAt("- one\n- two\n", "two");
    expect(markdownOf(run(list, pressTab))).toBe("- one\n  - two\n");
  });
});

describe("Enter in a cell", () => {
  it("breaks the line rather than dying, and writes the <br> the dialect asks for", () => {
    // `tableCell` is `inline*`, so there is no paragraph to split — `baseKeymap.Enter`
    // simply fails and Enter is dead inside a table without this.
    const after = type(run(inCell(THREE_BY_TWO, "b"), cellBreak), "meer");
    expect(markdownOf(after)).toContain("| a | b<br>meer | c |");
  });

  it("declines outside a table, leaving Enter to the list logic behind it", () => {
    expect(cellBreak(stateAt("Plain.\n", "Plain."), undefined)).toBe(false);
  });
});

describe("column alignment", () => {
  it("writes the delimiter row the file format already reads back", () => {
    const after = run(inCell(THREE_BY_TWO, "b"), setColumnAlign("center"));
    expect(markdownOf(after)).toBe(
      "| a | b | c |\n| --- | :---: | --- |\n| d | e | f |\n",
    );
  });

  it("clears back to a plain --- , which is a real state and not the same as left", () => {
    const aligned = "| a | b |\n| :--- | :---: |\n| c | d |\n";
    expect(markdownOf(run(inCell(aligned, "b"), setColumnAlign(null)))).toBe(
      "| a | b |\n| :--- | --- |\n| c | d |\n",
    );
  });
});

describe("deleteTable", () => {
  it("removes the table and nothing around it", () => {
    // The cell texts are deliberately not letters that also occur in the prose around
    // it: `caretAfter` takes the *first* match in the document, so a cell called "e"
    // would put the caret in "Before." and quietly test nothing.
    const around = "Prose above.\n\n| xx | yy |\n| --- | --- |\n| zz | ww |\n\nProse below.\n";
    const after = run(inCell(around, "zz"), deleteTable());

    expect(markdownOf(after)).toBe("Prose above.\n\nProse below.\n");
  });
});

describe("findTable", () => {
  it("answers null outside a table, which is what every command's guard depends on", () => {
    expect(findTable(stateAt("Just a sentence.\n", "sentence"))).toBeNull();
  });

  it("finds a table nested inside a list item, which the schema does allow", () => {
    // Corpus 09 is exactly this shape, so the commands have to cope with it.
    const inList = "- item\n\n  | a | b |\n  | --- | --- |\n  | c | d |\n";
    expect(findTable(inCell(inList, "c"))).not.toBeNull();
  });
});

describe("an empty table survives the round trip", () => {
  it("serializes and is not mistaken for editing residue", () => {
    const after = run(stateAt("Notes.\n", "Notes."), insertTable(2, 2));
    const markdown = markdownOf(after);

    expect(markdown).toContain("| --- | --- |");
    // And back again — the shape the serializer wrote is the shape the parser reads.
    expect(serializeBody(docFromMarkdown(markdown))).toBe(markdown);
  });
});

describe("the first cell of a freshly inserted table", () => {
  it("is where insertTable leaves the caret even in an empty document", () => {
    const empty = EditorState.create({ schema, doc: docFromMarkdown("\n") });
    const after = run(empty, insertTable(2, 2));

    expect(findTable(after)).not.toBeNull();
    expect(markdownOf(inFirstCell(markdownOf(after)))).toContain("| --- | --- |");
  });
});
