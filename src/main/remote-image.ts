/**
 * Every *decision* a pasted image has to survive before it is allowed into
 * `_attachments/` — which URLs may be requested at all, what a redirect may point at,
 * which content types are accepted, what the bytes actually are, and what the file
 * ends up called.
 *
 * Electron-free and I/O-free on purpose, the same discipline `vault-io.ts` and
 * `vault-scan.ts` follow: `fetch-attachment.ts` next door does the network and the
 * write, and every rule it enforces is a function here that can be tested directly.
 * A security check that can only be exercised by standing up a network is a security
 * check nobody exercises.
 *
 * The whole point is that none of this trusts the renderer. A pasted URL is attacker
 * input in the ordinary case — it comes off a web page — so it is validated here, in
 * main, and never on the side that produced it.
 */

/** One image, hard ceiling, checked twice — see `fetch-attachment.ts`. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** How many `Location` hops are followed before giving up. */
export const MAX_REDIRECTS = 3;

/** Per image, from the first byte of the request to the last of the body. */
export const FETCH_TIMEOUT_MS = 10_000;

/**
 * How many downloads run at once. A pasted article can carry a dozen pictures and
 * every one of them would otherwise open its own socket at the same instant.
 */
export const MAX_CONCURRENT_FETCHES = 3;

/**
 * The only schemes a paste may cause a request for.
 *
 * `http:` is deliberately allowed alongside `https:`: an intranet image host on a
 * corporate network is a real case here, and refusing it would mean pasting from the
 * company wiki silently loses every picture.
 *
 * `file:` is the dangerous one and is absent: without this list a pasted (or
 * redirected-to) `file:///etc/passwd` would be read off the local disk and written
 * into the vault as an "image". `blob:`, `cid:` and `javascript:` are absent for the
 * same reason — none of them is a thing this process should ever dereference on
 * behalf of a page the user merely copied from.
 */
const FETCHABLE_SCHEMES = new Set(["https:", "http:", "data:"]);

/** A redirect may only ever land on the network, never on `data:` (or anything else). */
const FOLLOWABLE_SCHEMES = new Set(["https:", "http:"]);

function schemeOf(url: string): string | null {
  try {
    // `new URL` lowercases the protocol, so `FILE:///etc/passwd` is caught by the same
    // set as `file:///etc/passwd` — the check must not be case-sensitive.
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

/** Whether this URL may be requested at all. Relative URLs never parse, so never pass. */
export function isFetchableUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme !== null && FETCHABLE_SCHEMES.has(scheme);
}

/**
 * Whether a `Location` header may be followed. Stricter than `isFetchableUrl` by one
 * scheme: a redirect to `data:` is not something any real server does, and allowing it
 * would mean the bytes finally written came from a place the allowlist never saw.
 */
export function isFollowableUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme !== null && FOLLOWABLE_SCHEMES.has(scheme);
}

/**
 * Whether Mod+click (B33) may hand this address to `shell.openExternal` — the OS's own
 * browser, not this app. The same schemes as `isFollowableUrl`, for the same reason:
 * `file:` would let a link written inside a note open something on the local disk
 * instead of on the web, and `isFetchableUrl`'s `data:` has no business being "opened"
 * at all. The renderer reports where the click landed; the scheme decision is made
 * again here and never trusted from that report.
 */
export function isOpenableUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme !== null && FOLLOWABLE_SCHEMES.has(scheme);
}

/**
 * The image types accepted off this path.
 *
 * SVG is refused here even though the file picker (`pickAttachment`) still lets the
 * user insert an `.svg` they chose themselves, and that asymmetry is deliberate: the
 * user picked that file, but nobody picked what a pasted page's server decides to
 * return. `openWikiLink` hands a stored attachment to the OS default viewer — a
 * browser, for an SVG — where script inside the file runs. Do not "fix" this by
 * adding `image/svg+xml` to the list.
 */
const ALLOWED_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/bmp", ".bmp"],
  // Paired with `sniffImageType`'s AVIF branch below, and neither half means anything
  // without the other: `typesAgree` refuses unless the declared type and the sniff say
  // the same thing, so a type added here alone would refuse every file it names.
  ["image/avif", ".avif"],
]);

