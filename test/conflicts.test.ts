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

  it("does not treat duplicateNote's own -copy suffix as a conflict", () => {
    // `duplicateNote` appends "-copy" to the title, which — unguarded — reads exactly
    // like a machine-name suffix: stripping it recovers the original's own file name.
    const found = findConflictCopies([
      "00 Inbox/Kickoff project Alpha.md",
      "00 Inbox/Kickoff project Alpha-copy.md",
    ]);

    expect(found).toEqual([]);
  });

  it("does not treat a second duplicate's -copy (2) suffix as a conflict either", () => {
    const found = findConflictCopies([
      "00 Inbox/Kickoff project Alpha.md",
      "00 Inbox/Kickoff project Alpha-copy.md",
      "00 Inbox/Kickoff project Alpha-copy (2).md",
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

  it("handles a machine name that is itself hyphenated and has an uppercase segment", () => {
    const found = findConflictCopies([
      "00 Inbox/Kickoff project Alpha.md",
      "00 Inbox/Kickoff project Alpha-LAPTOP-4KJ8Q1.md",
    ]);

    expect(found).toEqual([
      {
        original: "00 Inbox/Kickoff project Alpha.md",
        conflict: "00 Inbox/Kickoff project Alpha-LAPTOP-4KJ8Q1.md",
      },
    ]);
  });

  it("misses a mixed-case, no-digit Mac hostname — the accepted cost of the tightened rule", () => {
    // Documented in the module comment: a macOS default hostname like
    // "Emiels-MacBook-Pro" has no all-uppercase-or-digit segment, so this genuinely real
    // conflict copy is not recognised. The safer direction to be wrong in — a missed
    // banner leaves both files visible, a false one offers to trash a note the user wrote.
    const found = findConflictCopies([
      "00 Inbox/Kickoff project Alpha.md",
      "00 Inbox/Kickoff project Alpha-Emiels-MacBook-Pro.md",
    ]);

    expect(found).toEqual([]);
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

  it("no longer treats a genuinely hyphenated title with an unhyphenated sibling as a conflict", () => {
    // This used to be a documented false positive — "Draft" is not machine-shaped, so
    // the tightened rule now correctly leaves it alone.
    const found = findConflictCopies(["00 Inbox/Weekly Report.md", "00 Inbox/Weekly Report-Draft.md"]);

    expect(found).toEqual([]);
  });

  it("does not treat 'herzien', 'Draft2' or 'review' suffixes as machine names", () => {
    const found = findConflictCopies([
      "00 Inbox/Voorstel.md",
      "00 Inbox/Voorstel-herzien.md",
      "00 Inbox/Ontwerp.md",
      "00 Inbox/Ontwerp-Draft2.md",
      "00 Inbox/Plan.md",
      "00 Inbox/Plan-review.md",
    ]);

    expect(found).toEqual([]);
  });

  it("does not treat a purely numeric suffix as a machine name", () => {
    // A version-ish year suffix has no letter in it at all, so it cannot be mistaken
    // for a computer name even though it is short and uppercase-or-digit shaped.
    const found = findConflictCopies([
      "00 Inbox/Quarterly Report.md",
      "00 Inbox/Quarterly Report-2026.md",
    ]);

    expect(found).toEqual([]);
  });

  it("recognises a Windows machine suffix with digits", () => {
    const found = findConflictCopies([
      "00 Inbox/X.md",
      "00 Inbox/X-LAPTOP-4KJ8Q1.md",
    ]);

    expect(found).toEqual([
      { original: "00 Inbox/X.md", conflict: "00 Inbox/X-LAPTOP-4KJ8Q1.md" },
    ]);
  });

  it("returns nothing for an empty vault", () => {
    expect(findConflictCopies([])).toEqual([]);
  });
});
