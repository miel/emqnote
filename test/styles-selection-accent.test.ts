import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What "selected" looks like in the two panes, and where the accent is no longer allowed.
 *
 * `DESIGN-CRITIQUE.md`'s Finding 3 measured the pair side by side: the selected folder was
 * a `--selected` fill **plus** `--accent` text **plus** `font-weight: 600`, and the open
 * note was a `--selected` fill and nothing else. The folder shouted and the note whispered,
 * so the eye read the tree as the live pane whichever pane the keyboard was actually in.
 * The two now agree that selection is the fill.
 *
 * The other half arrived as a defect report from Windows: `.note:focus-visible` drew a 2px
 * `--accent` box around a full-width row, and at 125 % display scaling that paints as three
 * pixels of saturated blue. The ring is gone from the note list — and deliberately *kept*
 * in the tree, which is now the one pane that can still show where the keyboard is.
 *
 * B87's own file (`styles-surfaces.test.ts`) owns the six roles and their values; this one
 * owns the two rules that were taking a seventh liberty with the accent. Read as text for
 * the same reason: jsdom has no cascade.
 */

const library = readFileSync(
  new URL("../src/renderer/library/library.css", import.meta.url),
  "utf8",
);

/** The declaration block for an exact selector, whitespace and all. */
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = library.match(new RegExp(`${escaped} \\{[^}]*\\}`));
  expect(found, `no rule found for ${selector}`).not.toBeNull();
  return found![0];
};

describe("the selected row", () => {
  it("is the same fill in the tree and in the note list", () => {
    expect(rule(".branch-on")).toMatch(/background:\s*var\(--selected\);/);
    expect(rule(".note-on")).toMatch(/background:\s*var\(--selected\);/);
  });

  it("adds nothing but weight to the selected folder's name", () => {
    const branch = rule(".branch-on .branch-name");
    expect(branch).toMatch(/font-weight:\s*600;/);
    expect(branch).not.toContain("--accent");
  });
});

describe("the keyboard focus ring", () => {
  it("is not drawn on a note row", () => {
    // The Windows report: 2px of `--accent` inset around the row, three pixels wide at
    // 125 % scaling. A note row is found by its fill now, and by nothing else.
    expect(library).not.toContain(".note:focus-visible");
  });

  it("is still drawn on a folder and on a task row", () => {
    // Removing it everywhere was the other option and is not what was asked for: with no
    // ring anywhere, `roveArrowKey` would move focus through three panes with nothing on
    // screen following it.
    const ring = library.match(
      /\.branch:focus-visible,\s*\n\.task-row:focus-visible \{[^}]*\}/,
    )?.[0];
    expect(ring, "the shared focus-visible rule has changed shape").toBeDefined();
    expect(ring!).toMatch(/outline:\s*2px solid var\(--accent\);/);
  });
});
