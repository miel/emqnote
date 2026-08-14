import type { Locale } from "./i18n.js";
import type {
  ConflictChoice,
  ConflictPair,
  DiffLine,
  Facets,
  FileSummary,
  FolderNode,
  LinkCandidateSummary,
  LinkingNoteSummary,
  NoteSummary,
  OpenedNote,
  SaveNoteRequest,
  ScanProgress,
  Selection,
  SortKey,
  TaskItem,
  VaultFileEvent,
  VaultLocation,
  WikiLinkOpen,
} from "./vault-types.js";

/** The contract between main and renderer. Both sides import this file. */

/** What a clicked `[[…]]` target turned out to name. `"none"` is a link pointing at nothing. */
export type WikiLinkOutcome = "attachment" | "note" | "ambiguous" | "none";

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
  /**
   * capture renderer → main: the note changed on disk from outside, and the renderer
   * has nothing of its own to lose — reread it and hand it back over `captureLoadNote`,
   * the same path a fresh `captureLoad` uses. Never sent while the renderer believes it
   * has unsaved edits; see `Capture.tsx`'s `dirtyRef`.
   */
  captureReload: "capture:reload",
  /** renderer → main: names and tags seen before, for autocomplete. */
  /** renderer → main: window buttons in the title bar we draw ourselves. */
  windowMinimise: "window:minimise",
  windowToggleMaximise: "window:toggle-maximise",

  /** The library window: browsing and tidying the vault. */
  libraryOpen: "library:open",
  libraryTree: "library:tree",
  libraryNotes: "library:notes",
  /**
   * The files in a folder that are not notes — pictures, PDFs, documents (B47). Only a
   * folder selection has an answer; a tag or a search does not, so the renderer asks for
   * this beside `libraryNotes` rather than as part of it.
   */
  libraryFolderFiles: "library:folder-files",
  /** Free-text search across the whole vault — `02-technisch-ontwerp.md` §7.3. */
  librarySearch: "library:search",
  libraryOpenNote: "library:open-note",
  librarySaveNote: "library:save-note",
  libraryMoveNote: "library:move-note",
  libraryRenameNote: "library:rename-note",
  /** Copies a note beside itself, `-copy` appended to the title — never the file bytes (B6). */
  libraryDuplicateNote: "library:duplicate-note",
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
   * main → library renderer: write anything pending, now, and say when it is done.
   *
   * Only the vault switch asks. Settings does its own flushing before calling
   * `switchVault`, because the click is in that window — the tray's copy of the same
   * gesture (14 August 2026) has no renderer to do it, and a debounced save landing after
   * `app.relaunch()` would write the old note's bytes into the new vault at the same
   * relative path. The reply comes back on `libraryFlushed`; main gives up waiting rather
   * than hang on a window that is wedged.
   */
  libraryFlushSaves: "library:flush-saves",
  /** library renderer → main: everything pending is on disk. */
  libraryFlushed: "library:flushed",
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
  libraryTrashAttachment: "library:trash-attachment",

  /** Which notes link to one, so a move or a rename can offer to bring them along (B35). */
  libraryLinkingNotes: "library:linking-notes",
  /** main → library renderer: a `[[…]]` link was clicked and names a note. One candidate opens it; several raise the picker. */
  libraryOpenLink: "library:open-link",

  /** The aggregated Tasks view: every task item under a folder scope. */
  libraryTasks: "library:tasks",
  /** Ticks or unticks one task item — goes through the serializer, never the raw text. */
  libraryToggleTask: "library:toggle-task",

  /** Locale, platform and hotkey — everything a window needs before it draws. */
  bootstrap: "app:bootstrap",
  setLocale: "app:set-locale",
  setHotkey: "app:set-hotkey",
  /** renderer → main, fire-and-forget: the library's splitters settled at a new width. */
  setPaneWidths: "app:set-pane-widths",
  /** renderer → main, fire-and-forget: the note list's sort order changed. */
  setSort: "app:set-sort",

  /**
   * Both windows write into `_attachments/` through this one channel — a screenshot is
   * as likely to land in the capture window as in the reader, so it sits beside
   * `bootstrap` rather than under `library`.
   */
  saveAttachment: "app:save-attachment",
  /**
   * The file picker for an attachment, filtered in main; reads and stores the file
   * itself. Takes an optional `"image" | "any"` argument — the note panel's right-click
   * menu offers "Insert image" and "Insert file" as two separate items that differ only
   * in this filter, while the toolbar button and its shortcut keep today's combined
   * "Images and PDFs" filter by passing nothing at all.
   */
  pickAttachment: "app:pick-attachment",
  /**
   * A click on a `[[…]]` chip, from either window (B35).
   *
   * One channel for both things a `[[…]]` can name, because the node itself cannot tell
   * them apart — only main can, by asking whether the target resolves inside
   * `_attachments/` and then whether it names a note. An attachment opens in the system
   * viewer exactly as it always did; a note is raised in the *library* window, which is
   * the only one with a reader and the dialogs an ambiguous target needs. This replaced
   * `app:open-attachment` rather than sitting beside it: two doors onto one click is how
   * the two answers drift apart.
   */
  openWikiLink: "app:open-wiki-link",
  /**
   * Which of these `[[…]]` targets name no file in the vault — what draws the "missing
   * attachment" marker on a chip or in place of a picture.
   *
   * A batch rather than one call per chip: a note full of screenshots would otherwise
   * put one IPC round trip per embed on the path that draws it. Deliberately a
   * filesystem question only (`resolveAttachment`, nothing else), never the vault-wide
   * note resolution `openWikiLink` falls through to — that one needs the index, and
   * `styles.css`'s own note on `[data-link="missing"]` is right that it has no business
   * running every time a note is drawn. A plain `[[Some Note]]` is therefore never asked
   * about here and keeps its click-time answer.
   */
  checkAttachments: "app:check-attachments",
  /**
   * How many pages an embedded PDF has, so the inline page (B43) can say "Page 2 of 7"
   * and stop at the last one. On the top level, beside `checkAttachments`, because the
   * embed draws in both windows.
   */
  pdfPageCount: "app:pdf-page-count",
  /**
   * Notes to offer when writing a `[[…]]` link (B41) — the note picker's list.
   *
   * On the top level rather than under `library`, because the capture window opens the
   * picker too and that grouping is about which *window* an operation belongs to. It runs
   * the same `searchNotes` the library's own search bar does, so a blank query lists
   * everything and the filter syntax works here as well; what it adds is `target`, the
   * canonical spelling of a link to each note, which only main can answer (B37).
   */
  linkCandidates: "app:link-candidates",
  /**
   * Mod+click on a weblink in the editor (B33). `http:`/`https:` only, checked again in
   * main — the renderer reports where the click landed, not what may be opened.
   */
  openExternal: "app:open-external",
  /**
   * Downloads a picture that arrived with a pasted web page into `_attachments/`. Sits
   * beside `saveAttachment` for the same reason: a paste happens in both windows.
   */
  fetchRemoteImage: "app:fetch-remote-image",

  /**
   * main → renderer: a note changed or disappeared on disk for a reason this app did
   * not cause itself. Sent to the library unconditionally (it filters against whatever
   * it currently has open, in the renderer, since main has no reliable view of that);
   * sent to the capture window only for the one note `writer.activePath()` says it has
   * claimed — see `notifyFileEvent` in `index.ts`.
   */
  vaultFileChanged: "vault:file-changed",
} as const;

