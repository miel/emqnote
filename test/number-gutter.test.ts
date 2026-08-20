import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { widestNumberDigits } from "../src/renderer/editor/number-gutter.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * How wide the numbered gutter has to be, and where that is decided.
 *
 * The reported bug is a marker cut off at the window edge: an `ol` marker box is
 * right-aligned against the content edge, so `1000.` grows leftwards out of the list's
 * 1.6em gutter, through the editor's 18px of padding, and off the page. Measured at four
 * times size, a marker's ink reaches one `ch` per digit plus two to the left of the text
 * column — 1.90em at one digit, 3.80em at four.
 *
 * The split is the point: this file answers *how many digits*, and `styles.css` turns that
 * into a length. A number of pixels computed here would be a staler copy of two things the
 * stylesheet already knows — the width of a digit in the font actually in use, and the
 * 1.6em floor.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("the widest number a note draws", () => {
  const digits = (markdown: string): number => widestNumberDigits(docFromMarkdown(markdown));

  it("is one for a note with no numbered list at all", () => {
    // The default the stylesheet falls back to, so an unset property and a plain note
    // cannot disagree.
    expect(digits("Gewone tekst.\n\n- een bullet\n")).toBe(1);
  });

  it("counts the last item, not the first", () => {
    expect(digits("1. een\n2. twee\n")).toBe(1);
    expect(digits(`${Array.from({ length: 12 }, (_, i) => `${i + 1}. regel`).join("\n")}\n`)).toBe(
      2,
    );
  });

  it("reads a list that does not start at one", () => {
    // `start` is a legal thing for a note to carry — `998.` as a first line — so counting
    // the items would answer 3 for a list that draws four digits.
    expect(digits("998. een\n999. twee\n1000. drie\n")).toBe(4);
  });

  it("takes the widest of several lists, the gutter being per note", () => {
    expect(digits("1. een\n\ntussen\n\n1000. veel\n")).toBe(4);
  });

  it("sees a numbered list nested inside a bulleted one", () => {
    // The blank line is CommonMark's, not this project's: a list numbered anything but
    // `1.` cannot interrupt a paragraph, so without it `100. genest` is more of the
    // bullet's own text.
    expect(digits("- een\n\n  100. genest\n")).toBe(3);
  });
});

describe("styles.css: the gutter is computed from it", () => {
  it("grows the ordered list's padding and leaves the bulleted one alone", () => {
    // The last `.editor-content ol` block, not the first: the shared `ul, ol` rule above
    // ends with the same selector text and would otherwise be the one found.
    const rule = css.match(/\.editor-content ol \{[^}]*padding-left: max\([^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/var\(--number-digits, 1\)/);
    expect(rule).toMatch(/1ch/);

    // The floor: a note with short numbers must draw exactly as it always has.
    expect(rule).toMatch(/max\(\s*1\.6em/);

    // And the padding the marker is allowed to lean into, which is what keeps one- and
    // two-digit lists from moving at all.
    expect(rule).toMatch(/var\(--editor-pad-x\)/);
    expect(css).toMatch(/--editor-pad-x:\s*18px;/);
  });
});
