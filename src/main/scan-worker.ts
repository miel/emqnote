import { parentPort, workerData } from "node:worker_threads";
import type { ScanProgress } from "../shared/vault-types.js";
import { closeIndex, openIndex } from "./index-db.js";
import { fullScan, type ScanResult } from "./index-scan.js";

/**
 * The full vault scan, off the main thread — `02-technisch-ontwerp.md` §7.2's "eerste
 * start: volledige scan met voortgangsbalk, in een worker".
 *
 * `index-scan.ts` was written Electron-free from the start so it could move here
 * unchanged, and it does: this file adds no scanning logic of its own. What it adds is
 * the two things a thread boundary forces — a database connection of its own, and a
 * message protocol.
 *
 * **Its own connection, not a shared one.** `better-sqlite3` handles are not
 * transferable between threads, so the worker opens the same file a second time rather
 * than being handed the main thread's handle. That is what WAL mode is for (see
 * `index-db.ts`'s `migrate`): the worker writes while the main thread keeps reading, and
 * a reader in WAL never blocks on a writer. The main thread sees the rows the moment the
 * worker commits them, because every read there starts a fresh snapshot.
 *
 * The scan still yields every hundred files (`index-scan.ts`'s `breathe`). That is no
 * longer about the hotkey — nothing on this thread can delay it — but it keeps this
 * thread's own event loop live, which is what lets a progress message actually leave
 * while the walk is running.
 */

export interface ScanWorkerData {
  vault: string;
  /** The index file, opened here a second time — see above. */
  dbPath: string;
}

export type ScanWorkerMessage =
  | { kind: "progress"; progress: ScanProgress }
  | { kind: "done"; result: ScanResult };

/**
 * Progress is throttled here rather than only where it is displayed.
 *
 * `index.ts` throttles again before it puts a number on screen, but that one runs *after*
 * the message has already crossed the thread boundary and woken the main thread's event
 * loop. One message per file is a few thousand wake-ups on the thread whose latency this
 * whole change exists to protect, for a bar that cannot show more than a pixel of it.
 */
const REPORT_INTERVAL_MS = 100;

async function run(port: NonNullable<typeof parentPort>): Promise<void> {
  const { vault, dbPath } = workerData as ScanWorkerData;
  const db = openIndex(dbPath);

  try {
    let reported = 0;

    const result = await fullScan(vault, db, (progress) => {
      const now = Date.now();
      // The last one always goes through, so the bar reaches full and the window it is
      // in hears that the walk is over rather than freezing one file short.
      if (progress.done < progress.total && now - reported < REPORT_INTERVAL_MS) return;
      reported = now;
      port.postMessage({ kind: "progress", progress } satisfies ScanWorkerMessage);
    });

    port.postMessage({ kind: "done", result } satisfies ScanWorkerMessage);
  } finally {
    // Before the thread ends, so the WAL is checkpointed rather than left for whichever
    // connection opens the file next.
    closeIndex(db);
  }
}

if (parentPort === null) {
  throw new Error("scan-worker.js is a worker entry point; it is not meant to be run directly");
}

// A rejection here fails module evaluation, which the parent receives as the worker's
// `error` event — `scan-host.ts` treats that as "the worker could not do it" and scans on
// the main thread instead rather than leaving the index unbuilt.
await run(parentPort);
