import { describe, expect, it } from "vitest";
import { parseNote, plainText } from "../src/markdown/index.js";

function textOf(markdown: string): string {
  return plainText(parseNote(markdown).doc);
}

describe("plain text for the search index", () => {
  it("strips emphasis and heading markers", () => {
    expect(textOf("# Kop\n\nEen **vette** en *cursieve* zin.")).toBe(
      "Kop\nEen vette en cursieve zin.",
    );
  });

  it("keeps list items readable without bullet syntax", () => {
    expect(textOf("- Een\n- Twee\n  - Genest\n")).toBe("Een\nTwee\nGenest");
  });

  it("reduces a wikilink to its alias, or its target if there is none", () => {
    expect(textOf("Zie [[Andere notitie]] en [[Andere notitie|dit]].")).toBe(
      "Zie Andere notitie en dit.",
    );
  });

  it("reduces a wiki embed to its target", () => {
    expect(textOf("Bijlage: ![[offerte.pdf]]")).toBe("Bijlage: offerte.pdf");
  });

  it("keeps a tag as readable text", () => {
    expect(textOf("Notitie over #klantx.")).toBe("Notitie over #klantx.");
  });

  it("does not fuse adjacent paragraphs into one word", () => {
    expect(textOf("Einde van de eerste alinea.\n\nVolgende alinea.")).toBe(
      "Einde van de eerste alinea.\nVolgende alinea.",
    );
  });

  it("reads table cells", () => {
    expect(textOf("| A | B |\n| --- | --- |\n| Een | Twee |\n")).toBe("A\nB\nEen\nTwee");
  });

  it("is empty for an empty note", () => {
    expect(textOf("")).toBe("");
  });
});
