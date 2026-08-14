import { useEffect, useRef, type RefObject } from "react";

/**
 * Keeps a `.palette-list`'s highlighted row in view.
 *
 * The three lists drawn on the palette surface — the note picker (B41), the link picker
 * (B35) and the move dialog — all move a highlight with the arrow keys while focus stays
 * in the filter box above. `.palette-list` scrolls (`max-height: 46vh; overflow-y: auto`
 * in `styles.css`) but nothing ever scrolled it, so once the highlight passed the bottom
 * edge it walked on invisibly and further arrowing looked like a list that simply did not
 * respond. That is the "the list does not scroll" report, and it is one bug in three
 * places rather than three, which is why this is a hook and not a copied effect.
 *
 * `scrollIntoView({ block: "nearest" })` rather than a computed `scrollTop`: nearest is
 * the only option that leaves an already-visible row exactly where it is, and every one of
 * these lists also sets `active` from `onMouseEnter` — a rule that re-centred on every
 * change would make the list twitch under a pointer moving down it.
 *
 * `rows` is whatever the list is drawing, and is a dependency so a fresh set of results
 * scrolls back to the row the new highlight lands on rather than staying where the old
 * list happened to be.
 */
export function useActiveRowVisible(
  list: RefObject<HTMLUListElement | null>,
  active: number,
  rows: unknown,
): void {
  useEffect(() => {
    const row = list.current?.children[active];
    // The `typeof` is not defensive padding: jsdom implements no scrolling at all, so
    // `scrollIntoView` is genuinely absent under `test/`, and every test that mounts one
    // of these pickers would throw out of an effect it has nothing to do with.
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [list, active, rows]);
}

/**
 * Whether a hover really was a hover — the other half of making these lists scroll, and a
 * defect the scrolling itself created.
 *
 * Every one of the three lists sets the highlight from `onMouseEnter`. That was harmless
 * while the list never moved: a row could only arrive under the pointer if the pointer went
 * to it. Now the arrow keys scroll, so a *stationary* pointer resting over the list has row
 * after row slide beneath it, and Chromium dispatches a real `mouseenter` for each one — so
 * arrowing down moved the highlight one row and the hover put it straight back. Measured in
 * the running app: sixty arrow presses advanced the selection by fifteen rows, with the
 * pointer left where the menu that opened the picker had been.
 *
 * The test is the pointer's own coordinates. A boundary event synthesised because the page
 * moved carries the position the pointer is still at, so a hover at the same point as the
 * last one is the list moving rather than the hand. `keyboardMoved()` covers the one case
 * that has no previous point to compare against — the first arrow press after the picker
 * opens, where the pointer may already be over the list and never sent an event.
 *
 * Deliberately not a "suppress hover for 150 ms after a key" timer: that turns a question
 * with an exact answer into a race, and the answer here is exact.
 */
export interface HoverGuard {
  /** Called from every arrow-key handler, before the highlight moves. */
  keyboardMoved: () => void;
  /** Whether a hover over a row should take the highlight. */
  hover: (event: { clientX: number; clientY: number }) => boolean;
}

/**
 * The decision itself, with no React in it — testable directly, the same split
 * `thumbnail-cache.ts` keeps from `thumbnails.ts` and `drag.ts` from `Library.tsx`.
 */
export function createHoverGuard(): HoverGuard {
  let point: { x: number; y: number } | null = null;
  let keyboard = false;

  return {
    keyboardMoved: () => {
      keyboard = true;
    },
    hover: (event) => {
      const previous = point;
      point = { x: event.clientX, y: event.clientY };

      const moved =
        previous === null ? !keyboard : previous.x !== event.clientX || previous.y !== event.clientY;
      if (moved) keyboard = false;
      return moved;
    },
  };
}

/** `createHoverGuard`, kept for the life of the component. */
export function useHoverGuard(): HoverGuard {
  const guard = useRef<HoverGuard | null>(null);
  guard.current ??= createHoverGuard();
  return guard.current;
}
