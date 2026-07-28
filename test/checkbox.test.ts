import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import {
  toggleChecked,
  toggleOrderedList,
  toggleTask,
} from "../src/renderer/editor/commands.js";
import { TASK_RULES } from "../src/renderer/editor/state.js";
import {
  caretAfter,
  docFromMarkdown,
  markdownOf,
  pressEnter,
  run,
  stateAt,
  type,
} from "./helpers/editing.js";

/**
 * The checkbox affordances.
 *
 * The data path — parsing, serializing, round-tripping `- [x] ` — was already right and
 * is covered by the corpus. Everything here is about there finally being a *way* to
 * make and tick one from inside the editor, so every case ends in markdown: a command
 * that produces a shape the serializer cannot write would pass a structural assertion
 * and still be a bug.
 *
 * Where a case ends on a fresh item, the test types into it first. An *empty* task item
 * serializes as a bare `-` — remark drops the checkbox when there is nothing to tick —
 * so asserting on the empty item would be asserting on nothing.
 */

/** A selection running from inside one item to inside a later one. */
function across(markdown: string, from: string, to: string): EditorState {
  const doc = docFromMarkdown(markdown);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, caretAfter(doc, from), caretAfter(doc, to)),
  });
}

describe("toggleTask", () => {
  it("turns a plain paragraph into a task list", () => {
    const after = run(stateAt("Iets doen\n", "Iets"), toggleTask);
    expect(markdownOf(after)).toBe("- [ ] Iets doen\n");
  });

  it("turns an existing bullet into a task", () => {
    const after = run(stateAt("- Iets doen\n", "Iets"), toggleTask);
    expect(markdownOf(after)).toBe("- [ ] Iets doen\n");
  });

  it("takes the box off again, back to a plain bullet", () => {
    const once = run(stateAt("- Iets doen\n", "Iets"), toggleTask);
    const twice = run(
      EditorState.create({
        schema,
        doc: once.doc,
        selection: TextSelection.create(once.doc, caretAfter(once.doc, "Iets")),
      }),
      toggleTask,
    );
    expect(markdownOf(twice)).toBe("- Iets doen\n");
  });

  it("works three levels deep, and touches only that item", () => {
    const source = "- Een\n  - Twee\n    - Drie\n";
    const after = run(stateAt(source, "Drie"), toggleTask);
    expect(markdownOf(after)).toBe("- Een\n  - Twee\n    - [ ] Drie\n");
  });

  it("turns a numbered list into bullets rather than numbering the boxes", () => {
    const after = run(stateAt("1. Een\n2. Twee\n", "Een"), toggleTask);
    expect(markdownOf(after)).toBe("- [ ] Een\n- Twee\n");
  });

  it("resolves a mixed selection one way instead of flipping each item", () => {
    const after = run(across("- [ ] Een\n- Twee\n", "Een", "Twee"), toggleTask);
    expect(markdownOf(after)).toBe("- [ ] Een\n- [ ] Twee\n");
  });

  it("clears a whole selection once none of it is left plain", () => {
    const after = run(across("- [x] Een\n- [ ] Twee\n", "Een", "Twee"), toggleTask);
    expect(markdownOf(after)).toBe("- Een\n- Twee\n");
  });
});

describe("toggleChecked", () => {
  it("ticks an unticked task", () => {
    const after = run(stateAt("- [ ] Iets doen\n", "Iets"), toggleChecked);
    expect(markdownOf(after)).toBe("- [x] Iets doen\n");
  });

  it("unticks a ticked one", () => {
    const after = run(stateAt("- [x] Iets doen\n", "Iets"), toggleChecked);
    expect(markdownOf(after)).toBe("- [ ] Iets doen\n");
  });

  it("declines on an item that is not a task, so the key stays free", () => {
    const state = stateAt("- Iets doen\n", "Iets");
    expect(toggleChecked(state, undefined)).toBe(false);
  });

  it("declines outside a list", () => {
    const state = stateAt("Gewone tekst\n", "Gewone");
    expect(toggleChecked(state, undefined)).toBe(false);
  });
});

