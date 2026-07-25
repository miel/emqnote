import { history } from "prosemirror-history";
import { inputRules, wrappingInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import { outlookKeymap } from "./keymap.js";

/**
 * Autoformatting, borrowed from Word rather than from markdown.
 *
 * Typing "- " or "1. " at the start of a line starts a list, exactly as Outlook does.
 * There is deliberately no rule for "# " or "**": those are markdown spellings, and
 * seeing markdown while typing is one of the four reasons Obsidian did not stick.
 */
const autoformat = inputRules({
  rules: [
    wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bulletList!),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      schema.nodes.orderedList!,
      (match) => ({ start: Number(match[1]) }),
      (match, node) => node.childCount + (node.attrs.start as number) === Number(match[1]),
    ),
  ],
});

export function emptyDocument(): PMNode {
  return schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]);
}

export function createEditorState(
  doc: PMNode,
  openLinkPrompt: () => void,
): EditorState {
  return EditorState.create({
    doc,
    plugins: [
      history(),
      autoformat,
      keymap(outlookKeymap(openLinkPrompt)),
      keymap(baseKeymap),
    ],
  });
}
