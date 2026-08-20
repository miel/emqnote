import type { Mark, Node as PMNode } from "prosemirror-model";
import type {
  BlockContent,
  DefinitionContent,
  ListItem as MdastListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table as MdastTable,
} from "mdast";
import { isStarred } from "./star-items.js";
import { schema } from "./schema.js";
import { normalizePhrasing } from "./normalize-phrasing.js";
import type { ExtPhrasing } from "./mdast-ext.js";

type BlockNode = BlockContent | DefinitionContent;

function text(value: string, marks: readonly Mark[]): PMNode[] {
  return value === "" ? [] : [schema.text(value, marks as Mark[])];
}

function inlineToPM(nodes: ExtPhrasing[], marks: readonly Mark[]): PMNode[] {
  const result: PMNode[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        result.push(...text(node.value, marks));
        break;

      case "inlineCode":
        result.push(...text(node.value, [...marks, schema.marks.code!.create()]));
        break;

      case "strong":
        result.push(
          ...inlineToPM(node.children as ExtPhrasing[], [
            ...marks,
            schema.marks.strong!.create(),
          ]),
        );
        break;

      case "emphasis":
        result.push(
          ...inlineToPM(node.children as ExtPhrasing[], [
            ...marks,
            schema.marks.em!.create(),
          ]),
        );
        break;

      case "delete":
        result.push(
          ...inlineToPM(node.children as ExtPhrasing[], [
            ...marks,
            schema.marks.strike!.create(),
          ]),
        );
        break;

      case "underline":
        result.push(
          ...inlineToPM(node.children as ExtPhrasing[], [
            ...marks,
            schema.marks.underline!.create(),
          ]),
        );
        break;

      case "highlight":
        result.push(
          ...inlineToPM(node.children as ExtPhrasing[], [
            ...marks,
            schema.marks.highlight!.create(),
          ]),
        );
        break;

      case "link":
        result.push(
          ...inlineToPM(node.children as ExtPhrasing[], [
            ...marks,
            schema.marks.link!.create({
              href: node.url,
              title: node.title ?? null,
            }),
          ]),
        );
        break;

      // Note the `marks` third argument: an atom carries the formatting it sits in
      // too. Without it, <u>text ![[image.png]] text</u> breaks into three pieces on
      // the way back out.
      case "break":
        result.push(schema.nodes.hardBreak!.create(null, null, marks as Mark[]));
        break;

      case "image":
        result.push(
          schema.nodes.image!.create(
            {
              src: node.url,
              alt: node.alt ?? null,
              title: node.title ?? null,
            },
            null,
            marks as Mark[],
          ),
        );
        break;

      case "wikiEmbed":
        result.push(
          schema.nodes.wikiEmbed!.create({ target: node.target }, null, marks as Mark[]),
        );
        break;

      case "wikiLink":
        result.push(
          schema.nodes.wikiLink!.create(
            { target: node.target, alias: node.alias },
            null,
            marks as Mark[],
          ),
        );
        break;

      case "html":
        // Raw inline HTML we do not recognise is kept verbatim; dropping it would lose
        // content, and interpreting it would be guessing.
        result.push(...text(node.value, marks));
        break;

      default:
        if ("children" in node && Array.isArray(node.children)) {
          result.push(...inlineToPM(node.children as ExtPhrasing[], marks));
        }
        break;
    }
  }

  return result;
}

function phrasingToPM(children: PhrasingContent[]): PMNode[] {
  return inlineToPM(normalizePhrasing(children), []);
}

function paragraph(children: PhrasingContent[]): PMNode {
  return schema.nodes.paragraph!.create(null, phrasingToPM(children));
}

function tableToPM(node: MdastTable): PMNode {
  const rows = node.children.map((row) =>
    schema.nodes.tableRow!.create(
      null,
      row.children.map((cell) =>
        schema.nodes.tableCell!.create(null, phrasingToPM(cell.children)),
      ),
    ),
  );
  return schema.nodes.table!.create({ align: node.align ?? [] }, rows);
}

function listItemToPM(item: MdastListItem): PMNode {
  const children = blocksToPM(item.children as BlockNode[]);
  const content =
    children[0]?.type.name === "paragraph"
      ? children
      : [schema.nodes.paragraph!.create(), ...children];

  return schema.nodes.listItem!.create(
    { checked: item.checked ?? null, starred: isStarred(item as RootContent) },
    content.length === 0 ? [schema.nodes.paragraph!.create()] : content,
  );
}

function blockToPM(node: BlockNode | RootContent): PMNode[] {
  switch (node.type) {
    case "paragraph":
      return [paragraph(node.children)];

    case "heading":
      return [
        schema.nodes.heading!.create(
          { level: node.depth },
          phrasingToPM(node.children),
        ),
      ];

    case "blockquote":
      return [
        schema.nodes.blockquote!.create(null, blocksToPM(node.children as BlockNode[])),
      ];

    case "code":
      return [
        schema.nodes.codeBlock!.create(
          { language: node.lang ?? null },
          node.value === "" ? [] : [schema.text(node.value)],
        ),
      ];

    case "html":
      return [
        schema.nodes.htmlBlock!.create(
          null,
          node.value === "" ? [] : [schema.text(node.value)],
        ),
      ];

    case "thematicBreak":
      return [schema.nodes.horizontalRule!.create()];

    case "list": {
      const items = node.children.map(listItemToPM);
      return node.ordered === true
        ? [schema.nodes.orderedList!.create({ start: node.start ?? 1 }, items)]
        : [schema.nodes.bulletList!.create(null, items)];
    }

    case "table":
      return [tableToPM(node)];

    // Definitions and footnotes are not part of the dialect; they are never produced,
    // and on read they are ignored rather than failing the parse.
    case "definition":
    case "footnoteDefinition":
      return [];

    default:
      return [];
  }
}

function blocksToPM(nodes: BlockNode[]): PMNode[] {
  return nodes.flatMap((node) => blockToPM(node));
}

/** Converts an mdast tree (without frontmatter) into a ProseMirror document. */
export function mdastToDoc(root: Root): PMNode {
  const blocks = root.children
    .filter((child) => child.type !== "yaml")
    .flatMap((child) => blockToPM(child));

  return schema.nodes.doc!.create(
    null,
    blocks.length === 0 ? [schema.nodes.paragraph!.create()] : blocks,
  );
}
