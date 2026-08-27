import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * B88's one lever: the note is drawn at `--editor-font-size` and everything inside it is
 * expressed against that.
 *
 * The point of the setting is that the whole note moves together — a heading has to shrink
 * by the same proportion the body does — and the only thing that guarantees it is that no
 * rule inside `.editor-content` states a size in pixels. That was already true before the
 * setting existed, by accident of good taste rather than by rule, which is exactly the kind
 * of property that quietly stops being true. So it is asserted rather than assumed.
 *
 * Read as text: jsdom has no cascade, and this is a question about what the sheet says.
 */

const source = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

/**
 * The sheet with its comments taken out.
 *
 * Not tidiness: this file's comments quote selectors and values back at the reader — the
 * `:root` declaration below explains itself by naming `.editor-content` — and a regex over
 * the raw text matches the prose as readily as the rules.
 */
const shared = source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the note's own text size", () => {
  it("is declared once, in `:root`, so nothing reads an undeclared token", () => {
    const root = shared.slice(shared.indexOf(":root {"), shared.indexOf("}"));
    expect(root).toMatch(/--editor-font-size:\s*16px;/);
  });

  it("is what `.editor-content` is drawn at", () => {
    const editor = shared.match(/\.editor-content \{[^}]*\}/)![0];
    expect(editor).toMatch(/font-size:\s*var\(--editor-font-size\);/);
  });

  it("leaves no pixel size anywhere in the note's own text", () => {
    // Every `font-size` under `.editor-content` has to be relative, or that rule keeps its
    // size while everything around it moves — a heading pinned at 24px in a note set to 13
    // is the setting half working.
    //
    // One rule is exempt and is named rather than pattern-matched away: `.table-tool` is
    // the table toolbar's buttons, chrome that is drawn inside the document only because
    // that is where the table is. Naming it is the point — a second exception has to be
    // added here, in front of somebody, rather than slipped past a looser regex.
    const CHROME = [".editor-content .table-tool"];

    const blocks = [...shared.matchAll(/(\.editor-content[^{]*)\{([^}]*)\}/g)].map(
      (match) => [match[1]!.trim(), match[2]!] as const,
    );
    const sizes = blocks
      .filter(([selector]) => !CHROME.includes(selector))
      .flatMap(([selector, body]) =>
        [...body.matchAll(/font-size:\s*([^;]+);/g)].map((m) => [selector, m[1]!] as const),
      );

    expect(sizes.length).toBeGreaterThan(4);
    for (const [selector, value] of sizes) {
      expect(value, `${selector} states an absolute size (${value})`).toMatch(
        /^(var\(--editor-font-size\)|[\d.]+em)$/,
      );
    }
  });

  it("does not scale the window around the note", () => {
    // Chrome is chrome at any note size. The title field is the nearest thing to the note
    // that is still not part of it, and it stays where it is.
    const title = shared.match(/\.header \.title-field,[^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(title).toContain("font-size: 17px;");
  });
});
