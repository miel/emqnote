import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeIndex, getNote, openIndex, type IndexDb } from "../src/main/index-db.js";
import {
  POLL_INTERVAL_MS,
  pollingOptions,
  watchVault,
  type VaultWatcher,
  type WatchOptions,
} from "../src/main/index-watch.js";

// Real chokidar against a real temp directory: a tiny stability threshold instead of
// the 300 ms production default keeps this within the suite's ~2 second budget.
//
// There are two kinds of wait here and they are not interchangeable:
//
// - `waitFor` polls until the thing that should happen *has* happened, and returns the
//   moment it does. Use it for every assertion that something appears, changes or is
//   removed. It costs the real event latency and no more, so the happy path stays as
//   fast as the old fixed wait while the ceiling is high enough for a loaded CI runner.
// - `settle()` is a fixed wait, and is only correct for asserting that something did
//   *not* happen — you cannot poll for the absence of an event, you can only give it a
//   fair chance to arrive and then look.
//
// A fixed wait used for the first kind is a coin flip with a very good bias, which is
// exactly how it behaves: `SETTLE_MS` was enough on Linux for months and then failed a
// release on macOS, whose fsevents backend reports later and less evenly under load.
const STABILITY_MS = 20;
/**
 * On Windows this app watches by polling (B57), so a test that waits for the watcher to
 * notice a write waits out a whole poll — two seconds each at the production interval,
 * which put this file at 23 seconds and its four-second waits right on the edge. That is
 * a property of the *interval*, not of the code under test, so the interval is turned
 * down here exactly as `stabilityThreshold` already is. Ignored off Windows.
 */
const WATCH_INTERVAL_MS = 20;
const SETTLE_MS = 150;
const WAIT_TIMEOUT_MS = 4000;
const POLL_MS = 10;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `check` until it stops throwing, then returns. Rethrows the last failure once
 * the timeout is up, so a genuine breakage still reports the real assertion message
 * rather than a bare "timed out".
 */
async function waitFor(check: () => void): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await sleep(POLL_MS);
    }
  }
}

/**
 * Starts a watcher and does not come back until it is genuinely listening.
 *
 * `ready()` resolves when chokidar's initial crawl has finished, which on macOS is **not**
 * the moment the fsevents stream starts delivering. A file written into that gap produces
 * no event at all — and an event that was never sent is not something polling can wait
 * out, which is why raising the timeouts (twice: `afae2d3`, `89df2fd`) never settled this
 * and why it went on failing releases, once every few dozen runs, on the macOS runner
 * only. "does not index what already existed before watching started" has guarded the
 * mirror image of this race for months — fsevents reporting a file written *before*
 * watching as a live event — with exactly this wait, for exactly this reason.
 *
 * Paid on darwin alone, because this is a property of that one backend: inotify delivers
 * from the moment the watch is added, and Windows does not use a backend at all any more
 * — it polls (B57), where the wait is a whole interval rather than a gap and
 * `WATCH_INTERVAL_MS` is what answers it.
 *
 * Two of the tests here assert that something is *not* indexed. Those cannot fail from a
 * missed event — they pass, for the wrong reason — so they go through this too, or they
 * quietly stop testing anything on the one platform where the gap is real.
 */
