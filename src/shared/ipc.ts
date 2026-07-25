/** Het contract tussen main en renderer. Beide kanten importeren dit bestand. */

export const IPC = {
  /** main → renderer: het venster is getoond, zet de cursor klaar. */
  captureShow: "capture:show",
  /** renderer → main: er is een frame getekend ná het zetten van de cursor. */
  capturePainted: "capture:painted",
  /** renderer → main: de tekst is gewijzigd. */
  captureChange: "capture:change",
  /** renderer → main: sluiten (Esc of Ctrl+W). */
  captureClose: "capture:close",
  /** main → renderer: begin met een schone lei. */
  captureReset: "capture:reset",
  /** main → renderer: statusregel bijwerken. */
  captureStatus: "capture:status",
} as const;

export interface ShowPayload {
  /** Merkteken om deze vertoning te koppelen aan de meting ervan. */
  token: number;
}

export interface StatusPayload {
  /** Laatst gemeten hotkey → cursor, in milliseconden. */
  lastLatencyMs: number | null;
  /** Pad van het bestand waarin deze notitie wordt bewaard, zodra dat vaststaat. */
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
