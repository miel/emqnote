import { describe, expect, it } from "vitest";
import { parseNote, serializeBody, serializeNote } from "@emqnote/core/markdown";
import { schema } from "@emqnote/core/markdown/schema";

/**
 * Known limitations, recorded as tests.
 *
 * These cases do not round-trip the way an unsuspecting reader would expect. They are
 * here not because they are good, but because they were accepted deliberately: fixing
 * them requires position-aware parsing (looking back into the source text to see
 * whether a character was escaped), and that is a considerable complication for cases
 * that barely occur in work notes.
 *
 * If that judgement ever changes, this file is where it becomes visible.
 */

const header = `---
title: Limitation
type: quick
created: 2026-07-25T12:00:00+02:00
---

`;

function roundtrip(body: string): string {
  const markdown = header + body;
  return serializeNote(parseNote(markdown)).slice(header.length);
}

describe("known limitations", () => {
  it("turns escaped double brackets into a wikilink anyway", () => {
    // Meant as literal text, becomes a reference. The escape is already gone by the
    // time we parse, so the scanner can no longer tell it from a real link.
    expect(roundtrip("Literally: \\[\\[not a wikilink]].\n")).toBe(
      "Literally: [[not a wikilink]].\n",
    );
  });

  it("turns escaped double equals into a highlight anyway", () => {
    expect(roundtrip("Literally: \\=\\=not a highlight\\=\\=.\n")).toBe(
      "Literally: ==not a highlight==.\n",
    );
  });

  /**
   * B62 — numbered headings, asked for as "1. Title, 1.1 Subtitle, 1.1.1 Subsubtitle"
   * and answered no.
   *
   * A heading may not be the *first* thing in a list item: `listItem` is
   * `paragraph block*`, so `from-mdast.ts` prepends an empty paragraph to satisfy the
   * content expression, and the serializer then writes an empty item with an indented
   * heading under it. Read back, the heading escapes the list altogether and the empty
   * list is dropped — a document that is not structurally the one that was written, which
   * is what `03-markdown-dialect.md` §8 forbids.
   *
   * Pinned rather than fixed because the fix is not in this app: GFM has no numbering for
   * headings, so the numbers could only be either invented at draw time (and then absent
   * from every note pasted into Outlook, which is where these notes go) or written into
   * the heading text, which would make the app the owner of renumbering every heading in
   * every note on every edit.
   */
  it("cannot put a heading first in a list item", () => {
    expect(roundtrip("1. # Titel\n")).toBe("1.\n\n   # Titel\n");
    // And the second pass is where it actually breaks: no list left at all.
    expect(roundtrip("1.\n\n   # Titel\n")).toBe("# Titel\n");
  });

  it("reads a hash inside a task item as text, because GFM does", () => {
    expect(roundtrip("- [ ] # Taak\n")).toBe("- [ ] \\# Taak\n");
  });

  it("turns an escaped hash at the start of a line into a live tag", () => {
    // Written by hand as literal text, comes back as a tag. Same cause as the two above:
    // the backslash is gone by the time we parse, so nothing can tell this from a tag
    // that was meant. Nobody writes \# before a word, which is why this is accepted.
    expect(roundtrip("\\#klantx staat vooraan.\n")).toBe("#klantx staat vooraan.\n");
  });
});

