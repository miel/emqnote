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

/**
 * Both files, concatenated, because the library window's cascade is both of them —
 * `library.tsx` imports `styles.css` and then `library/library.css`. `.overlay` and the
 * palette surface moved into the first when the note picker (B41) needed them in the
 * capture window, which loads only that one; what the guard is about did not move with
 * them, since `.library` still sits in the second.
 */
const css = [
  readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8"),
  readFileSync(new URL("../src/renderer/library/library.css", import.meta.url), "utf8"),
].join("\n");

function rule(selector: string): string {
  const escaped = selector.replaceAll(".", String.raw`\.`);
  const match = css.match(new RegExp(`${escaped} \\{[^}]*\\}`));
  expect(match, `no rule found for ${selector}`).not.toBeNull();
  return match![0];
}

describe("the stylesheets: dialog overlays stack above the grid", () => {
  it("gives .overlay a z-index, not the default auto", () => {
    expect(rule(".overlay")).toMatch(/z-index:\s*\d+;/);
  });

  it("gives the slash menu one too, though it mounts from a plugin rather than an overlay", () => {
    // B51's panel is appended to `document.body` by a ProseMirror plugin, so it never sits
    // inside an `.overlay` and inherits none of its stacking. Same trap, new door.
    expect(rule(".slash-menu")).toMatch(/z-index:\s*\d+;/);
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

/**
 * The other half of the same cascade question, and a shipped bug of its own.
 *
 * Two overlays deliberately carry no dimming: the right-click menu's click catcher and
 * the table size grid's. Both are rendered as `class="overlay …"` plus their own class,
 * so at one class each they tie `.overlay` on specificity (0,1,0) and lose on source
 * order — `.overlay` sits several hundred lines below both of them in the same file.
 * Every context menu, every Actions/Insert dropdown and the table grid therefore dimmed
 * the whole window, in both windows, while the comment beside the rule said they did
 * not. Same family as B48's `.wiki-link-duplicated`, and jsdom cannot see either: there
 * is no cascade under `test/` to lose in.
 */
/**
 * A third question about the same menus, and the same reason it can only be asked as
 * text: whether a disabled item *looks* disabled.
 *
 * `color: var(--muted)` on its own is not an answer. That token already carries the
 * shortcut column and the section headings inside every one of these menus, so a
 * disabled row came out in a colour the menu is full of anyway — an ordinary-looking
 * entry that silently does nothing, which is what "Rename folder" on the vault root was
 * reported as. jsdom computes no cascade and paints nothing, so a rendered assertion
 * would pass on a stylesheet that had lost the rule entirely.
 */
describe("the stylesheets: a disabled menu item reads as disabled", () => {
  it("dims .context-menu-item:disabled with more than the muted colour", () => {
    expect(rule(".context-menu-item:disabled")).toMatch(/opacity:\s*0?\.\d+;/);
  });
});

describe("the stylesheets: the undimmed overlays out-rank the dimmed one", () => {
  for (const selector of [".overlay.context-menu-overlay", ".overlay.overlay-bare"]) {
    const own = selector.slice(".overlay".length);

    it(`writes ${selector} with both class names`, () => {
      expect(rule(selector)).toMatch(/background:\s*transparent;/);
    });

    it(`never writes ${own} on its own, which would lose to .overlay`, () => {
      // A bare `.foo {` — start of a line, nothing but the class before the brace.
      expect(css).not.toMatch(new RegExp(`^\\${own} \\{`, "m"));
    });
  }
});

/**
 * A panel taller than the window it opens in.
 *
 * The settings sheet is a flex child of `.overlay`, which is `position: fixed` — so it is
 * not in the page's own flow and the window's scrollbar has nothing to do with it. On a
 * short screen the vault list and the dismiss button below it were off the bottom edge with
 * no way to reach either, which is a dialog you cannot dismiss with the mouse.
 *
 * Both halves are checked because either alone is useless: a `max-height` with no
 * `overflow-y` clips the rows instead of scrolling to them.
 *
 * **The two halves are on two different rules now** (B100), and the split is the point.
 * The cap stays on `.settings`, because the overlay is what it is measured against; the
 * scrolling moved to `.settings-pane`, because the head band with the search in it and the
 * rail saying which group you are standing on both have to stand still while the rows move
 * under them. A panel that still scrolled as a whole would carry both off the top of the
 * screen on the way to the row it was opened for. Asserting `overflow-y` on `.settings`
 * would now pin a rule doing nothing, which is worse than pinning no rule at all.
 */
describe("the stylesheets: the settings panel fits the screen", () => {
  it("caps .settings against the height the overlay leaves it", () => {
    expect(rule(".settings")).toMatch(/max-height:\s*calc\(100% - \d+px\);/);
  });

  it("scrolls the pane rather than clipping what does not fit", () => {
    expect(rule(".settings-pane")).toMatch(/overflow-y:\s*auto;/);
  });

  it("keeps the head band and the rail out of that scroll", () => {
    // `flex: none` on the band, and the pane is the only child of `.settings-body` that
    // scrolls. Without the `min-height: 0` a flex item refuses to shrink below its content,
    // the pane's `overflow-y` never engages, and the panel grows straight past the cap
    // above — which is the exact failure that cap was added to prevent.
    expect(rule(".settings-head")).toMatch(/flex:\s*none;/);
    expect(rule(".settings-body")).toMatch(/min-height:\s*0;/);
    expect(rule(".settings-pane")).toMatch(/min-height:\s*0;/);
  });
});
