import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import { markdownOf, pressEnter, run, stateAt } from "./helpers/editing.js";

/**
 * Enter on an item that draws as blank, over every shape a list can be in.
 *
 * The report this file exists for was "sometimes it ends the list and sometimes it gives
 * you a second empty bullet, and there is no reliable way to reproduce it". A matrix is
 * the answer to that shape of report: it turns "sometimes" into a list of shapes that do
 * and do not work, and then the disagreement can be read rather than guessed at.
 *
 * `outline.test.ts` already pins the everyday cases; this is the awkward ones. Both press
 * Enter twice — once to make the blank item, once to act on it — because that is how a
 * blank item comes to exist in use, and it means each row also pins what the first press
 * does.
 */

const { doc, paragraph, bulletList, listItem, hardBreak } = schema.nodes;

/** Enter twice from the caret just after `needle`. */
function twice(markdown: string, needle: string): string {
  return markdownOf(run(run(stateAt(markdown, needle), pressEnter), pressEnter));
}

describe("Enter on a blank item ends the list", () => {
  const shapes: [string, string, string, string][] = [
    ["the only item", "- One\n", "One", "- One\n"],
    ["the last item of a list", "- One\n- Two\n", "Two", "- One\n- Two\n"],
    ["a nested list, one deep", "- One\n  - Two\n", "Two", "- One\n  - Two\n"],
    [
      "a nested list, three deep",
      "- One\n  - Two\n    - Three\n",
      "Three",
      "- One\n  - Two\n    - Three\n",
    ],
    [
      "a nested list whose parent has a later sibling",
      "- One\n  - Two\n- Three\n",
      "Two",
      "- One\n  - Two\n\n\n\n- Three\n",
    ],
    ["a task list", "- [ ] One\n", "One", "- [ ] One\n"],
    ["a starred item", "- ⭐ One\n", "One", "- ⭐ One\n"],
    ["a numbered list", "1. One\n", "One", "1. One\n"],
    ["a list inside a quote", "> - One\n", "One", "> - One\n>\n>\n"],
    ["a list under a heading", "# Kop\n\n- One\n", "One", "# Kop\n\n- One\n"],
  ];

  for (const [name, markdown, needle, expected] of shapes) {
    it(`from ${name}`, () => {
      expect(twice(markdown, needle)).toBe(expected);
    });
  }

  it("from the middle of a list, splitting it around the new line", () => {
    // Nothing nested follows, so the list ends here and picks up again below — the
    // empty paragraph between the halves is the new line the caret is on.
    expect(twice("- One\n- Two\n", "One")).toBe("- One\n\n\n\n- Two\n");
  });
});

/**
 * The part that used to shred an outline.
 *
 * `exitList` escapes by lifting repeatedly, and each lift splits the list it climbs out
 * of — so anything still to come at a nested level came up with it and landed at the top,
 * one list per level. The text survived and the structure did not.
 */
describe("Enter on a blank item never flattens what follows it", () => {
  it("keeps the levels of items below it in the same sublist", () => {
    // Was: "- One\n  - Two\n\n\n\n- Three\n" — Three promoted from level two to the top.
    expect(twice("- One\n  - Two\n  - Three\n", "Two")).toBe("- One\n  - Two\n-\n  - Three\n");
  });

  it("keeps the levels of items below it further up the outline", () => {
    // Was: "- A\n  - B\n    - C\n\n\n\n- D\n\n* E\n" — D and E both at the top, and as two
    // separate lists, since the serializer alternates the bullet to keep them apart.
    expect(twice("- A\n  - B\n    - C\n  - D\n- E\n", "C")).toBe(
      "- A\n  - B\n    - C\n  -\n  - D\n- E\n",
    );
  });

  it("climbs a level per press instead, so the list can still be left", () => {
    // Shift+Tab's step, and the only one that keeps the tail: the levels D belongs to
    // cannot be rebuilt once they have been left behind, so they are not left behind.
    let state = run(stateAt("- A\n  - B\n    - C\n  - D\n", "C"), pressEnter);
    state = run(state, pressEnter);
    expect(markdownOf(state)).toBe("- A\n  - B\n    - C\n  -\n  - D\n");

    state = run(state, pressEnter);
    expect(markdownOf(state)).toBe("- A\n  - B\n    - C\n-\n  - D\n");

    // And the last press does leave, D having come along one level at a time rather
    // than in one drop.
    state = run(state, pressEnter);
    expect(markdownOf(state)).toBe("- A\n  - B\n    - C\n\n\n\n- D\n");
  });
});

