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

/**
 * The three things that can stand in the marker slot sit on one line and in one column.
 *
 * Only two of them are glyphs the browser places: the bullet is a native `::marker` and is
 * the reference, while B72's star and the task checkbox are drawn into the slot by hand.
 * What is pinned here is the *construction*, because that is the part a later edit can
 * quietly undo — the numbers themselves were measured in a real Chromium at 4× device
 * scale (bullet ink centroid y 10.25 / x 43.12; star and checkbox now within 0.4px of it
 * on both axes, against 16.75px of star ink sitting 5px out of column before) and a text
 * check of a stylesheet cannot re-measure them. jsdom has no layout and no cascade, which
 * is why this file reads the rule rather than a computed style.
 */
describe("styles.css: bullet, star and checkbox on one line", () => {
  it("draws the star into a positioned box, not as a ::marker glyph", () => {
    // `::marker` takes font properties and nothing else — no `vertical-align` — so a
    // colour emoji left in one cannot be moved onto the bullet's line at all. Shrinking
    // it with `font-size` measured *lower* and further right, the em space in
    // `--marker-gap` shrinking with the glyph.
    const before = css.match(
      /\.editor-content ul > li\[data-starred="true"\]::before \{[^}]*\}/,
    )?.[0];
    expect(before).toBeDefined();
    expect(before).toMatch(/content:\s*"\\2b50";/);
    expect(before).toMatch(/position:\s*absolute;/);
    expect(before).toMatch(/align-items:\s*center;/);
    expect(before).toMatch(/justify-content:\s*center;/);

    // Scaled, never sized: `font-size` here would make `left`, `width` and `height`
    // resolve against the new size, moving the box along with the glyph.
    expect(before).toMatch(/transform:\s*scale\(/);
    expect(before).not.toMatch(/font-size:/);
  });

  it("leaves the starred item no marker of its own to draw beside the star", () => {
    // `list-style: none` stops suppressing a marker the moment `::marker` has explicit
    // content, and the three depth rules give it some — so both halves are needed or a
    // starred item draws a bullet next to its star.
    expect(css).toMatch(
      /\.editor-content ul > li\[data-starred="true"\] \{[^}]*list-style:\s*none;/,
    );
    expect(css).toMatch(
      /\.editor-content ul > li\[data-starred="true"\]::marker \{[^}]*content:\s*none;/,
    );
  });

  it("offsets the checkbox onto the bullet's own line and column", () => {
    // Without these the box lands 6.6px right of the bullet and 1.05px above its line —
    // near enough to look like nothing is wrong, far enough to read as a ragged list.
    // The slot itself is untouched, so the button keeps its full click target.
    const rule = css.match(/\.editor-content \.task-check \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/left:\s*calc\(-1 \* var\(--marker-slot\) - [0-9.]+em\);/);
    expect(rule).toMatch(/top:\s*[0-9.]+em;/);
  });
});
