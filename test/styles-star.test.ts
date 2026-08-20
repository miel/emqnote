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
 * The star rule has to out-rank three others that also set `content` on a `li::marker`: the
 * two nested-depth rules (`◦` and `▪`), which come later in the file, and the base `•`. It
 * does so on class count — `.editor-content` plus the attribute selector against
 * `.editor-content` plus elements — which holds whatever the order.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

const STAR_RULE = /\.editor-content ul > li\[data-starred="true"\]::marker \{[^}]*\}/;

describe("styles.css: the star replaces the bullet", () => {
  it("sets the marker's content to the star, with the shared gap", () => {
    const rule = css.match(STAR_RULE)?.[0];
    expect(rule).toBeDefined();
    // `\2b50` rather than a literal ⭐, so the file stays ASCII where it can, and
    // `var(--marker-gap)` rather than a space, since the gap is measured once (see the
    // comment above `--marker-slot`) and a second spelling would drift from it.
    expect(rule).toMatch(/content:\s*"\\2b50"\s*var\(--marker-gap\);/);
  });

  it("out-ranks the depth rules it has to beat", () => {
    // Two classes' worth against one: the attribute selector is what buys the margin, and
    // dropping `.editor-content` or writing it as a class on the `li` would give it away.
    const classes = (selector: string): number =>
      (selector.match(/\.[a-z-]+|\[[^\]]+\]/g) ?? []).length;

    const star = css.match(STAR_RULE)![0].split("{")[0]!;
    const deepest = css.match(
      /\.editor-content :is\(ul, ol\) :is\(ul, ol\) ul > li::marker \{[^}]*\}/,
    )![0].split("{")[0]!;

    expect(classes(star)).toBeGreaterThan(classes(deepest));
  });

  it("is keyed on the attribute the schema writes, not on a decoration class", () => {
    // The distinction `list-marker-style.ts` draws: a bold marker carries no meaning and is
    // a decoration, a star carries the whole point and is an attribute that reaches disk.
    expect(css).toMatch(/data-starred/);
    expect(css).not.toMatch(/li\.li-star/);
  });
});
