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
 * Het bewaren van één capture-sessie.
 *
 * Drie dingen liggen hier vast, en alle drie volgen ze uit 05-besluitenlog.md B10:
 * er wordt pas geschreven bij rust, er wordt atomair geschreven, en er wordt niet
 * geschreven als er niets is veranderd. Samen is dat de goedkoopste
 * conflictpreventie die er is voor een vault op OneDrive.
 */

const WRITE_DEBOUNCE_MS = 800;

export interface CaptureSession {
  createdAt: Date;
  text: string;
  /** Wordt bij de eerste echte schrijfactie bepaald en daarna niet meer gewijzigd. */
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

/** Atomair: eerst een tijdelijk bestand, dan hernoemen. OneDrive ziet nooit een halve notitie. */
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
 * Schrijft de notitie weg, tenzij er niets te schrijven valt.
 *
 * De bestandsnaam wordt één keer bepaald, bij de eerste schrijfactie. Verandert de
 * eerste regel daarna nog, dan blijft het bestand staan waar het staat: hernoemen
 * tijdens het typen zou een spoor van halve bestanden achterlaten, en verplaatsen en
 * hernoemen is werk voor het hoofdvenster (fase 4).
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
 * Houdt de schrijfacties van één sessie bij: uitgesteld tijdens het typen, onmiddellijk
 * bij het sluiten.
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

  /** Schrijft nu. Aanroepen bij verlies van focus, bij sluiten en bij afsluiten. */
  async flush(): Promise<WriteResult> {
    this.cancelTimer();

    const vault = this.vault();
    if (vault === null) return { path: null, written: false };

    // Schrijfacties in de rij houden, zodat een snelle Esc na een tik niet met de
    // uitgestelde schrijfactie kan kruisen.
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
