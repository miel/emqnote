import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The marker follows its own line's formatting, and where the rule is written matters.
 *
 * Same shape as `styles-quote.test.ts`, and the same limitation behind it: jsdom has no
 * cascade, so a text check of the stylesheet is what there is. Two things are pinned.
 *
 * The properties must sit on `::marker`, never on the `li` — `font-weight` on the item is
 * inherited by everything inside it, so a plain sub-item nested in a bold one would draw a
 * bold bullet of its own. That is the same family of mistake as B48's `display: none` and
 * the `.overlay` dimming: correct-looking CSS, defeated by the cascade, invisible to every
 * test that does not read the rule itself.
 *
 * And a task item has no marker at all (`content: none`), so the checkbox needs its own
 * pair of rules or the feature is simply missing on exactly the lists it was reported for.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("styles.css: list markers follow the line", () => {
  it("puts the weight on the marker, not on the item", () => {
    const rule = css.match(/\.editor-content li\.li-strong::marker \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/font-weight:\s*700;/);

    expect(css).not.toMatch(/\.editor-content li\.li-strong \{/);
  });

  it("puts the slant on the marker, not on the item", () => {
    const rule = css.match(/\.editor-content li\.li-em::marker \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/font-style:\s*italic;/);

    expect(css).not.toMatch(/\.editor-content li\.li-em \{/);
  });

  it("draws a heavier and a slanted checkbox, since a task item has no marker", () => {
    expect(css).toMatch(/\.editor-content li\.li-strong > \.task-check svg \* \{[^}]*stroke-width:/);
    expect(css).toMatch(/\.editor-content li\.li-em > \.task-check svg \{[^}]*transform:\s*skew/);
  });
});
