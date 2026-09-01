import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  acceptedExtension,
  extensionForContentType,
  isFetchableUrl,
  isFollowableUrl,
  isInlineImageUrl,
  isOpenableUrl,
  normaliseContentType,
  originalNameForUrl,
  parseDataUrl,
  sniffImageType,
  typesAgree,
} from "../src/main/remote-image.js";

/**
 * The rules a pasted image has to pass before it is allowed into the vault.
 *
 * Plain Node, no jsdom and no Electron — which is the point of `remote-image.ts` being
 * a module of its own: a security check that can only be exercised by standing up a
 * network is a security check nobody exercises.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const GIF = new Uint8Array([...Buffer.from("GIF89a"), 1, 0, 1, 0, 0, 0]);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 26, 0, 0, 0, ...Buffer.from("WEBP")]);
const BMP = new Uint8Array([...Buffer.from("BM"), 70, 0, 0, 0, 0, 0, 0, 0, 54, 0]);
// ISO base media format: a four-byte box length whose value is not fixed (0x20 here, as
// a real file's would be), then `ftyp`, then the brand. The leading bytes are junk on
// purpose — they are what stops this being recognisable by a prefix match.
const AVIF = new Uint8Array([0, 0, 0, 0x20, ...Buffer.from("ftyp"), ...Buffer.from("avif")]);
const AVIS = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftyp"), ...Buffer.from("avis")]);
/** The same container, holding neither — an `.mp4` opens exactly like this. */
const ISOM = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftyp"), ...Buffer.from("isom")]);

