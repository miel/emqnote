import type { PhrasingContent } from "mdast";

/**
 * Four node types that mdast does not know about, but which do exist in the emqnote
 * dialect. They are added after parsing (see `normalizePhrasing`) and handled on write
 * by custom handlers in the serializer.
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
