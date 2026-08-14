/**
 * The two custom protocol URLs, composed in one place and read back in another.
 *
 * `emqnote-attachment://` and `emqnote-thumb://` are both registered `standard: true`
 * (`index.ts`), which is what makes them fetchable and nameable from a CSP at all — and
 * also means Chromium parses them as `scheme://<host>/<path>` and **canonicalises the
 * host**. That canonicalisation is not cosmetic:
 *
 * - **The host is lowercased.** A name this app wrote is always lower case
 *   (`attachments.ts`'s `attachmentName` lowercases the slug and the extension), so a
 *   name-as-host survived for as long as every attachment was one this app had created.
 *   A vault written in Obsidian is full of names that are not — `Pasted image
 *   20260526104144.png`, `…_MD5.png` — and those came back from the URL lowercased, which
 *   resolves to nothing on the one platform that would notice (Linux) and by luck on the
 *   other two.
 * - **`%2F` in a host makes the URL unparseable.** Not a mangled request — `fetch` throws
 *   "Failed to parse URL" before anything is sent. That is what stood between B37's
 *   sibling problem and a target like `![[99 - Attachments/foo.png]]`: a path-form target
 *   could not be expressed as a host at all, so an attachment stored anywhere other than
 *   `_attachments/` could never be drawn, whatever `resolveAttachment` was willing to
 *   find.
 *
 * Both were measured against a real Electron build rather than reasoned about, since the
 * behaviour is Chromium's and not the URL Standard's for a non-special scheme.
 *
 * So the name lives in the **path**, where case and `%2F` are preserved verbatim and no
 * trailing slash is added, behind one fixed host. `attachmentNameFromUrl` still reads the
 * old host form too: nothing on disk holds one of these URLs, but clipboard HTML copied
 * inside the app before an update does, and `paste-images.ts` parses exactly that.
 */

/**
 * A placeholder, never resolved as a name. Chromium requires a host for a standard
 * scheme, so there has to be one; `vault` says what the path is relative to.
 */
export const ATTACHMENT_URL_HOST = "vault";

/**
 * `emqnote-attachment://vault/<name>` or `emqnote-thumb://vault/<name>`.
 *
 * `encodeURIComponent`, so a `/` inside the name becomes `%2F` and the whole name stays
 * one path segment. Chromium normalises path *segments* (`..` and `.` are collapsed), and
 * keeping the name opaque means a target can never be quietly rewritten on the way to
 * `resolveAttachment`, which is the one place that decides what a name is allowed to
 * reach.
 */
export function attachmentUrl(
  scheme: string,
  name: string,
  size?: ThumbSize,
  page?: number,
): string {
  const base = `${scheme}://${ATTACHMENT_URL_HOST}/${encodeURIComponent(name)}`;
  if (size === undefined || size === "chip") return base;
  // Page 1 is spelled without the parameter, deliberately: it is what every embed asked
  // for before the inline viewer could turn a page, so the URL of a first page — and with
  // it its cache key — is exactly the string it has always been.
  return page === undefined || page <= 1 ? `${base}?size=${size}` : `${base}?size=${size}&page=${page}`;
}

/**
 * Which render of a PDF's first page is being asked for (B43).
 *
 * `chip` is B36's small one — 256×320, drawn beside a `[[…]]` link's label. `page` is the
 * inline embed's: the same first page, rendered large enough to fill the note's column at
 * fit width. They are the same file through the same pipeline and differ only in the box
 * the page is fitted into, which is exactly why this is a size on one scheme rather than a
 * second scheme: `resolveAttachment`'s traversal guard, `isPreviewable`'s gate and the
 * 404/422 split are the same decisions either way, and two handlers would be two places to
 * change them.
 *
 * A query rather than a second path segment, because the name is one path segment and must
 * stay opaque (see above) — `encodeURIComponent` never emits a `?`, so cutting the URL at
 * the first one can never cut into a name.
 */
export type ThumbSize = "chip" | "page";

/** Which size a thumb URL is asking for. Anything unrecognised is the chip, as before B43. */
export function thumbSizeFromUrl(url: string): ThumbSize {
  const query = url.indexOf("?");
  if (query === -1) return "chip";
  return new URLSearchParams(url.slice(query + 1)).get("size") === "page" ? "page" : "chip";
}

/**
 * Which page of the document is being asked for — 1-based, and 1 for anything that does
 * not name one.
 *
 * The inline embed turns pages now, and a page is a *render parameter* in exactly the way
 * the size already was: same file, same traversal guard, same 404/422 split, one more
 * number handed to pdf.js. Anything unusable — a word, a zero, a negative, a fraction —
 * reads as page 1 rather than as an error: this comes off a URL, and the handler's job is
 * to serve a page, not to police one. A page past the end of the document is not decided
 * here; that is a render failure, and pdf.js is what knows where the end is.
 */
export function thumbPageFromUrl(url: string): number {
  const query = url.indexOf("?");
  if (query === -1) return 1;

  const asked = Number(new URLSearchParams(url.slice(query + 1)).get("page"));
  if (!Number.isInteger(asked) || asked < 1) return 1;
  return asked;
}

/**
 * The attachment name carried by one of those URLs — `attachmentUrl`'s inverse.
 *
 * Both shapes are accepted, and they are told apart without ambiguity: the path form
 * always has something after the first `/`, and the old host form never does (either no
 * slash at all, or the single trailing one Chromium appends to a host-only standard URL).
 *
 * A trailing slash is stripped before decoding, never after: `%2F` decodes to a slash of
 * its own, and that one is part of the name rather than Chromium's punctuation.
 */
export function attachmentNameFromUrl(url: string, scheme: string): string {
  // The query (B43's `?size=page`) is punctuation, never part of the name — cut before
  // decoding, since `%3F` decodes to a question mark that *is* part of one.
  const query = url.indexOf("?");
  const rest = (query === -1 ? url : url.slice(0, query)).slice(`${scheme}://`.length);
  const slash = rest.indexOf("/");

  if (slash === -1) return decodeURIComponent(rest);

  const tail = rest.slice(slash + 1);
  if (tail === "") return decodeURIComponent(rest.slice(0, slash));

  return decodeURIComponent(tail.endsWith("/") ? tail.slice(0, -1) : tail);
}
