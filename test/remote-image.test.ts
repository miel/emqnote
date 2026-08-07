import { describe, expect, it } from "vitest";
import {
  extensionForContentType,
  isFetchableUrl,
  isFollowableUrl,
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
    // `openAttachment` hands a stored file to the OS default viewer, where script
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
