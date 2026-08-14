import { mkdir, rename, writeFile } from "node:fs/promises";
import { fetchImageBytes } from "./fetch-attachment.js";
import { findCachedImage, pruneRemoteImages, remoteImageFile } from "./remote-cache.js";
import { isFetchableUrl } from "./remote-image.js";

/**
 * A remote image, drawn in a note (B50).
 *
 * A vault written in Obsidian — or in a mail client, or by hand — is full of
 * `![Name](https://…)`, and until now every one of them drew as a grey chip: the CSP
 * allows no remote `img-src` in either window, deliberately, because a note that fetches
 * from an arbitrary host every time it is opened is a tracking pixel with extra steps.
 *
 * The objection was never to the *picture*. It was to the renderer reaching the network on
 * a page's say-so, and to a note that is empty offline and on the other machine. So: **main
 * fetches it, once, and keeps the bytes** in a cache outside the vault; the renderer asks
 * for `emqnote-remote://vault/<url>` and never learns whether that cost a request. The CSP
 * still names no remote host, the fetch still goes through the whole of
 * `remote-image.ts`'s allowlist, and a note read once is readable offline afterwards.
 *
 * The I/O half, so it sits apart from `remote-cache.ts` exactly as `thumbnails.ts` sits
 * apart from `thumbnail-cache.ts` — except that this half stays **Electron-free** as well,
 * which `thumbnails.ts` cannot (it drives a hidden `BrowserWindow`). The one thing that
 * would have broken that is where the cache directory lives, so `index.ts` names it and
 * hands it in: every refusal below is then a function a test can call.
 */

/**
 * Downloads in flight, keyed by URL.
 *
 * A note with the same picture in it twice, or two windows showing one note, would
 * otherwise each open their own request for the same bytes — the collapse `ensureThumbnail`
 * needed for exactly the same reason (B46).
 */
const inFlight = new Map<string, Promise<string | null>>();

async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
}

async function download(cacheDir: string, url: string): Promise<string | null> {
  const fetched = await fetchImageBytes(url);
  if (fetched === null) return null;

  try {
    await mkdir(cacheDir, { recursive: true });
    const file = remoteImageFile(cacheDir, url, fetched.extension);
    await writeAtomic(file, fetched.bytes);
    pruneRemoteImages(cacheDir);
    return file;
  } catch {
    // A cache that cannot be written is not a reason to fail the draw differently from a
    // refusal: either way there is no file to serve, and the chip stays.
    return null;
  }
}

/**
 * The cached file for `url`, downloading it first if this is the first time it has been
 * asked for. Null for every refusal there is — a scheme that is not allowed, a redirect
 * that leaves the allowlist, a type that is not an image, bytes that do not match what the
 * server said they were, anything over the cap, a timeout, or a network error.
 *
 * Never throws: the caller turns null into a 404 and the note draws the chip it always did.
 */
export async function serveRemoteImage(cacheDir: string, url: string): Promise<string | null> {
  // Asked before the cache is consulted, so a `file:` URL never even produces a lookup —
  // the scheme decision belongs to main and is made again here whatever the renderer sent.
  if (!isFetchableUrl(url)) return null;

  const cached = findCachedImage(cacheDir, url);
  if (cached !== null) return cached;

  const running = inFlight.get(url);
  if (running !== undefined) return running;

  const started = download(cacheDir, url).finally(() => inFlight.delete(url));
  inFlight.set(url, started);
  return started;
}
