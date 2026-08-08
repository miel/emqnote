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

/** One `[[target|alias]]` exactly as the document spells it. `alias` is null when written `[[target]]`. */
export interface WikiLinkRef {
  target: string;
  alias: string | null;
}

/**
 * Every `[[…]]` link in a document, with its alias, in document order — what fills
 * `note_links` (B35).
 *
 * Deliberately *not* `collectWikiTargets` above, and the difference is the whole reason
 * both exist. That one answers "is this file referenced at all", so it folds `wikiEmbed`
 * in, drops the alias and de-duplicates; this one answers "which links would have to be
 * rewritten if their target moved", which needs the alias (an un-aliased link displays
 * its own target, so a rewrite has to promote that target to an alias or the text on
 * screen silently changes) and needs every occurrence, since a note can link to the same
 * note twice with two different spellings.
 *
 * `wikiEmbed` is excluded because an embed is always an attachment — §6.4 routes an image
 * through it — and an attachment never moves as a consequence of a note moving. A
 * `wikiLink` whose target turns out to name an attachment rather than a note simply never
 * resolves to a note path, which costs one row and nothing else.
 */
export function collectWikiLinkTargets(doc: PMNode): WikiLinkRef[] {
  const links: WikiLinkRef[] = [];

  doc.descendants((node) => {
    if (node.type.name === "wikiLink") {
      links.push({
        target: node.attrs.target as string,
        alias: (node.attrs.alias as string | null) ?? null,
      });
    }
    return true;
  });

  return links;
}
