/**
 * The one hash this app computes, and the one thing it is for.
 *
 * Deciding whether a note that may already have been delivered was delivered comes down to
 * comparing bytes. Graph does not help: business OneDrive publishes only a `quickXorHash`
 * facet, never sha256, so the comparison is against content actually read back — and both
 * sides of it have to be hashed the same way (B79).
 *
 * `TextEncoder` produces UTF-8, matching the Swift side's `Data(text.utf8)` exactly. That
 * pairing is the whole contract; changing either without the other silently turns every
 * comparison into "different bytes", which shows up as duplicated notes rather than as an
 * error.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
