import type { Node as PMNode } from "prosemirror-model";
import type { Root, Yaml } from "mdast";
import { readProcessor, writeProcessor } from "./pipeline.js";
import { mdastToDoc } from "./from-mdast.js";
import { docToMdast } from "./to-mdast.js";
import {
  parseFrontmatter,
  serializeFrontmatter,
  type Frontmatter,
} from "./frontmatter.js";
import { schema } from "./schema.js";

export interface Note {
  frontmatter: Frontmatter;
  doc: PMNode;
}

const EMPTY_FRONTMATTER: Frontmatter = { title: "", type: "quick", created: "" };

/** Leest een `.md`-bestand uit de vault als notitie. */
export function parseNote(markdown: string): Note {
  const root = readProcessor.parse(markdown) as Root;

  const yamlNode = root.children.find(
    (child): child is Yaml => child.type === "yaml",
  );

  return {
    frontmatter:
      yamlNode === undefined
        ? { ...EMPTY_FRONTMATTER }
        : parseFrontmatter(yamlNode.value),
    doc: mdastToDoc(root),
  };
}

function isEmptyDoc(doc: PMNode): boolean {
  return (
    doc.childCount === 1 &&
    doc.firstChild!.type.name === "paragraph" &&
    doc.firstChild!.content.size === 0
  );
}

/** Schrijft de body van een notitie; eindigt op een regeleinde, of is leeg. */
export function serializeBody(doc: PMNode): string {
  if (isEmptyDoc(doc)) return "";
  return writeProcessor.stringify(docToMdast(doc) as never);
}

/** Schrijft een notitie als `.md`-bestand: frontmatter, lege regel, body. */
export function serializeNote(note: Note): string {
  const frontmatter = serializeFrontmatter(note.frontmatter);
  const body = serializeBody(note.doc);
  return body === "" ? `${frontmatter}\n` : `${frontmatter}\n\n${body}`;
}

export function emptyDoc(): PMNode {
  return schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]);
}
