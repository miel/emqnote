import { Plugin } from "prosemirror-state";
import { CellSelection, cellPointerAt, isCellSelection } from "./table-selection.js";

/**
 * Whether the rectangle on screen belongs to this plugin or to the DOM.
 *
 * A tiny state machine rather than a boolean in the closure, for the reason
 * `table-selection.ts` is a pile of functions over a document: the part of this feature
 * that can be reasoned about without a laid-out page should be reachable by a test, and
 * this part is where the bug was. `table-drag-claim.test.ts` drives it directly.
 *
 * Three calls, and the order between them is the whole point. `begin` on every pointer
 * gesture, `take` when a rectangle has actually been dispatched, and `holds` when
 * `prosemirror-view` asks whether it may build a selection out of the DOM instead.
 */
export interface SelectionClaim {
  /** A new pointer gesture starts: whatever was claimed before is no longer claimed. */
  begin: () => void;
  /** A rectangle was just dispatched, so the selection is this plugin's. */
  take: () => void;
  /**
   * Whether a DOM-derived selection should be refused. `isCell` is asked of the *current*
   * state rather than remembered, so a claim that outlived its rectangle is inert.
   */
  holds: (isCell: boolean) => boolean;
}

export function selectionClaim(): SelectionClaim {
  let claimed = false;

  return {
    begin: () => {
      claimed = false;
    },
    take: () => {
      claimed = true;
    },
    holds: (isCell) => claimed && isCell,
  };
}

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
 * listeners are attached, when they come off again, and — `SelectionClaim` above — whose
 * the selection is once they have.
 *
 * `mousedown` returns `false` on the way in, so ProseMirror still places the caret in the
 * cell that was clicked. The selection only becomes a rectangle once the pointer has
 * actually reached a second cell — a click that never moves must not turn into a selection
 * of the cell it landed in.
 */
export function cellDragging(): Plugin {
  let anchorCell: number | null = null;
  const claim = selectionClaim();

  return new Plugin({
    props: {
      /**
       * While a rectangle is on screen, the browser's own selection is not the answer.
       *
       * This is the line without which the whole feature does not work, and nothing under
       * `test/` could have found it: the pointer is down, so Chromium goes on extending a
       * native text selection across the cells, `prosemirror-view`'s DOM observer reads it
       * back on every `selectionchange` and dispatches a `TextSelection` over the
       * `CellSelection` this plugin has just made. Measured in the running app — a slow
       * drag ended with nothing selected at all, and a fast one with whichever rectangle
       * happened to win the last race.
       *
       * `createSelectionBetween` is the documented way to say "the selection is mine": it
       * is consulted before a DOM-derived selection is built.
       *
       * **The claim outlives `mouseup`, and that is the fix rather than an oversight.** It
       * used to be `anchorCell !== null` — "while the button is down" — which closes the
       * window one event too early. The read-back is not synchronous with the drag: it is
       * whenever the observer next flushes, and under load that lands *after* the button
       * comes up. Caught on a two-core VM with three busy loops against it, where two runs
       * in three failed and every failing timeline had the same shape — four cells
       * selected at `mousemove`, still four at `mouseup`, and gone on the `selectionchange`
       * six milliseconds later. Every passing one had that `selectionchange` arrive
       * *before* `mouseup`. Nothing else differed, which is what made it look like a
       * flaky driver for as long as it did.
       *
       * Still narrow, but along a different axis: the claim is dropped by the next
       * `mousedown` — which runs before any `selectionchange` that click can produce, so a
       * caret placed in a cell is untouched — and `holds` asks the live state whether a
       * rectangle is even there, so a claim can never outlast the thing it is protecting.
       */
      createSelectionBetween: (view) =>
        claim.holds(isCellSelection(view.state.selection)) ? view.state.selection : null,
      handleDOMEvents: {
        mousedown(view, event) {
          if (!(event instanceof MouseEvent) || event.button !== 0) return false;

          // The gesture boundary. Dropped here rather than on `mouseup` so that the
          // selection stays this plugin's until somebody actually reaches for another one
          // — and dropped before anything else, so every path out of this handler leaves
          // the claim in the state that path deserves.
          claim.begin();

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
              claim.take();
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
            claim.take();
            view.dispatch(view.state.tr.setSelection(selection));
          };

          // Deliberately leaves the claim alone: the drag is over, but the rectangle it
          // made is still on screen and still has to be defended from a read-back that has
          // not happened yet. Only `anchorCell` — which is the drag's own anchor, and
          // means nothing once the button is up — is cleared here.
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
