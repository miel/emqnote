import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * B87 — one surface system, six roles, over both stylesheets.
 *
 * The page is `--background`, everything framing it is `--surface`, a field you type a
 * value into is `--field`, a row under the pointer is `--hover`, the row that is chosen is
 * `--selected`, and the line between any two of them is `--border`.
 *
 * Two things are worth pinning here and they are different in kind.
 *
 * The first is the **polarity**, and it is the one place in this suite where a literal
 * colour is the right assertion, because the value *is* the decision. The light theme used
 * to say `--surface: #ffffff` and `--background: #fbfbfc` — chrome lighter than the page it
 * framed — and `DESIGN-CRITIQUE.md`'s Finding 2 measured what that costs: the note list and
 * the reader the same colour, separated by one pixel at 1.28 : 1, with the tree a further
 * 1.6 % away. It also made a code block, a wiki-link chip and a tag chip white on off-white.
 * A future edit that flips it back would pass every other test in this file.
 *
 * The second is that **hover and selection are two tokens rather than seven alphas**. They
 * were `rgba(127, 127, 127, α)` with α ∈ {0.08, 0.09, 0.10, 0.12, 0.14, 0.18, 0.20} across
 * fifteen rules, which put a hovered branch four hundredths from a selected note and made a
 * selected branch pixel-identical to a hovered title-bar button. The count assertion below
 * is what stops them growing back: the only two grey overlays left outside `:root` are the
 * note's own table header row and the scan bar's fill, and both carry a comment saying why
 * they are not UI state.
 *
 * jsdom has no cascade and no layout, so this reads the sheets as text — the same
 * limitation and the same shape as `styles-window-chrome.test.ts`, and `library.css` is
 * read alongside `styles.css` because the library window's cascade is both files.
 *
 * Several of the selectors below moved to `styles.css` with the pane-consistency pass:
 * the note list's sort chooser, the tree's toolbar buttons and the capture window's title
 * bar buttons are all one `.chrome-button` now, which is *why* there is one hover rule to
 * assert instead of four. The list is shorter for the right reason.
 */

const shared = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const library = readFileSync(
  new URL("../src/renderer/library/library.css", import.meta.url),
  "utf8",
);
const mainProcess = readFileSync(
  new URL("../src/main/window-background.ts", import.meta.url),
  "utf8",
);

const LIGHT = "@media (prefers-color-scheme: light)";
const darkBlock = shared.slice(0, shared.indexOf(LIGHT));
const lightBlock = shared.slice(shared.indexOf(LIGHT));

/**
 * The block for a selector — the one that carries `background`, when the same selector
 * heads more than one rule. `.header input, .header button` heads two, a box and a fill,
 * and taking the first match silently checks the wrong one.
 */
/**
 * `selector` may share its block with others — `.note-on, .note-marked { … }` since B94 —
 * so it is matched as one item of a comma-separated list rather than as the only thing in
 * front of the brace. What may precede it on its own item is anything but a brace or a
 * comma, which is how `.editor-content .wiki-link-thumb` is still found by its last part;
 * what may not is another selector, so `.note` still does not match `.note-on`.
 */
const rule = (css: string, selector: string): string => {
  const found = [
    ...css.matchAll(new RegExp(`(?:^|,)[^{},]*${selector}\\s*(?:,[^{}]+)?\\{[^}]*\\}`, "gm")),
  ].map((m) => m[0]);
  const block = found.find((one) => one.includes("background:")) ?? found[0];
  expect(block, `no rule found for ${selector}`).toBeDefined();
  return block!;
};

const ROLES = ["--background", "--surface", "--field", "--border", "--hover", "--selected"];