export interface Bootstrap {
  locale: Locale;
  platform: NodeJS.Platform;
  hotkey: string;
  /** Where the notes are, so the settings panel can mark the current one. */
  vaultPath: string | null;
  /** The library's tree/notes pane widths, or null if the splitters were never dragged. */
  libraryPaneWidths: { tree: number; notes: number } | null;
  /** The note list's last sort order — see `setPaneWidths`'s comment for the precedent this follows. */
  librarySort: SortKey;
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
  /** The non-note files in one folder, for the list's second section (B47). */
  folderFiles: (folder: string) => Promise<FileSummary[]>;
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
  moveNote: (
    path: string,
    folder: string,
    /**
     * Whether the notes linking to this one follow it (B35). The references are resolved
     * in main *before* the move — after it, every target would resolve to nothing — so
     * this is a flag rather than a list of paths the renderer worked out for itself.
     */
    rewriteLinks?: boolean,
  ) => Promise<{ path: string; locked?: boolean }>;
  /**
   * Answers the note's path after the rename — unchanged, with `locked`, when the
   * capture window has this exact note claimed. Mirrors `moveNote`'s shape for the same
   * reason: renaming writes straight to the file, bypassing the capture window's own
   * session.
   */
  renameNote: (
    path: string,
    title: string,
    /** Same as `moveNote`'s: a rename changes the filename, so it moves the link target too. */
    rewriteLinks?: boolean,
  ) => Promise<{ path: string; locked?: boolean }>;
  /**
   * The notes that link to this one, for the confirmation a move or a rename shows before
   * it offers to bring them along. Empty when nothing links to it, which is the common
   * case and the one where nothing is asked at all.
   */
  linkingNotes: (path: string) => Promise<LinkingNoteSummary[]>;
  /**
   * A `[[…]]` link was clicked somewhere and names a note. One candidate is a note to
   * open; several mean the target is ambiguous and the picker decides.
   */
  onOpenLink: (handler: (event: WikiLinkOpen) => void) => () => void;
  /**
   * Copies a note beside itself with `-copy` appended to the title. `locked` when the
   * capture window has the *source* claimed — its edits may not have crossed the 800 ms
   * debounce yet, so the copy would silently be a stale version of what is on screen.
   */
  duplicateNote: (path: string) => Promise<{ path: string; locked?: boolean }>;
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
  /**
   * Shows the capture window for a brand new note, exactly like the hotkey — except that
   * the library knows where you are standing, and the hotkey does not. `folder` is
   * vault-relative, `""` for the vault root, and only applies to a note that has not
   * picked a file yet; the hotkey and the tray leave it out and get the Inbox.
   */
  newNote: (folder?: string) => void;
  onRefresh: (handler: () => void) => () => void;
  /** How far the startup index scan has got, or null when nothing is scanning. */
  scanState: () => Promise<ScanProgress | null>;
  onScanProgress: (handler: (progress: ScanProgress | null) => void) => () => void;
  /**
   * Main asking for every pending save to land before it restarts the app into another
   * vault. The handler writes, then calls the callback it is given.
   */
  onFlushSaves: (handler: () => Promise<void>) => () => void;

