import { describe, expect, it } from "vitest";
import type { EditorState } from "prosemirror-state";
import { serializeBody } from "../src/markdown/index.js";
import { createEditorState } from "../src/renderer/editor/state.js";
import type { CommandContext } from "../src/renderer/editor/commands.js";
import {
  DUPLICATE_LINK_CLASS,
  duplicateEmbedKey,
} from "../src/renderer/editor/duplicate-embed.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * Obsidian's link-beside-embed pair draws once (B48), and the file keeps both.
 *
 * The plugin is a `DecorationSet`, so what it does is checkable without a DOM: the
 * decorations it produces name the exact positions that will be hidden.
 */

const context: CommandContext = {
  openLinkPrompt: () => {},
  requestImage: () => {},
  requestFile: () => {},
  requestNoteLink: () => {},
  requestTable: () => {},
};

function stateOf(markdown: string): EditorState {
  return createEditorState(docFromMarkdown(markdown), context);
}

/** The targets of every link this state would hide. */
function hidden(state: EditorState): string[] {
  const decorations = duplicateEmbedKey.getState(state)!;

  return decorations.find().map((decoration) => {
    const spec = (decoration as unknown as { type: { attrs?: { class?: string } } }).type;
    expect(spec.attrs?.class).toBe(DUPLICATE_LINK_CLASS);
    return state.doc.nodeAt(decoration.from)!.attrs.target as string;
  });
}

describe("duplicateEmbedLinks", () => {
  it("hides a link standing next to its own embed", () => {
    const markdown = "![[99 - Attachments/offerte.pdf]]\n[[99 - Attachments/offerte.pdf]]\n";
    const state = stateOf(markdown);

    expect(hidden(state)).toEqual(["99 - Attachments/offerte.pdf"]);
    // The whole point: nothing is rewritten. B10 and Obsidian compatibility both depend
    // on this staying true.
    expect(serializeBody(state.doc)).toBe(markdown);
  });

  it("hides it in either order", () => {
    const state = stateOf("[[offerte.pdf]] ![[offerte.pdf]]\n");
    expect(hidden(state)).toEqual(["offerte.pdf"]);
  });

  it("leaves a link alone when the embed names a different file", () => {
    expect(hidden(stateOf("![[offerte.pdf]] [[contract.pdf]]\n"))).toEqual([]);
  });

  it("leaves a link alone when the two are not neighbours", () => {
    // A mention at the other end of the note is a second, deliberate mention. Swallowing
    // it would be the plugin deciding something it cannot know.
    expect(hidden(stateOf("![[offerte.pdf]]\n\nProse in between.\n\n[[offerte.pdf]]\n"))).toEqual(
      [],
    );
  });

  it("still hides across a line break and a word gap", () => {
    expect(hidden(stateOf("![[offerte.pdf]]\n[[offerte.pdf]]\n"))).toEqual(["offerte.pdf"]);
  });

  it("stops hiding once the embed is gone", () => {
    const state = stateOf("![[offerte.pdf]] [[offerte.pdf]]\n");
    expect(hidden(state)).toEqual(["offerte.pdf"]);

    // Delete the embed — the surviving chip has to come back, which is why the set is
    // recomputed rather than mapped through the transaction.
    const after = state.apply(state.tr.delete(1, 2));
    expect(hidden(after)).toEqual([]);
  });
});
