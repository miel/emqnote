/**
 * Moving the window by a control that is also a control (B94).
 *
 * Both windows are frameless and their 40px header bands are
 * `-webkit-app-region: drag`, which is what moves them. Chromium hands every press inside
 * such a region to the window move and never to the element under it, so anything
 * clickable in a band has to be `no-drag` — and a `no-drag` element cannot move the window
 * at all. The note's title in the reader has to do both: pressing and travelling moves the
 * window, pressing and releasing opens the rename.
 *
 * There is no CSS that expresses "both", so the press is watched here and the move is done
 * in main (`IPC.windowDrag`). What decides which gesture it was is distance, not time: a
 * hand on a trackpad moves a pixel or two while clicking, and a press that has gone
 * further than that was going somewhere.
 *
 * Screen coordinates throughout, because the window is moving under the pointer while this
 * runs — client coordinates would be measured against an origin that is itself being
 * moved by the thing they are measuring.
 */

/** How far the pointer must travel before a press is a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Watches one press. `onEnd` is told whether the window was actually moved, which is what
 * both callers use to undo what the release would otherwise do.
 *
 * It is optional in the type and no caller omits it any more. The capture window's subject
 * field did, on the reasoning that a click on a text field "only" puts the caret in it —
 * which is a change of focus, and not one anybody asked for by picking the window up
 * (§54b, §59). It puts focus back where it was instead.
 *
 * A click *does* follow a drag here, and that is the part worth knowing: the window moves
 * with the pointer, so the press and the release land on the same element and Chromium
 * fires a click on it exactly as if nothing had happened. Without the suppression, letting
 * go of a dragged title would open the rename every time.
 *
 * The listeners go on `window`, not on the element: the pointer leaves a 15px-tall heading
 * within the first few pixels of any real drag, and a `mouseup` outside it would otherwise
 * never arrive — leaving the move armed for the rest of the session.
 */
export function dragWindowFrom(
  event: { button: number; screenX: number; screenY: number },
  onEnd?: (moved: boolean) => void,
): void {
  // Left button only. A right-click is a context menu and a middle click is nothing here;
  // neither should pick the window up.
  if (event.button !== 0) return;

  const startX = event.screenX;
  const startY = event.screenY;
  let moved = false;

  const onMove = (move: MouseEvent): void => {
    if (!moved) {
      if (
        Math.abs(move.screenX - startX) < DRAG_THRESHOLD_PX &&
        Math.abs(move.screenY - startY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      moved = true;
      // The *press* position, not this one: the window has to keep the grip it was picked
      // up by, and starting from here would make it jump by the threshold on the first
      // move.
      window.emqnote.dragWindow("start", startX, startY);
    }
    window.emqnote.dragWindow("move", move.screenX, move.screenY);
  };

  const onUp = (): void => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    onEnd?.(moved);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
