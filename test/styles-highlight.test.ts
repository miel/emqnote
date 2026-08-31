import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A `==highlight==` under a selection is drawn differently from the selection around it.
 *
 * The same shape as `styles-quote.test.ts` and for the same reason: nothing under `test/`
 * puts the stylesheet through a layout engine, so a text check that the rule is still
 * there is what there is — and this one is exactly the kind of rule that reads as
 * redundant to anyone who has not watched the bug. Applying a highlight to selected text
 * changed nothing on screen, because the selection paints over the mark.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("styles.css: a highlight under the selection", () => {
  it("paints the selection over a mark in its own colour", () => {
    const rule = css.match(/\.editor-content mark::selection \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/background:/);
  });

  it("mixes two theme tokens rather than naming a colour", () => {
    const rule = css.match(/\.editor-content mark::selection \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("var(--highlight)");
    expect(rule).toContain("var(--accent)");
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
