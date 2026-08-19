import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureWriter, type WriteResult } from "../src/main/capture-store.js";
import { parseNote } from "../src/markdown/index.js";
import { INBOX } from "../src/main/vault.js";
import { openNote } from "../src/main/vault-io.js";
import { paragraphs, payload } from "./helpers/doc.js";

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-writer-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The Inbox is only created when there is actually something to write. */
function notesIn(): string[] {
  const inbox = join(vault, INBOX);
  if (!existsSync(inbox)) return [];
  return readdirSync(inbox)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

function makeWriter(): { writer: CaptureWriter; written: WriteResult[] } {
  const written: WriteResult[] = [];
  const writer = new CaptureWriter(
    () => vault,
    (result) => written.push(result),
  );
  return { writer, written };
}

describe("closing and immediately reopening", () => {
  it("keeps the next note out of the one that just closed", () => {
    // The session has to be swapped synchronously in finish(). If it were reset only
    // after the write resolved, the first keystrokes of the next note would land in
    // the file that is on its way out — and reopening the window fast is exactly what
    // this app invites.
    const { writer } = makeWriter();

    writer.update(payload(paragraphs("First note")));
    const closing = writer.finish();

    // No await: this is the racy moment, on purpose.
    writer.update(payload(paragraphs("Second note")));

    return Promise.all([closing, writer.finish()]).then(() => {
      const notes = notesIn();
      expect(notes).toHaveLength(2);

      const contents = notes.map((name) =>
        readFileSync(join(vault, INBOX, name), "utf8"),
      );
      expect(contents.some((text) => text.includes("title: First note"))).toBe(true);
      expect(contents.some((text) => text.includes("title: Second note"))).toBe(true);
    });
  });

  it("writes one file per note, not one per change", async () => {
    const { writer, written } = makeWriter();

    writer.update(payload(paragraphs("Groeiende notitie")));
    writer.update(payload(paragraphs("Groeiende notitie", "Tweede regel")));
    writer.update(payload(paragraphs("Groeiende notitie", "Tweede regel", "Derde")));
    await writer.finish();

    expect(notesIn()).toHaveLength(1);
    expect(written).toHaveLength(1);
    expect(readFileSync(join(vault, INBOX, notesIn()[0]!), "utf8")).toContain("Derde");
  });

  it("writes nothing when the note was left empty", async () => {
    const { writer, written } = makeWriter();

    writer.update(payload(paragraphs("")));
    await writer.finish();

    expect(notesIn()).toHaveLength(0);
    expect(written).toHaveLength(0);
  });
});

describe("loading an existing note", () => {
  const NOTE = `---
title: Kickoff project Alpha
type: quick
created: 2026-07-25T14:32:00+02:00
---

Eerste versie.
`;

  const relativePath = join(INBOX, "2026-07-25 1432 Kickoff project Alpha.md");

  function writeFixture(): void {
    mkdirSync(join(vault, INBOX), { recursive: true });
    writeFileSync(join(vault, relativePath), NOTE);
  }

  it("claims the note's path immediately, before any edit arrives", async () => {
    writeFixture();
    const { writer } = makeWriter();

    await writer.load(openNote(vault, relativePath)!);

    expect(writer.activePath()).toBe(relativePath);
    // Nothing was typed yet, so nothing was written — opening a note must not touch it.
    expect(readFileSync(join(vault, relativePath), "utf8")).toBe(NOTE);
  });

  it("releases the claim once the window closes", async () => {
    writeFixture();
    const { writer } = makeWriter();

    await writer.load(openNote(vault, relativePath)!);
    await writer.finish();

    expect(writer.activePath()).toBeNull();
  });

  it("flushes whatever was being composed before loading the note, same as finish", async () => {
    // The fixture note is already in the Inbox, so a flush that behaves means exactly
    // one more file appears beside it — the one just composed.
    writeFixture();
    const { writer } = makeWriter();

    writer.update(payload(paragraphs("Half getypt")));
    await writer.load(openNote(vault, relativePath)!);

    expect(notesIn()).toHaveLength(2);
    expect(notesIn().some((name) => name.endsWith("Half getypt.md"))).toBe(true);
  });

  it("writes an edit back into the note's own file", async () => {
    writeFixture();
    const { writer } = makeWriter();

    await writer.load(openNote(vault, relativePath)!);
    writer.update(payload(paragraphs("Eerste versie.", "Nieuwe regel."), {
      created: "2026-07-25T14:32:00+02:00",
    }));
    await writer.finish();

    // No second file appeared in the Inbox — the edit landed in the note that was
    // loaded, not in a fresh one.
    expect(notesIn()).toEqual([basenameOf(relativePath)]);
    const saved = parseNote(readFileSync(join(vault, relativePath), "utf8"));
    expect(saved.frontmatter.title).toBe("Kickoff project Alpha");
    expect(saved.doc.textContent).toContain("Nieuwe regel.");
  });
});

describe("uncommittedNewPath", () => {
  it("is null before any write has picked a path", () => {
    const { writer } = makeWriter();
    writer.update(payload(paragraphs("Nog niets weggeschreven")));

    expect(writer.uncommittedNewPath()).toBeNull();
  });

  it("holds the new note's path once written, until the window closes — vault-relative, like a library note's own path", async () => {
    const { writer } = makeWriter();
    writer.update(payload(paragraphs("Half getypt")));
    const result = await writer.flush();

    // `WriteResult.path` stays absolute (existing contract, existing tests and callers
    // rely on it); `uncommittedNewPath` normalises to the vault-relative form a
    // `NoteSummary.path` uses, which is exactly what it gets compared against.
    expect(writer.uncommittedNewPath()).toBe(`${INBOX}/${basenameOf(result.path!)}`);

    await writer.finish();
    expect(writer.uncommittedNewPath()).toBeNull();
  });

  it("is null for a note loaded from an existing file, even while it is being written to", async () => {
    // An existing note reopened into capture stays visible (locked, not hidden) in the
    // library — only a brand-new note needs hiding until it is committed.
    mkdirSync(join(vault, INBOX), { recursive: true });
    const relativePath = join(INBOX, "2026-07-25 1432 Kickoff project Alpha.md");
    writeFileSync(
      join(vault, relativePath),
      "---\ntitle: Kickoff project Alpha\ntype: quick\ncreated: 2026-07-25T14:32:00+02:00\n---\n\nEerste versie.\n",
    );

    const { writer } = makeWriter();
    await writer.load(openNote(vault, relativePath)!);
    expect(writer.uncommittedNewPath()).toBeNull();

    writer.update(
      payload(paragraphs("Eerste versie.", "Nieuwe regel."), {
        created: "2026-07-25T14:32:00+02:00",
      }),
    );
    await writer.flush();
    expect(writer.uncommittedNewPath()).toBeNull();
  });
});

function basenameOf(path: string): string {
  return path.split(/[\\/]/).pop()!;
}

/**
 * The library's "+ New note", which means "a note *here*".
 *
 * The window is shown rather than recreated, so the same call reaches a session that may
 * already hold a half-typed note. The rule is about the file: once a session has picked
 * one — on its first write, never again after that — the folder no longer decides
 * anything, and pretending otherwise would only make this and the disk disagree.
 */
describe("discard", () => {
  it("names the file the draft already left on disk, and writes nothing more", async () => {
    const { writer } = makeWriter();
    writer.update(payload(paragraphs("Per ongeluk begonnen")));
    const result = await writer.flush();
    expect(notesIn()).toHaveLength(1);

    const discarded = await writer.discard();
    expect(discarded).toBe(`${INBOX}/${basenameOf(result.path!)}`);

    // The session it answered about is gone, so the commit that follows every close —
    // `hideCaptureWindow` runs `finish()` — has nothing to put back. Without the swap
    // inside `discard`, this is the line that recreates the note that was just thrown
    // away.
    await writer.finish();
    expect(notesIn()).toEqual([basenameOf(result.path!)]);
    expect(writer.uncommittedNewPath()).toBeNull();
  });

  it("cancels the write that was still on the debounce, so no file is ever created", async () => {
    const { writer, written } = makeWriter();
    writer.update(payload(paragraphs("Twee letters en meteen spijt")));

    // Discarded inside the 800 ms window: nothing has been written, so there is nothing
    // to name and nothing to trash.
    expect(await writer.discard()).toBeNull();

    // Fake timers rather than a real 800 ms wait: the whole suite is meant to stay under
    // a couple of seconds, and what is being asserted is that the callback never runs.
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(800);
    vi.useRealTimers();

    await writer.finish();
    expect(notesIn()).toEqual([]);
    expect(written).toEqual([]);
  });

  it("waits out a write already in flight rather than answering null for a file about to appear", async () => {
    const { writer } = makeWriter();
    writer.update(payload(paragraphs("Net op tijd")));

    // The write is enqueued and not awaited — exactly the shape of a discard clicked a
    // moment after the debounce fired. `writeSession` picks the file name inside that
    // promise, so an answer taken before it settles would be `null` for a note that
    // exists a tick later: an orphan nobody could find.
    const inFlight = writer.flush();
    const discarded = await writer.discard();
    await inFlight;

    expect(discarded).not.toBeNull();
    expect(notesIn()).toEqual([basenameOf(discarded!)]);
  });

  it("refuses a note loaded from the library — that one is not this window's to throw away", async () => {
    mkdirSync(join(vault, INBOX), { recursive: true });
    const relativePath = join(INBOX, "2026-07-25 1432 Kickoff project Alpha.md");
    writeFileSync(
      join(vault, relativePath),
      "---\ntitle: Kickoff project Alpha\ntype: quick\ncreated: 2026-07-25T14:32:00+02:00\n---\n\nEerste versie.\n",
    );

    const { writer } = makeWriter();
    await writer.load(openNote(vault, relativePath)!);

    expect(await writer.discard()).toBeNull();
    expect(notesIn()).toEqual([basenameOf(relativePath)]);
  });
});

describe("newNoteIn", () => {
  it("puts the next new note where the library asked", async () => {
    const { writer } = makeWriter();
    writer.newNoteIn("01 Projecten");
    writer.update(payload(paragraphs("Kickoff")));

    const { path } = await writer.flush();

    expect(path!.startsWith(join(vault, "01 Projecten"))).toBe(true);
  });

  it("reaches the vault root", async () => {
    const { writer } = makeWriter();
    writer.newNoteIn("");
    writer.update(payload(paragraphs("Losse notitie")));

    const { path } = await writer.flush();

    expect(path!).toBe(join(vault, basenameOf(path!)));
  });

  it("goes back to the Inbox for the note after it", async () => {
    const { writer } = makeWriter();
    writer.newNoteIn("01 Projecten");
    writer.update(payload(paragraphs("Kickoff")));
    await writer.finish();

    writer.update(payload(paragraphs("Van de sneltoets")));
    const { path } = await writer.flush();

    expect(path!.startsWith(join(vault, INBOX))).toBe(true);
  });

  it("does not move a note that has already picked its file", async () => {
    const { writer } = makeWriter();
    writer.update(payload(paragraphs("Half getypt")));
    const first = await writer.flush();

    writer.newNoteIn("01 Projecten");
    writer.update(payload(paragraphs("Half getypt", "En verder.")));
    const second = await writer.flush();

    expect(second.path).toBe(first.path);
    expect(first.path!.startsWith(join(vault, INBOX))).toBe(true);
  });

  it("does not move a note loaded from an existing file", async () => {
    mkdirSync(join(vault, INBOX), { recursive: true });
    const relativePath = join(INBOX, "2026-07-25 1432 Kickoff project Alpha.md");
    writeFileSync(
      join(vault, relativePath),
      "---\ntitle: Kickoff project Alpha\ntype: quick\ncreated: 2026-07-25T14:32:00+02:00\n---\n\nEerste versie.\n",
    );

    const { writer } = makeWriter();
    await writer.load(openNote(vault, relativePath)!);
    writer.newNoteIn("01 Projecten");
    writer.update(payload(paragraphs("Eerste versie.", "Nieuwe regel.")));
    await writer.flush();

    expect(existsSync(join(vault, relativePath))).toBe(true);
    expect(existsSync(join(vault, "01 Projecten"))).toBe(false);
  });
});

/**
 * A changed subject renames the file, but only once the session is handed away —
 * `finish`, `load`, or a `flush` (blur, before-install, quit) — never from the debounced
 * per-keystroke write `update` schedules. Renaming on every one of those would leave a
 * trail of half-finished/renamed files behind on OneDrive as the user types.
 */
describe("renaming on a changed subject", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never renames from the debounced write, even though the subject changed", async () => {
    const { writer } = makeWriter();

    // `vi.advanceTimersByTimeAsync` only fakes the timer itself, not the real disk I/O
    // its callback kicks off, so a short real wait follows each advance — the same
    // margin `sleep(20)` gives real-timer tests elsewhere in this suite.
    vi.useFakeTimers();
    writer.update(payload(paragraphs("Eerste titel")));
    await vi.advanceTimersByTimeAsync(800);
    vi.useRealTimers();
    await sleep(20);

    expect(notesIn()).toEqual([expect.stringContaining("Eerste titel")]);

    vi.useFakeTimers();
    writer.update(payload(paragraphs("Tweede titel")));
    await vi.advanceTimersByTimeAsync(800);
    vi.useRealTimers();
    await sleep(20);

    // The content caught up (a real write happened), but the file name did not.
    const afterDebounce = notesIn();
    expect(afterDebounce).toEqual([expect.stringContaining("Eerste titel")]);
    expect(readFileSync(join(vault, INBOX, afterDebounce[0]!), "utf8")).toContain(
      "title: Tweede titel",
    );

    // Only handing the session away catches the file name up.
    await writer.finish();
    const afterCommit = notesIn();
    expect(afterCommit).toEqual([expect.stringContaining("Tweede titel")]);
  });

  it("renames on finish() when the subject changed before commit", async () => {
    const { writer } = makeWriter();

    writer.update(payload(paragraphs("Eerste titel")));
    await writer.flush();
    writer.update(payload(paragraphs("Tweede titel")));

    const result = await writer.finish();

    expect(notesIn()).toEqual([expect.stringContaining("Tweede titel")]);
    expect(basenameOf(result.path!)).toContain("Tweede titel");
  });

  it("does not rename when the subject never changed", async () => {
    const { writer } = makeWriter();

    writer.update(payload(paragraphs("Stabiele titel")));
    await writer.flush();
    const before = notesIn();

    const result = await writer.finish();

    expect(notesIn()).toEqual(before);
    expect(basenameOf(result.path!)).toBe(before[0]);
  });

  it("renames on flush() too, not only on finish()/load()", async () => {
    const { writer } = makeWriter();

    writer.update(payload(paragraphs("Eerste titel")));
    await writer.flush();
    writer.update(payload(paragraphs("Tweede titel")));

    const result = await writer.flush();

    expect(notesIn()).toEqual([expect.stringContaining("Tweede titel")]);
    expect(result.path).not.toBeNull();
    expect(basenameOf(result.path!)).toContain("Tweede titel");
  });

  it("carries the new path to the onWritten callback, never a stale pre-rename one", async () => {
    const { writer, written } = makeWriter();

    writer.update(payload(paragraphs("Eerste titel")));
    await writer.flush();
    writer.update(payload(paragraphs("Tweede titel")));
    await writer.finish();

    const last = written[written.length - 1]!;
    expect(basenameOf(last.path!)).toContain("Tweede titel");
    expect(existsSync(last.path!)).toBe(true);
  });

  it("never renames a note loaded from an existing file, even on finish()", async () => {
    mkdirSync(join(vault, INBOX), { recursive: true });
    const relativePath = join(INBOX, "2026-07-25 1432 Kickoff project Alpha.md");
    writeFileSync(
      join(vault, relativePath),
      "---\ntitle: Kickoff project Alpha\ntype: quick\ncreated: 2026-07-25T14:32:00+02:00\n---\n\nEerste versie.\n",
    );

    const { writer } = makeWriter();
    await writer.load(openNote(vault, relativePath)!);
    writer.update(
      payload(paragraphs("Eerste versie.", "Nieuwe regel."), {
        subject: "Een compleet andere titel",
        created: "2026-07-25T14:32:00+02:00",
      }),
    );

    await writer.finish();

    expect(existsSync(join(vault, relativePath))).toBe(true);
  });

  it("renames in the folder the note was filed into, not the Inbox (B29)", async () => {
    const { writer } = makeWriter();

    writer.newNoteIn("01 Projecten/Alpha");
    writer.update(payload(paragraphs("Eerste titel")));
    await writer.flush();
    writer.update(payload(paragraphs("Tweede titel")));

    const result = await writer.finish();

    expect(result.path!.startsWith(join(vault, "01 Projecten", "Alpha"))).toBe(true);
    expect(basenameOf(result.path!)).toContain("Tweede titel");
  });
});
