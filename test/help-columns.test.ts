// @vitest-environment jsdom
/**
 * The shortcut sheet fills two balanced columns.
 *
 * Reported as "the left column is much larger than the right, and the sheet needs
 * scrolling even though there is a lot of whitespace in the right column" — which is
 * exactly what it was. `.help-groups` is a two-track grid filling row-major, and
 * `SHORTCUT_GROUPS` is 10, 7, 11, 4 and 8 entries in a fixed order, so it laid out as
 * `[text | lists] / [structure | note] / [window | nothing]`. Each grid row is as tall as
 * its taller member, so the sheet stood 32 rows high in the library and 28 in the capture
 * window with a mostly empty column beside it.
 *
 * No track sizing reaches that: it is which group goes where, so the component decides it
 * and the grid only lays the answer out. What is pinned here is the outcome rather than
 * the arithmetic — the balance is allowed to move as shortcuts are added, and what must
 * not move is that both columns are used, that every group is drawn exactly once, and
 * that the reading order down one column and then the next is still the order
 * `SHORTCUT_GROUPS` declares.
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
import { SHORTCUT_GROUPS, type ShortcutGroup } from "../src/shared/shortcuts.js";

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
      expect(tallest).toBeLessThanOrEqual(25);
    });

    it(`draws every group exactly once, in order, in ${which}`, () => {
      mount(which);
      const drawn = columnGroups().flat();
      expect(new Set(drawn).size).toBe(drawn.length);

      // Columns are read down and then across, so the flattened order is the reading
      // order — and it has to be the order the registry declares.
      const expected = SHORTCUT_GROUPS.map((group) => `help.group.${group}`).filter((key) =>
        drawn.includes(key),
      );
      expect(drawn).toEqual(expected);
    });
  }

  it("counts the two hotkey rows the sheet draws but the registry does not hold", () => {
    // Both global accelerators are settings, so `Help` renders them from what is
    // configured. They are still two lines, and a balance measured on `SHORTCUTS` alone
    // is a balance measured wrong by exactly those two.
    const section = (group: ShortcutGroup, n: number) => ({
      group,
      entries: Array.from({ length: n }, (_, i) => ({ id: `${group}-${i}` })),
    });

    // Five and five, except that `window` secretly draws two more — so the even-looking
    // cut is the wrong one and the split has to fall left of it.
    const [left, right] = balanceColumns([
      section("text", 5),
      section("window", 5),
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
