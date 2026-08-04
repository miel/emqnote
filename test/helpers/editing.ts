import type { Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { baseKeymap, chainCommands } from "prosemirror-commands";
import { schema } from "../../src/markdown/schema.js";
import { parseNote, serializeBody } from "../../src/markdown/index.js";
import { backspace, enter } from "../../src/renderer/editor/commands.js";

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

/**
 * A state whose caret sits at the start of a top-level paragraph directly after the
 * given markdown, optionally already holding `text` — exactly where you land after
 * pressing Enter twice to leave a list, whether or not you have since typed something.
 */
export function stateOnLineAfter(markdown: string, text = ""): EditorState {
  const listBlocks: PMNode[] = [];
  docFromMarkdown(markdown).forEach((child) => listBlocks.push(child));

  // The position where the new paragraph will start is exactly the size of what comes
  // before it — top-level positions and content offsets coincide for a `doc` node.
  const paragraphStart = schema.nodes.doc!.create(null, listBlocks).content.size;
  const paragraph = schema.nodes.paragraph!.create(
    null,
    text === "" ? undefined : schema.text(text),
  );

  const doc = schema.nodes.doc!.create(null, [...listBlocks, paragraph]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, paragraphStart + 1),
  });
}

/**
 * A state whose caret sits on an empty paragraph directly after the given markdown —
 * exactly where you land after pressing Enter twice to leave a list.
 */
export function stateOnEmptyLineAfter(markdown: string): EditorState {
  return stateOnLineAfter(markdown);
}

/** Types text at the caret, so a command's result can be filled in and inspected. */
export function type(state: EditorState, text: string): EditorState {
  return state.apply(state.tr.insertText(text));
}

/** Caret at the very start of the given text — where Backspace behaves specially. */
export function stateAtStartOf(markdown: string, needle: string): EditorState {
  const doc = docFromMarkdown(markdown);
  const at = caretAfter(doc, needle) - needle.length;
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, at),
  });
}

/**
 * Applies a command, accumulating every transaction it dispatches.
 *
 * A command may dispatch more than once — `exitList` lifts repeatedly — and each of
 * those is computed against the state left by the previous one, exactly as the editor
 * view would have it.
 */
export function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (transaction) => {
    next = next.apply(transaction);
  });
  return next;
}

/** The Enter and Backspace bindings as the keymap actually wires them. */
export const pressEnter = chainCommands(enter, baseKeymap.Enter!);

/**
 * Backspace exactly as the real editor resolves it, across both keymap plugins.
 *
 * `state.ts` installs `keymap(outlookKeymap(...))` and then, at lower priority, a
 * second bare `keymap(baseKeymap)`. `chainCommands(backspace, baseKeymap.Backspace)`
 * alone only models the first plugin's own binding; if the custom `backspace` command
 * ever declined a case it should have handled, the first plugin's fallback would mask
 * that here just as it would in the app, but a broken command that returns `false`
 * *after* dispatching would not be caught by the chain alone. Falling through to the
 * second plugin here as well — exactly as ProseMirror would when the first plugin's key
 * handler declines outright — keeps this helper an honest model of `keymap.ts`.
 */
export const pressBackspace: Command = (state, dispatch) => {
  const firstPlugin = chainCommands(backspace, baseKeymap.Backspace!);
  if (firstPlugin(state, dispatch)) return true;
  return baseKeymap.Backspace!(state, dispatch);
};
