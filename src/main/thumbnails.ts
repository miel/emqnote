import { app, nativeImage, type NativeImage } from "electron";
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pruneThumbnails, thumbnailKey, THUMBNAIL_SIZE } from "./thumbnail-cache.js";
import { decideThumbnailProbe } from "./thumbnail-probe.js";

/**
 * The I/O half of the thumbnail cache (B30) — split from `thumbnail-cache.ts` for the
 * same reason `vault.ts` sits apart from `vault-io.ts`: this file touches `nativeImage`,
 * so it cannot be Electron-free, and everything that *can* be tested without a build
 * lives in the sibling module instead. `runThumbnailProbe` below is `--thumbnail-probe`'s
 * own Electron-bound half for the same reason — its decision logic lives in
 * `thumbnail-probe.ts`, and only the `nativeImage` call and the printing live here.
 */

/** Beyond this, the oldest cached PNGs are evicted as a new one is generated. */
const MAX_CACHED_THUMBNAILS = 200;

/**
 * A generation that failed once this session is not retried on every render of the same
 * note — a note with three PDF links currently means three NodeViews, so without this a
 * missing Linux thumbnail provider would be asked three times per note-open, forever.
 * In-memory only and bounded: a negative result belongs to this process's lifetime, not
 * to disk, since the next launch may run on a machine (or an OS update) where the
 * provider works, and nothing here should grow without bound over a long resident run.
 */
const failedThisSession = new Map<string, true>();
const MAX_FAILED_ENTRIES = 500;

function rememberFailure(key: string): void {
  if (failedThisSession.size >= MAX_FAILED_ENTRIES) {
    const oldest = failedThisSession.keys().next().value;
    if (oldest !== undefined) failedThisSession.delete(oldest);
  }
  failedThisSession.set(key, true);
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
 * Returns the absolute path of a cached (or freshly generated) first-page thumbnail for
 * `realPath`, or `null` when none is available — a missing OS provider (Linux, always;
 * Windows without one registered), a genuinely broken file, or a genuinely not-yet-
 * hydrated OneDrive placeholder are all the same outcome from a caller's point of view:
 * fall back to the plain chip. Never throws.
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
 * apart from outside. Getting it wrong here did not show a wrong banner; it skipped
 * `nativeImage` for every PDF in the vault before it was ever asked, which matches the
 * reported symptom exactly.
 *
 * Dropping the check is the right trade-off, not just the cautious one: attempting a
 * thumbnail for a genuinely dataless file costs one wasted read that
 * `nativeImage.createThumbnailFromPath` already tolerates failing on (see
 * `image.isEmpty()` below) — a cost paid once and then cached as a negative result by
 * `failedThisSession`. A false positive in the old check was a permanent, silent
 * feature outage instead, which is strictly worse. `--thumbnail-probe` (`index.ts`,
 * driven from `thumbnail-probe.ts`) exists to tell the two apart on real hardware
 * without guessing further.
 */
export async function ensureThumbnail(
  cacheDir: string,
  realPath: string,
): Promise<string | null> {
  try {
    const stats = statSync(realPath);
    const key = thumbnailKey(realPath, stats.mtimeMs, stats.size);
    const cachedFile = join(cacheDir, `${key}.png`);

    if (existsSync(cachedFile)) return cachedFile;
    if (failedThisSession.has(key)) return null;

    // Not rejected on Linux — it resolves with an empty image, which `.isEmpty()` below
    // is what actually catches. Treated the same as a thrown error either way.
    const image = await nativeImage.createThumbnailFromPath(realPath, THUMBNAIL_SIZE);
    if (image.isEmpty()) {
      rememberFailure(key);
      return null;
    }

    await mkdir(cacheDir, { recursive: true });
    await writeAtomic(cachedFile, image.toPNG());
    pruneThumbnails(cacheDir, MAX_CACHED_THUMBNAILS);

    return cachedFile;
  } catch {
    return null;
  }
}

/**
 * `emqnote --thumbnail-probe=<attachment name>` — the diagnostic for "PDF preview is not
 * showing" in the tradition of `--dump-clipboard` and `--selftest` (see `CLAUDE.md`'s
 * "diagnostic helpers"). Where `ensureThumbnail` answers "give me a thumbnail or null",
 * this answers "which of the four things that could go wrong, went wrong" — printed, not
 * guessed at, and deliberately bypassing `failedThisSession`: a probe run exists
 * precisely to re-examine a file the negative cache would otherwise have already given
 * up on for the rest of this session.
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
        `not previewable: "${name}" has no extension in PREVIEWABLE_EXTENSIONS ` +
          `(.pdf, .docx, .xlsx, .pptx) — nothing would ever ask for a thumbnail of it`,
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

      let image: NativeImage;
      try {
        image = await nativeImage.createThumbnailFromPath(resolved, THUMBNAIL_SIZE);
      } catch (error) {
        console.log(
          `nativeImage.createThumbnailFromPath threw: ` +
            (error instanceof Error ? error.message : String(error)),
        );
        return 1;
      }

      if (image.isEmpty()) {
        console.log(
          "nativeImage returned an empty image — no OS thumbnail provider produced a " +
            "result for this file. On macOS this usually means Quick Look itself cannot " +
            "preview it (try Space in Finder on the same file); on Windows, compare " +
            "against whether Explorer shows a thumbnail for it.",
        );
        return 1;
      }

      try {
        await mkdir(cacheDir, { recursive: true });
        await writeAtomic(cachedFile, image.toPNG());
        pruneThumbnails(cacheDir, MAX_CACHED_THUMBNAILS);
      } catch (error) {
        console.log(
          `nativeImage produced an image but writing it failed: ` +
            (error instanceof Error ? error.message : String(error)),
        );
        return 1;
      }

      console.log(`written to ${cachedFile}`);
      return 0;
    }
  }
}
