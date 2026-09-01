import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **One header height and one footer height, across every pane in both windows.**
 *
 * `DESIGN-CRITIQUE.md`'s Finding 7 is what this file exists to keep fixed. Measured from
 * the top edge, the library's three panes used to be: a folder tree with three buttons
 * floating on the pane colour and no band at all (~40px), a note list stacking a search
 * row on a count/sort row (78px), and the note itself running to 127px before its first
 * word. Nothing lined up across the columns, so there was no horizontal rule anywhere
 * across the top of the window and no top edge to the content area — three unrelated
 * stacks that happened to be side by side.
 *
 * The fix is geometric, so what has to be pinned is geometry: a fixed height, and
 * `flex: none` so only the scroll region between the two bands ever gives way. Both
 * numbers are load-bearing beyond looks — 40px is also what the platform's own window
 * controls are drawn into now (macOS traffic lights ~28px, Windows 11's caption buttons
 * 32), so a band that shrank would put them outside it.
 *
 * jsdom has neither a cascade nor layout, so this reads the sheet as text — the same
 * limitation and the same shape as `styles-window-chrome.test.ts` beside it. That means
 * it cannot answer the acceptance check as a *measurement*: "all three headers report the
 * same offsetHeight" needs a real renderer, and lives in the packaged
 * `--library --screenshot` pass instead (see the `diagnostics` skill). What this file can
 * do is stop a second height being written down, which is how the first three appeared.
 */

const shared = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const library = readFileSync(
  new URL("../src/renderer/library/library.css", import.meta.url),
  "utf8",
);

const rule = (css: string, selector: string): string => {
  const found = css.match(new RegExp(`${selector} \\{[^}]*\\}`))?.[0];
  expect(found, `no rule found for ${selector}`).toBeDefined();
  return found!;
};

