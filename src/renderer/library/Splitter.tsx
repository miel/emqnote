import type { KeyboardEvent, PointerEvent } from "react";

/** How far an arrow-key press moves the boundary — makes it reachable without a mouse. */
const NUDGE_PX = 16;

interface SplitterProps {
  /** Where the strip sits, as a CSS length — usually a `var(--tree-width)`-style calc. */
  left: string;
  label: string;
  /** Called with the pointer's horizontal movement since the last call, in pixels. */
  onDrag: (deltaX: number) => void;
  /** Fires once, when the drag (pointer or keyboard) ends — this is where the width is saved. */
  onDragEnd: () => void;
}

/**
 * A grab strip between two library panes.
 *
 * Pointer-events only: `setPointerCapture` keeps every `pointermove` routed to this
 * element even once the cursor leaves the thin strip, so there is no global `mousemove`
 * listener to add on drag start and remember to remove on drag end.
 */
export function Splitter({ left, label, onDrag, onDragEnd }: SplitterProps): React.ReactElement {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onDrag(event.movementX);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onDragEnd();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onDrag(-NUDGE_PX);
      onDragEnd();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onDrag(NUDGE_PX);
      onDragEnd();
    }
  };

  return (
    <div
      className="pane-splitter"
      style={{ left }}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      // **Out of the tab order** (B94). The window's Tab walk is the order the eye reads
      // in — folders, notes, title, the four fields, the note — and two grab strips
      // between the panes were two presses of nothing on the way through it, twice per
      // lap. `-1` rather than removing the handler: a click still focuses the strip, so
      // the arrow-key nudge below goes on working for anyone who has hold of it, and
      // `role="separator"` still names it for a screen reader walking the window.
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
