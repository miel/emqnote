import { describe, expect, it } from "vitest";
import { parseNote } from "../src/markdown/note.js";
import { findMatches } from "../src/renderer/editor/find-in-note.js";
import type { Node as PMNode } from "prosemirror-model";

/**
 * The half of B63's find that can be tested at all.
 *
 * `findMatches` is deliberately pure and DOM-free — the same split `editor-keys.ts` draws
 * between `editorKeyIntent` and the Electron event it is read from, and `link-resolve.ts`
 * between resolving a target and going to disk for one. What is left over is a
 * `DecorationSet`, an `<input>` and a `scrollIntoView`, none of which jsdom can judge; the
 * live checks for those are in `TEST-PROTOCOL.md`.
 *
 * Documents are built by parsing markdown rather than by hand, so what is searched is the
 * document shape the app really produces — including the one case a hand-built fixture
 * would quietly get wrong, a phrase broken across text nodes by a mark.
 */

function docOf(body: string): PMNode {
  return parseNote(`---\ntitle: Test\ntype: quick\ncreated: 2026-08-18T10:00:00+02:00\n---\n\n${body}\n`)
    .doc;
}

/** What the ranges actually cover, which is the only assertion worth making about them. */
function texts(doc: PMNode, query: string): string[] {
  return findMatches(doc, query).map((match) => doc.textBetween(match.from, match.to));
}

describe("findMatches", () => {
  it("finds a plain word and reports a range that covers exactly it", () => {
    const doc = docOf("De offerte gaat vandaag de deur uit.");
    expect(texts(doc, "offerte")).toEqual(["offerte"]);
  });

  it("finds a phrase broken across a mark boundary", () => {
    // `**offer**te` is two text nodes with one word between them. A per-text-node search
    // misses this, and it is the case a reader cannot see — so it would be reported as a
    // bug rather than as a limitation.
    const doc = docOf("De **offer**te gaat mee.");
    expect(texts(doc, "offerte")).toEqual(["offerte"]);
  });

  it("never runs a match across a block boundary", () => {
    // "een" ends the first paragraph and "offerte" starts the second: a search over the
    // whole document flattened would join them and mark a span that is not one thing on
    // screen.
    const doc = docOf("Dit is een\n\nofferte voor later.");
    expect(texts(doc, "eenofferte")).toEqual([]);
    expect(texts(doc, "offerte")).toEqual(["offerte"]);
  });

  it("is case-insensitive in both directions", () => {
    const doc = docOf("Offerte, offerte en OFFERTE.");
    expect(findMatches(doc, "offerte")).toHaveLength(3);
    expect(findMatches(doc, "OfFeRtE")).toHaveLength(3);
  });

  it("returns nothing for an empty query", () => {
    expect(findMatches(docOf("Van alles."), "")).toEqual([]);
  });

  it("does not overlap two matches of a self-overlapping query", () => {
    // "aaaa" holds two non-overlapping "aa" and three overlapping ones. Overlapping
    // decorations would draw one on top of the other, so the walk advances past a hit.
    const doc = docOf("aaaa");
    expect(findMatches(doc, "aa")).toHaveLength(2);
  });

  it("finds text inside a table cell and inside a list item", () => {
    const doc = docOf(
      ["- een offerte in een lijst", "", "| Kop |", "| --- |", "| offerte in een cel |"].join("\n"),
    );
    expect(texts(doc, "offerte")).toEqual(["offerte", "offerte"]);
  });

  it("reports matches in document order", () => {
    const doc = docOf("offerte een\n\nofferte twee\n\nofferte drie");
    const matches = findMatches(doc, "offerte");
    expect(matches).toHaveLength(3);
    expect(matches[0]!.from).toBeLessThan(matches[1]!.from);
    expect(matches[1]!.from).toBeLessThan(matches[2]!.from);
  });

  it("does not join two lines a hard break separates", () => {
    // A `<br>` is a line the reader sees end, so a match must not run over it — the same
    // rule as a block boundary, one level down.
    const doc = docOf("een offer\\\nte gaat mee");
    expect(texts(doc, "offerte")).toEqual([]);
  });
});
