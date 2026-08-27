import { describe, expect, it } from "vitest";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import {
  setHeading,
  toggleBulletList,
  toggleOrderedList,
  toggleTask,
} from "../src/renderer/editor/commands.js";
import { docFromMarkdown, markdownOf, run, stateAt } from "./helpers/editing.js";

/**
 * Getting *out* of a heading again.
 *
 * Two separate holes, reported as one complaint ("once a line is a heading it cannot be
 * anything else"), and each closed on its own terms.
 *
 * The first is that `setHeading` was a plain `setBlockType`: pressing Mod+1 on a line that
 * was already an H1 re-applied H1, and the only way back was Mod+0 — which exists, and is
 * in the help sheet and the `/` panel, and is still not the gesture anyone reaches for.
 * Every editor with a heading button has taught "press it again".
 *
 * The second is the interesting one, because nothing was broken: `listItem`'s content is
 * `paragraph block*` (`schema.ts`), so a `heading` cannot be a list item's first child,
 * `wrapInList` finds no wrapping and returns **false**. A `Command` returning false is a
 * key press that does nothing and says nothing, so a heading simply refused to become a
 * bullet, with the file format as the cause and no sign of it on screen. The heading is
 * lifted to a paragraph on the way in now — which is what the press meant anyway, a
 * bulleted heading being a shape this dialect cannot write (`limitations.test.ts` pins
 * that, and it still holds: this route avoids the shape rather than relaxing it).
 *
 * Expressed in markdown at both ends like every other editing test, so a command that
 * quietly breaks the round trip fails here too.
 */

/**
 * Every block in the document selected.
 *
 * `stateSelecting` cannot reach across two blocks — it looks a needle up inside one text
 * node — and every question here about a *mixed* selection is a question about two blocks.
 */
function selectingEverything(markdown: string): EditorState {
  const doc = docFromMarkdown(markdown);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, doc.content.size - 1),
  });
}

/** How many transactions a command dispatched — one is one press of Ctrl+Z. */
function dispatches(state: EditorState, command: Command): number {
  let count = 0;
  let next = state;
  command(state, (transaction) => {
    count += 1;
    next = next.apply(transaction);
  });
  return count;
}

describe("pressing a heading level twice", () => {
  it("takes the heading off again", () => {
    const state = stateAt("# Kwartaalplan\n", "Kwartaal");
    expect(markdownOf(run(state, setHeading(1)))).toBe("Kwartaalplan\n");
  });

  it("still puts one on a plain paragraph", () => {
    const state = stateAt("Kwartaalplan\n", "Kwartaal");
    expect(markdownOf(run(state, setHeading(1)))).toBe("# Kwartaalplan\n");
  });

  it("moves to another level rather than dropping through the paragraph", () => {
    // Only the *same* level toggles. Walking down the levels must not pass through a
    // paragraph on the way, or Mod+2 on an H1 would be two presses.
    const state = stateAt("# Kwartaalplan\n", "Kwartaal");
    expect(markdownOf(run(state, setHeading(2)))).toBe("## Kwartaalplan\n");
  });

  it("only toggles off when the whole selection is already that level", () => {
    // Half a selection is not "already H1", and toggling from its first line would be the
    // command reading one line and acting on two.
    const state = selectingEverything("# Kwartaalplan\n\nDe cijfers\n");
    expect(markdownOf(run(state, setHeading(1)))).toBe("# Kwartaalplan\n\n# De cijfers\n");
  });

  it("takes it off a selection that is entirely that level", () => {
    const state = selectingEverything("# Eerste\n\n# Tweede\n");
    expect(markdownOf(run(state, setHeading(1)))).toBe("Eerste\n\nTweede\n");
  });
});

describe("a list command with the caret in a heading", () => {
  it("makes a bullet of it instead of silently refusing", () => {
    const state = stateAt("# Kwartaalplan\n", "Kwartaal");
    expect(markdownOf(run(state, toggleBulletList))).toBe("- Kwartaalplan\n");
  });

  it("makes a numbered item of it", () => {
    const state = stateAt("## Kwartaalplan\n", "Kwartaal");
    expect(markdownOf(run(state, toggleOrderedList))).toBe("1. Kwartaalplan\n");
  });

  it("makes a task of it", () => {
    const state = stateAt("# Offerte sturen\n", "Offerte");
    expect(markdownOf(run(state, toggleTask))).toBe("- [ ] Offerte sturen\n");
  });

  it("does it in one transaction, so one Ctrl+Z undoes the whole press", () => {
    // The reason the steps are replayed onto one transaction rather than dispatched as
    // two: undone separately, the first Ctrl+Z would leave a paragraph where the heading
    // used to be — a state nobody asked for and nobody can name.
    const state = stateAt("# Kwartaalplan\n", "Kwartaal");
    expect(dispatches(state, toggleBulletList)).toBe(1);
  });

  it("carries every heading in a mixed selection into the list", () => {
    const state = selectingEverything("# Eerste\n\nTweede\n");
    expect(markdownOf(run(state, toggleBulletList))).toBe("- Eerste\n- Tweede\n");
  });
});

describe("what the lift must not disturb", () => {
  it("leaves a plain paragraph's bullet exactly as it was", () => {
    const state = stateAt("Kwartaalplan\n", "Kwartaal");
    expect(markdownOf(run(state, toggleBulletList))).toBe("- Kwartaalplan\n");
  });

  it("still takes a bullet off again", () => {
    const state = stateAt("- Kwartaalplan\n", "Kwartaal");
    expect(markdownOf(run(state, toggleBulletList))).toBe("Kwartaalplan\n");
  });

  it("still retypes a bulleted list as a numbered one in place", () => {
    const state = stateAt("- Eerste\n- Tweede\n", "Eerste");
    expect(markdownOf(run(state, toggleOrderedList))).toBe("1. Eerste\n2. Tweede\n");
  });

  it("still ticks an existing task list off", () => {
    const state = stateAt("- [ ] Offerte sturen\n", "Offerte");
    expect(markdownOf(run(state, toggleTask))).toBe("- Offerte sturen\n");
  });
});
