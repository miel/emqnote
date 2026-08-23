import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The header's completion panels stay inside the window.
 *
 * A text check of the stylesheet, in the idiom `styles-overlay.test.ts` set: jsdom has no
 * layout, so nothing here can measure a panel against a window edge, and reading the rule
 * is what there is.
 *
 * What broke, and why it is a rule rather than a number. `.tag-suggest` is
 * `min-width: 220px` and `max-width: 100%`, and **`min-width` wins that argument** — the
 * `max-width` does not contain the panel at all. The header grid is
 * `auto minmax(0, 1fr) auto minmax(0, 1fr)` and `HeaderBlock` emits When, Tags, Where, Who
 * in that order, so Tags and Who are the two cells in the right-hand track: at `left: 0`
 * their panel starts halfway across the window and runs 220px from there, which in a
 * window at the 460px minimum is a panel painting out through the frame.
 *
 * Right-anchored, they grow leftwards into the header instead, where there is always at
 * least the other column to grow into. Where and When must keep `left: 0` — they grow
 * rightwards into that same room, and flipping them would push them out of the left edge.
 * So this is a pair of assertions, not one: the fix is wrong applied to all four.
 *
 * The `/` menu is a different mechanism and deliberately not covered here — it is
 * `position: fixed` on `<body>` and clamps itself in `slash-menu.ts` against
 * `window.innerWidth`. A panel with a containing block hangs off an edge chosen at author
 * time; one without has to measure at open time.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const found = css.match(new RegExp(`${selector} \\{[^}]*\\}`))?.[0];
  expect(found, `no rule found for ${selector}`).toBeDefined();
  return found!;
}

describe("styles.css: the completion panels do not leave the window", () => {
  it("anchors the right-hand column's panels to the field's right edge", () => {
    const anchored = rule(
      "\\.header-cell\\.header-tags \\.tag-suggest,\\n\\.header-cell\\.header-who \\.tag-suggest",
    );
    expect(anchored).toMatch(/left:\s*auto;/);
    expect(anchored).toMatch(/right:\s*0;/);
  });

  it("leaves the left-hand column's panels growing rightwards", () => {
    // Where and When have the whole right half to open into. Right-anchoring them would
    // be the same bug mirrored.
    expect(css).not.toMatch(/\.header-cell\.header-where \.tag-suggest \{[^}]*right:\s*0;/);
  });

  it("keeps the base panel left-anchored, so the pair above is the exception", () => {
    const base = rule("\\.tag-suggest");
    expect(base).toMatch(/position:\s*absolute;/);
    expect(base).toMatch(/left:\s*0;/);
    // The floor that makes the overhang possible in the first place. If this ever goes,
    // the two rules above stop being needed rather than starting to be wrong — but it is
    // what the comment on them describes, so it is pinned with them.
    expect(base).toMatch(/min-width:\s*220px;/);
  });

  it("anchors every panel to a positioned cell", () => {
    // `position: absolute` with no positioned ancestor escapes to the viewport, and then
    // neither edge means anything. All three completion cells have to declare it.
    expect(css).toMatch(/\.header-cell\.header-tags \{[^}]*position:\s*relative;/);
    expect(css).toMatch(
      /\.header-cell\.header-where,\n\.header-cell\.header-who \{[^}]*position:\s*relative;/,
    );
  });
});
