import { describe, expect, it } from "vitest";
import { Selection } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { createEditorState } from "../src/renderer/editor/state.js";
import type { CommandContext } from "../src/renderer/editor/commands.js";
import { insertTable } from "../src/renderer/editor/table-commands.js";
import { withTrailingParagraph } from "../src/renderer/editor/trailing-paragraph.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * There is always a line below the last block (B42), and it never reaches the file.
 *
 * The plugin only runs from a real plugin list, so unlike `table-commands.test.ts` this
 * builds its state through `createEditorState` rather than `EditorState.create`.
 */

const context: CommandContext = {
  openLinkPrompt: () => {},
  requestImage: () => {},
  requestFile: () => {},
  requestNoteLink: () => {},
  requestTable: () => {},
};

function stateOf(markdown: string) {
  return createEditorState(docFromMarkdown(markdown), context);
}

/**
 * The same state with the caret at the very end of the note — which is where "insert a
 * table at the bottom" actually happens, and not where a freshly built `EditorState`
 * puts it. Left at the default position 0, `replaceSelectionWith` files the table *above*
 * the prose and the note no longer ends in one at all.
 */
function stateAtEndOf(markdown: string) {
  const state = stateOf(markdown);
  return state.apply(state.tr.setSelection(Selection.atEnd(state.doc)));
}

/** Applies a command through a state that has the plugins on it, so appendTransaction runs. */
function apply(markdown: string, command: ReturnType<typeof insertTable>) {
  let state = stateAtEndOf(markdown);
  command(state, (transaction) => {
    state = state.apply(transaction);
  });
  return state;
}

describe("trailingParagraph", () => {
  it("puts a paragraph after a table inserted at the very end of a note", () => {
    const after = apply("Notes.\n", insertTable(2, 2));
    const last = after.doc.lastChild!;

    expect(last.type.name).toBe("paragraph");
    expect(last.content.size).toBe(0);
  });

  it("does not write that paragraph to the file", () => {
    // The invariant is free precisely because `withoutTrailingBlanks` already strips a
    // trailing empty paragraph on the way out. If that ever stopped being true, every
    // note holding a table would start gaining a blank line on save.
    const after = apply("Notes.\n", insertTable(2, 2));
    const markdown = serializeBody(after.doc);

    expect(markdown).toBe("Notes.\n\n|  |  |\n| --- | --- |\n|  |  |\n");
    expect(markdown).not.toMatch(/\n\n$/);
  });

  it("adds nothing when the document already ends in a paragraph", () => {
    const before = stateOf("A table.\n\n| a | b |\n| --- | --- |\n| c | d |\n\nAnd prose after it.\n");
    const blocks = before.doc.childCount;

    // A no-op transaction still goes through `appendTransaction`; nothing should follow.
    let after = before;
    after = after.apply(after.tr.insertText("!", after.doc.content.size - 1));

    expect(after.doc.childCount).toBe(blocks);
    expect(after.doc.lastChild!.type.name).toBe("paragraph");
  });

  it("covers the other blocks with no caret position after them, not just tables", () => {
    for (const [markdown, type] of [
      ["Text.\n\n```\ncode\n```\n", "codeBlock"],
      ["Text.\n\n---\n", "horizontalRule"],
    ] as const) {
      const state = stateOf(markdown);
      // Parsed straight from the file the block really is last, and the line below it now
      // arrives with the state rather than with the first edit — see `withTrailingParagraph`.
      expect(state.doc.child(state.doc.childCount - 2).type.name).toBe(type);
      expect(state.doc.lastChild!.type.name).toBe("paragraph");

      let next = state;
      next = next.apply(next.tr.insert(0, schema.nodes.paragraph!.create()));
      expect(next.doc.lastChild!.type.name).toBe("paragraph");
    }
  });

  /**
   * The half that only shows up on a note this app did not write.
   *
   * `appendTransaction` restores the invariant after a change; opening a note is not a
   * change, so a file that already ends in a table used to open with no text position
   * after it at all. Notes written here end that way too as soon as they are reopened,
   * since the serializer strips the paragraph on the way out.
   */
  it("gives a note that already ends in a table a line to type on, without touching it", () => {
    const markdown = "Imported.\n\n| a | b |\n| --- | --- |\n| c | d |\n";
    const state = stateOf(markdown);

    expect(state.doc.lastChild!.type.name).toBe("paragraph");
    expect(state.doc.lastChild!.content.size).toBe(0);
    expect(Selection.atEnd(state.doc).$head.parent.type.name).toBe("paragraph");

    // B10: opening a note must not change what would be written back.
    expect(serializeBody(state.doc)).toBe(markdown);
  });

  it("leaves a document that needs no line below it alone", () => {
    const doc = docFromMarkdown("Just prose.\n");
    expect(withTrailingParagraph(doc)).toBe(doc);
  });
});
