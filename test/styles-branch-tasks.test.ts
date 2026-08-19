import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The open-task half of the folder tree's badge, and the one thing about it the cascade
 * can defeat.
 *
 * The element carries both class names — `.branch-tasks` always, `.branch-tasks-open`
 * when there is something open — so the second rule has to out-rank the first on
 * specificity rather than on source order. At one class each they tie, and a reordering
 * of this stylesheet would silently turn every folder's task count muted again. That is
 * B48's hidden chip and the `.overlay` dimming both, twice shipped; jsdom has no cascade
 * to lose in, so reading the rule is what there is.
 */

const css = readFileSync(new URL("../src/renderer/library/library.css", import.meta.url), "utf8");

describe("library.css: the badge's task count", () => {
  it("marks a folder with open tasks with a doubled selector, not a bare one", () => {
    const rule = css.match(/\.branch-tasks\.branch-tasks-open \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/color:\s*var\(--text\);/);

    expect(css).not.toMatch(/(?<!\.branch-tasks)\.branch-tasks-open \{/);
  });

  it("keeps a folder with nothing open as quiet as the note count beside it", () => {
    const rule = css.match(/\.branch-tasks \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/color:\s*var\(--muted\);/);
  });
});
