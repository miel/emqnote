import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A header field's text is cut off at its own edge, not painted past it.
 *
 * The same shape as `styles-quote.test.ts` and `styles-overlay.test.ts`, and for the same
 * reason: nothing under `test/` puts the stylesheet through a layout engine — jsdom has no
 * cascade and paints nothing — so a plain text check that the rule is still there is what
 * there is. Every bug in this family (B48's `display: none`, B36's trailing slash, the
 * overlays that dimmed while their comment said they did not) passed every unit test.
 *
 * What it pins: `nowrap` on its own stops the text wrapping and does nothing whatever
 * about the text leaving the box. The When cell shrinks correctly at a narrow window —
 * `flex: 1; min-width: 0` inside the grid's `minmax(0, 1fr)` track — so the date simply
 * painted out of its field and across the Tags field beside it. It needs all three
 * declarations together, which is exactly the sort of trio a later tidy-up drops one of.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const library = readFileSync(
  new URL("../src/renderer/library/library.css", import.meta.url),
  "utf8",
);

function rule(sheet: string, selector: string): string {
  const escaped = selector.replaceAll(".", String.raw`\.`);
  const match = sheet.match(new RegExp(`${escaped} \\{[^}]*\\}`));
  expect(match, `no rule found for ${selector}`).not.toBeNull();
  return match![0];
}

describe("styles.css: the date does not overflow its field", () => {
  const created = rule(css, ".created");

  it("keeps the date on one line", () => {
    expect(created).toMatch(/white-space:\s*nowrap;/);
  });

  it("clips it at the edge of the cell rather than painting past it", () => {
    expect(created).toMatch(/overflow:\s*hidden;/);
  });

  it("says so with an ellipsis, so a cut-off date reads as cut off", () => {
    expect(created).toMatch(/text-overflow:\s*ellipsis;/);
  });
});

/**
 * The Tags field cannot be squeezed to nothing by the chips beside it.
 *
 * Same reasoning as above, one field over: `.header-cell input` is `flex: 1; min-width: 0`
 * — a zero basis with the browser's own input minimum switched off — and every `.tag-chip`
 * is `0 0 auto` at content width, so a note carrying enough body tags left a Tags box with
 * no width at all. `MAX_TAG_CHIPS` in `HeaderBlock.tsx` bounds the number of chips and is
 * covered by `header-tags.test.ts`; this is the other half, and it is the half no DOM test
 * can see, jsdom having no layout.
 */
describe("styles.css: the Tags field keeps a minimum width", () => {
  const tags = rule(css, ".header-cell.header-tags .tags");

  it("gives it a floor of ten characters", () => {
    expect(tags).toMatch(/min-width:\s*10ch;/);
  });

  it("gives it a real basis, not the zero one it inherits", () => {
    // A flex item with a zero basis never triggers a wrap by itself, so the field would
    // go on sharing the line with the chips at whatever was left of it.
    expect(tags).toMatch(/flex:\s*1 1 10ch;/);
  });
});

describe("styles.css: a completion panel has something to position against", () => {
  // The Who field's list is absolutely positioned inside its cell (B81) exactly as the
  // Where field's is (B73). Without `position: relative` on the cell it would climb to
  // the nearest positioned ancestor and land somewhere else entirely.
  it("makes both cells the containing block", () => {
    expect(rule(css, ".header-cell.header-where,\n.header-cell.header-who")).toMatch(
      /position:\s*relative;/,
    );
  });
});

describe("library.css: the reader path is the same recipe", () => {
  // Named here because `.created` was written from it: if this one ever loses a
  // declaration, the comment beside `.created` is pointing at something that no longer
  // holds, and the two should move together or not at all.
  const path = rule(library, ".reader-path");

  it("carries all three declarations", () => {
    expect(path).toMatch(/white-space:\s*nowrap;/);
    expect(path).toMatch(/overflow:\s*hidden;/);
    expect(path).toMatch(/text-overflow:\s*ellipsis;/);
  });
});
