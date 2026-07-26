import { describe, expect, it } from "vitest";
import { parseNote, serializeNote } from "../src/markdown/index.js";

/**
 * Known limitations, recorded as tests.
 *
 * These cases do not round-trip the way an unsuspecting reader would expect. They are
 * here not because they are good, but because they were accepted deliberately: fixing
 * them requires position-aware parsing (looking back into the source text to see
 * whether a character was escaped), and that is a considerable complication for cases
 * that barely occur in work notes.
 *
 * If that judgement ever changes, this file is where it becomes visible.
 */

const header = `---
title: Limitation
type: quick
created: 2026-07-25T12:00:00+02:00
---

`;

function roundtrip(body: string): string {
  const markdown = header + body;
  return serializeNote(parseNote(markdown)).slice(header.length);
}

describe("known limitations", () => {
  it("turns escaped double brackets into a wikilink anyway", () => {
    // Meant as literal text, becomes a reference. The escape is already gone by the
    // time we parse, so the scanner can no longer tell it from a real link.
    expect(roundtrip("Literally: \\[\\[not a wikilink]].\n")).toBe(
      "Literally: [[not a wikilink]].\n",
    );
  });

  it("turns escaped double equals into a highlight anyway", () => {
    expect(roundtrip("Literally: \\=\\=not a highlight\\=\\=.\n")).toBe(
      "Literally: ==not a highlight==.\n",
    );
  });

  it("turns an escaped hash at the start of a line into a live tag", () => {
    // Written by hand as literal text, comes back as a tag. Same cause as the two above:
    // the backslash is gone by the time we parse, so nothing can tell this from a tag
    // that was meant. Nobody writes \# before a word, which is why this is accepted.
    expect(roundtrip("\\#klantx staat vooraan.\n")).toBe("#klantx staat vooraan.\n");
  });
});

describe("guaranteed not a limitation", () => {
  it("leaves a comparison with surrounding spaces alone", () => {
    // The flanking rule: an opening == may not be followed by whitespace. That keeps
    // the only false positive that occurs in practice out of trouble.
    expect(roundtrip("Check whether a == b and whether c == d.\n")).toBe(
      "Check whether a == b and whether c == d.\n",
    );
  });

  it("leaves single square brackets alone", () => {
    expect(roundtrip("See \\[appendix 3] for the details.\n")).toBe(
      "See \\[appendix 3] for the details.\n",
    );
  });

  it("escapes a backslash that would otherwise swallow a punctuation mark", () => {
    expect(roundtrip("Path: dir\\\\\\*name.\n")).toBe("Path: dir\\\\\\*name.\n");
  });

  it("keeps an unpaired highlight marker as plain text", () => {
    expect(roundtrip("Started ==halfway but never finished.\n")).toBe(
      "Started ==halfway but never finished.\n",
    );
  });

  it("keeps escaping a line-start hash that does not open a tag", () => {
    // The exception is narrow: a space after the hash means a heading was meant, and a
    // purely numeric name is not a tag. Both keep the backslash they have always had.
    expect(roundtrip("\\# Dit is geen kop.\n")).toBe("\\# Dit is geen kop.\n");
    expect(roundtrip("\\#2026 was een goed jaar.\n")).toBe("\\#2026 was een goed jaar.\n");
  });
});
