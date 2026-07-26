import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../src/markdown/schema.js";
import type { CapturePayload, NoteKind } from "../../src/shared/ipc.js";

/** Builds a document of plain paragraphs, the common case in these tests. */
export function paragraphs(...lines: string[]): PMNode {
  return schema.nodes.doc!.create(
    null,
    lines.map((line) =>
      schema.nodes.paragraph!.create(null, line === "" ? [] : [schema.text(line)]),
    ),
  );
}

export function payload(
  doc: PMNode,
  overrides: Partial<Omit<CapturePayload, "doc">> = {},
): CapturePayload {
  return {
    doc: doc.toJSON(),
    kind: (overrides.kind ?? "quick") as NoteKind,
    subject: overrides.subject ?? "",
    created: overrides.created ?? "",
    location: overrides.location ?? "",
    attendees: overrides.attendees ?? [],
    tags: overrides.tags ?? [],
  };
}
