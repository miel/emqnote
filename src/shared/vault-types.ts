/** What the main window knows about the vault. Shared between main and renderer. */

/**
 * The trash folder's name on disk. It keeps its underscore there — the underscore is
 * what marks it as the app's own folder, and renaming it would strand every note that
 * is already in it on the other machine. The library shows it as "Trash"; only the
 * label is translated.
 */
export const TRASH_FOLDER = "_trash";

/**
 * Where a note lands when nothing else says otherwise — the hotkey's own destination
 * (B29), and the folder Restore offers first.
 *
 * It lives here beside `TRASH_FOLDER` for the same reason that one does: the folders the
 * app creates are `src/main/vault.ts`'s business, but nothing under `src/renderer/`
 * imports from `src/main/`, so a library that needed to name the Inbox could only spell
 * it out a second time — and a second spelling is one rename away from disagreeing with
 * the one that actually files notes. `vault.ts` imports it back, so there is still
 * exactly one definition.
 */
export const INBOX = "00 Inbox";

/**
 * Is this path the trash itself, or something inside it?
 *
 * The separator matters: `_trashy` is an ordinary folder whose name happens to start
 * with the same seven characters, and a bare `startsWith(TRASH_FOLDER)` would quietly
 * treat every note in it as deleted.
 */
export function isInTrash(path: string): boolean {
  return path === TRASH_FOLDER || path.startsWith(`${TRASH_FOLDER}/`);
}

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
  /**
   * A note inside it is open in the capture window (B44). Renaming would move that file
   * out from under `CaptureWriter`'s session, which pins the path it will write to next —
   * the same "one note in two folders" hazard `IPC.libraryMoveNote` and
   * `IPC.libraryTrashFolder` already refuse, arriving here as a code because the folder
   * dialogs already decode one.
   */
  locked: "folder-holds-open-note",
  /**
   * A folder was asked to move inside itself, or inside something already inside it —
   * the one refusal `moveFolder` needs that a rename cannot produce, since a rename never
   * changes which parent a folder hangs off. `renameSync` would answer `EINVAL` here, but
   * an errno is not a sentence the dialog can show in either language.
   */
  intoItself: "folder-into-itself",
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

/**
 * A file in a folder that is not a note (B47).
 *
 * Vault-relative path with forward slashes, exactly as `NoteSummary.path` is and for the
 * same reason: it is what `resolveAttachment` resolves and what `attachmentUrl` puts in a
 * `emqnote-attachment://` URL, so the renderer can draw one without asking anything
 * further.
 */