/** `image/jpg` is not a real media type, but plenty of servers send it. */
const TYPE_ALIASES = new Map([["image/jpg", "image/jpeg"]]);

/** `image/PNG; charset=binary` → `image/png`; an alias resolved along the way. */
export function normaliseContentType(header: string | null | undefined): string | null {
  if (header === null || header === undefined) return null;
  const bare = header.split(";")[0]!.trim().toLowerCase();
  if (bare === "") return null;
  return TYPE_ALIASES.get(bare) ?? bare;
}

/** The file extension for a declared or sniffed type, or null when it is not allowed. */
export function extensionForContentType(header: string | null | undefined): string | null {
  const type = normaliseContentType(header);
  if (type === null) return null;
  return ALLOWED_TYPES.get(type) ?? null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

const ASCII = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/**
 * What the first twelve bytes say the file actually is, regardless of what the server
 * called it. `null` for anything not on the allowlist — including an SVG, which has no
 * magic number at all and so can never pass this on its own.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ASCII("GIF87a")) || startsWith(bytes, ASCII("GIF89a"))) {
    return "image/gif";
  }
  if (
    startsWith(bytes, ASCII("RIFF")) &&
    bytes.length >= 12 &&
    ASCII("WEBP").every((byte, index) => bytes[8 + index] === byte)
  ) {
    return "image/webp";
  }
  if (startsWith(bytes, ASCII("BM"))) return "image/bmp";
  // AVIF has no magic number at the very front: it is ISO base media format, so the file
  // opens with a four-byte box length whose value is not fixed, then `ftyp` at offset 4
  // and the brand at offset 8. `avis` is the same container holding an image *sequence*
  // — Chromium draws one in an `<img>` exactly as it draws a still, so refusing it would
  // only mean the animated half of one format silently failed where the still half
  // worked. Nothing below offset 4 is looked at, which is why this cannot use
  // `startsWith`.
  if (
    bytes.length >= 12 &&
    ASCII("ftyp").every((byte, index) => bytes[4 + index] === byte) &&
    (ASCII("avif").every((byte, index) => bytes[8 + index] === byte) ||
      ASCII("avis").every((byte, index) => bytes[8 + index] === byte))
  ) {
    return "image/avif";
  }
  return null;
}

/**
 * The declared type and the sniffed type must be the same thing.
 *
 * A mismatch is a refusal, never a quiet fall back to the sniffed type: a server that
 * says PNG and sends something else is either broken or lying, and neither is a file
 * this app should be storing in the user's vault under a name it invented.
 */
export function typesAgree(declared: string | null | undefined, sniffed: string | null): boolean {
  const left = normaliseContentType(declared);
  return left !== null && sniffed !== null && left === sniffed;
}

/**
 * Where the bytes came from — which is the whole of the difference between trusting a
 * declared type and ignoring one.
 *
 * `"network"` is a server's `Content-Type`: a claim made by somebody else about bytes that
 * arrive separately. `"inline"` is a `data:` URL's own label, which travels in the same
 * string as the payload it describes.
 */
export type ImageOrigin = "network" | "inline";

/** Whether this address carries its bytes with it rather than naming somewhere to get them. */
export function isInlineImageUrl(url: string): boolean {
  return schemeOf(url) === "data:";
}

/**
 * The extension these bytes have earned, or `null` for a refusal — the one place the
 * declared type and the magic number are weighed against each other.
 *
 * **`"network"`: the two must say the same thing.** That is `typesAgree`'s rule and the
 * reason for it is written on that function — a server that says PNG and sends something
 * else is either broken or lying, and neither is a file this app should store in the
 * user's vault under a name it invented.
 *
 * **`"inline"`: the label is ignored completely and the bytes decide.** There is no second
 * party to catch out here; the label and the payload are two halves of one string, so a
 * mismatch is evidence of nothing, and an author who wanted PNG bytes served would simply
 * have written a PNG. What the network rule did catch was real notes. Word and Outlook
 * write `data:image/png;base64,R0lGODdh…` — a GIF, labelled PNG, `Software: Microsoft
 * Office` in its comment block — and every one of those was refused: a grey chip in a note
 * that had the whole picture sitting in it, and a paste that left the base64 in the file
 * instead of turning it into an attachment. The RFC's own default is the same shape:
 * `data:;base64,…` names no type at all, which normalises to `null` and could never pass a
 * check that required one.
 *
 * Nothing else is relaxed. The bytes still have to sniff as one of `ALLOWED_TYPES`, so an
 * SVG — which has no magic number and so can never sniff as anything — passes no more than
 * it did, and neither does an HTML document or a `text/plain` payload. The cap is the same
 * cap. The extension still comes from what the bytes *are*, never from what anything called
 * them, which is what stops a file being stored under a name that lies about its contents.
 */
export function acceptedExtension(
  declared: string | null | undefined,
  bytes: Uint8Array,
  origin: ImageOrigin,
): string | null {
  if (bytes.length > MAX_IMAGE_BYTES) return null;

  const sniffed = sniffImageType(bytes);
  if (origin === "inline") {
    return sniffed === null ? null : extensionForContentType(sniffed);
  }

  // An allowed declared type is required before the sniff is even consulted, so a server
  // answering `text/html` is refused on its own say-so rather than by what it sent.
  if (extensionForContentType(declared) === null) return null;
  if (!typesAgree(declared, sniffed)) return null;

  return extensionForContentType(sniffed) ?? extensionForContentType(declared) ?? ".png";
}

const BASE64_DATA_URL = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)?((?:;[^,;]*)*);base64,([\s\S]*)$/i;
const BASE64_CHARS = /^[A-Za-z0-9+/\r\n]*={0,2}$/;

