import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";

/**
 * Briefly highlights the task a Tasks-view click just moved the caret to.
 *
 * A decoration, deliberately, and not a mark: the same reasoning as `tag-decoration.ts`
 * applies here even more directly, since this one is meant to disappear on its own —
 * putting it in the document would mean either persisting a "temporarily highlighted"
 * flag to the file (never, per B6) or writing code to strip it back out. A decoration
 * lives beside the document and is gone the moment its plugin state says so, with
 * nothing to clean up in the doc either way.
 *
 * The key is exported because, unlike `tagHighlight`, nothing here can be derived from
 * `tr.docChanged` alone: `focus-task.ts` sets the highlighted range in the same
 * transaction that moves the caret, and `clearTaskHighlight` below removes it once
 * `Editor.tsx`'s 10-second timer fires.
 */
export const taskHighlightKey = new PluginKey<DecorationSet>("taskHighlight");

type Meta = { from: number; to: number } | "clear";

export function taskHighlight(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: taskHighlightKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, decorations) {
        const meta = tr.getMeta(taskHighlightKey) as Meta | undefined;
        if (meta === "clear") return DecorationSet.empty;
        if (meta !== undefined) {
          return DecorationSet.create(tr.doc, [
            Decoration.inline(meta.from, meta.to, { class: "task-highlight" }),
          ]);
        }
        return decorations.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations: (state) => taskHighlightKey.getState(state),
    },
  });
}

/** Removes the highlight, if any. A no-op on a view whose document has since moved on. */
export function clearTaskHighlight(view: EditorView): void {
  if (view.isDestroyed) return;
  view.dispatch(view.state.tr.setMeta(taskHighlightKey, "clear"));
}
