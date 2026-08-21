import { isoWithOffset } from "@emqnote/core/time";

export const ACTIVE_DRAFT_KEY = "emqnote.iphone.active-draft.v1";
export const OUTBOX_KEY = "emqnote.iphone.outbox.v1";

export interface CaptureDraft {
  version: 1;
  title: string;
  when: string;
  where: string;
  who: string;
  body: string;
}

export interface OutboxItem {
  id: string;
  filename: string;
  bytes: string;
  queuedAt: string;
}

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Value for an iOS `datetime-local` control, retaining the wall-clock time. */
export function localDateTimeValue(when: Date): string {
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`
  );
}

export function freshDraft(now = new Date()): CaptureDraft {
  return {
    version: 1,
    title: "",
    when: localDateTimeValue(now),
    where: "",
    who: "",
    body: "",
  };
}

/** Turns the native control's local wall time into the dialect's offset-bearing ISO value. */
export function createdValue(localValue: string): string {
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.valueOf()) ? "" : isoWithOffset(parsed);
}

/** Desktop and mobile both accept comma and semicolon as attendee separators. */
export function attendeeNames(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

function isDraft(value: unknown): value is CaptureDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    typeof candidate.title === "string" &&
    typeof candidate.when === "string" &&
    typeof candidate.where === "string" &&
    typeof candidate.who === "string" &&
    typeof candidate.body === "string"
  );
}

export function loadDraft(storage: DraftStorage): CaptureDraft | null {
  const stored = storage.getItem(ACTIVE_DRAFT_KEY);
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return isDraft(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeDraft(storage: DraftStorage, draft: CaptureDraft): void {
  storage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft(storage: DraftStorage): void {
  storage.removeItem(ACTIVE_DRAFT_KEY);
}

export function loadOutbox(storage: DraftStorage): OutboxItem[] {
  const stored = storage.getItem(OUTBOX_KEY);
  if (stored === null) return [];
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is OutboxItem => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.id === "string" &&
        typeof record.filename === "string" &&
        typeof record.bytes === "string" &&
        typeof record.queuedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

/** Appends immutable serialized bytes before any future OneDrive bridge is contacted. */
export function enqueue(storage: DraftStorage, item: OutboxItem): void {
  storage.setItem(OUTBOX_KEY, JSON.stringify([...loadOutbox(storage), item]));
}
