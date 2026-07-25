import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseNote, serializeNote } from "../src/markdown/index.js";

const CORPUS = join(fileURLToPath(new URL(".", import.meta.url)), "corpus");

const files = readdirSync(CORPUS)
  .filter((name) => name.endsWith(".md"))
  .sort();

/**
 * De bindende regel van fase 0.
 *
 * Het corpus is niet zomaar een verzameling voorbeelden: het ís de specificatie. Elk
 * bestand staat er precies zoals de serializer het hoort te schrijven. Wijkt de
 * uitvoer af, dan is er één van beide fout — en dat is een besluit dat expliciet
 * genomen moet worden, niet iets wat je wegwerkt door de test te versoepelen.
 */
describe("rondgang: bestand naar document naar bestand", () => {
  it("vindt het volledige corpus", () => {
    expect(files.length).toBe(25);
  });

  for (const name of files) {
    it(`${name} blijft bytegelijk`, () => {
      const original = readFileSync(join(CORPUS, name), "utf8");
      expect(serializeNote(parseNote(original))).toBe(original);
    });
  }
});

describe("rondgang: document naar bestand naar document", () => {
  for (const name of files) {
    it(`${name} levert hetzelfde document op`, () => {
      const original = readFileSync(join(CORPUS, name), "utf8");
      const first = parseNote(original);
      const second = parseNote(serializeNote(first));

      expect(second.doc.toJSON()).toEqual(first.doc.toJSON());
      expect(second.frontmatter).toEqual(first.frontmatter);
    });
  }
});

describe("bestandsvorm", () => {
  for (const name of files) {
    it(`${name} voldoet aan de vormeisen`, () => {
      const content = readFileSync(join(CORPUS, name), "utf8");

      expect(content, "geen CRLF").not.toContain("\r");
      expect(content.endsWith("\n"), "eindigt op een regeleinde").toBe(true);
      expect(content.endsWith("\n\n"), "precies één regeleinde aan het eind").toBe(false);
      expect(content.startsWith("---\n"), "begint met frontmatter").toBe(true);

      const trailing = content
        .split("\n")
        .filter((line) => line !== line.trimEnd() && !line.endsWith("\\"));
      expect(trailing, "geen witruimte aan het regeleinde").toEqual([]);
    });
  }
});
