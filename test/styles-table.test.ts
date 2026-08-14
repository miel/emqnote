import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A regression guard over the table rules in `styles.css`, in the style of
 * `styles-overlay.test.ts` — jsdom has no cascade worth asking, so a plain text check over
 * the source is what there is.
 *
 * What it pins is a specificity fight that has already been lost once in this codebase
 * (B48's `display: none` on a duplicate chip): the first row of a table carries a
 * background from `.editor-content table tr:first-child td`, which is one class *and* one
 * pseudo-class deep. B49's selected-cell fill has to out-rank that, or selecting a column
 * — which always includes the header row — would leave that row looking unselected while
 * every unit test passed.
 */
const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

/** A crude but sufficient (classes+pseudo-classes, elements) count for these selectors. */
function specificity(selector: string): { b: number; c: number } {
  return {
    b: (selector.match(/\.[\w-]+|:[\w-]+(?!\()/g) ?? []).length,
    c: (selector.match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length,
  };
}

function selectorFor(fragment: string): string {
  const match = css.match(new RegExp(`([^\\n{}]*${fragment}[^\\n{}]*)\\s*\\{`));
  expect(match, `no rule found containing ${fragment}`).not.toBeNull();
  return match![1]!.trim();
}

describe("the stylesheet: a selected cell out-ranks the header row", () => {
  it("draws a selected cell at all", () => {
    expect(css).toContain("table-cell-selected");
  });

  it("beats the header-row background on specificity", () => {
    const selected = specificity(selectorFor("table-cell-selected"));
    const header = specificity(selectorFor("tr:first-child td"));

    expect(
      selected.b > header.b || (selected.b === header.b && selected.c >= header.c),
      `${JSON.stringify(selected)} must out-rank ${JSON.stringify(header)}`,
    ).toBe(true);
  });

  it("comes after the header rule, so an equal specificity still wins", () => {
    expect(css.indexOf("table-cell-selected")).toBeGreaterThan(css.indexOf("tr:first-child td"));
  });
});
