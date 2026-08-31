// @vitest-environment jsdom
/**
 * The shortcut sheet fills two balanced columns.
 *
 * Reported as "the left column is much larger than the right, and the sheet needs
 * scrolling even though there is a lot of whitespace in the right column" — which is
 * exactly what it was. `.help-groups` is a two-track grid filling row-major, and the five
 * groups are wildly uneven in a fixed order, so it laid out as `[text | lists] /
 * [structure | note] / [window | nothing]`. Each grid row is as tall as its taller member,
 * so the sheet stood 32 rows high in the library and 28 in the capture window with a
 * mostly empty column beside it.
 *
 * No track sizing reaches that: it is which group goes where, so the component decides it
 * and the grid only lays the answer out. What is pinned here is the outcome rather than
 * the arithmetic — the balance is allowed to move as shortcuts are added, and what must
 * not move is that both columns are used, that every group is drawn exactly once, that no
 * arrangement of them would have been shorter, and that each column reads in the order
 * `SHORTCUT_GROUPS` declares.
 *
 * **The sheet as a whole no longer reads in that order**, and that is deliberate: the cut
 * used to be contiguous, and with the groups this size the best contiguous cut left ten
 * rows of white space down one side. See `balanceColumns`.
 *
 * Mounted rather than read as text (`styles-*.test.ts`'s idiom) because the row counts
 * come from `SHORTCUTS` filtered by window, plus the two hotkey rows this sheet renders
 * that no registry entry accounts for. jsdom has no layout, so this counts rows, which is
 * what the balance is over anyway.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balanceColumns, Help } from "../src/renderer/Help.js";
import { SHORTCUT_GROUPS } from "../src/shared/shortcuts.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(which: "capture" | "library"): void {
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(Help, {
        window: which,
        isMac: false,
        hotkey: "CommandOrControl+Shift+Y",
        libraryHotkey: "CommandOrControl+Shift+B",
        t: (key: string) => key,
        onClose: vi.fn(),
      }),
    );
  });
}

/** Rows drawn in each column, which is what a reader sees as its height. */
function columnRows(): number[] {
  return [...container.querySelectorAll(".help-column")].map(
    (column) => column.querySelectorAll(".help-row").length + column.querySelectorAll("h3").length,
  );
}

function columnGroups(): string[][] {
  return [...container.querySelectorAll(".help-column")].map((column) =>
    [...column.querySelectorAll("h3")].map((heading) => heading.textContent ?? ""),
  );
}

describe("the shortcut sheet's two columns", () => {
  for (const which of ["capture", "library"] as const) {
    it(`fills both columns in the ${which} window`, () => {
      mount(which);
      const rows = columnRows();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toBeGreaterThan(0);
      expect(rows[1]).toBeGreaterThan(0);
    });

    it(`makes the taller column no worse than the old row-major flow in ${which}`, () => {
      mount(which);
      const rows = columnRows();
      const tallest = Math.max(...rows);
      // The two halves must be within a group of each other. Row-major flow gave 28 and
      // 32; anything near those numbers means the split is not doing its job.
      expect(tallest).toBeLessThan(rows[0]! + rows[1]! - tallest + 12);
      // A ceiling on the sheet as a whole rather than on the split: 25 until the library
      // gained the `goBack` row. It is meant to move when a shortcut is added and to be
      // *looked at* when it does — a sheet that has to be scrolled has stopped being a
      // sheet, and this number is the only thing that would say so.
      expect(tallest).toBeLessThanOrEqual(26);
    });

    it(`draws every group exactly once in ${which}`, () => {
      mount(which);
      const drawn = columnGroups().flat();
      expect(new Set(drawn).size).toBe(drawn.length);
      expect(new Set(drawn)).toEqual(
        new Set(
          SHORTCUT_GROUPS.map((group) => `help.group.${group}`).filter((key) =>
            drawn.includes(key),
          ),
        ),
      );
    });

    it(`keeps each column in registry order in ${which}`, () => {
      // What survived the move to a non-contiguous split, and the difference between
      // dealing the groups out and shuffling them: a column never reads `window` above
      // `text`. What is *not* asserted any more is that the whole sheet reads in registry
      // order across both columns — that is the constraint that was costing ten rows of
      // white space, and giving it up is the point.
      mount(which);
      const order = SHORTCUT_GROUPS.map((group) => `help.group.${group}`);
      for (const column of columnGroups()) {
        const positions = column.map((key) => order.indexOf(key));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    });

    it(`leaves no shorter arrangement on the table in ${which}`, () => {
      // The whole claim of `balanceColumns`, checked against brute force rather than
      // against a number: no way of dealing these groups into two non-empty columns has a
      // shorter tall column than the one it picked. A greedy or contiguous rule passes
      // the ceiling above on a good day and fails this on any day.
      mount(which);
      const rows = columnRows();
      const groups = [...container.querySelectorAll<HTMLElement>(".help-group")].map(
        (group) =>
          group.querySelectorAll(".help-row").length + group.querySelectorAll("h3").length,
      );

      const total = groups.reduce((sum, weight) => sum + weight, 0);
      let shortest = Number.POSITIVE_INFINITY;
      for (let code = 1; code < 2 ** groups.length - 1; code += 1) {
        let right = 0;
        for (let i = 0; i < groups.length; i += 1) {
          if (((code >> i) & 1) === 1) right += groups[i]!;
        }
        shortest = Math.min(shortest, Math.max(right, total - right));
      }

      expect(Math.max(...rows)).toBe(shortest);
    });
  }

  it("draws the two global hotkeys, which are settings rather than registry entries", () => {
    // They used to be markup of their own with a hardcoded `+2` in the balance to account
    // for them. They are ordinary entries built from what is configured now, which is what
    // lets the search match them — and it means the balance counts them without being
    // told.
    mount("library");
    const rows = [...container.querySelectorAll(".help-row")].map((row) => row.textContent);
    expect(rows).toContain("shortcut.newNoteCtrl+Shift+Y");
    expect(rows).toContain("shortcut.openLibraryGlobalCtrl+Shift+B");
  });

  it("puts a lone section in one column rather than splitting it", () => {
    // What a search can leave behind. `balanceColumns` answers "which of these go left",
    // and with one section there is nothing to answer; an empty second column would be a
    // grid track of white space beside it.
    const [left, right] = balanceColumns([
      { group: "text", entries: [{ id: "strong" }] },
      { group: "window", entries: [{ id: "help" }] },
    ] as unknown as Parameters<typeof balanceColumns>[0]);

    expect(left.map((s) => s.group)).toEqual(["text"]);
    expect(right.map((s) => s.group)).toEqual(["window"]);
  });

  it("never cuts on a group with nothing in it", () => {
    // An empty group renders nothing, so a cut placed on one leaves a column blank. They
    // are dropped before the walk rather than weighed at zero.
    mount("capture");
    for (const column of container.querySelectorAll(".help-column")) {
      expect(column.querySelectorAll(".help-group").length).toBeGreaterThan(0);
    }
  });
});