describe("styles: the six surface roles are defined once per theme", () => {
  it("declares every role in both the dark (:root) and the light block", () => {
    for (const role of ROLES) {
      expect(darkBlock, `${role} missing from :root`).toMatch(
        new RegExp(`${role}:\\s*[^;]+;`),
      );
      expect(lightBlock, `${role} missing from the light theme`).toMatch(
        new RegExp(`${role}:\\s*[^;]+;`),
      );
    }
  });

  it("keeps the light theme's polarity: the page is white, the chrome is not", () => {
    expect(lightBlock).toMatch(/--background:\s*#ffffff;/);
    expect(lightBlock).not.toMatch(/--surface:\s*#ffffff;/);
    expect(lightBlock).not.toMatch(/--field:\s*#ffffff;/);
  });

  it("keeps the dark theme's page darker than the panel that frames it", () => {
    expect(darkBlock).toMatch(/--background:\s*#1e1f22;/);
    expect(darkBlock).toMatch(/--surface:\s*#26282c;/);
  });

  it("declares color-scheme, so the OS draws scrollbars in the same theme", () => {
    // Without it the native parts — scrollbars, the popup a `<select>` opens — stay in the
    // OS scheme while the CSS goes the other way. Most visible on a white content pane.
    expect(shared).toMatch(/color-scheme:\s*light dark;/);
  });

  it("restates the page colour in the main process, where no stylesheet can be read", () => {
    // The colour Chromium paints before the first frame. It is the one duplication the
    // token system cannot remove, so it is pinned against the sheet instead.
    expect(mainProcess).toContain("#1e1f22");
    expect(mainProcess).toContain("#ffffff");
  });
});

describe("styles: hover and selection come from two tokens, not from literals", () => {
  const hover = [
    [library, "\\.branch:hover"],
    [library, "\\.note:hover"],
    [library, "\\.task-row:hover"],
    [shared, "\\.chrome-button:hover:not\\(:disabled\\)"],
    [shared, "\\.find-button:hover"],
  ] as const;

  const selected = [
    [library, "\\.branch-on"],
    [library, "\\.note-on"],
    [shared, "\\.chrome-button-open"],
    [shared, "\\.chrome-button:active:not\\(:disabled\\)"],
    [shared, "\\.palette-on"],
    [shared, "\\.header \\.tag-suggest button\\.tag-suggest-on"],
    [shared, "\\.context-menu-active:not\\(:disabled\\)"],
  ] as const;

  it("draws every hover with var(--hover)", () => {
    for (const [css, selector] of hover) {
      expect(rule(css, selector), selector).toMatch(/background:\s*var\(--hover\);/);
    }
  });

  it("draws every selected row with var(--selected)", () => {
    for (const [css, selector] of selected) {
      expect(rule(css, selector), selector).toMatch(/background:\s*var\(--selected\);/);
    }
  });

  it("keeps selection clearly darker than hover rather than one step along", () => {
    const alpha = (block: string, token: string): number =>
      Number(block.match(new RegExp(`${token}:\\s*rgba\\(127, 127, 127, ([0-9.]+)\\)`))?.[1]);
    // Both themes, because a state tint is an overlay and the two blocks each declare it.
    for (const block of [darkBlock, lightBlock]) {
      expect(alpha(block, "--selected")).toBeGreaterThan(alpha(block, "--hover") * 2);
    }
  });

  it("leaves exactly two grey overlays outside :root, both of them not UI state", () => {
    // The note's own table header row (document content, and it must not move the day a
    // hovered row is retuned) and the scan bar's fill (a progress bar is not a selection).
    const literals = (css: string): number =>
      css.split("\n").filter((line) => /^\s+background: rgba\(127, 127, 127/.test(line))
        .length;
    expect(literals(shared), "styles.css: only the table header row").toBe(1);
    expect(rule(shared, "\\.editor-content table tr:first-child td")).toMatch(
      /background:\s*rgba\(127, 127, 127, 0\.1\);/,
    );
    expect(literals(library), "library.css: only the scan fill").toBe(1);
    expect(rule(library, "\\.scan-fill")).toMatch(/background:\s*rgba\(127, 127, 127/);
  });
});

describe("styles: a field is a field in both windows", () => {
  const fields = [
    [shared, "\\.find-input"],
    [shared, "\\.link-prompt input"],
    [shared, "\\.ask input"],
    [shared, "\\.table-grid-cell"],
    [shared, "\\.wiki-link-thumb"],
    [shared, "\\.header input,\\n\\.header button"],
    [library, "\\.filter-search"],
    [library, "\\.notes-search input"],
    [library, "\\.task-scope"],
    [library, "\\.settings select"],
    [library, "\\.settings-row button"],
    [library, "\\.conflict-diff"],
  ] as const;

  it("fills every one of them with var(--field)", () => {
    for (const [css, selector] of fields) {
      expect(rule(css, selector), selector).toMatch(/background:\s*var\(--field\);/);
    }
  });

  it("fills a focused header field with the page colour instead", () => {
    // The one state that goes the other way: a field being typed in turns the colour of
    // the page. In the dark theme `--field` and `--background` are the same value and the
    // accent border is the whole signal, as it already is for `.ask input`.
    expect(rule(shared, "\\.header input:focus")).toMatch(/background:\s*var\(--background\);/);
  });

  it("names no token that does not exist", () => {
    // `var(--bg)` and `var(--fg)` both sat in this file for a while. Neither has ever been
    // declared, so both resolved to nothing and the rule they were in did nothing.
    const declared = new Set([
      ...(shared.match(/--[a-z-]+(?=:)/g) ?? []),
      ...(library.match(/--[a-z-]+(?=:)/g) ?? []),
    ]);
    for (const css of [shared, library]) {
      for (const used of css.match(/var\((--[a-z-]+)/g) ?? []) {
        const token = used.slice(4);
        // Set from JS rather than from a sheet: the list gutter's own width, and the two
        // pane widths `Library.tsx` writes onto the shell as an inline style.
        if (["--number-digits", "--tree-width", "--notes-width"].includes(token)) continue;
        expect(declared.has(token), `${token} is used but never declared`).toBe(true);
      }
    }
  });
});
