import { saveAttachment } from "./attachments.js";
import {
  FETCH_TIMEOUT_MS,
  MAX_CONCURRENT_FETCHES,
  MAX_IMAGE_BYTES,
  MAX_REDIRECTS,
  acceptedExtension,
  extensionForContentType,
  isFetchableUrl,
  isFollowableUrl,
  isInlineImageUrl,
  normaliseContentType,
  originalNameForUrl,
  parseDataUrl,
  type ImageOrigin,
} from "./remote-image.js";

/**
 * The I/O half of a pasted image: download it, or decode its `data:` URL, and hand the
 * bytes to the same `saveAttachment` the picker and the clipboard already use.
 *
 * Every *rule* lives next door in `remote-image.ts`, which is Electron- and I/O-free
 * and tested directly. This file is the part that cannot be tested without a network,
 * and it is deliberately kept to the mechanics: a redirect loop, a byte counter, a
 * timeout and a queue.
 *
 * `fetch` here is Node's own global, exactly as `updater.ts` already uses it — its
 * `redirect: "manual"` really does hand back the 3xx with its `Location` header
 * readable, which is what makes the per-hop scheme re-check below possible at all.
 */

let active = 0;
const waiting: (() => void)[] = [];

/**
 * At most `MAX_CONCURRENT_FETCHES` downloads at a time, queued in main rather than in
 * the renderer: the renderer is one paste's worth of images, main is every window.
 * A pasted article with a dozen pictures otherwise opens a dozen sockets at once and
 * the first picture lands no sooner for it.
 */
async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  active += 1;
  try {
    return await work();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

/**
 * The body, refused the moment it goes over the cap.
 *
 * Twice, on purpose: `Content-Length` is checked before a byte is read, so an
 * announced 4 GB never starts downloading at all, and the running total is checked
 * while streaming, because the header is optional and a server is free to lie in it.
 */
async function readCapped(response: Response): Promise<Uint8Array | null> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) return null;
  }

  if (response.body === null) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;

    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

/** The final response, following at most `MAX_REDIRECTS` hops by hand. */
async function fetchFollowing(url: string, signal: AbortSignal): Promise<Response | null> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      // Manual, so every hop passes back through the allowlist below. This is the one
      // check that stops `https://attacker.example/x.png` answering with a `Location`
      // of `file:///etc/passwd`, or of an internal `http://169.254.169.254/…` metadata
      // endpoint the user's machine can reach and the attacker cannot.
      redirect: "manual",
      // Never the default session's cookies: the URL came off a web page, and the page
      // does not get to spend the user's credentials against an arbitrary host.
      credentials: "omit",
      cache: "no-store",
      signal,
    });

    if (!REDIRECT_CODES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (location === null) return null;

    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return null;
    }

    if (!isFollowableUrl(next)) return null;
    current = next;
  }

  return null;
}

/**
 * Bytes that have passed every check, with the extension they turned out to deserve — or
 * null for any refusal at all.
 *
 * Every rule behind that is `acceptedExtension`, next door: the cap, the type allowlist,
 * the magic-byte sniff, and the one difference between an address that names bytes and an
 * address that carries them. Priority for the extension is written there too — what the
 * bytes are, then what the server called them, then `.png`, and never the URL's own
 * suffix, so a path ending `.png` whose bytes are JPEG cannot produce a lying filename.
 */
function accept(
  declaredType: string | null,
  bytes: Uint8Array,
  origin: ImageOrigin,
): FetchedImage | null {
  const extension = acceptedExtension(declaredType, bytes, origin);
  return extension === null ? null : { bytes, extension };
}

/** What came back off the network, once every rule in `remote-image.ts` has said yes. */
export interface FetchedImage {
  bytes: Uint8Array;
  /** `.png`, `.jpg`, … — decided by the sniff, never by the URL. */
  extension: string;
}

/**
 * An image from the web, checked but not stored anywhere.
 *
 * The half B50 needed: a remote image drawn *in* a note is cached outside the vault
 * (`remote-cache.ts`), while a pasted one becomes a file in `_attachments/` — two
 * destinations, one download, and above all **one set of checks**. Every rule that stands
 * between a URL in a note and `file:///etc/passwd` or `http://169.254.169.254/…` is
 * applied here, once: the scheme allowlist, the per-hop redirect re-check, `credentials:
 * "omit"`, the timeout, both byte caps, the content-type allowlist and the magic-byte
 * sniff. A second copy of that for the second caller is precisely the thing not to write.
 *
 * Never throws — every refusal is `null`.
 */
export async function fetchImageBytes(url: string): Promise<FetchedImage | null> {
  if (!isFetchableUrl(url)) return null;

  if (isInlineImageUrl(url)) {
    const parsed = parseDataUrl(url);
    return parsed === null ? null : accept(parsed.contentType, parsed.bytes, "inline");
  }

  return withSlot(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetchFollowing(url, controller.signal);
      if (response === null || !response.ok) return null;

      const declared = normaliseContentType(response.headers.get("content-type"));
      if (extensionForContentType(declared) === null) {
        await response.body?.cancel();
        return null;
      }

      const bytes = await readCapped(response);
      if (bytes === null) return null;

      return accept(declared, bytes, "network");
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * Downloads a pasted image into `_attachments/` and answers the name it landed under,
 * or `null` for every refusal there is — a scheme that is not allowed, a redirect that
 * leaves the allowlist, a type that is not an image, bytes that do not match what the
 * server said they were, anything over the cap, a timeout, or a network error.
 *
 * Never throws: the renderer treats `null` as "leave the remote `<img>` where it is",
 * which is an honest fallback, and an exception crossing IPC would only turn a failed
 * picture into a failed paste.
 */
export async function fetchRemoteImage(vault: string, url: string): Promise<string | null> {
  const fetched = await fetchImageBytes(url);
  if (fetched === null) return null;

  try {
    // The name comes from the URL's path and the extension from the bytes — never both
    // from the same place. `originalNameForUrl` is where that split is written down.
    return await saveAttachment(
      vault,
      fetched.bytes,
      `${originalNameForUrl(url)}${fetched.extension}`,
    );
  } catch {
    return null;
  }
}
