import { describe, expect, it } from "vitest";
import { MIN_DRAG_WIDTH, RESIZE_CORNERS, resizeWidth } from "../src/renderer/editor/image-resize.js";

/**
 * The arithmetic behind B74's corner drag, on its own.
 *
 * `table-geometry.ts` beside `table-drag.ts`, for that split's reason: `resizeWidth` is
 * numbers in and a number out, so it is tested directly, while everything about which
 * listener goes where needs a laid-out document and a real pointer. What this file cannot
 * see — that the handle is reachable, that `stopEvent` lets the picture through, that the
 * transaction lands once — is what the live pass is for.
 */

/** A landscape picture, 2:1, the shape a screenshot usually is. */
const RATIO = 2;

describe("resizeWidth", () => {
  it("follows the pointer exactly on a horizontal drag", () => {
    expect(resizeWidth(300, 60, 0, "se", RATIO, 1000)).toBe(360);
    expect(resizeWidth(300, -60, 0, "se", RATIO, 1000)).toBe(240);
  });

  it("grows a west handle when the pointer goes left", () => {
    // The handle is on the far side of the picture, so away from it is outwards. Getting
    // this backwards makes two of the four corners fight the hand.
    expect(resizeWidth(300, -60, 0, "sw", RATIO, 1000)).toBe(360);
    expect(resizeWidth(300, -60, 0, "nw", RATIO, 1000)).toBe(360);
  });

  it("grows a north handle when the pointer goes up", () => {
    // 40px of upward movement is 40px of height, which at 2:1 is 80px of width.
    expect(resizeWidth(300, 0, -40, "nw", RATIO, 1000)).toBe(380);
    expect(resizeWidth(300, 0, -40, "sw", RATIO, 1000)).toBe(220);
  });

  it("takes the axis that moved further, rather than averaging the two", () => {
    // The corner is pushed both ways at once and the proportions are locked, so the two
    // axes disagree about the answer. Averaging them makes a straight sideways drag move
    // at half speed, which is what this is written against: 100px right and 5px down is a
    // sideways drag, and the width follows the hand.
    expect(resizeWidth(300, 100, 5, "se", RATIO, 1000)).toBe(400);
    // …and the other way round: barely sideways, mostly down.
    expect(resizeWidth(300, 5, 100, "se", RATIO, 1000)).toBe(500);
  });

  it("never goes below the floor or past the column", () => {
    expect(resizeWidth(300, -10000, 0, "se", RATIO, 1000)).toBe(MIN_DRAG_WIDTH);
    expect(resizeWidth(300, 10000, 0, "se", RATIO, 1000)).toBe(1000);
  });

  it("keeps the floor even when the column is narrower than it", () => {
    // A note pane dragged very narrow. A ceiling below the floor would otherwise invert
    // the clamp and answer something between the two, or nothing sensible at all.
    expect(resizeWidth(300, 0, 0, "se", RATIO, 10)).toBe(MIN_DRAG_WIDTH);
  });

  it("answers a whole number of pixels", () => {
    // The value goes into the file, so a drag that produced 320.4 would rewrite the note
    // on every grab without changing what is on screen.
    expect(resizeWidth(300.4, 19.3, 0, "se", RATIO, 1000)).toBe(320);
    expect(Number.isInteger(resizeWidth(300, 7.7, 3.1, "ne", 1.618, 1000))).toBe(true);
  });

  it("stands still for a drag that has not moved", () => {
    for (const corner of RESIZE_CORNERS) {
      expect(resizeWidth(300, 0, 0, corner, RATIO, 1000)).toBe(300);
    }
  });
});
