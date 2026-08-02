/** What the main window knows about the vault. Shared between main and renderer. */

/**
 * The trash folder's name on disk. It keeps its underscore there — the underscore is
 * what marks it as the app's own folder, and renaming it would strand every note that
 * is already in it on the other machine. The library shows it as "Trash"; only the
 * label is translated.
 */
export const TRASH_FOLDER = "_trash";

/**
 * A vault this machine knows about, as the settings panel shows it.
 *
 * Three states and not two. "Unavailable" is its own answer rather than an absence,
 * because just after logging in — before OneDrive has mounted its folders — is exactly
 * when this list gets looked at, and a vault silently missing from it is far more
 * alarming than one greyed out with a reason. The label is best-effort and gates
 * nothing; see `src/main/vaults.ts`.
 */
export type VaultStatus = "synced" | "local" | "unavailable";

export interface VaultLocation {
  path: string;
  status: VaultStatus;
  /** The tenant, for a synced vault. Empty otherwise. */
  tenant: string;
}

/**
 * Why a folder rename was refused.
 *
 * Codes rather than sentences, because the thrower is in the main process and the
 * reader is a bilingual UI: an English message from `vault-io.ts` would arrive in a
 * Dutch dialog. Electron wraps a rejected `invoke` in its own text, so the renderer
 * looks for the code inside the message rather than comparing the whole of it.
 */
export const FOLDER_ERROR = {
  root: "folder-is-root",
  reserved: "folder-is-reserved",
  empty: "folder-name-empty",
  outside: "folder-leaves-vault",
  missing: "folder-not-found",
  exists: "folder-already-exists",
} as const;

export type FolderErrorCode = (typeof FOLDER_ERROR)[keyof typeof FOLDER_ERROR];

/** The code inside a rejected rename, if it carries one. */
export function folderErrorOf(error: unknown): FolderErrorCode | null {
  const text = error instanceof Error ? error.message : String(error);
  return Object.values(FOLDER_ERROR).find((code) => text.includes(code)) ?? null;
}

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
  /**
   * False when the capture window currently has this same note loaded. Two windows open
   * on one note is a feature — looking something up while editing — but two writers of
   * the same file is the failure B10 exists to prevent, so whichever window opened it
   * second reads it without being able to save it.
   */
  editable: boolean;
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

/** A OneDrive conflict copy paired with the original it names a machine variant of — `src/main/conflicts.ts`. */
export interface ConflictPair {
  original: string;
  conflict: string;
}

export type ConflictChoice = "keepOriginal" | "keepConflict";

/** One line of `src/main/diff.ts`'s output. */
export type DiffLine =
  | { kind: "same"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string };
