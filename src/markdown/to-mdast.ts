import type { Mark, Node as PMNode } from "prosemirror-model";
import type { PhrasingContent, Root, RootContent } from "mdast";
import { MARK_NESTING_ORDER } from "./schema.js";
import type { ExtPhrasing } from "./mdast-ext.js";

/**
 * ProseMirror kent marks als een ongeordende verzameling per tekstknoop; markdown is
 * een boom. Deze module bouwt die boom, met een vaste nestvolgorde
 * (`MARK_NESTING_ORDER`) zodat hetzelfde document altijd dezelfde markdown oplevert.
 */

function markPriority(mark: Mark): number {
  const index = MARK_NESTING_ORDER.indexOf(
    mark.type.name as (typeof MARK_NESTING_ORDER)[number],
  );
  return index === -1 ? MARK_NESTING_ORDER.length : index;
}

function sameMark(a: Mark, b: Mark): boolean {
  return a.type === b.type && a.eq(b);
}

function hasMark(node: PMNode, mark: Mark): boolean {
  return node.marks.some((candidate) => sameMark(candidate, mark));
}

function leafToMdast(node: PMNode): ExtPhrasing | null {
  switch (node.type.name) {
    case "text":
      return { type: "text", value: node.text ?? "" } as PhrasingContent;
    case "hardBreak":
      return { type: "break" } as PhrasingContent;
    case "image":
      return {
        type: "image",
        url: node.attrs.src as string,
        alt: (node.attrs.alt as string | null) ?? null,
        title: (node.attrs.title as string | null) ?? null,
      } as PhrasingContent;
    case "wikiEmbed":
      return { type: "wikiEmbed", target: node.attrs.target as string };
    case "wikiLink":
      return {
        type: "wikiLink",
        target: node.attrs.target as string,
        alias: (node.attrs.alias as string | null) ?? null,
      };
    default:
      return null;
  }
}

function wrap(mark: Mark, children: ExtPhrasing[]): ExtPhrasing {
  switch (mark.type.name) {
    case "strong":
      return { type: "strong", children: children as PhrasingContent[] } as PhrasingContent;
    case "em":
      return { type: "emphasis", children: children as PhrasingContent[] } as PhrasingContent;
    case "strike":
      return { type: "delete", children: children as PhrasingContent[] } as PhrasingContent;
    case "underline":
      return { type: "underline", children: children as PhrasingContent[] };
    case "highlight":
      return { type: "highlight", children: children as PhrasingContent[] };
    case "link":
      return {
        type: "link",
        url: mark.attrs.href as string,
        title: (mark.attrs.title as string | null) ?? null,
        children: children as PhrasingContent[],
      } as PhrasingContent;
    default:
      return { type: "text", value: "" } as PhrasingContent;
  }
}

function inlineToMdast(nodes: PMNode[], active: Mark[]): ExtPhrasing[] {
  const result: ExtPhrasing[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index]!;
    const remaining = node.marks.filter(
      (mark) => !active.some((candidate) => sameMark(candidate, mark)),
    );

    if (remaining.length === 0) {
      const leaf = leafToMdast(node);
      if (leaf) result.push(leaf);
      index += 1;
      continue;
    }

    const outermost = remaining.reduce((best, mark) =>
      markPriority(mark) < markPriority(best) ? mark : best,
    );

    // Inline-code kan in markdown geen andere opmaak bevatten: de inhoud is letterlijk.
    if (outermost.type.name === "code") {
      let value = "";
      let end = index;
      while (end < nodes.length && hasMark(nodes[end]!, outermost)) {
        value += nodes[end]!.text ?? "";
        end += 1;
      }
      result.push({ type: "inlineCode", value } as PhrasingContent);
      index = end;
      continue;
    }

    let end = index;
    while (end < nodes.length && hasMark(nodes[end]!, outermost)) end += 1;

    result.push(
      wrap(outermost, inlineToMdast(nodes.slice(index, end), [...active, outermost])),
    );
    index = end;
  }

  return result;
}

function childrenOf(node: PMNode): PMNode[] {
  const children: PMNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function inlineChildren(node: PMNode): PhrasingContent[] {
  return inlineToMdast(childrenOf(node), []) as PhrasingContent[];
}

const LIST_TYPES = new Set(["bulletList", "orderedList"]);

/**
 * Is dit lijstitem "los" — moeten zijn blokken door lege regels worden gescheiden?
 *
 * CommonMark kent losheid alleen als eigenschap van de brontekst, niet van de
 * documentstructuur, en ProseMirror bewaart die eigenschap niet. De serializer moet
 * hem dus afleiden, en die afleiding is de norm: een item is los zodra het ná de
 * eerste alinea nog iets anders bevat dan een geneste lijst.
 *
 * Daarmee blijft `- punt` met een sublijst eronder strak — de gewone outline-vorm —
 * terwijl een tweede alinea, tabel of codeblok wél lege regels krijgt, wat markdown
 * op die plek ook echt nodig heeft.
 */
function isSpreadItem(item: PMNode): boolean {
  const children = childrenOf(item);
  return children.slice(1).some((child) => !LIST_TYPES.has(child.type.name));
}

function listItemToMdast(item: PMNode): RootContent {
  return {
    type: "listItem",
    checked: item.attrs.checked as boolean | null,
    spread: isSpreadItem(item),
    children: blocksToMdast(childrenOf(item)) as never,
  } as RootContent;
}

function listToMdast(node: PMNode, ordered: boolean): RootContent {
  const items = childrenOf(node).map(listItemToMdast);
  const spread = items.some((item) => (item as { spread?: boolean }).spread === true);

  // CommonMark kent losheid per lijst, niet per item: is één item los, dan krijgen
  // alle items lege regels ertussen. Anders is de rondgang niet stabiel.
  return {
    type: "list",
    ordered,
    start: ordered ? (node.attrs.start as number) : null,
    spread,
    children: items as never,
  } as RootContent;
}

function blockToMdast(node: PMNode): RootContent | null {
  switch (node.type.name) {
    case "paragraph":
      return { type: "paragraph", children: inlineChildren(node) };

    case "heading":
      return {
        type: "heading",
        depth: node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6,
        children: inlineChildren(node),
      };

    case "blockquote":
      return {
        type: "blockquote",
        children: blocksToMdast(childrenOf(node)) as never,
      };

    case "codeBlock":
      return {
        type: "code",
        lang: (node.attrs.language as string | null) ?? null,
        meta: null,
        value: node.textContent,
      };

    case "htmlBlock":
      return { type: "html", value: node.textContent };

    case "horizontalRule":
      return { type: "thematicBreak" };

    case "bulletList":
      return listToMdast(node, false);

    case "orderedList":
      return listToMdast(node, true);

    case "table":
      return {
        type: "table",
        align: node.attrs.align as never,
        children: childrenOf(node).map((row) => ({
          type: "tableRow",
          children: childrenOf(row).map((cell) => ({
            type: "tableCell",
            children: inlineChildren(cell),
          })),
        })) as never,
      };

    default:
      return null;
  }
}

function blocksToMdast(nodes: PMNode[]): RootContent[] {
  return nodes
    .map((node) => blockToMdast(node))
    .filter((node): node is RootContent => node !== null);
}

export function docToMdast(doc: PMNode): Root {
  return { type: "root", children: blocksToMdast(childrenOf(doc)) };
}