describe("guaranteed not a limitation", () => {
  it("leaves a comparison with surrounding spaces alone", () => {
    // The flanking rule: an opening == may not be followed by whitespace. That keeps
    // the only false positive that occurs in practice out of trouble.
    expect(roundtrip("Check whether a == b and whether c == d.\n")).toBe(
      "Check whether a == b and whether c == d.\n",
    );
  });

  it("leaves single square brackets alone", () => {
    expect(roundtrip("See \\[appendix 3] for the details.\n")).toBe(
      "See \\[appendix 3] for the details.\n",
    );
  });

  it("escapes a backslash that would otherwise swallow a punctuation mark", () => {
    expect(roundtrip("Path: dir\\\\\\*name.\n")).toBe("Path: dir\\\\\\*name.\n");
  });

  it("keeps an unpaired highlight marker as plain text", () => {
    expect(roundtrip("Started ==halfway but never finished.\n")).toBe(
      "Started ==halfway but never finished.\n",
    );
  });

  /** The other half of B62: a heading *under* a numbered item is a normal thing to write. */
  it("keeps a heading that follows the item's own first line", () => {
    expect(roundtrip("1. Titel\n\n   ## Subtitel\n")).toBe("1. Titel\n\n   ## Subtitel\n");
  });

  /**
   * B72's own cost, stated rather than discovered.
   *
   * The star has no escaped spelling — `⭐` is not punctuation, so nothing escapes it and
   * there is no `\\⭐` for a source-offset check to tell apart from a real one, which is
   * how `restoreEmptyTasks` distinguishes `\\[ ]` from a real box. So a bullet whose text
   * genuinely begins with a star followed by a space becomes a flagged bullet: the bytes
   * on disk are unchanged either way, but the star stops being a word and becomes a
   * marker. That is the trade the decision took, and it is why the rule is exactly `⭐ `.
   */
  it("reads a bullet that starts with a star as a flagged bullet", () => {
    expect(roundtrip("- ⭐ Aandacht hiervoor\n")).toBe("- ⭐ Aandacht hiervoor\n");
    expect(parseNote(header + "- ⭐ Aandacht hiervoor\n").doc.firstChild!.firstChild!.attrs.starred).toBe(
      true,
    );
  });

  it("leaves a star that is not the whole marker as ordinary text", () => {
    // No space after it, so it is a word beginning with a star rather than a flag.
    expect(roundtrip("- ⭐ster in de tekst\n")).toBe("- ⭐ster in de tekst\n");
    expect(parseNote(header + "- ⭐ster in de tekst\n").doc.firstChild!.firstChild!.attrs.starred).toBe(
      false,
    );
  });

  it("leaves the star alone where the marker is already taken", () => {
    // A task's box and a numbered item's number both stand where a star would, so neither
    // can carry the flag — the star stays what it looks like there, which is text.
    const task = "- [ ] ⭐ Ook een taak\n";
    const numbered = "1. ⭐ Eerste stap\n";
    expect(roundtrip(task)).toBe(task);
    expect(roundtrip(numbered)).toBe(numbered);
    expect(parseNote(header + task).doc.firstChild!.firstChild!.attrs.starred).toBe(false);
    expect(parseNote(header + numbered).doc.firstChild!.firstChild!.attrs.starred).toBe(false);
  });

  it("cannot give a picture a size and alt text at once", () => {
    // Obsidian's embed syntax has one slot after the pipe and reads it three ways, so a
    // size and alt text are mutually exclusive *in the file*. That is the format's limit
    // and not a choice made here, but it has a consequence worth pinning: a node that
    // somehow carries both writes only the size, and the alt is gone. Which is why
    // `image-resize.ts` clears `alt` when a drag writes a width — dropping it deliberately
    // in the one place that can cause it, rather than leaving it to the serializer.
    const both = schema.nodes.wikiEmbed!.create({
      target: "foto.png",
      width: 400,
      height: null,
      alt: "een foto van het kantoor",
    });
    const document = schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, both));

    expect(serializeBody(document).trim()).toBe("![[foto.png|400]]");
  });

  it("keeps escaping a line-start hash that does not open a tag", () => {
    // The exception is narrow: a space after the hash means a heading was meant, and a
    // purely numeric name is not a tag. Both keep the backslash they have always had.
    expect(roundtrip("\\# Dit is geen kop.\n")).toBe("\\# Dit is geen kop.\n");
    expect(roundtrip("\\#2026 was een goed jaar.\n")).toBe("\\#2026 was een goed jaar.\n");
  });
});