  conflicts: () => Promise<ConflictPair[]>;
  conflictDiff: (pair: ConflictPair) => Promise<DiffLine[]>;
  /** No `"merge"` branch here — that choice touches no file, so the renderer never calls this for it. */
  resolveConflict: (pair: ConflictPair, choice: ConflictChoice) => Promise<void>;

  /**
   * Vault-relative paths of the `_attachments/` files nothing names any more. The screen
   * draws each one straight off `emqnote-attachment://` (B28) — there used to be a second
   * call per file that base64'd the whole thing through IPC, which is what B28 refused for
   * a note's own pictures and what made this screen load all-or-nothing.
   */
  orphanedAttachments: () => Promise<string[]>;
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
  /** Fire-and-forget, like `revealNote` — nothing downstream needs to await it landing. */
  setPaneWidths: (widths: { tree: number; notes: number }) => void;
  /** Fire-and-forget, same as `setPaneWidths` — the note list's sort order persisted across a relaunch. */
  setSort: (sort: SortKey) => void;
  /** The remembered vaults, classified and labelled fresh on every call. */
  listVaults: () => Promise<VaultLocation[]>;
  /** Opens the folder picker and answers with the chosen path, or null. */
  chooseVault: () => Promise<string | null>;
  /**
   * Points the app at another vault and restarts it. Does not return — see B21 for why
   * a live switch is not on offer.
   */
  switchVault: (path: string) => Promise<void>;

