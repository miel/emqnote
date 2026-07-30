import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Node as PMNode } from "prosemirror-model";
import { cleanTagInput, schema, serializeNote, type Frontmatter } from "../markdown/index.js";
import type { CapturePayload } from "../shared/ipc.js";
import type { OpenedNote } from "../shared/vault-types.js";
import { isoWithOffset, noteFileName, uniquePath } from "./filename.js";
import { saveNote } from "./vault-io.js";
import { INBOX } from "./vault.js";

/**
 * Persisting a single capture session.
 *
 * Three things are fixed here, and all three follow from 05-besluitenlog.md B10:
 * writing only happens once typing has settled, writing is atomic, and nothing is
 * written when nothing changed. Together that is the cheapest conflict prevention
 * available for a vault on OneDrive.
 */

const WRITE_DEBOUNCE_MS = 800;

export interface CaptureSession {
  createdAt: Date;
  payload: CapturePayload | null;
  /** Decided on the first real write and never changed afterwards. */
  path: string | null;
  lastWritten: string | null;
  /**
   * Set only when the session was loaded from an existing note (see `loadSession`).
   * The title then stays pinned to this rather than to the subject field — which the
   * header hides for that case, the same way the library reader has none, because the
   * title belongs to Rename and a second way to change it would let them drift (B20).
   */
  existingTitle: string | null;
}

export function beginSession(): CaptureSession {
  return {
    createdAt: new Date(),
    payload: null,
    path: null,
    lastWritten: null,
    existingTitle: null,
  };
}

/**
 * Starts a session on a note that already exists, so the next write lands back in its
 * own file instead of a fresh one in the Inbox.
 */
export function loadSession(note: OpenedNote): CaptureSession {
  return {
    createdAt: new Date(),
    payload: null,
    path: note.path,
    lastWritten: null,
    existingTitle: note.title,
  };
}

/** The first non-empty line of the body, used when no subject was given. */
function firstLineOf(doc: PMNode): string {
  let found = "";
  doc.descendants((node) => {
    if (found !== "") return false;
    if (node.isTextblock) {
      const text = node.textContent.trim();
      if (text !== "") found = text;
      return false;
    }
    return true;
  });
  return found;
}

function buildFrontmatter(
  payload: CapturePayload,
  doc: PMNode,
  createdFallback: Date,
): Frontmatter | null {
  const subject = payload.subject.trim();
  const title = subject === "" ? firstLineOf(doc) : subject;
  if (title === "") return null;

  const frontmatter: Frontmatter = {
    title,
    type: payload.kind,
    created: payload.created === "" ? isoWithOffset(createdFallback) : payload.created,
    source: "manual",
  };

  const modified = isoWithOffset(new Date());
  if (modified !== frontmatter.created) frontmatter.modified = modified;

  // Not gated on the kind any more (B20): where and who apply to any note, and the
  // frontmatter spec always allowed every optional field on either type. An empty field
  // still writes nothing, so a note that has neither reads exactly as it did before.
  const location = payload.location.trim();
  if (location !== "") frontmatter.location = location;

  const attendees = payload.attendees
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (attendees.length > 0) frontmatter.attendees = attendees;

  // Only what was typed in the field lands here — inline #tags stay in the body where
  // they were written (B19).
  const tags = payload.tags.map(cleanTagInput).filter((tag) => tag !== "");
  if (tags.length > 0) frontmatter.tags = tags;

  return frontmatter;
}

/** Atomic: temporary file first, then rename. OneDrive never sees half a note. */
async function writeAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, path);
}

export interface WriteResult {
  path: string | null;
  written: boolean;
  /** Names in this note, so the caller can remember them for autocomplete. */
  attendees: string[];
  /** Likewise for the tag field. */
  tags: string[];
}

const NOTHING: WriteResult = { path: null, written: false, attendees: [], tags: [] };

/**
 * This module deliberately imports nothing from Electron. Writing a note is plain file
 * logic, and keeping it that way means it can be tested directly instead of behind a
 * mocked runtime — which is exactly where the rules from B10 need to be pinned down.
 */

