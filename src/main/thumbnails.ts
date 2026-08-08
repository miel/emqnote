import { app } from "electron";
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pruneThumbnails, thumbnailKey } from "./thumbnail-cache.js";
import { decideThumbnailProbe } from "./thumbnail-probe.js";
import { renderPdfThumbnail } from "./pdf-thumb.js";

/**
 * The I/O half of the thumbnail cache (B30/B36) — split from `thumbnail-cache.ts` for
 * the same reason `vault.ts` sits apart from `vault-io.ts`: this file touches Electron
 * (a hidden `BrowserWindow`, by way of `pdf-thumb.ts`), so it cannot be Electron-free,
 * and everything that *can* be tested without a build lives in the sibling module
 * instead. `runThumbnailProbe` below is `--thumbnail-probe`'s own Electron-bound half
 * for the same reason — its decision logic lives in `thumbnail-probe.ts`, and only the
 * render call and the printing live here.
 */

/** Beyond this, the oldest cached PNGs are evicted as a new one is generated. */
const MAX_CACHED_THUMBNAILS = 200;

/**
 * A generation that failed once this session is not retried on every render of the same
 * note — a note with three PDF links currently means three NodeViews, so without this a
 * corrupt or password-protected PDF would be re-rendered three times per note-open,
 * forever. In-memory only and bounded: a negative result belongs to this process's
 * lifetime, not to disk, since the file itself may change before the next launch, and
 * nothing here should grow without bound over a long resident run.
 *
 * The value is the render failure's own message, not just `true` — B36's whole point is
 * telling a genuine failure apart from "nothing to preview here" (see
 * `registerThumbnailProtocol`'s 422 vs 404 in `index.ts`), so the reason has to survive
 * past the render that discovered it.
 */
const failedThisSession = new Map<string, string>();
const MAX_FAILED_ENTRIES = 500;

function rememberFailure(key: string, message: string): void {
  if (failedThisSession.size >= MAX_FAILED_ENTRIES) {
    const oldest = failedThisSession.keys().next().value;
    if (oldest !== undefined) failedThisSession.delete(oldest);
  }
  failedThisSession.set(key, message);
}

async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
}

/** `<userData>/thumbnails` — a derived cache outside the vault, next to `index.sqlite` (B9). */
export function thumbnailCacheDir(): string {
  return join(app.getPath("userData"), "thumbnails");
}

/**
 * What `ensureThumbnail` found, in three shapes a caller can tell apart — the reason it
 * is not just `string | null` any more: `registerThumbnailProtocol` (`index.ts`) answers
 * 404 for `"unavailable"` ("nothing to preview here", same as always) but 422 for
 * `"failed"` — a real error, not silence, because a corrupt or password-protected PDF
 * must not look identical to a plain `.txt` attachment (B36).
 */
export type ThumbnailOutcome =
  | { kind: "ready"; file: string }
  | { kind: "unavailable" }
  | { kind: "failed"; error: string };

/**
 * Returns a cached (or freshly rendered) first-page thumbnail for `realPath`. Never
 * throws — every failure comes back as `ThumbnailOutcome`, not an exception, since a
 * broken PDF is an expected outcome here, not a bug.
 *
 * There used to be a dataless/placeholder pre-check here — `stats.size > 0 &&
 * stats.blocks === 0`, `darwin`-only, borrowed verbatim from `vault.ts`'s
 * `checkFilesOnDemand` — on the theory that a OneDrive Files On-Demand placeholder
 * reports a real size but occupies no blocks on disk. It was removed after a report of
 * "PDF preview is not showing" on a packaged macOS build against a business OneDrive:
 * this heuristic is exactly the likeliest cause, and it does not generalise the way
 * `checkFilesOnDemand` does. That function samples up to 40 files and takes a
 * majority-ish vote to answer one question for the whole vault ("is Files On-Demand
 * on"); one file reporting `blocks === 0` for a reason unrelated to hydration barely
 * moves that needle, and a wrong answer only shows a banner — its own comment: "never
 * blocks anything". Here the same test gated a *single* file, permanently for the rest
 * of the session (`failedThisSession` never re-checks it), and a business OneDrive's
 * File Provider has been observed reporting `blocks === 0` for files that are fully
 * hydrated and readable — block accounting on a File-Provider-backed volume is not the
 * same contract as a plain APFS placeholder, and `blocks` alone cannot tell the two
 * apart from outside.
 *
 * That old check was specifically about the OS thumbnail provider being asked on a
 * placeholder it might mishandle; B36 replaced the provider itself with an in-house
 * pdf.js render, which reads the file's actual bytes rather than asking a black box to
 * open it, so the theory does not even apply any more — a genuinely dataless file just
 * fails to read, same as any other broken file, and that failure is now visible instead
 * of silently permanent (see `ThumbnailOutcome`, above). `--thumbnail-probe` (`index.ts`,
 * driven from `thumbnail-probe.ts`) still exists to name exactly what went wrong for one
 * file without guessing.
 */
