import type { Node as PMNode } from "prosemirror-model";
import { buildFrontmatter } from "@emqnote/core/capture";
import { noteFileName } from "@emqnote/core/filename";
import { serializeNote } from "@emqnote/core/markdown";
import {
  attendeeNames,
  createdValue,
  type CaptureDraft,
  type OutboxItem,
} from "./draft.js";

/** Builds the immutable bytes and intended filename before delivery is attempted. */
export function buildOutboxItem(
  draft: CaptureDraft,
  doc: PMNode,
  id: string,
  queuedAt = new Date(),
): OutboxItem | null {
  const frontmatter = buildFrontmatter(
    {
      kind: "quick",
      subject: draft.title,
      created: createdValue(draft.when),
      location: draft.where,
      attendees: attendeeNames(draft.who),
      tags: [],
    },
    doc,
    queuedAt,
  );
  if (frontmatter === null) return null;

  return {
    id,
    filename: noteFileName(frontmatter.title, new Date(frontmatter.created)),
    bytes: serializeNote({ frontmatter, doc }),
    queuedAt: queuedAt.toISOString(),
  };
}
