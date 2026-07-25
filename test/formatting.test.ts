import { describe, expect, it } from "vitest";
import {
  indent,
  outdent,
  setHeading,
  setParagraph,
  toggleCode,
  toggleEm,
  toggleHighlight,
  toggleStrike,
  toggleStrong,
  toggleUnderline,
} from "../src/renderer/editor/commands.js";
import { markdownOf, run, stateAt, stateSelecting } from "./helpers/editing.js";

/**
 * Every shortcut from the table in 01-functioneel-ontwerp.md, checked through the
 * markdown it produces. Underline and highlight are the interesting ones: markdown has
 * no syntax for either, so they are exactly where a naive editor loses formatting.
 */

describe("inline formatting", () => {
  const cases: Array<[string, Parameters<typeof run>[1], string]> = [
    ["bold", toggleStrong, "Een **woord** hier\n"],
    ["italic", toggleEm, "Een *woord* hier\n"],
    ["underline", toggleUnderline, "Een <u>woord</u> hier\n"],
    ["highlight", toggleHighlight, "Een ==woord== hier\n"],
    ["strikethrough", toggleStrike, "Een ~~woord~~ hier\n"],
    ["code", toggleCode, "Een `woord` hier\n"],
  ];

  for (const [name, command, expected] of cases) {
    it(`applies ${name}`, () => {
      const state = stateSelecting("Een woord hier\n", "woord");
      expect(markdownOf(run(state, command))).toBe(expected);
    });
  }

  it("removes formatting when pressed again", () => {
    const state = stateSelecting("Een **woord** hier\n", "woord");
    expect(markdownOf(run(state, toggleStrong))).toBe("Een woord hier\n");
  });

  it("nests in the fixed order, outermost first", () => {
    // Marks are an unordered set in ProseMirror; the serializer imposes the order, so
    // applying them the other way round must still produce the same file.
    const bold = run(stateSelecting("Een woord hier\n", "woord"), toggleStrong);
    const both = run(bold, toggleUnderline);
    expect(markdownOf(both)).toBe("Een <u>**woord**</u> hier\n");
  });
});

describe("block formatting", () => {
  it("makes a heading", () => {
    const state = stateAt("Besluiten\n", "Besluiten");
    expect(markdownOf(run(state, setHeading(2)))).toBe("## Besluiten\n");
  });

  it("goes back to normal text", () => {
    const state = stateAt("## Besluiten\n", "Besluiten");
    expect(markdownOf(run(state, setParagraph))).toBe("Besluiten\n");
  });

  it("indents outside a list as a quote, which is all markdown offers", () => {
    const state = stateAt("Een alinea\n", "alinea");
    expect(markdownOf(run(state, indent))).toBe("> Een alinea\n");
  });

  it("outdents that quote again", () => {
    const state = stateAt("> Een alinea\n", "alinea");
    expect(markdownOf(run(state, outdent))).toBe("Een alinea\n");
  });

  it("indents a list item rather than quoting it", () => {
    const state = stateAt("- One\n- Two\n", "Two");
    expect(markdownOf(run(state, indent))).toBe("- One\n  - Two\n");
  });
});
