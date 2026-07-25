import { describe, expect, it } from "vitest";
import {
  isoWithOffset,
  MAX_TITLE_LENGTH,
  noteFileName,
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
