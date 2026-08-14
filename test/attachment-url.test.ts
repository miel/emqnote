import { describe, expect, it } from "vitest";
import {
  attachmentNameFromUrl,
  attachmentUrl,
  thumbPageFromUrl,
  thumbSizeFromUrl,
} from "../src/shared/attachment-url.js";

/**
 * The two custom protocol URLs, both directions.
 *
 * The name lives in the URL's *path* rather than its host, and that is not a style
 * choice — Chromium canonicalises the host of a `standard: true` scheme, which was
 * measured against a real Electron build rather than reasoned about. Two facts came out
 * of it, and both are regressions this file pins:
 *
 * - `emq-a://Pasted%20image.png` reached the handler as `emq-a://pasted%20image.png/`.
 *   Every attachment the app itself writes is lower case already (`attachmentName`
 *   lowercases), so a vault of only app-written files never noticed; a vault written in
 *   Obsidian is full of names that are not.
 * - `emq-a://99%20-%20Attachments%2Ffoo.png` did not reach the handler at all — `fetch`
 *   threw "Failed to parse URL". A `%2F` is not a legal host, so a target naming a path
 *   could not be expressed at all, whatever `resolveAttachment` was willing to find.
 *
 * The same two cases through the path form both arrived verbatim, trailing slash and all
 * absent.
 */

describe("attachmentUrl", () => {
  it("puts the name in the path, behind a fixed host", () => {
    expect(attachmentUrl("emqnote-attachment", "foto.png")).toBe(
      "emqnote-attachment://vault/foto.png",
    );
  });

  it("keeps a path-form target in one segment, so Chromium cannot normalise it", () => {
    expect(attachmentUrl("emqnote-thumb", "99 - Attachments/offerte.pdf")).toBe(
      "emqnote-thumb://vault/99%20-%20Attachments%2Fofferte.pdf",
    );
  });

  it("round-trips every shape a real vault produces", () => {
    const names = [
      "foto.png",
      "Pasted image 20260526104144.png",
      "99 - Attachments/7337fdd5393e2f65959966ee448a92e8_MD5.png",
      "foto (2).png",
      "a/b/c.pdf",
      "naam met #hekje.png",
    ];

    for (const name of names) {
      expect(attachmentNameFromUrl(attachmentUrl("emqnote-attachment", name), "emqnote-attachment"))
        .toBe(name);
    }
  });
});

describe("attachmentNameFromUrl", () => {
  it("reads the name back out of the path form", () => {
    expect(
      attachmentNameFromUrl("emqnote-thumb://vault/mijn%20offerte.pdf", "emqnote-thumb"),
    ).toBe("mijn offerte.pdf");
  });

  it("keeps the case Chromium would have flattened in a host", () => {
    expect(
      attachmentNameFromUrl("emqnote-attachment://vault/Pasted%20image.PNG", "emqnote-attachment"),
    ).toBe("Pasted image.PNG");
  });

  /**
   * The host form is still read, for one reason: clipboard HTML copied inside the app
   * before this change carries it, and `paste-images.ts` parses exactly that string back
   * into a target. Nothing on disk ever holds one of these URLs.
   *
   * It also remains the regression B36 was: Chromium normalises `emqnote-thumb://offerte.pdf`
   * to `emqnote-thumb://offerte.pdf/`, `isPreviewable` read the extension as `.pdf/`, and
   * the thumbnail handler 404'd for every PDF on every platform.
   */
  it("still reads the old host form, with and without Chromium's trailing slash", () => {
    expect(attachmentNameFromUrl("emqnote-thumb://offerte.pdf/", "emqnote-thumb")).toBe(
      "offerte.pdf",
    );
    expect(attachmentNameFromUrl("emqnote-thumb://offerte.pdf", "emqnote-thumb")).toBe(
      "offerte.pdf",
    );
    expect(
      attachmentNameFromUrl("emqnote-attachment://2026-08-05-1030-foto.png/", "emqnote-attachment"),
    ).toBe("2026-08-05-1030-foto.png");
  });

  it("decodes percent-escapes, and does so after the slash is stripped", () => {
    expect(attachmentNameFromUrl("emqnote-thumb://mijn%20offerte.pdf/", "emqnote-thumb")).toBe(
      "mijn offerte.pdf",
    );

    // `%2F` is part of the name, not Chromium's punctuation: stripping after decoding
    // would eat it and change which file was asked for.
    expect(attachmentNameFromUrl("emqnote-thumb://a%2F", "emqnote-thumb")).toBe("a/");
    expect(attachmentNameFromUrl("emqnote-thumb://vault/a%2F", "emqnote-thumb")).toBe("a/");
  });
});

/**
 * B43's second render of the same file: `?size=page` asks the thumb handler for the first
 * page at the size a note column wants, where no query at all still means B36's chip.
 *
 * A query rather than another path segment, because the name is one opaque segment — which
 * is exactly why cutting the URL at the first `?` can never cut into a name.
 */
