import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * B74's handles, and the three things about them the cascade or the layout can defeat.
 *
 * `styles-list-marker.test.ts`'s shape and its limitation: jsdom has no layout and no
 * cascade, so reading the rule is what there is. What is worth pinning here is not how the
 * handles look but the two structural facts they depend on — that the box they hang off is
 * a containing block at all, and that they are hidden until the picture is selected.
 * Neither is visible in a unit test and both are silent when wrong: an unpositioned box
 * puts four squares in the corner of the *paragraph*, and a missing hide rule puts eight
 * pixels of furniture on every picture in a note being read.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("styles.css: the image resize handles", () => {
  it("makes the picture's wrapper something a handle can be positioned against", () => {
    // `position: relative` on an `inline` box is not a dependable containing block — it
    // fragments across lines, and so does the rectangle its children are placed in. Both
    // declarations or neither.
    const rule = css.match(/\.editor-content \.wiki-embed-image-box \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/display:\s*inline-block;/);
    expect(rule).toMatch(/position:\s*relative;/);
  });

  it("states the baseline on the wrapper and not on the picture as well", () => {
    // Measured: an inline-block wrapping an inline replaced element sits on the same
    // baseline as the bare `<img>` did, as long as exactly one of the two carries
    // `text-bottom`. Both would offset it twice and drop every mid-sentence embed.
    const box = css.match(/\.editor-content \.wiki-embed-image-box \{[^}]*\}/)![0];
    const img = css.match(/\.editor-content \.wiki-embed-image \{[^}]*\}/)![0];
    expect(box).toMatch(/vertical-align:\s*text-bottom;/);
    expect(img).toMatch(/vertical-align:\s*bottom;/);
  });

  it("hides the handles until the picture is selected or being dragged", () => {
    const rule = css.match(/\.editor-content \.image-resize-handle \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/display:\s*none;/);

    // The drag half is not decoration: a handle that vanished under the hand because the
    // selection was lost mid-drag would read as the drag having been dropped.
    expect(css).toMatch(
      /\.wiki-embed-image-box\.ProseMirror-selectednode \.image-resize-handle,\s*\n\s*\.editor-content \.wiki-embed-image-box\.image-resizing \.image-resize-handle \{[^}]*display:\s*block;/,
    );
  });

  it("lets a picture with a stored width keep its proportions", () => {
    // `max-height: 480px` is right for a picture at its own size and wrong for one that
    // has been given a width — it would crop it to a shape neither the file nor the drag
    // asked for. `max-width: 100%` deliberately stays, so a stored width wider than the
    // column still draws inside it.
    const rule = css.match(
      /\.editor-content \.wiki-embed-image-box\[data-sized="true"\] \.wiki-embed-image \{[^}]*\}/,
    )?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/max-height:\s*none;/);
    expect(rule).toMatch(/height:\s*auto;/);
  });
});
