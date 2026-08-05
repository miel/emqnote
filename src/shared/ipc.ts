import type { Locale } from "./i18n.js";
import type {
  ConflictChoice,
  ConflictPair,
  DiffLine,
  Facets,
  FolderNode,
  NoteSummary,
  OpenedNote,
  SaveNoteRequest,
  ScanProgress,
  Selection,
  TaskItem,
  VaultLocation,
} from "./vault-types.js";

/** The contract between main and renderer. Both sides import this file. */

export type NoteKind = "quick" | "meeting";

export const IPC = {
  /** main → renderer: the window is showing, put the caret in place. */
  captureShow: "capture:show",
  /** renderer → main: a frame was painted after the caret was placed. */
  capturePainted: "capture:painted",
  /** renderer → main: the note changed. */
  captureChange: "capture:change",
  /** renderer → main: close (Esc or Ctrl+W). */
  captureClose: "capture:close",
  /** main → renderer: start again with a clean slate. */
  captureReset: "capture:reset",
  /** main → renderer: update the status bar. */
  captureStatus: "capture:status",
  /** library renderer → main: open an existing note in the capture window instead. */
  captureLoad: "capture:load",
  /** main → capture renderer: here is the note that was just claimed. */
  captureLoadNote: "capture:load-note",
  /** library renderer → main: show the capture window for a brand new note. */
  captureNew: "capture:new",
  /** renderer → main: names and tags seen before, for autocomplete. */
  /** renderer → main: window buttons in the title bar we draw ourselves. */
  windowMinimise: "window:minimise",
  windowToggleMaximise: "window:toggle-maximise",

  /** The library window: browsing and tidying the vault. */
  libraryOpen: "library:open",
  libraryTree: "library:tree",
  libraryNotes: "library:notes",
  /** Free-text search across the whole vault — `02-technisch-ontwerp.md` §7.3. */
  librarySearch: "library:search",
  libraryOpenNote: "library:open-note",
  librarySaveNote: "library:save-note",
  libraryMoveNote: "library:move-note",
  libraryRenameNote: "library:rename-note",
  libraryTrashNote: "library:trash-note",
  /** Permanently empties `_trash` — the one delete this app performs with no way back. */
  libraryEmptyTrash: "library:empty-trash",
  libraryCreateFolder: "library:create-folder",
  libraryRenameFolder: "library:rename-folder",
  /** How many notes and subfolders a folder holds, for the delete confirmation to name. */
  libraryFolderContents: "library:folder-contents",
  /** Moves a folder into `_trash`, along with everything inside it — never a permanent delete (B24). */
  libraryTrashFolder: "library:trash-folder",
  libraryRevealNote: "library:reveal-note",
  listVaults: "vault:list",
  chooseVault: "vault:choose",
  switchVault: "vault:switch",
  /** The tags and people the vault carries, for the two filter lists. */
  libraryFacets: "library:facets",
  /** main → library renderer: the vault changed underneath, reload. */
  libraryRefresh: "library:refresh",
  /** main → library renderer: how far the startup index scan has got. */
  libraryScanProgress: "library:scan-progress",
  /**
   * Where the scan is right now, for a library window that opened partway through and so
   * missed the events. Null once it has finished — or if it never had to run.
   */
  libraryScanState: "library:scan-state",
  /** Whether the note at this path is still free to save — see `OpenedNote.editable`. */
  libraryNoteEditable: "library:note-editable",

  /** OneDrive conflict copies currently in the vault — §5.2. */
  libraryConflicts: "library:conflicts",
  /** The line-by-line diff for one conflict pair. */
  libraryConflictDiff: "library:conflict-diff",
  /** Keep this one, or keep the conflict copy instead — never "merge", which touches no file. */
  libraryResolveConflict: "library:resolve-conflict",

  /** `_attachments/` files no note refers to any more — §6.5. */
  libraryOrphanedAttachments: "library:orphaned-attachments",
  /** A data URL for one attachment, for the cleanup screen's thumbnail — null if it is not an image. */
  libraryAttachmentPreview: "library:attachment-preview",
  libraryTrashAttachment: "library:trash-attachment",

  /** The aggregated Tasks view: every task item under a folder scope. */
  libraryTasks: "library:tasks",
  /** Ticks or unticks one task item — goes through the serializer, never the raw text. */
  libraryToggleTask: "library:toggle-task",

  /** Locale, platform and hotkey — everything a window needs before it draws. */
  bootstrap: "app:bootstrap",
  setLocale: "app:set-locale",
  setHotkey: "app:set-hotkey",
} as const;

