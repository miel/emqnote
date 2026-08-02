import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeIndex, getNote, openIndex, type IndexDb } from "../src/main/index-db.js";
import { watchVault, type VaultWatcher } from "../src/main/index-watch.js";

// Real chokidar against a real temp directory: a tiny stability threshold instead of
// the 300 ms production default keeps this within the suite's ~2 second budget, and a
// generous poll margin on top of it absorbs real filesystem event latency without
// making the wait itself the flaky part.
const STABILITY_MS = 20;
const SETTLE_MS = 150;

let vault: string;
let db: IndexDb;
let watcher: VaultWatcher | null = null;

function noteContents(name: string, tags?: string): string {
  const front = [
    "---",
    `title: ${name}`,
    "type: quick",
    "created: 2026-07-26T09:00:00+02:00",
    ...(tags === undefined ? [] : [`tags: [${tags}]`]),
    "---",
    "",
  ].join("\n");
  return `${front}Tekst.\n`;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-watch-"));
  mkdirSync(join(vault, "00 Inbox"), { recursive: true });
  db = openIndex(":memory:");
});

afterEach(async () => {
  if (watcher !== null) await watcher.close();
  watcher = null;
  closeIndex(db);
  rmSync(vault, { recursive: true, force: true });
});

describe("the vault watcher", () => {
  it("indexes a file added after watching starts", async () => {
    watcher = watchVault(vault, db, { stabilityThreshold: STABILITY_MS });
    await watcher.ready();
    writeFileSync(join(vault, "00 Inbox", "Nieuw.md"), noteContents("Nieuw"));

    await settle();

    expect(getNote(db, "00 Inbox/Nieuw.md")?.title).toBe("Nieuw");
  });

  it("does not index what already existed before watching started", async () => {
    writeFileSync(join(vault, "00 Inbox", "Bestond.md"), noteContents("Bestond"));
    // macOS's fsevents backend can still report a file written moments ago as a live
    // event once watching starts — fsevents' stream isn't perfectly synchronised with
    // the crawl `ignoreInitial` governs, so a write immediately followed by `watch()`
    // is a real race there, not a Linux-only inotify quirk this settle time papers
    // over. Caught by the release CI's macOS runner, not by anything that runs here.
    await settle();
    watcher = watchVault(vault, db, { stabilityThreshold: STABILITY_MS });

    await settle();

    expect(getNote(db, "00 Inbox/Bestond.md")).toBeNull();
  });

  it("re-indexes a file that changed", async () => {
    const path = join(vault, "00 Inbox", "Notitie.md");
    writeFileSync(path, noteContents("Notitie", "oud"));
    watcher = watchVault(vault, db, { stabilityThreshold: STABILITY_MS });
    await settle();

    writeFileSync(path, noteContents("Notitie", "nieuw"));
    await settle();

    expect(getNote(db, "00 Inbox/Notitie.md")?.tags).toEqual(["nieuw"]);
  });

  it("removes a note from the index once its file is deleted", async () => {
    const path = join(vault, "00 Inbox", "Weg.md");
    watcher = watchVault(vault, db, { stabilityThreshold: STABILITY_MS });
    await watcher.ready();

    writeFileSync(path, noteContents("Weg"));
    await settle();
    expect(getNote(db, "00 Inbox/Weg.md")).not.toBeNull();

    rmSync(path);
    await settle();

    expect(getNote(db, "00 Inbox/Weg.md")).toBeNull();
  });

  it("ignores a note written inside the trash folder", async () => {
    mkdirSync(join(vault, "_trash"), { recursive: true });
    watcher = watchVault(vault, db, { stabilityThreshold: STABILITY_MS });
    await watcher.ready();

    writeFileSync(join(vault, "_trash", "Weggegooid.md"), noteContents("Weggegooid"));
    await settle();

    expect(getNote(db, "_trash/Weggegooid.md")).toBeNull();
  });

  it("ignores a non-markdown file", async () => {
    watcher = watchVault(vault, db, { stabilityThreshold: STABILITY_MS });
    await watcher.ready();

    writeFileSync(join(vault, "00 Inbox", "toevallig.txt"), "geen notitie");
    await settle();

    expect(getNote(db, "00 Inbox/toevallig.txt")).toBeNull();
  });

  it("calls onChange after indexing", async () => {
    let calls = 0;
    watcher = watchVault(vault, db, {
      stabilityThreshold: STABILITY_MS,
      onChange: () => {
        calls += 1;
      },
    });
    await watcher.ready();

    writeFileSync(join(vault, "00 Inbox", "Signaal.md"), noteContents("Signaal"));
    await settle();

    expect(calls).toBeGreaterThan(0);
  });

  it("stops reacting once closed", async () => {
    watcher = watchVault(vault, db, { stabilityThreshold: STABILITY_MS });
    await watcher.close();
    watcher = null;

    writeFileSync(join(vault, "00 Inbox", "TeLaat.md"), noteContents("TeLaat"));
    await settle();

    expect(getNote(db, "00 Inbox/TeLaat.md")).toBeNull();
  });
});
