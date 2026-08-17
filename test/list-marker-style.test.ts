/**
 * A bullet, number or checkbox follows the formatting of its own line.
 *
 * The rule that matters is "the whole line", and most of what is tested here is where that
 * stops: half a bold sentence is a formatted phrase, not a bold item, and a marker that
 * went bold for it would be saying something about the line that is not true.
 *
 * Nothing here reaches disk — these are decorations, and `roundtrip.test.ts` is what pins
 * that the file is unchanged either way.
 */
import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";
import {
  EM_ITEM_CLASS,
  markedItems,
  STRONG_ITEM_CLASS,
} from "../src/renderer/editor/list-marker-style.js";

const { doc, bulletList, orderedList, listItem, paragraph, table, tableRow, tableCell } =
  schema.nodes;
const { strong, em } = schema.marks;

type Piece = { text: string; marks?: string[] };

function line(...pieces: (string | Piece)[]): PMNode {
  return paragraph!.create(
    null,
    pieces.map((piece) => {
      if (typeof piece === "string") return schema.text(piece);
      return schema.text(
        piece.text,
        (piece.marks ?? []).map((name) => (name === "strong" ? strong! : em!).create()),
      );
    }),
  );
}

function bullets(...items: PMNode[][]): PMNode {
  return doc!.create(
    null,
    bulletList!.create(
      null,
      items.map((blocks) => listItem!.create(null, blocks)),
    ),
  );
}

/** The classes each marked item carries, in document order. */
function classes(node: PMNode): string[] {
  return markedItems(node).map((item) => item.classes);
}

describe("markedItems", () => {
  it("marks an item whose every word is bold", () => {
    expect(classes(bullets([line({ text: "Alles vet", marks: ["strong"] })]))).toEqual([
      STRONG_ITEM_CLASS,
    ]);
  });

  it("marks an item whose every word is italic", () => {
    expect(classes(bullets([line({ text: "Alles cursief", marks: ["em"] })]))).toEqual([
      EM_ITEM_CLASS,
    ]);
  });

  it("marks an item that is both", () => {
    const both = { text: "Beide", marks: ["strong", "em"] };
    expect(classes(bullets([line(both)]))).toEqual([`${STRONG_ITEM_CLASS} ${EM_ITEM_CLASS}`]);
  });

  it("leaves a half-formatted line alone", () => {
    expect(classes(bullets([line({ text: "Vet", marks: ["strong"] }, " en gewoon")]))).toEqual(
      [],
    );
  });

  it("leaves a plain line alone", () => {
    expect(classes(bullets([line("Gewoon")]))).toEqual([]);
  });

  it("marks nothing on an empty item", () => {
    expect(classes(bullets([paragraph!.create()]))).toEqual([]);
  });

  /**
   * A trailing space typed outside the bold run is not a decision anybody made, and
   * letting it cancel the answer would make the marker flicker while typing.
   */
  it("ignores whitespace left outside the run", () => {
    expect(
      classes(bullets([line({ text: "Vet", marks: ["strong"] }, "   ")])),
    ).toEqual([STRONG_ITEM_CLASS]);
  });

  it("answers per item, not per list", () => {
    expect(
      classes(
        bullets([line({ text: "Vet", marks: ["strong"] })], [line("Gewoon")], [
          line({ text: "Ook vet", marks: ["strong"] }),
        ]),
      ),
    ).toEqual([STRONG_ITEM_CLASS, STRONG_ITEM_CLASS]);
  });

  it("does the same for a numbered list and for a task item", () => {
    const numbered = doc!.create(
      null,
      orderedList!.create(null, [
        listItem!.create(null, [line({ text: "Vet", marks: ["strong"] })]),
      ]),
    );
    expect(classes(numbered)).toEqual([STRONG_ITEM_CLASS]);

    const task = doc!.create(
      null,
      bulletList!.create(null, [
        listItem!.create({ checked: false }, [line({ text: "Vet", marks: ["strong"] })]),
      ]),
    );
    expect(classes(task)).toEqual([STRONG_ITEM_CLASS]);
  });

  /**
   * The marker introduces the item's first line, so that is the only line consulted — a
   * bold paragraph further down the item says nothing about the bullet in front of it.
   */
  it("reads the first paragraph only", () => {
    const item = bullets([line("Gewoon"), line({ text: "Vet", marks: ["strong"] })]);
    expect(classes(item)).toEqual([]);
  });

  it("looks inside a nested list too", () => {
    const nested = doc!.create(
      null,
      bulletList!.create(null, [
        listItem!.create(null, [
          line("Gewoon"),
          bulletList!.create(null, [
            listItem!.create(null, [line({ text: "Vet", marks: ["strong"] })]),
          ]),
        ]),
      ]),
    );
    expect(classes(nested)).toEqual([STRONG_ITEM_CLASS]);
  });

  it("says nothing about text that is not in a list", () => {
    expect(classes(doc!.create(null, line({ text: "Vet", marks: ["strong"] })))).toEqual([]);
  });

  /** A cell is not an item; a bold table row must not produce a marker class. */
  it("says nothing about a table cell", () => {
    const cells = doc!.create(
      null,
      table!.create(null, [
        tableRow!.create(null, [
          tableCell!.create(null, [schema.text("Vet", [strong!.create()])]),
        ]),
      ]),
    );
    expect(classes(cells)).toEqual([]);
  });
});
