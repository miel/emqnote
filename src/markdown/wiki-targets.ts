import type { Node as PMNode } from "prosemirror-model";

/**
 * Every `![[…]]`/`[[…]]` target a document points at — what `unlinked-attachments.ts`
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

/** One `[[target|alias]]` or `![[target]]` exactly as the document spells it. */
export interface WikiLinkRef {
  target: string;
  /** Always null for an embed — `wikiEmbed` has no alias attribute to carry one. */
  alias: string | null;
  /**
   * Which of the two syntaxes wrote it. B35 only ever cared about `link`, and still only
   * asks for those; `embed` is here because a *folder* rename moves the files an embed
   * names, which is a question about the path in the target rather than about what it
   * resolves to (B45).
   */
  kind: "link" | "embed";
}

/**
 * Every `[[…]]` and `![[…]]` reference in a document, with its alias and which syntax
 * wrote it, in document order — what fills `note_links` (B35, extended by B45).
 *
 * Deliberately *not* `collectWikiTargets` above, and the difference is the whole reason
 * both exist. That one answers "is this file referenced at all", so it drops the alias and
 * de-duplicates; this one answers "which references would have to be rewritten if what
 * they name moved", which needs the alias (an un-aliased link displays its own target, so
 * a rewrite has to promote that target to an alias or the text on screen silently changes)
 * and needs every occurrence, since a note can name the same thing twice with two
 * different spellings.
 *
 * **`wikiEmbed` used to be excluded**, on the reasoning that an embed is always an
 * attachment and an attachment never moves as a consequence of a *note* moving. That was
 * true of everything B35 could do. It stopped being true when a folder could be renamed
 * (B44): renaming `99 - Attachments` moves every file in it, and a path-form
 * `![[99 - Attachments/foto.png]]` names one of them. Leaving embeds out of the index is
 * precisely why the first version of that repair silently did nothing for pictures.
 */
export function collectWikiLinkTargets(doc: PMNode): WikiLinkRef[] {
  const links: WikiLinkRef[] = [];

  doc.descendants((node) => {
    if (node.type.name === "wikiLink") {
      links.push({
        target: node.attrs.target as string,
        alias: (node.attrs.alias as string | null) ?? null,
        kind: "link",
      });
    } else if (node.type.name === "wikiEmbed") {
      links.push({ target: node.attrs.target as string, alias: null, kind: "embed" });
    }
    return true;
  });

  return links;
}