describe("the page-sized thumb URL", () => {
  it("adds the size only when one other than the chip is asked for", () => {
    expect(attachmentUrl("emqnote-thumb", "offerte.pdf")).toBe(
      "emqnote-thumb://vault/offerte.pdf",
    );
    expect(attachmentUrl("emqnote-thumb", "offerte.pdf", "chip")).toBe(
      "emqnote-thumb://vault/offerte.pdf",
    );
    expect(attachmentUrl("emqnote-thumb", "offerte.pdf", "page")).toBe(
      "emqnote-thumb://vault/offerte.pdf?size=page",
    );
  });

  it("reads the size back, and calls anything else the chip", () => {
    expect(thumbSizeFromUrl("emqnote-thumb://vault/offerte.pdf?size=page")).toBe("page");
    expect(thumbSizeFromUrl("emqnote-thumb://vault/offerte.pdf")).toBe("chip");
    expect(thumbSizeFromUrl("emqnote-thumb://vault/offerte.pdf?size=enormous")).toBe("chip");
    expect(thumbSizeFromUrl("emqnote-thumb://vault/offerte.pdf?")).toBe("chip");
  });

  it("never lets the query leak into the name", () => {
    expect(
      attachmentNameFromUrl("emqnote-thumb://vault/offerte.pdf?size=page", "emqnote-thumb"),
    ).toBe("offerte.pdf");
    // The old host form, which clipboard HTML written before B38 still carries.
    expect(attachmentNameFromUrl("emqnote-thumb://offerte.pdf?size=page", "emqnote-thumb")).toBe(
      "offerte.pdf",
    );
  });

  it("keeps a question mark that is part of the name, since that one is encoded", () => {
    const name = "waarom niet?.pdf";
    const url = attachmentUrl("emqnote-thumb", name, "page");

    expect(url).toBe("emqnote-thumb://vault/waarom%20niet%3F.pdf?size=page");
    expect(attachmentNameFromUrl(url, "emqnote-thumb")).toBe(name);
    expect(thumbSizeFromUrl(url)).toBe("page");
  });

  it("round-trips a path-form name with a size on it", () => {
    const name = "99 - Attachments/offerte.pdf";
    const url = attachmentUrl("emqnote-thumb", name, "page");

    expect(attachmentNameFromUrl(url, "emqnote-thumb")).toBe(name);
    expect(thumbSizeFromUrl(url)).toBe("page");
  });
});

/**
 * Which page of the document, now that the inline embed turns them. A render parameter in
 * exactly the way the size already was — same file, same guard, same 404/422 split, one
 * more number for pdf.js.
 */
describe("the page number on a thumb URL", () => {
  it("leaves page 1 unspelled, so its URL and its cache key are what they always were", () => {
    expect(attachmentUrl("emqnote-thumb", "offerte.pdf", "page", 1)).toBe(
      "emqnote-thumb://vault/offerte.pdf?size=page",
    );
    expect(attachmentUrl("emqnote-thumb", "offerte.pdf", "page")).toBe(
      "emqnote-thumb://vault/offerte.pdf?size=page",
    );
  });

  it("adds it from page 2 on, after the size", () => {
    expect(attachmentUrl("emqnote-thumb", "offerte.pdf", "page", 7)).toBe(
      "emqnote-thumb://vault/offerte.pdf?size=page&page=7",
    );
  });

  it("never puts a page on a chip, which has only ever had one render", () => {
    expect(attachmentUrl("emqnote-thumb", "offerte.pdf", "chip", 4)).toBe(
      "emqnote-thumb://vault/offerte.pdf",
    );
  });

  it("reads it back, and calls anything unusable page 1", () => {
    expect(thumbPageFromUrl("emqnote-thumb://vault/offerte.pdf?size=page&page=7")).toBe(7);
    expect(thumbPageFromUrl("emqnote-thumb://vault/offerte.pdf?size=page")).toBe(1);
    expect(thumbPageFromUrl("emqnote-thumb://vault/offerte.pdf")).toBe(1);

    // Off a URL, so it is served rather than policed: nonsense reads as the first page.
    for (const query of ["page=0", "page=-3", "page=1.5", "page=twee", "page="]) {
      expect(thumbPageFromUrl(`emqnote-thumb://vault/offerte.pdf?size=page&${query}`)).toBe(1);
    }
  });

  it("keeps the name out of it, however the two are spelled", () => {
    const name = "99 - Attachments/waarom niet?.pdf";
    const url = attachmentUrl("emqnote-thumb", name, "page", 3);

    expect(attachmentNameFromUrl(url, "emqnote-thumb")).toBe(name);
    expect(thumbSizeFromUrl(url)).toBe("page");
    expect(thumbPageFromUrl(url)).toBe(3);
  });
});
