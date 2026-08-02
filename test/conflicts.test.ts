import { describe, expect, it } from "vitest";
import { findConflictCopies } from "../src/main/conflicts.js";

describe("recognising a OneDrive conflict copy", () => {
  it("pairs a machine-suffixed copy with its original", () => {
    const found = findConflictCopies([
      "00 Inbox/Kickoff project Alpha.md",
      "00 Inbox/Kickoff project Alpha-LAPTOP-ABC123.md",
    ]);

    expect(found).toEqual([
      {
        original: "00 Inbox/Kickoff project Alpha.md",
        conflict: "00 Inbox/Kickoff project Alpha-LAPTOP-ABC123.md",
      },
    ]);
  });

  it("finds nothing when only the conflict copy is present, not the original", () => {
    expect(findConflictCopies(["00 Inbox/Kickoff project Alpha-LAPTOP-ABC123.md"])).toEqual([]);
  });

  it("finds nothing for two unrelated notes", () => {
    expect(
      findConflictCopies(["00 Inbox/Een.md", "00 Inbox/Twee.md"]),
    ).toEqual([]);
  });

  it("finds nothing for a note with no hyphen at all", () => {
    expect(findConflictCopies(["00 Inbox/Gewone titel.md"])).toEqual([]);
  });

  it("does not treat a bare (N) suffix as a conflict — that's uniquePath's own shape", () => {
    // Two notes independently created in the same minute with the same title, exactly
    // what filename.ts's uniquePath produces — not a OneDrive conflict.
    const found = findConflictCopies([
      "00 Inbox/Kickoff.md",
      "00 Inbox/Kickoff (2).md",
    ]);

    expect(found).toEqual([]);
  });

  it("only pairs within the same folder", () => {
    const found = findConflictCopies([
      "00 Inbox/Kickoff project Alpha.md",
      "10 Projects/Kickoff project Alpha-LAPTOP-ABC123.md",
    ]);

    expect(found).toEqual([]);
  });

  it("prefers the smallest removal when several candidates would match", () => {
    // "Kickoff project Alpha" exists directly, so stripping just "-LAPTOP-ABC123" must
    // win over over-stripping down to "Kickoff", even though that also exists.
    const found = findConflictCopies([
      "00 Inbox/Kickoff.md",
      "00 Inbox/Kickoff project Alpha.md",
      "00 Inbox/Kickoff project Alpha-LAPTOP-ABC123.md",
    ]);

    expect(found).toEqual([
      {
        original: "00 Inbox/Kickoff project Alpha.md",
        conflict: "00 Inbox/Kickoff project Alpha-LAPTOP-ABC123.md",
      },
    ]);
  });

  it("handles a machine name that is itself hyphenated, like a Mac hostname", () => {
    const found = findConflictCopies([
      "00 Inbox/Kickoff project Alpha.md",
      "00 Inbox/Kickoff project Alpha-Emiels-MacBook-Pro.md",
    ]);

    expect(found).toEqual([
      {
        original: "00 Inbox/Kickoff project Alpha.md",
        conflict: "00 Inbox/Kickoff project Alpha-Emiels-MacBook-Pro.md",
      },
    ]);
  });

  it("finds every conflict pair when several exist at once", () => {
    const found = findConflictCopies([
      "00 Inbox/Een.md",
      "00 Inbox/Een-LAPTOP-ABC.md",
      "00 Inbox/Twee.md",
      "00 Inbox/Twee-DESKTOP-XYZ.md",
    ]);

    expect(found.map((p) => p.conflict).sort()).toEqual([
      "00 Inbox/Een-LAPTOP-ABC.md",
      "00 Inbox/Twee-DESKTOP-XYZ.md",
    ]);
  });

  it("ignores a non-markdown file even if it has a plausible shape", () => {
    expect(
      findConflictCopies(["00 Inbox/Kickoff.png", "00 Inbox/Kickoff-LAPTOP-ABC123.png"]),
    ).toEqual([]);
  });

  it("is a known false positive for a genuinely hyphenated title with an unhyphenated sibling", () => {
    // Documented limitation, not a bug: a filename-only heuristic cannot tell this
    // apart from a real conflict. See the module's own comment.
    const found = findConflictCopies(["00 Inbox/Weekly Report.md", "00 Inbox/Weekly Report-Draft.md"]);

    expect(found).toEqual([
      { original: "00 Inbox/Weekly Report.md", conflict: "00 Inbox/Weekly Report-Draft.md" },
    ]);
  });

  it("returns nothing for an empty vault", () => {
    expect(findConflictCopies([])).toEqual([]);
  });
});
