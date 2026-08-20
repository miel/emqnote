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
 * **What the star rule has to win has changed, and the reason it can still lose has not.**
 * The star used to be `content: "\2b50"` on the item's own `::marker`; it is a positioned
 * `::before` now, because a colour emoji in a `::marker` cannot be moved onto the bullet's
 * line — see `styles-list-marker.test.ts` for that measurement. So the `::marker` rule
 * says `content: none` instead, and it has to out-rank exactly the same three rules it
 * always did: the base `•` and the two nested-depth rules (`◦` and `▪`), which come later
 * in the file. If it merely ties, a starred item at depth two or three draws a bullet
 * beside its star. It wins on class count — `.editor-content` plus the attribute selector,
 * against `.editor-content` plus elements — which holds whatever the source order.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

const MARKER_RULE = /\.editor-content ul > li\[data-starred="true"\]::marker \{[^}]*\}/;
const STAR_RULE = /\.editor-content ul > li\[data-starred="true"\]::before \{[^}]*\}/;

describe("styles.css: the star replaces the bullet", () => {
  it("draws the star, with the marker it stands in for switched off", () => {
    const marker = css.match(MARKER_RULE)?.[0];
    expect(marker).toBeDefined();
    expect(marker).toMatch(/content:\s*none;/);

    const star = css.match(STAR_RULE)?.[0];
    expect(star).toBeDefined();
    // `\2b50` rather than a literal ⭐, so the file stays ASCII where it can.
    expect(star).toMatch(/content:\s*"\\2b50";/);
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
