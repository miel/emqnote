import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A regression guard over `library.css` itself, in the style of
 * `styles-attachments.test.ts` — nothing under `test/` loads the stylesheet into a real
 * layout engine (jsdom has no paint and no stacking contexts), so a plain text check is
 * what there is.
 *
 * What it pins: `.overlay` must declare a `z-index`. It is `position: fixed`, which
 * creates no stacking context on its own at `z-index: auto`, so a *positioned* sibling
 * later in document order paints over it — and `.library`, the three-column grid, is
 * one (`position: relative`). Every dialog in this window happens to be rendered after
 * the grid except `ConflictBanner`'s, which is rendered next to the banner above it
 * because that is where the banner belongs. Without the `z-index`, clicking the banner
 * dimmed only the strip the grid does not cover and drew the dialog *underneath* the
 * note list and reader: the note was unreachable, and the report it produced was
 * "clicking the error bar only dims it".
 */

const css = readFileSync(new URL("../src/renderer/library/library.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const match = css.match(new RegExp(`\\${selector} \\{[^}]*\\}`));
  expect(match, `no rule found for ${selector}`).not.toBeNull();
  return match![0];
}

describe("library.css: dialog overlays stack above the grid", () => {
  it("gives .overlay a z-index, not the default auto", () => {
    expect(rule(".overlay")).toMatch(/z-index:\s*\d+;/);
  });

  it("puts that z-index above the grid's own stacking level", () => {
    const overlayZ = Number(/z-index:\s*(\d+);/.exec(rule(".overlay"))![1]);

    // `.library` and everything inside it sit at `z-index: auto` but for one rule that
    // raises a sticky header; whatever that is, the overlay has to clear it.
    const others = [...css.matchAll(/z-index:\s*(\d+);/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value !== overlayZ);

    for (const value of others) expect(overlayZ).toBeGreaterThan(value);
  });
});
