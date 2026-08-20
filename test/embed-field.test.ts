import { describe, expect, it } from "vitest";
import {
  normaliseDimension,
  readEmbedField,
  splitSizeSuffix,
  withSizeSuffix,
  writeEmbedField,
} from "../src/markdown/embed-field.js";

/**
 * The one place B74's pipe field is spelled, on its own.
 *
 * `![[foto.png|…]]` has a single slot and Obsidian reads it three ways by pattern-matching
 * the string in it — a bare number is a width, `WxH` is a box, anything else is alt text.
 * This app follows that exactly (B7), and it is one module rather than two because a
 * remote picture carries the same suffix on its alt text: two spellings of one syntax is
 * how a paste and a reopen come to disagree about the same characters.
 *
 * The rule worth pinning hardest is that **nothing in the slot is discarded**. Refusing to
 * understand something must never mean refusing to keep it, so the cases below that answer
 * "not a size" all have to come back out of `writeEmbedField` unchanged.
 */

describe("readEmbedField", () => {
  it("reads a bare number as a width", () => {
    expect(readEmbedField("400")).toEqual({ width: 400, height: null, alt: null });
    expect(readEmbedField(" 400 ")).toEqual({ width: 400, height: null, alt: null });
  });

  it("reads WxH as a box", () => {
    expect(readEmbedField("250x180")).toEqual({ width: 250, height: 180, alt: null });
  });

  it("reads anything else as alt text, verbatim", () => {
    expect(readEmbedField("een foto van het kantoor")).toEqual({
      width: null,
      height: null,
      alt: "een foto van het kantoor",
    });
    expect(readEmbedField("40%")).toEqual({ width: null, height: null, alt: "40%" });
  });

  it("keeps a capital X as alt text rather than canonicalising it", () => {
    // Checked in Obsidian: `![[foto.png|250X180]]` does not resize there either, so this
    // is agreement and not a divergence. Keeping the string verbatim rather than
    // canonicalising it to `250x180` is then free, and it avoids rewriting a character
    // nobody asked this app to touch.
    expect(readEmbedField("250X180")).toEqual({ width: null, height: null, alt: "250X180" });
  });

  it("keeps a number outside the bounds instead of clamping or dropping it", () => {
    // The whole point: not understanding it is no reason to lose it. `|4` comes back `|4`.
    expect(readEmbedField("4")).toEqual({ width: null, height: null, alt: "4" });
    expect(readEmbedField("99999")).toEqual({ width: null, height: null, alt: "99999" });
    expect(readEmbedField("250x4")).toEqual({ width: null, height: null, alt: "250x4" });
  });

  it("tells no pipe apart from an empty one", () => {
    // `![[foto.png]]` against `![[foto.png|]]`. The second has a slot that is there and
    // empty, and writing it back without the pipe would change bytes this app was only
    // passing through.
    expect(readEmbedField(undefined)).toEqual({ width: null, height: null, alt: null });
    expect(readEmbedField("")).toEqual({ width: null, height: null, alt: "" });
  });
});

describe("writeEmbedField", () => {
  it("is the other direction for all three readings", () => {
    expect(writeEmbedField({ width: 400, height: null, alt: null })).toBe("400");
    expect(writeEmbedField({ width: 250, height: 180, alt: null })).toBe("250x180");
    expect(writeEmbedField({ width: null, height: null, alt: "onderschrift" })).toBe(
      "onderschrift",
    );
    expect(writeEmbedField({ width: null, height: null, alt: null })).toBeNull();
  });

  it("round-trips everything the reader accepted, understood or not", () => {
    for (const suffix of ["400", "250x180", "onderschrift", "250X180", "4", "40%", ""]) {
      expect(writeEmbedField(readEmbedField(suffix))).toBe(suffix);
    }
  });
});

describe("splitSizeSuffix", () => {
  it("takes a size off the end of an alt text", () => {
    expect(splitSizeSuffix("Grafiek|400")).toEqual({ text: "Grafiek", width: 400, height: null });
    expect(splitSizeSuffix("Grafiek|250x180")).toEqual({
      text: "Grafiek",
      width: 250,
      height: 180,
    });
    expect(splitSizeSuffix("|240")).toEqual({ text: "", width: 240, height: null });
  });

  it("leaves an alt whose tail is not a size entirely alone, pipe and all", () => {
    // Unlike an embed there is no "the whole slot is alt text" case here: the alt is the
    // head, so a tail that is not a size is simply part of it.
    expect(splitSizeSuffix("Grafiek|kwartaal")).toEqual({
      text: "Grafiek|kwartaal",
      width: null,
      height: null,
    });
    expect(splitSizeSuffix("Grafiek")).toEqual({ text: "Grafiek", width: null, height: null });
  });

  it("splits on the last pipe, an alt being allowed to contain several", () => {
    expect(splitSizeSuffix("Voor|na|400")).toEqual({ text: "Voor|na", width: 400, height: null });
  });
});

describe("withSizeSuffix", () => {
  it("writes nothing at all without a width", () => {
    expect(withSizeSuffix("foto.png", 400, null)).toBe("foto.png|400");
    expect(withSizeSuffix("foto.png", 250, 180)).toBe("foto.png|250x180");
    expect(withSizeSuffix("foto.png", null, null)).toBe("foto.png");
  });
});

describe("normaliseDimension", () => {
  it("rounds a number a drag produced", () => {
    expect(normaliseDimension(320.4)).toBe(320);
    expect(normaliseDimension(320.6)).toBe(321);
  });

  it("answers null for anything that could not be written down", () => {
    // A `setNodeMarkup` carrying a NaN would put an unserialisable attribute in the
    // document, and the schema validates nothing of its own.
    for (const value of [NaN, Infinity, -Infinity, "400", null, undefined, 4, 99999]) {
      expect(normaliseDimension(value)).toBeNull();
    }
  });
});
