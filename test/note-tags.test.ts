import { describe, expect, it } from "vitest";
import { bodyTagsOf, manualTags, mergeTags } from "@emqnote/core/markdown/note-tags";
import { parseNote } from "@emqnote/core/markdown/note";

/** The body of a note, as a document, through the parser the app itself uses. */
function docOf(body: string) {
  return parseNote(`---\ntitle: T\ntype: quick\ncreated: 2026-08-18T10:00:00+02:00\n---\n\n${body}`)
    .doc;
}

describe("bodyTagsOf", () => {
  it("finds a tag in a sentence", () => {
    expect(bodyTagsOf(docOf("Afspraak met #klantx morgen.\n"))).toEqual(["klantx"]);
  });

  it("reads the same tags the file's own text does", () => {
    // The whole reason this serializes rather than walking the document: `summarise()`
    // reads tags off the bytes on disk, and a second reading of the same syntax is how
    // two answers to one question come to differ.
    expect(bodyTagsOf(docOf("#klantx en #offerte/2026.\n"))).toEqual(["klantx", "offerte/2026"]);
  });

  it("ignores a hash inside a fenced code block", () => {
    expect(bodyTagsOf(docOf("```sh\n# geen tag\n```\n"))).toEqual([]);
  });

  it("ignores a heading anchor in a wiki link", () => {
    expect(bodyTagsOf(docOf("Zie [[Notitie#Kop]] hierboven.\n"))).toEqual([]);
  });

  it("ignores a URL fragment", () => {
    expect(bodyTagsOf(docOf("Zie https://example.com/pagina#anker voor meer.\n"))).toEqual([]);
  });

  it("answers nothing for an empty note", () => {
    expect(bodyTagsOf(docOf(""))).toEqual([]);
  });
});

describe("mergeTags", () => {
  it("keeps the frontmatter's order and appends what the body adds", () => {
    expect(mergeTags(["offerte"], ["klantx"])).toEqual(["offerte", "klantx"]);
  });

  it("folds case, keeping the spelling that came first", () => {
    expect(mergeTags(["klantx"], ["KlantX"])).toEqual(["klantx"]);
    expect(mergeTags([], ["KlantX", "klantx"])).toEqual(["KlantX"]);
  });
});

describe("manualTags", () => {
  it("drops a declared tag the body also carries", () => {
    // B65's provenance rule: a tag in both places belongs to the body, so removing it
    // there removes it everywhere. Without this a hoisted tag is unremovable.
    expect(manualTags(["handmatig", "klantx"], ["klantx"])).toEqual(["handmatig"]);
  });

  it("folds when comparing", () => {
    expect(manualTags(["KlantX"], ["klantx"])).toEqual([]);
  });

  it("keeps everything when the body has no tags", () => {
    expect(manualTags(["a", "b"], [])).toEqual(["a", "b"]);
  });
});
