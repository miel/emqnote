import { describe, expect, it } from "vitest";
import type { Facet } from "../src/shared/vault-types.js";
import { MAX_SUGGESTIONS, rankLocations } from "../src/renderer/location-typeahead.js";

/**
 * B73's matching half, tested where it is testable — `tag-typeahead.test.ts`'s shape.
 *
 * The thing worth pinning is what makes this a sibling module rather than another export
 * over there: a location is one value that may contain spaces, so every question is about
 * the whole field.
 */

const VAULT: Facet[] = [
  { name: "Teams", count: 12 },
  { name: "Kantoor Amsterdam", count: 7 },
  { name: "Kantoor Utrecht", count: 4 },
  { name: "Bij de klant", count: 2 },
  { name: "Thuis", count: 1 },
];

const names = (facets: Facet[]): string[] => facets.map((facet) => facet.name);

describe("ranking locations", () => {
  it("offers the vault's own order when nothing is typed", () => {
    // `locationFacets` already returns most-used first, so an empty field is a shortlist
    // of where notes actually get written rather than an alphabet.
    expect(names(rankLocations(VAULT, ""))).toEqual([
      "Teams",
      "Kantoor Amsterdam",
      "Kantoor Utrecht",
      "Bij de klant",
      "Thuis",
    ]);
  });

  it("matches across a space, which is the whole point of not tokenising", () => {
    // "Kantoor Amsterdam" is one location. A token-based matcher would offer completions
    // for "Amsterdam" alone and complete the field to a fragment of its own contents.
    expect(names(rankLocations(VAULT, "kantoor a"))).toEqual(["Kantoor Amsterdam"]);
  });

  it("matches a fragment anywhere in the value", () => {
    expect(names(rankLocations(VAULT, "utr"))).toEqual(["Kantoor Utrecht"]);
  });

  it("lets the shared scorer decide, shorter candidate first", () => {
    // `score`'s own rule, not this module's: the more specific match is usually the
    // shorter one you typed enough of. Worth pinning, because the count is *not* what
    // decides here — Amsterdam is on more notes and still comes second.
    expect(names(rankLocations(VAULT, "kantoor"))).toEqual([
      "Kantoor Utrecht",
      "Kantoor Amsterdam",
    ]);
  });

  it("breaks a genuine tie on how often the location has been used", () => {
    const tied: Facet[] = [
      { name: "Zaal A", count: 2 },
      { name: "Zaal B", count: 9 },
    ];
    expect(names(rankLocations(tied, "zaal"))).toEqual(["Zaal B", "Zaal A"]);
  });

  it("does not offer what is already in the field", () => {
    // Completing to what is already written is an offer to do nothing.
    expect(names(rankLocations(VAULT, "Teams"))).not.toContain("Teams");
  });

  it("ignores case and surrounding space when deciding that", () => {
    expect(names(rankLocations(VAULT, "  teams "))).not.toContain("Teams");
  });

  it("hides only the exact value, leaving the rest to the scorer", () => {
    // "Kantoor Utrecht" hides itself; "Kantoor Amsterdam" then falls away on its own
    // because the typed words are not a subsequence of it, which is `score`'s answer and
    // not this module's. Both together are why the list empties once a value is complete.
    expect(names(rankLocations(VAULT, "Kantoor Utrecht"))).toEqual([]);
    // But a prefix that several still match keeps offering them.
    expect(names(rankLocations(VAULT, "Kantoor"))).toEqual([
      "Kantoor Utrecht",
      "Kantoor Amsterdam",
    ]);
  });

  it("answers nothing when nothing matches", () => {
    expect(rankLocations(VAULT, "zzz")).toEqual([]);
  });

  it("answers nothing when the vault has no locations at all", () => {
    expect(rankLocations([], "")).toEqual([]);
    expect(rankLocations([], "kantoor")).toEqual([]);
  });

  it("never offers more rows than the panel is meant to hold", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      name: `Zaal ${index}`,
      count: 40 - index,
    }));
    expect(rankLocations(many, "")).toHaveLength(MAX_SUGGESTIONS);
    expect(rankLocations(many, "zaal")).toHaveLength(MAX_SUGGESTIONS);
  });
});
