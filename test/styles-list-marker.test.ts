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
      expect(rule).toMatch(/bottom:\s*var\(--(check|star)-bottom, -?[0-9.]+em\);/);
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

  it("carries the measured pull-back that put both marks in the bullet's column", () => {
    // Reported against a real screen after every number above had been read off a
    // rendering: the checkbox stood 1px right of the bullet's ink and the star 2px right
    // of it. Two different amounts on two marks that are placed by hand is what says this
    // is each mark's own ink extent — the SVG's box and the emoji strike's — rather than
    // one shared mistake in `--marker-slot`, which the bullet is measured against and
    // which must not move.
    //
    // So each is pulled back by its own amount, in `em` at the editor's own 16px: 1px is
    // 0.0625em on top of the checkbox's 0.018em, and 2px is 0.125em on top of the star's
    // 0.102em. Pixels would have been the other option and are the wrong unit here —
    // B88's `--editor-font-size` moves the whole note at once, and a marker corrected in
    // pixels comes apart from its own bullet at every size but the one it was read at.
    const check = css.match(/\.editor-content \.task-check \{[^}]*\}/)?.[0];
    expect(check).toMatch(/left:\s*calc\(-1 \* var\(--marker-slot\) - 0\.0805em\);/);

    const star = css.match(/\.editor-content \.star-mark \{[^}]*\}/)?.[0];
    expect(star).toMatch(/left:\s*calc\(-1 \* var\(--marker-slot\) - 0\.227em\);/);
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

/**
 * The three bullet levels, and the size of the first two, decided twice.
 *
 * They shipped as `\2022`, `\25E6` and `\25AA` and were reported as "levels one and two are
 * smaller than the square, on macOS". Measured in a real Chromium at four times size, the
 * first half of that was true and was never only macOS: `\2022` and `\25E6` carry 0.293em of
 * ink against `\25AA`'s 0.504em, in one face, because U+25AA is small next to U+25A0 rather
 * than next to a bullet. Levels one and two became `\25CF`/`\25CB` at 0.668em to match, and
 * in daily use that read as far too heavy — a filled circle two and a quarter times the ink
 * of the bullet it replaced, at the two depths every note actually uses.
 *
 * So the second report wins and the small glyphs come back, and what is pinned here is the
 * part of the first fix that was genuinely about the square: its own 1.66em slot, and its
 * own ink centre, now carried per depth instead of by the single constant that could only
 * ever match one of the two.
 *
 * The remaining cost is stated rather than discovered: `\2022` is General Punctuation where
 * `\25E6` and `\25AA` are Geometric Shapes, so on a Mac — whose SF carries the first and not
 * the other two — level one falls back to a different face than the levels under it. That is
 * a fallback difference at one depth, against a marker that was too large at two.
 *
 * The numbers below were read off a screenshot at four times size and cannot be re-measured
 * from here — what this pins is that they still form a set. A glyph changed without its slot
 * and its centre is the raggedness `--marker-slot` exists to prevent.
 */
describe("styles.css: each bullet level has its own slot and its own centre", () => {
  const markerRule = (selector: string): string => {
    const rule = css.match(new RegExp(`${selector} \\{[^}]*\\}`))?.[0];
    expect(rule, `no rule found for ${selector}`).toBeDefined();
    return rule!;
  };

  it("draws the small glyphs at the two depths notes actually use", () => {
    // `\25CF`/`\25CB` here is the too-heavy marker coming back: 0.668em of ink against the
    // 0.293em these carry, at levels one and two.
    expect(markerRule("\\.editor-content ul > li::marker")).toContain('content: "\u2022"');
    expect(markerRule("\\.editor-content :is\\(ul, ol\\) ul > li::marker")).toContain(
      'content: "\u25E6"',
    );
    expect(
      markerRule("\\.editor-content :is\\(ul, ol\\) :is\\(ul, ol\\) ul > li::marker"),
    ).toContain('content: "\u25AA"');

    for (const glyph of ["\u25CF", "\u25CB"]) {
      expect(css).not.toContain(`content: "${glyph}"`);
    }
  });

  it("sizes the glyphs by choosing them, never with font-size on the marker", () => {
    // `--marker-gap` is an em space *in the marker's own font*, so `font-size` here scales
    // the gap with the glyph and the marker box goes with both — rendered, the enlarged
    // marker grew every list line box too. Shrinking would not grow a line box, but it
    // would still move the glyph's ink centre by an amount nothing here has measured.
    for (const selector of [
      "\\.editor-content ul > li::marker",
      "\\.editor-content :is\\(ul, ol\\) ul > li::marker",
      "\\.editor-content :is\\(ul, ol\\) :is\\(ul, ol\\) ul > li::marker",
    ]) {
      expect(markerRule(selector)).not.toMatch(/font-size:/);
    }
  });

  it("gives each depth the slot its own glyph measured", () => {
    // 1.5em for the bullets and 1.66em for the square, against ink left edges of −1.444em
    // and −1.581em. The square's is a fix rather than a consequence, and it outlives the
    // glyph revert: while one 1.5em served all three, level three's checkbox had always
    // sat 2.5px left of its own marker.
    expect(markerRule("\\.editor-content ul > li")).toMatch(/--marker-slot:\s*1\.5em;/);
    expect(
      markerRule("\\.editor-content :is\\(ul, ol\\) :is\\(ul, ol\\) ul > li"),
    ).toMatch(/--marker-slot:\s*1\.66em;/);
  });

  it("resets the slot for a numbered list, because custom properties inherit", () => {
    // Without this line an `ol` nested inside the square's level takes that slot off the
    // `li` above it and places its digits against a box it does not have.
    expect(markerRule("\\.editor-content ol > li")).toMatch(/--marker-slot:\s*1\.5em;/);
  });

  it("gives each depth the ink centre its own glyph measured", () => {
    // `\2022`/`\25E6` centre 0.648em above the item's first baseline where `\25AA` centres
    // at 0.766em — 0.115em apart, which is why there are two pairs and not one constant.
    // Tuned to the bullet, a single number left level three's checkbox high; tuned to the
    // square, it does the same to every note at levels one and two.
    expect(markerRule("\\.editor-content ul > li")).toMatch(/--check-bottom:\s*-0\.3275em;/);
    expect(markerRule("\\.editor-content ul > li")).toMatch(/--star-bottom:\s*-0\.305em;/);
    const deep = markerRule("\\.editor-content :is\\(ul, ol\\) :is\\(ul, ol\\) ul > li");
    expect(deep).toMatch(/--check-bottom:\s*-0\.4425em;/);
    expect(deep).toMatch(/--star-bottom:\s*-0\.42em;/);
  });

  it("reads those centres through the variables, or the per-depth values do nothing", () => {
    // The half-finished version of this change: new variables declared, and both consumers
    // still carrying the constant they were tuned to.
    expect(markerRule("\\.editor-content \\.task-check")).toMatch(
      /bottom:\s*var\(--check-bottom, -0\.3275em\);/,
    );
    expect(markerRule("\\.editor-content \\.star-mark")).toMatch(
      /bottom:\s*var\(--star-bottom, -0\.305em\);/,
    );
  });
});
