import { describe, expect, it } from "vitest";
import { selectionClaim } from "../src/renderer/editor/table-drag.js";

/**
 * Whose the selection is after a cell drag (B49).
 *
 * The pointer half of `table-drag.ts` needs a laid-out document and there is none under
 * vitest — `table-selection.test.ts` says so, and it is why the geometry lives as functions
 * over a document. This is the other half of the same argument: the plugin's remaining
 * decision is *when* it stops defending the rectangle it made, that decision needs no
 * layout at all, and it was wrong for as long as nothing could reach it.
 *
 * What was wrong: the claim was released on `mouseup`. The native selection the drag left
 * behind is not read back synchronously — `prosemirror-view`'s DOM observer reads it
 * whenever it next flushes, and under load that is *after* the button comes up. The
 * rectangle was then replaced by a `TextSelection` built out of the DOM, and the user's
 * selection vanished on release. Found on a two-core VM with three busy loops against it,
 * where the drive script's table step failed two runs in three; every failing timeline had
 * `selectionchange` land after `mouseup`, and every passing one had it land before.
 *
 * So the first test below is the regression, and it is deliberately the one that reads
 * strangest: releasing the button must *not* release the claim.
 */

describe("the cell drag's claim on the selection", () => {
  it("is not held before anything has been dragged", () => {
    const claim = selectionClaim();
    claim.drop();

    // A plain click in a cell has to place a caret like any other click. The claim is only
    // taken once a rectangle has actually been dispatched.
    expect(claim.holds(true)).toBe(false);
  });

  it("survives the end of the drag, which is the whole point", () => {
    const claim = selectionClaim();
    claim.drop();
    claim.take();

    // There is no `release` to call on mouseup — that is the fix. The read-back that would
    // overwrite the rectangle has not necessarily happened yet when the button comes up.
    expect(claim.holds(true)).toBe(true);
  });

  it("is dropped by the next gesture, so a click can still place a caret", () => {
    const claim = selectionClaim();
    claim.drop();
    claim.take();
    expect(claim.holds(true)).toBe(true);

    // `mousedown` calls this before anything else it does, and it runs before any
    // `selectionchange` that same click can produce — so the caret lands normally.
    claim.drop();
    expect(claim.holds(true)).toBe(false);
  });

  it("is dropped by a key as readily as by a press, which `v0.12.3` forgot", () => {
    const claim = selectionClaim();
    claim.drop();
    claim.take();

    // The same call, from `keydown`. ProseMirror performs very little caret motion itself
    // — an arrow, Home, End and Ctrl+End are moved by the browser and read back out of the
    // DOM through the very guard this claim arms. With `mousedown` as the only release, a
    // rectangle left the caret unable to move at all until something was clicked: measured
    // in the running app, where Ctrl+End after a drag moved nothing and the `/` menu could
    // not be reached. This is that regression, and it is not a variation on the one above.
    claim.drop();
    expect(claim.holds(true)).toBe(false);
  });

  it("cannot outlast the rectangle it is protecting", () => {
    const claim = selectionClaim();
    claim.drop();
    claim.take();

    // `holds` is asked of the live state, not of anything remembered here. Once the
    // selection is no longer a rectangle — a keyboard command collapsed it, a transaction
    // replaced it — a claim nobody dropped is inert rather than dangerous.
    expect(claim.holds(false)).toBe(false);
  });

  it("can be taken again without being dropped first, as a drag does on every move", () => {
    const claim = selectionClaim();
    claim.drop();
    claim.take();
    claim.take();

    expect(claim.holds(true)).toBe(true);
  });
});
