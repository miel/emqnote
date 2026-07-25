/** The contract between main and renderer. Both sides import this file. */

export const IPC = {
  /** main → renderer: the window is showing, put the caret in place. */
  captureShow: "capture:show",
  /** renderer → main: a frame was painted after the caret was placed. */
  capturePainted: "capture:painted",
  /** renderer → main: the text changed. */
  captureChange: "capture:change",
  /** renderer → main: close (Esc or Ctrl+W). */
  captureClose: "capture:close",
  /** main → renderer: start again with a clean slate. */
  captureReset: "capture:reset",
  /** main → renderer: update the status bar. */
  captureStatus: "capture:status",
} as const;

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

export interface CaptureApi {
  onShow: (handler: (payload: ShowPayload) => void) => () => void;
  onReset: (handler: () => void) => () => void;
  onStatus: (handler: (payload: StatusPayload) => void) => () => void;
  painted: (token: number) => void;
  change: (text: string) => void;
  close: () => void;
}

declare global {
  interface Window {
    emqnote: CaptureApi;
  }
}
