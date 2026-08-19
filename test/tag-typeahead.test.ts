import { describe, expect, it } from "vitest";
import { applySuggestion, rankTags, tokenAt } from "../src/renderer/tag-typeahead.js";
import type { Facet } from "../src/shared/vault-types.js";

const facets = (...entries: [string, number][]): Facet[] =>
  entries.map(([name, count]) => ({ name, count }));

describe("tokenAt", () => {
  it("finds the only token", () => {
    expect(tokenAt("#klantx", 4)).toEqual({ start: 0, end: 7, value: "#klantx" });
  });

  it("finds the token the caret is in, not the whole field", () => {
    // The field holds a list. Completing all of it is the version that breaks the moment
    // a second tag is typed.
    expect(tokenAt("#offerte #kl", 12)).toEqual({ start: 9, end: 12, value: "#kl" });
  });

  it("finds a token in the middle", () => {
    expect(tokenAt("#a #bb #c", 5)).toEqual({ start: 3, end: 6, value: "#bb" });
  });

  it("answers an empty token after a separator", () => {
    expect(tokenAt("#klantx ", 8)).toEqual({ start: 8, end: 8, value: "" });
  });

  it("treats a comma as a separator, like the field's own parsing does", () => {
    expect(tokenAt("#a,#bb", 6)).toEqual({ start: 3, end: 6, value: "#bb" });
  });

  it("clamps a caret past the end", () => {
    expect(tokenAt("#a", 99)).toEqual({ start: 0, end: 2, value: "#a" });
  });
});

describe("applySuggestion", () => {
  it("replaces the token and leaves a trailing space", () => {
    expect(applySuggestion("#kl", 3, "klantx")).toEqual({ text: "#klantx ", caret: 8 });
  });

  it("leaves the tags around it alone", () => {
    expect(applySuggestion("#offerte #kl #q3", 12, "klantx")).toEqual({
      text: "#offerte #klantx #q3",
      caret: 17,
    });
  });
});

describe("rankTags", () => {
  it("orders by the vault's own count when nothing is typed", () => {
    expect(rankTags(facets(["klantx", 24], ["offerte", 3]), "", []).map((f) => f.name)).toEqual([
      "klantx",
      "offerte",
    ]);
  });

  it("filters on what is typed, hash or no hash", () => {
    const all = facets(["klantx", 24], ["klachten", 1], ["offerte", 3]);
    expect(rankTags(all, "#kl", []).map((f) => f.name)).toEqual(["klantx", "klachten"]);
    expect(rankTags(all, "kl", []).map((f) => f.name)).toEqual(["klantx", "klachten"]);
  });

  it("drops what the note already carries", () => {
    const all = facets(["klantx", 24], ["klachten", 1]);
    expect(rankTags(all, "kl", ["klantx"]).map((f) => f.name)).toEqual(["klachten"]);
  });

  it("still offers the tag currently being typed", () => {
    // It is in `applied` because the field already holds it — it is the token being
    // completed. Excluding it would make a fully typed tag vanish from its own list.
    const all = facets(["klantx", 24]);
    expect(rankTags(all, "klantx", ["klantx"]).map((f) => f.name)).toEqual(["klantx"]);
  });

  it("folds case when deciding what is already applied", () => {
    expect(rankTags(facets(["KlantX", 2]), "kl", ["klantx"])).toEqual([]);
  });

  it("does not offer a tag the note body already carries", () => {
    // B65 hoists the body's tags into the frontmatter on save, so completing the field
    // to one would write nothing at all — and the chip saying the note has it is drawn
    // right beside the field.
    const all = facets(["klantx", 24], ["klachten", 1]);
    expect(rankTags(all, "kl", ["klantx"]).map((f) => f.name)).toEqual(["klachten"]);
  });
});
