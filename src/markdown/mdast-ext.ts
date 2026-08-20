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
  /**
   * B74's pipe field, taken apart: `![[foto.png|400]]`, `![[foto.png|400x300]]` or
   * `![[foto.png|een foto van het kantoor]]`. At most one of a size and an alt is ever
   * set; all three `null` is a picture at its own size with nothing after the pipe.
   */
  width: number | null;
  height: number | null;
  alt: string | null;
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