describe("isFetchableUrl", () => {
  it("allows https and http — an intranet image host is a real case here", () => {
    expect(isFetchableUrl("https://example.com/a.png")).toBe(true);
    expect(isFetchableUrl("http://intranet.local/a.png")).toBe(true);
  });

  it("allows a data URL, which needs no request at all", () => {
    expect(isFetchableUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("refuses file:, the dangerous one, whatever its case", () => {
    expect(isFetchableUrl("file:///etc/passwd")).toBe(false);
    expect(isFetchableUrl("FILE:///etc/passwd")).toBe(false);
    expect(isFetchableUrl("File:///C:/Windows/win.ini")).toBe(false);
  });

  it("refuses blob:, cid: and javascript:", () => {
    expect(isFetchableUrl("blob:https://example.com/2f8c-4a")).toBe(false);
    expect(isFetchableUrl("cid:image001.png@01DA")).toBe(false);
    expect(isFetchableUrl("javascript:alert(1)")).toBe(false);
    expect(isFetchableUrl("JavaScript:alert(1)")).toBe(false);
  });

  it("refuses a relative address, which never parses as a URL", () => {
    expect(isFetchableUrl("/images/a.png")).toBe(false);
    expect(isFetchableUrl("a.png")).toBe(false);
    expect(isFetchableUrl("")).toBe(false);
  });
});

describe("isFollowableUrl", () => {
  it("is the allowlist minus data:, so a redirect always lands on the network", () => {
    expect(isFollowableUrl("https://example.com/a.png")).toBe(true);
    expect(isFollowableUrl("http://example.com/a.png")).toBe(true);
    expect(isFollowableUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
  });

  it("refuses the two SSRF targets that matter", () => {
    // The reason `redirect: "manual"` exists in `fetch-attachment.ts`: an allowed
    // https URL answering with either of these must not be followed.
    expect(isFollowableUrl("file:///etc/passwd")).toBe(false);
    expect(isFollowableUrl("gopher://169.254.169.254/")).toBe(false);
  });
});

describe("isOpenableUrl", () => {
  it("allows https and http — Mod+click (B33) opens the OS's own browser", () => {
    expect(isOpenableUrl("https://example.com/")).toBe(true);
    expect(isOpenableUrl("http://intranet.local/")).toBe(true);
  });

  it("refuses data:, unlike isFetchableUrl — there is nothing to \"open\" about one", () => {
    expect(isOpenableUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
  });

  it("refuses file:, whatever its case — a link must not open something on disk", () => {
    expect(isOpenableUrl("file:///etc/passwd")).toBe(false);
    expect(isOpenableUrl("FILE:///etc/passwd")).toBe(false);
  });

  it("refuses javascript: and a relative or empty address", () => {
    expect(isOpenableUrl("javascript:alert(1)")).toBe(false);
    expect(isOpenableUrl("/notes/inbox")).toBe(false);
    expect(isOpenableUrl("")).toBe(false);
  });
});

describe("parseDataUrl", () => {
  it("reads a valid base64 payload with its declared type", () => {
    const parsed = parseDataUrl(`data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
    expect(parsed?.contentType).toBe("image/png");
    expect([...(parsed?.bytes ?? [])]).toEqual([...PNG]);
  });

  it("normalises the type it carries, alias included", () => {
    const parsed = parseDataUrl(`data:IMAGE/JPG;base64,${Buffer.from(JPEG).toString("base64")}`);
    expect(parsed?.contentType).toBe("image/jpeg");
  });

  it("refuses a payload that is not base64", () => {
    expect(parseDataUrl("data:image/png,%89PNG%0D%0A")).toBeNull();
    expect(parseDataUrl("data:image/png;base64,not base64!!")).toBeNull();
  });

  it("refuses a malformed data URL", () => {
    expect(parseDataUrl("data:")).toBeNull();
    expect(parseDataUrl("data:image/png;base64")).toBeNull();
    expect(parseDataUrl("https://example.com/a.png")).toBeNull();
    expect(parseDataUrl("data:image/png;base64,")).toBeNull();
  });
});

describe("extensionForContentType", () => {
  it("answers for every accepted type, and for the image/jpg alias", () => {
    expect(extensionForContentType("image/png")).toBe(".png");
    expect(extensionForContentType("image/jpeg")).toBe(".jpg");
    expect(extensionForContentType("image/jpg")).toBe(".jpg");
    expect(extensionForContentType("image/gif")).toBe(".gif");
    expect(extensionForContentType("image/webp")).toBe(".webp");
    expect(extensionForContentType("image/bmp")).toBe(".bmp");
    expect(extensionForContentType("image/avif")).toBe(".avif");
  });

  it("ignores parameters and case, as a real header carries both", () => {
    expect(extensionForContentType("IMAGE/PNG; charset=binary")).toBe(".png");
  });

  it("answers null for an unknown type", () => {
    expect(extensionForContentType("application/pdf")).toBeNull();
    expect(extensionForContentType("text/html")).toBeNull();
    expect(extensionForContentType(null)).toBeNull();
    expect(extensionForContentType("")).toBeNull();
  });

  it("refuses SVG on this path, deliberately, though the picker still allows one", () => {
    // `openWikiLink` hands a stored file to the OS default viewer, where script
    // inside an SVG runs. The user chose the picker's file; nobody chose what a pasted
    // page's server returns.
    expect(extensionForContentType("image/svg+xml")).toBeNull();
  });
});

describe("sniffImageType", () => {
  it("recognises the accepted formats from their magic bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(GIF)).toBe("image/gif");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(BMP)).toBe("image/bmp");
  });

  it("recognises AVIF from its brand, not from the front of the file", () => {
    // The first four bytes are a box length and carry no signature at all, so this is
    // the one format here that a prefix match cannot find.
    expect(sniffImageType(AVIF)).toBe("image/avif");
    expect(sniffImageType(AVIS)).toBe("image/avif");
    // Same container, different brand. An `.mp4` must not become an "image".
    expect(sniffImageType(ISOM)).toBeNull();
    expect(sniffImageType(AVIF.slice(0, 10))).toBeNull();
  });

  it("agrees with a declared image/avif, which is the half that makes the pair work", () => {
    // Adding either the type or the sniff on its own refuses every AVIF: `typesAgree`
    // needs both, and `fetch-attachment.ts` refuses on a disagreement.
    expect(typesAgree("image/avif", sniffImageType(AVIF))).toBe(true);
    expect(typesAgree("image/avif", sniffImageType(PNG))).toBe(false);
    expect(typesAgree("image/png", sniffImageType(AVIF))).toBe(false);
  });

  it("answers null for anything else, an SVG and a truncated file included", () => {
    expect(sniffImageType(new Uint8Array(Buffer.from("<svg xmlns=")))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it("disagrees loudly when the bytes are not what the server called them", () => {
    // A mismatch is a refusal in `fetch-attachment.ts`, never a quiet fall back to the
    // sniffed type: a server that says JPEG and sends PNG is broken or lying.
    expect(typesAgree("image/jpeg", sniffImageType(PNG))).toBe(false);
    expect(typesAgree("image/png", sniffImageType(PNG))).toBe(true);
    expect(typesAgree("image/jpg", sniffImageType(JPEG))).toBe(true);
    expect(typesAgree("image/png", null)).toBe(false);
    expect(typesAgree(null, "image/png")).toBe(false);
  });
});

describe("normaliseContentType", () => {
  it("strips parameters, lowercases, and resolves the jpg alias", () => {
    expect(normaliseContentType(" Image/JPG ; q=1 ")).toBe("image/jpeg");
    expect(normaliseContentType(undefined)).toBeNull();
  });
});

describe("originalNameForUrl", () => {
  it("takes the last path segment, without its query string", () => {
    expect(originalNameForUrl("https://x.example/logo.PNG?v=2")).toBe("logo");
    expect(originalNameForUrl("https://x.example/a/b/schema-diagram.jpeg")).toBe(
      "schema-diagram",
    );
  });

  it("strips the extension, so the sniffed one can never be contradicted", () => {
    // A URL ending `.png` whose bytes sniff as JPEG must not produce a `.png` file.
    expect(originalNameForUrl("https://x.example/photo.png")).toBe("photo");
  });

  it("slugifies a segment carrying Windows-illegal characters", () => {
    const name = originalNameForUrl("https://x.example/a%5Cb%3Ac%2Ad%3Fe%22f%3Cg%3Eh%7Ci.png");
    expect(name).toBe("a-b-c-d-e-f-g-h-i");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("falls back to `image` when there is nothing usable to name it after", () => {
    expect(originalNameForUrl("https://x.example/")).toBe("image");
    expect(originalNameForUrl("https://x.example/.png")).toBe("image");
    expect(originalNameForUrl("data:image/png;base64,iVBORw0KGgo=")).toBe("image");
    expect(originalNameForUrl("not a url at all")).toBe("image");
  });

  it("keeps the stem short enough to leave room for the timestamp prefix", () => {
    expect(originalNameForUrl(`https://x.example/${"a".repeat(200)}.png`).length).toBe(40);
  });
});

describe("isInlineImageUrl", () => {
  it("is data: and nothing else, whatever case it is spelled in", () => {
    expect(isInlineImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isInlineImageUrl("DATA:image/gif;base64,R0lGODdh")).toBe(true);
    expect(isInlineImageUrl("https://x.example/a.png")).toBe(false);
    expect(isInlineImageUrl("file:///etc/passwd")).toBe(false);
    expect(isInlineImageUrl("/images/a.png")).toBe(false);
    expect(isInlineImageUrl("")).toBe(false);
  });
});

describe("acceptedExtension, from the network", () => {
  it("takes bytes the server named correctly", () => {
    expect(acceptedExtension("image/png", PNG, "network")).toBe(".png");
    expect(acceptedExtension("image/jpg", JPEG, "network")).toBe(".jpg");
  });

  it("refuses bytes that are not what the server called them", () => {
    // A server that says PNG and sends a GIF is broken or lying, and this app is not
    // storing that in the vault under a name it invented.
    expect(acceptedExtension("image/png", GIF, "network")).toBeNull();
  });

  it("refuses a type that is not on the allowlist at all", () => {
    expect(acceptedExtension("text/html", PNG, "network")).toBeNull();
    expect(acceptedExtension(null, PNG, "network")).toBeNull();
  });
});

describe("acceptedExtension, from a data: URL", () => {
  it("reads the bytes and ignores the label the same string carries", () => {
    // The reported case, byte for byte: Word and Outlook write
    // `data:image/png;base64,R0lGODdh…` — a GIF87a with `Software: Microsoft Office` in
    // its comment block, labelled PNG. Under the network rule every one of those was
    // refused, so a note holding the whole picture drew a grey chip instead.
    expect(acceptedExtension("image/png", GIF, "inline")).toBe(".gif");
    expect(acceptedExtension("image/gif", PNG, "inline")).toBe(".png");
  });

  it("accepts one that names no type at all — the RFC's own default", () => {
    // `data:;base64,…` is `text/plain` by RFC and normalises to null here, which could
    // never pass a check that required a declared type.
    expect(acceptedExtension(null, JPEG, "inline")).toBe(".jpg");
    expect(acceptedExtension("text/plain", WEBP, "inline")).toBe(".webp");
  });

  it("still refuses anything the bytes do not prove is an image", () => {
    // Trusting the payload is not the same as trusting the label: an SVG has no magic
    // number, so it can never sniff as anything and passes no more than it did.
    const svg = new Uint8Array([...Buffer.from("<svg xmlns=")]);
    expect(acceptedExtension("image/svg+xml", svg, "inline")).toBeNull();
    expect(acceptedExtension("image/png", svg, "inline")).toBeNull();
    expect(acceptedExtension("image/png", new Uint8Array([...Buffer.from("<!DOCTYPE")]), "inline"))
      .toBeNull();
  });

  it("keeps the cap, which is the one rule the origin does not touch", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(PNG);
    expect(acceptedExtension("image/png", huge, "inline")).toBeNull();
    expect(acceptedExtension("image/png", huge, "network")).toBeNull();
  });
});
