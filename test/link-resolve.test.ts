import { describe, expect, it } from "vitest";
import {
  linkTargetFor,
  resolveWikiLinkTarget,
  type LinkCandidate,
} from "../src/main/link-resolve.js";

/**
 * What a `[[…]]` target points at (B35).
 *
 * The three stages exist because two conventions have to live in one vault: the path this
 * app writes, and the bare title Obsidian writes. The rule that matters most here is the
 * one that is easiest to "improve" by mistake — a stage that matches several notes stops
 * there and reports ambiguity, rather than falling through to a stage that would pick one.
 */

const vault: LinkCandidate[] = [
  { path: "01 Projecten/2026-08-05 1030 Rules.md", title: "Rules" },
  { path: "02 Klanten/2026-08-01 0900 Rules.md", title: "Rules" },
  { path: "00 Inbox/2026-08-07 1200 Kickoff.md", title: "Kickoff project Alpha" },
  { path: "00 Inbox/Losse aantekening.md", title: "Losse aantekening" },
  { path: "03 Archief/oud verslag.markdown", title: "Oud verslag" },
];

describe("resolveWikiLinkTarget", () => {
  it("matches the path this app writes, without an extension", () => {
    expect(resolveWikiLinkTarget("01 Projecten/2026-08-05 1030 Rules", vault)).toEqual({
      kind: "unique",
      path: "01 Projecten/2026-08-05 1030 Rules.md",
    });
  });

  it("matches the same path with the extension written out", () => {
    expect(resolveWikiLinkTarget("01 Projecten/2026-08-05 1030 Rules.md", vault)).toEqual({
      kind: "unique",
      path: "01 Projecten/2026-08-05 1030 Rules.md",
    });
  });

  it("matches a title, case-insensitively — that is what a person types", () => {
    expect(resolveWikiLinkTarget("kickoff PROJECT alpha", vault)).toEqual({
      kind: "unique",
      path: "00 Inbox/2026-08-07 1200 Kickoff.md",
    });
  });

  it("falls back to the filename stem for a note whose title is not what it is filed as", () => {
    expect(resolveWikiLinkTarget("2026-08-07 1200 Kickoff", vault)).toEqual({
      kind: "unique",
      path: "00 Inbox/2026-08-07 1200 Kickoff.md",
    });
  });

  it("finds a .markdown note by stem like any other", () => {
    expect(resolveWikiLinkTarget("oud verslag", vault)).toEqual({
      kind: "unique",
      path: "03 Archief/oud verslag.markdown",
    });
  });

  it("reports two notes with the same title as ambiguous, sorted", () => {
    expect(resolveWikiLinkTarget("Rules", vault)).toEqual({
      kind: "ambiguous",
      paths: ["01 Projecten/2026-08-05 1030 Rules.md", "02 Klanten/2026-08-01 0900 Rules.md"],
    });
  });

  it("does not fall through from an ambiguous stage to one that would pick a single note", () => {
    // "Losse aantekening" is one note's *title*; give two other notes that same filename
    // stem and the title stage still wins, rather than the stem stage's single answer.
    const shadowed: LinkCandidate[] = [
      { path: "a/Losse aantekening.md", title: "Eén" },
      { path: "b/Losse aantekening.md", title: "Twee" },
      { path: "c/2026-01-01 0000 Iets.md", title: "Losse aantekening" },
    ];

    expect(resolveWikiLinkTarget("Losse aantekening", shadowed)).toEqual({
      kind: "unique",
      path: "c/2026-01-01 0000 Iets.md",
    });
    expect(resolveWikiLinkTarget("losse aantekening.md", shadowed)).toEqual({
      kind: "ambiguous",
      paths: ["a/Losse aantekening.md", "b/Losse aantekening.md"],
    });
  });

  it("answers none for a target nothing in the vault carries", () => {
    expect(resolveWikiLinkTarget("Iets dat niet bestaat", vault)).toEqual({ kind: "none" });
    expect(resolveWikiLinkTarget("   ", vault)).toEqual({ kind: "none" });
  });

  it("ignores a heading or block reference on the end of a target", () => {
    expect(resolveWikiLinkTarget("Kickoff project Alpha#Besluiten", vault)).toEqual({
      kind: "unique",
      path: "00 Inbox/2026-08-07 1200 Kickoff.md",
    });
  });

  it("tolerates a leading slash on a hand-written path", () => {
    expect(resolveWikiLinkTarget("/01 Projecten/2026-08-05 1030 Rules", vault)).toEqual({
      kind: "unique",
      path: "01 Projecten/2026-08-05 1030 Rules.md",
    });
  });

  it("matches a path case-sensitively, unlike a title", () => {
    // A path is machine-written, so a case difference there is a different file. The
    // folder spelled wrong therefore misses the path stage entirely — which is visible
    // here because the stem stage below it then finds *both* notes rather than the one
    // the path named. (In the vault above the same miss lands on a unique stem and the
    // link still opens, which is the intended forgiveness; this is how to see the stage
    // itself declining to match.)
    const twins: LinkCandidate[] = [
      { path: "01 Projecten/Notulen.md", title: "Notulen A" },
      { path: "02 Klanten/Notulen.md", title: "Notulen B" },
    ];

    expect(resolveWikiLinkTarget("01 Projecten/Notulen", twins)).toEqual({
      kind: "unique",
      path: "01 Projecten/Notulen.md",
    });
    expect(resolveWikiLinkTarget("01 PROJECTEN/Notulen", twins)).toEqual({
      kind: "ambiguous",
      paths: ["01 Projecten/Notulen.md", "02 Klanten/Notulen.md"],
    });
  });

  it("does not confuse an attachment name for a note", () => {
    expect(resolveWikiLinkTarget("2026-08-04-1030-offerte.pdf", vault)).toEqual({ kind: "none" });
  });
});

describe("linkTargetFor", () => {
  it("is the note's path without its extension, whichever extension that is", () => {
    expect(linkTargetFor("01 Projecten/2026-08-05 1030 Rules.md")).toBe(
      "01 Projecten/2026-08-05 1030 Rules",
    );
    expect(linkTargetFor("03 Archief/oud verslag.markdown")).toBe("03 Archief/oud verslag");
  });

  it("round-trips through resolution — what it writes is what resolves back", () => {
    for (const note of vault) {
      const resolved = resolveWikiLinkTarget(linkTargetFor(note.path), vault);
      expect(resolved).toEqual({ kind: "unique", path: note.path });
    }
  });
});
