// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * A rectangle of table cells (B49) in the capture window, and the toolbar that acts on it.
 *
 * `table-selection.test.ts` and `table-commands.test.ts` already pin what a `CellSelection`
 * *is* and what every command does to one, against `EditorState` and expressed in markdown
 * at both ends. None of that is repeated. The open item was the other half: `TODO.md` has
 * listed B49 "in the capture window" since 14 August 2026, on the grounds that this window
 * had no harness — and the plugins, the keymap and the toolbar widget all have to be in
 * *this* editor for any of it to happen while a note is being written.
 *
 * The keyboard route is the one driven here, and that is not a compromise: Shift+arrow
 * inside a table is a real way to select a rectangle and the only one that does not need
 * a laid-out document. **The pointer route is not reachable and is not faked** —
 * `cellPointerAt` goes through `posAtCoords`, which needs boxes jsdom does not compute.
 * Whether the rectangle keeps up with the pointer stays `TEST-PROTOCOL.md` §19b and
 * `scripts/drive-capture.ts`.
 *
 * One more thing jsdom cannot do, said out loud so nobody reads its absence as a finding:
 * **an arrow key nothing has bound moves no caret here.** ProseMirror leaves plain arrows
 * and Shift+arrow-within-a-cell to the browser and reads the result back, and jsdom moves
 * no selection of its own — so a rectangle collapsing on a plain ArrowLeft, and
 * `extendCellSelection` declining while there is still text in the cell to extend over,
 * are both unreachable in this file. `table-selection.test.ts` owns them at the state
 * level, and a person at a real display owns them in this window. The keys driven below
 * are the ones the app itself binds, which is why they work.
 */

const TABLE = `| Wie | Wat |
| --- | --- |
| Jan | offerte |
| Piet | planning |
`;

/** A note whose first node is that table, so the caret opens in its first cell. */
async function withTable(capture: MountedCapture): Promise<void> {
  await capture.fireLoad(openedNote({ doc: docFromMarkdown(TABLE).toJSON() }));
}

describe("selecting a rectangle of cells in the capture window", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
    await withTable(capture);
  });

  afterEach(() => {
    capture.unmount();
  });

  function selected(): string[] {
    return [...capture.container.querySelectorAll(".table-cell-selected")].map(
      (node) => node.textContent ?? "",
    );
  }

  function cells(): string[] {
    return [...capture.container.querySelectorAll(".ProseMirror td, .ProseMirror th")].map(
      (node) => node.textContent ?? "",
    );
  }

  it("takes a column of two on Shift+ArrowDown", async () => {
    await capture.pressKeyInBody({ key: "ArrowDown", shiftKey: true });

    expect(selected()).toEqual(["Wie", "Jan"]);
  });

  it("grows that into a rectangle on Shift+ArrowRight", async () => {
    await capture.pressKeyInBody({ key: "ArrowDown", shiftKey: true });
    await capture.pressKeyInBody({ key: "ArrowRight", shiftKey: true });

    // Two by two, in document order — the shape the toolbar and Backspace both act on.
    expect(selected()).toEqual(["Wie", "Wat", "Jan", "offerte"]);
  });

  it("empties exactly those cells on Backspace, and no others (B49)", async () => {
    await capture.pressKeyInBody({ key: "ArrowDown", shiftKey: true });
    await capture.pressKeyInBody({ key: "ArrowRight", shiftKey: true });
    await capture.pressKeyInBody({ key: "Backspace" });

    // `clearCells` is chained in front of `backspace` in the keymap precisely so this
    // reaches a rectangle at all: `tableCell` is `isolating`, so a plain text selection
    // spanning cells cannot be deleted. The last row is the control.
    expect(cells()).toEqual(["", "", "", "", "Piet", "planning"]);
  });
});

