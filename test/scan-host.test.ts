import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeIndex, openIndex, type IndexDb } from "../src/main/index-db.js";
import { stopScanWorker, workerScanRunner } from "../src/main/scan-host.js";
import { allNotes } from "../src/main/index-db.js";

/**
 * What can be tested of the worker host without a build.
 *
 * The worker itself is a built file next to `index.js` — running the suite from source,
 * `scan-worker.js` is not there, so `new Worker` fails. That is not a limitation to work
 * around here but exactly the path worth pinning: a worker that cannot start is the one
 * failure mode with real consequences (an index that never gets built means no tags, no
 * people, no search), and the fallback that covers it has to actually work. The worker
 * doing its job is verified against the built app instead — see `TODO.md`.
 */

let vault: string;
let db: IndexDb;

function note(name: string, tags: string): void {
  const front = [
    "---",
    `title: ${name}`,
    "type: quick",
    "created: 2026-07-26T09:00:00+02:00",
    `tags: [${tags}]`,
    "---",
    "",
  ].join("\n");
  writeFileSync(join(vault, "00 Inbox", `${name}.md`), `${front}Tekst.\n`);
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-worker-"));
  mkdirSync(join(vault, "00 Inbox"), { recursive: true });
  db = openIndex(":memory:");
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  closeIndex(db);
});

describe("running the scan in a worker", () => {
  it("indexes the vault anyway when the worker cannot start", async () => {
    note("Kickoff", "klantx");
    const complained = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await workerScanRunner(":memory:")(vault, db);

    expect(result).toBe("ok");
    expect(allNotes(db).map((row) => row.title)).toEqual(["Kickoff"]);
    // Loudly: a fallback nobody can see is how "the worker never actually ran" survives
    // a release.
    expect(complained).toHaveBeenCalledOnce();
    complained.mockRestore();
  });

  it("reports the fallback scan's progress like any other", async () => {
    note("Een", "klantx");
    note("Twee", "klantx");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const seen: { done: number; total: number }[] = [];
    await workerScanRunner(":memory:")(vault, db, (progress) => seen.push(progress));

    expect(seen.at(-1)).toEqual({ done: 2, total: 2 });
    vi.restoreAllMocks();
  });

  it("does nothing when asked to stop with no scan running", () => {
    expect(() => stopScanWorker()).not.toThrow();
  });
});