export interface Bootstrap {
  locale: Locale;
  platform: NodeJS.Platform;
  hotkey: string;
  /** Where the notes are, so the settings panel can mark the current one. */
  vaultPath: string | null;
}

/**
 * The capture hotkey both sides fall back to: the main process before settings exist,
 * the renderer before the bootstrap round trip returns. One constant, because two would
 * drift and the renderer would then advertise a shortcut that does not work.
 *
 * Not `Ctrl+Shift+Space`: that is the nonbreaking space in Word, and therefore in
 * Outlook, which is the one application this hotkey is pressed from. See B18.
 */
export const DEFAULT_HOTKEY = "CommandOrControl+Shift+Y";

export interface ShowPayload {
  /** Marker tying this appearance to its measurement. */
  token: number;
}

export interface StatusPayload {
  /** Last measured hotkey-to-caret time, in milliseconds. */
  lastLatencyMs: number | null;
  /** Path of the file holding this note, once it is decided. */
  savedAs: string | null;
}

/**
 * What the renderer hands over on every change.
 *
 * The document travels as ProseMirror JSON, not as markdown. Only the main process
 * writes markdown, through the phase-0 serializer — one path to the file format, per
 * decision B6.
 */
export interface CapturePayload {
  doc: unknown;
  kind: NoteKind;
  subject: string;
  /** ISO 8601 with offset; automatic, but the user can override it. */
  created: string;
  location: string;
  attendees: string[];
  /** Typed in the tag field. Inline #tags in the body are separate — see B19. */
  tags: string[];
}

export interface LibraryApi {
  tree: () => Promise<FolderNode>;
  /** A folder, a tag or a person — whatever the left panel currently has selected. */
  notes: (selection: Selection) => Promise<NoteSummary[]>;
  /**
   * `type:meeting attendee:"Jan de Vries" tag:klantx after:2026-01-01` plus free text —
   * `search-query.ts` parses it, `vault-scan.ts`'s `searchNotes` runs it. An empty or
   * blank query still returns something (see that function's own comment on why a
   * completely blank query is not special-cased to nothing), so the caller decides
   * whether to show search results or fall back to `notes()` — this call never does.
   */
  search: (query: string) => Promise<NoteSummary[]>;
  facets: () => Promise<Facets>;
  openNote: (path: string) => Promise<OpenedNote | null>;
  saveNote: (
    request: SaveNoteRequest,
  ) => Promise<{ written: boolean; path: string; locked?: boolean }>;
  /**
   * Answers the note's path after the move — unchanged, with `locked`, when the capture
   * window has it claimed. Silently answering the old path would look like a move that
   * did nothing, which is the one outcome a drag must never be allowed to look like.
   */
  moveNote: (path: string, folder: string) => Promise<{ path: string; locked?: boolean }>;
  renameNote: (path: string, title: string) => Promise<string>;
  trashNote: (path: string) => Promise<boolean>;
  /** Permanently deletes everything in `_trash`. Answers how many entries were removed. */
  emptyTrash: () => Promise<number>;
  createFolder: (parent: string, name: string) => Promise<string>;
  /**
   * Renames a folder in place and answers with its new path. Rejects rather than
   * correcting — the renderer has to rebase what it has open onto the answer, so a
   * silently different name would leave it pointing at nothing.
   */
  renameFolder: (path: string, name: string) => Promise<string>;
  /** Notes and subfolders anywhere inside a folder, for a delete confirmation to name. */
  folderContents: (path: string) => Promise<{ notes: number; folders: number }>;
  /**
   * Moves a folder into `_trash`. `locked` when a note somewhere inside it is claimed
   * by the capture window — the same hazard `moveNote` guards against, extended to a
   * whole subtree rather than one file. Anything else wrong with the path (the root,
   * one of the app's own folders, a folder already gone) rejects with a `FOLDER_ERROR`
   * code instead, exactly like `renameFolder`.
   */
  trashFolder: (path: string) => Promise<{ trashed: boolean; locked?: boolean }>;
  revealNote: (path: string) => void;
  /** True if nothing else currently has this note claimed for writing. */
  noteEditable: (path: string) => Promise<boolean>;
  /** Hands the note to the capture window and brings it to the front. */
  openInCapture: (path: string) => Promise<boolean>;
  /** Shows the capture window for a brand new note, exactly like the hotkey. */
  newNote: () => void;
  onRefresh: (handler: () => void) => () => void;
  /** How far the startup index scan has got, or null when nothing is scanning. */
  scanState: () => Promise<ScanProgress | null>;
  onScanProgress: (handler: (progress: ScanProgress | null) => void) => () => void;

