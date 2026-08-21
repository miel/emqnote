import type { Node as PMNode } from "prosemirror-model";
import {
  bodyTagsOf,
  cleanTagInput,
  mergeTags,
  type Frontmatter,
  type NoteType,
} from "../markdown/index.js";
import { isoWithOffset } from "../time.js";

export interface CaptureFields {
  kind: NoteType;
  subject: string;
  created: string;
  location: string;
  attendees: string[];
  tags: string[];
}

/** The first non-empty text block, used when capture has no explicit subject. */
export function firstLineOf(doc: PMNode): string {
  let found = "";
  doc.descendants((node) => {
    if (found !== "") return false;
    if (node.isTextblock) {
      const text = node.textContent.trim();
      if (text !== "") found = text;
      return false;
    }
    return true;
  });
  return found;
}

/** Field tags followed by body tags, normalized and folded exactly once. */
export function captureTags(fields: Pick<CaptureFields, "tags">, doc: PMNode): string[] {
  return mergeTags(
    fields.tags.map(cleanTagInput).filter((tag) => tag !== ""),
    bodyTagsOf(doc),
  );
}

/** Builds initial-note frontmatter; editing code alone may add `modified`. */
export function buildFrontmatter(
  fields: CaptureFields,
  doc: PMNode,
  createdFallback: Date,
): Omit<Frontmatter, "modified"> | null {
  const subject = fields.subject.trim();
  const title = subject === "" ? firstLineOf(doc) : subject;
  if (title === "") return null;

  const frontmatter: Omit<Frontmatter, "modified"> = {
    title,
    type: fields.kind,
    created: fields.created === "" ? isoWithOffset(createdFallback) : fields.created,
    source: "manual",
  };

  const location = fields.location.trim();
  if (location !== "") frontmatter.location = location;

  const attendees = fields.attendees
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (attendees.length > 0) frontmatter.attendees = attendees;

  const tags = captureTags(fields, doc);
  if (tags.length > 0) frontmatter.tags = tags;

  return frontmatter;
}
