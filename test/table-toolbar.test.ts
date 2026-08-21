// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "@emqnote/core/markdown/schema";
import { serializeBody } from "@emqnote/core/markdown";
import { createEditorState } from "../src/renderer/editor/state.js";
import type { CommandContext } from "../src/renderer/editor/commands.js";
import type { Node as PMNode } from "prosemirror-model";
import { CellSelection } from "../src/renderer/editor/table-selection.js";
import { docFromMarkdown, caretAfter } from "./helpers/editing.js";

/**
 * The table toolbar — the second route to B42's row/column/alignment commands, which
 * existed from the start and only ever opened on a right-click.
 *
 * A mounted `EditorView` rather than a bare `EditorState`, unlike the rest of the table
 * tests: a widget decoration has no existence outside a view, and half of what is worth
 * checking here is DOM — that the buttons carry the labels `--click-button` matches on,
 * and that clicking one runs the command against the cell the caret was in.
 *
 * The commands themselves are `table-commands.test.ts`'s business. What is asserted here
 * is the wiring: the right button reaches the right command, and the alignment group says
 * what the column currently is.
 */

const CONTEXT: CommandContext = {
  openLinkPrompt: () => {},
  requestImage: () => {},
  requestFile: () => {},
  requestNoteLink: () => {},
  requestTable: () => {},
  // No `t` on purpose: this is the fallback path, and English is what it must produce —
  // a key name on a button would be a visible bug the moment a test stopped looking.
};

const THREE_BY_TWO = "| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

/** A live view whose caret sits just after `needle`. */
function mount(markdown: string, needle: string): EditorView {
  const doc = docFromMarkdown(markdown);
  const base = createEditorState(doc, CONTEXT);
  const state = EditorState.create({
    schema,
    doc,
    plugins: base.plugins,
    selection: TextSelection.create(doc, caretAfter(doc, needle)),
  });

  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView(host, { state });
  return view;
}

function toolbar(): HTMLElement | null {
  return document.querySelector(".table-toolbar");
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll<HTMLButtonElement>(".table-tool")].find(
    (node) => node.textContent === label,
  );
  if (match === undefined) throw new Error(`no toolbar button labelled "${label}"`);
  return match;
}

function markdown(): string {
  return serializeBody(view!.state.doc);
}

