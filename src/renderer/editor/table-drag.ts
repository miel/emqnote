import { Plugin } from "prosemirror-state";
import { CellSelection, cellPointerAt, isCellSelection } from "./table-selection.js";

/**
 * Selecting a rectangle of cells with the pointer (B49).
 *
 * Dragging from one cell into another sets a `CellSelection`; Shift+click extends the one
 * that is already there. A drag that stays inside a single cell is left entirely alone, so
 * selecting a word in a cell works exactly as it did.
 *
 * The plugin is deliberately thin. Everything it decides — is this position in a cell, are
 * these two cells in the same table — lives in `table-selection.ts` as a function over a
 * document, because `posAtCoords` needs a laid-out document and the test environment has no
 * layout at all. What is left here is the part that genuinely is about the mouse: which
 * listeners are attached, and when they come off again.
 *
 * `mousedown` returns `false` on the way in, so ProseMirror still places the caret in the
 * cell that was clicked. The selection only becomes a rectangle once the pointer has
 * actually reached a second cell — a click that never moves must not turn into a selection
 * of the cell it landed in.
 */
export function cellDragging(): Plugin {
  let anchorCell: number | null = null;

  return new Plugin({
    props: {
      /**
       * While a cell drag is running, the browser's own selection is not the answer.
       *
       * This is the line without which the whole feature does not work, and nothing under
       * `test/` could have found it: the pointer is still down, so Chromium goes on
       * extending a native text selection across the cells, `prosemirror-view`'s DOM
       * observer reads it back on every `selectionchange` and dispatches a `TextSelection`
       * over the `CellSelection` this plugin has just made. Measured in the running app —
       * a slow drag ended with nothing selected at all, and a fast one with whichever
       * rectangle happened to win the last race.
       *
       * `createSelectionBetween` is the documented way to say "the selection is mine": it
       * is consulted before a DOM-derived selection is built. Narrow on purpose — only
       * while the button is down *and* a rectangle already exists, so selecting text inside
       * one cell is untouched.
       */
      createSelectionBetween: (view) =>
        anchorCell !== null && isCellSelection(view.state.selection)
          ? view.state.selection
          : null,
      handleDOMEvents: {
        mousedown(view, event) {
          if (!(event instanceof MouseEvent) || event.button !== 0) return false;

          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (at === null || at === undefined) return false;

          const cell = cellPointerAt(view.state.doc, at.pos);
          if (cell === null) {
            anchorCell = null;
            return false;
          }

          // Shift+click extends from wherever the rectangle already started, which is what
          // makes a large table selectable without dragging across it — and what every
          // list, grid and file manager does with the same chord.
          if (event.shiftKey) {
            const from = isCellSelection(view.state.selection)
              ? view.state.selection.$anchorCell.pos
              : cellPointerAt(view.state.doc, view.state.selection.from);
            const extended =
              from === null ? null : CellSelection.between(view.state.doc, from, cell);

            if (extended !== null) {
              event.preventDefault();
              view.dispatch(view.state.tr.setSelection(extended));
              return true;
            }
            return false;
          }

          anchorCell = cell;

          const move = (moved: MouseEvent): void => {
            if (anchorCell === null) return;

            const over = view.posAtCoords({ left: moved.clientX, top: moved.clientY });
            if (over === null || over === undefined) return;

            const overCell = cellPointerAt(view.state.doc, over.pos);
            if (overCell === null || overCell === anchorCell) return;

            const selection = CellSelection.between(view.state.doc, anchorCell, overCell);
            if (selection === null) return;
            if (selection.eq(view.state.selection)) return;

            // The native text selection would otherwise go on being painted across the
            // cells underneath the decoration — two selections arguing, which is the state
            // this whole feature exists to replace.
            moved.preventDefault();
            view.dispatch(view.state.tr.setSelection(selection));
          };

          const up = (): void => {
            anchorCell = null;
            view.dom.ownerDocument.removeEventListener("mousemove", move);
            view.dom.ownerDocument.removeEventListener("mouseup", up);
          };

          // On the document rather than the editor: a drag that leaves the window still
          // ends, and a `mouseup` outside `view.dom` must not leave the listeners behind.
          view.dom.ownerDocument.addEventListener("mousemove", move);
          view.dom.ownerDocument.addEventListener("mouseup", up);

          return false;
        },
      },
    },
  });
}
