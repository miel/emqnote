import { saveAttachment } from "./attachments.js";
import {
  FETCH_TIMEOUT_MS,
  MAX_CONCURRENT_FETCHES,
  MAX_IMAGE_BYTES,
  MAX_REDIRECTS,
  extensionForContentType,
  isFetchableUrl,
  isFollowableUrl,
  normaliseContentType,
  originalNameForUrl,
  parseDataUrl,
  sniffImageType,
  typesAgree,
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

/** Bytes accepted, named and written — the last step both paths share. */
async function store(
  vault: string,
  url: string,
  declaredType: string | null,
  bytes: Uint8Array,
): Promise<string | null> {
  if (bytes.length > MAX_IMAGE_BYTES) return null;
  // An allowed declared type is required, so a `data:` URL that names no type at all
  // (`text/plain` by RFC) is refused here rather than sniffed into acceptance.
  if (extensionForContentType(declaredType) === null) return null;

  const sniffed = sniffImageType(bytes);
  if (!typesAgree(declaredType, sniffed)) return null;

  // Priority: what the bytes are, then what the server called them, then `.png`. The
  // URL's own suffix is never consulted — a path ending `.png` that sniffs as JPEG
  // would otherwise produce a file whose name lies about its contents.
  const extension =
    extensionForContentType(sniffed) ?? extensionForContentType(declaredType) ?? ".png";

  return saveAttachment(vault, bytes, `${originalNameForUrl(url)}${extension}`);
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
  if (!isFetchableUrl(url)) return null;

  if (url.slice(0, 5).toLowerCase() === "data:") {
    const parsed = parseDataUrl(url);
    if (parsed === null) return null;
    try {
      return await store(vault, url, parsed.contentType, parsed.bytes);
    } catch {
      return null;
    }
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

      return await store(vault, url, declared, bytes);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
}