describe("when the toolbar appears", () => {
  it("is absent while the caret is in ordinary text", () => {
    mount(`Notes.\n\n${THREE_BY_TWO}`, "Notes.");
    expect(toolbar()).toBeNull();
  });

  it("appears above the table the caret is in", () => {
    mount(THREE_BY_TWO, "e");
    const bar = toolbar();
    expect(bar).not.toBeNull();

    // Before the table in document order, which is what makes it a toolbar rather than a
    // caption — it is a widget at the table's own position with `side: -1`.
    const table = document.querySelector("table")!;
    expect(bar!.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("falls back to English when the window passed no translator", () => {
    mount(THREE_BY_TWO, "a");
    const labels = [...document.querySelectorAll(".table-tool")].map((node) => node.textContent);
    expect(labels).toEqual([
      "Row ↑",
      "Row ↓",
      "Col ←",
      "Col →",
      "Del row",
      "Del col",
      "Left",
      "Centre",
      "Right",
      "Auto",
    ]);
  });

  it("puts the menu's full sentence in the tooltip", () => {
    mount(THREE_BY_TWO, "a");
    expect(button("Row ↓").title).toBe("Insert row below");
    expect(button("Del col").title).toBe("Delete column");
  });

  it("holds no delete-table button — the destructive one stays in the menu", () => {
    mount(THREE_BY_TWO, "a");
    const labels = [...document.querySelectorAll(".table-tool")].map((node) => node.textContent);
    expect(labels).not.toContain("Delete table");
  });
});

describe("what the buttons do", () => {
  it("inserts a row below the caret's own row", () => {
    mount(THREE_BY_TWO, "a");
    button("Row ↓").click();

    expect(markdown()).toBe("| a | b | c |\n| --- | --- | --- |\n|  |  |  |\n| d | e | f |\n");
  });

  it("inserts a row above", () => {
    mount(THREE_BY_TWO, "e");
    button("Row ↑").click();

    expect(markdown()).toBe("| a | b | c |\n| --- | --- | --- |\n|  |  |  |\n| d | e | f |\n");
  });

  it("inserts a column to the right of the caret's own column", () => {
    mount(THREE_BY_TWO, "a");
    button("Col →").click();

    expect(markdown()).toBe(
      "| a |  | b | c |\n| --- | --- | --- | --- |\n| d |  | e | f |\n",
    );
  });

  it("inserts a column to the left", () => {
    mount(THREE_BY_TWO, "b");
    button("Col ←").click();

    expect(markdown()).toBe(
      "| a |  | b | c |\n| --- | --- | --- | --- |\n| d |  | e | f |\n",
    );
  });

  it("deletes the caret's row", () => {
    mount(THREE_BY_TWO, "e");
    button("Del row").click();

    expect(markdown()).toBe("| a | b | c |\n| --- | --- | --- |\n");
  });

  it("deletes the caret's column", () => {
    mount(THREE_BY_TWO, "b");
    button("Del col").click();

    expect(markdown()).toBe("| a | c |\n| --- | --- |\n| d | f |\n");
  });
});

describe("the alignment group", () => {
  it("writes the column's own delimiter, leaving its neighbours alone", () => {
    mount(THREE_BY_TWO, "b");
    button("Centre").click();

    expect(markdown()).toBe("| a | b | c |\n| --- | :---: | --- |\n| d | e | f |\n");
  });

  it("clears back to a plain --- with Auto", () => {
    mount("| a | b |\n| --- | ---: |\n| c | d |\n", "b");
    button("Auto").click();

    expect(markdown()).toBe("| a | b |\n| --- | --- |\n| c | d |\n");
  });

  it("marks what the column already is, before anything is clicked", () => {
    mount("| a | b |\n| :--- | ---: |\n| c | d |\n", "b");

    expect(button("Right").getAttribute("aria-pressed")).toBe("true");
    expect(button("Left").getAttribute("aria-pressed")).toBe("false");
    expect(button("Auto").getAttribute("aria-pressed")).toBe("false");
  });

  it("follows the caret from one column to the next", () => {
    mount("| a | b |\n| :--- | ---: |\n| c | d |\n", "b");
    expect(button("Right").getAttribute("aria-pressed")).toBe("true");

    // Same table, caret moved into the first column — the widget's reuse key carries the
    // active alignment for exactly this: without it the old button stays lit.
    const doc = view!.state.doc;
    view!.dispatch(view!.state.tr.setSelection(TextSelection.create(doc, caretAfter(doc, "a"))));

    expect(button("Left").getAttribute("aria-pressed")).toBe("true");
    expect(button("Right").getAttribute("aria-pressed")).toBe("false");
  });

  it("redraws itself after its own click, rather than staying on the old value", () => {
    mount(THREE_BY_TWO, "b");
    expect(button("Auto").getAttribute("aria-pressed")).toBe("true");

    button("Centre").click();

    expect(button("Centre").getAttribute("aria-pressed")).toBe("true");
    expect(button("Auto").getAttribute("aria-pressed")).toBe("false");
  });
});

/**
 * The same buttons, driven over a selected rectangle (B49). What is checked here is that
 * the toolbar and the selection agree — the rectangle maths itself is
 * `table-selection.test.ts`'s business.
 */
describe("with a rectangle of cells selected", () => {
  /** The position *before* the cell whose text is `needle`. */
  function cellPosOf(doc: PMNode, needle: string): number {
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

  /** A live view with the rectangle between the two named cells selected. */
  function mountSelecting(markdown: string, anchor: string, head: string): EditorView {
    const doc = docFromMarkdown(markdown);
    const base = createEditorState(doc, CONTEXT);
    const selection = CellSelection.between(doc, cellPosOf(doc, anchor), cellPosOf(doc, head));
    if (selection === null) throw new Error("those two cells do not make a rectangle");

    const host = document.createElement("div");
    document.body.appendChild(host);
    view = new EditorView(host, {
      state: EditorState.create({ schema, doc, plugins: base.plugins, selection }),
    });
    return view;
  }

  it("still appears, above the table the rectangle is in", () => {
    mountSelecting(THREE_BY_TWO, "a", "e");
    expect(toolbar()).not.toBeNull();
  });

  it("deletes every row the rectangle touches", () => {
    mountSelecting("| a | b |\n| --- | --- |\n| c | d |\n| e | f |\n", "a", "c");
    button("Del row").click();

    expect(markdown()).toBe("| e | f |\n| --- | --- |\n");
  });

  it("deletes every column the rectangle touches", () => {
    mountSelecting(THREE_BY_TWO, "a", "e");
    button("Del col").click();

    expect(markdown()).toBe("| c |\n| --- |\n| f |\n");
  });

  it("aligns every column the rectangle covers", () => {
    mountSelecting(THREE_BY_TWO, "a", "e");
    button("Centre").click();

    expect(markdown()).toBe("| a | b | c |\n| :---: | :---: | --- |\n| d | e | f |\n");
  });

  it("lights no alignment button when the spanned columns disagree", () => {
    mountSelecting("| a | b |\n| :--- | ---: |\n| c | d |\n", "a", "b");

    expect(button("Left").getAttribute("aria-pressed")).toBe("false");
    expect(button("Right").getAttribute("aria-pressed")).toBe("false");
    expect(button("Auto").getAttribute("aria-pressed")).toBe("false");
  });
});
