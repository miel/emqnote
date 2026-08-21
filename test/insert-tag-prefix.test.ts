import { describe, expect, it } from "vitest";
import { insertTagPrefix } from "@emqnote/core/editor";
import {
  markdownOf,
  run,
  stateAt,
  stateSelecting,
  type,
} from "./helpers/editing.js";

describe("insertTagPrefix", () => {
  it("inserts a hash at the caret and leaves typing immediately after it", () => {
    const inserted = run(stateAt("Bespreek dit.\n", "Bespreek "), insertTagPrefix);
    expect(markdownOf(type(inserted, "planning"))).toBe("Bespreek #planningdit.\n");
  });

  it("adds a boundary after a word", () => {
    const inserted = run(stateAt("pad\n", "pad"), insertTagPrefix);
    expect(markdownOf(type(inserted, "tag"))).toBe("pad #tag\n");
  });

  it("does not insert a second hash", () => {
    const state = stateAt("\\#\n", "#");
    expect(markdownOf(run(state, insertTagPrefix))).toBe("\\#\n");
  });

  it("turns a selected word into a tag", () => {
    const inserted = run(stateSelecting("Bespreek planning vandaag.\n", "planning"), insertTagPrefix);
    expect(markdownOf(inserted)).toBe("Bespreek #planning vandaag.\n");
  });

  it("replaces a whitespace selection with one hash", () => {
    const inserted = run(stateSelecting("Voor   na\n", "   "), insertTagPrefix);
    expect(markdownOf(type(inserted, "tag"))).toBe("Voor#tagna\n");
  });
});
