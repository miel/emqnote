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

    // The footer is not a grab area: it holds controls at both ends, and a drag region
    // over them is a press that goes to the window manager instead of to the button.
    expect(rule(shared, "\\.pane-footer")).not.toMatch(/-webkit-app-region:\s*drag;/);
  });
});
