import { describe, expect, it } from "vitest";
import {
  clampPaneWidths,
  NOTES_MAX,
  NOTES_MIN,
  READER_MIN,
  TREE_MAX,
  TREE_MIN,
} from "../src/renderer/library/panes.js";

// A wide enough window that no clamp kicks in unless the test itself asks for one — every
// assertion below either stays comfortably inside this or is specifically about what
// happens when it does not.
const AVAILABLE = 1200;

describe("clampPaneWidths", () => {
  it("leaves an ordinary drag alone", () => {
    expect(clampPaneWidths({ tree: 260, notes: 320 }, "tree", AVAILABLE)).toEqual({
      tree: 260,
      notes: 320,
    });
  });

  it("clamps the tree to its own minimum", () => {
    expect(clampPaneWidths({ tree: 40, notes: 320 }, "tree", AVAILABLE)).toEqual({
      tree: TREE_MIN,
      notes: 320,
    });
  });

  it("clamps the tree to its own maximum", () => {
    expect(clampPaneWidths({ tree: 900, notes: 320 }, "tree", AVAILABLE)).toEqual({
      tree: TREE_MAX,
      notes: 320,
    });
  });

  it("clamps the note list to its own minimum", () => {
    expect(clampPaneWidths({ tree: 260, notes: 40 }, "notes", AVAILABLE)).toEqual({
      tree: 260,
      notes: NOTES_MIN,
    });
  });

  it("clamps the note list to its own maximum", () => {
    expect(clampPaneWidths({ tree: 260, notes: 900 }, "notes", AVAILABLE)).toEqual({
      tree: 260,
      notes: NOTES_MAX,
    });
  });

  it("shrinks the tree pane, not the reader, when dragging the tree splitter squeezes the reader", () => {
    // 780 - 300 - 300 = 180, short of READER_MIN(280) by 100 — well inside what the tree
    // can give up before hitting its own TREE_MIN(160), so the shortfall lands on the tree.
    const available = 780;
    const result = clampPaneWidths({ tree: 300, notes: 300 }, "tree", available);
    expect(available - result.tree - result.notes).toBe(READER_MIN);
    expect(result.notes).toBe(300);
    expect(result.tree).toBeLessThan(300);
  });

  it("shrinks the notes pane, not the reader, when dragging the notes splitter squeezes the reader", () => {
    const available = 780;
    const result = clampPaneWidths({ tree: 300, notes: 300 }, "notes", available);
    expect(available - result.tree - result.notes).toBe(READER_MIN);
    expect(result.tree).toBe(300);
    expect(result.notes).toBeLessThan(300);
  });

  it("never shrinks the dragged pane below its own minimum even if the reader still loses out", () => {
    // An implausibly narrow window: even pushing the dragged pane to its floor cannot
    // free up READER_MIN for the reader. The floor still wins — the reader, not either
    // splitter's minimum, is what gives in this corner case.
    const available = 300;
    const result = clampPaneWidths({ tree: 260, notes: 300 }, "tree", available);
    expect(result.tree).toBe(TREE_MIN);
  });

  it("is stable: clamping an already-clamped result changes nothing", () => {
    const once = clampPaneWidths({ tree: 900, notes: 900 }, "tree", 700);
    const twice = clampPaneWidths(once, "tree", 700);
    expect(twice).toEqual(once);
  });
});
