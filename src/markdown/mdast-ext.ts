import type { PhrasingContent } from "mdast";

/**
 * Vier knooptypen die mdast zelf niet kent, maar die in het emqnote-dialect wel bestaan.
 * Ze worden na het parsen toegevoegd (zie `normalizePhrasing`) en bij het schrijven
 * afgehandeld door eigen handlers in de serializer.
 */

export interface UnderlineNode {
  type: "underline";
  children: PhrasingContent[];
}

export interface HighlightNode {
  type: "highlight";
  children: PhrasingContent[];
}

export interface WikiLinkNode {
  type: "wikiLink";
  target: string;
  alias: string | null;
}

export interface WikiEmbedNode {
  type: "wikiEmbed";
  target: string;
}

export type ExtPhrasing =
  | PhrasingContent
  | UnderlineNode
  | HighlightNode
  | WikiLinkNode
  | WikiEmbedNode;

export function isExtType(
  node: { type: string },
): node is UnderlineNode | HighlightNode | WikiLinkNode | WikiEmbedNode {
  return (
    node.type === "underline" ||
    node.type === "highlight" ||
    node.type === "wikiLink" ||
    node.type === "wikiEmbed"
  );
}
