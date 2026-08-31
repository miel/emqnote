import { describe, expect, it } from "vitest";
import {
  actOn,
  rangeBetween,
  sharedFolder,
  toggleMarked,
} from "../src/renderer/library/multi-select.js";

/**
 * The rules behind marking several notes at once (B94), which need no DOM to answer —
 * `drag.ts` and `panes.ts` are tested the same way and for the same reason. What a click
 * with a modifier *does* to a real list is `note-list-multi-select.test.ts`.
 */

const LIST = ["a.md", "b.md", "c.md", "d.md"];

describe("the range a Shift+click covers", () => {
  it("runs from one row to the other, inclusive", () => {
    expect(rangeBetween(LIST, "b.md", "d.md")).toEqual(["b.md", "c.md", "d.md"]);
  });

  it("reads the same dragged upwards", () => {
    // A range is built by shift-clicking above the anchor as often as below it.
    expect(rangeBetween(LIST, "d.md", "b.md")).toEqual(["b.md", "c.md", "d.md"]);
  });

  it("is one row when both ends are the same row", () => {
    expect(rangeBetween(LIST, "b.md", "b.md")).toEqual(["b.md"]);
  });

  it("falls back to the row clicked when the anchor has left the list", () => {
    // A note moved out from under the anchor — the list is reloaded and the remembered
    // row is not in it. There is no range to speak of, and the press still has to mean
    // something.
    expect(rangeBetween(LIST, "gone.md", "c.md")).toEqual(["c.md"]);
  });
});

describe("what a Ctrl+click adds", () => {
  it("folds in the open note as well as the row clicked", () => {
    // The first Ctrl+click is two rows, not one: the note in the reader is visibly
    // selected, and a set that left it out would act on one note fewer than the screen
    // said.
    expect(toggleMarked(LIST, [], "a.md", "c.md")).toEqual(["a.md", "c.md"]);
  });

  it("adds to a set that already exists", () => {
    expect(toggleMarked(LIST, ["a.md", "c.md"], "a.md", "b.md")).toEqual([
      "a.md",
      "b.md",
      "c.md",
    ]);
  });

  it("returns them in the list's own order, not the order they were clicked", () => {
    expect(toggleMarked(LIST, ["d.md", "a.md"], "a.md", "b.md")).toEqual([
      "a.md",
      "b.md",
      "d.md",
    ]);
  });

  it("takes a row back out", () => {
    expect(toggleMarked(LIST, ["a.md", "b.md", "c.md"], "a.md", "b.md")).toEqual([
      "a.md",
      "c.md",
    ]);
  });

  it("empties the set rather than leaving one row marked", () => {
    // One mark is the ordinary state of a list with one note open. Leaving it behind
    // would leave the pane in a mode nobody can see they are in.
    expect(toggleMarked(LIST, ["a.md", "b.md"], "a.md", "b.md")).toEqual([]);
  });

  it("marks nothing when there is no open note to fold in", () => {
    // Nothing selected and one row Ctrl+clicked: one row is not a set, so this is the
    // rule above rather than a special case.
    expect(toggleMarked(LIST, [], null, "c.md")).toEqual([]);
  });
});

describe("which notes a gesture means", () => {
  it("is the set when the gesture started inside it", () => {
    expect(actOn(["a.md", "b.md"], "b.md")).toEqual(["a.md", "b.md"]);
  });

  it("is the one row when it started anywhere else", () => {
    // A right-click or a drag somewhere else is about somewhere else, and must not
    // silently act on a set still marked further up the list.
    expect(actOn(["a.md", "b.md"], "d.md")).toEqual(["d.md"]);
  });

  it("is the one row when nothing is marked at all, which is nearly always", () => {
    expect(actOn([], "d.md")).toEqual(["d.md"]);
  });
});

describe("the folder the Move dialog leaves out", () => {
  it("is the one they all live in", () => {
    expect(sharedFolder(["00 Inbox/a.md", "00 Inbox/b.md"])).toBe("00 Inbox");
  });

  it("is nothing when the set is spread across folders", () => {
    // With the set split, every folder in the vault is a real destination for something
    // in it — so the list leaves nothing out.
    expect(sharedFolder(["00 Inbox/a.md", "01 Projecten/b.md"])).toBeNull();
  });

  it("is the vault root for a note that lives in it", () => {
    // "" is a real folder, and `null` is the answer to a different question — which is
    // why this cannot be written as a falsy check anywhere downstream.
    expect(sharedFolder(["a.md"])).toBe("");
  });
});
