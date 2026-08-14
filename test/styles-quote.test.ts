import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A quote is drawn in italics, and an emphasised word inside one is not.
 *
 * The same shape as `styles-attachments.test.ts` and for the same reason: nothing under
 * `test/` loads the stylesheet into a layout engine (jsdom has no cascade and paints
 * nothing), so a plain text check that the rule is still there is what there is.
 *
 * The second half is the one worth guarding. The browser's own stylesheet italicises
 * `<em>`, so once the quote leans, an `*emphasised*` word inside it stops standing out
 * unless it leans back — and that is a rule someone tidying up would take for redundant.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("styles.css: quotes", () => {
  it("draws quoted text in italics", () => {
    const rule = css.match(/\.editor-content blockquote \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/font-style:\s*italic;/);
  });

  it("puts an emphasised word inside a quote back upright", () => {
    const rule = css.match(/\.editor-content blockquote em \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/font-style:\s*normal;/);
  });
});
