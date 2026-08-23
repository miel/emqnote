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

/**
 * The three bullet levels come out of one Unicode block, and every level's marker slot is
 * as wide as that level's glyph.
 *
 * The report was "levels one and two are smaller than the square at level three, on
 * macOS". Both halves of that turned out to be worth pinning, and neither is what the
 * report said.
 *
 * It was never only macOS. Measured in a real Chromium at four times size, `\2022` and
 * `\25E6` carry 0.293em of ink against `\25AA`'s 0.504em — the *small* square is 1.7 times
 * the bullet, in one face, because U+25AA is small next to U+25A0 rather than next to a
 * bullet. No font choice was going to make the old three agree.
 *
 * What macOS added is the second half: `\2022` is General Punctuation and SF carries it,
 * `\25E6` and `\25AA` are Geometric Shapes and SF does not — so a Mac drew level one from
 * the system face and levels two and three from whatever fell back. Keeping all three in
 * Geometric Shapes is what makes them fall back *together*, and it is why there is no
 * `font-family` in these rules to get wrong.
 *
 * The numbers below were read off a screenshot at four times size and cannot be
 * re-measured from here — what this pins is that they still form a set. A glyph changed
 * without its slot is the raggedness `--marker-slot` exists to prevent.
 */
describe("styles.css: the bullet levels are one family, and each has its own slot", () => {
  const markerRule = (selector: string): string => {
    const rule = css.match(new RegExp(`${selector} \\{[^}]*\\}`))?.[0];
    expect(rule, `no rule found for ${selector}`).toBeDefined();
    return rule!;
  };

  it("draws all three levels from Geometric Shapes, so they fall back together", () => {
    // The three glyphs, in one block. `\2022` here at any depth is the macOS split coming
    // back: it is the one character of the old set that a Mac's system face carries, so
    // it is the one that would be drawn by a different font from its neighbours.
    expect(markerRule("\\.editor-content ul > li::marker")).toContain('content: "\u25CF"');
    expect(markerRule("\\.editor-content :is\\(ul, ol\\) ul > li::marker")).toContain(
      'content: "\u25CB"',
    );
    expect(
      markerRule("\\.editor-content :is\\(ul, ol\\) :is\\(ul, ol\\) ul > li::marker"),
    ).toContain('content: "\u25AA"');

    for (const glyph of ["\u2022", "\u25E6"]) {
      expect(css).not.toContain(`content: "${glyph}"`);
    }
  });

  it("sizes the glyphs by choosing them, never with font-size on the marker", () => {
    // `--marker-gap` is an em space *in the marker's own font*, so `font-size` here scales
    // the gap with the glyph and the marker box grows with both — and rendered, it grew
    // the line boxes too: every list line taller, the spacing ragged. Two faults for one
    // fix, which is why the size came from the character instead.
    for (const selector of [
      "\\.editor-content ul > li::marker",
      "\\.editor-content :is\\(ul, ol\\) ul > li::marker",
      "\\.editor-content :is\\(ul, ol\\) :is\\(ul, ol\\) ul > li::marker",
    ]) {
      expect(markerRule(selector)).not.toMatch(/font-size:/);
    }
  });

  it("gives each depth the slot its own glyph measured", () => {
    // 1.88em for the circles and 1.66em for the square, against ink left edges of
    // −1.819em and −1.581em. The square's is a fix rather than a consequence: the single
    // 1.5em it replaces was tuned to the old bullet, so level three's checkbox had always
    // sat 2.5px left of its own marker.
    expect(markerRule("\\.editor-content ul > li")).toMatch(/--marker-slot:\s*1\.88em;/);
    expect(
      markerRule("\\.editor-content :is\\(ul, ol\\) :is\\(ul, ol\\) ul > li"),
    ).toMatch(/--marker-slot:\s*1\.66em;/);
  });

  it("resets the slot for a numbered list, because custom properties inherit", () => {
    // Without this line an `ol` nested inside a `ul` takes the circles' slot off the `li`
    // above it and places its numbers against a box it does not have.
    expect(markerRule("\\.editor-content ol > li")).toMatch(/--marker-slot:\s*1\.5em;/);
  });

  it("keeps the hand-drawn markers on the centre the new glyphs share", () => {
    // `\25CF` and `\25AA` both centre 0.766em above the item's first baseline where
    // `\2022` sat at 0.648em, so both constants moved down by 0.115em together. One
    // number each and no per-depth override — which only works because the three glyphs
    // now agree with each other, where the old bullet and square were 0.11em apart and a
    // single constant could match just one of them.
    expect(markerRule("\\.editor-content \\.task-check")).toMatch(/bottom:\s*-0\.4425em;/);
    expect(markerRule("\\.editor-content \\.star-mark")).toMatch(/bottom:\s*-0\.42em;/);
  });
});
