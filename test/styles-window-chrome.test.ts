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
 *
 * Three more of the same kind arrived a batch later, from the same day of use: the search
 * strip and the note's own When/Where/Tags/Who block were the two surfaces at the top of
 * the library that the first pass had left off, and the capture window's footer turned out
 * to have no left-hand group at all — which is why its buttons stood in the middle of the
 * bar where the library's stand at the end of it.
 *
 * The pane-consistency pass finished the argument rather than adding to it. The strips are
 * `.pane-header` and `.pane-footer` now — one rule each, four bands, two windows — and
 * every button in either window's chrome is `.chrome-button`. So what this file pins has
 * not changed; there is simply less of it, which is the point.
 */

const shared = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const library = readFileSync(
  new URL("../src/renderer/library/library.css", import.meta.url),
  "utf8",
);
const capture = readFileSync(new URL("../src/renderer/Capture.tsx", import.meta.url), "utf8");
const libraryPane = readFileSync(
  new URL("../src/renderer/library/Library.tsx", import.meta.url),
  "utf8",
);

const rule = (css: string, selector: string): string => {
  const found = css.match(new RegExp(`${selector} \\{[^}]*\\}`))?.[0];
  expect(found, `no rule found for ${selector}`).toBeDefined();
  return found!;
};

describe("styles: one header band and one footer band, in both windows", () => {
  it("shades and sizes them once, in the shared stylesheet", () => {
    // `--surface` is what `.header` and `.statusbar` have always used — the grey framing
    // the page in the light theme, the lighter panel in the dark one (B87; in the light
    // theme it was white until then, which is what made this whole distinction invisible
    // there). What changed with the pane-consistency pass is that there is now exactly
    // one rule saying so, for four bands across two windows, rather than four that agreed.
    const header = rule(shared, "\\.pane-header");
    expect(header).toMatch(/background:\s*var\(--surface\);/);
    expect(header).toMatch(/border-bottom:\s*1px solid var\(--border\);/);

    const footer = rule(shared, "\\.pane-footer");
    expect(footer).toMatch(/background:\s*var\(--surface\);/);
    expect(footer).toMatch(/border-top:\s*1px solid var\(--border\);/);
  });

  it("leaves the library's own sheet no second opinion about either band", () => {
    // The drift this file exists for came from two copies of one control's rule. The
    // library may still say what is *particular* to a pane — the reader's 12px inset is
    // here, because the note body below it is indented and the tree's is not — but a
    // background, a height or a border here is the drift starting again.
    for (const selector of ["\\.reader-header", "\\.reader-footer"]) {
      const own = rule(library, selector);
      expect(own, selector).not.toMatch(/background:/);
      expect(own, selector).not.toMatch(/height:/);
      expect(own, selector).not.toMatch(/border-(top|bottom):/);
    }
  });

  it("leaves the note list itself on the page colour", () => {
    // The list below the band stays on `--background` — it is a list of things, not a
    // surface, and the selected row's own highlight is what has to stand out in it.
    expect(rule(library, "\\.notes")).not.toMatch(/background:\s*var\(--surface\);/);
  });

  it("puts the search field on the band rather than making a strip of its own", () => {
    // It used to be a `--surface` strip under the headers, which is the row that is gone:
    // the field sits *in* the note list's heading now. So it must carry no background at
    // all — a second `--surface` inside the band would draw a box around the field.
    const search = rule(library, "\\.notes-search");
    expect(search).not.toMatch(/background:/);
    // And it must opt out of the drag region, or a press meant for the box moves the
    // frameless window instead.
    expect(search).toMatch(/-webkit-app-region:\s*no-drag;/);
  });

  it("puts the note's own fields on the same surface in both windows", () => {
    // When, Where, Tags and Who are the note's chrome, not its body. In the capture window
    // `.header` around them has always been `--surface`; in the library the same block was
    // `transparent` and sat on `.reader-body`'s `--background`, so the one component that
    // is literally shared drew itself two different colours.
    const block = rule(library, "\\.header-reader");
    expect(block).toMatch(/background:\s*var\(--surface\);/);
    expect(block).not.toMatch(/background:\s*transparent;/);
    expect(rule(shared, "\\.header")).toMatch(/background:\s*var\(--surface\);/);
  });

  it("is drawn by the two components, in both windows' markup", () => {
    // A rule naming a class nothing wears is the silent failure this file exists for, one
    // step earlier than the cascade: it passes every text check about the stylesheet and
    // changes nothing on screen. Both windows have to be reading the same two components,
    // or the shared rules above are a description of one window.
    expect(capture).toContain("<PaneHeader");
    expect(capture).toContain("<PaneFooter");
    expect(libraryPane).toContain("<PaneHeader");
    expect(libraryPane).toContain("<PaneFooter");
  });
});

