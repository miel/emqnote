import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A2/A3: regression guards over `styles.css` itself, since nothing under `test/`
 * loads the stylesheet into a real layout engine to assert on computed styles (jsdom
 * has none) — these are plain text checks that the rules this batch added or changed
 * are still there, so a later edit cannot silently drop them.
 *
 * A2 — the task-flash highlight has its own `--task-highlight` variable, deliberately
 * not `--highlight` (the `==mark==` colour): reusing it would make a transient click
 * flash indistinguishable from a real highlight mark in a note that has both.
 *
 * A3 — attachment chips (`.wiki-embed`, `.wiki-link`, `.wiki-embed-image`,
 * `.wiki-link-thumb`) all got a visible `border`, and the `.ProseMirror-selectednode`
 * outline — previously only `.wiki-embed`/`.wiki-embed-image` — now also covers
 * `.wiki-link`, so selecting a PDF/file chip is no longer invisible.
 */

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("styles.css: task highlight colour (A2)", () => {
  it("defines --task-highlight in both the dark (:root) and light theme blocks", () => {
    const [rootBlock] = css.split("@media (prefers-color-scheme: light)");
    const lightBlock = css.slice(css.indexOf("@media (prefers-color-scheme: light)"));
    expect(rootBlock).toMatch(/--task-highlight:\s*#[0-9a-fA-F]{3,8};/);
    expect(lightBlock).toMatch(/--task-highlight:\s*#[0-9a-fA-F]{3,8};/);
  });

  it("does not reuse --highlight, the ==mark== colour, for the task highlight", () => {
    const rule = css.match(/\.editor-content \.task-highlight \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toContain("--task-highlight");
    expect(rule).not.toMatch(/var\(--highlight\)/);
  });

  it("keeps the task highlight at roughly 50% transparency", () => {
    const rule = css.match(/\.editor-content \.task-highlight \{[^}]*\}/)?.[0];
    expect(rule).toMatch(/color-mix\(in srgb, var\(--task-highlight\) 50%, transparent\)/);
  });
});

describe("styles.css: attachment chip borders (A3)", () => {
  it("gives .wiki-embed/.wiki-link a visible border", () => {
    const rule = css.match(/\.editor-content \.wiki-embed,\s*\n\.editor-content \.wiki-link \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/border:\s*1px solid var\(--border\);/);
  });

  it("gives .wiki-embed-image a visible border", () => {
    const rule = css.match(/\.editor-content \.wiki-embed-image \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/border:\s*1px solid var\(--border\);/);
  });

  it("gives .wiki-link-thumb a visible border", () => {
    const rule = css.match(/\.editor-content \.wiki-link-thumb \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/border:\s*1px solid var\(--border\);/);
  });

  /**
   * `.wiki-embed-image-box` joined the list when the picture gained a wrapper it can be
   * replaced inside (the missing-attachment chip): ProseMirror puts the class on the
   * NodeView's own DOM, which is now the wrapper rather than the `<img>`, so leaving it
   * out would have brought back exactly the invisible selection this rule exists to fix.
   */
  it("extends the ProseMirror-selectednode outline to .wiki-link, not only the image chips", () => {
    const selector = css.match(
      /\.editor-content \.wiki-embed\.ProseMirror-selectednode,\s*\n\.editor-content \.wiki-embed-image\.ProseMirror-selectednode,\s*\n\.editor-content \.wiki-embed-image-box\.ProseMirror-selectednode,\s*\n\.editor-content \.wiki-link\.ProseMirror-selectednode \{/,
    );
    expect(selector).not.toBeNull();
  });
});
