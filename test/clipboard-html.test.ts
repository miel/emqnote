// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DOMParser } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";
import { clipboardHtml } from "../src/renderer/editor/clipboard-html.js";
import { parseNote } from "../src/markdown/note.js";

/**
 * The `text/html` flavour of a copy — the other half of `clipboard-text.test.ts`.
 *
 * Two things are asserted here and they pull in opposite directions, which is the whole
 * design: what leaves for a *foreign* destination has to carry the box, the star and the
 * highlight as something that destination can draw, and what comes back into this app has
 * to be exactly the document that left. A glyph that survives the round trip is not a
 * feature, it is a `☑` typed into the user's note.
 *
 * jsdom cannot tell us what Outlook does with any of it — see `TEST-PROTOCOL.md` — so
 * what is pinned here is the shape that was reasoned about, not its reception.
 */

function html(markdown: string): string {
  const document_ = parseNote(`---\ntitle: T\n---\n\n${markdown}`).doc;
  const fragment = clipboardHtml.serializeFragment(document_.content, { document });
  const host = window.document.createElement("div");
  host.appendChild(fragment);
  return host.innerHTML;
}

/** The way back: what `parseFromClipboard` does with the HTML flavour it is handed. */
function back(fromHtml: string): PMNode {
  const host = window.document.createElement("div");
  host.innerHTML = fromHtml;
  return DOMParser.fromSchema(schema).parse(host);
}

function roundTrip(markdown: string): void {
  const before = parseNote(`---\ntitle: T\n---\n\n${markdown}`).doc;
  expect(back(html(markdown)).toJSON()).toEqual(before.toJSON());
}

describe("what a task list looks like at the far end", () => {
  it("carries a box in both states, which data-checked alone never did", () => {
    const output = html("- [ ] Open\n- [x] Done\n");

    expect(output).toContain("☐");
    expect(output).toContain("☑");
    // Beside the attribute, never instead of it: the attribute is what comes back in.
    expect(output).toContain('data-checked="false"');
    expect(output).toContain('data-checked="true"');
  });

  it("puts the box in the marker's slot rather than beside a bullet", () => {
    expect(html("- [ ] Open\n")).toContain("list-style-type:none");
  });

  it("puts the glyph inside the item's own paragraph, not on a line above it", () => {
    // A `<span>` before the `<p>` would render as a box with its text underneath.
    expect(html("- [x] Done\n")).toContain("<p><span");
  });

  it("carries B72's star, which is the same information in the same place", () => {
    const output = html("- ⭐ Call Jan\n");

    expect(output).toContain("⭐");
    // And keeps its bullet, as the file and the plain-text flavour both do.
    expect(output).not.toContain("list-style-type:none");
  });

  it("leaves an ordinary bullet alone", () => {
    expect(html("- Ordinary\n")).not.toContain("data-emq-clip");
  });

  it("marks a nested item once, not once per level", () => {
    // The serializer recurses through `serializeFragment`; decorating on the way out of
    // every nested call would prefix an inner item's box once per list it sits in.
    const output = html("- Outer\n    - [x] Inner\n");

    expect(output.match(/☑/g)).toHaveLength(1);
  });
});

describe("what comes back in", () => {
  it.each([
    ["a task list", "- [ ] Open\n- [x] Done\n"],
    ["a starred item", "- ⭐ Call Jan\n"],
    ["a nested task under a bullet", "- Outer\n    - [x] Inner\n"],
    ["a highlight", "Text with ==marked== in it.\n"],
    ["a heading", "# Heading\n\nBody text.\n"],
    // Aligned, because an unaligned table's `align` is `[null, null]` on the way out
    // and `[]` on the way back — the same "no alignment set", spelled two ways, and a
    // difference `schema-dom.test.ts` owns rather than this file.
    ["a table", "| a | b |\n| :-- | --: |\n| c | d |\n"],
  ])("is the document that left, for %s", (_label, markdown) => {
    roundTrip(markdown);
  });

  it("drops the glyph rather than typing it into the note", () => {
    const pasted = back(html("- [x] Done\n"));

    expect(pasted.textBetween(0, pasted.content.size, " ")).toBe("Done");
    expect(pasted.firstChild!.child(0).attrs.checked).toBe(true);
  });
});

describe("what a destination that styles nothing itself still shows", () => {
  it("gives a heading a size of its own", () => {
    expect(html("# Heading\n")).toContain("font-size:24pt");
  });

  it("gives a highlight a background on the tag and on a span inside it", () => {
    // Word unwraps `<mark>`; the span is what survives that.
    const output = html("Text with ==marked== in it.\n");

    expect(output.match(/background-color/g)).toHaveLength(2);
  });

  it("never emits font-weight or font-style, which schema.ts parses as marks", () => {
    // A heading styled bold on the way out would come back as a heading full of
    // `**bold**` — a saved corruption, not a display artefact.
    const output = html("# Heading\n\nText with ==marked== and `code`.\n");

    expect(output).not.toContain("font-weight");
    expect(output).not.toContain("font-style");
    expect(output).not.toContain("text-decoration");
  });
});
