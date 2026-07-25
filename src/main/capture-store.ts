import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  docFromPlainText,
  firstLine,
  serializeNote,
  type Frontmatter,
} from "../markdown/index.js";
import { isoWithOffset, noteFileName, uniquePath } from "./filename.js";
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
  text: string;
  /** Decided on the first real write and never changed afterwards. */
  path: string | null;
  lastWritten: string | null;
}

export function beginSession(): CaptureSession {
  return { createdAt: new Date(), text: "", path: null, lastWritten: null };
}

function buildFrontmatter(session: CaptureSession, title: string): Frontmatter {
  const frontmatter: Frontmatter = {
    title,
    type: "quick",
    created: isoWithOffset(session.createdAt),
    source: "manual",
  };

  const modified = isoWithOffset(new Date());
  if (modified !== frontmatter.created) frontmatter.modified = modified;

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
}

/**
 * Writes the note, unless there is nothing to write.
 *
 * The file name is decided once, on the first write. If the first line changes after
 * that, the file stays where it is: renaming while you type would leave a trail of
 * half-finished files, and moving and renaming is work for the main window (phase 4).
 */
export async function writeSession(
  session: CaptureSession,
  vault: string,
): Promise<WriteResult> {
  const title = firstLine(session.text);
  if (title === "") return { path: session.path, written: false };

  const contents = serializeNote({
    frontmatter: buildFrontmatter(session, title),
    doc: docFromPlainText(session.text),
  });

  if (session.path !== null && session.lastWritten === contents) {
    return { path: session.path, written: false };
  }

  if (session.path === null) {
    const inbox = join(vault, INBOX);
    await mkdir(inbox, { recursive: true });
    session.path = uniquePath(inbox, noteFileName(title, session.createdAt));
  }

  await writeAtomic(session.path, contents);
  session.lastWritten = contents;

  return { path: session.path, written: true };
}

/**
 * Tracks the writes of a single session: deferred while typing, immediate on close.
 */
export class CaptureWriter {
  private session = beginSession();
  private timer: NodeJS.Timeout | null = null;
  private queue: Promise<WriteResult> = Promise.resolve({ path: null, written: false });

  constructor(
    private readonly vault: () => string | null,
    private readonly onWritten: (result: WriteResult) => void,
  ) {}

  reset(): void {
    this.cancelTimer();
    this.session = beginSession();
  }

  update(text: string): void {
    this.session.text = text;
    this.cancelTimer();
    this.timer = setTimeout(() => void this.flush(), WRITE_DEBOUNCE_MS);
  }

  /** Writes now. Call on loss of focus, on close and on quit. */
  async flush(): Promise<WriteResult> {
    this.cancelTimer();

    const vault = this.vault();
    if (vault === null) return { path: null, written: false };

    // Queue the writes so a quick Escape right after a keystroke cannot race the
    // deferred write.
    this.queue = this.queue.then(async () => {
      const result = await writeSession(this.session, vault);
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
