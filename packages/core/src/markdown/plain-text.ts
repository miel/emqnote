import type { Node as PMNode } from "prosemirror-model";

/**
 * A note's document as searchable plain text: markdown syntax never existed, frontmatter
 * was never in the document to begin with, and a wikilink or embed reads as the name it
 * points at rather than the `[[…]]`/`![[…]]` syntax around it.
 *
 * `textBetween`'s `blockSeparator` keeps two adjacent block nodes from reading as one
 * fused word — without it, "einde" followed immediately by "Volgende" would search as
 * "eindeVolgende". `02-technisch-ontwerp.md` §7.1: this is what makes searching for
 * `bijlage` return no hits on syntax, and is why the index stores it rather than
 * searching the raw markdown file text.
 */
export function plainText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, "\n", (leaf) => {
    if (leaf.type.name === "wikiEmbed") return leaf.attrs.target as string;
    if (leaf.type.name === "wikiLink") {
      return (leaf.attrs.alias as string | null) ?? (leaf.attrs.target as string);
    }
    return "";
  });
}
