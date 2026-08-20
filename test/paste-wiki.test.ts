import { describe, expect, it } from "vitest";
import { Fragment, Slice } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { transformPastedWikiSyntax } from "../src/renderer/editor/paste-wiki.js";

/**
 * Pasting `[[…]]`/`![[…]]` as plain text.
 *
 * The bug this covers was invisible in every existing test precisely because the *file*
 * was always right: the characters serialise unchanged, so a reopened note drew the
 * picture and only the screen in front of the person pasting did not. So these assert on
 * the nodes the slice carries, and then that the same slice still serialises to the text
 * it came from.
 */

function paragraph(text: string): Slice {
  return new Slice(Fragment.from(schema.nodes.paragraph!.create(null, schema.text(text))), 0, 0);
}

/** The one paragraph a transformed slice holds, for reading its children back. */
function childrenOf(slice: Slice): { type: string; attrs: Record<string, unknown>; text?: string }[] {
  const parent = slice.content.firstChild!;
  const children: { type: string; attrs: Record<string, unknown>; text?: string }[] = [];
  parent.content.forEach((child) => {
    children.push({
      type: child.type.name,
      attrs: child.attrs,
      ...(child.isText ? { text: child.text } : {}),
    });
  });
  return children;
}

describe("pasted wiki syntax", () => {
  it("turns ![[…]] into an embed", () => {
    const children = childrenOf(transformPastedWikiSyntax(paragraph("![[_attachments/foto.png]]")));

    expect(children).toEqual([
      { type: "wikiEmbed", attrs: { target: "_attachments/foto.png", width: null, height: null, alt: null } },
    ]);
  });

  it("reads an embed's pipe field the way a file is read", () => {
    // The paste path and the reader share `matchWikiSyntax` for exactly this reason: a
    // `![[foto.png|400]]` on the clipboard has to become the same node the same text
    // becomes on the way off disk, or the two disagree about the same characters (B58).
    const size = childrenOf(transformPastedWikiSyntax(paragraph("![[foto.png|400]]")));
    expect(size).toEqual([
      { type: "wikiEmbed", attrs: { target: "foto.png", width: 400, height: null, alt: null } },
    ]);

    const box = childrenOf(transformPastedWikiSyntax(paragraph("![[foto.png|250x180]]")));
    expect(box).toEqual([
      { type: "wikiEmbed", attrs: { target: "foto.png", width: 250, height: 180, alt: null } },
    ]);

    const text = childrenOf(transformPastedWikiSyntax(paragraph("![[foto.png|het kantoor]]")));
    expect(text).toEqual([
      {
        type: "wikiEmbed",
        attrs: { target: "foto.png", width: null, height: null, alt: "het kantoor" },
      },
    ]);
  });

  it("turns [[…|alias]] into a link that keeps both halves", () => {
    const children = childrenOf(
      transformPastedWikiSyntax(paragraph("[[01 Projecten/Alpha.md|Alpha]]")),
    );

    expect(children).toEqual([
      { type: "wikiLink", attrs: { target: "01 Projecten/Alpha.md", alias: "Alpha" } },
    ]);
  });

  it("keeps the text on either side, and finds more than one", () => {
    const children = childrenOf(
      transformPastedWikiSyntax(paragraph("Zie [[Notitie]] en ![[foto.png]] hierboven.")),
    );

    expect(children).toEqual([
      { type: "text", attrs: {}, text: "Zie " },
      { type: "wikiLink", attrs: { target: "Notitie", alias: null } },
      { type: "text", attrs: {}, text: " en " },
      { type: "wikiEmbed", attrs: { target: "foto.png", width: null, height: null, alt: null } },
      { type: "text", attrs: {}, text: " hierboven." },
    ]);
  });

  it("carries the marks of the text it replaces", () => {
    const bold = schema.marks.strong!.create();
    const slice = new Slice(
      Fragment.from(
        schema.nodes.paragraph!.create(null, schema.text("[[Notitie]] hierna", [bold])),
      ),
      0,
      0,
    );

    const parent = transformPastedWikiSyntax(slice).content.firstChild!;

    expect(parent.firstChild!.type.name).toBe("wikiLink");
    expect(parent.firstChild!.marks.map((mark) => mark.type.name)).toEqual(["strong"]);
  });

  it("leaves prose that happens to contain brackets alone", () => {
    const slice = paragraph("Een [gewone] zin met [één] haakje.");
    expect(transformPastedWikiSyntax(slice)).toBe(slice);
  });

  it("does not touch a markdown spelling that is not this one", () => {
    // `autoformat` refuses markdown spellings on principle and this does not reopen
    // that: only the syntax the app itself puts on the clipboard is recognised.
    const slice = paragraph("**vet** en `code` en ![alt](https://example.com/a.png)");
    expect(transformPastedWikiSyntax(slice)).toBe(slice);
  });

  it("leaves the inside of a code block as characters", () => {
    const slice = new Slice(
      Fragment.from(
        schema.nodes.codeBlock!.create(null, schema.text("zie ![[foto.png]] hier")),
      ),
      0,
      0,
    );

    expect(transformPastedWikiSyntax(slice)).toBe(slice);
  });

  it("recognises it inside a table cell, which is ordinary inline content", () => {
    const cell = schema.nodes.tableCell!.create(null, schema.text("[[Notitie]]"));
    const row = schema.nodes.tableRow!.create(null, cell);
    const slice = new Slice(Fragment.from(schema.nodes.table!.create(null, row)), 0, 0);

    const transformed = transformPastedWikiSyntax(slice);
    const inCell = transformed.content.firstChild!.firstChild!.firstChild!.firstChild!;

    expect(inCell.type.name).toBe("wikiLink");
  });

  it("serialises back to exactly the text that was pasted", () => {
    // The whole reason the bug was invisible: the file was always right. What changed is
    // when the screen agrees with it — so the file must not change here.
    const source = "Zie [[01 Projecten/Alpha.md|Alpha]] en ![[_attachments/foto.png]].";
    const transformed = transformPastedWikiSyntax(paragraph(source));
    const document = schema.nodes.doc!.create(null, transformed.content);

    expect(serializeBody(document).trim()).toBe(source);
  });
});
