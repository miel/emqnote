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

export interface CaptureApi {
  onShow: (handler: (payload: ShowPayload) => void) => () => void;
  onReset: (handler: () => void) => () => void;
  onStatus: (handler: (payload: StatusPayload) => void) => () => void;
  painted: (token: number) => void;
  change: (payload: CapturePayload) => void;
  close: () => void;
  knownAttendees: () => Promise<string[]>;
}

declare global {
  interface Window {
    emqnote: CaptureApi;
  }
}
