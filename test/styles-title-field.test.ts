import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The note's title is one control, drawn the same way in both windows (B82).
 *
 * It was two. The capture window had an `<input class="subject">` at the header's 13px
 * semibold in a tinted box, labelled "Subject"; the library had an `<h1>` that swaps to an
 * input at 17px bold and borderless, called Title. Two windows that already share
 * `HeaderBlock`, `Editor`, `ContextMenu` and the shortcut sheet, disagreeing about the
 * most prominent field in either of them — and lighting it two different colours when
 * focused, because `.reader-title-input` had no `:focus` rule at all and fell through to
 * Chromium's own ring.
 *
 * **The first version of this rule did nothing, and this file exists because of that.**
 * The capture window's title sat inside `.header`, where `.header input` is one class
 * *and one element*: it out-ranks a bare `.title-field`, so the shared rule was written,
 * shipped past a full green suite, and changed nothing at all in the window it was mostly
 * for. Correct-looking CSS defeated by the cascade — B48's bug and the `.overlay` bug,
 * both of which shipped the same way. What is pinned below is therefore the *specificity*
 * as much as the values.
 *
 * **And then it happened a second time, to the fix.** B92 moved the capture window's
 * title out of `.header` and into the 40px band, and `.header .title-field` went on
 * reading exactly as correct as it always had while matching nothing at all — the field
 * fell back to a bare UA `<input>`, a box at 13px, in the one window this rule is mostly
 * for. Every assertion below passed throughout, because they all pinned the *values*
 * inside a rule and none of them pinned the *container* against the markup.
 *
 * So the container is what the first case now asserts, by name. A selector is two claims —
 * "these declarations" and "on these elements" — and this file had only ever checked one
 * of them.
 *
 * A text check of the stylesheets, in `styles-overlay.test.ts`'s idiom: jsdom has no
 * cascade and no layout, so reading the rule is what there is — which is also precisely
 * why a rule that loses the cascade, or misses its element, can pass every other test in
 * this suite.
 */

const styles = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const library = readFileSync(
  new URL("../src/renderer/library/library.css", import.meta.url),
  "utf8",
);

function rule(css: string, selector: string): string {
  const found = css.match(new RegExp(`${selector} \\{[^}]*\\}`))?.[0];
  expect(found, `no rule found for ${selector}`).toBeDefined();
  return found!;
}

describe("styles.css: one title field in both windows", () => {
  /** The one selector both windows' titles match, with `suffix` for a pseudo. */
  const shared = (suffix = ""): string => `\\.pane-header \\.title-field${suffix}`;

  it("names the container the markup actually puts the field in", () => {
    // Two claims in one selector, and this file used to check only the declarations.
    //
    // The specificity claim: `.header input` is (0,1,1) and a bare `.title-field` is
    // (0,1,0) and loses, which is how the first version of this changed nothing. Two
    // classes settle it outright rather than on source order, which a tie would decide
    // and a later edit would flip without touching either rule.
    expect(styles).toMatch(new RegExp(`${shared()} \\{`));
    expect(styles).not.toMatch(/^\.title-field \{/m);

    // The element claim, which is the one B92 broke. `PaneHeader` draws the band both
    // titles live in — `.pane-header` in the capture window, `.pane-header reader-header`
    // in the library — so that is the container, and `.header` (the four-field block
    // below it) is no longer an ancestor of either. A rule naming it would read correctly
    // and match nothing, which is precisely what shipped.
    // Anchored to the start of a line, so it reads selectors and not the comment above
    // the rule, which quotes the old spelling in order to say why it stopped working.
    expect(styles).not.toMatch(/^\.header \.title-field/m);
    expect(styles).not.toMatch(/^\.reader-header \.title-field/m);
    expect(readFileSync(new URL("../src/renderer/PaneHeader.tsx", import.meta.url), "utf8"))
      .toMatch(/"pane-header"/);
  });

  it("can be clicked into, which a drag region would prevent", () => {
    // The band is the frameless window's grab area, and Chromium hands a press inside one
    // to the window move rather than to the control underneath. Without this the title
    // cannot be clicked into at all — which is what happened to the `<h1>` it trades
    // places with, invisibly to a suite that has no app-region.
    expect(rule(styles, shared())).toMatch(/-webkit-app-region:\s*no-drag;/);
    expect(rule(library, "\\.reader-header h1")).toMatch(/-webkit-app-region:\s*no-drag;/);
  });

  it("draws the capture title at the pane-heading size and weight", () => {
    // 15px/600 — the size a pane's heading is drawn at in either window, because a note's
    // title *is* the heading of the pane it is in. It was 17px/bold until the three panes
    // agreed on one scale, and the number is asserted here rather than left to the
    // cascade because two other rules copy it: `.reader-header h1`, which trades places
    // with this input, and `.pane-title`, which every other heading wears.
    const box = rule(styles, shared());
    expect(box).toMatch(/font-size:\s*15px;/);
    expect(box).toMatch(/font-weight:\s*600;/);
    expect(box).toMatch(/background:\s*transparent;/);
  });

  it("keeps a transparent border at rest, so focusing never moves the text", () => {
    // The focus rule colours a border rather than adding one. Without the border here the
    // title would shift by a pixel every time the caret entered it.
    expect(rule(styles, shared())).toMatch(/border:\s*1px solid transparent;/);
  });

  it("lights both windows in the app's own colour, at a specificity that wins", () => {
    const focus = rule(styles, shared(":focus"));
    expect(focus).toMatch(/border-color:\s*var\(--accent\);/);
    expect(focus).toMatch(/outline:\s*none;/);
    // `.header input:focus` fills a focused header field with `--background` and
    // out-ranks the rest-state rule, so this has to be restated here or the capture
    // window's title takes a fill on focus that the library's never does.
    expect(focus).toMatch(/background:\s*transparent;/);
    // A bare `.title-field:focus` is (0,2,0), which any `input:focus` rule carrying a
    // class would out-rank — the same trap as above, one pseudo-class along.
    expect(styles).not.toMatch(/^\.title-field:focus \{/m);
  });

  it("gives the library's `<h1>` the same box it trades places with", () => {
    // The `<h1>` and the input swap on a click, so any difference between their boxes is
    // a visible jump. The padding and the border width have to be the shared field's.
    const heading = rule(library, "\\.reader-header h1");
    expect(heading).toMatch(/padding:\s*2px 6px;/);
    expect(heading).toMatch(/border:\s*1px solid transparent;/);

    // And it must *not* name a size of its own any more: it carries `.pane-title`, which
    // is where 15px/600 comes from for all three panes. A size here would out-rank that
    // one class with a class and an element, and the reader's heading would quietly stop
    // matching the two beside it — which is the whole of what this pass fixed.
    expect(heading).not.toMatch(/font-size:/);
  });

  it("leaves the library's input no second opinion of its own", () => {
    // A rule here would be a second answer about a shared control — and a `font: inherit`
    // in it, which is what used to be here, silently resets the size and weight the
    // shared rule sets.
    expect(library).not.toMatch(/\.reader-title-input \{/);
  });
});
