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

/**
 * Maakt een document van platte tekst: een lege regel begint een nieuwe alinea, een
 * enkele regelovergang wordt een zachte overgang binnen dezelfde alinea.
 *
 * Nodig zolang het capture-venster nog een textarea is. Zodra de echte editor er staat
 * (fase 2) levert die rechtstreeks een ProseMirror-document en verdwijnt dit weg.
 */
export function docFromPlainText(text: string): PMNode {
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (normalised === "") return emptyDoc();

  const paragraphs = normalised.split(/\n{2,}/).map((block) => {
    const content: PMNode[] = [];

    block.split("\n").forEach((line, index) => {
      if (index > 0) content.push(schema.nodes.hardBreak!.create());
      if (line !== "") content.push(schema.text(line));
    });

    return schema.nodes.paragraph!.create(null, content);
  });

  return schema.nodes.doc!.create(null, paragraphs);
}

/** De eerste niet-lege regel; dat is wat de titel van een snelle notitie wordt. */
export function firstLine(text: string): string {
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
