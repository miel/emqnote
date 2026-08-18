import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The find highlight (B63), and the two ways this stylesheet has been caught out before.
 *
 * jsdom has no cascade, so reading the rule is what there is — the same limitation
 * `styles-overlay.test.ts` and `styles-list-marker.test.ts` each name. Two things are
 * pinned, and both are mistakes this file has actually shipped:
 *
 * - **The active match carries both class names on one selector.** At one class each,
 *   `.find-match-active` would tie `.find-match` on specificity and win or lose by source
 *   order alone — exactly B48's `display: none` bug and the `.overlay` dimming, correct to
 *   read and defeated in the browser.
 * - **The colour is its own token**, not a shade of `--highlight` or `--task-highlight`.
 *   Those are the `==highlight==` mark and the Tasks view pointing at a line; a find match
 *   that looked like either would be the confusion B32 already fixed once.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("styles.css: finding inside a note", () => {
  it("names the active match with both classes, never with the modifier alone", () => {
    expect(css).toMatch(/\.editor-content \.find-match\.find-match-active \{/);
    expect(css).not.toMatch(/\.editor-content \.find-match-active \{/);
  });

  it("gives a match a colour of its own, and not one of the two yellows", () => {
    const plain = css.match(/\.editor-content \.find-match \{[^}]*\}/)?.[0];
    expect(plain).toBeDefined();
    expect(plain).toMatch(/background:\s*var\(--find-match\);/);
    expect(plain).not.toMatch(/--highlight|--task-highlight/);

    const active = css.match(/\.editor-content \.find-match\.find-match-active \{[^}]*\}/)?.[0];
    expect(active).toMatch(/background:\s*var\(--find-active\);/);
  });

  it("defines both tokens in the light theme as well as the dark one", () => {
    // The dark palette is on bare `:root`; the light one overrides inside the media query.
    // A token defined in only one of them draws as nothing at all in the other.
    const light = css.match(/@media \(prefers-color-scheme: light\) \{[\s\S]*?\n {2}\}/)?.[0];
    expect(light).toBeDefined();
    expect(light).toMatch(/--find-match:/);
    expect(light).toMatch(/--find-active:/);
    expect(css).toMatch(/^ {2}--find-match:/m);
    expect(css).toMatch(/^ {2}--find-active:/m);
  });

  it("takes the bar out of the scrolling editor", () => {
    // `.editor` is the scroll container, so a bar positioned inside it would scroll away
    // with the text it is searching — which is why `find-in-note.ts` places it against the
    // editor's own rect instead.
    const bar = css.match(/\.find-bar \{[^}]*\}/)?.[0];
    expect(bar).toBeDefined();
    expect(bar).toMatch(/position:\s*fixed;/);
    expect(bar).toMatch(/z-index:/);
  });
});
