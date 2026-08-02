import type { Node as PMNode } from "prosemirror-model";

/**
 * Every `![[…]]`/`[[…]]` target a document points at — what `orphaned-attachments.ts`
 * needs to tell a referenced file from an abandoned one. `wikiEmbed` and `wikiLink` are
 * collected together and undistinguished on purpose: §6.4 of `02-technisch-ontwerp.md`
 * routes an image through `wikiEmbed` but a non-image attachment (a PDF) through the
 * same `[[…]]` syntax a note-to-note link uses, so a target cannot be classified as
 * "attachment" or "note" from the document alone — only by later checking it against
 * what actually exists in `_attachments/`. A target that turns out to name a note
 * rather than a file simply never matches anything there, which is harmless.
 */
export function collectWikiTargets(doc: PMNode): Set<string> {
  const targets = new Set<string>();

  doc.descendants((node) => {
    if (node.type.name === "wikiEmbed" || node.type.name === "wikiLink") {
      targets.add(node.attrs.target as string);
    }
    return true;
  });

  return targets;
}
