// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { insertAttachment } from "../src/renderer/editor/insert-attachment.js";
import { isImageAttachment } from "../src/renderer/editor/attachment-view.js";
import { caretAfter, docFromMarkdown } from "./helpers/editing.js";

/**
 * `insertAttachment`, the one place a stored filename becomes a document node —
 * mirroring `checkbox-widget.test.ts`'s precedent for mounting a real `EditorView`
 * rather than testing at the state level, since dispatching is part of what this
 * function does. Both ends are expressed in markdown, as `checkbox.test.ts` explains:
 * it ties the test to `03-markdown-dialect.md` rather than an internal document shape.
 */

function mount(markdown: string, needle: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const doc = docFromMarkdown(markdown);
  return new EditorView(host, {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, caretAfter(doc, needle)),
    }),
  });
}

describe("isImageAttachment", () => {
  it("recognises the browser-renderable image extensions", () => {
    expect(isImageAttachment("foto.png")).toBe(true);
    expect(isImageAttachment("foto.JPG")).toBe(true);
    expect(isImageAttachment("foto.jpeg")).toBe(true);
  });

  it("treats everything else, a PDF included, as not an image", () => {
    expect(isImageAttachment("offerte.pdf")).toBe(false);
    expect(isImageAttachment("noExtensionAtAll")).toBe(false);
  });
});

describe("insertAttachment", () => {
  it("inserts an image as a wikiEmbed at the caret", () => {
    const view = mount("Zie hier: X\n", "X");
    insertAttachment(view, "2026-08-04-1030-screenshot.png");

    expect(serializeBody(view.state.doc)).toBe(
      "Zie hier: X![[2026-08-04-1030-screenshot.png]]\n",
    );
    view.destroy();
  });

  // B43: a PDF is embedded, not linked. Inserting it as `[[…]]` — what this did before —
  // would have left the inline first page reachable only by typing `![[…]]` by hand, which
  // is not something a WYSIWYG editor lets anyone do.
  it("inserts a PDF as a wikiEmbed at the caret, so it draws its first page", () => {
    const view = mount("Zie hier: X\n", "X");
    insertAttachment(view, "2026-08-04-1030-offerte.pdf");

    expect(serializeBody(view.state.doc)).toBe(
      "Zie hier: X![[2026-08-04-1030-offerte.pdf]]\n",
    );
    view.destroy();
  });

  it("still inserts a file it cannot draw as a wikiLink", () => {
    const view = mount("Zie hier: X\n", "X");
    insertAttachment(view, "2026-08-04-1030-begroting.xlsx");

    expect(serializeBody(view.state.doc)).toBe(
      "Zie hier: X[[2026-08-04-1030-begroting.xlsx]]\n",
    );
    view.destroy();
  });

  it("replaces a selection rather than only inserting at a collapsed caret", () => {
    const view = mount("Zie hier: TODO klaar\n", "TODO");
    const doc = view.state.doc;
    const from = caretAfter(doc, "Zie hier: ");
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(doc, from, from + "TODO".length)),
    );

    insertAttachment(view, "2026-08-04-1030-screenshot.png");

    expect(serializeBody(view.state.doc)).toBe(
      "Zie hier: ![[2026-08-04-1030-screenshot.png]] klaar\n",
    );
    view.destroy();
  });

  it("round-trips through parseNote/serializeBody unchanged", () => {
    const view = mount("Zie hier: X\n", "X");
    insertAttachment(view, "2026-08-04-1030-screenshot.png");

    const markdown = serializeBody(view.state.doc);
    expect(serializeBody(docFromMarkdown(markdown))).toBe(markdown);
    view.destroy();
  });

  it("writes an attachment reference the corpus itself spells the same way", () => {
    // test/corpus/21-links-en-bijlagen.md is the specification for what these lines look
    // like; this asserts against the corpus file itself rather than a copy of it, so the
    // two cannot drift apart silently.
    //
    // The *file* line is the one an insertion no longer produces for a PDF (B43) — the
    // corpus keeps it, because `[[offerte.pdf]]` is still a perfectly good thing to write
    // by hand and still opens the viewer. What an insertion produces now is the embed
    // line, so both are checked here: the one this writes, and the one it must still be
    // able to read back.
    const corpus = readFileSync(
      join(process.cwd(), "test/corpus/21-links-en-bijlagen.md"),
      "utf8",
    );
    const fileLine = corpus.split("\n").find((line) => line.startsWith("Bijlage als bestand: "));
    expect(fileLine).toBe("Bijlage als bestand: [[2026-07-25-1055-offerte.pdf]]");

    const view = mount("Bijlage als bestand: X\n", "X");
    const doc = view.state.doc;
    const from = caretAfter(doc, "Bijlage als bestand: ");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, from + 1)));

    insertAttachment(view, "2026-07-25-1055-offerte.pdf");

    expect(serializeBody(view.state.doc)).toBe(
      "Bijlage als bestand: ![[2026-07-25-1055-offerte.pdf]]\n",
    );
    // And the corpus's own spelling still parses and serializes untouched — a `[[…]]` to a
    // PDF written by hand or by an older version of this app is not rewritten by opening it.
    expect(serializeBody(docFromMarkdown(`${fileLine!}\n`))).toBe(`${fileLine!}\n`);
    view.destroy();
  });
});
