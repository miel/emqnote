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
 * The capture window's title sits inside `.header`, where `.header input` is one class
 * *and one element*: it out-ranks a bare `.title-field`, so the shared rule was written,
 * shipped past a full green suite, and changed nothing at all in the window it was mostly
 * for. Correct-looking CSS defeated by the cascade — B48's bug and the `.overlay` bug,
 * both of which shipped the same way. What is pinned below is therefore the *specificity*
 * as much as the values.
 *
 * A text check of the stylesheets, in `styles-overlay.test.ts`'s idiom: jsdom has no
 * cascade and no layout, so reading the rule is what there is — which is also precisely
 * why a rule that loses the cascade can pass every other test in this suite.
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
  /** Both halves of the selector list, with `suffix` on each — `:focus` goes on both. */
  const shared = (suffix = ""): string =>
    `\\.header \\.title-field${suffix},\\n\\.reader-header \\.title-field${suffix}`;

  it("names a container, so it out-ranks `.header input`", () => {
    // The whole point. `.header input` is (0,1,1); a bare `.title-field` is (0,1,0) and
    // loses, which is how the first version of this changed nothing. Two classes settle
    // it outright rather than on source order, which a tie would decide and a later edit
    // would flip without touching either rule.
    expect(styles).toMatch(new RegExp(`${shared()} \\{`));
    expect(styles).not.toMatch(/^\.title-field \{/m);
  });

  it("draws the capture title at the note editor's size and weight", () => {
    const box = rule(styles, shared());
    expect(box).toMatch(/font-size:\s*17px;/);
    expect(box).toMatch(/font-weight:\s*bold;/);
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
    // `.header input:focus` is (0,2,1). A bare `.title-field:focus` is (0,2,0) and would
    // lose the border-colour to it — the same trap as above, one pseudo-class along.
    expect(styles).not.toMatch(/^\.title-field:focus \{/m);
  });

  it("gives the library's `<h1>` the same box it trades places with", () => {
    // The `<h1>` and the input swap on a click, so any difference between their boxes is
    // a visible jump. The padding and the border width have to be the shared field's.
    const heading = rule(library, "\\.reader-header h1");
    expect(heading).toMatch(/padding:\s*2px 6px;/);
    expect(heading).toMatch(/border:\s*1px solid transparent;/);
    expect(heading).toMatch(/font-size:\s*17px;/);
  });

  it("leaves the library's input no second opinion of its own", () => {
    // A rule here would be a second answer about a shared control — and a `font: inherit`
    // in it, which is what used to be here, silently resets the size and weight the
    // shared rule sets.
    expect(library).not.toMatch(/\.reader-title-input \{/);
  });
});
