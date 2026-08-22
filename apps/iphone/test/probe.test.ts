import { describe, expect, it } from "vitest";
import {
  bodyTagsOf,
  parseNote,
  serializeNote,
  taskItemText,
  taskItemsIn,
} from "@emqnote/core/markdown";
import { buildProbeNote } from "../src/probe.js";

const NOW = new Date(2026, 7, 21, 14, 32, 0);

/**
 * What the Mac cannot tell us and this can.
 *
 * Phase 0 §4 ends with "confirm that emqnote parses it without repair" and "confirm that
 * its task and body tag are visible on the first desktop scan" — both properties of the
 * bytes, not of the File Provider. Proving them here means a red matrix row on the iPhone
 * accuses OneDrive rather than the probe.
 */
describe("Phase 0 probe note", () => {
  it("is named the way §4 spells it", () => {
    expect(buildProbeNote("direct", 1, NOW).filename).toBe(
      "2026-08-21 1432 Phase 0 direct 001.md",
    );
    expect(buildProbeNote("move", 12, NOW).filename).toBe(
      "2026-08-21 1432 Phase 0 move 012.md",
    );
  });

  it("survives the desktop parser byte-identically, so a readback diff blames the provider", () => {
    const bytes = buildProbeNote("direct", 1, NOW).bytes;
    expect(serializeNote(parseNote(bytes))).toBe(bytes);
  });

  it("has the formal file shape the vault requires", () => {
    const bytes = buildProbeNote("direct", 1, NOW).bytes;
    expect(bytes.startsWith("---\n")).toBe(true);
    expect(bytes).not.toContain("\r");
    expect(bytes.endsWith("\n")).toBe(true);
    expect(bytes.endsWith("\n\n")).toBe(false);
    expect(bytes.split("\n").some((line) => /\s$/.test(line))).toBe(false);
  });

  it("carries all five things §4 asks the probe to carry", () => {
    const note = parseNote(buildProbeNote("direct", 1, NOW).bytes);

    expect(note.frontmatter.title).toBe("Phase 0 direct 001");
    expect(note.frontmatter.attendees).toEqual(["Els Bakker"]);
    expect(bodyTagsOf(note.doc)).toEqual(["phase0"]);
    expect(note.frontmatter.tags).toEqual(["phase0"]);

    const tasks = taskItemsIn(note.doc);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.node.attrs.checked).toBe(false);
    expect(taskItemText(tasks[0]!.node)).toContain("ongewijzigd op de PC");
  });

  it("keeps the Unicode that a File Provider round trip could mangle", () => {
    const bytes = buildProbeNote("direct", 1, NOW).bytes;
    for (const glyph of ["café", "≠", "→", "æøå", "🇳🇱", "—"]) {
      expect(bytes).toContain(glyph);
    }
  });
});
