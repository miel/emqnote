import { describe, expect, it } from "vitest";
import { createHoverGuard } from "../src/renderer/library/palette-scroll.js";

/**
 * The half of "make the palette lists scroll" that the scrolling itself broke.
 *
 * All three lists set the highlight from `onMouseEnter`, which was harmless while the list
 * never moved: a row could only arrive under the pointer if the pointer went to it. Once
 * the arrow keys scroll, a pointer left resting over the list has row after row slide
 * beneath it and Chromium dispatches a real `mouseenter` for each — so every arrow press
 * was undone by a hover nobody performed. Measured in the running app before this existed:
 * sixty arrow presses moved the selection fifteen rows.
 *
 * The test is the pointer's own coordinates, and every case below is one way of asking
 * "did the hand move, or did the page?".
 */
describe("the palette lists' hover guard", () => {
  it("takes the first hover, which is a pointer arriving over the list", () => {
    const guard = createHoverGuard();
    expect(guard.hover({ clientX: 100, clientY: 200 })).toBe(true);
  });

  it("takes a hover at a new point — the pointer moved to another row", () => {
    const guard = createHoverGuard();
    guard.hover({ clientX: 100, clientY: 200 });
    expect(guard.hover({ clientX: 100, clientY: 229 })).toBe(true);
  });

  it("refuses a hover at the point the last one was at: the list moved, not the hand", () => {
    const guard = createHoverGuard();
    guard.hover({ clientX: 100, clientY: 200 });

    // Three rows scrolling under a stationary pointer, each one a genuine `mouseenter`.
    expect(guard.hover({ clientX: 100, clientY: 200 })).toBe(false);
    expect(guard.hover({ clientX: 100, clientY: 200 })).toBe(false);
    expect(guard.hover({ clientX: 100, clientY: 200 })).toBe(false);
  });

  /**
   * The case with nothing to compare against: the picker opens under a pointer that has
   * been still since before it existed, so the first `mouseenter` it ever sees is one the
   * first arrow press caused. Without `keyboardMoved` that hover is indistinguishable from
   * a hand arriving, and it hijacks the very first keystroke.
   */
  it("refuses the first hover when an arrow key is what moved the list", () => {
    const guard = createHoverGuard();
    guard.keyboardMoved();
    expect(guard.hover({ clientX: 100, clientY: 200 })).toBe(false);
  });

  it("gives the list back to the pointer as soon as it really moves", () => {
    const guard = createHoverGuard();
    guard.keyboardMoved();
    guard.hover({ clientX: 100, clientY: 200 });

    expect(guard.hover({ clientX: 104, clientY: 214 })).toBe(true);
    // And stays with it: the keyboard's claim is cleared by that move, not merely paused.
    expect(guard.hover({ clientX: 104, clientY: 240 })).toBe(true);
  });

  it("lets the keyboard take it back after the pointer had it", () => {
    const guard = createHoverGuard();
    guard.hover({ clientX: 100, clientY: 200 });
    guard.hover({ clientX: 100, clientY: 229 });

    guard.keyboardMoved();
    expect(guard.hover({ clientX: 100, clientY: 229 })).toBe(false);
  });
});
