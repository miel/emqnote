/** What the main window knows about the vault. Shared between main and renderer. */

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
  doc: unknown;
}

export type SortKey = "modified" | "created" | "title";
