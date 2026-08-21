import { describe, expect, it } from "vitest";
import {
  cleanTagInput,
  extractTags,
  findTags,
  foldTag,
  startsWithTag,
} from "@emqnote/core/markdown/tags";

/**
 * The tag grammar on its own, away from the serializer and the vault.
 *
 * Two callers depend on this file agreeing with itself: the serializer asks
 * `startsWithTag` whether a `#` at the start of a line may stay unescaped, and the vault
 * scanner asks `extractTags` which tags a note carries. If they ever disagree, the app
 * shows a tag it then destroys on the next save.
 */

describe("startsWithTag", () => {
  it("accepts an ordinary tag", () => {
    expect(startsWithTag("#klantx")).toBe(true);
    expect(startsWithTag("#klantx rest of the line")).toBe(true);
  });

  it("accepts letters, digits, underscore, hyphen and slash", () => {
    expect(startsWithTag("#klant_x")).toBe(true);
    expect(startsWithTag("#klant-x")).toBe(true);
    expect(startsWithTag("#klant/offerte")).toBe(true);
    expect(startsWithTag("#offerte2026")).toBe(true);
  });

  it("accepts non-ASCII letters", () => {
    expect(startsWithTag("#begroting")).toBe(true);
    expect(startsWithTag("#förslag")).toBe(true);
    expect(startsWithTag("#発注")).toBe(true);
  });

  it("rejects a heading, which has a space after the hash", () => {
    expect(startsWithTag("# Een kop")).toBe(false);
    expect(startsWithTag("## Een kop")).toBe(false);
    expect(startsWithTag("#")).toBe(false);
  });

  it("rejects a purely numeric tag", () => {
    // Otherwise "#1 prioriteit" and a year would both fill the tag panel with noise.
    expect(startsWithTag("#1")).toBe(false);
    expect(startsWithTag("#2026")).toBe(false);
    expect(startsWithTag("#1a")).toBe(true);
  });

  it("rejects punctuation immediately after the hash", () => {
    expect(startsWithTag("#!")).toBe(false);
    expect(startsWithTag("#.tag")).toBe(false);
  });
});

describe("extractTags", () => {
  it("finds tags at the start of a line and mid-sentence", () => {
    expect(extractTags("#klantx\n")).toEqual(["klantx"]);
    expect(extractTags("Zie #klantx voor details.\n")).toEqual(["klantx"]);
  });

  it("stops at punctuation", () => {
    expect(extractTags("Einde met #klantx.\n")).toEqual(["klantx"]);
    expect(extractTags("Eerst #een, dan #twee; en #drie!\n")).toEqual(["een", "twee", "drie"]);
    expect(extractTags("Tussen haakjes (#klantx) staat het.\n")).toEqual(["klantx"]);
  });

  it("finds tags in bullets and blockquotes", () => {
    expect(extractTags("- #klantx in een bullet\n")).toEqual(["klantx"]);
    expect(extractTags("> #klantx in een citaat\n")).toEqual(["klantx"]);
  });

  it("keeps a hierarchical name whole", () => {
    // Flat by decision: the slash is legal but means nothing to filtering.
    expect(extractTags("#klant/offerte\n")).toEqual(["klant/offerte"]);
    expect(extractTags("#klant/\n")).toEqual(["klant"]);
  });

  it("does not read a hash inside a word or a URL as a tag", () => {
    expect(extractTags("pad#tag is geen tag\n")).toEqual([]);
    expect(extractTags("Zie https://example.com/pagina#anchor voor meer.\n")).toEqual([]);
    expect(extractTags("Mail mailto:jan@example.com#x maar niet.\n")).toEqual([]);
  });

  it("ignores code spans and fenced code", () => {
    expect(extractTags("Gebruik `#define` hier.\n")).toEqual([]);
    expect(extractTags("```\n#!/bin/sh\n#klantx\n```\n")).toEqual([]);
    expect(extractTags("~~~\n#klantx\n~~~\n")).toEqual([]);
  });

  it("resumes scanning after a fence closes", () => {
    expect(extractTags("```\n#binnen\n```\n\n#buiten\n")).toEqual(["buiten"]);
  });

  it("ignores a heading anchor in a wiki link and a link destination", () => {
    expect(extractTags("Zie [[Notitie#Kop]] hierboven.\n")).toEqual([]);
    expect(extractTags("Zie [de pagina](/pad#anchor) hierboven.\n")).toEqual([]);
  });

  it("does not treat a heading as a tag", () => {
    expect(extractTags("## Besluiten\n\nTekst.\n")).toEqual([]);
  });

  it("de-duplicates case-insensitively and keeps the first casing", () => {
    expect(extractTags("#KlantX en later #klantx en #KLANTX\n")).toEqual(["KlantX"]);
  });

  it("returns tags in the order they appear", () => {
    expect(extractTags("#zebra en #appel\n")).toEqual(["zebra", "appel"]);
  });
});

describe("findTags", () => {
  it("reports where the tag sits, hash included", () => {
    const line = "Zie #klantx voor details.";
    expect(findTags(line)).toEqual([{ name: "klantx", start: 4, end: 11 }]);
    expect(line.slice(4, 11)).toBe("#klantx");
  });

  it("reports a tag at the very start of the line", () => {
    expect(findTags("#klantx staat vooraan.")).toEqual([
      { name: "klantx", start: 0, end: 7 },
    ]);
  });

  it("keeps positions correct after a masked code span", () => {
    // The mask must not move anything, or the editor colours the wrong words.
    const line = "Gebruik `#define` en dan #klantx.";
    const [tag] = findTags(line);
    expect(tag).toEqual({ name: "klantx", start: 25, end: 32 });
    expect(line.slice(25, 32)).toBe("#klantx");
  });

  it("keeps positions correct after a masked URL", () => {
    const line = "Zie https://example.com/x#anchor en #klantx.";
    const [tag] = findTags(line);
    expect(line.slice(tag!.start, tag!.end)).toBe("#klantx");
  });

  it("reports several tags in order", () => {
    const line = "#een en #twee";
    expect(findTags(line).map((tag) => line.slice(tag.start, tag.end))).toEqual([
      "#een",
      "#twee",
    ]);
  });

  it("excludes a trailing slash from the reported span", () => {
    const line = "#klant/ hier";
    expect(findTags(line)).toEqual([{ name: "klant", start: 0, end: 6 }]);
    expect(line.slice(0, 6)).toBe("#klant");
  });
});

describe("foldTag and cleanTagInput", () => {
  it("folds for grouping", () => {
    expect(foldTag("KlantX")).toBe("klantx");
  });

  it("accepts a tag typed with or without the hash", () => {
    expect(cleanTagInput(" #klantx ")).toBe("klantx");
    expect(cleanTagInput("klantx")).toBe("klantx");
    expect(cleanTagInput("##klantx")).toBe("klantx");
    expect(cleanTagInput("klant/")).toBe("klant");
  });
});
