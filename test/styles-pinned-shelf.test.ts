import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * B76's shelf is a CSS mechanism, and jsdom has no cascade, no scrolling and no sticky —
 * so reading the rule is what there is, the same limitation `styles-note-tasks.test.ts`
 * and `styles-star.test.ts` work under.
 *
 * Two of the three declarations below look like styling and are not. The opaque background
 * is the mechanism itself: `.note-on` and the row hover are translucent greys meant to sit
 * *on* the pane, so a shelf with a transparent background has the rows it is holding
 * against the top edge read straight through it as the list scrolls beneath — which does
 * not look like a missing colour, it looks like the pinned notes have gone double. And
 * `z-index` answers a neighbour the stacking context does not: a sticky box makes one of
 * its own, but the rows *after* it in the list would still paint over it in source order.
 *
 * `NoteList.tsx` draws no wrapper at all while the setting is off, so none of this can
 * reach a list that did not ask for it.
 */

const css = readFileSync(new URL("../src/renderer/library/library.css", import.meta.url), "utf8");

const SHELF = /\.notes-pinned \{[^}]*\}/;

describe("library.css: the shelf of pinned rows", () => {
  it("sticks to the top of the scroller", () => {
    const rule = css.match(SHELF)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/position:\s*sticky;/);
    // Without a `top` a sticky box never leaves its flow position — the rule would be
    // present, correct-looking and do nothing at all.
    expect(rule).toMatch(/top:\s*0;/);
  });

  it("paints an opaque ground, so the list cannot show through it", () => {
    expect(css.match(SHELF)?.[0]).toMatch(/background:\s*var\(--background\);/);
  });

  it("stacks above the rows that follow it in the list", () => {
    expect(css.match(SHELF)?.[0]).toMatch(/z-index:\s*1;/);
  });

  it("strips the list styling from the inner list the rows sit in", () => {
    // The wrapper is `li > ul` — valid inside a listbox, and the one nesting ARIA allows —
    // so the inner `ul` arrives with a browser's own bullets, padding and margin unless
    // they are taken off. `.notes-list` takes its own off and cannot reach this one.
    const rule = css.match(/\.notes-pinned ul \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/list-style:\s*none;/);
    expect(rule).toMatch(/padding:\s*0;/);
    expect(rule).toMatch(/margin:\s*0;/);
  });
});
