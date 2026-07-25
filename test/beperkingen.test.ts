import { describe, expect, it } from "vitest";
import { parseNote, serializeNote } from "../src/markdown/index.js";

/**
 * Bekende beperkingen, vastgelegd als test.
 *
 * Deze gevallen ronden niet af zoals een argeloze lezer zou verwachten. Ze staan hier
 * niet omdat ze goed zijn, maar omdat ze bewust zijn geaccepteerd: ze oplossen vraagt
 * om positiebewust parseren (terugkijken in de brontekst om te zien of een teken
 * ontsnapt was), en dat is een aanzienlijke complicatie voor gevallen die in
 * werknotities vrijwel niet voorkomen.
 *
 * Verandert dat oordeel, dan is dit bestand de plek waar het zichtbaar wordt.
 */

const header = `---
title: Beperking
type: quick
created: 2026-07-25T12:00:00+02:00
---

`;

function roundtrip(body: string): string {
  const markdown = header + body;
  return serializeNote(parseNote(markdown)).slice(header.length);
}

describe("bekende beperkingen", () => {
  it("maakt van ontsnapte dubbele haken alsnog een wikilink", () => {
    // Bedoeld als letterlijke tekst, wordt een verwijzing. De ontsnapping is bij het
    // parsen al verdwenen, dus de scanner ziet geen verschil meer met een echte link.
    expect(roundtrip("Letterlijk: \\[\\[geen wikilink]].\n")).toBe(
      "Letterlijk: [[geen wikilink]].\n",
    );
  });

  it("maakt van ontsnapte dubbele isgelijktekens alsnog een markering", () => {
    expect(roundtrip("Letterlijk: \\=\\=geen markering\\=\\=.\n")).toBe(
      "Letterlijk: ==geen markering==.\n",
    );
  });
});

describe("gegarandeerd géén beperking", () => {
  it("laat een vergelijking met spaties eromheen met rust", () => {
    // De flankeringsregel: een openend == mag niet door witruimte worden gevolgd.
    // Daarmee blijft de meest voorkomende valse treffer buiten schot.
    expect(roundtrip("Controleer of a == b en of c == d.\n")).toBe(
      "Controleer of a == b en of c == d.\n",
    );
  });

  it("laat losse vierkante haken met rust", () => {
    expect(roundtrip("Zie \\[bijlage 3] voor de details.\n")).toBe(
      "Zie \\[bijlage 3] voor de details.\n",
    );
  });

  it("ontsnapt een backslash die anders een leesteken zou opeten", () => {
    expect(roundtrip("Pad: map\\\\\\*naam.\n")).toBe("Pad: map\\\\\\*naam.\n");
  });

  it("houdt een niet-gepaarde markering als gewone tekst", () => {
    expect(roundtrip("Halverwege ==begonnen maar nooit afgemaakt.\n")).toBe(
      "Halverwege ==begonnen maar nooit afgemaakt.\n",
    );
  });
});
