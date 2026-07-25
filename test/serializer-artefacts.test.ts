import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";

const { doc, paragraph, bulletList, orderedList, listItem, blockquote } = schema.nodes;
const { strong, em } = schema.marks;

function body(...blocks: PMNode[]): PMNode {
  return doc!.create(null, blocks);
}

function para(...content: PMNode[]): PMNode {
  return paragraph!.create(null, content);
}

function bold(text: string): PMNode {
  return schema.text(text, [strong!.create()]);
}

/**
 * Two artefacts spotted in real notes. Both were correct markdown and both were
 * unreadable, which is its own kind of wrong for a format whose whole promise is that
 * you can open the file anywhere.
 */
describe("whitespace caught inside a mark", () => {
  it("does not resort to character references", () => {
    // Seen in a real note as: > **Havinga&#x20;**&#x69;s a bullet list
    // Double-clicking a word takes the trailing space with it, so bolding with the
    // mouse hits this immediately.
    const result = serializeBody(body(para(bold("Havinga "), schema.text("is a list"))));

    expect(result).toBe("**Havinga** is a list\n");
    expect(result).not.toContain("&#x");
  });

  it("moves a leading space out too", () => {
    expect(serializeBody(body(para(schema.text("Van"), bold(" Emiel"))))).toBe(
      "Van **Emiel**\n",
    );
  });

  it("drops emphasis that covers only a space", () => {
    expect(serializeBody(body(para(schema.text("een"), bold(" "), schema.text("twee"))))).toBe(
      "een twee\n",
    );
  });

  it("leaves inner spaces alone", () => {
    expect(serializeBody(body(para(bold("twee woorden"))))).toBe("**twee woorden**\n");
  });

  it("handles nested marks at the edge", () => {
    const nested = schema.text("woord ", [strong!.create(), em!.create()]);
    expect(serializeBody(body(para(nested, schema.text("erna"))))).toBe(
      "***woord*** erna\n",
    );
  });

  it("keeps inline code exactly as typed", () => {
    // Code spans are exempt: their content is literal. The doubled spaces are correct
    // rather than sloppy — CommonMark eats one space at each end of a code span, so
    // preserving " spaties " requires writing two.
    const code = schema.text(" spaties ", [schema.marks.code!.create()]);
    expect(serializeBody(body(para(schema.text("a"), code, schema.text("b"))))).toBe(
      "a`  spaties  `b\n",
    );
  });
});

describe("lists left behind by editing", () => {
  it("does not write an empty list as a stray marker", () => {
    // Seen in a real note as a lone "1)" — that marker rather than "1." because mdast
    // alternates markers to keep two adjacent lists apart.
    const empty = orderedList!.create(null, [listItem!.create(null, [paragraph!.create()])]);
    expect(serializeBody(body(para(schema.text("Tekst")), empty))).toBe("Tekst\n");
  });

  it("keeps a list where any item has content", () => {
    const list = bulletList!.create(null, [
      listItem!.create(null, [para(schema.text("Punt"))]),
      listItem!.create(null, [paragraph!.create()]),
    ]);
    expect(serializeBody(body(list))).toBe("- Punt\n-\n");
  });

  it("keeps a list whose only content is an attachment", () => {
    const embed = schema.nodes.wikiEmbed!.create({ target: "plaatje.png" });
    const list = bulletList!.create(null, [listItem!.create(null, [para(embed)])]);
    expect(serializeBody(body(list))).toBe("- ![[plaatje.png]]\n");
  });

  it("leaves an empty quote alone, which is a different thing entirely", () => {
    const quote = blockquote!.create(null, [para(schema.text("Citaat"))]);
    expect(serializeBody(body(quote))).toBe("> Citaat\n");
  });
});

describe("blank lines left at the end", () => {
  it("does not write trailing empty paragraphs", () => {
    // Pressing Enter a few times to get out of a list leaves empty paragraphs behind.
    // They are residue, not content, and the dialect forbids trailing blank lines.
    const result = serializeBody(
      body(para(schema.text("Tekst")), paragraph!.create(), paragraph!.create()),
    );
    expect(result).toBe("Tekst\n");
  });

  it("keeps an empty paragraph that sits between two blocks", () => {
    // Only the trailing ones are residue; a deliberate gap in the middle stays.
    const result = serializeBody(
      body(para(schema.text("Een")), paragraph!.create(), para(schema.text("Twee"))),
    );
    expect(result).toBe("Een\n\n\n\nTwee\n");
  });
});
