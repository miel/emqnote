import { describe, expect, it } from "vitest";
import {
  backspace,
  softBreak,
  tabIndent,
  tabOutdent,
  toggleBulletList,
  toggleOrderedList,
} from "../src/renderer/editor/commands.js";
import {
  markdownOf,
  pressBackspace,
  pressEnter,
  run,
  stateAt,
  stateAtStartOf,
  stateOnEmptyLineAfter,
  type,
} from "./helpers/editing.js";

/**
 * The acceptance criterion of phase 2, and the reason the project exists.
 *
 * Obsidian was abandoned over outlines: a mix of bullets and numbering, several levels
 * deep, with paragraphs indented underneath a bullet. Everything here is that shape.
 */

describe("Tab and Shift+Tab", () => {
  it("indents from anywhere inside the item, not just at its start", () => {
    // The caret sits in the middle of the word. In most editors Tab then inserts a
    // tab character or moves focus; here it has to indent the item.
    const state = stateAt("- One\n- Two\n", "Tw");
    expect(markdownOf(run(state, tabIndent))).toBe("- One\n  - Two\n");
  });

  it("outdents again", () => {
    const state = stateAt("- One\n  - Two\n", "Tw");
    expect(markdownOf(run(state, tabOutdent))).toBe("- One\n- Two\n");
  });

  it("does nothing at the first item, which has nothing to nest under", () => {
    const state = stateAt("- One\n- Two\n", "On");
    expect(markdownOf(run(state, tabIndent))).toBe("- One\n- Two\n");
  });

  it("always consumes the key inside a list, even when it cannot indent", () => {
    // Pressing Tab twice used to walk the caret out of the note and into the header
    // fields: the second press failed, returned false, and the browser moved focus.
    let consumed = false;
    const state = stateAt("- One\n- Two\n", "On");
    consumed = tabIndent(state, () => {});
    expect(consumed).toBe(true);

    consumed = tabOutdent(stateAt("Gewone alinea\n", "alinea"), () => {});
    expect(consumed).toBe(true);
  });

  it("indents an empty line after a list into that list item", () => {
    // Finish a bullet, press Enter twice to leave the list, then Tab: the paragraph
    // belongs under that bullet. That is the "paragraph indented beneath a bullet"
    // shape the design document calls the ordinary way work notes are written, and
    // there was simply no key for it.
    let state = stateOnEmptyLineAfter("- Budget is akkoord\n");
    state = run(state, tabIndent);
    state = type(state, "Bevestigd door Els.");

    expect(markdownOf(state)).toBe(
      "- Budget is akkoord\n\n  Bevestigd door Els.\n",
    );
  });

  it("still works six levels down", () => {
    const deep =
      "- L1\n  - L2\n    - L3\n      - L4\n        - L5\n          - L6a\n          - L6b\n";

    // Indenting the second item at level six turns it into level seven.
    const indented = run(stateAt(deep, "L6b"), tabIndent);
    expect(markdownOf(indented)).toBe(
      "- L1\n  - L2\n    - L3\n      - L4\n        - L5\n          - L6a\n            - L6b\n",
    );

    // And back out again, all the way to the top.
    let state = stateAt(deep, "L6b");
    for (let level = 0; level < 5; level += 1) state = run(state, tabOutdent);
    expect(markdownOf(state)).toBe(
      "- L1\n  - L2\n    - L3\n      - L4\n        - L5\n          - L6a\n- L6b\n",
    );
  });
});

describe("mixing bullets and numbering", () => {
  it("retypes an existing list instead of nesting a new one", () => {
    // This is what makes a mixed outline possible at all: asking for numbering inside
    // a bulleted list has to change that list, not wrap another one around it.
    const state = stateAt("- One\n  - Two\n", "Two");
    expect(markdownOf(run(state, toggleOrderedList))).toBe("- One\n  1. Two\n");
  });

  it("leaves the surrounding levels alone", () => {
    const state = stateAt("1. One\n   - Two\n   - Three\n", "Two");
    expect(markdownOf(run(state, toggleOrderedList))).toBe(
      "1. One\n   1. Two\n   2. Three\n",
    );
  });

  it("removes the list when the same kind is pressed again", () => {
    const state = stateAt("- One\n", "One");
    expect(markdownOf(run(state, toggleBulletList))).toBe("One\n");
  });

  it("turns a plain paragraph into a list", () => {
    const state = stateAt("Just text\n", "Just");
    expect(markdownOf(run(state, toggleBulletList))).toBe("- Just text\n");
  });

  it("builds the shape from the design document", () => {
    let state = stateAt("1. Voorbereiding\n2. Uitvoering\n", "Uitvoering");
    state = run(state, tabIndent);
    state = run(state, toggleBulletList);

    expect(markdownOf(state)).toBe("1. Voorbereiding\n   - Uitvoering\n");
  });
});

describe("Enter", () => {
  it("starts a new item at the same level", () => {
    const state = stateAt("- One\n", "One");
    expect(markdownOf(run(state, pressEnter))).toBe("- One\n-\n");
  });

  it("ends the list from an empty item, in one press", () => {
    // Not one level at a time. Escaping a list nested three deep used to take three
    // presses and felt like the list refusing to end. Shift+Tab is the key for
    // promoting a single level, so nothing is lost.
    // The file shows just the list: you are now on an empty paragraph below it, and
    // an empty paragraph at the end is residue rather than content.
    const state = stateAt("- One\n  - Two\n", "Two");
    const afterFirst = run(state, pressEnter);
    expect(markdownOf(run(afterFirst, pressEnter))).toBe("- One\n  - Two\n");
  });

  it("ends the list at the top level too", () => {
    const state = stateAt("- One\n", "One");
    const afterFirst = run(state, pressEnter);
    expect(markdownOf(run(afterFirst, pressEnter))).toBe("- One\n");
  });

  it("ends a list nested three deep in one press", () => {
    const deep = "- One\n  - Two\n    - Three\n";
    const blank = run(stateAt(deep, "Three"), pressEnter);
    expect(markdownOf(run(blank, pressEnter))).toBe(deep);
  });
});

describe("Backspace at the start of a list item", () => {
  it("promotes a nested item rather than merging it into the one above", () => {
    // The default joined the item into the previous one as a second paragraph: the
    // text stayed indented, the bullet vanished, and the caret sat in neither item.
    const state = stateAtStartOf("- One\n  - Two\n", "Two");
    expect(markdownOf(run(state, pressBackspace))).toBe("- One\n- Two\n");
  });

  it("takes a top-level item out of the list", () => {
    const state = stateAtStartOf("- One\n- Two\n", "Two");
    expect(markdownOf(run(state, pressBackspace))).toBe("- One\n\nTwo\n");
  });

  it("does not claim the key in the middle of a line", () => {
    // Deleting a character is native browser behaviour rather than a command, so the
    // point here is only that our handler declines and lets it through.
    const state = stateAt("- One\n- Two\n", "Tw");
    expect(backspace(state, () => {})).toBe(false);
  });
});

describe("Shift+Enter", () => {
  it("adds a soft break inside the same item", () => {
    const state = stateAt("- Adres\n", "Adres");
    expect(markdownOf(run(state, softBreak))).toBe("- Adres\\\n");
  });

  it("adds a soft break inside a paragraph", () => {
    const state = stateAt("Aanwezig\n", "Aanwezig");
    expect(markdownOf(run(state, softBreak))).toBe("Aanwezig\\\n");
  });
});
