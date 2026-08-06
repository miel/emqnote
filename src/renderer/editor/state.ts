import { history } from "prosemirror-history";
import { InputRule, inputRules, wrappingInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { EditorState, type Transaction } from "prosemirror-state";
import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import type { CommandContext } from "./commands.js";
import { outlookKeymap } from "./keymap.js";
import { tagHighlight } from "./tag-decoration.js";
import { taskCheckboxes } from "./checkbox.js";
import { taskHighlight } from "./task-highlight.js";

/** The list item a matched rule sits in, with the position of the item itself. */
function itemAround($pos: ResolvedPos): { pos: number; node: PMNode } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type === schema.nodes.listItem) {
      return { pos: $pos.before(depth), node: $pos.node(depth) };
    }
  }
  return null;
}

/** `[x]` and `[X]` tick the box; `[]` and `[ ]` leave it empty. */
function ticked(match: RegExpMatchArray): boolean {
  return /[xX]/.test(match[1] ?? "");
}

/**
 * `[] ` inside an item turns it into a task.
 *
 * This and the rule below are a deliberate exception to the "no markdown spellings"
 * rule above, and the reason is that there is no other spelling: a checkbox has no
 * Word gesture to borrow, and `[] ` is what everyone who has used a task list already
 * types. It is also the only one of these where what you type is what the file says.
 */
function taskInItem(
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number,
): Transaction | null {
  const item = itemAround(state.doc.resolve(start));
  if (item === null) return null;

  return state.tr
    .delete(start, end)
    .setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked: ticked(match) });
}

/**
 * `- [] ` in an ordinary paragraph starts a task list.
 *
 * The wrappers are named outright instead of asked for from `findWrapping`, which
 * exists to *discover* a valid path and there is nothing to discover here — it also
 * lets the item be born with its box already set, rather than wrapped and then
 * patched.
 */
function taskFromParagraph(
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number,
): Transaction | null {
  if (itemAround(state.doc.resolve(start)) !== null) return null;

  const tr: Transaction = state.tr.delete(start, end);
  const range = tr.doc.resolve(start).blockRange();
  if (range === null) return null;

  return tr.wrap(range, [
    { type: schema.nodes.bulletList! },
    { type: schema.nodes.listItem!, attrs: { checked: ticked(match) } },
  ]);
}

/**
 * The pattern and the handler kept together, so a test can fire a rule the way
 * `inputRules` does — match the text in front of the caret, call the handler — without
 * standing up an `EditorView`. `InputRule` keeps both private once constructed.
 */
export const TASK_RULES = [
  { match: /^\[( |x|X)?\]\s$/, handler: taskInItem },
  { match: /^[-*+]\s\[( |x|X)?\]\s$/, handler: taskFromParagraph },
] as const;

/**
 * Autoformatting, borrowed from Word rather than from markdown.
 *
 * Typing "- " or "1. " at the start of a line starts a list, exactly as Outlook does.
 * There is deliberately no rule for "# " or "**": those are markdown spellings, and
 * seeing markdown while typing is one of the four reasons Obsidian did not stick.
 *
 * Typed straight through, `- ` has already become a bullet by the time `[] ` arrives,
 * so `taskInItem` is the rule that normally fires. `taskFromParagraph` is for when it
 * has not: undoing the bullet autoformat leaves a literal `- ` in a paragraph, and
 * that has to reach the same place rather than dead-end.
 */
const autoformat = inputRules({
  rules: [
    ...TASK_RULES.map((rule) => new InputRule(rule.match, rule.handler)),
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
  context: CommandContext,
): EditorState {
  return EditorState.create({
    doc,
    plugins: [
      history(),
      autoformat,
      tagHighlight(),
      taskCheckboxes(),
      taskHighlight(),
      keymap(outlookKeymap(context)),
      keymap(baseKeymap),
    ],
  });
}
