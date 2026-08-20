import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * B72's star stands where the bullet stood, and it has to win the cascade to do it.
 *
 * `styles-list-marker.test.ts`'s shape and its limitation: jsdom has no cascade, so reading
 * the rule is what there is. What is pinned here is specificity, because that is what has
 * shipped wrong twice — B48's `display: none` and the `.overlay` dimming were both correct
 * rules that merely *tied* and lost on source order.
 *
 * **What the star rule has to win has changed twice, and the reason it can still lose has
 * not.** The star used to be `content: "\2b50"` on the item's own `::marker`; then a
 * positioned `::before`, because a colour emoji in a `::marker` cannot be moved onto the
 * bullet's line; and now a widget (`star-widget.ts`), because a `::before` on an
 * `li` whose content is `paragraph block*` gets an anonymous block of its own and never
 * joins the line box the bullet is placed against — which is what left it at the top of a
 * line holding a pasted picture. See `styles-list-marker.test.ts` for both measurements.
 *
 * Through all three the `::marker` rule has had to out-rank exactly the same three rules:
 * the base `•` and the two nested-depth rules (`◦` and `▪`), which come later in the file.
 * If it merely ties, a starred item at depth two or three draws a bullet beside its star.
 * It wins on class count — `.editor-content` plus the attribute selector, against
 * `.editor-content` plus elements — which holds whatever the source order.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const widget = readFileSync(
  new URL("../src/renderer/editor/star-widget.ts", import.meta.url),
  "utf8",
);

const MARKER_RULE = /\.editor-content ul > li\[data-starred="true"\]::marker \{[^}]*\}/;

describe("styles.css: the star replaces the bullet", () => {
  it("draws the star, with the marker it stands in for switched off", () => {
    const marker = css.match(MARKER_RULE)?.[0];
    expect(marker).toBeDefined();
    expect(marker).toMatch(/content:\s*none;/);

    // The glyph moved out of the stylesheet with the construction; the two halves are
    // still a pair, and a rule with nothing to position is as broken as a star with no
    // rule. `star-widget.ts` writes it and `.star-mark` places it.
    expect(widget).toContain("⭐");
    expect(widget).toContain('className = "star-mark"');
    expect(css).toMatch(/\.editor-content \.star-mark \{[^}]*position:\s*absolute;/);
  });

  it("out-ranks the depth rules it has to beat", () => {
    // Two classes' worth against one: the attribute selector is what buys the margin, and
    // dropping `.editor-content` or writing it as a class on the `li` would give it away.
    const classes = (selector: string): number =>
      (selector.match(/\.[a-z-]+|\[[^\]]+\]/g) ?? []).length;

    const star = css.match(MARKER_RULE)![0].split("{")[0]!;
    const deepest = css
      .match(/\.editor-content :is\(ul, ol\) :is\(ul, ol\) ul > li::marker \{[^}]*\}/)![0]
      .split("{")[0]!;

    expect(classes(star)).toBeGreaterThan(classes(deepest));
  });

  it("is keyed on the attribute the schema writes, not on a decoration class", () => {
    // The distinction `list-marker-style.ts` draws: a bold marker carries no meaning and is
    // a decoration, a star carries the whole point and is an attribute that reaches disk.
    expect(css).toMatch(/data-starred/);
    expect(css).not.toMatch(/li\.li-star/);
  });
});
