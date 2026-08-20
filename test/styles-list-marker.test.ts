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
 * Only one of them is a glyph the browser places: the bullet is a native `::marker` and is
 * the reference, while B72's star and the task checkbox are drawn into the slot by hand.
 * What is pinned here is the *construction*, because that is the part a later edit can
 * quietly undo — the numbers themselves were measured in a real Chromium at four times
 * size and a text check of a stylesheet cannot re-measure them. jsdom has no layout and no
 * cascade, which is why this file reads the rule rather than a computed style.
 *
 * The measurement, at the editor's own 16px, x from the text column and y from the item's
 * baseline: bullet ink starts at −23.10 with its centroid at −12.10; star and checkbox are
 * now within 0.15px of both, at depths one, two and three, and — the report this construction
 * exists for — unchanged when a picture is pasted into the line, where they used to stand
 * 232px above it.
 */
describe("styles.css: bullet, star and checkbox on one line", () => {
  it("hangs the hand-drawn markers off a zero-sized box on the baseline", () => {
    // The whole of the pasted-picture fix. The bullet is placed against the baseline of
    // the item's first line box; a marker placed against the *item* agrees with it only
    // while the line is one line tall, and a picture in the line is what tells them
    // apart. An empty inline-block takes its baseline from its bottom margin edge, so at
    // `height: 0` it sits exactly on the line's baseline and the markers hang off that.
    const rule = css.match(/\.editor-content \.marker-anchor \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/display:\s*inline-block;/);
    expect(rule).toMatch(/position:\s*relative;/);
    expect(rule).toMatch(/vertical-align:\s*baseline;/);
    expect(rule).toMatch(/height:\s*0;/);
    // Or the anchor's own line box sets a floor under the line it joined.
    expect(rule).toMatch(/line-height:\s*0;/);
  });

  it("draws the star into a positioned box, not as a ::marker glyph", () => {
    // `::marker` takes font properties and nothing else — no `vertical-align` — so a
    // colour emoji left in one cannot be moved onto the bullet's line at all. Shrinking
    // it with `font-size` measured *lower* and further right, the em space in
    // `--marker-gap` shrinking with the glyph.
    const rule = css.match(/\.editor-content \.star-mark \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/position:\s*absolute;/);
    expect(rule).toMatch(/align-items:\s*center;/);
    expect(rule).toMatch(/justify-content:\s*center;/);

    // Scaled, never sized: `font-size` here would make `left`, `width` and `height`
    // resolve against the new size, moving the box along with the glyph.
    expect(rule).toMatch(/transform:\s*scale\(/);
    expect(rule).not.toMatch(/font-size:/);
  });

  it("places both hand-drawn markers from the baseline, never from the item's top", () => {
    // `bottom`, not `top`: against the anchor those are two different origins, and only
    // one of them is the one the bullet uses. A `top` here is the bug coming back.
    for (const selector of ["\\.task-check", "\\.star-mark"]) {
      const rule = css.match(new RegExp(`\\.editor-content ${selector} \\{[^}]*\\}`))?.[0];
      expect(rule).toMatch(/bottom:\s*-?[0-9.]+em;/);
      expect(rule).not.toMatch(/^\s*top:/m);
    }
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

  it("gives the checkbox the editor's font, so its ems mean what they say", () => {
    // A `<button>` does not inherit its font, so every em in this rule resolved against
    // the UA's 13.333px: `--marker-slot` came out 20px here and 24px everywhere else,
    // which is the single thing that variable exists to prevent. It put the box's ink
    // 3.4px left of the bullet's while its centre stayed on the bullet's — which is how a
    // measurement that read centroids called it aligned and a reader did not.
    const rule = css.match(/\.editor-content \.task-check \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/font:\s*inherit;/);
    expect(rule).toMatch(/left:\s*calc\(-1 \* var\(--marker-slot\) - [0-9.]+em\);/);
    expect(rule).toMatch(/width:\s*var\(--marker-slot\);/);
  });
});
