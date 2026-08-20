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
 * The binding rule of phase 0.
 *
 * The corpus is not a loose collection of examples: it *is* the specification. Every
 * file is written exactly as the serializer is supposed to write it. If the output
 * differs, one of the two is wrong — and that is a decision to be taken deliberately,
 * not something to smooth over by relaxing the test.
 *
 * The note content stays Dutch: these fixtures stand in for the notes actually being
 * written, and translating them would make them worse at that job.
 */
describe("round trip: file to document to file", () => {
  it("finds the complete corpus", () => {
    expect(files.length).toBe(30);
  });

  for (const name of files) {
    it(`${name} stays byte-identical`, () => {
      const original = readFileSync(join(CORPUS, name), "utf8");
      expect(serializeNote(parseNote(original))).toBe(original);
    });
  }
});

describe("round trip: document to file to document", () => {
  for (const name of files) {
    it(`${name} yields the same document`, () => {
      const original = readFileSync(join(CORPUS, name), "utf8");
      const first = parseNote(original);
      const second = parseNote(serializeNote(first));

      expect(second.doc.toJSON()).toEqual(first.doc.toJSON());
      expect(second.frontmatter).toEqual(first.frontmatter);
    });
  }
});

describe("file shape", () => {
  for (const name of files) {
    it(`${name} meets the formal requirements`, () => {
      const content = readFileSync(join(CORPUS, name), "utf8");

      expect(content, "no CRLF").not.toContain("\r");
      expect(content.endsWith("\n"), "ends with a newline").toBe(true);
      expect(content.endsWith("\n\n"), "exactly one trailing newline").toBe(false);
      expect(content.startsWith("---\n"), "starts with frontmatter").toBe(true);

      const trailing = content
        .split("\n")
        .filter((line) => line !== line.trimEnd() && !line.endsWith("\\"));
      expect(trailing, "no trailing whitespace").toEqual([]);
    });
  }
});