export interface DataUrlContent {
  contentType: string | null;
  bytes: Uint8Array;
}

/**
 * The bytes inside a `data:` URL, or `null` when it is malformed or not base64.
 *
 * Only the base64 flavour is read. A percent-encoded `data:text/...` URL is never an
 * image in practice, and refusing it here is one less decoder to be wrong about.
 */
export function parseDataUrl(url: string): DataUrlContent | null {
  const match = BASE64_DATA_URL.exec(url);
  if (match === null) return null;

  const payload = match[3] ?? "";
  if (!BASE64_CHARS.test(payload)) return null;

  const compact = payload.replace(/[\r\n]/g, "");
  // `Buffer.from` silently drops anything it cannot read, so the charset check above
  // is what makes a rejection a rejection rather than a truncated image.
  if (compact.length % 4 !== 0) return null;

  const bytes = new Uint8Array(Buffer.from(compact, "base64"));
  if (bytes.length === 0) return null;

  return { contentType: normaliseContentType(match[1] ?? null), bytes };
}

/** Extensions stripped off a URL's last path segment before it becomes a filename stem. */
const IMAGE_EXTENSIONS = /\.(png|jpe?g|jfif|gif|webp|bmp|svg|avif|tiff?|ico)$/i;

/**
 * A filename stem for the URL — never its extension.
 *
 * The extension is chosen from what the bytes turned out to be (see
 * `fetch-attachment.ts`), never from the path: a URL ending `.png` that sniffs as JPEG
 * must not produce a `.png` file. So the known image suffix is stripped here and the
 * caller appends the real one.
 *
 * The result still goes through `attachmentName`, which applies `sanitiseTitle` and so
 * the same Windows reserved-name and illegal-character rules every other filename in
 * the vault gets. This only has to produce something recognisable and safe to hand it.
 */
export function originalNameForUrl(url: string): string {
  let segment = "";

  try {
    const parsed = new URL(url);
    // `pathname` already excludes `?query` and `#fragment`; a `data:` URL has no
    // meaningful path at all and falls through to the default below.
    if (parsed.protocol !== "data:") {
      const parts = parsed.pathname.split("/").filter((part) => part !== "");
      segment = parts[parts.length - 1] ?? "";
      try {
        segment = decodeURIComponent(segment);
      } catch {
        // A stray `%` is not worth refusing the whole image over — keep it undecoded.
      }
    }
  } catch {
    return "image";
  }

  const stem = segment.replace(IMAGE_EXTENSIONS, "");
  // Percent-decoding can put `\ / : * ? " < > |` back into the segment, so the slug is
  // built from an allowlist of characters rather than by removing a blocklist.
  const slug = stem
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40)
    .replace(/-+$/g, "");

  return slug === "" ? "image" : slug;
}
