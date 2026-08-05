/**
 * Clamping for the library's two draggable splitters, kept as a pure function so it can
 * be unit-tested without a DOM — see `test/pane-widths.test.ts`.
 */

export interface PaneWidths {
  tree: number;
  notes: number;
}

/** What `library.css:16-23` hardcoded before the splitters existed. */
export const DEFAULT_PANE_WIDTHS: PaneWidths = { tree: 236, notes: 300 };

export const TREE_MIN = 160;
export const TREE_MAX = 420;
export const NOTES_MIN = 200;
export const NOTES_MAX = 640;
/** The reader never shrinks below this, no matter what the two splitters ask for. */
export const READER_MIN = 280;

/**
 * Clamps a proposed pane width pair to their own min/max, then — if the reader would be
 * squeezed below `READER_MIN` — takes the difference back out of whichever pane is being
 * dragged, not out of the reader. `available` is the full width of the `.library` grid in
 * pixels; the reader's width is never tracked directly, only implied by what is left over.
 */
export function clampPaneWidths(
  widths: PaneWidths,
  dragging: "tree" | "notes",
  available: number,
): PaneWidths {
  let tree = Math.min(TREE_MAX, Math.max(TREE_MIN, widths.tree));
  let notes = Math.min(NOTES_MAX, Math.max(NOTES_MIN, widths.notes));

  const reader = available - tree - notes;
  const shortfall = READER_MIN - reader;
  if (shortfall > 0) {
    if (dragging === "tree") tree = Math.max(TREE_MIN, tree - shortfall);
    else notes = Math.max(NOTES_MIN, notes - shortfall);
  }

  return { tree, notes };
}
