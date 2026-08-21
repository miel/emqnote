import { describe, expect, it } from "vitest";
import { buildFrontmatter, captureTags, firstLineOf } from "@emqnote/core/capture";
import { parseNote } from "@emqnote/core/markdown";

const docOf = (body: string) => parseNote(body).doc;

describe("shared capture construction", () => {
  it("falls back to the first non-empty body row", () => {
    expect(firstLineOf(docOf("\nEerste echte regel\n\nTweede regel\n"))).toBe(
      "Eerste echte regel",
    );
  });

  it("builds the desktop and iPhone initial metadata contract", () => {
    const fallback = new Date(2026, 7, 20, 14, 32, 0);
    const doc = docOf("Besproken met #Planning.\n\n- [ ] Stuur de data\n");
    const frontmatter = buildFrontmatter(
      {
        kind: "quick",
        subject: " ",
        created: "",
        location: " Teams ",
        attendees: [" Els Bakker ", ""],
        tags: ["#planning", " klantx "],
      },
      doc,
      fallback,
    );

    expect(frontmatter).toEqual({
      title: "Besproken met #Planning.",
      type: "quick",
      created: expect.stringMatching(/^2026-08-20T14:32:00[+-]\d{2}:\d{2}$/),
      location: "Teams",
      attendees: ["Els Bakker"],
      tags: ["planning", "klantx"],
      source: "manual",
    });
    expect(frontmatter).not.toHaveProperty("modified");
  });

  it("uses one tag merge for new capture and existing-note saves", () => {
    const doc = docOf("#KlantX en #offerte\n");
    expect(captureTags({ tags: ["klantx", "#intern"] }, doc)).toEqual([
      "klantx",
      "intern",
      "offerte",
    ]);
  });

  it("refuses a completely empty note", () => {
    expect(
      buildFrontmatter(
        {
          kind: "quick",
          subject: "",
          created: "",
          location: "",
          attendees: [],
          tags: [],
        },
        docOf("\n"),
        new Date(),
      ),
    ).toBeNull();
  });
});
