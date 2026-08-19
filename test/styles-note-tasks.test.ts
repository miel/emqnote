import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The note list's own task count, and the one thing about it the cascade can defeat.
 *
 * `test/styles-branch-tasks.test.ts`'s reasoning a level down: the element carries both
 * class names — `.note-tasks` always, `.note-tasks-open` when there is work left — so the
 * second rule has to out-rank the first on specificity rather than on source order. At one
 * class each they tie, and reordering this stylesheet would silently mute every count in
 * the list. B48's hidden chip and the `.overlay` dimming are that bug twice shipped; jsdom
 * has no cascade to lose in, so reading the rule is what there is.
 */

const css = readFileSync(new URL("../src/renderer/library/library.css", import.meta.url), "utf8");

describe("library.css: the note list's task count", () => {
  it("marks a note with open tasks with a doubled selector, not a bare one", () => {
    const rule = css.match(/\.note-tasks\.note-tasks-open \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/color:\s*var\(--accent\);/);

    expect(css).not.toMatch(/(?<!\.note-tasks)\.note-tasks-open \{/);
  });

  it("keeps a note whose boxes are all ticked as quiet as the excerpt above it", () => {
    const rule = css.match(/\.note-tasks \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/color:\s*var\(--muted\);/);
  });

  it("pushes the count to the right edge itself, so a note with no attendees still gets it there", () => {
    // `justify-content: space-between` on the row would leave a lone count on the left.
    const rule = css.match(/\.note-tasks \{[^}]*\}/)?.[0];
    expect(rule).toMatch(/margin-left:\s*auto;/);
  });
});
