import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { ScanProgress } from "../shared/vault-types.js";
import type { IndexDb } from "./index-db.js";
import { fullScan, type ScanResult } from "./index-scan.js";
import type { ScanWorkerData, ScanWorkerMessage } from "./scan-worker.js";
import type { ScanRunner } from "./vault-scan.js";

/**
 * The main-thread half of the scan worker: starts it, forwards its progress, and knows
 * what to do when it cannot start at all.
 *
 * `vault-scan.ts` owns *when* a scan happens and the collapse that keeps two of them from
 * running at once; this owns *where*. The seam between them is `ScanRunner`, which is why
 * `vault-scan.ts` stays as testable as it was — it never learns that a thread exists.
 *
 * The worker file is a second entry in `electron.vite.config.ts`'s main build, so it is
 * emitted next to `index.js` and found relative to it. Verified to load from inside the
 * packaged `app.asar`, ESM and shared chunks and all, rather than assumed: that is the
 * one property of this arrangement that could not be seen from the dev build, where
 * `out/main/` is a plain folder.
 */

const WORKER_ENTRY = join(dirname(fileURLToPath(import.meta.url)), "scan-worker.js");

interface ActiveScan {
  worker: Worker;
  /** Ends the scan from the outside — see `stopScanWorker`. */
  abort: () => void;
}

let active: ActiveScan | null = null;

/** A scan we ended on purpose, told apart from one that fell over. */
class ScanAborted extends Error {}

function runInWorker(
  vault: string,
  dbPath: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_ENTRY, {
      workerData: { vault, dbPath } satisfies ScanWorkerData,
    });

    let settled = false;
    const settle = (act: () => void): void => {
      if (settled) return;
      settled = true;
      act();
    };

    active = {
      worker,
      abort: () => settle(() => reject(new ScanAborted("index scan stopped"))),
    };

    worker.on("message", (message: ScanWorkerMessage) => {
      if (message.kind === "progress") {
        onProgress?.(message.progress);
        return;
      }
      // Answered as soon as the walk is done, without waiting for the thread to wind
      // down: everything it wrote is committed by then, and a library asking a question
      // should not sit through `closeIndex` and thread teardown to hear it.
      settle(() => resolve(message.result));
    });

    worker.on("error", (error: Error) => settle(() => reject(error)));

    worker.on("exit", (code) => {
      if (active?.worker === worker) active = null;
      settle(() =>
        reject(new Error(`index scan worker exited with code ${code} before finishing`)),
      );
    });
  });
}

/**
 * Runs the scan in the worker, and on the main thread if the worker could not run it.
 *
 * The fallback is deliberate and deliberately loud. A worker entry that fails to load is
 * exactly the class of bug this project has already been bitten by once — an import that
 * is fine from the project directory and missing from the package (see the
 * `dependencies` note in `CLAUDE.md`) — and the failure mode without a fallback is not a
 * slow app but a silently empty index: no tags, no people, no search, no conflict
 * banner, and nothing on screen saying why. Falling back costs the responsiveness this
 * change bought and keeps the app working. It logs, because a fallback nobody can see is
 * how "the worker never actually ran" survives a release.
 */
export function workerScanRunner(dbPath: string): ScanRunner {
  return async (vault, db, onProgress) => {
    try {
      return await runInWorker(vault, dbPath, onProgress);
    } catch (error) {
      if (error instanceof ScanAborted) {
        // Only `stopScanWorker` throws this, and only on the way out. Nothing will read
        // the answer, so it is not worth reporting a half-walked vault as a failure.
        return "ok";
      }

      console.error("[emqnote] index scan worker failed; scanning on the main thread:", error);
      return fullScan(vault, db, onProgress);
    }
  };
}

/**
 * Ends a scan in progress, for quitting.
 *
 * `will-quit` closes the index the *main thread* holds; the worker holds its own handle
 * on the same file, so it has to be stopped before that or it keeps writing into a
 * database whose other connection has gone. SQLite survives a thread ending mid-write —
 * a transaction is atomic whether or not the thread that opened it lives to see it
 * commit — so this is about not leaving the work running, not about corruption.
 */
export function stopScanWorker(): void {
  const scan = active;
  if (scan === null) return;

  active = null;
  scan.abort();
  void scan.worker.terminate();
}
