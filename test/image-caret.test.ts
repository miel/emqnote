import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import { moveOverAtom } from "../src/renderer/editor/commands.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * Bug 4: the caret disappears beside an inline `wikiEmbed`/`wikiLink` atom.
 *
 * ProseMirror's own arrow handling prefers turning an atom into an invisible
 * `NodeSelection` over moving the text caret past it. `moveOverAtom` (`commands.ts`) is
 * bound ahead of `baseKeymap` so an ordinary arrow press beside one of these two node
 * types lands the caret on the far side instead — a plain `TextSelection`, since a valid
 * caret position already exists there (both nodes are inline).
 *
 * These run against headless `EditorState`, same as the rest of the editor suite:
 * `moveOverAtom` is a pure command, so a mounted view would only add DOM overhead for no
 * extra coverage.
 */

/** The positions immediately before and after the first node of `typeName` in `doc`. */
function atomBounds(doc: PMNode, typeName: string): { before: number; after: number } {
  let found: { before: number; after: number } | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === typeName) {
      found = { before: pos, after: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`no ${typeName} node found in document`);
  return found;
}

function stateAtPos(doc: PMNode, pos: number): EditorState {
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos) });
}

function stateSelectingRange(doc: PMNode, from: number, to: number): EditorState {
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) });
}

/** Applies a command and reports both whether it handled the key and the resulting state. */
function fire(state: EditorState, command: Command): { handled: boolean; state: EditorState } {
  let next = state;
  const handled = command(state, (tr) => {
    next = next.apply(tr);
  });
  return { handled, state: next };
}

describe("moveOverAtom", () => {
  it("arrow-right from just before an embed skips over it", () => {
    const doc = docFromMarkdown("Tekst ![[foto.png]] verder.\n");
    const { before, after } = atomBounds(doc, "wikiEmbed");

    const { handled, state } = fire(stateAtPos(doc, before), moveOverAtom("right"));

    expect(handled).toBe(true);
    expect(state.selection.empty).toBe(true);
    expect(state.selection.from).toBe(after);
    expect(state.selection).toBeInstanceOf(TextSelection);
  });

  it("arrow-left from just after an embed skips back over it", () => {
    const doc = docFromMarkdown("Tekst ![[foto.png]] verder.\n");
    const { before, after } = atomBounds(doc, "wikiEmbed");

    const { handled, state } = fire(stateAtPos(doc, after), moveOverAtom("left"));

    expect(handled).toBe(true);
    expect(state.selection.empty).toBe(true);
    expect(state.selection.from).toBe(before);
    expect(state.selection).toBeInstanceOf(TextSelection);
  });

  it("handles an embed at the very start of a paragraph", () => {
    const doc = docFromMarkdown("![[foto.png]] tekst\n");
    const { before, after } = atomBounds(doc, "wikiEmbed");

    const { handled, state } = fire(stateAtPos(doc, after), moveOverAtom("left"));

    expect(handled).toBe(true);
    expect(state.selection.from).toBe(before);

    // Nothing precedes the embed at this point: a further Left has no atom to skip and
    // must decline rather than reach into a node that isn't there.
    const again = fire(state, moveOverAtom("left"));
    expect(again.handled).toBe(false);
  });

  it("handles an embed at the very end of a paragraph", () => {
    const doc = docFromMarkdown("tekst ![[foto.png]]\n");
    const { before, after } = atomBounds(doc, "wikiEmbed");

    const { handled, state } = fire(stateAtPos(doc, before), moveOverAtom("right"));

    expect(handled).toBe(true);
    expect(state.selection.from).toBe(after);

    // Nothing follows the embed at this point: a further Right must decline instead of
    // reaching into the next block.
    const again = fire(state, moveOverAtom("right"));
    expect(again.handled).toBe(false);
  });

  it("does the same for a wikiLink, not only a wikiEmbed", () => {
    const doc = docFromMarkdown("Zie [[Andere notitie]] verder.\n");
    const { before, after } = atomBounds(doc, "wikiLink");

    const { handled, state } = fire(stateAtPos(doc, before), moveOverAtom("right"));

    expect(handled).toBe(true);
    expect(state.selection.from).toBe(after);
  });

  it("declines when the selection is not a plain caret, so Shift-extending is untouched", () => {
    const doc = docFromMarkdown("Tekst ![[foto.png]] verder.\n");
    const { before } = atomBounds(doc, "wikiEmbed");

    // A one-character range ending exactly where the embed begins — as if Shift-Right
    // had just extended the selection up to it. The command must return false and leave
    // the selection exactly as it was, so ordinary baseKeymap/Shift behavior applies.
    const selecting = stateSelectingRange(doc, before - 1, before);
    const { handled, state } = fire(selecting, moveOverAtom("right"));

    expect(handled).toBe(false);
    expect(state.selection.from).toBe(before - 1);
    expect(state.selection.to).toBe(before);
    expect(state.selection.empty).toBe(false);
  });

  it("declines with no adjacent atom at all — ordinary text keeps ordinary movement", () => {
    const doc = docFromMarkdown("Gewone tekst zonder bijlage.\n");
    const state = stateAtPos(doc, 5);

    expect(fire(state, moveOverAtom("right")).handled).toBe(false);
    expect(fire(state, moveOverAtom("left")).handled).toBe(false);
  });
});
