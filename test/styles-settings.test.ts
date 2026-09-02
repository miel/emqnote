import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * B100's settings shell, read as text.
 *
 * jsdom has no cascade and no layout, so nothing in this suite can *see* a rail beside a
 * pane — the same limitation `styles-pane-bands.test.ts` and `styles-surfaces.test.ts`
 * work around, and the same shape of answer: count the rules by hand.
 *
 * What is worth pinning here is the handful of decisions that are invisible until they are
 * wrong. A head band that borrowed the pane header's 40px would break the one-height rule
 * B92 exists to keep; a rail that scrolled with the pane would carry the group you are
 * standing on off the top of the screen; and a panel 720px wide with no narrow case would
 * put a 150px rail and a column of rows into 478px of a short window, which is the width
 * `npm run drive:library` actually opens it at.
 */

const library = readFileSync(
  new URL("../src/renderer/library/library.css", import.meta.url),
  "utf8",
);

function rule(selector: string): string {
  const match = library.match(new RegExp(`${selector} \\{[^}]*\\}`));
  expect(match, `no rule found for ${selector}`).not.toBeNull();
  return match![0];
}

describe("styles: the settings panel's head band is not a pane header", () => {
  it("takes its height from padding, never from the two band heights", () => {
    // `styles-pane-bands.test.ts` counts that `height: 40px` and `height: 28px` are each
    // stated exactly once in the whole app, in `styles.css`. A settings head band that
    // reached for either number would fail that file rather than this one — which is a
    // long way from the change that caused it, so it is said here too.
    expect(rule("\\.settings-head")).not.toMatch(/height:/);
    expect(library).not.toMatch(/^\s+height: 40px;$/m);
    expect(library).not.toMatch(/^\s+height: 28px;$/m);
  });

  it("keeps the search field and the dismiss button in the band", () => {
    // The one part of this panel that is not the thing being searched, which is why the
    // field sits there rather than opening a row of its own above the rows it filters.
    expect(rule("\\.settings-search")).toMatch(/background:\s*var\(--field\);/);
    expect(rule("\\.settings-search:focus")).toMatch(/border-color:\s*var\(--accent\);/);
    expect(rule("\\.settings-close")).toMatch(/background:\s*transparent;/);
  });
});

describe("styles: a resting control is not drawn as a focused one", () => {
  it("keeps the dropdowns quiet until they are the one you are on", () => {
    // This rule was copied from `.ask input`, where a permanent accent border is right:
    // that dialog has one field and the caret is put in it on opening. Here there are two
    // dropdowns among a dozen rows and nothing is focused, so an accent outline on both was
    // a resting control drawn as if it were being typed in — the one thing in either window
    // that did that.
    expect(rule("\\.settings select")).toMatch(/border:\s*1px solid var\(--border\);/);
    expect(rule("\\.settings select:focus")).toMatch(/border-color:\s*var\(--accent\);/);
  });
});

describe("styles: the rail stands still and the pane moves", () => {
  it("scrolls the pane and not the panel", () => {
    expect(rule("\\.settings-pane")).toMatch(/overflow-y:\s*auto;/);
    // The library behind the panel must not take over when the pane reaches its end.
    expect(rule("\\.settings-pane")).toMatch(/overscroll-behavior:\s*contain;/);
    // The cap stays on the panel — see `styles-overlay.test.ts`, which owns that half.
    expect(rule("\\.settings")).toMatch(/max-height:/);
  });

  it("gives the rail a width of its own and the pane what is left", () => {
    expect(rule("\\.settings-rail")).toMatch(/flex:\s*0 0 \d+px;/);
    expect(rule("\\.settings-pane")).toMatch(/flex:\s*1 1 auto;/);
  });

  it("wears the same focus ring the three panes do", () => {
    // B91: take it away and the UA draws its own, in the platform's accent colour rather
    // than the app's — which is what was reported on a Mac with an orange accent.
    const ring = rule("\\.settings-category:focus-visible");
    expect(ring).toMatch(/outline:\s*2px solid var\(--accent\);/);
    expect(ring).toMatch(/outline-offset:\s*-2px;/);
  });
});

describe("styles: the panel has a narrow case", () => {
  it("lays the rail out above the pane when there is no room beside it", () => {
    // 92vw of the 520px window `drive-library.ts` opens is 478px; a 150px rail would leave
    // the rows fighting for what is left.
    const media = library.match(/@media \(max-width: 600px\) \{[\s\S]*?\n\}/);
    expect(media, "no narrow-window rule for the settings panel").not.toBeNull();
    expect(media![0]).toContain(".settings-body");
    expect(media![0]).toMatch(/flex-direction:\s*column;/);
    expect(media![0]).toContain(".settings-rail");
  });
});
