import type { EditorView } from "prosemirror-view";
import { schema } from "../../markdown/schema.js";

/**
 * The one place a chosen note turns into a `[[…]]` node (B41) — the counterpart of
 * `insert-attachment.ts`, and split from it for the reason those two files describe
 * between them: an attachment is a filename that already exists on disk, a note link is a
 * *path* that main had to resolve, and the two arrive from different places.
 *
 * The link is always written with both halves — `[[path|Title]]`, never a bare
 * `[[Title]]`. Three reasons, in order of how much they cost to get wrong:
 *
 * - A path resolves in `link-resolve.ts`'s first stage and cannot be ambiguous. A title
 *   resolves in the second, and two notes may share one — which raises the picker on
 *   every click for the rest of that link's life, over a question the user already
 *   answered here.
 * - `rewriteWikiLinks` (B35) already rewrites the target of a link when its note moves.
 *   Writing the path is what gives it something to rewrite.
 * - B35's own rule is that a link with no alias *gains* one spelled with its old target
 *   the first time the note it points at is moved. The alias is going to be written
 *   sooner or later; writing it now means the user sees the words they picked rather than
 *   discovering a path in their sentence months later.
 */
export function insertNoteLink(view: EditorView, target: string, alias: string): void {
  const node = schema.nodes.wikiLink!.create({ target, alias });
  view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
  view.focus();
}

/**
 * The same insertion, but swallowing `[[` the user already typed.
 *
 * `state.ts`'s input rule deliberately lets those two characters land in the document
 * rather than eating them: a cancelled picker then leaves exactly what was typed, with no
 * transaction to undo and nothing surprising about the caret. The cost is that inserting
 * has to clean them up, which is this — and it re-reads the text at `from` instead of
 * trusting the range it was handed, so a picker that somehow outlived the brackets (an
 * external reload, an undo behind the overlay) inserts the link rather than eating two
 * characters of a sentence.
 */
export function insertNoteLinkOverPrefix(
  view: EditorView,
  target: string,
  alias: string,
  prefix: string,
): void {
  const { state } = view;
  const to = state.selection.from;
  const from = to - prefix.length;

  const node = schema.nodes.wikiLink!.create({ target, alias });
  const typed = from >= 0 ? state.doc.textBetween(from, to) : "";

  const tr = typed === prefix
    ? state.tr.replaceWith(from, to, node)
    : state.tr.replaceSelectionWith(node, false);

  view.dispatch(tr.scrollIntoView());
  view.focus();
}
