import { describe, expect, it } from "vitest";
import type { Facet } from "../src/shared/vault-types.js";
import { applySuggestion, rankPeople, tokenAt } from "../src/renderer/people-typeahead.js";

/**
 * B81's matching half, tested where it is testable — `tag-typeahead.test.ts`'s shape.
 *
 * What is worth pinning is the one thing this module does differently from the tag one:
 * whitespace does not separate here, because "Jan de Vries" is one name.
 */

const VAULT: Facet[] = [
  { name: "Jan de Vries", count: 12 },
  { name: "Pieter Jansen", count: 7 },
  { name: "Anne Bakker", count: 4 },
  { name: "Karel Smit", count: 1 },
];

const names = (facets: Facet[]): string[] => facets.map((facet) => facet.name);

describe("the name the caret is in", () => {
  it("is bounded by commas and semicolons, never by a space", () => {
    // A separator set that included whitespace would offer completions for "de".
    expect(tokenAt("Jan de Vries, Pieter", 6)).toEqual({
      start: 0,
      end: 12,
      value: "Jan de Vries",
    });
  });

  it("keeps the space the previous accept left behind", () => {
    expect(tokenAt("Jan, Pieter", 8)).toEqual({ start: 4, end: 11, value: " Pieter" });
  });

  it("is the empty one an empty field would start", () => {
    expect(tokenAt("", 0)).toEqual({ start: 0, end: 0, value: "" });
  });

  it("takes a semicolon too, because Outlook uses them", () => {
    expect(tokenAt("Jan; Pieter", 7).value).toBe(" Pieter");
  });
});

describe("accepting a name", () => {
  it("replaces the token and leaves the caret ready for the next", () => {
    expect(applySuggestion("Jan, Pi", 7, "Pieter Jansen")).toEqual({
      text: "Jan, Pieter Jansen, ",
      caret: 20,
    });
  });

  it("does not begin the field with a space", () => {
    expect(applySuggestion("", 0, "Anne Bakker")).toEqual({
      text: "Anne Bakker, ",
      caret: 13,
    });
  });

  it("adds no second separator when one already follows", () => {
    // Completing in the middle of a list otherwise leaves a stray comma, which the field
    // then parses into an empty name.
    const next = applySuggestion("Jan, Pi, Karel Smit", 7, "Pieter Jansen");
    expect(next.text).toBe("Jan, Pieter Jansen, Karel Smit");
    // Past the comma, in the space before the name after it.
    expect(next.caret).toBe(19);
  });
});

describe("ranking people", () => {
  it("offers the vault's own order when nothing is typed", () => {
    // `facets()` already returns most-used first, so an empty field is a shortlist of who
    // actually turns up in these notes rather than an alphabet.
    expect(names(rankPeople(VAULT, "", []))).toEqual([
      "Jan de Vries",
      "Pieter Jansen",
      "Anne Bakker",
      "Karel Smit",
    ]);
  });

  it("matches across a space, the terms in order", () => {
    expect(names(rankPeople(VAULT, "jan vr", []))).toEqual(["Jan de Vries"]);
  });

  it("ignores the spaces around a token, which is how one always arrives", () => {
    expect(names(rankPeople(VAULT, "  anne ", []))).toEqual(["Anne Bakker"]);
  });

  it("does not offer a name the field already holds", () => {
    expect(names(rankPeople(VAULT, "", ["Jan de Vries"]))).toEqual([
      "Pieter Jansen",
      "Anne Bakker",
      "Karel Smit",
    ]);
  });

  it("still offers the name being typed, which is in that list too", () => {
    // It is in `applied` the moment it is fully typed, so excluding it with the rest
    // would make a name disappear from its own list one character before it is accepted.
    expect(names(rankPeople(VAULT, "Anne Bakker", ["Jan de Vries", "Anne Bakker"]))).toEqual([
      "Anne Bakker",
    ]);
  });

  it("folds case, exactly as the vault's own tally does", () => {
    expect(names(rankPeople(VAULT, "", ["jan de vries"]))).not.toContain("Jan de Vries");
  });

  it("breaks a tie on how often the person has been named", () => {
    const tied: Facet[] = [
      { name: "Sam A", count: 2 },
      { name: "Sam B", count: 9 },
    ];
    expect(names(rankPeople(tied, "sam", []))).toEqual(["Sam B", "Sam A"]);
  });
});
