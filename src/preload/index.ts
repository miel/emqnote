import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type CapturePayload,
  type ShowPayload,
  type StatusPayload,
} from "../shared/ipc.js";
import type {
  ConflictChoice,
  ConflictPair,
  LinkCandidateSummary,
  OpenedNote,
  SaveNoteRequest,
  ScanProgress,
  Selection,
  SortDirection,
  SortKey,
  VaultFileEvent,
  WikiLinkOpen,
} from "../shared/vault-types.js";

/**
 * The renderer gets exactly what is listed here and nothing else. The sandbox stays on
 * and contextIsolation stays on; there is no reason a note window should be able to
 * reach Node.
 */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

contextBridge.exposeInMainWorld("emqnote", {
  // Synchronous, unlike `bootstrap()`: `useBootstrap`'s fallback seeds from this so the
  // very first paint already knows Ctrl from Cmd, rather than assuming Windows until the
  // IPC round trip resolves.
  platform: process.platform,
  onShow: (handler: (payload: ShowPayload) => void) =>
    subscribe<ShowPayload>(IPC.captureShow, handler),
  onReset: (handler: () => void) => subscribe<void>(IPC.captureReset, handler),
  onStatus: (handler: (payload: StatusPayload) => void) =>
    subscribe<StatusPayload>(IPC.captureStatus, handler),
  onLoad: (handler: (note: OpenedNote) => void) =>
    subscribe<OpenedNote>(IPC.captureLoadNote, handler),
  onEditorCommand: (handler: (event: { id: string }) => void) =>
    subscribe<{ id: string }>(IPC.editorCommand, handler),
  painted: (token: number) => ipcRenderer.send(IPC.capturePainted, token),
  change: (payload: CapturePayload) => ipcRenderer.send(IPC.captureChange, payload),
  close: () => ipcRenderer.send(IPC.captureClose),
  discard: () => ipcRenderer.send(IPC.captureDiscard),
  openLibrary: () => ipcRenderer.send(IPC.libraryOpen),
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  setLocale: (locale: string) => ipcRenderer.invoke(IPC.setLocale, locale),
  setLoadRemoteImages: (load: boolean) => ipcRenderer.invoke(IPC.setLoadRemoteImages, load),
  setKeepPinnedInView: (keep: boolean) => ipcRenderer.invoke(IPC.setKeepPinnedInView, keep),
  setEditorFontSize: (px: number) => ipcRenderer.invoke(IPC.setEditorFontSize, px),
  setTheme: (theme: string) => ipcRenderer.invoke(IPC.setTheme, theme),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  setHotkey: (hotkey: string) => ipcRenderer.invoke(IPC.setHotkey, hotkey),
  setLibraryHotkey: (hotkey: string) => ipcRenderer.invoke(IPC.setLibraryHotkey, hotkey),
  setPaneWidths: (widths: { tree: number; notes: number }) =>
    ipcRenderer.send(IPC.setPaneWidths, widths),
  dragWindow: (phase: "start" | "move", screenX: number, screenY: number) =>
    ipcRenderer.send(IPC.windowDrag, phase, screenX, screenY),
  setSort: (sort: SortKey, direction: SortDirection) =>
    ipcRenderer.send(IPC.setSort, sort, direction),
  listVaults: () => ipcRenderer.invoke(IPC.listVaults),
  chooseVault: () => ipcRenderer.invoke(IPC.chooseVault),
  switchVault: (path: string) => ipcRenderer.invoke(IPC.switchVault, path),
  saveAttachment: (bytes: ArrayBuffer, originalName: string) =>
    ipcRenderer.invoke(IPC.saveAttachment, bytes, originalName),
  pickAttachment: (filter?: "image" | "any") => ipcRenderer.invoke(IPC.pickAttachment, filter),
  openWikiLink: (target: string) => ipcRenderer.invoke(IPC.openWikiLink, target),
  openInSystemViewer: (target: string) => ipcRenderer.invoke(IPC.openInSystemViewer, target),
  copyText: (text: string) => ipcRenderer.invoke(IPC.copyText, text),
  checkAttachments: (targets: string[]) => ipcRenderer.invoke(IPC.checkAttachments, targets),
  pdfPageCount: (target: string) => ipcRenderer.invoke(IPC.pdfPageCount, target),
  linkCandidates: (query: string) => ipcRenderer.invoke(IPC.linkCandidates, query),
  tagSuggestions: () => ipcRenderer.invoke(IPC.tagSuggestions),
  locationSuggestions: () => ipcRenderer.invoke(IPC.locationSuggestions),
  peopleSuggestions: () => ipcRenderer.invoke(IPC.peopleSuggestions),
  openExternal: (href: string) => ipcRenderer.invoke(IPC.openExternal, href),
  openTag: (name: string) => ipcRenderer.invoke(IPC.openTag, name),
  fetchRemoteImage: (url: string) => ipcRenderer.invoke(IPC.fetchRemoteImage, url),

  onVaultFileChanged: (handler: (event: VaultFileEvent) => void) =>
    subscribe<VaultFileEvent>(IPC.vaultFileChanged, handler),
  onSettingsChanged: (handler: () => void) => subscribe<void>(IPC.settingsChanged, handler),
  reloadNote: () => ipcRenderer.invoke(IPC.captureReload),

  library: {
    tree: () => ipcRenderer.invoke(IPC.libraryTree),
    notes: (selection: Selection) => ipcRenderer.invoke(IPC.libraryNotes, selection),
    folderFiles: (folder: string) => ipcRenderer.invoke(IPC.libraryFolderFiles, folder),
    folderTaskCounts: () => ipcRenderer.invoke(IPC.libraryFolderTaskCounts),
    noteTaskCounts: () => ipcRenderer.invoke(IPC.libraryNoteTaskCounts),
    search: (query: string, scope?: string) =>
      ipcRenderer.invoke(IPC.librarySearch, query, scope),
    facets: () => ipcRenderer.invoke(IPC.libraryFacets),
    openNote: (path: string) => ipcRenderer.invoke(IPC.libraryOpenNote, path),
    saveNote: (request: SaveNoteRequest) => ipcRenderer.invoke(IPC.librarySaveNote, request),
    moveNote: (path: string, folder: string, rewriteLinks?: boolean) =>
      ipcRenderer.invoke(IPC.libraryMoveNote, path, folder, rewriteLinks),
    renameNote: (path: string, title: string, rewriteLinks?: boolean) =>
      ipcRenderer.invoke(IPC.libraryRenameNote, path, title, rewriteLinks),
    linkingNotes: (path: string) => ipcRenderer.invoke(IPC.libraryLinkingNotes, path),
    onOpenLink: (handler: (event: WikiLinkOpen) => void) =>
      subscribe<WikiLinkOpen>(IPC.libraryOpenLink, handler),
    onOpenTag: (handler: (event: { name: string }) => void) =>
      subscribe<{ name: string }>(IPC.libraryOpenTag, handler),
    duplicateNote: (path: string) => ipcRenderer.invoke(IPC.libraryDuplicateNote, path),
    trashNote: (path: string) => ipcRenderer.invoke(IPC.libraryTrashNote, path),
    trashContents: () => ipcRenderer.invoke(IPC.libraryTrashContents),
    openTasksAt: (path: string) => ipcRenderer.invoke(IPC.libraryOpenTasksAt, path),
    emptyTrash: () => ipcRenderer.invoke(IPC.libraryEmptyTrash),
    createFolder: (parent: string, name: string) =>
      ipcRenderer.invoke(IPC.libraryCreateFolder, parent, name),
    renameFolder: (path: string, name: string) =>
      ipcRenderer.invoke(IPC.libraryRenameFolder, path, name),
    folderContents: (path: string) => ipcRenderer.invoke(IPC.libraryFolderContents, path),
    trashFolder: (path: string) => ipcRenderer.invoke(IPC.libraryTrashFolder, path),
    moveFolder: (path: string, parent: string) =>
      ipcRenderer.invoke(IPC.libraryMoveFolder, path, parent),
    deleteFromTrash: (path: string) => ipcRenderer.invoke(IPC.libraryDeleteFromTrash, path),
    revealNote: (path: string) => ipcRenderer.send(IPC.libraryRevealNote, path),
    noteEditable: (path: string) => ipcRenderer.invoke(IPC.libraryNoteEditable, path),
    openInCapture: (path: string) => ipcRenderer.invoke(IPC.captureLoad, path),
    newNote: (folder?: string) => ipcRenderer.send(IPC.captureNew, folder),
    onRefresh: (handler: () => void) => subscribe<void>(IPC.libraryRefresh, handler),
    onCyclePanes: (handler: (event: { backward: boolean }) => void) =>
      subscribe<{ backward: boolean }>(IPC.libraryCyclePanes, handler),
    scanState: () => ipcRenderer.invoke(IPC.libraryScanState),
    onScanProgress: (handler: (progress: ScanProgress | null) => void) =>
      subscribe<ScanProgress | null>(IPC.libraryScanProgress, handler),
    // Not `subscribe`: the point of this one is the reply. Main is waiting on
    // `libraryFlushed` before it restarts into another vault, so the answer has to be
    // sent after the handler's promise settles — including when it rejects, or a failed
    // save would hold the switch open until main's own timeout.
    onFlushSaves: (handler: () => Promise<void>) => {
      const listener = (): void => {
        void handler().finally(() => ipcRenderer.send(IPC.libraryFlushed));
      };
      ipcRenderer.on(IPC.libraryFlushSaves, listener);
      return () => ipcRenderer.off(IPC.libraryFlushSaves, listener);
    },

    conflicts: () => ipcRenderer.invoke(IPC.libraryConflicts),
    conflictDiff: (pair: ConflictPair) => ipcRenderer.invoke(IPC.libraryConflictDiff, pair),
    resolveConflict: (pair: ConflictPair, choice: ConflictChoice) =>
      ipcRenderer.invoke(IPC.libraryResolveConflict, pair, choice),

    unlinkedAttachments: () => ipcRenderer.invoke(IPC.libraryUnlinkedAttachments),
    trashAttachment: (path: string) => ipcRenderer.invoke(IPC.libraryTrashAttachment, path),

    tasks: (scope: string, openOnly: boolean) =>
      ipcRenderer.invoke(IPC.libraryTasks, scope, openOnly),
    toggleTask: (path: string, ordinal: number, expectedText: string) =>
      ipcRenderer.invoke(IPC.libraryToggleTask, path, ordinal, expectedText),
    setPinned: (path: string, pinned: boolean) =>
      ipcRenderer.invoke(IPC.librarySetPinned, path, pinned),
  },
});
