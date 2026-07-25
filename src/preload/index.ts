import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ShowPayload, type StatusPayload } from "../shared/ipc.js";

/**
 * The renderer gets exactly these six things and nothing else. The sandbox stays on
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
  change: (text: string) => ipcRenderer.send(IPC.captureChange, text),
  close: () => ipcRenderer.send(IPC.captureClose),
});
