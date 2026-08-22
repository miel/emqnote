import { isoWithOffset } from "@emqnote/core/time";

export const ACTIVE_DRAFT_KEY = "emqnote.iphone.active-draft.v1";

/**
 * Where undelivered notes live.
 *
 * `.v1` held `{id, filename, bytes, queuedAt}` and nothing ever drained it. `.v2` adds
 * what a real delivery loop needs to survive being killed mid-flight. Both keys are read;
 * only `.v2` is written. A queued note must never be lost to a schema change, so the
 * upgrade happens on read and the old key is removed only once the new one is safely
 * written.
 */
export const OUTBOX_KEY = "emqnote.iphone.outbox.v2";
export const LEGACY_OUTBOX_KEY = "emqnote.iphone.outbox.v1";

/** The most recent successful delivery, kept so the UI can say so truthfully. */
export const LAST_DELIVERED_KEY = "emqnote.iphone.last-delivered.v1";

export interface CaptureDraft {
  version: 1;
  title: string;
  when: string;
  where: string;
  who: string;
  body: string;
}

/**
 * `queued` is retried whenever the app can; `blocked` waits for the user — a sign-in, or a
 * refusal that retrying unchanged will not fix. Nothing is ever dropped from either state.
 */
export type OutboxState = "queued" | "blocked";

export interface OutboxItem {
  id: string;
  /** The intended name. What is actually written is `collisionCandidate(filename, candidate)`. */
  filename: string;
  bytes: string;
  queuedAt: string;
  state: OutboxState;
  /** Which collision candidate is being attempted; 1 is the plain name. */
  candidate: number;
  /** Failed delivery attempts, which is what the backoff is computed from. */
  attempts: number;
  lastError: string | null;
  /** Not before this instant. Null means "as soon as a drain comes round". */
  nextAttemptAt: string | null;
}

export interface DeliveredRecord {
  filename: string;
  deliveredAt: string;
}

/** A newly serialized note, before anything has been attempted with it. */
export function queuedItem(
  fields: Pick<OutboxItem, "id" | "filename" | "bytes" | "queuedAt">,
): OutboxItem {
  return {
    ...fields,
    state: "queued",
    candidate: 1,
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
  };
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

/**
 * Reads one stored item, upgrading a `.v1` record rather than discarding it.
 *
 * The four original fields are the ones that cannot be reconstructed — everything `.v2`
 * added describes an attempt that has not happened yet, so a `.v1` item upgrades to
 * exactly a freshly queued one.
 */
function readItem(value: unknown): OutboxItem | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.filename !== "string" ||
    typeof record.bytes !== "string" ||
    typeof record.queuedAt !== "string"
  ) {
    return null;
  }

  const base = queuedItem({
    id: record.id,
    filename: record.filename,
    bytes: record.bytes,
    queuedAt: record.queuedAt,
  });

  return {
    ...base,
    state: record.state === "blocked" ? "blocked" : "queued",
    candidate: typeof record.candidate === "number" && record.candidate >= 1 ? record.candidate : 1,
    attempts: typeof record.attempts === "number" && record.attempts >= 0 ? record.attempts : 0,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
    nextAttemptAt: typeof record.nextAttemptAt === "string" ? record.nextAttemptAt : null,
  };
}

function readOutboxKey(storage: DraftStorage, key: string): OutboxItem[] | null {
  const stored = storage.getItem(key);
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return value.map(readItem).filter((item): item is OutboxItem => item !== null);
  } catch {
    return [];
  }
}

export function loadOutbox(storage: DraftStorage): OutboxItem[] {
  return readOutboxKey(storage, OUTBOX_KEY) ?? readOutboxKey(storage, LEGACY_OUTBOX_KEY) ?? [];
}

/** Writes the whole outbox, and only then retires the `.v1` key it may have come from. */
export function storeOutbox(storage: DraftStorage, items: OutboxItem[]): void {
  storage.setItem(OUTBOX_KEY, JSON.stringify(items));
  if (storage.getItem(LEGACY_OUTBOX_KEY) !== null) storage.removeItem(LEGACY_OUTBOX_KEY);
}

/** Appends immutable serialized bytes before the OneDrive bridge is contacted. */
export function enqueue(storage: DraftStorage, item: OutboxItem): void {
  storeOutbox(storage, [...loadOutbox(storage), item]);
}

export function loadLastDelivered(storage: DraftStorage): DeliveredRecord | null {
  const stored = storage.getItem(LAST_DELIVERED_KEY);
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    return typeof record.filename === "string" && typeof record.deliveredAt === "string"
      ? { filename: record.filename, deliveredAt: record.deliveredAt }
      : null;
  } catch {
    return null;
  }
}

export function storeLastDelivered(storage: DraftStorage, record: DeliveredRecord): void {
  storage.setItem(LAST_DELIVERED_KEY, JSON.stringify(record));
}
