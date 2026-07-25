import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CaptureWriter, type WriteResult } from "../src/main/capture-store.js";
import { INBOX } from "../src/main/vault.js";
import { paragraphs, payload } from "./helpers/doc.js";

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-writer-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

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
