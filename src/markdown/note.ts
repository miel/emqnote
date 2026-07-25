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

/** Reads a `.md` file from the vault as a note. */
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

/** Writes a note's body; ends with a newline, or is empty. */
export function serializeBody(doc: PMNode): string {
  if (isEmptyDoc(doc)) return "";
  return writeProcessor.stringify(docToMdast(doc) as never);
}

/** Writes a note as a `.md` file: frontmatter, blank line, body. */
export function serializeNote(note: Note): string {
  const frontmatter = serializeFrontmatter(note.frontmatter);
  const body = serializeBody(note.doc);
  return body === "" ? `${frontmatter}\n` : `${frontmatter}\n\n${body}`;
}

export function emptyDoc(): PMNode {
  return schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]);
}

/**
 * Builds a document from plain text: a blank line starts a new paragraph, a single
 * line break becomes a soft break inside the same paragraph.
 *
 * Needed for as long as the capture window is still a textarea. Once the real editor
 * is in place (phase 2) it produces a ProseMirror document directly and this goes away.
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

/** The first non-empty line; that becomes the title of a quick note. */
export function firstLine(text: string): string {
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
