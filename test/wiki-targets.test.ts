import { describe, expect, it } from "vitest";
import { collectWikiTargets, parseNote } from "@emqnote/core/markdown";

function targetsOf(markdown: string): string[] {
  return [...collectWikiTargets(parseNote(markdown).doc)].sort();
}

describe("collecting wiki targets", () => {
  it("finds an embedded image", () => {
    expect(targetsOf("![[2026-07-25-1432-afbeelding-1.png]]")).toEqual([
      "2026-07-25-1432-afbeelding-1.png",
    ]);
  });

  it("finds a linked non-image attachment", () => {
    expect(targetsOf("Zie [[offerte.pdf]] voor details.")).toEqual(["offerte.pdf"]);
  });

  it("finds a wikilink to another note, alongside an attachment", () => {
    expect(targetsOf("Zie [[Andere notitie]] en ![[bijlage.png]].").sort()).toEqual([
      "Andere notitie",
      "bijlage.png",
    ]);
  });

  it("uses the target, not the alias", () => {
    expect(targetsOf("[[Andere notitie|deze notitie]]")).toEqual(["Andere notitie"]);
  });

  it("counts a target once even if it appears twice", () => {
    expect(targetsOf("![[bijlage.png]] en nogmaals ![[bijlage.png]].")).toEqual(["bijlage.png"]);
  });

  it("is empty for a note with no wiki syntax at all", () => {
    expect(targetsOf("Gewone tekst zonder verwijzingen.")).toEqual([]);
  });

  it("is empty for an empty note", () => {
    expect(targetsOf("")).toEqual([]);
  });
});
