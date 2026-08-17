import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 * A bullet, a number or a checkbox follows the formatting of its own line.
 *
 * Reported from daily use: bold a whole bulleted line and the text goes bold while the `•`
 * in front of it stays exactly as it was, which reads as the marker not belonging to the
 * line it introduces. Word does this; a browser does not, because `::marker` inherits from
 * the `<li>` and the marks live on the text inside it.
 *
 * **A class on the `<li>`, nothing more.** No schema change, nothing crossing into the
 * serializer, nothing written to disk — the file already says which words are bold, and
 * this is only how that is drawn. `03-markdown-dialect.md` draws the line at presentation
 * that carries meaning; this carries none, and a note read in Obsidian looks exactly as it
 * did.
 *
 * **Only when the whole line carries it.** Half a bold line is a formatted phrase inside a
 * sentence, and a marker that went bold for it would be claiming something about the item
 * that is not true. `isMarkActive` in `commands.ts` is no use for asking that: it is
 * selection-based, and `rangeHasMark` means *any* of the range rather than all of it.
 *
 * **Bold and italic only.** Strikethrough was asked about and left out on purpose: a
 * `::marker` cannot draw a line through itself, so it would mean giving up the native
 * marker for a `::before` — a much larger change to the one thing in the editor that is
 * currently the browser's own work.
 */
export const STRONG_ITEM_CLASS = "li-strong";
export const EM_ITEM_CLASS = "li-em";

/** Exported so a test can read the set back without mounting a view. */
export const listMarkerStyleKey = new PluginKey<DecorationSet>("listMarkerStyle");

/**
 * Whether every word in this paragraph carries `mark`.
 *
 * Whitespace-only text nodes are skipped rather than counted: a trailing space left
 * outside the bold run is not a decision anybody made, and letting one cancel the whole
 * answer would make this flicker while typing. An inline atom — a picture, a link chip —
 * carries no marks at all and is likewise not evidence either way; what has to exist is at
 * least one real word, so an empty item gets nothing.
 */
function fullyMarked(paragraph: PMNode, mark: string): boolean {
  let words = 0;
  let marked = 0;

  paragraph.forEach((child) => {
    if (!child.isText || child.text === undefined || child.text.trim() === "") return;
    words += 1;
    if (child.marks.some((each) => each.type.name === mark)) marked += 1;
  });

  return words > 0 && words === marked;
}

export interface MarkedItem {
  pos: number;
  size: number;
  /** The class attribute as it will be written, space-separated. */
  classes: string;
}

/**
 * Every list item whose first paragraph is entirely bold or entirely italic.
 *
 * The answer is returned as plain data rather than as `Decoration`s so a test can read it:
 * a `Decoration`'s attributes are not part of prosemirror-view's public type, and a test
 * that reached into them would compile today and break on an upgrade.
 */
export function markedItems(doc: PMNode): MarkedItem[] {
  const items: MarkedItem[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "listItem") return true;

    // The first child is a paragraph by the schema's own content expression
    // (`paragraph block*`), and it is the line the marker sits beside — a table or a
    // nested list further down the item is not what the bullet introduces.
    const first = node.firstChild;
    if (first === null || first.type.name !== "paragraph") return true;

    const classes = [
      ...(fullyMarked(first, "strong") ? [STRONG_ITEM_CLASS] : []),
      ...(fullyMarked(first, "em") ? [EM_ITEM_CLASS] : []),
    ];
    if (classes.length === 0) return true;

    items.push({ pos, size: node.nodeSize, classes: classes.join(" ") });
    return true;
  });

  return items;
}

function markerStyleDecorations(doc: PMNode): Decoration[] {
  return markedItems(doc).map((item) =>
    Decoration.node(item.pos, item.pos + item.size, { class: item.classes }),
  );
}

export function listMarkerStyle(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: listMarkerStyleKey,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, markerStyleDecorations(state.doc)),
      // Rebuilt rather than mapped, on `tag-decoration.ts`'s measurement: the whole set
      // over the largest note in the corpus costs a fraction of a millisecond against a
      // 16 ms keystroke budget, and a mapped decoration would survive the mark being
      // removed from the one word that made it true.
      apply: (tr, decorations) =>
        tr.docChanged
          ? DecorationSet.create(tr.doc, markerStyleDecorations(tr.doc))
          : decorations,
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
