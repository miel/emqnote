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
 * The keyboard ring went the other way and came back (B91). It was taken off the note list on a
 * Windows report — 2px of `--accent` around a full-width row paints as three at 125 %
 * scaling — and that removal never removed a ring: a `.note` carries a roving `tabIndex`,
 * so the row is focusable regardless, and with no rule of ours the UA draws its own in the
 * platform's colour. On a Mac that is the system accent, reported back as an orange border
 * in the note list against the tree's blue. The three panes share one rule again, which is
 * what the second half of this file pins.
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
  /**
   * One rule for all three panes. Split it and the panes are free to disagree about the
   * ring again, which is the defect twice over: first the tree drawing one where the note
   * list drew none, then the note list drawing the UA's own in the platform's accent
   * colour — orange on the Mac it was reported from — where the tree drew `--accent`.
   */
  const ring = (): string => {
    const found = library.match(
      /\.branch:focus-visible,\s*\n\.note:focus-visible,\s*\n\.task-row:focus-visible \{[^}]*\}/,
    )?.[0];
    expect(found, "the shared focus-visible rule has changed shape").toBeDefined();
    return found!;
  };

  it("is the same two pixels of accent in the tree, the note list and the task list", () => {
    expect(ring()).toMatch(/outline:\s*2px solid var\(--accent\);/);
    expect(ring()).toMatch(/outline-offset:\s*-2px;/);
  });

  it("gives the note list no ring of its own to drift from the other two", () => {
    // A second `.note:focus-visible` rule is how the panes came apart the first time. The
    // shared one above is the only place a note row's ring may be described.
    const all = library.match(/\.note:focus-visible/g) ?? [];
    expect(all).toHaveLength(1);

    // And the row itself does not turn the ring off underneath it. `.notes-search input`
    // and the splitter legitimately carry `outline: 0`, so this asks the note row's own
    // block rather than the whole sheet.
    expect(rule(".note")).not.toContain("outline");
  });
});