/**
 * The bug behind "no reliable way to reproduce".
 *
 * An item holding nothing but whitespace draws exactly like an empty one and answered
 * `content.size !== 0`, so Enter fell through to `splitListItem`. Typing a word on a
 * bullet and holding Backspace one press too few is all it takes, and the two cases are
 * indistinguishable on screen.
 */
describe("an item is blank when it draws blank", () => {
  function itemHolding(inline: PMNode): EditorState {
    const built = doc!.create(null, [
      bulletList!.create(null, [
        listItem!.create(null, [paragraph!.create(null, schema.text("One"))]),
        listItem!.create(null, [paragraph!.create(null, inline)]),
      ]),
    ]);
    return EditorState.create({
      schema,
      doc: built,
      selection: TextSelection.atEnd(built),
    });
  }

  it("ends the list from an item holding only spaces", () => {
    expect(markdownOf(run(itemHolding(schema.text("   ")), pressEnter))).toBe("- One\n");
  });

  it("leaves the caret on a line that is genuinely empty", () => {
    // The whitespace it forgave is still in the document until it is cleared, and a
    // caret sitting after two invisible spaces is not "the beginning of an empty line".
    const state = run(itemHolding(schema.text("  ")), pressEnter);
    expect(state.selection.$from.parent.textContent).toBe("");
    expect(state.selection.$from.parentOffset).toBe(0);
  });

  it("treats an item holding a hard break as content, not as blank", () => {
    // An empty second line is something Shift+Enter was pressed on purpose to make.
    expect(markdownOf(run(itemHolding(hardBreak!.create()), pressEnter))).toBe(
      "- One\n- \\\n\n-\n",
    );
  });
});

/** B72's star stands where a marker stood, so Enter carries on with that marker. */
describe("Enter after a starred item", () => {
  it("goes back to the checkbox in a checklist", () => {
    expect(markdownOf(run(stateAt("- [ ] One\n- ⭐ Two\n", "Two"), pressEnter))).toBe(
      "- [ ] One\n- ⭐ Two\n- [ ]\n",
    );
  });

  it("goes back to a plain bullet in a bulleted list", () => {
    expect(markdownOf(run(stateAt("- One\n- ⭐ Two\n", "Two"), pressEnter))).toBe(
      "- One\n- ⭐ Two\n-\n",
    );
  });

  it("looks past other starred items to find what the list is made of", () => {
    expect(markdownOf(run(stateAt("- [x] A\n- ⭐ B\n- ⭐ C\n", "C"), pressEnter))).toBe(
      "- [x] A\n- ⭐ B\n- ⭐ C\n- [ ]\n",
    );
  });

  it("falls back to a bullet when the star is the first item", () => {
    expect(markdownOf(run(stateAt("- ⭐ One\n", "One"), pressEnter))).toBe("- ⭐ One\n-\n");
  });

  it("never carries the star itself onto the next line", () => {
    for (const markdown of ["- [ ] One\n- ⭐ Two\n", "- One\n- ⭐ Two\n", "- ⭐ One\n"]) {
      const needle = markdown.includes("Two") ? "Two" : "One";
      expect(markdownOf(run(stateAt(markdown, needle), pressEnter))).not.toContain("⭐ \n");
    }
  });
});