describe("styles: every button in the chrome is one rule for both windows", () => {
  it("names the shape once, in the shared stylesheet", () => {
    // In `styles.css` and not `library.css`, because only one of the two windows loads
    // that file — the same reason `.title-field`, `.palette` and `.ask` are here. This
    // began as `.reader-actions button`; it is now the tree's icons, the note list's
    // search and New note, the sort chooser, Insert, Actions and Help.
    const button = rule(shared, "\\.chrome-button");
    expect(button).toMatch(/font-size:\s*13px;/);
    expect(button).toMatch(/border-radius:\s*4px;/);
    expect(button).toMatch(/height:\s*26px;/);

    // The border is 1px *transparent* at rest, not absent: hover gives it a colour rather
    // than a width, so nothing moves under the pointer. That is the whole reason the rest
    // state names a border at all.
    expect(button).toMatch(/border:\s*1px solid transparent;/);
    expect(rule(shared, "\\.chrome-button:hover:not\\(:disabled\\)")).toMatch(
      /border-color:\s*var\(--border\);/,
    );
  });

  it("names the colour rather than inheriting it, so the footer cannot grey them", () => {
    // `color: inherit` is what the library's own rule said, and in the library it was
    // right: its footer set no colour. `.pane-footer` sets `--muted` for the status text
    // in it, so the very same declaration would draw these grey — and a
    // `.pane-footer .chrome-button` fix would then outrank the plain `:hover`, which is
    // the cascade defeating correct-looking CSS in the way this codebase keeps a list of.
    const button = rule(shared, "\\.chrome-button");
    expect(button).toMatch(/color:\s*var\(--text\);/);
    expect(button).not.toMatch(/color:\s*inherit;/);
  });

  it("has exactly three sizes, and the two smaller ones are modifiers", () => {
    // 26px header icon, 26px header labelled, 20px footer. A fourth size is how a button
    // language stops being one, so the sizes are modifiers on the one rule rather than
    // rules of their own.
    expect(rule(shared, "\\.chrome-button-icon")).toMatch(/width:\s*26px;/);
    expect(rule(shared, "\\.chrome-button-small")).toMatch(/height:\s*20px;/);
  });

  it("leaves no second opinion behind in the library's own stylesheet", () => {
    // The drift came from two copies of one control's rule. One copy is the fix; a rule
    // here naming any of the five the pass replaced is the drift starting again.
    for (const gone of [".reader-actions", ".notes-sort", ".notes-actions", ".tree-toolbar"]) {
      expect(library, gone).not.toContain(`\n${gone} {`);
    }
    // `.new-note` survives as a handle for `--click-button` and the tests, and must stay
    // exactly that: a rule for it would be a sixth idea about what a button looks like.
    expect(library).not.toContain("\n.new-note {");
  });

  it("gives the status text at the other end of the bar one rule as well", () => {
    // `.pane-footer` is `space-between`, which distributes however many children it is
    // given: four loose ones put the buttons somewhere in the middle of the bar instead
    // of against its right edge. Grouping the status text makes it the two children that
    // rule is for. It was `.reader-status, .capture-status` — one rule under two names,
    // which is one name too many.
    const group = rule(shared, "\\.pane-status");
    expect(group).toMatch(/display:\s*flex;/);
    // `min-width: 0` is what lets a long file name ellipsis inside this group instead of
    // pushing the buttons off the right edge — the group beside it does not give way.
    expect(group).toMatch(/min-width:\s*0;/);
    expect(library).not.toMatch(/^\.reader-status/m);
  });

  it("has dropped the capture window's own two button classes", () => {
    // `.help-button` and `.insert-button` were the drift: 11px against 12px, a 4px radius
    // against 5px, `--muted` text, and a Help button with no border at rest beside two
    // that had one.
    expect(shared).not.toContain(".help-button");
    expect(shared).not.toContain(".insert-button");
    // And the title bar the capture window used to draw itself, buttons and all: the
    // window controls are the platform's on both platforms now (`capture-window.ts`).
    expect(shared).not.toContain(".titlebar-button");
  });
});

describe("styles: the capture window's title placeholder", () => {
  it("is dimmer than every other placeholder in that window", () => {
    // It is the only one drawn at 17px and bold, where `--muted` carries as much ink as
    // real text does at the header's 13px — so an empty title read as a filled-in one.
    // Two classes deep for `.title-field`'s own reason, and on `.pane-header` for that
    // rule's other reason: spelled `.header` it stopped matching when B92 moved the field
    // into the band, and an undimmed placeholder at 15px/600 is exactly the filled-in
    // -looking empty title the dimming exists to answer.
    const dimmed = rule(shared, "\\.pane-header \\.title-field::placeholder");
    expect(dimmed).toMatch(/opacity:\s*0\.\d+;/);
  });
});
