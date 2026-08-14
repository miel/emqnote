import { describe, expect, it } from "vitest";
import { Slice } from "prosemirror-model";
import { clipboardText } from "../src/renderer/editor/clipboard-text.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * What lands on the clipboard as `text/plain`.
 *
 * The report: copy a list, paste it somewhere that is not a rich-text field, and every
 * bullet, number and box is gone — just the lines of text. ProseMirror's default
 * serializer is `textBetween`, which knows nothing about structure, and pasting a
 * checklist into a mail or a ticket is the routine this app replaces.
 *
 * Every case is written as the markdown it came from and expects the same shape back.
 * That is not because the clipboard holds markdown — it holds plain text, unescaped —
 * but because for lists the two happen to agree, which is precisely what makes the
 * output readable at the far end whether or not anything renders it.
 */
function copy(markdown: string): string {
  const doc = docFromMarkdown(markdown);
  return clipboardText(new Slice(doc.content, 0, 0));
}

describe("copying a list", () => {
  it("keeps the bullets", () => {
    expect(copy("- One\n- Two\n")).toBe("- One\n- Two");
  });

  it("keeps the numbers, counting from the list's own start", () => {
    expect(copy("1. One\n2. Two\n")).toBe("1. One\n2. Two");
  });

  it("keeps the boxes, ticked and not", () => {
    expect(copy("- [ ] Bel Jan\n- [x] Klaar\n")).toBe("- [ ] Bel Jan\n- [x] Klaar");
  });

  it("keeps an empty box", () => {
    expect(copy("- [ ]\n")).toBe("- [ ]");
  });

  it("indents nested levels under the marker above them", () => {
    expect(copy("- One\n  - Nested\n    1. Deep\n")).toBe("- One\n  - Nested\n    1. Deep");
  });

  it("indents under a number by the width of the number", () => {
    // Three characters of `1. `, so the sublist starts at column three — which is what
    // makes the levels line up rather than merely step in by some amount.
    expect(copy("1. One\n   - a\n   - b\n2. Two\n")).toBe("1. One\n   - a\n   - b\n2. Two");
  });

  it("hangs a second paragraph under its item", () => {
    expect(copy("- One\n\n  Second\n- Two\n")).toBe("- One\n\n  Second\n- Two");
  });
});

describe("copying anything else", () => {
  it("leaves a paragraph as its text", () => {
    expect(copy("Gewone alinea\n")).toBe("Gewone alinea");
  });

  it("puts a blank line between blocks, and before a list", () => {
    expect(copy("Alinea\n\n- One\n")).toBe("Alinea\n\n- One");
  });

  it("keeps a heading's text without its hashes", () => {
    // Plain text, not markdown: `#` would be noise in a mail, and unlike a bullet it
    // carries nothing a reader cannot see from the line standing on its own.
    expect(copy("## Kop\n\nTekst\n")).toBe("Kop\n\nTekst");
  });

  it("does not escape what markdown would escape", () => {
    expect(copy("- Zie \\[1] hierboven\n")).toBe("- Zie [1] hierboven");
  });
});

describe("copying a table", () => {
  it("writes it as pipes, one line per row", () => {
    // One line per *cell* is what fell out before a rectangle of cells could be copied
    // (B49), and it left nothing on the clipboard saying it had ever been a table.
    expect(copy("| a | b |\n| --- | --- |\n| c | d |\n")).toBe("| a | b |\n| c | d |");
  });

  it("leaves out the delimiter row", () => {
    // Plain text, not markdown — the same reason a heading loses its hashes above. A row
    // of dashes in a chat window is noise.
    expect(copy("| a |\n| :--- |\n| b |\n")).toContain("| a |");
    expect(copy("| a |\n| :--- |\n| b |\n")).not.toContain("---");
  });

  it("flattens a soft break inside a cell, so a row stays one line", () => {
    expect(copy("| a<br>b | c |\n| --- | --- |\n| d | e |\n")).toBe("| a b | c |\n| d | e |");
  });
});
