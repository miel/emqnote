import type { Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { baseKeymap, chainCommands } from "prosemirror-commands";
import { schema } from "../../src/markdown/schema.js";
import { parseNote, serializeBody } from "../../src/markdown/index.js";
import { enter } from "../../src/renderer/editor/commands.js";

/**
 * Editing tests run against `EditorState` rather than a mounted view: commands are
 * pure state transformations, so a DOM would only add slowness and flakiness.
 *
 * Both ends are expressed in markdown. That is deliberate — it ties the tests to
 * 03-markdown-dialect.md rather than to some internal document shape, and it means a
 * command that quietly breaks the round trip fails here too.
 */

export function docFromMarkdown(markdown: string): PMNode {
  return parseNote(markdown).doc;
}

export function markdownOf(state: EditorState): string {
  return serializeBody(state.doc);
}

/** Position of the caret just after the first occurrence of `needle`. */
export function caretAfter(doc: PMNode, needle: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText && node.text!.includes(needle)) {
      found = pos + node.text!.indexOf(needle) + needle.length;
      return false;
    }
    return true;
  });
  if (found === -1) throw new Error(`text not found in document: ${needle}`);
  return found;
}

export function stateAt(markdown: string, needle: string): EditorState {
  const doc = docFromMarkdown(markdown);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, caretAfter(doc, needle)),
  });
}

/** Position of the start of the first occurrence of `needle`. */
function caretBefore(doc: PMNode, needle: string): number {
  return caretAfter(doc, needle) - needle.length;
}

/** A state with `needle` selected, for the commands that act on a range. */
export function stateSelecting(markdown: string, needle: string): EditorState {
  const doc = docFromMarkdown(markdown);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, caretBefore(doc, needle), caretAfter(doc, needle)),
  });
}

export function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (transaction) => {
    next = state.apply(transaction);
  });
  return next;
}

/** The Enter binding as the keymap actually wires it. */
export const pressEnter = chainCommands(enter, baseKeymap.Enter!);
