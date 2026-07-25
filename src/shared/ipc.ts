import type { Locale } from "./i18n.js";
import type {
  FolderNode,
  NoteSummary,
  OpenedNote,
  SaveNoteRequest,
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
  /** renderer → main: names seen before, for attendee autocomplete. */
  attendeesList: "attendees:list",
  /** renderer → main: window buttons in the title bar we draw ourselves. */
  windowMinimise: "window:minimise",
  windowToggleMaximise: "window:toggle-maximise",

  /** The library window: browsing and tidying the vault. */
  libraryOpen: "library:open",
  libraryTree: "library:tree",
  libraryNotes: "library:notes",
  libraryOpenNote: "library:open-note",
  librarySaveNote: "library:save-note",
  libraryMoveNote: "library:move-note",
  libraryRenameNote: "library:rename-note",
  libraryTrashNote: "library:trash-note",
  libraryCreateFolder: "library:create-folder",
  libraryRevealNote: "library:reveal-note",
  /** main → library renderer: the vault changed underneath, reload. */
  libraryRefresh: "library:refresh",

  /** Locale, platform and hotkey — everything a window needs before it draws. */
  bootstrap: "app:bootstrap",
  setLocale: "app:set-locale",
  setHotkey: "app:set-hotkey",
} as const;

export interface Bootstrap {
  locale: Locale;
  platform: NodeJS.Platform;
  hotkey: string;
}

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
}

export interface LibraryApi {
  tree: () => Promise<FolderNode>;
  notes: (folder: string) => Promise<NoteSummary[]>;
  openNote: (path: string) => Promise<OpenedNote | null>;
  saveNote: (request: SaveNoteRequest) => Promise<{ written: boolean; path: string }>;
  moveNote: (path: string, folder: string) => Promise<string>;
  renameNote: (path: string, title: string) => Promise<string>;
  trashNote: (path: string) => Promise<boolean>;
  createFolder: (parent: string, name: string) => Promise<string>;
  revealNote: (path: string) => void;
  onRefresh: (handler: () => void) => () => void;
}

export interface CaptureApi {
  onShow: (handler: (payload: ShowPayload) => void) => () => void;
  onReset: (handler: () => void) => () => void;
  onStatus: (handler: (payload: StatusPayload) => void) => () => void;
  painted: (token: number) => void;
  change: (payload: CapturePayload) => void;
  close: () => void;
  minimise: () => void;
  toggleMaximise: () => void;
  knownAttendees: () => Promise<string[]>;
  openLibrary: () => void;
  bootstrap: () => Promise<Bootstrap>;
  setLocale: (locale: Locale) => Promise<void>;
  setHotkey: (hotkey: string) => Promise<boolean>;
  library: LibraryApi;
}

declare global {
  interface Window {
    emqnote: CaptureApi;
  }
}
