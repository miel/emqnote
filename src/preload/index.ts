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
  OpenedNote,
  SaveNoteRequest,
  ScanProgress,
  Selection,
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
  painted: (token: number) => ipcRenderer.send(IPC.capturePainted, token),
  change: (payload: CapturePayload) => ipcRenderer.send(IPC.captureChange, payload),
  close: () => ipcRenderer.send(IPC.captureClose),
  minimise: () => ipcRenderer.send(IPC.windowMinimise),
  toggleMaximise: () => ipcRenderer.send(IPC.windowToggleMaximise),
  openLibrary: () => ipcRenderer.send(IPC.libraryOpen),
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  setLocale: (locale: string) => ipcRenderer.invoke(IPC.setLocale, locale),
  setHotkey: (hotkey: string) => ipcRenderer.invoke(IPC.setHotkey, hotkey),
  listVaults: () => ipcRenderer.invoke(IPC.listVaults),
  chooseVault: () => ipcRenderer.invoke(IPC.chooseVault),
  switchVault: (path: string) => ipcRenderer.invoke(IPC.switchVault, path),
  saveAttachment: (bytes: ArrayBuffer, originalName: string) =>
    ipcRenderer.invoke(IPC.saveAttachment, bytes, originalName),
  pickAttachment: () => ipcRenderer.invoke(IPC.pickAttachment),
  openAttachment: (name: string) => ipcRenderer.invoke(IPC.openAttachment, name),

  library: {
    tree: () => ipcRenderer.invoke(IPC.libraryTree),
    notes: (selection: Selection) => ipcRenderer.invoke(IPC.libraryNotes, selection),
    search: (query: string) => ipcRenderer.invoke(IPC.librarySearch, query),
    facets: () => ipcRenderer.invoke(IPC.libraryFacets),
    openNote: (path: string) => ipcRenderer.invoke(IPC.libraryOpenNote, path),
    saveNote: (request: SaveNoteRequest) => ipcRenderer.invoke(IPC.librarySaveNote, request),
    moveNote: (path: string, folder: string) =>
      ipcRenderer.invoke(IPC.libraryMoveNote, path, folder),
    renameNote: (path: string, title: string) =>
      ipcRenderer.invoke(IPC.libraryRenameNote, path, title),
    trashNote: (path: string) => ipcRenderer.invoke(IPC.libraryTrashNote, path),
    emptyTrash: () => ipcRenderer.invoke(IPC.libraryEmptyTrash),
    createFolder: (parent: string, name: string) =>
      ipcRenderer.invoke(IPC.libraryCreateFolder, parent, name),
    renameFolder: (path: string, name: string) =>
      ipcRenderer.invoke(IPC.libraryRenameFolder, path, name),
    revealNote: (path: string) => ipcRenderer.send(IPC.libraryRevealNote, path),
    noteEditable: (path: string) => ipcRenderer.invoke(IPC.libraryNoteEditable, path),
    openInCapture: (path: string) => ipcRenderer.invoke(IPC.captureLoad, path),
    newNote: () => ipcRenderer.send(IPC.captureNew),
    onRefresh: (handler: () => void) => subscribe<void>(IPC.libraryRefresh, handler),
    scanState: () => ipcRenderer.invoke(IPC.libraryScanState),
    onScanProgress: (handler: (progress: ScanProgress | null) => void) =>
      subscribe<ScanProgress | null>(IPC.libraryScanProgress, handler),

    conflicts: () => ipcRenderer.invoke(IPC.libraryConflicts),
    conflictDiff: (pair: ConflictPair) => ipcRenderer.invoke(IPC.libraryConflictDiff, pair),
    resolveConflict: (pair: ConflictPair, choice: ConflictChoice) =>
      ipcRenderer.invoke(IPC.libraryResolveConflict, pair, choice),

    orphanedAttachments: () => ipcRenderer.invoke(IPC.libraryOrphanedAttachments),
    attachmentPreview: (path: string) => ipcRenderer.invoke(IPC.libraryAttachmentPreview, path),
    trashAttachment: (path: string) => ipcRenderer.invoke(IPC.libraryTrashAttachment, path),
  },
});
