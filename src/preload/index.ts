import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type CapturePayload,
  type ShowPayload,
  type StatusPayload,
} from "../shared/ipc.js";
import type { SaveNoteRequest, Selection } from "../shared/vault-types.js";

/**
 * The renderer gets exactly these nine things and nothing else. The sandbox stays on
 * and contextIsolation stays on; there is no reason a note window should be able to
 * reach Node.
 */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

contextBridge.exposeInMainWorld("emqnote", {
  onShow: (handler: (payload: ShowPayload) => void) =>
    subscribe<ShowPayload>(IPC.captureShow, handler),
  onReset: (handler: () => void) => subscribe<void>(IPC.captureReset, handler),
  onStatus: (handler: (payload: StatusPayload) => void) =>
    subscribe<StatusPayload>(IPC.captureStatus, handler),
  painted: (token: number) => ipcRenderer.send(IPC.capturePainted, token),
  change: (payload: CapturePayload) => ipcRenderer.send(IPC.captureChange, payload),
  close: () => ipcRenderer.send(IPC.captureClose),
  minimise: () => ipcRenderer.send(IPC.windowMinimise),
  toggleMaximise: () => ipcRenderer.send(IPC.windowToggleMaximise),
  knownAttendees: () => ipcRenderer.invoke(IPC.attendeesList) as Promise<string[]>,
  knownTags: () => ipcRenderer.invoke(IPC.tagsList) as Promise<string[]>,
  openLibrary: () => ipcRenderer.send(IPC.libraryOpen),
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  setLocale: (locale: string) => ipcRenderer.invoke(IPC.setLocale, locale),
  setHotkey: (hotkey: string) => ipcRenderer.invoke(IPC.setHotkey, hotkey),
  listVaults: () => ipcRenderer.invoke(IPC.listVaults),
  chooseVault: () => ipcRenderer.invoke(IPC.chooseVault),
  switchVault: (path: string) => ipcRenderer.invoke(IPC.switchVault, path),

  library: {
    tree: () => ipcRenderer.invoke(IPC.libraryTree),
    notes: (selection: Selection) => ipcRenderer.invoke(IPC.libraryNotes, selection),
    facets: () => ipcRenderer.invoke(IPC.libraryFacets),
    openNote: (path: string) => ipcRenderer.invoke(IPC.libraryOpenNote, path),
    saveNote: (request: SaveNoteRequest) => ipcRenderer.invoke(IPC.librarySaveNote, request),
    moveNote: (path: string, folder: string) =>
      ipcRenderer.invoke(IPC.libraryMoveNote, path, folder),
    renameNote: (path: string, title: string) =>
      ipcRenderer.invoke(IPC.libraryRenameNote, path, title),
    trashNote: (path: string) => ipcRenderer.invoke(IPC.libraryTrashNote, path),
    createFolder: (parent: string, name: string) =>
      ipcRenderer.invoke(IPC.libraryCreateFolder, parent, name),
    renameFolder: (path: string, name: string) =>
      ipcRenderer.invoke(IPC.libraryRenameFolder, path, name),
    revealNote: (path: string) => ipcRenderer.send(IPC.libraryRevealNote, path),
    onRefresh: (handler: () => void) => subscribe<void>(IPC.libraryRefresh, handler),
  },
});
