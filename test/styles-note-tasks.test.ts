import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The note list's own task count, and the two things about it the cascade can defeat.
 *
 * It used to have two states — muted for `0 of 5`, the accent for a note with work left —
 * written as `.note-tasks` and `.note-tasks.note-tasks-open`, doubled so the second could
 * not merely tie the first on specificity and be settled by source order. There is one
 * state now: `taskCount` returns null at zero, so every badge that is drawn at all is a
 * badge with work behind it. So what is pinned here is the *other* half of that change —
 * that the colour moved onto the bare rule, and that the second class did not survive
 * halfway. A `.note-tasks-open` left in the stylesheet with nothing writing it would be a
 * rule nobody could see failing.
 *
 * B48's hidden chip and the `.overlay` dimming are that family of bug twice shipped; jsdom
 * has no cascade to lose in, so reading the rule is what there is.
 */

const css = readFileSync(new URL("../src/renderer/library/library.css", import.meta.url), "utf8");

/** The same stylesheet with its comments taken out, for the assertion that a name is
 *  gone: the comment above the rule says what used to be there and why, and a check that
 *  cannot tell a selector from the sentence explaining it would forbid writing that
 *  sentence down. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("library.css: the note list's task count", () => {
  it("draws the count in the accent, there being no other state left to draw", () => {
    const rule = css.match(/\.note-tasks \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/color:\s*var\(--accent\);/);
  });

  it("keeps no trace of the second class the two-state version needed", () => {
    expect(rules).not.toMatch(/\.note-tasks-open/);
  });

  it("pushes the count to the right edge itself, so a lone count still lands there", () => {
    // `justify-content: space-between` on the row would leave a lone count on the left —
    // which is now the common case, the badge sitting on the excerpt row by itself
    // whenever a note names nobody.
    const rule = css.match(/\.note-tasks \{[^}]*\}/)?.[0];
    expect(rule).toMatch(/margin-left:\s*auto;/);
  });

  it("lets the excerpt keep its ellipsis with the count beside it", () => {
    // A flex item's default `min-width: auto` refuses to shrink below its content, so
    // without this a long excerpt pushes the count off the end of the row instead of
    // truncating — the very line `.note-bottom` already needs for the attendees.
    const rule = css.match(/\.note-middle \.note-excerpt \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/min-width:\s*0;/);
  });
});