describe("Enter after a task", () => {
  it("starts an unticked item, not a second ticked one", () => {
    const after = type(run(stateAt("- [x] Klaar\n", "Klaar"), pressEnter), "Volgende");
    expect(markdownOf(after)).toBe("- [x] Klaar\n- [ ] Volgende\n");
  });

  it("keeps a plain bullet plain — no box appears", () => {
    const after = type(run(stateAt("- Gewoon\n", "Gewoon"), pressEnter), "Nog een");
    expect(markdownOf(after)).toBe("- Gewoon\n- Nog een\n");
  });

  it("carries the box down a nested task too", () => {
    const source = "- Een\n  - [x] Twee\n";
    const after = type(run(stateAt(source, "Twee"), pressEnter), "Drie");
    expect(markdownOf(after)).toBe("- Een\n  - [x] Twee\n  - [ ] Drie\n");
  });
});

describe("toggleOrderedList", () => {
  it("clears the boxes, since numbered task lists are not part of the dialect", () => {
    const source = "- [x] Een\n- [ ] Twee\n";
    const after = run(stateAt(source, "Een"), toggleOrderedList);
    expect(markdownOf(after)).toBe("1. Een\n2. Twee\n");
  });

  it("leaves a nested bullet list's tasks alone", () => {
    const source = "- [ ] Een\n  - [x] Onder\n";
    const after = run(stateAt(source, "Een"), toggleOrderedList);
    expect(markdownOf(after)).toBe("1. Een\n   - [x] Onder\n");
  });
});

describe("input rules", () => {
  const { doc, bulletList, listItem, paragraph } = schema.nodes;

  /** A caret at the end of `content`, either in a bare paragraph or inside an item. */
  function typed(content: string, inList: boolean): EditorState {
    const block = paragraph!.create(null, content === "" ? null : schema.text(content));
    const top = inList ? bulletList!.create(null, listItem!.create(null, block)) : block;
    const document = doc!.create(null, [top]);

    return EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.atEnd(document),
    });
  }

  /**
   * Fires the rules exactly as `inputRules` does on a keystroke: the text already in
   * the block plus the character being typed, and a range that covers only the part
   * already in the document — the triggering character is never inserted.
   */
  function press(state: EditorState, character: string): EditorState {
    const { $from } = state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset) + character;

    for (const rule of TASK_RULES) {
      const match = rule.match.exec(before);
      if (match === null) continue;

      const start = $from.pos - (match[0].length - character.length);
      const transaction = rule.handler(state, match, start, $from.pos);
      if (transaction !== null) return state.apply(transaction);
    }

    return state.apply(state.tr.insertText(character));
  }

  /** Fires the rule and then types, since an empty task item writes as a bare `-`. */
  function ruleThenType(content: string, inList: boolean): string {
    return markdownOf(type(press(typed(content, inList), " "), "Iets"));
  }

  it("`[] ` inside an item makes it a task", () => {
    expect(ruleThenType("[]", true)).toBe("- [ ] Iets\n");
  });

  it("`[ ] ` inside an item makes it a task", () => {
    expect(ruleThenType("[ ]", true)).toBe("- [ ] Iets\n");
  });

  it("`[x] ` inside an item makes it a ticked task", () => {
    expect(ruleThenType("[x]", true)).toBe("- [x] Iets\n");
  });

  it("`[X] ` is accepted too", () => {
    expect(ruleThenType("[X]", true)).toBe("- [x] Iets\n");
  });

  it("`- [] ` in a paragraph starts a task list", () => {
    expect(ruleThenType("- []", false)).toBe("- [ ] Iets\n");
  });

  it("`- [x] ` in a paragraph starts a ticked one", () => {
    expect(ruleThenType("- [x]", false)).toBe("- [x] Iets\n");
  });

  it("leaves a bracket that is not a checkbox alone", () => {
    expect(ruleThenType("zie [1]", true)).toBe("- zie \\[1] Iets\n");
  });
});
