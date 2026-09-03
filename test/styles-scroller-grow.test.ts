import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The two lists in the middle pane, and the one property that decides where the footer
 * band under them ends up.
 *
 * `.notes` is a flex column: header, the scroller, footer. A scroller at the default
 * `flex: 0 1 auto` is only as tall as its rows, so a list shorter than the pane leaves the
 * leftover height *below* the footer — the count, and whatever buttons the view keeps
 * there, walk up to sit against the last row and move again with every change of length.
 * `.notes-list` learned that first; the Tasks view's own `.task-rows` was written without
 * it and shipped the same bug, with the added tell that "Exit tasks" appeared to travel
 * with the list.
 *
 * `min-height: 0` is the other half: a flex item may not shrink below its content without
 * it, so the scroller would push the footer off the bottom instead of scrolling once the
 * list is long. Neither is visible to jsdom, which lays nothing out — reading the rules is
 * what there is.
 */

const css = readFileSync(new URL("../src/renderer/library/library.css", import.meta.url), "utf8");

describe("library.css: the middle pane's scrollers own the leftover height", () => {
  it.each([".notes-list", ".task-rows"])("grows and may shrink: %s", (selector) => {
    const rule = css.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/flex:\s*1 1 auto;/);
    expect(rule).toMatch(/min-height:\s*0;/);
    expect(rule).toMatch(/overflow-y:\s*auto;/);
  });
});