  /**
   * Stores bytes already in hand — a clipboard image or a dropped file read into an
   * `ArrayBuffer` in the renderer — into `_attachments/` and answers the name it landed
   * under, or `null` if the vault is not known yet.
   */
  saveAttachment: (bytes: ArrayBuffer, originalName: string) => Promise<string | null>;
  /**
   * The native file picker; reads and stores the choice itself. `"image"` narrows the
   * filter to images only — the note panel's "Insert image" menu item — anything else
   * (including no argument at all) keeps today's combined "Images and PDFs" filter.
   */
  pickAttachment: (filter?: "image" | "any") => Promise<string | null>;
  /**
   * Follows a `[[…]]` chip: a stored attachment opens in the system viewer, a note is
   * raised in the library window (B35). Answers what the target turned out to be, so the
   * chip can show that it points at nothing — which used to be silent, and looked exactly
   * like a click that had not registered.
   */
  openWikiLink: (target: string) => Promise<WikiLinkOutcome>;
  /**
   * Answers the subset of `targets` that name no file in the vault, so a chip or an
   * embed can say the attachment behind it is gone. An empty answer means "nothing is
   * missing" *and* is what a vault that is not open yet gives back — the marker is an
   * accusation, and it should not be made on an unanswerable question.
   */
  checkAttachments: (targets: string[]) => Promise<string[]>;
  /**
   * How many pages the PDF behind a `![[…]]` embed has, or `null` when that cannot be
   * answered — no vault, not a PDF, the file is gone, or pdf.js could not open it. Only
   * ever decides whether the page controls are offered: what went *wrong* is the embed's
   * own page fetch to say, since that is the half that can tell a 404 from a 422.
   *
   * Costs a render the first time a document is asked about, which is the same render the
   * embed's first page needs anyway — `ensureThumbnail` collapses the two into one.
   */
  pdfPageCount: (target: string) => Promise<number | null>;
  /**
   * The notes the picker offers when writing a `[[…]]` link (B41). A blank query lists
   * everything (capped), so opening the picker with nothing typed is a normal call rather
   * than a special case. Answers an empty list when no vault is open, which the picker
   * shows as "no matches" — the same shape as a query nothing answers to.
   */
  linkCandidates: (query: string) => Promise<LinkCandidateSummary[]>;
  /**
   * Mod+click on a weblink (B33), mirroring `openWikiLink`'s shape. A refusal (a
   * scheme that is not `http:`/`https:`) logs in main and resolves the same as success —
   * there is nothing for this side to do differently either way.
   */
  openExternal: (href: string) => Promise<void>;
  /**
   * Downloads a picture that came in with a pasted web page and answers the name it
   * landed under in `_attachments/`, or `null` for every refusal — a scheme that is not
   * allowed, a redirect that leaves the allowlist, something that is not an image, a
   * file over the cap, a timeout. Every rule is enforced in main (`remote-image.ts`);
   * the caller's only job is to leave the remote `image` node alone on `null`.
   */
  fetchRemoteImage: (url: string) => Promise<string | null>;

  /**
   * A note changed or disappeared on disk from outside this app. Sits at the top level
   * rather than under `library` because both windows need it — the same placement as
   * `saveAttachment`, and for the same reason.
   */
  onVaultFileChanged: (handler: (event: VaultFileEvent) => void) => () => void;
  /**
   * Rereads the note the capture window currently has claimed and hands it back over
   * `onLoad`, the same path a fresh `openInCapture` uses. Only ever sent when the
   * renderer believes it has no unsaved edits of its own to lose.
   */
  reloadNote: () => Promise<void>;

  library: LibraryApi;
}

declare global {
  interface Window {
    emqnote: CaptureApi;
  }
}
