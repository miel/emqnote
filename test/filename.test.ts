import { describe, expect, it } from "vitest";
import {
  isoWithOffset,
  MAX_TITLE_LENGTH,
  noteFileName,
  sanitiseFolderName,
  sanitiseTitle,
  timestampPrefix,
} from "../src/main/filename.js";

const BELL = String.fromCharCode(7);
const UNIT_SEPARATOR = String.fromCharCode(31);
const DELETE = String.fromCharCode(127);
const TAB = String.fromCharCode(9);

describe("sanitiseTitle", () => {
  it("leaves an ordinary title alone", () => {
    expect(sanitiseTitle("Kickoff project Alpha")).toBe("Kickoff project Alpha");
  });

  it("replaces the characters Windows forbids", () => {
    expect(sanitiseTitle("Offerte: fase 2 <concept> | 50%")).toBe(
      "Offerte- fase 2 -concept- - 50%",
    );
  });

  it("keeps diacritics, which are perfectly allowed", () => {
    expect(sanitiseTitle("Reünie met José Álvarez")).toBe("Reünie met José Álvarez");
  });

  it("strips control characters without touching the surrounding text", () => {
    expect(sanitiseTitle(`regel${BELL}een${UNIT_SEPARATOR}nog${DELETE}wat`)).toBe(
      "regeleennogwat",
    );
  });

  it("collapses whitespace", () => {
    expect(sanitiseTitle(`  te   veel ${TAB} ruimte  `)).toBe("te veel ruimte");
  });

  it("truncates at eighty characters without leaving half a space", () => {
    const result = sanitiseTitle("woord ".repeat(40));
    expect(result.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(result).toBe(result.trimEnd());
  });

  it("leaves no trailing dot or space", () => {
    // Windows truncates those silently, after which the file can no longer be found.
    expect(sanitiseTitle("Overleg maandag...")).toBe("Overleg maandag");
    expect(sanitiseTitle("Overleg maandag ")).toBe("Overleg maandag");
  });

  it("avoids the names Windows reserves for devices", () => {
    expect(sanitiseTitle("CON")).toBe("CON_");
    expect(sanitiseTitle("com1")).toBe("com1_");
    expect(sanitiseTitle("console")).toBe("console");
  });

  it("falls back to a name when nothing usable is left", () => {
    expect(sanitiseTitle("   ")).toBe("Untitled");
    expect(sanitiseTitle("...")).toBe("Untitled");
  });

  it("counts a name made only of forbidden characters as nothing at all", () => {
    // Reported from a Windows pass (§57g): a note titled `***` landed on disk as
    // `--- .md`. Every one of those characters is illegal on Windows, so all three were
    // replaced by the hyphen — and a run of hyphens is not empty, so the fallback below
    // it never ran. The replacement is what made the name; nothing of it survived.
    expect(sanitiseTitle("***")).toBe("Untitled");
    expect(sanitiseTitle("???")).toBe("Untitled");
    expect(sanitiseTitle("* ? *")).toBe("Untitled");
    expect(sanitiseTitle("---")).toBe("Untitled");
  });

  it("leaves a name alone when the rules did not destroy it", () => {
    // The other side of the rule above, and the reason it is written as "only hyphens,
    // dots and spaces" rather than "no letters": `!` and `#` are perfectly legal in a
    // Windows filename, so a title made of them is a title, however odd. Only what
    // sanitising itself reduced to nothing is nothing.
    expect(sanitiseTitle("!!!")).toBe("!!!");
    expect(sanitiseTitle("#")).toBe("#");
    expect(sanitiseTitle("a/b")).toBe("a-b");
  });
});

describe("sanitiseFolderName", () => {
  it("leaves an ordinary name alone", () => {
    expect(sanitiseFolderName("Klant A")).toBe("Klant A");
  });

  it("applies the rules folder creation used to skip", () => {
    // Only the first of these was handled before: a folder could be created with a
    // control character in it, or called CON, and every note filed inside inherited a
    // path Windows cannot open.
    expect(sanitiseFolderName("Klant: A/B")).toBe("Klant- A-B");
    expect(sanitiseFolderName(`Klant${BELL}${UNIT_SEPARATOR}${DELETE} A`)).toBe("Klant A");
    expect(sanitiseFolderName("CON")).toBe("CON_");
    expect(sanitiseFolderName("prn")).toBe("prn_");
    expect(sanitiseFolderName("Klant A.")).toBe("Klant A");
    expect(sanitiseFolderName("Klant A ")).toBe("Klant A");
  });

  it("collapses whitespace, tabs included", () => {
    expect(sanitiseFolderName(`Klant${TAB}   A`)).toBe("Klant A");
  });

  it("truncates at the same length as a title", () => {
    expect(sanitiseFolderName("x".repeat(200))).toHaveLength(MAX_TITLE_LENGTH);
  });

  it("takes a relative path apart rather than resolving it", () => {
    expect(sanitiseFolderName("..")).toBe("");

    // The separators are what made it a path; without them the dots are just dots and
    // the result names one folder, awkwardly, instead of climbing out of the vault.
    expect(sanitiseFolderName("../../etc")).toBe("..-..-etc");
    expect(sanitiseFolderName("../../etc")).not.toContain("/");
  });

  it("gives back an empty string rather than inventing a name", () => {
    // Unlike a title: a note with nothing to call it still has to land somewhere, while
    // a folder named entirely out of forbidden characters is a mistake worth reporting.
    expect(sanitiseFolderName("   ")).toBe("");
    expect(sanitiseFolderName("...")).toBe("");
    expect(sanitiseTitle("...")).toBe("Untitled");

    // Which is the sentence above finally being true (§57h). A folder named `???` was
    // created as `---`, without a word, and a second one named `***` then silently did
    // nothing at all because that name was already taken.
    expect(sanitiseFolderName("???")).toBe("");
    expect(sanitiseFolderName("***")).toBe("");
    expect(sanitiseFolderName("****")).toBe("");
  });
});

describe("file name", () => {
  it("puts the timestamp first so it sorts chronologically", () => {
    const when = new Date(2026, 6, 25, 14, 32);
    expect(timestampPrefix(when)).toBe("2026-07-25 1432");
    expect(noteFileName("Kickoff project Alpha", when)).toBe(
      "2026-07-25 1432 Kickoff project Alpha.md",
    );
  });

  it("pads hours and minutes to two digits", () => {
    expect(timestampPrefix(new Date(2026, 0, 3, 9, 5))).toBe("2026-01-03 0905");
  });
});

describe("isoWithOffset", () => {
  it("writes a timezone offset rather than a Z", () => {
    const result = isoWithOffset(new Date(2026, 6, 25, 14, 32, 0));
    expect(result).toMatch(/^2026-07-25T14:32:00[+-]\d{2}:\d{2}$/);
  });
});
