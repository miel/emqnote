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
