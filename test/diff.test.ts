import { describe, expect, it } from "vitest";
import { diffLines, diffText } from "../src/main/diff.js";

describe("diffLines", () => {
  it("is all 'same' for identical input", () => {
    expect(diffLines(["een", "twee"], ["een", "twee"])).toEqual([
      { kind: "same", text: "een" },
      { kind: "same", text: "twee" },
    ]);
  });

  it("marks an appended line as added", () => {
    expect(diffLines(["een"], ["een", "twee"])).toEqual([
      { kind: "same", text: "een" },
      { kind: "added", text: "twee" },
    ]);
  });

  it("marks a removed line as removed", () => {
    expect(diffLines(["een", "twee"], ["een"])).toEqual([
      { kind: "same", text: "een" },
      { kind: "removed", text: "twee" },
    ]);
  });

  it("finds a change in the middle without disturbing the lines around it", () => {
    expect(diffLines(["een", "oud", "drie"], ["een", "nieuw", "drie"])).toEqual([
      { kind: "same", text: "een" },
      { kind: "removed", text: "oud" },
      { kind: "added", text: "nieuw" },
      { kind: "same", text: "drie" },
    ]);
  });

  it("is empty for two empty inputs", () => {
    expect(diffLines([], [])).toEqual([]);
  });

  it("marks every line as added when the original was empty", () => {
    expect(diffLines([], ["een", "twee"])).toEqual([
      { kind: "added", text: "een" },
      { kind: "added", text: "twee" },
    ]);
  });

  it("marks every line as removed when the new version is empty", () => {
    expect(diffLines(["een", "twee"], [])).toEqual([
      { kind: "removed", text: "een" },
      { kind: "removed", text: "twee" },
    ]);
  });

  it("handles a total rewrite as a full remove-then-add", () => {
    expect(diffLines(["oud"], ["compleet", "nieuw"])).toEqual([
      { kind: "removed", text: "oud" },
      { kind: "added", text: "compleet" },
      { kind: "added", text: "nieuw" },
    ]);
  });

  it("keeps a repeated line's own identity rather than collapsing it", () => {
    expect(diffLines(["x", "x"], ["x"])).toEqual([
      { kind: "same", text: "x" },
      { kind: "removed", text: "x" },
    ]);
  });
});

describe("diffText", () => {
  it("splits on newlines before diffing", () => {
    expect(diffText("een\ntwee", "een\ndrie")).toEqual([
      { kind: "same", text: "een" },
      { kind: "removed", text: "twee" },
      { kind: "added", text: "drie" },
    ]);
  });

  it("is all 'same' for byte-identical text", () => {
    const text = "---\ntitle: Kickoff\n---\n\nTekst.\n";
    expect(diffText(text, text).every((line) => line.kind === "same")).toBe(true);
  });
});
