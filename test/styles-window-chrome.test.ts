import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The two windows edit the same note with the same editor, and their chrome says so.
 *
 * Four reports in one batch, and they are one report: the library's note editor and the
 * capture window had drifted apart everywhere the two touch. Header and footer strips
 * shaded in one window and not in the other; a row of three buttons in one and two buttons
 * plus a piece of clickable status text in the other, at a different size, radius and
 * colour.
 *
 * jsdom has no cascade and no layout, so this reads the stylesheets as text — the same
 * limitation and the same shape as `styles-title-field.test.ts`, which pins the one
 * control that had already been through this. What is worth pinning is not the pixel
 * values but that **one rule serves both windows**: a copy is what produced the drift, and
 * a copy is what a later edit would reintroduce.
 *
 * `styles.css` is read together with `library.css` where the question is about the library
 * window, because that window's cascade is both files — `styles-overlay.test.ts`'s rule.
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

describe("styles: the note editor's chrome is shaded like the capture window's", () => {
  it("puts the reader's header and footer on the panel colour", () => {
    // `--surface` is what `.titlebar`, `.header` and `.statusbar` in `styles.css` have
    // always used — white in the light theme, the lighter panel in the dark one. The
    // library's two strips had no background at all, so the writing surface between them
    // did not read as a page.
    expect(rule(library, "\\.reader-header")).toMatch(/background:\s*var\(--surface\);/);
    expect(rule(library, "\\.reader-footer")).toMatch(/background:\s*var\(--surface\);/);
  });

  it("shades the note list's header with them, and leaves the list itself alone", () => {
    // The two headers sit side by side at the top of the window; one on the panel colour
    // beside one that is not reads as a mistake rather than as a distinction. The list
    // below stays on `--background` — it is a list of things, not a surface, and the
    // selected row's own highlight is what has to stand out in it.
    expect(rule(library, "\\.notes-header")).toMatch(/background:\s*var\(--surface\);/);

    const notes = rule(library, "\\.notes");
    expect(notes).not.toMatch(/background:\s*var\(--surface\);/);
  });
});

describe("styles: [Insert] [Actions] [Help] is one rule for both windows", () => {
  it("names both windows' groups in the shared stylesheet", () => {
    // In `styles.css` and not `library.css`, because only one of the two windows loads
    // that file — the same reason `.title-field`, `.palette` and `.ask` are here.
    const group = rule(shared, "\\.reader-actions,\\s*\\n\\.capture-actions");
    expect(group).toMatch(/display:\s*flex;/);

    const buttons = rule(shared, "\\.reader-actions button,\\s*\\n\\.capture-actions button");
    expect(buttons).toMatch(/font-size:\s*12px;/);
    expect(buttons).toMatch(/border:\s*1px solid var\(--border\);/);
    expect(buttons).toMatch(/border-radius:\s*5px;/);
    expect(buttons).toMatch(/padding:\s*3px 9px;/);
  });

  it("names the colour rather than inheriting it, so the status bar cannot grey them", () => {
    // `color: inherit` is what the library's own rule said, and in the library it is
    // right: `.reader-footer` sets no colour. The capture window's `.statusbar` sets
    // `--muted` for the status text in it, so the very same declaration would draw these
    // three grey — and a `.statusbar .capture-actions button` fix would then outrank the
    // plain `:hover` below it, which is the cascade defeating correct-looking CSS in the
    // way this codebase keeps a list of.
    const buttons = rule(shared, "\\.reader-actions button,\\s*\\n\\.capture-actions button");
    expect(buttons).toMatch(/color:\s*var\(--text\);/);
    expect(buttons).not.toMatch(/color:\s*inherit;/);
  });

  it("leaves no second opinion behind in the library's own stylesheet", () => {
    // The drift came from two copies of one control's rule. One copy is the fix; a rule
    // here naming `.reader-actions` is the drift starting again.
    expect(library).not.toMatch(/^\.reader-actions/m);
  });

  it("has dropped the capture window's own two button classes", () => {
    // `.help-button` and `.insert-button` were the drift: 11px against 12px, a 4px radius
    // against 5px, `--muted` text, and a Help button with no border at rest beside two
    // that had one.
    expect(shared).not.toContain(".help-button");
    expect(shared).not.toContain(".insert-button");
  });
});

describe("styles: the capture window's title placeholder", () => {
  it("is dimmer than every other placeholder in that window", () => {
    // It is the only one drawn at 17px and bold, where `--muted` carries as much ink as
    // real text does at the header's 13px — so an empty title read as a filled-in one.
    // Two classes deep for `.title-field`'s own reason: `.header input::placeholder` is
    // one class and one element, and would otherwise win.
    const dimmed = rule(shared, "\\.header \\.title-field::placeholder");
    expect(dimmed).toMatch(/opacity:\s*0\.\d+;/);
  });
});