describe("styles: the panes share one header and one footer geometry", () => {
  it("fixes the header band at 40px and refuses to let it flex", () => {
    const header = rule(shared, "\\.pane-header");
    expect(header).toMatch(/height:\s*40px;/);
    expect(header).toMatch(/flex:\s*none;/);
  });

  it("fixes the footer band at 28px and refuses to let it flex", () => {
    const footer = rule(shared, "\\.pane-footer");
    expect(footer).toMatch(/height:\s*28px;/);
    expect(footer).toMatch(/flex:\s*none;/);
  });

  it("states each height exactly once, so a pane cannot quietly acquire its own", () => {
    // The failure mode is not a wrong number, it is a *second* number: a pane that grows
    // one control and gets a height of its own is how the three stacks came about. Only
    // the two rules above may say how tall a band is.
    const heights = (css: string, value: string): number =>
      css.split("\n").filter((line) => line.trim() === `height: ${value};`).length;

    expect(heights(shared, "40px"), "styles.css: only .pane-header").toBe(1);
    expect(heights(shared, "28px"), "styles.css: only .pane-footer").toBe(1);
    expect(heights(library, "40px"), "library.css: none of its own").toBe(0);
    expect(heights(library, "28px"), "library.css: none of its own").toBe(0);
  });

  it("leaves the rows between the bands at the density the design asked for", () => {
    // The bands only buy anything if the list between them stays dense: 26px folder rows,
    // and the vault's own row a notch shorter because it is a section label rather than
    // somewhere you file a note.
    expect(rule(library, "\\.branch")).toMatch(/height:\s*26px;/);
    expect(rule(library, "\\.branch-root")).toMatch(/height:\s*22px;/);
  });

  it("keeps the tree's bottom menu deliberately out of the footers' alignment", () => {
    // The one asymmetry in the pass, and it is on purpose: Tags / People / Tasks /
    // Settings are destinations rather than a status bar, the section can unfold to 55%
    // of the pane, and dressing it as a 28px band would claim an alignment it cannot
    // keep. If it ever gains `.pane-footer`, that decision has been lost rather than
    // changed.
    const footer = rule(library, "\\.tree-footer");
    expect(footer).toMatch(/max-height:\s*55%;/);
    expect(footer).not.toMatch(/height:\s*28px;/);
  });

  it("makes the bands the drag region and everything in them not", () => {
    // Both windows are frameless, so the header band is also the grab area. Every control
    // inside it has to opt out or the press is eaten by the window move — and so does the
    // one thing that is *not* inside it but overlaps it: the pane splitters run the full
    // height of the window, and their top 40px crosses the band.
    expect(rule(shared, "\\.pane-header")).toMatch(/-webkit-app-region:\s*drag;/);
    expect(rule(shared, "\\.pane-actions")).toMatch(/-webkit-app-region:\s*no-drag;/);
    expect(rule(library, "\\.notes-search")).toMatch(/-webkit-app-region:\s*no-drag;/);
    expect(rule(library, "\\.pane-splitter")).toMatch(/-webkit-app-region:\s*no-drag;/);

    // **The note's own title, in both of the states it has.** It is not a control that
    // announces itself as one — an `<h1>` you click to rename, and the `<input>` it
    // becomes — which is exactly how it was missed: B92 put both in the band without
    // either, and the reader's title simply stopped being editable. Nothing in this suite
    // could see it, jsdom having no app-region, and `library-title-edit.test.ts` drives
    // that very click and stayed green. So both halves are counted here, by hand.
    expect(rule(shared, "\\.pane-header \\.title-field")).toMatch(
      /-webkit-app-region:\s*no-drag;/,
    );
    expect(rule(library, "\\.reader-header h1")).toMatch(/-webkit-app-region:\s*no-drag;/);

    // The footer is not a grab area: it holds controls at both ends, and a drag region
    // over them is a press that goes to the window manager instead of to the button.
    expect(rule(shared, "\\.pane-footer")).not.toMatch(/-webkit-app-region:\s*drag;/);
  });

  /**
   * B95. Windows 11 paints its caption buttons into the top-right 40px of the *window*,
   * over whatever the renderer has drawn there — and the library window is not three panes
   * at y=0. `.library-shell` stacks up to three full-width bars above the pane grid, so
   * when one of them is up it is that bar, not the reader's header, that the controls
   * cover. The disk-change bar puts Reload / Close / Keep mine flush against that edge,
   * and they were drawn underneath them.
   *
   * Counted here by hand for this file's usual reason: `env(titlebar-area-width)` is
   * defined only where a Window Controls Overlay exists, which is Windows, so on this
   * machine every one of these rules evaluates to zero and no test that *runs* the CSS
   * could tell a correct one from a missing one.
   */
  it("keeps everything in the window's top band clear of the caption buttons", () => {
    // Declared once, so the four users cannot come to disagree about the expression.
    expect(shared.split("\n").filter((line) => line.trim().startsWith("--caption-inset:")))
      .toHaveLength(1);
    expect(rule(shared, ":root")).toMatch(
      /--caption-inset:\s*calc\(100vw - env\(titlebar-area-width, 100vw\)\);/,
    );

    // The reader's header, which is where the controls land when no bar is above it — and
    // which keeps its inset even when one is, since a 22px bar still leaves the top half
    // of this band inside the 40px overlay.
    expect(rule(shared, "\\.pane-header-caption")).toMatch(/var\(--caption-inset\)/);

    // And the three bars that can push that header out from under them.
    for (const selector of ["\\.scan-bar", "\\.disk-change-bar", "\\.conflict-banner"]) {
      expect(rule(library, selector), `${selector} does not reserve the caption inset`).toMatch(
        /var\(--caption-inset\)/,
      );
    }
  });

  /**
   * The fourth band, and the one that was not a band at all: the file preview drew its own
   * bar with its own padding and no footer, so the third column broke the line across the
   * top of the window whenever a file was being looked at rather than a note (B95).
   */
  it("draws the file preview's chrome from the same two components", () => {
    const preview = readFileSync(
      new URL("../src/renderer/library/FilePreview.tsx", import.meta.url),
      "utf8",
    );
    expect(preview).toContain("<PaneHeader");
    expect(preview).toContain("<PaneFooter");
    // No geometry of its own left — the height and the border are `.pane-header`'s, and
    // the count above is what would catch a second one being written down here.
    expect(rule(library, "\\.file-preview-bar")).not.toMatch(/height:/);
    expect(rule(library, "\\.file-preview-bar")).not.toMatch(/border-bottom:/);
  });
});
