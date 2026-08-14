import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { schema } from "../../markdown/schema.js";
import { cellsInRect } from "./table-geometry.js";
import { isCellSelection } from "./table-selection.js";
import { findTable, type ColumnAlign } from "./table-commands.js";

/**
 * Draws two things CSS alone cannot reach: a column's alignment, and which cell the caret
 * is in (B42).
 *
 * Alignment is per column and lives as an array on the *table* — `align: ["left", null,
 * "center"]`, mirroring the `:---`/`---:` delimiter row. A stylesheet cannot index an
 * array, and `tableCell`'s `toDOM` cannot see which column it is in or ask its parent, so
 * a decoration is what is left. Nothing here changes the document: the file already
 * carried this alignment and round-tripped it correctly since long before the editor could
 * make a table — it simply was not *shown*, so corpus 13 rendered flush left in the one
 * place it was meant to be legible.
 *
 * The active-cell outline is here rather than in its own plugin because it is the same
 * walk over the same nodes, and a second plugin doing it again on every selection change
 * would be the more expensive of the two options for no gain. B49's selected *rectangle*
 * joined it for the same reason, and replaces that outline rather than drawing over it.
 */
export function tableDecorations(): Plugin {
  const tableType = schema.nodes.table!;

  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];

        state.doc.descendants((node, pos) => {
          if (node.type !== tableType) return true;

          const align = (node.attrs.align as ColumnAlign[] | undefined) ?? [];
          // Nothing to draw for a table with no alignment set — the overwhelmingly
          // common case, and worth not walking every cell of.
          if (align.every((value) => value === null || value === undefined)) return false;

          let rowPos = pos + 1;
          for (let r = 0; r < node.childCount; r += 1) {
            const row = node.child(r);
            let cellPos = rowPos + 1;

            for (let c = 0; c < row.childCount; c += 1) {
              const wanted = align[c];
              if (wanted !== null && wanted !== undefined) {
                decorations.push(
                  Decoration.node(cellPos, cellPos + row.child(c).nodeSize, {
                    "data-align": wanted,
                  }),
                );
              }
              cellPos += row.child(c).nodeSize;
            }

            rowPos += row.nodeSize;
          }

          // A table cannot contain a table, so there is nothing below this worth walking.
          return false;
        });

        // A selected rectangle (B49) is drawn instead of the single-cell outline, never
        // beside it: two highlights over one table read as two different things being
        // selected. `visible = false` on the selection is the other half — the browser
        // draws nothing of its own, so this is all there is to see.
        if (isCellSelection(state.selection)) {
          for (const cell of cellsInRect(state.selection.rect())) {
            decorations.push(
              Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, {
                class: "table-cell-selected",
              }),
            );
          }

          return decorations.length === 0 ? null : DecorationSet.create(state.doc, decorations);
        }

        const context = findTable(state);
        if (context !== null) {
          const row = context.node.child(Math.min(context.row, context.node.childCount - 1));
          const cell = Math.min(context.cell, row.childCount - 1);

          let at = context.pos + 1;
          for (let r = 0; r < Math.min(context.row, context.node.childCount - 1); r += 1) {
            at += context.node.child(r).nodeSize;
          }
          at += 1;
          for (let c = 0; c < cell; c += 1) at += row.child(c).nodeSize;

          decorations.push(
            Decoration.node(at, at + row.child(cell).nodeSize, { class: "table-cell-on" }),
          );
        }

        return decorations.length === 0 ? null : DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
