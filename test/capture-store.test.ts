import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginSession, writeSession } from "../src/main/capture-store.js";
import { parseNote } from "../src/markdown/index.js";
import { INBOX } from "../src/main/vault.js";

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-test-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("saving a capture", () => {
  it("writes to the Inbox with the timestamp in the name", async () => {
    const session = beginSession();
    session.text = "Kickoff project Alpha\n\nEls zit voor.";

    const result = await writeSession(session, vault);

    expect(result.written).toBe(true);
    expect(result.path).not.toBeNull();
    expect(result.path!).toContain(join(vault, INBOX));
    expect(basename(result.path!)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{4} Kickoff project Alpha\.md$/,
    );
  });

  it("produces a note our own parser recognises", async () => {
    const session = beginSession();
    session.text = "Overleg\n\nEerste punt.\nTweede regel.";

    const { path } = await writeSession(session, vault);
    const note = parseNote(readFileSync(path!, "utf8"));

    expect(note.frontmatter.title).toBe("Overleg");
    expect(note.frontmatter.type).toBe("quick");
    expect(note.frontmatter.source).toBe("manual");
    expect(note.frontmatter.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]/);
    expect(note.doc.textContent).toContain("Eerste punt.");
  });

  it("writes nothing when there is only whitespace", async () => {
    const session = beginSession();
    session.text = "   \n\n  \n";

    const result = await writeSession(session, vault);

    expect(result.written).toBe(false);
    expect(result.path).toBeNull();
  });

  it("does not touch the file when the content has not changed", async () => {
    // Decision B10: by far the most OneDrive conflict copies come from an app
    // rewriting files the user never changed.
    const session = beginSession();
    session.text = "Niets veranderd";

    const first = await writeSession(session, vault);
    const before = statSync(first.path!).mtimeMs;

    await sleep(20);
    const second = await writeSession(session, vault);

    expect(second.written).toBe(false);
    expect(statSync(first.path!).mtimeMs).toBe(before);
  });

  it("keeps writing to the same file when the first line changes", async () => {
    // Renaming while you type would leave a trail of half-finished files; renaming is
    // work for the main window in phase 4.
    const session = beginSession();
    session.text = "Eerste poging";
    const first = await writeSession(session, vault);

    session.text = "Toch een andere titel";
    const second = await writeSession(session, vault);

    expect(second.path).toBe(first.path);
    expect(second.written).toBe(true);
    expect(readFileSync(first.path!, "utf8")).toContain("title: Toch een andere titel");
  });

  it("does not collide with an existing note from the same minute", async () => {
    const one = beginSession();
    one.text = "Zelfde titel";
    const two = beginSession();
    two.text = "Zelfde titel";
    two.createdAt = one.createdAt;

    const first = await writeSession(one, vault);
    const second = await writeSession(two, vault);

    expect(second.path).not.toBe(first.path);
    expect(basename(second.path!)).toMatch(/ \(2\)\.md$/);
  });
});
