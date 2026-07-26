/** What the main window knows about the vault. Shared between main and renderer. */

/**
 * The trash folder's name on disk. It keeps its underscore there — the underscore is
 * what marks it as the app's own folder, and renaming it would strand every note that
 * is already in it on the other machine. The library shows it as "Trash"; only the
 * label is translated.
 */
export const TRASH_FOLDER = "_trash";

export interface FolderNode {
  /** Path relative to the vault root; "" is the root itself. */
  path: string;
  name: string;
  children: FolderNode[];
  /** Notes directly in this folder, excluding subfolders. */
  noteCount: number;
}

export interface NoteSummary {
  /** Path relative to the vault root, always with forward slashes. */
  path: string;
  fileName: string;
  title: string;
  kind: "quick" | "meeting";
  created: string;
  modified: string;
  attendees: string[];
  /** Frontmatter `tags:` and inline `#tag`s in the body, merged, first casing kept. */
  tags: string[];
  /** First line or so of the body, for the list. */
  excerpt: string;
}

export interface OpenedNote {
  path: string;
  title: string;
  kind: "quick" | "meeting";
  created: string;
  location: string;
  attendees: string[];
  /** Frontmatter tags only. Inline `#tag`s live in the body and are not touched here. */
  tags: string[];
  /** ProseMirror document JSON. */
  doc: unknown;
}

export interface SaveNoteRequest {
  path: string;
  title: string;
  kind: "quick" | "meeting";
  created: string;
  location: string;
  attendees: string[];
  tags: string[];
  doc: unknown;
}

export type SortKey = "modified" | "created" | "title";

/**
 * What the note list is showing.
 *
 * A folder is one place in the vault; a tag or a person cuts across all of them. Making
 * this a union rather than a string is what keeps the two from being confused — a tag
 * literally named "" would otherwise select the vault root.
 */
export type Selection =
  | { kind: "folder"; path: string }
  | { kind: "tag"; name: string }
  | { kind: "person"; name: string };

/** Stable string form, for React keys, highlight comparison and effect dependencies. */
export function selectionKey(selection: Selection): string {
  return selection.kind === "folder"
    ? `folder:${selection.path}`
    : `${selection.kind}:${selection.name}`;
}

/** One entry in the Tags or People list: what it is called and how many notes carry it. */
export interface Facet {
  name: string;
  count: number;
}

export interface Facets {
  tags: Facet[];
  people: Facet[];
  /**
   * False when the vault could not be scanned — in practice OneDrive Files On-Demand,
   * where reading every note would force a download of the lot. The panel then says so
   * rather than claiming there are no tags.
   */
  available: boolean;
}