/**
 * Writes the note, unless there is nothing to write.
 *
 * The file name is decided once, on the first write. If the title changes after that,
 * the file stays where it is: renaming while you type would leave a trail of
 * half-finished files, and moving and renaming is work for the main window (phase 4).
 */
export async function writeSession(
  session: CaptureSession,
  vault: string,
): Promise<WriteResult> {
  const payload = session.payload;
  if (payload === null) return { ...NOTHING, path: session.path };

  // A session loaded from an existing note saves through the same path the library
  // reader uses, so the two write identically: unrelated frontmatter is preserved, and
  // `title` stays pinned to what was loaded rather than to the (hidden, in this case)
  // subject field.
  if (session.existingTitle !== null) {
    if (session.path === null) return { ...NOTHING, path: null };

    const result = saveNote(vault, {
      path: session.path,
      title: session.existingTitle,
      kind: payload.kind,
      created: payload.created,
      location: payload.location,
      attendees: payload.attendees,
      tags: payload.tags,
      doc: payload.doc,
    });

    return {
      path: result.path,
      written: result.written,
      attendees: payload.attendees,
      tags: payload.tags,
    };
  }

  const doc = schema.nodeFromJSON(payload.doc);
  const frontmatter = buildFrontmatter(payload, doc, session.createdAt);
  if (frontmatter === null) return { ...NOTHING, path: session.path };

  const contents = serializeNote({ frontmatter, doc });

  if (session.path !== null && session.lastWritten === contents) {
    return { ...NOTHING, path: session.path };
  }

  if (session.path === null) {
    const inbox = join(vault, INBOX);
    await mkdir(inbox, { recursive: true });
    session.path = uniquePath(inbox, noteFileName(frontmatter.title, session.createdAt));
  }

  await writeAtomic(session.path, contents);
  session.lastWritten = contents;

  return {
    path: session.path,
    written: true,
    attendees: frontmatter.attendees ?? [],
    tags: frontmatter.tags ?? [],
  };
}

/**
 * Tracks the writes of a single session: deferred while typing, immediate on close.
 */
export class CaptureWriter {
  private session = beginSession();
  private timer: NodeJS.Timeout | null = null;
  private queue: Promise<WriteResult> = Promise.resolve(NOTHING);

  constructor(
    private readonly vault: () => string | null,
    private readonly onWritten: (result: WriteResult) => void,
  ) {}

  update(payload: CapturePayload): void {
    this.session.payload = payload;
    this.cancelTimer();
    this.timer = setTimeout(() => void this.flush(), WRITE_DEBOUNCE_MS);
  }

  /** The path of the note currently claimed by this session, if any. */
  activePath(): string | null {
    return this.session.path;
  }

  /**
   * Hands the window over to an existing note: flush and close whatever was being
   * composed, the same ordering `finish` uses and for the same reason, then start a
   * session already pointed at the note's own file.
   */
  load(note: OpenedNote): Promise<WriteResult> {
    const finished = this.session;
    this.session = loadSession(note);
    this.cancelTimer();
    return this.enqueue(finished);
  }

  /**
   * Closes the current note: write it out, and start a fresh one.
   *
   * The session is swapped *before* the write is awaited, and that ordering is the
   * whole point. Resetting after the write completes leaves a window in which the next
   * note is typed into the session that is on its way out — and then the first few
   * keystrokes of the new note land in the old file, or a second file appears for what
   * should have been one note. Reopening the window quickly is exactly the sort of
   * thing this app invites, so that window has to be closed.
   */
  finish(): Promise<WriteResult> {
    const finished = this.session;
    this.session = beginSession();
    this.cancelTimer();
    return this.enqueue(finished);
  }

  /** Writes the current note without ending it. Used on quit. */
  async flush(): Promise<WriteResult> {
    this.cancelTimer();
    return this.enqueue(this.session);
  }

  private enqueue(session: CaptureSession): Promise<WriteResult> {
    const vault = this.vault();
    if (vault === null) return Promise.resolve(NOTHING);

    // Queue the writes so a quick Escape right after a keystroke cannot race the
    // deferred write.
    this.queue = this.queue.then(async () => {
      const result = await writeSession(session, vault);
      if (result.written) this.onWritten(result);
      return result;
    });

    return this.queue;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