describe("the table toolbar in the capture window", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
    await withTable(capture);
  });

  afterEach(() => {
    capture.unmount();
  });

  function rows(): number {
    return capture.container.querySelectorAll(".ProseMirror table tr").length;
  }

  function columns(): number {
    return capture.container.querySelectorAll(".ProseMirror table tr:first-child > *").length;
  }

  it("appears over the table the caret is in, with every tool on it", async () => {
    const bar = capture.container.querySelector(".table-toolbar");
    expect(bar).not.toBeNull();

    // Short *visible* text and no glyph beside it, which is what keeps these reachable
    // from `--click-button` — the reason B42's commands were reported missing when they
    // lived only in a right-click menu.
    expect([...bar!.querySelectorAll(".table-tool")].map((node) => node.textContent)).toEqual([
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

  it("adds a row above the caret's own row", async () => {
    expect(rows()).toBe(3);

    await capture.clickButton("Row ↑");

    expect(rows()).toBe(4);
  });

  it("adds a column, and the header row grows with it", async () => {
    expect(columns()).toBe(2);

    await capture.clickButton("Col →");

    expect(columns()).toBe(3);
  });

  it("deletes the row the caret is in", async () => {
    await capture.clickButton("Del row");

    expect(rows()).toBe(2);
    expect(capture.container.querySelector(".ProseMirror table")!.textContent).toBe(
      "JanoffertePietplanning",
    );
  });

  it("aligns a column from a rectangle rather than only from a caret", async () => {
    await capture.pressKeyInBody({ key: "ArrowDown", shiftKey: true });
    await capture.clickButton("Right");

    // The alignment is a column property in this dialect — it lives as an array on the
    // *table* and is drawn onto the cells by decoration, so every row carries it including
    // the ones outside the selection, and `data-align` rather than a style is what the
    // serializer reads back.
    const first = [...capture.container.querySelectorAll(".ProseMirror table tr")].map(
      (row) => row.firstElementChild as HTMLElement,
    );
    expect(first.map((cell) => cell.getAttribute("data-align"))).toEqual([
      "right",
      "right",
      "right",
    ]);
    expect(
      capture.container.querySelector(".ProseMirror table")!.getAttribute("data-align"),
    ).toBe("right,");
  });

  it("is not drawn for a note whose caret is not in a table", async () => {
    // The same note with a paragraph in front of the table, so the caret opens outside it.
    // The reachable half of "it follows the caret": walking back out again needs an arrow
    // key to actually move, which is the one thing jsdom will not do (see the top of this
    // file), so that direction belongs to `scripts/drive-capture.ts`.
    await capture.fireLoad(
      openedNote({ doc: docFromMarkdown(`Afgesproken:\n\n${TABLE}`).toJSON() }),
    );

    expect(capture.container.querySelector(".ProseMirror table")).not.toBeNull();
    expect(capture.container.querySelector(".table-toolbar")).toBeNull();
  });
});

describe("inserting a table in the capture window", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
    await capture.fireShow();
    await capture.focusBody();
  });

  afterEach(() => {
    capture.unmount();
  });

  it("opens the grid on Mod+Alt+T, reading 1 x 1 to start (14a)", async () => {
    await capture.pressKeyInBody({ key: "t", ctrlKey: true, altKey: true });

    expect(capture.container.querySelector(".table-grid")).not.toBeNull();
    expect(capture.container.querySelector(".table-grid-readout")!.textContent).toBe(
      "1 × 1 table",
    );
  });

  it("is fully drivable from the keyboard, which is what the chord started (14b)", async () => {
    await capture.pressKeyInBody({ key: "t", ctrlKey: true, altKey: true });

    await capture.pressKeyOn(".table-grid", { key: "ArrowDown" });
    await capture.pressKeyOn(".table-grid", { key: "ArrowRight" });
    // The readout follows the arrows exactly as it follows the pointer — a shortcut that
    // opens a grid you then have to reach for the mouse to finish is a shortcut that does
    // not finish what it starts.
    expect(capture.container.querySelector(".table-grid-readout")!.textContent).toBe(
      "2 × 2 table",
    );

    await capture.pressKeyOn(".table-grid", { key: "Enter" });

    expect(capture.container.querySelector(".table-grid")).toBeNull();
    const table = capture.container.querySelector(".ProseMirror table")!;
    expect(table.querySelectorAll("tr")).toHaveLength(2);
    expect(table.querySelectorAll("tr:first-child > *")).toHaveLength(2);
  });

  it("closes on Escape without inserting anything", async () => {
    await capture.pressKeyInBody({ key: "t", ctrlKey: true, altKey: true });
    await capture.pressKeyOn(".table-grid", { key: "Escape" });

    expect(capture.container.querySelector(".table-grid")).toBeNull();
    expect(capture.container.querySelector(".ProseMirror table")).toBeNull();
  });
});

describe("walking a table with Tab in the capture window", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
    await withTable(capture);
  });

  afterEach(() => {
    capture.unmount();
  });

  it("selects the next cell's contents so it can be overtyped (14d)", async () => {
    await capture.pressKeyInBody({ key: "Tab" });
    // Selected, not just landed in: Backspace with a text selection takes the words out,
    // and this is how that shows from the DOM without reaching into ProseMirror's state.
    // (`clearCells` declines here — a text selection inside one cell is not a rectangle —
    // so it is the ordinary Backspace that runs.)
    await capture.pressKeyInBody({ key: "Backspace" });

    expect(
      [...capture.container.querySelectorAll(".ProseMirror td, .ProseMirror th")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Wie", "", "Jan", "offerte", "Piet", "planning"]);
  });

  it("adds a row when Tab leaves the very last cell (14e)", async () => {
    // Six cells in this table, so the sixth Tab is the one that runs out of table.
    for (let press = 0; press < 5; press += 1) {
      // eslint-disable-next-line no-await-in-loop
      await capture.pressKeyInBody({ key: "Tab" });
    }
    expect(capture.container.querySelectorAll(".ProseMirror table tr")).toHaveLength(3);

    await capture.pressKeyInBody({ key: "Tab" });

    expect(capture.container.querySelectorAll(".ProseMirror table tr")).toHaveLength(4);
    // Empty, and the note keeps everything that was already in it.
    expect(capture.container.querySelector(".ProseMirror table")!.textContent).toBe(
      "WieWatJanoffertePietplanning",
    );
  });
});