  conflicts: () => Promise<ConflictPair[]>;
  conflictDiff: (pair: ConflictPair) => Promise<DiffLine[]>;
  /** No `"merge"` branch here — that choice touches no file, so the renderer never calls this for it. */
  resolveConflict: (pair: ConflictPair, choice: ConflictChoice) => Promise<void>;

  orphanedAttachments: () => Promise<string[]>;
  /** `null` when the file is not a browser-renderable image type, or could not be read. */
  attachmentPreview: (path: string) => Promise<string | null>;
  trashAttachment: (path: string) => Promise<string>;

  /** Every task item under a folder scope (`""` for the whole vault), for the Tasks view. */
  tasks: (scope: string, openOnly: boolean) => Promise<TaskItem[]>;
  /**
   * Flips one task item. `locked` mirrors `moveNote`'s shape: the capture window has this
   * note claimed, so the toggle was refused rather than racing its debounced write.
   * `toggled` false with no `locked` means the index row was stale — the item's text no
   * longer matched what disk actually has — and the caller should revert its optimistic
   * flip either way.
   */
  toggleTask: (
    path: string,
    ordinal: number,
    expectedText: string,
  ) => Promise<{ toggled: boolean; locked?: boolean }>;
}

export interface CaptureApi {
  /**
   * Read synchronously off `process.platform` in the preload, rather than waiting for
   * `bootstrap()` to round-trip — a sandboxed preload can still see it. Without this,
   * the first paint always assumes Windows (`useBootstrap`'s `FALLBACK`), and a shortcut
   * label briefly shows "Ctrl" on a Mac before flipping to "⌘".
   */
  platform: NodeJS.Platform;
  onShow: (handler: (payload: ShowPayload) => void) => () => void;
  onReset: (handler: () => void) => () => void;
  onStatus: (handler: (payload: StatusPayload) => void) => () => void;
  /** An existing note was handed over from the library window — load it in place. */
  onLoad: (handler: (note: OpenedNote) => void) => () => void;
  painted: (token: number) => void;
  change: (payload: CapturePayload) => void;
  close: () => void;
  minimise: () => void;
  toggleMaximise: () => void;
  openLibrary: () => void;
  bootstrap: () => Promise<Bootstrap>;
  setLocale: (locale: Locale) => Promise<void>;
  setHotkey: (hotkey: string) => Promise<boolean>;
  /** The remembered vaults, classified and labelled fresh on every call. */
  listVaults: () => Promise<VaultLocation[]>;
  /** Opens the folder picker and answers with the chosen path, or null. */
  chooseVault: () => Promise<string | null>;
  /**
   * Points the app at another vault and restarts it. Does not return — see B21 for why
   * a live switch is not on offer.
   */
  switchVault: (path: string) => Promise<void>;
  library: LibraryApi;
}

declare global {
  interface Window {
    emqnote: CaptureApi;
  }
}