export async function ensureThumbnail(cacheDir: string, realPath: string): Promise<ThumbnailOutcome> {
  let stats;
  try {
    stats = statSync(realPath);
  } catch {
    return { kind: "unavailable" };
  }

  const key = thumbnailKey(realPath, stats.mtimeMs, stats.size);
  const cachedFile = join(cacheDir, `${key}.png`);

  if (existsSync(cachedFile)) return { kind: "ready", file: cachedFile };

  const remembered = failedThisSession.get(key);
  if (remembered !== undefined) return { kind: "failed", error: remembered };

  try {
    const png = await renderPdfThumbnail(realPath);
    await mkdir(cacheDir, { recursive: true });
    await writeAtomic(cachedFile, png);
    pruneThumbnails(cacheDir, MAX_CACHED_THUMBNAILS);

    return { kind: "ready", file: cachedFile };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rememberFailure(key, message);
    return { kind: "failed", error: message };
  }
}

/**
 * `emqnote --thumbnail-probe=<attachment name>` — the diagnostic for "PDF preview is not
 * showing" in the tradition of `--dump-clipboard` and `--selftest` (see `CLAUDE.md`'s
 * "diagnostic helpers"). Where `ensureThumbnail` answers with a `ThumbnailOutcome`, this
 * answers "which of the things that could go wrong, went wrong" — printed, not guessed
 * at, and deliberately bypassing `failedThisSession`: a probe run exists precisely to
 * re-examine a file the negative cache would otherwise have already given up on for the
 * rest of this session.
 *
 * Since B36, "no OS thumbnail provider produced a result" is no longer a possible
 * outcome here — there is no OS provider in the loop any more — and its place is taken
 * by a pdf.js render failure that names the actual error, which for a real PDF almost
 * always means the file itself is corrupt or password-protected rather than anything
 * about the machine this runs on.
 *
 * Returns a process exit code: `0` only for the success branch, `1` for everything else,
 * matching `--selftest`/`--screenshot`'s convention of a status code a script (or a human
 * running it once by hand) can check without parsing the printed text.
 */
export async function runThumbnailProbe(
  vault: string,
  cacheDir: string,
  name: string,
): Promise<number> {
  const decision = decideThumbnailProbe(vault, name, cacheDir);

  switch (decision.step) {
    case "not-previewable":
      console.log(
        `not previewable: "${name}" has no extension in PREVIEWABLE_EXTENSIONS — ` +
          `nothing would ever ask for a thumbnail of it`,
      );
      return 1;

    case "not-resolved":
      console.log(
        `resolveAttachment("${name}") returned null — either the name does not resolve ` +
          `to a real file inside <vault>/_attachments/ (a typo, or it traverses outside ` +
          `the folder), or the file is missing. Check the exact name against what is on ` +
          `disk in _attachments/.`,
      );
      return 1;

    case "stat-failed":
      console.log(`statSync failed after resolving the file: ${decision.error}`);
      return 1;

    case "ready": {
      const { resolved, cachedFile, alreadyCached } = decision;
      console.log(`resolved: ${resolved}`);
      if (alreadyCached) {
        console.log(`already cached at ${cachedFile} — this probe regenerates it anyway`);
      }

      let png: Buffer;
      try {
        png = await renderPdfThumbnail(resolved);
      } catch (error) {
        console.log(
          `pdf.js could not render a first page: ` +
            (error instanceof Error ? error.message : String(error)) +
            ` — is the file corrupt, password-protected, or not actually a PDF?`,
        );
        return 1;
      }

      try {
        await mkdir(cacheDir, { recursive: true });
        await writeAtomic(cachedFile, png);
        pruneThumbnails(cacheDir, MAX_CACHED_THUMBNAILS);
      } catch (error) {
        console.log(
          `pdf.js produced an image but writing it failed: ` +
            (error instanceof Error ? error.message : String(error)),
        );
        return 1;
      }

      console.log(`written to ${cachedFile}`);
      return 0;
    }
  }
}