async function startWatching(options: WatchOptions = {}): Promise<VaultWatcher> {
  const started = watchVault(vault, db, {
    stabilityThreshold: STABILITY_MS,
    watchInterval: WATCH_INTERVAL_MS,
    ...options,
  });
  await started.ready();
  if (process.platform === "darwin") await settle();
  return started;
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
    watcher = await startWatching();
    writeFileSync(join(vault, "00 Inbox", "Nieuw.md"), noteContents("Nieuw"));

    await waitFor(() => {
      expect(getNote(db, "00 Inbox/Nieuw.md")?.title).toBe("Nieuw");
    });
  });

  it("does not index what already existed before watching started", async () => {
    writeFileSync(join(vault, "00 Inbox", "Bestond.md"), noteContents("Bestond"));
    // macOS's fsevents backend can still report a file written moments ago as a live
    // event once watching starts — fsevents' stream isn't perfectly synchronised with
    // the crawl `ignoreInitial` governs, so a write immediately followed by `watch()`
    // is a real race there, not a Linux-only inotify quirk this settle time papers
    // over. Caught by the release CI's macOS runner, not by anything that runs here.
    await settle();
    watcher = watchVault(vault, db, {
      stabilityThreshold: STABILITY_MS,
      watchInterval: WATCH_INTERVAL_MS,
    });

    await settle();

    expect(getNote(db, "00 Inbox/Bestond.md")).toBeNull();
  });

  it("re-indexes a file that changed", async () => {
    const path = join(vault, "00 Inbox", "Notitie.md");
    writeFileSync(path, noteContents("Notitie", "oud"));
    // `startWatching`, not a wait for the note to appear: this file was written
    // *before* watching started, so `ignoreInitial` means it is deliberately never
    // indexed — that is the point of the test above. All there is to wait for here is
    // the watcher really listening, which is exactly what that helper answers.
    watcher = await startWatching();

    writeFileSync(path, noteContents("Notitie", "nieuw"));

    await waitFor(() => {
      expect(getNote(db, "00 Inbox/Notitie.md")?.tags).toEqual(["nieuw"]);
    });
  });

  it("removes a note from the index once its file is deleted", async () => {
    const path = join(vault, "00 Inbox", "Weg.md");
    watcher = await startWatching();

    writeFileSync(path, noteContents("Weg"));
    await waitFor(() => {
      expect(getNote(db, "00 Inbox/Weg.md")).not.toBeNull();
    });

    rmSync(path);

    await waitFor(() => {
      expect(getNote(db, "00 Inbox/Weg.md")).toBeNull();
    });
  });

  it("ignores a note written inside the trash folder", async () => {
    mkdirSync(join(vault, "_trash"), { recursive: true });
    watcher = await startWatching();

    writeFileSync(join(vault, "_trash", "Weggegooid.md"), noteContents("Weggegooid"));
    await settle();

    expect(getNote(db, "_trash/Weggegooid.md")).toBeNull();
  });

  it("ignores a non-markdown file", async () => {
    watcher = await startWatching();

    writeFileSync(join(vault, "00 Inbox", "toevallig.txt"), "geen notitie");
    await settle();

    expect(getNote(db, "00 Inbox/toevallig.txt")).toBeNull();
  });

  it("calls onChange after indexing", async () => {
    let calls = 0;
    watcher = await startWatching({
      onChange: () => {
        calls += 1;
      },
    });

    writeFileSync(join(vault, "00 Inbox", "Signaal.md"), noteContents("Signaal"));

    await waitFor(() => {
      expect(calls).toBeGreaterThan(0);
    });
  });

  it("stops reacting once closed", async () => {
    watcher = watchVault(vault, db, {
      stabilityThreshold: STABILITY_MS,
      watchInterval: WATCH_INTERVAL_MS,
    });
    await watcher.close();
    watcher = null;

    writeFileSync(join(vault, "00 Inbox", "TeLaat.md"), noteContents("TeLaat"));
    await settle();

    expect(getNote(db, "00 Inbox/TeLaat.md")).toBeNull();
  });

  it("prunes an entire subtree when a folder is deleted outside the app", async () => {
    watcher = await startWatching();

    mkdirSync(join(vault, "00 Inbox", "Sub"), { recursive: true });
    writeFileSync(join(vault, "00 Inbox", "Top.md"), noteContents("Top"));
    writeFileSync(join(vault, "00 Inbox", "Sub", "Nested.md"), noteContents("Nested"));
    await waitFor(() => {
      expect(getNote(db, "00 Inbox/Top.md")).not.toBeNull();
      expect(getNote(db, "00 Inbox/Sub/Nested.md")).not.toBeNull();
    });

    rmSync(join(vault, "00 Inbox"), { recursive: true, force: true });

    await waitFor(() => {
      expect(getNote(db, "00 Inbox/Top.md")).toBeNull();
      expect(getNote(db, "00 Inbox/Sub/Nested.md")).toBeNull();
    });
  });

  it("marks an own write as such, while still indexing it correctly regardless", async () => {
    const events: { path: string; kind: string; own: boolean }[] = [];
    watcher = await startWatching({
      isOwnWrite: (_path, contents) => contents.includes("van-de-app-zelf"),
      onChange: (event) => events.push(event),
    });

    writeFileSync(
      join(vault, "00 Inbox", "EigenSchrijf.md"),
      noteContents("EigenSchrijf", "van-de-app-zelf"),
    );
    // The invariant this exists to prove: suppression is about the *notification*
    // only. An own write still has to update the index — tags, search, tasks, all of
    // it — never just the flag on the event.
    await waitFor(() => {
      expect(getNote(db, "00 Inbox/EigenSchrijf.md")?.tags).toEqual(["van-de-app-zelf"]);
    });

    await waitFor(() => {
      const own = events.find((event) => event.path === "00 Inbox/EigenSchrijf.md");
      expect(own).toEqual({ path: "00 Inbox/EigenSchrijf.md", kind: "changed", own: true });
    });
  });

  it("reports a plain unlink as a 'removed' event with a vault-relative path", async () => {
    const path = join(vault, "00 Inbox", "WordtVerwijderd.md");
    const events: { path: string; kind: string; own: boolean }[] = [];
    watcher = await startWatching({
      onChange: (event) => events.push(event),
    });

    writeFileSync(path, noteContents("WordtVerwijderd"));
    await waitFor(() => {
      expect(getNote(db, "00 Inbox/WordtVerwijderd.md")).not.toBeNull();
    });

    rmSync(path);

    await waitFor(() => {
      expect(events).toContainEqual({
        path: "00 Inbox/WordtVerwijderd.md",
        kind: "removed",
        own: false,
      });
    });
  });
});

/**
 * Windows is the one platform where this app watching the vault stops something else
 * from working on it: chokidar's native handler holds an open directory handle per
 * folder, which blocked OneDrive from replacing a folder renamed on the other machine
 * and made permanently deleting a folder out of the trash fail. Polling holds nothing
 * open. Asserted against the option rather than against a running watcher, because the
 * behaviour that matters is a Windows kernel property this suite cannot reproduce
 * anywhere else — see `pollingOptions`' own comment.
 */
describe("how the vault is watched, per platform", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("polls on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    expect(pollingOptions()).toEqual({
      usePolling: true,
      interval: POLL_INTERVAL_MS,
      binaryInterval: POLL_INTERVAL_MS,
    });
  });

  it("takes an interval, which is what keeps this suite off the production one", () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    expect(pollingOptions(20)).toEqual({
      usePolling: true,
      interval: 20,
      binaryInterval: 20,
    });
  });

  it("watches natively everywhere else", () => {
    for (const platform of ["darwin", "linux"]) {
      Object.defineProperty(process, "platform", { value: platform });
      expect(pollingOptions()).toEqual({});
    }
  });

  it("stays inside the five seconds `04-bouwplan.md` allows a synced change", () => {
    // One poll plus one stability wait is what a change costs before it is indexed.
    expect(POLL_INTERVAL_MS + 300).toBeLessThan(5000);
  });
});
