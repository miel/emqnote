import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "../src/main/search-query.js";

describe("parsing a search box query", () => {
  it("is all free text when there are no filters", () => {
    expect(parseSearchQuery("offerte klant")).toEqual({
      text: "offerte klant",
      type: null,
      attendee: null,
      tag: null,
      after: null,
      before: null,
    });
  });

  it("pulls out a type filter", () => {
    expect(parseSearchQuery("type:meeting")).toMatchObject({ text: "", type: "meeting" });
    expect(parseSearchQuery("type:quick")).toMatchObject({ text: "", type: "quick" });
  });

  it("pulls out a tag filter", () => {
    expect(parseSearchQuery("tag:klantx")).toMatchObject({ text: "", tag: "klantx" });
  });

  it("pulls out an unquoted attendee", () => {
    expect(parseSearchQuery("attendee:Marieke")).toMatchObject({
      text: "",
      attendee: "Marieke",
    });
  });

  it("pulls out a quoted attendee with a space in it", () => {
    expect(parseSearchQuery('attendee:"Jan de Vries"')).toMatchObject({
      text: "",
      attendee: "Jan de Vries",
    });
  });

  it("pulls out after and before as ISO dates", () => {
    expect(parseSearchQuery("after:2026-01-01 before:2026-12-31")).toMatchObject({
      text: "",
      after: "2026-01-01",
      before: "2026-12-31",
    });
  });

  it("combines free text with every filter at once, in the design doc's own example", () => {
    expect(
      parseSearchQuery('offerte type:meeting attendee:"Jan de Vries" tag:klantx after:2026-01-01'),
    ).toEqual({
      text: "offerte",
      type: "meeting",
      attendee: "Jan de Vries",
      tag: "klantx",
      after: "2026-01-01",
      before: null,
    });
  });

  it("keeps free text on either side of a filter, joined without the filter", () => {
    expect(parseSearchQuery("voor tag:klantx na")).toMatchObject({ text: "voor na", tag: "klantx" });
  });

  it("falls back to free text for an unknown key", () => {
    expect(parseSearchQuery("status:done")).toEqual({
      text: "status:done",
      type: null,
      attendee: null,
      tag: null,
      after: null,
      before: null,
    });
  });

  it("falls back to free text for an invalid type value", () => {
    expect(parseSearchQuery("type:archived")).toMatchObject({ text: "type:archived", type: null });
  });

  it("falls back to free text for an invalid date", () => {
    expect(parseSearchQuery("after:volgende-week")).toMatchObject({
      text: "after:volgende-week",
      after: null,
    });
  });

  it("falls back to free text for a quoted unknown key, quotes and all", () => {
    expect(parseSearchQuery('location:"Grote zaal"')).toMatchObject({
      text: 'location:"Grote zaal"',
    });
  });

  it("takes the last value when a filter is typed twice", () => {
    expect(parseSearchQuery("tag:eerste tag:tweede")).toMatchObject({ tag: "tweede" });
  });

  it("is all-empty for a blank query", () => {
    expect(parseSearchQuery("")).toEqual({
      text: "",
      type: null,
      attendee: null,
      tag: null,
      after: null,
      before: null,
    });
    expect(parseSearchQuery("   ")).toEqual({
      text: "",
      type: null,
      attendee: null,
      tag: null,
      after: null,
      before: null,
    });
  });

  it("treats key case-insensitively", () => {
    expect(parseSearchQuery("Tag:klantx TYPE:meeting")).toMatchObject({
      tag: "klantx",
      type: "meeting",
    });
  });

  it("collapses irregular whitespace between words", () => {
    expect(parseSearchQuery("offerte   klant")).toMatchObject({ text: "offerte klant" });
  });
});