export interface FileSummary {
  path: string;
  name: string;
  /** Lowercased, with the dot — `".png"`. Empty for a file with no extension at all. */
  extension: string;
  modified: string;
  size: number;
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
  | { kind: "person"; name: string }
  | { kind: "tasks"; scope: string; openOnly: boolean }
  // §6.5's unlinked attachments: the files in `_attachments/` no note points at any more.
  // A place in the sidebar rather than a modal, for the same reason `tasks` is one — it
  // is a list of things in the vault, and every other such list is reached by selecting
  // it in the tree. It carries no state of its own: the question has exactly one answer
  // at any moment, and there is nothing to scope it to (`_attachments/` is the app's own
  // folder, which is why it is the one folder the tree cannot browse).
  | { kind: "unlinked" };

/**
 * Why something in `_trash` would not go, when the filesystem refuses.
 *
 * Crosses IPC, so it lives here rather than beside the code that produces it
 * (`main/trash-delete.ts`). The `code` is the operating system's own word — `EPERM`,
 * `EBUSY`, `ENOTEMPTY` — and `path` is the *entry* that refused, which for a folder is
 * almost always one file inside it rather than the folder that was asked for.
 */
export interface RemovalFailure {
  path: string;
  code: string;
  message: string;
}

/** Stable string form, for React keys, highlight comparison and effect dependencies. */
export function selectionKey(selection: Selection): string {
  if (selection.kind === "folder") return `folder:${selection.path}`;
  if (selection.kind === "tasks") {
    return `tasks:${selection.scope}:${selection.openOnly ? "open" : "all"}`;
  }
  if (selection.kind === "unlinked") return "unlinked";
  return `${selection.kind}:${selection.name}`;
}

/** The folder a note sits in, from its vault-relative path; "" for the vault root. */
export function folderOf(notePath: string): string {
  const cut = notePath.lastIndexOf("/");
  return cut === -1 ? "" : notePath.slice(0, cut);
}

/**
 * The three "can this folder be acted on" rules, pulled out of `Library.tsx` so a
 * per-row context menu (`FolderTree.tsx`) and the toolbar (still keyed on `lastFolder`)
 * can ask the same question about two different paths without the answer drifting
 * apart. The vault root and anything inside `_trash` refuse a rename or a delete; the
 * trash itself additionally refuses a new folder or note filed into it.
 */
export function canRenameFolder(path: string): boolean {
  return path !== "" && !path.startsWith(TRASH_FOLDER);
}

export function canDeleteFolder(path: string): boolean {
  return path !== "" && !path.startsWith(TRASH_FOLDER);
}

export function canCreateFolderIn(path: string): boolean {
  return !path.startsWith(TRASH_FOLDER);
}

/**
 * How far the index scan has got. Lives here rather than in `index-scan.ts` because it
 * crosses the IPC boundary now that the library draws a progress bar from it — the same
 * reason `ConflictPair` moved out of `src/main/`.
 */
export interface ScanProgress {
  done: number;
  total: number;
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

/**
 * One task item as the aggregated Tasks view shows it — a `note_tasks` row joined with
 * its note's title. `ordinal` counts task items within that one note, in document order;
 * it is not a global id, and the pair `(path, ordinal)` is what names one item, the same
 * pair `toggleTask` takes to flip it.
 */
export interface TaskItem {
  path: string;
  title: string;
  ordinal: number;
  checked: boolean;
  text: string;
}

/**
 * One note that links to another (B35) — what the confirmation before a move or a rename
 * counts, and what the renderer names in it. The raw target spellings stay in main: the
 * rewrite resolves them again for itself, so sending them across would only invite a
 * caller to hand back a list main did not compute.
 */
export interface LinkingNoteSummary {
  path: string;
  title: string;
}

/** One note a `[[…]]` target might mean, for the picker that resolves an ambiguous link. */
export interface LinkCandidateSummary {
  path: string;
  title: string;
  /** The folder it lives in, so two notes of the same name are told apart by where they are. */
  folder: string;
  /**
   * How a `[[…]]` link should spell this note — the path with its extension taken off,
   * which is `link-resolve.ts`'s `linkTargetFor`.
   *
   * It comes over IPC rather than being derived in the renderer because that function
   * lives in `src/main/` and nothing under `src/renderer/` imports from there; a second
   * implementation of "which extensions are note extensions" (B37) is exactly the kind of
   * near-duplicate that drifts. `LinkPicker` ignores it — it only ever opens a note — but
   * `NotePicker` (B41) writes it into the document.
   */
  target: string;
}

/**
 * main → library: a `[[…]]` link was clicked somewhere and names a note.
 *
 * `origin` is the note the click came from, so the note that opens can offer a way back to
 * it. Main can only answer that for the capture window, whose one open path genuinely is
 * main's own state (`writer.activePath()`) — for a click in the library's own reader it is
 * `null`, meaning "whatever that window currently has open", which the library substitutes
 * itself. That asymmetry is the same one `own-writes.ts` already documents for disk-change
 * events, and for the same reason: main has no reliable view of what the reader shows.
 */
export interface WikiLinkOpen {
  target: string;
  candidates: LinkCandidateSummary[];
  origin: { path: string; title: string } | null;
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

/**
 * A note changed or disappeared on disk for a reason this app did not cause itself —
 * the other machine, OneDrive's own sync dance, a file manager. `index-watch.ts` is
 * where this gets decided (see `own-writes.ts` for how an echo of this app's own write
 * is told apart from a real one); `index.ts`'s `notifyFileEvent` is what turns it into
 * an IPC push to whichever window has the note open.
 */
export interface VaultFileEvent {
  /** Vault-relative, POSIX-separated — the same shape NoteSummary.path / OpenedNote.path already use. */
  path: string;
  kind: "changed" | "removed";
}
